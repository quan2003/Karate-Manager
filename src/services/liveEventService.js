import {
  updateMatchResult as applyMatchResultToBracket,
  disqualifyAthlete,
} from "../utils/drawEngine.js";
import { updateAuxiliaryMatchResult } from "../domain/bronzeIntegration.js";

const LIVE_TIMEOUT_MS = 3000;

const COMPLETED_STATUSES = new Set([
  "finished", "completed", "closed", "done", "complete",
  "da thi dau xong", "hoan thanh", "da xong",
]);
const CANCELLED_STATUSES = new Set([
  "cancelled", "canceled", "invalid", "error", "huy", "da huy",
]);

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

function participantName(participant) {
  return String(participant?.name || participant?.club || participant?.unit || "").trim();
}

function getCategoryMatches(category) {
  return category?.bracket
    ? [...(category.bracket.matches || []), ...(category.bracket.auxiliaryMatches || [])]
    : category?.matches || [];
}

function getResolvedCategoryMatches(category, matchResults = []) {
  if (!category?.bracket?.matches) return getCategoryMatches(category);
  let bracket = JSON.parse(JSON.stringify(category.bracket));
  const resultById = new Map(matchResults.map((result) => [result.matchId, result]));
  const applicableResults = bracket.matches
    .map((match) => ({ match, result: resultById.get(match.id) }))
    .filter(({ result }) => result)
    .sort((left, right) => matchSort(left.match, right.match));

  applicableResults.forEach(({ match, result }) => {
    if (result.disqualification && result.disqualifiedSlot) {
      bracket = disqualifyAthlete(
        bracket,
        match.id,
        result.disqualifiedSlot,
        result.disqualifiedReason || "Loại"
      );
    } else if (result.winnerId) {
      bracket = applyMatchResultToBracket(
        bracket,
        match.id,
        result.score1,
        result.score2,
        result.winnerId
      );
    }
  });
  (bracket.auxiliaryMatches || [])
    .map((match) => ({ match, result: resultById.get(match.id) }))
    .filter(({ result }) => result?.winnerId)
    .sort((left, right) => Number(left.match.sequence) - Number(right.match.sequence))
    .forEach(({ match, result }) => {
      const updated = updateAuxiliaryMatchResult({
        bracket,
        matchId: match.id,
        winnerId: result.winnerId,
        score1: result.score1,
        score2: result.score2,
      });
      if (updated.ok) bracket = updated.bracketCopy;
    });
  return [...bracket.matches, ...(bracket.auxiliaryMatches || [])];
}

function getResultMap(matchResults = []) {
  return new Map(matchResults.map((result) => [result.matchId, result]));
}

function isResultCompleted(result) {
  return Boolean(result && (
    result.winnerId || result.winner || result.disqualification ||
    COMPLETED_STATUSES.has(normalizeStatus(result.status))
  ));
}

function isMatchCancelled(match) {
  return CANCELLED_STATUSES.has(normalizeStatus(match?.status));
}

function isMatchCompleted(match, resultMap) {
  if (match?.isBye) return true;
  if (COMPLETED_STATUSES.has(normalizeStatus(match?.status))) return true;
  return Boolean(match?.winner || isResultCompleted(resultMap.get(match?.id)));
}

export function getCategoryMatId(matchData, category) {
  const scheduleInfo = matchData?.schedule?.[category?.id] || {};
  return String(
    scheduleInfo.mat ?? category?.matId ?? category?.matNumber ?? category?.tatamiId ?? 1
  );
}

export function getConfiguredMats(matchData) {
  if (!matchData) return [];

  const declaredMats = Array.isArray(matchData.mats)
    ? matchData.mats
        .map((mat, index) => ({
          id: String(mat?.id ?? mat?.number ?? index + 1),
          name: mat?.name || `Thảm ${mat?.number ?? mat?.id ?? index + 1}`,
        }))
        .filter((mat) => mat.id)
    : [];
  const configuredCount = Number(matchData.scheduleConfig?.matCount);
  const configuredMats = Number.isInteger(configuredCount) && configuredCount > 0
    ? Array.from({ length: configuredCount }, (_, index) => ({
        id: String(index + 1),
        name: `Thảm ${index + 1}`,
      }))
    : [];
  const scheduledIds = Object.values(matchData.schedule || {})
    .map((item) => item?.mat)
    .filter((mat) => mat !== undefined && mat !== null && String(mat).trim() !== "")
    .map((mat) => String(mat));
  const categoryIds = (matchData.categories || []).map((category) =>
    getCategoryMatId(matchData, category)
  );

  const byId = new Map();
  [...declaredMats, ...configuredMats].forEach((mat) => byId.set(mat.id, mat));
  [...scheduledIds, ...categoryIds].forEach((id) => {
    if (!byId.has(id)) byId.set(id, { id, name: `Thảm ${id}` });
  });
  if (byId.size === 0) byId.set("1", { id: "1", name: "Thảm 1" });

  return Array.from(byId.values()).sort((left, right) =>
    left.id.localeCompare(right.id, "vi", { numeric: true })
  );
}

export function isCategoryCompleted(category, matchResults = []) {
  if (COMPLETED_STATUSES.has(normalizeStatus(category?.status))) return true;
  const matches = getCategoryMatches(category).filter(
    (match) => !match.isBye && !isMatchCancelled(match)
  );
  if (matches.length === 0) return false;
  const resultMap = getResultMap(matchResults);
  return matches.every((match) => isMatchCompleted(match, resultMap));
}

function categoryScheduleSort(matchData, left, right) {
  const a = matchData.schedule?.[left.id] || {};
  const b = matchData.schedule?.[right.id] || {};
  return String(a.date || "").localeCompare(String(b.date || "")) ||
    String(a.time || "").localeCompare(String(b.time || "")) ||
    Number(a.order || 0) - Number(b.order || 0) ||
    matchData.categories.indexOf(left) - matchData.categories.indexOf(right);
}

function matchSort(left, right) {
  return Number(left.round || 0) - Number(right.round || 0) ||
    Number(left.position ?? left.matchNumber ?? 0) -
      Number(right.position ?? right.matchNumber ?? 0);
}

function makeQueueEntry(category, match, scheduleInfo) {
  const athleteA = participantName(match?.athlete1);
  const athleteB = participantName(match?.athlete2);
  return {
    id: category.id,
    name: category.name,
    type: category.type || "kumite",
    scheduledTime: scheduleInfo?.time || null,
    matchId: match?.id || null,
    matchCode: match?.matchCode || match?.matchNumber || null,
    athleteA: athleteA || null,
    athleteB: athleteB || null,
    participantText: athleteA && athleteB
      ? `${athleteA} vs ${athleteB}`
      : athleteA || athleteB
      ? `Đang thi: ${athleteA || athleteB}`
      : null,
  };
}

function getLanBaseUrl(adminIp, defaultPort = 3000) {
  const value = String(adminIp || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!value) return "";
  return `http://${value.includes(":") ? value : `${value}:${defaultPort}`}`;
}

function requestWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

export function getCategoryLiveQueue(matchData, currentCategory, options = {}) {
  if (!matchData?.categories?.length || !currentCategory) return null;

  const schedule = matchData.schedule || {};
  const currentSchedule = schedule[currentCategory.id] || {};
  const requestedMatId = options.selectedMatId && options.selectedMatId !== "all"
    ? String(options.selectedMatId)
    : getCategoryMatId(matchData, currentCategory);
  const matId = requestedMatId;
  const resultMap = getResultMap(options.matchResults || []);
  const scheduledOnMat = matchData.categories
    .filter((category) => getCategoryMatId(matchData, category) === matId)
    .sort((left, right) => categoryScheduleSort(matchData, left, right));
  const pendingEntries = scheduledOnMat.flatMap((category) =>
    getResolvedCategoryMatches(category, options.matchResults || [])
      .filter((match) =>
        !match.isBye &&
        !isMatchCancelled(match) &&
        !isMatchCompleted(match, resultMap) &&
        (category.type === "kata"
          ? Boolean(match.athlete1 || match.athlete2)
          : Boolean(match.athlete1 && match.athlete2))
      )
      .sort(matchSort)
      .map((match) => ({ category, match }))
  );

  const requestedMatchId = options.currentMatchId || options.currentMatch?.id;
  let currentIndex = requestedMatchId
    ? pendingEntries.findIndex((entry) => entry.match.id === requestedMatchId)
    : -1;
  if (currentIndex < 0) {
    currentIndex = pendingEntries.findIndex(
      (entry) => entry.category.id === currentCategory.id
    );
  }
  if (currentIndex < 0 && pendingEntries.length > 0) currentIndex = 0;

  const currentEntry = currentIndex >= 0 ? pendingEntries[currentIndex] : null;
  const nextEntry = currentIndex >= 0 ? pendingEntries[currentIndex + 1] || null : null;
  const matCompleted = scheduledOnMat.length > 0 && scheduledOnMat.every(
    (category) => isCategoryCompleted(category, options.matchResults || [])
  );
  const current = currentEntry
    ? makeQueueEntry(
        currentEntry.category,
        currentEntry.match,
        schedule[currentEntry.category.id]
      )
    : matCompleted
    ? {
        ...makeQueueEntry(currentCategory, null, currentSchedule),
        name: "Đã hoàn tất lịch thi đấu của thảm này",
        status: "completed",
      }
    : makeQueueEntry(currentCategory, options.currentMatch, currentSchedule);
  const next = nextEntry
    ? makeQueueEntry(nextEntry.category, nextEntry.match, schedule[nextEntry.category.id])
    : null;
  const waitingMatches = currentIndex >= 0
    ? pendingEntries.slice(currentIndex + 2).map((entry) => makeQueueEntry(entry.category, entry.match, schedule[entry.category.id]))
    : [];

  return {
    matId,
    current,
    next,
    waitingMatches,
  };
}

export async function publishLiveStatus(adminIp, matchData, currentCategory, extra = {}) {
  const queue = getCategoryLiveQueue(matchData, currentCategory, extra);
  const baseUrl = getLanBaseUrl(adminIp);
  if (!baseUrl || !queue || !matchData?.tournamentId) {
    return { success: false, message: "Thiếu IP máy Admin hoặc dữ liệu nội dung" };
  }

  try {
    const response = await requestWithTimeout(`${baseUrl}/api/live-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: matchData.tournamentId,
        tournamentName: matchData.tournamentName || "",
        sourceId: matchData.exportId || "secretary",
        matId: queue.matId,
        current: queue.current,
        next: queue.next,
        waitingMatches: queue.waitingMatches,
        matchCode: queue.current?.matchCode || extra.matchCode || null,
        roundName: extra.roundName || null,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Máy Admin trả về ${response.status}`);
    return { success: true, matId: queue.matId, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: error.name === "AbortError" ? "timeout" : "connection_error",
      message: error.name === "AbortError" ? "Máy Admin không phản hồi" : error.message,
    };
  }
}
