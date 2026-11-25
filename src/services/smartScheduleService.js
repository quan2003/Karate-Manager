import { KSPORT_CLOUD_API_URL, getCloudAuthHeaders } from "./cloudSyncService.js";
import {
  convertTimeToMins,
  estimateCategoryDuration,
  getCategoryAgeGroupInfo,
  getCategoryCustomPlanGroupKey,
  getCategoryMatchDuration,
  getEstimatedMatchCount,
  getEstimatedParticipantCount,
  parseKarateCategory,
  sortCategoriesByKarateStandard,
} from "./scheduleService.js";

function getAgeRank(parsed) {
  if (Number.isFinite(parsed.ageMin)) return parsed.ageMin;
  return 999;
}

/**
 * Duration Calculator: calculates remaining matches & real duration from bracket structure,
 * excluding BYE matches, suspended auxiliary matches, and already-completed matches.
 */
export function calculateRemainingCategoryMetrics(category, durations) {
  const participants = getEstimatedParticipantCount(category);
  if (participants === 0) return { matchCount: 0, duration: 0 };

  const bracketMatches = category.bracket?.matches;
  const matchDur = getCategoryMatchDuration(category, durations);

  if (!category.isSplit && Array.isArray(bracketMatches) && bracketMatches.length > 0) {
    const remainingMain = bracketMatches.filter(
      (m) => !m.isBye && !m.winner && m.status !== "completed" && m.completed !== true
    ).length;
    const remainingAux = (category.bracket?.auxiliaryMatches || []).filter(
      (m) =>
        m.operationalStatus !== "SUSPENDED_SOURCE_INCOMPLETE" &&
        !m.winner &&
        m.status !== "completed" &&
        m.completed !== true
    ).length;
    const matchCount = remainingMain + remainingAux;
    if (matchCount === 0) return { matchCount: 0, duration: 0 };
    return {
      matchCount,
      duration: Math.max(5, Math.ceil(matchCount * matchDur)),
    };
  }

  const estMatches = getEstimatedMatchCount(category);
  if (estMatches <= 0) return { matchCount: 0, duration: 0 };
  return {
    matchCount: estMatches,
    duration: Math.max(5, estimateCategoryDuration(category, durations)),
  };
}

/**
 * Conflict Analyzer: extracts unique Athlete IDs (plus teamMembers IDs) so athlete conflict
 * checks are ID-based rather than name-only.
 */
export function extractAthleteKeys(category) {
  const keys = new Set();
  for (const a of category.athletes || []) {
    if (!a) continue;
    if (a.profileId || a.athleteId || a.id) {
      keys.add(String(a.profileId || a.athleteId || a.id).trim().toLowerCase());
    } else if (a.name) {
      keys.add(`name:${String(a.name).trim().toLowerCase()}::${String(a.club || "").trim().toLowerCase()}`);
    }
    if (Array.isArray(a.teamMembers || a.members)) {
      for (const m of a.teamMembers || a.members) {
        if (m?.profileId || m?.athleteId || m?.id) {
          keys.add(String(m.profileId || m.athleteId || m.id).trim().toLowerCase());
        } else if (m?.name) {
          keys.add(`name:${String(m.name).trim().toLowerCase()}::${String(m.club || a.club || "").trim().toLowerCase()}`);
        }
      }
    }
  }
  return Array.from(keys);
}

/**
 * 5-Level Per-Mat Personalization Rules:
 *   "required" (Bắt buộc tại thảm này)
 *   "preferred" (Ưu tiên tại thảm này)
 *   "allowed" (Cho phép rõ ràng tại thảm này)
 *   "forbidden" (Không được phép tại thảm này)
 *   "auto" (Tự động)
 */
export function resolveMatConstraints({
  cat,
  parsed,
  ageInfo,
  matCount,
  perMatRules,
  scheduleConfig,
  tournamentDays,
}) {
  const allMats = Array.from({ length: matCount }, (_, idx) => idx + 1);
  const isAbsolute =
    String(cat.name || "").toLowerCase().includes("tuyệt đối") ||
    String(cat.ageGroup || "").toLowerCase().includes("tuyệt đối");

  const isMixedGender = parsed.gender !== "male" && parsed.gender !== "female";
  const ruleTagsForCategory = [
    parsed.discipline, // "kata" | "kumite"
    isMixedGender ? null : parsed.gender,
    parsed.eventType === "team" ? "team" : "individual",
    `age:${ageInfo.key}`,
    isAbsolute ? "absolute" : null,
  ].filter(Boolean);

  if (perMatRules && Object.keys(perMatRules).length > 0) {
    const getTagDimension = (tag) => {
      if (tag === "kata" || tag === "kumite") return "discipline";
      if (tag === "male" || tag === "female") return "gender";
      if (tag === "individual" || tag === "team") return "eventType";
      if (tag === "absolute") return "absolute";
      if (tag.startsWith("age:")) return "age";
      return tag;
    };

    const allowedMats = [];
    const preferredMats = [];
    const catTagSet = new Set(ruleTagsForCategory);

    for (const m of allMats) {
      const mRules = perMatRules[m] || {};
      let hasForbidden = false;
      let hasPreferredOrRequiredMatch = false;

      // Group mat's required tags by dimension (e.g., Mat 3: kumite=required => Mat 3 only accepts kumite,
      // without banning kumite from Mat 1 & Mat 2 which are in "auto" mode).
      const requiredByDim = {};
      for (const [tag, mode] of Object.entries(mRules)) {
        if (mode === "forbidden" && catTagSet.has(tag)) {
          hasForbidden = true;
          break;
        }
        if (mode === "required") {
          const dim = getTagDimension(tag);
          if (!requiredByDim[dim]) requiredByDim[dim] = [];
          requiredByDim[dim].push(tag);
          if (catTagSet.has(tag)) hasPreferredOrRequiredMatch = true;
        }
        if (mode === "preferred" && catTagSet.has(tag)) {
          hasPreferredOrRequiredMatch = true;
        }
      }

      if (hasForbidden) continue;

      let matchesAllRequiredDims = true;
      for (const [dim, reqTags] of Object.entries(requiredByDim)) {
        // Mixed-gender ("Hỗn hợp Nam, Nữ") categories are allowed on gender-dedicated mats
        if (dim === "gender" && isMixedGender) continue;
        if (!reqTags.some((t) => catTagSet.has(t))) {
          matchesAllRequiredDims = false;
          break;
        }
      }
      if (!matchesAllRequiredDims) continue;

      allowedMats.push(m);
      if (hasPreferredOrRequiredMatch) preferredMats.push(m);
    }

    return { allowedMats, preferredMats };
  }

  // Fallback: inherit tournament.scheduleConfig.customMatPlan if present
  if (scheduleConfig?.priorityMode === "custom_mat_plan" && scheduleConfig.customMatPlan) {
    const planKey = getCategoryCustomPlanGroupKey(cat);
    const plannedMats = new Set();
    for (const day of tournamentDays) {
      const dayPlan = scheduleConfig.customMatPlan[day] || {};
      for (const sessionKey of ["morning", "afternoon"]) {
        const sessionPlan = dayPlan[sessionKey] || {};
        for (const [matStr, keys] of Object.entries(sessionPlan)) {
          if (Array.isArray(keys) && keys.includes(planKey)) {
            const matNum = Number(matStr);
            if (matNum >= 1 && matNum <= matCount) plannedMats.add(matNum);
          }
        }
      }
    }
    if (plannedMats.size > 0) {
      return { allowedMats: Array.from(plannedMats).sort((a, b) => a - b), preferredMats: [] };
    }
  }

  return { allowedMats: allMats, preferredMats: [] };
}

/**
 * Pre-flight Contradiction Detector: catches conflicting Mat rules before calling solver.
 */
export function validateSmartScheduleConfig({
  categories = [],
  matCount = 4,
  perMatRules = {},
  durations = {},
  scheduleConfig = {},
  tournamentDays = [],
}) {
  const errors = [];
  for (const cat of categories) {
    if (getEstimatedParticipantCount(cat) === 0) continue;
    const { matchCount } = calculateRemainingCategoryMetrics(cat, durations);
    if (matchCount === 0) continue;

    const parsed = parseKarateCategory(cat);
    const ageInfo = getCategoryAgeGroupInfo(cat);
    const { allowedMats } = resolveMatConstraints({
      cat,
      parsed,
      ageInfo,
      matCount,
      perMatRules,
      scheduleConfig,
      tournamentDays,
    });
    if (allowedMats.length === 0) {
      errors.push(`Nội dung "${cat.name}" không còn thảm nào hợp lệ do bị cấm ở tất cả các thảm.`);
    }
  }
  return { valid: errors.length === 0, errors: errors.slice(0, 10) };
}

/**
 * Compute intra-age rank per spec Section 5.2:
 *   Kumite Ind Nam (0) -> Kumite Ind Nữ (1) -> Kumite Team Nam (2) -> Kumite Team Nữ (3)
 */
function getIntraAgeRank(parsed) {
  const isTeam = parsed.eventType === "team";
  if (!isTeam && parsed.gender === "male") return 0;
  if (!isTeam && parsed.gender === "female") return 1;
  if (!isTeam) return 2;
  if (isTeam && parsed.gender === "male") return 3;
  if (isTeam && parsed.gender === "female") return 4;
  return 5;
}

/**
 * Compute Sigma Page numbers per mat order (excluding Opening/Lunch/Closing events) - Section 15.
 * Supports multi-page Sigma brackets (sigmaCount > 1 or sigmaSplitEnabled with > 32 athletes).
 */
export function getCategorySigmaPageCount(category) {
  if (!category) return 1;
  if (category.sigmaCount && Number(category.sigmaCount) > 1) return Number(category.sigmaCount);
  if (category.sigmaSplitEnabled === true) {
    const count = getEstimatedParticipantCount(category);
    return Math.max(1, Math.ceil(count / 32));
  }
  return 1;
}

export function computeSigmaPageMap(schedule, categories) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const items = Object.entries(schedule || {})
    .filter(([catId, s]) => catMap.has(catId) && s?.mat && s?.time)
    .map(([catId, s]) => ({
      catId,
      mat: Number(s.mat),
      date: s.date || "",
      time: s.time || "",
      pageCount: getCategorySigmaPageCount(catMap.get(catId)),
    }))
    .sort(
      (a, b) =>
        a.mat - b.mat ||
        a.date.localeCompare(b.date) ||
        convertTimeToMins(a.time) - convertTimeToMins(b.time)
    );

  const pageMap = {};
  let currentPage = 1;
  for (const item of items) {
    pageMap[item.catId] = item.pageCount > 1
      ? `${currentPage}-${currentPage + item.pageCount - 1}`
      : currentPage;
    currentPage += item.pageCount;
  }
  return pageMap;
}

/**
 * Lightweight fingerprint to detect if tournament data changed while solver was running (Section 6).
 */
export function computeTournamentFingerprint({ categories = [], customEvents = [], matCount = 4, sessionConfig = {} }) {
  const catSig = categories
    .map((c) => `${c.id}:${getEstimatedParticipantCount(c)}:${c.bracket?.matches?.length || 0}`)
    .join("|");
  const evtSig = (customEvents || []).map((e) => `${e.name}:${e.date}:${e.time}:${e.duration}:${e.mat}`).join("|");
  return `${matCount}:${sessionConfig?.morningStart}:${sessionConfig?.afternoonEnd}:${catSig}::${evtSig}`;
}

/**
 * Gọi Smart Schedule Pro Solver (Greedy -> CP-SAT -> Validator) trên VPS api.k-sport.net
 */
export async function solveSmartSchedule({
  categories = [],
  existingSchedule = {},
  tournamentDays = [],
  matCount = 4,
  sessionConfig = {},
  customEvents = [],
  scheduleConfig = {},
  durations = {},
  minRestMinutes = 20,
  transitionMinutes = 0,
  keepPinned = true,
  karateOrderMode = "kata_then_kumite", // "kata_then_kumite" | "age_young_first" | "age_old_first"
  kataMode = "per_mat_kata_first", // "global_kata_first" | "per_mat_kata_first" | "flexible"
  intraAgeMode = "preferred", // "required" | "preferred" | "none"
  strictTargetEndTime = false,
  perMatRules = null,
  skipEmptyCategories = true,
  multiPlan = true,
  selectedStrategies = null,
  daySessionConfigs = null,
  matOperatingWindows = null,
  categoryDurationOverrides = null,
  categoryDaySessionRules = null,
  absoluteLast = "preferred",
  requireCpSat = false,
  previewOnly = false,
  maxTimeSeconds = 30,
  signal,
}) {
  const headers = await getCloudAuthHeaders();

  const activeCategories = [];
  for (const cat of categories) {
    const participants = getEstimatedParticipantCount(cat);
    if (skipEmptyCategories && participants === 0) continue;
    const { matchCount, duration } = calculateRemainingCategoryMetrics(cat, durations);
    if (skipEmptyCategories && matchCount === 0) continue;
    const overrideDur = categoryDurationOverrides?.[cat.id];
    const finalDur = Number(overrideDur) > 0 ? Math.max(5, Number(overrideDur)) : Math.max(5, duration);
    activeCategories.push({ ...cat, _matchCount: matchCount, _duration: finalDur });
  }

  const standardSorted = sortCategoriesByKarateStandard(activeCategories);
  const parsedMap = new Map(standardSorted.map((cat) => [cat.id, parseKarateCategory(cat)]));
  const ageInfoMap = new Map(standardSorted.map((cat) => [cat.id, getCategoryAgeGroupInfo(cat)]));

  const ageBuckets = Array.from(
    new Set(standardSorted.map((cat) => getAgeRank(parsedMap.get(cat.id))))
  ).sort((a, b) => a - b);
  const ageIndexMap = new Map(ageBuckets.map((val, idx) => [val, idx]));

  const ordered = [...standardSorted].sort((a, b) => {
    const pa = parsedMap.get(a.id);
    const pb = parsedMap.get(b.id);
    const ageA = ageIndexMap.get(getAgeRank(pa)) ?? 99;
    const ageB = ageIndexMap.get(getAgeRank(pb)) ?? 99;

    if (karateOrderMode === "age_young_first") {
      if (ageA !== ageB) return ageA - ageB;
      return pa.priority - pb.priority;
    }
    if (karateOrderMode === "age_old_first") {
      if (ageA !== ageB) return ageB - ageA;
      return pa.priority - pb.priority;
    }
    const discA = pa.discipline === "kata" ? 0 : 1;
    const discB = pb.discipline === "kata" ? 0 : 1;
    if (discA !== discB) return discA - discB;
    if (ageA !== ageB) return ageA - ageB;
    return getIntraAgeRank(pa) - getIntraAgeRank(pb) || pa.priority - pb.priority;
  });

  const payloadCategories = ordered.map((cat, index) => {
    const parsed = parsedMap.get(cat.id);
    const ageInfo = ageInfoMap.get(cat.id);
    const ageIdx = ageIndexMap.get(getAgeRank(parsed)) ?? 99;
    const existing = existingSchedule[cat.id];
    const pinned =
      keepPinned && existing && existing.pinned && existing.date && existing.mat && existing.time
        ? {
            date: existing.date,
            mat: Number(existing.mat),
            startTime: existing.time,
          }
        : null;

    const isAbsolute =
      String(cat.name || "").toLowerCase().includes("tuyệt đối") ||
      String(cat.ageGroup || "").toLowerCase().includes("tuyệt đối");
    const absOffset = absoluteLast === "preferred" && isAbsolute ? 100 : 0;

    let phaseGroup = 0;
    let ageOrder = ageIdx;
    if (karateOrderMode === "kata_then_kumite") {
      phaseGroup = (parsed.discipline === "kata" ? 0 : 1) + absOffset;
    } else if (karateOrderMode === "age_young_first") {
      phaseGroup = ageIdx + absOffset;
      ageOrder = parsed.discipline === "kata" ? 0 : 1;
    } else if (karateOrderMode === "age_old_first") {
      phaseGroup = Math.max(0, ageBuckets.length - 1 - ageIdx) + absOffset;
      ageOrder = parsed.discipline === "kata" ? 0 : 1;
    }

    const daySessionRule = categoryDaySessionRules?.[cat.id] || null;
    const allowedDays = Array.isArray(daySessionRule?.allowedDays) && daySessionRule.allowedDays.length > 0
      ? daySessionRule.allowedDays
      : null;
    const allowedSessions = Array.isArray(daySessionRule?.allowedSessions) && daySessionRule.allowedSessions.length > 0
      ? daySessionRule.allowedSessions
      : null;

    const { allowedMats, preferredMats } = resolveMatConstraints({
      cat,
      parsed,
      ageInfo,
      matCount: Math.max(1, Number(matCount) || 4),
      perMatRules,
      scheduleConfig,
      tournamentDays,
    });

    return {
      id: cat.id,
      name: cat.name,
      discipline: parsed.discipline,
      gender: parsed.gender,
      eventType: parsed.eventType,
      matchCount: cat._matchCount,
      duration: cat._duration,
      athletes: extractAthleteKeys(cat),
      phaseGroup,
      ageOrder,
      intraAgeRank: getIntraAgeRank(parsed),
      priorityRank: index,
      allowedMats,
      preferredMats,
      allowedDays,
      allowedSessions,
      pinned,
    };
  });

  const manualSchedulePayload = {};
  for (const cat of ordered) {
    const slot = existingSchedule[cat.id];
    if (slot?.date && slot?.mat && slot?.time) {
      manualSchedulePayload[cat.id] = {
        date: slot.date,
        mat: Number(slot.mat),
        time: slot.time,
        pinned: Boolean(slot.pinned),
      };
    }
  }

  const response = await fetch(`${KSPORT_CLOUD_API_URL}/api/smart-schedule/solve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    signal,
    body: JSON.stringify({
      categories: payloadCategories,
      tournamentDays,
      matCount,
      sessionConfig,
      customEvents: (customEvents || []).map((e) => ({
        name: e.name || "Sự kiện cố định",
        date: e.date || "",
        time: e.time || "09:30",
        duration: Number(e.duration) || 30,
        mat: Number(e.mat) || 0,
      })),
      manualSchedule: Object.keys(manualSchedulePayload).length > 0 ? manualSchedulePayload : null,
      minRestMinutes,
      transitionMinutes,
      kataMode,
      intraAgeMode,
      strictTargetEndTime: Boolean(strictTargetEndTime),
      daySessionConfigs: daySessionConfigs || null,
      matOperatingWindows: matOperatingWindows || null,
      selectedStrategies: Array.isArray(selectedStrategies) && selectedStrategies.length > 0 ? selectedStrategies : null,
      multiPlan,
      requireCpSat,
      previewOnly,
      maxTimeSeconds,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok && !data?.requiresUpgrade) {
    throw new Error(data?.message || `Không thể kết nối máy chủ xếp lịch K-SPORT (HTTP ${response.status}).`);
  }
  return data;
}

/**
 * Independent Client-Side Schedule Validator for post-manual-edit checks (Section 13).
 */
export function validateScheduleLocally({
  schedule = {},
  categories = [],
  customEvents = [],
  durations = {},
  minRestMinutes = 15,
}) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const items = [];
  for (const [catId, s] of Object.entries(schedule)) {
    const cat = catMap.get(catId);
    if (!cat || !s?.mat || !s?.time) continue;
    const { duration } = calculateRemainingCategoryMetrics(cat, durations);
    const dur = Math.max(5, Number(s.duration) || duration || 15);
    const startMin = convertTimeToMins(s.time);
    items.push({
      catId,
      cat,
      mat: Number(s.mat),
      date: s.date || "",
      startMin,
      endMin: startMin + dur,
      athletes: extractAthleteKeys(cat),
    });
  }

  const issues = [];
  // Check Opening / Lunch / Locked events
  for (const item of items) {
    for (const evt of customEvents || []) {
      const evtMat = Number(evt.mat) || 0;
      if (evtMat !== 0 && evtMat !== item.mat) continue;
      if (evt.date && item.date && evt.date !== item.date) continue;
      const es = convertTimeToMins(evt.time || "09:30");
      const ee = es + (Number(evt.duration) || 30);
      if (!(item.endMin <= es || item.startMin >= ee)) {
        issues.push(`"${item.cat.name}" chồng lấn sự kiện "${evt.name}" (${evt.time}).`);
      }
    }
  }

  // Check Mat overlaps & Athlete ID overlaps
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.date !== b.date) continue;
      if (a.mat === b.mat && !(a.endMin <= b.startMin || b.endMin <= a.startMin)) {
        issues.push(`Thảm ${a.mat}: "${a.cat.name}" trùng giờ "${b.cat.name}".`);
      }
      if (a.athletes.length && b.athletes.length) {
        const setB = new Set(b.athletes);
        const shared = a.athletes.some((id) => setB.has(id));
        if (shared) {
          if (!(a.endMin <= b.startMin || b.endMin <= a.startMin)) {
            issues.push(`Trùng VĐV: "${a.cat.name}" và "${b.cat.name}".`);
          } else if (minRestMinutes > 0 && !(a.endMin + minRestMinutes <= b.startMin || b.endMin + minRestMinutes <= a.startMin)) {
            issues.push(`Thiếu giờ nghỉ (<${minRestMinutes}p): "${a.cat.name}" & "${b.cat.name}".`);
          }
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Build an anonymized Benchmark JSON payload for offline optimization & quality testing.
 * Contains no athlete names, club names, or license/auth PII when anonymize=true.
 */
export function buildBenchmarkExportPayload({
  categories = [],
  existingSchedule = {},
  tournamentDays = [],
  matCount = 4,
  sessionConfig = {},
  customEvents = [],
  scheduleConfig = {},
  durations = {},
  minRestMinutes = 20,
  transitionMinutes = 0,
  karateOrderMode = "kata_then_kumite",
  kataMode = "per_mat_kata_first",
  intraAgeMode = "preferred",
  strictTargetEndTime = false,
  perMatRules = null,
  skipEmptyCategories = true,
  keepPinned = true,
  anonymize = true,
}) {
  const athAliasMap = new Map();
  const getAthId = (raw) => {
    const key = String(raw || "").trim();
    if (!key) return null;
    if (!anonymize) return key;
    if (!athAliasMap.has(key)) {
      athAliasMap.set(key, `ATH_${String(athAliasMap.size + 1).padStart(4, "0")}`);
    }
    return athAliasMap.get(key);
  };

  const activeCategories = [];
  for (const cat of categories) {
    const participants = getEstimatedParticipantCount(cat);
    if (skipEmptyCategories && participants === 0) continue;
    const { matchCount, duration } = calculateRemainingCategoryMetrics(cat, durations);
    if (skipEmptyCategories && matchCount === 0) continue;
    activeCategories.push({ ...cat, _matchCount: matchCount, _duration: Math.max(5, duration) });
  }

  const standardSorted = sortCategoriesByKarateStandard(activeCategories);
  const parsedMap = new Map(standardSorted.map((cat) => [cat.id, parseKarateCategory(cat)]));
  const ageInfoMap = new Map(standardSorted.map((cat) => [cat.id, getCategoryAgeGroupInfo(cat)]));
  const ageBuckets = Array.from(
    new Set(standardSorted.map((cat) => getAgeRank(parsedMap.get(cat.id))))
  ).sort((a, b) => a - b);
  const ageIndexMap = new Map(ageBuckets.map((val, idx) => [val, idx]));

  const exportedCategories = standardSorted.map((cat, index) => {
    const parsed = parsedMap.get(cat.id);
    const ageInfo = ageInfoMap.get(cat.id);
    const ageIdx = ageIndexMap.get(getAgeRank(parsed)) ?? 99;
    const existing = existingSchedule[cat.id];
    const pinned =
      keepPinned && existing && existing.pinned && existing.date && existing.mat && existing.time
        ? { date: existing.date, mat: Number(existing.mat), startTime: existing.time }
        : null;
    const { allowedMats, preferredMats } = resolveMatConstraints({
      cat,
      parsed,
      ageInfo,
      matCount: Math.max(1, Number(matCount) || 4),
      perMatRules,
      scheduleConfig,
      tournamentDays,
    });
    const rawAthletes = extractAthleteKeys(cat);
    const athletes = rawAthletes.map(getAthId).filter(Boolean);

    return {
      id: cat.id,
      name: cat.name,
      discipline: parsed.discipline,
      gender: parsed.gender,
      eventType: parsed.eventType,
      matchCount: cat._matchCount,
      duration: cat._duration,
      athleteCount: athletes.length,
      athletes,
      phaseGroup: karateOrderMode === "kata_then_kumite" ? (parsed.discipline === "kata" ? 0 : 1) : ageIdx,
      ageOrder: ageIdx,
      intraAgeRank: getIntraAgeRank(parsed),
      priorityRank: index,
      allowedMats,
      preferredMats,
      pinned,
      bracketSummary: {
        hasBracket: Boolean(cat.bracket),
        totalMatches: Array.isArray(cat.bracket?.matches) ? cat.bracket.matches.length : cat._matchCount,
        remainingMatches: cat._matchCount,
      },
    };
  });

  const manualSchedule = {};
  for (const cat of standardSorted) {
    const slot = existingSchedule[cat.id];
    if (slot?.date && slot?.mat && slot?.time) {
      manualSchedule[cat.id] = {
        date: slot.date,
        mat: Number(slot.mat),
        time: slot.time,
        pinned: Boolean(slot.pinned),
      };
    }
  }

  return {
    schemaVersion: "ksport-benchmark-v1",
    exportedAt: new Date().toISOString(),
    anonymized: Boolean(anonymize),
    tournamentDays,
    matCount,
    sessionConfig,
    customEvents: (customEvents || []).map((e) => ({
      name: e.name || "Sự kiện cố định",
      date: e.date || "",
      time: e.time || "09:30",
      duration: Number(e.duration) || 30,
      mat: Number(e.mat) || 0,
    })),
    minRestMinutes,
    transitionMinutes,
    kataMode,
    intraAgeMode,
    strictTargetEndTime: Boolean(strictTargetEndTime),
    categories: exportedCategories,
    manualSchedule: Object.keys(manualSchedule).length > 0 ? manualSchedule : null,
  };
}

/**
 * Step 1 Analyzer: Summarizes tournament data, brackets, athletes, clubs,
 * dynamic age groups, multi-event athletes, pinned categories, and missing data.
 */
export function analyzeTournamentForScheduling({
  categories = [],
  existingSchedule = {},
  durations = {},
  categoryDurationOverrides = null,
  skipEmptyCategories = true,
}) {
  const athleteIds = new Set();
  const clubs = new Set();
  const athleteToCats = new Map();
  const ageGroupsMap = new Map();
  const weightClasses = new Set();
  const missingWarnings = [];

  let activeCount = 0;
  let emptyCount = 0;
  let kataCount = 0;
  let kumiteCount = 0;
  let individualCount = 0;
  let teamCount = 0;
  let maleCount = 0;
  let femaleCount = 0;
  let totalRemainingMatches = 0;
  let totalEstimatedMinutes = 0;
  let hasBracketCount = 0;
  let estimatedBracketCount = 0;
  let pinnedCount = 0;

  for (const cat of categories) {
    const participants = getEstimatedParticipantCount(cat);
    const { matchCount, duration } = calculateRemainingCategoryMetrics(cat, durations);
    const overrideDur = categoryDurationOverrides?.[cat.id];
    const finalDur = Number(overrideDur) > 0 ? Math.max(5, Number(overrideDur)) : Math.max(5, duration);

    for (const a of cat.athletes || []) {
      if (a?.club) clubs.add(String(a.club).trim());
    }

    if (skipEmptyCategories && (participants === 0 || matchCount === 0)) {
      emptyCount += 1;
      continue;
    }

    activeCount += 1;
    const parsed = parseKarateCategory(cat);
    const ageInfo = getCategoryAgeGroupInfo(cat);

    if (parsed.discipline === "kata") kataCount += 1;
    else kumiteCount += 1;

    if (parsed.eventType === "team") teamCount += 1;
    else individualCount += 1;

    if (parsed.gender === "male") maleCount += 1;
    else if (parsed.gender === "female") femaleCount += 1;

    if (!ageGroupsMap.has(ageInfo.key)) {
      ageGroupsMap.set(ageInfo.key, { ...ageInfo, count: 0 });
    }
    ageGroupsMap.get(ageInfo.key).count += 1;

    if (parsed.weightClass) weightClasses.add(parsed.weightClass);

    totalRemainingMatches += matchCount;
    totalEstimatedMinutes += finalDur;

    if (cat.bracket && Array.isArray(cat.bracket.matches) && cat.bracket.matches.length > 0) {
      hasBracketCount += 1;
    } else {
      estimatedBracketCount += 1;
    }

    const slot = existingSchedule?.[cat.id];
    if (slot?.pinned && slot?.date && slot?.mat && slot?.time) {
      pinnedCount += 1;
    }

    const keys = extractAthleteKeys(cat);
    for (const k of keys) {
      athleteIds.add(k);
      if (!athleteToCats.has(k)) athleteToCats.set(k, []);
      athleteToCats.get(k).push(cat.name);
    }
  }

  const multiCategoryAthletes = Array.from(athleteToCats.entries())
    .filter(([, list]) => list.length > 1)
    .map(([id, list]) => ({ id, categoryCount: list.length, categories: list }));

  if (activeCount === 0) {
    missingWarnings.push("Chưa có nội dung nào có VĐV hoặc trận đấu để xếp lịch.");
  }
  if (estimatedBracketCount > 0) {
    missingWarnings.push(
      `Có ${estimatedBracketCount}/${activeCount} nội dung chưa bốc thăm — số trận và thời lượng đang là ước tính (N - 1 trận).`
    );
  }
  if (emptyCount > 0) {
    missingWarnings.push(`Đã bỏ qua ${emptyCount} nội dung trống (0 VĐV hoặc đã đấu xong).`);
  }

  return {
    totalRawCategories: categories.length,
    activeCategories: activeCount,
    emptyCategories: emptyCount,
    athleteCount: athleteIds.size,
    clubCount: clubs.size,
    kataCount,
    kumiteCount,
    individualCount,
    teamCount,
    maleCount,
    femaleCount,
    ageGroups: Array.from(ageGroupsMap.values()).sort((a, b) => a.order - b.order),
    weightClassCount: weightClasses.size,
    totalRemainingMatches,
    totalEstimatedMinutes,
    hasBracketCount,
    estimatedBracketCount,
    isMatchCountEstimated: estimatedBracketCount > 0,
    pinnedCount,
    multiCategoryAthleteCount: multiCategoryAthletes.length,
    multiCategoryAthletes: multiCategoryAthletes.slice(0, 15),
    missingWarnings,
  };
}

/**
 * Step 2 & Step 6 Capacity & Pre-Solve Feasibility Calculator.
 */
export function computePreSolveSummary({
  categories = [],
  durations = {},
  categoryDurationOverrides = null,
  skipEmptyCategories = true,
  tournamentDays = [],
  matCount = 4,
  sessionConfig = {},
  daySessionConfigs = null,
  customEvents = [],
  matOperatingWindows = null,
  transitionMinutes = 0,
  strictTargetEndTime = false,
}) {
  let totalCategories = 0;
  let totalMatches = 0;
  let totalWorkloadMinutes = 0;

  for (const cat of categories) {
    const participants = getEstimatedParticipantCount(cat);
    if (skipEmptyCategories && participants === 0) continue;
    const { matchCount, duration } = calculateRemainingCategoryMetrics(cat, durations);
    if (skipEmptyCategories && matchCount === 0) continue;
    const overrideDur = categoryDurationOverrides?.[cat.id];
    const finalDur = Number(overrideDur) > 0 ? Math.max(5, Number(overrideDur)) : Math.max(5, duration);
    totalCategories += 1;
    totalMatches += matchCount;
    totalWorkloadMinutes += finalDur + Math.max(0, Number(transitionMinutes) || 0);
  }

  const mCount = Math.max(1, Number(matCount) || 1);
  let totalTargetCapacityMinutes = 0;
  let totalMaxCapacityMinutes = 0;
  const perDayCapacity = [];

  for (const day of tournamentDays) {
    const cfg = { ...sessionConfig, ...(daySessionConfigs?.[day] || {}) };
    const mS = convertTimeToMins(cfg.morningStart || "08:00");
    const mE = convertTimeToMins(cfg.morningEnd || "11:30");
    const aS = convertTimeToMins(cfg.afternoonStart || "13:30");
    const maxEnd = convertTimeToMins(cfg.maximumEndTime || cfg.afternoonEnd || "17:30");
    const targetEnd = convertTimeToMins(cfg.targetEndTime || cfg.maximumEndTime || cfg.afternoonEnd || "17:30");

    let dayTargetCap = 0;
    let dayMaxCap = 0;

    for (let m = 1; m <= mCount; m += 1) {
      const mOp = matOperatingWindows?.[m];
      const opS = mOp?.start ? convertTimeToMins(mOp.start) : 0;
      const opE = mOp?.end ? convertTimeToMins(mOp.end) : 1440;

      const calcWindowCap = (endLimit) => {
        let cap = 0;
        const sessions = [];
        if (mE > mS) sessions.push([Math.max(mS, opS), Math.min(mE, opE)]);
        if (endLimit > aS) sessions.push([Math.max(aS, opS), Math.min(endLimit, opE)]);
        for (const [s0, e0] of sessions) {
          if (e0 <= s0) continue;
          let segs = [[s0, e0]];
          for (const ev of customEvents || []) {
            if (ev.date && ev.date !== day) continue;
            const evMat = Number(ev.mat) || 0;
            if (evMat !== 0 && evMat !== m) continue;
            const bS = convertTimeToMins(ev.time || "09:30");
            const bE = bS + (Number(ev.duration) || 30);
            const next = [];
            for (const [xs, xe] of segs) {
              if (bE <= xs || bS >= xe) next.push([xs, xe]);
              else {
                if (bS > xs) next.push([xs, bS]);
                if (bE < xe) next.push([bE, xe]);
              }
            }
            segs = next;
          }
          for (const [xs, xe] of segs) cap += Math.max(0, xe - xs);
        }
        return cap;
      };

      dayTargetCap += calcWindowCap(targetEnd);
      dayMaxCap += calcWindowCap(strictTargetEndTime ? targetEnd : Math.max(maxEnd, targetEnd));
    }

    totalTargetCapacityMinutes += dayTargetCap;
    totalMaxCapacityMinutes += dayMaxCap;
    perDayCapacity.push({ date: day, targetCapacityMinutes: dayTargetCap, maxCapacityMinutes: dayMaxCap });
  }

  const effectiveCap = strictTargetEndTime ? totalTargetCapacityMinutes : totalMaxCapacityMinutes;
  const warnings = [];
  if (totalWorkloadMinutes > totalMaxCapacityMinutes) {
    warnings.push(
      `Tổng thời lượng (${totalWorkloadMinutes} phút) vượt quá sức chứa tối đa (${totalMaxCapacityMinutes} phút). Hãy tăng số thảm, thêm ngày thi đấu hoặc nới giờ kết thúc tối đa.`
    );
  } else if (totalWorkloadMinutes > totalTargetCapacityMinutes) {
    warnings.push(
      `Tổng thời lượng (${totalWorkloadMinutes} phút) vượt mục tiêu (${totalTargetCapacityMinutes} phút) nhưng vẫn nằm trong giới hạn tối đa (${totalMaxCapacityMinutes} phút).`
    );
  }

  return {
    totalCategories,
    totalMatches,
    totalWorkloadMinutes,
    totalTargetCapacityMinutes,
    totalMaxCapacityMinutes,
    effectiveCapacityMinutes: effectiveCap,
    utilizationPercent: effectiveCap > 0 ? Math.round((totalWorkloadMinutes / effectiveCap) * 1000) / 10 : 0,
    perDayCapacity,
    feasibleLikely: totalWorkloadMinutes <= effectiveCap,
    warnings,
  };
}

const CUSTOM_TEMPLATE_STORAGE_KEY = "ksport_smart_schedule_templates_v1";

/**
 * Starter templates (Section 10): starting baselines only, NOT official federation mandates.
 */
export const SMART_SCHEDULE_TEMPLATES = [
  {
    id: "club_open",
    name: "Giải cấp CLB",
    description: "1 ngày, gọn nhẹ, nghỉ VĐV 15p, Kata trước Kumite trên từng thảm",
    isStarter: true,
    config: {
      kataMode: "per_mat_kata_first",
      karateOrderMode: "kata_then_kumite",
      intraAgeMode: "preferred",
      minRestMinutes: 15,
      transitionMinutes: 0,
      maxTimeSeconds: 10,
      matPreset: "auto",
      selectedStrategies: ["balanced_time", "earliest_finish", "organization_priority"],
    },
  },
  {
    id: "grassroots",
    name: "Giải phong trào",
    description: "Thảm cuối chuyên Kumite, ưu tiên lứa tuổi nhỏ đấu trước",
    isStarter: true,
    config: {
      kataMode: "per_mat_kata_first",
      karateOrderMode: "kata_then_kumite",
      intraAgeMode: "preferred",
      minRestMinutes: 15,
      transitionMinutes: 0,
      maxTimeSeconds: 30,
      matPreset: "kata_kumite_split",
      selectedStrategies: ["balanced_time", "earliest_finish", "organization_priority"],
    },
  },
  {
    id: "school_games",
    name: "Giải học sinh (Hội khỏe Phù Đổng)",
    description: "Nghỉ VĐV 20p, hạn chế VĐV di chuyển thảm giữa các nội dung",
    isStarter: true,
    config: {
      kataMode: "per_mat_kata_first",
      karateOrderMode: "age_young_first",
      intraAgeMode: "preferred",
      minRestMinutes: 20,
      transitionMinutes: 2,
      maxTimeSeconds: 30,
      matPreset: "by_age",
      selectedStrategies: ["balanced_time", "athlete_experience", "organization_priority"],
    },
  },
  {
    id: "university",
    name: "Giải sinh viên",
    description: "Lứa tuổi 18+, tách thảm Nam/Nữ hoặc cân bằng thời gian",
    isStarter: true,
    config: {
      kataMode: "per_mat_kata_first",
      karateOrderMode: "kata_then_kumite",
      intraAgeMode: "preferred",
      minRestMinutes: 20,
      transitionMinutes: 0,
      maxTimeSeconds: 30,
      matPreset: "by_gender",
      selectedStrategies: ["balanced_time", "earliest_finish", "athlete_experience"],
    },
  },
  {
    id: "provincial",
    name: "Giải cấp tỉnh / mở rộng",
    description: "Chuẩn điều lệ: Kata trước Kumite, giữ trình tự CN Nam→Nữ→ĐĐ, Tuyệt đối cuối",
    isStarter: true,
    config: {
      kataMode: "per_mat_kata_first",
      karateOrderMode: "kata_then_kumite",
      intraAgeMode: "preferred",
      minRestMinutes: 15,
      transitionMinutes: 0,
      maxTimeSeconds: 30,
      matPreset: "kata_kumite_split",
      selectedStrategies: ["balanced_time", "earliest_finish", "organization_priority"],
    },
  },
  {
    id: "multi_day",
    name: "Giải nhiều ngày",
    description: "Tối ưu đa ngày, giữ lịch ổn định, cân bằng tải và giảm chuyển thảm",
    isStarter: true,
    config: {
      kataMode: "per_mat_kata_first",
      karateOrderMode: "age_young_first",
      intraAgeMode: "preferred",
      minRestMinutes: 20,
      transitionMinutes: 2,
      maxTimeSeconds: 45,
      matPreset: "auto",
      selectedStrategies: ["balanced_time", "organization_priority", "athlete_experience"],
    },
  },
];

export function loadCustomScheduleTemplates() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(CUSTOM_TEMPLATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomScheduleTemplate(template) {
  const existing = loadCustomScheduleTemplates();
  const next = [
    {
      ...template,
      id: template.id || `custom_${Date.now()}`,
      isStarter: false,
      savedAt: new Date().toISOString(),
    },
    ...existing.filter((t) => t.id !== template.id),
  ].slice(0, 20);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CUSTOM_TEMPLATE_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function deleteCustomScheduleTemplate(templateId) {
  const next = loadCustomScheduleTemplates().filter((t) => t.id !== templateId);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CUSTOM_TEMPLATE_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore
  }
  return next;
}

export function checkTemplateCompatibility(template, { matCount = 3, tournamentDays = [], categories = [] }) {
  const warnings = [];
  const cfg = template?.config || {};
  if (cfg.matPreset === "kata_kumite_split" && matCount < 2) {
    warnings.push("Mẫu tách thảm Kumite cần tối thiểu 2 thảm; hệ thống sẽ tự động giữ nguyên 1 thảm.");
  }
  if (template?.id === "multi_day" && tournamentDays.length < 2) {
    warnings.push("Giải hiện tại chỉ có 1 ngày thi đấu (mẫu này thiết kế cho giải nhiều ngày).");
  }
  const hasKata = categories.some((c) => parseKarateCategory(c).discipline === "kata");
  if (!hasKata && cfg.kataMode === "global_kata_first") {
    warnings.push("Giải không có nội dung Kata; quy tắc Kata trước Kumite sẽ tự động bỏ qua.");
  }
  return { compatible: true, warnings };
}

export function filterMeaningfulPlans(plans = []) {
  const seen = new Set();
  const distinct = [];
  for (const p of plans) {
    const v = p.validation || {};
    const loadSig = (v.matLoads || []).map((m) => `${m.mat}:${m.categoryCount}:${m.totalMinutes}:${m.lastEndTime}`).join("|");
    const key = `${v.makespanTime}_${v.completionSpreadMinutes}_${v.totalIdleMinutes}_${v.athleteMatSwitches}_${v.manualDisruptions}_${loadSig}`;
    if (!seen.has(key)) {
      seen.add(key);
      distinct.push(p);
    }
  }
  return distinct.length > 0 ? distinct : plans.slice(0, 1);
}
