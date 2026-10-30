/**
 * Cloud Sync Service
 * Quản lý đồng bộ tự động & thủ công từ Thư ký tổng (Client App) lên Server VPS của Super Admin
 */

import { createBackupData } from "./backupService.js";
import { dbGetMachineId } from "./dbService.js";
import { getComputedCategoryResults } from "../domain/bronzeIntegration.js";
import { getCurrentLicense } from "./licenseService.js";

// Danh sách các VPS Base URL (Ưu tiên Domain HTTPS proxy, sau đó tới Direct IP Port)
export const KSPORT_CLOUD_API_URL = "https://api.k-sport.net";
const VPS_SERVERS = [KSPORT_CLOUD_API_URL];

let vpsSyncedIds = null;
let lastVPSCheckTime = 0;

const SYNC_STATES_KEY = "krt_cloud_sync_states";
const RESULT_RELAY_ID_KEY = "krt_cloud_result_relay_id";

function getCloudIdentity() {
  const license = getCurrentLicense();
  const machineId = String(license?.machineId || "").trim();
  if (
    !license?.active ||
    license.isTrial ||
    !license.licenseKey ||
    !machineId
  ) {
    throw new Error("Cloud sync yêu cầu bản quyền đang hoạt động trên máy này");
  }
  return { license, machineId };
}

export async function getCloudAuthHeaders() {
  const { license, machineId } = getCloudIdentity();
  return {
    "X-K-Sport-License": license.licenseKey,
    "X-K-Sport-Machine": machineId,
  };
}

export function getOrCreateCloudResultRelayId() {
  const existing = localStorage.getItem(RESULT_RELAY_ID_KEY);
  if (existing) return existing;
  const randomPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? `${crypto.randomUUID()}-${crypto.randomUUID()}`
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
          .toString(36)
          .slice(2)}`;
  const relayId = `KRC-${randomPart}`;
  localStorage.setItem(RESULT_RELAY_ID_KEY, relayId);
  return relayId;
}

export function getSyncStates() {
  try {
    const raw = localStorage.getItem(SYNC_STATES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function saveSyncState(tournamentId, stateObj) {
  try {
    const states = getSyncStates();
    states[tournamentId] = {
      ...(states[tournamentId] || {}),
      ...stateObj,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(SYNC_STATES_KEY, JSON.stringify(states));
  } catch (e) {
    console.error("Error saving sync state:", e);
  }
}

export function isTournamentAutoSyncEnabled(tournamentId) {
  if (!tournamentId) return false;
  const localState = getSyncStates()[tournamentId];
  return (
    localState?.autoSyncEnabled === true || Boolean(localState?.lastSyncedAt)
  );
}

export async function checkVPSOnlineSyncList() {
  const now = Date.now();
  if (vpsSyncedIds !== null && now - lastVPSCheckTime < 10000) {
    return vpsSyncedIds;
  }

  try {
    const authHeaders = await getCloudAuthHeaders();
    for (const serverUrl of VPS_SERVERS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        // Gọi Endpoint Công Khai (Public API không cần JWT token)
        const res = await fetch(`${serverUrl}/api/cloud-sync/synced-ids`, {
          method: "GET",
          mode: "cors",
          headers: authHeaders,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (
            data.success &&
            (Array.isArray(data.ids) || Array.isArray(data.tournaments))
          ) {
            const idList =
              data.ids || (data.tournaments || []).map((t) => t.id);
            vpsSyncedIds = new Set(idList);
            lastVPSCheckTime = now;
            break;
          }
        }
      } catch (e) {
        // thử server kế tiếp
      }
    }
  } catch (e) {
    // offline
  }
  return vpsSyncedIds;
}

export function getTournamentSyncStatus(tournamentId) {
  const states = getSyncStates();
  const localState = states[tournamentId];

  // If we fetched the VPS sync list and this tournament is NOT on VPS, override to 'idle' (🔴 Chưa đồng bộ)
  if (vpsSyncedIds !== null && !vpsSyncedIds.has(tournamentId)) {
    return {
      lastSyncedAt: null,
      status: "idle",
      error: "Chưa có trên VPS",
    };
  }

  return (
    localState || {
      lastSyncedAt: null,
      status: "idle",
      error: null,
    }
  );
}

export function getCategoryMedalResults(cat, categoryResultsMap = {}) {
  const saved = categoryResultsMap[cat.id] || cat.results || {};
  const selectedMedals = cat?.bracket ? getComputedCategoryResults(cat) : null;
  let computed = selectedMedals?.ok ? selectedMedals.results : null;

  if (cat?.bracket?.matches && (!computed || !computed.first)) {
    const bracket = cat.bracket;
    const finalMatch = (bracket.matches || []).find(
      (m) => m.nextMatchId === null && m.round > 0
    );

    if (finalMatch?.winner) {
      const getLoser = (match) => {
        if (!match?.winner) return null;
        if (match.athlete1?.id === match.winner.id) return match.athlete2;
        if (match.athlete2?.id === match.winner.id) return match.athlete1;
        return null;
      };

      const champion = finalMatch.winner;
      const silver = getLoser(finalMatch);
      const semiFinalRound = bracket.numRounds - 1;
      const semiFinals = (bracket.matches || []).filter(
        (m) => m.round === semiFinalRound && !m.isBye
      );
      const bronzes = semiFinals.map((m) => getLoser(m)).filter(Boolean);

      computed = {
        first: champion?.name || "",
        club1: champion?.club || "",
        second: silver?.name || "",
        club2: silver?.club || "",
        third1: bronzes[0]?.name || "",
        club3a: bronzes[0]?.club || "",
        third2: bronzes[1]?.name || "",
        club3b: bronzes[1]?.club || "",
        _fromBracket: true,
      };
    }
  }

  if (!saved && !computed) return {};
  if (!saved) return computed || {};
  if (!computed) return saved || {};

  const fields = [
    "first",
    "second",
    "third1",
    "third2",
    "club1",
    "club2",
    "club3a",
    "club3b",
  ];
  const merged = {};
  fields.forEach((f) => {
    merged[f] =
      saved[f] && typeof saved[f] === "string" && saved[f].trim() !== ""
        ? saved[f]
        : computed[f] || "";
  });
  return merged;
}

/**
 * Đẩy dữ liệu giải đấu lên Server VPS của Super Admin (Thử qua các Endpoint)
 * @param {string} tournamentId
 * @param {Object} tournamentObj (Optional)
 * @returns {Promise<Object>} { success: boolean, message: string, syncedAt: string }
 */
export async function pushTournamentToCloud(
  tournamentId,
  tournamentObj = null
) {
  if (!tournamentId) {
    return { success: false, message: "Thiếu ID giải đấu để đồng bộ" };
  }

  saveSyncState(tournamentId, { status: "syncing", error: null });

  try {
    // 1. Tạo gói dữ liệu .kbackup cho giải này
    const backupResult = await createBackupData(
      `Đồng bộ Cloud tự động`,
      tournamentId
    );
    if (!backupResult.success || !backupResult.data) {
      throw new Error(
        backupResult.error || "Không thể đóng gói dữ liệu giải đấu"
      );
    }

    const backupData = backupResult.data;
    const tournamentData =
      tournamentObj ||
      (backupData.data?.tournaments && backupData.data.tournaments[0]);

    if (!tournamentData) {
      throw new Error("Dữ liệu giải đấu rỗng");
    }

    // 2. Thu thập metadata & Bảng xếp hạng Toàn đoàn
    const { machineId } = getCloudIdentity();
    const authHeaders = await getCloudAuthHeaders();
    const totalAthletes = (tournamentData.categories || []).reduce(
      (sum, cat) => sum + (cat.athletes ? cat.athletes.length : 0),
      0
    );
    const totalCategories = (tournamentData.categories || []).length;

    // Tính toán Bảng xếp hạng Toàn Đoàn & Danh sách VĐV đạt huy chương
    const clubMedals = {};
    const medalists = [];
    const categoryResults = tournamentData.categoryResults || {};

    (tournamentData.categories || []).forEach((category) => {
      // Draft or amended results remain private until an Admin confirms them.
      const confirmed = categoryResults[category.id];
      if (!confirmed?.confirmedAt) return;
      const results = getCategoryMedalResults(category, categoryResults);
      const catName = category.name || category.eventName || "Hạng mục";

      const first = results.first || "";
      const club1 = results.club1 || results.firstClub || "";
      const second = results.second || "";
      const club2 = results.club2 || results.secondClub || "";
      const third1 = results.third1 || results.third || "";
      const club3a = results.club3a || results.third1Club || "";
      const third2 = results.third2 || "";
      const club3b = results.club3b || results.third2Club || "";
      const resolveAthleteId = (name, club) => {
        const candidates = (category.athletes || []).filter(
          (athlete) => athlete?.name === name && athlete?.club === club
        );
        // Ambiguous names are deliberately not published as medalists. This
        // prevents a medal being assigned to the wrong athlete.
        return candidates.length === 1
          ? candidates[0].athleteId || candidates[0].id
          : null;
      };

      const winners = {
        categoryName: catName,
        categoryId: category.id,
        confirmedAt: confirmed.confirmedAt,
        confirmedBy: confirmed.confirmedBy || "ADMIN",
        gold: first || null,
        goldClub: club1 || null,
        goldAthleteId: resolveAthleteId(first, club1),
        silver: second || null,
        silverClub: club2 || null,
        silverAthleteId: resolveAthleteId(second, club2),
        bronze1: third1 || null,
        bronze1Club: club3a || null,
        bronze1AthleteId: resolveAthleteId(third1, club3a),
        bronze2: third2 || null,
        bronze2Club: club3b || null,
        bronze2AthleteId: resolveAthleteId(third2, club3b),
      };

      if (winners.gold || winners.silver || winners.bronze1) {
        medalists.push(winners);
      }

      const addMedal = (club, type) => {
        if (!club || typeof club !== "string") return;
        const normalized = club.trim();
        if (!normalized) return;
        if (!clubMedals[normalized]) {
          clubMedals[normalized] = {
            club: normalized,
            gold: 0,
            silver: 0,
            bronze: 0,
            total: 0,
          };
        }
        clubMedals[normalized][type] += 1;
        clubMedals[normalized].total += 1;
      };

      if (winners.goldClub) addMedal(winners.goldClub, "gold");
      if (winners.silverClub) addMedal(winners.silverClub, "silver");
      if (winners.bronze1Club) addMedal(winners.bronze1Club, "bronze");
      if (winners.bronze2Club) addMedal(winners.bronze2Club, "bronze");
    });

    const delegationRankings = Object.values(clubMedals)
      .sort(
        (a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze
      )
      .map((item, idx) => ({ rank: idx + 1, ...item }));

    const localStates = getSyncStates();
    const currentSyncState = localStates[tournamentId] || {};
    const savedAuthorizedMachineId =
      currentSyncState.authorizedMachineId ||
      tournamentData.authorizedMachineId ||
      "";
    // Older builds stored the backup-only `machine_*` ID here. It was never a
    // licensed machine identity, so migrate it to the active license machine.
    const authorizedMachineId = String(savedAuthorizedMachineId).startsWith(
      "KRT-"
    )
      ? savedAuthorizedMachineId
      : machineId;

    const payload = {
      tournamentId: tournamentData.id,
      tournamentName: tournamentData.name,
      machineId: machineId || "KRT-UNKNOWN",
      authorizedMachineId,
      authorized_machine_id: authorizedMachineId,
      isAuthorizedSource: machineId === authorizedMachineId,
      startDate: tournamentData.startDate || tournamentData.date || "",
      endDate: tournamentData.endDate || tournamentData.date || "",
      location: tournamentData.location || "",
      totalAthletes,
      totalCategories,
      backupData,
      summary: {
        syncedFrom: "Client Admin App",
        clientAppVersion: "1.0.1",
        delegationRankings,
        medalists,
        totalClubs: Object.keys(clubMedals).length,
        machineId,
        authorizedMachineId,
      },
      isPublic: tournamentData.isPublic === true,
    };

    // 3. Gọi API Push lên VPS (Thử lần lượt qua các server domain/IP)
    let lastError = null;
    let successRes = null;

    for (const serverUrl of VPS_SERVERS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s fast timeout per server

        const response = await fetch(`${serverUrl}/api/cloud-sync/tournament`, {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          successRes = await response.json();
          break; // Đã đẩy thành công!
        } else {
          const errData = await response.json().catch(() => ({}));
          lastError =
            errData.message ||
            (response.status === 413
              ? "Dữ liệu quá dung lượng cho phép (HTTP 413)"
              : `Lỗi HTTP ${response.status}`);
        }
      } catch (err) {
        lastError =
          err.name === "AbortError"
            ? "Hết thời gian chờ (8s)"
            : err.message === "Failed to fetch"
            ? "Không thể kết nối VPS Server (Kiểm tra mạng / SSL)"
            : err.message;
      }
    }

    if (!successRes) {
      throw new Error(lastError || "Không thể kết nối đến VPS Server");
    }

    const syncedAt = successRes.syncedAt || new Date().toISOString();

    saveSyncState(tournamentId, {
      status: "synced",
      lastSyncedAt: syncedAt,
      autoSyncEnabled: true,
      authorizedMachineId,
      error: null,
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("krt_cloud_sync_update", {
          detail: {
            tournamentId,
            syncedAt,
            status: "synced",
            authorizedMachineId,
          },
        })
      );
    }

    return {
      success: true,
      message: successRes.message || "Đồng bộ lên VPS thành công!",
      syncedAt,
    };
  } catch (error) {
    console.error("Lỗi khi đồng bộ lên VPS:", error);
    const errorMsg = error.message;

    saveSyncState(tournamentId, {
      status: "error",
      error: errorMsg,
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("krt_cloud_sync_update", {
          detail: { tournamentId, status: "error", error: errorMsg },
        })
      );
    }

    return {
      success: false,
      message: errorMsg,
    };
  }
}

/**
 * Trigger đồng bộ tự động theo thời gian thực (Realtime Debounced Push)
 * Được gọi khi có thay đổi dữ liệu (VĐV, Bốc thăm, Điểm số, Hạng mục...)
 */
let debouncedSyncTimeouts = {};

export function triggerDebouncedCloudSync(
  tournamentId,
  tournamentObj,
  delayMs = 3000
) {
  // Giải mới chỉ nằm cục bộ cho tới khi người dùng chủ động đồng bộ lần đầu.
  if (!isTournamentAutoSyncEnabled(tournamentId)) return;

  if (debouncedSyncTimeouts[tournamentId]) {
    clearTimeout(debouncedSyncTimeouts[tournamentId]);
  }

  debouncedSyncTimeouts[tournamentId] = setTimeout(() => {
    delete debouncedSyncTimeouts[tournamentId];
    if (navigator.onLine && isTournamentAutoSyncEnabled(tournamentId)) {
      console.log(
        `[Realtime Cloud Sync] Tự động đồng bộ giải [${tournamentId}] lên VPS...`
      );
      pushTournamentToCloud(tournamentId, tournamentObj).catch((err) => {
        console.warn("[Realtime Cloud Sync] Lỗi đẩy ngầm:", err);
      });
    }
  }, delayMs);
}

/**
 * Phân quyền / Xác nhận Machine ID nguồn chính cho giải đấu
 */
export async function setAuthorizedMachineForTournament(
  tournamentId,
  targetMachineId = null
) {
  if (!tournamentId) return { success: false, message: "Thiếu ID giải đấu" };

  let selectedMachineId = targetMachineId;
  if (!selectedMachineId) {
    try {
      selectedMachineId = getCloudIdentity().machineId;
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  saveSyncState(tournamentId, {
    authorizedMachineId: selectedMachineId,
  });

  // Re-push để cập nhật authorizedMachineId trên VPS
  const pushRes = await pushTournamentToCloud(tournamentId);

  return {
    success: pushRes.success,
    authorizedMachineId: selectedMachineId,
    message: pushRes.success
      ? `👑 Đã xác nhận Mã máy [${selectedMachineId}] là Máy Nguồn Chính cho giải đấu!`
      : pushRes.message,
  };
}

/**
 * Tự động chạy tiến trình ngầm kiểm tra và đồng bộ khi có kết nối Internet
 */
let autoSyncInterval = null;
let lastAutoSyncTime = 0;

export function startAutoSyncEngine(getTournamentsFn) {
  if (autoSyncInterval) return;

  // Chạy kiểm tra mỗi 30 giây 1 lần
  autoSyncInterval = setInterval(async () => {
    if (!navigator.onLine) return;

    const now = Date.now();
    if (now - lastAutoSyncTime < 20 * 1000) return;
    lastAutoSyncTime = now;

    try {
      const tournaments =
        typeof getTournamentsFn === "function" ? getTournamentsFn() : [];
      if (Array.isArray(tournaments) && tournaments.length > 0) {
        for (const t of tournaments) {
          if (!isTournamentAutoSyncEnabled(t.id)) continue;
          const syncStatus = getTournamentSyncStatus(t.id);
          const lastSynced = syncStatus.lastSyncedAt
            ? new Date(syncStatus.lastSyncedAt).getTime()
            : 0;
          // Chỉ tự cập nhật các giải đã được người dùng đồng bộ thành công trước đó.
          if (now - lastSynced > 2 * 60 * 1000) {
            await pushTournamentToCloud(t.id, t);
          }
        }
      }
    } catch (e) {
      // Bỏ qua lỗi ngầm
    }
  }, 30 * 1000);
}

export function stopAutoSyncEngine() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
}

async function requestCloudResultRelay(path, options = {}, timeoutMs = 8000) {
  let lastError = "Không thể kết nối đến máy chủ Cloud VPS";
  for (const serverUrl of VPS_SERVERS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${serverUrl}${path}`, {
        mode: "cors",
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success !== false) return data;
      lastError = data.message || `Lỗi HTTP ${response.status}`;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError =
        error.name === "AbortError"
          ? "Hết thời gian chờ máy chủ Cloud"
          : error.message;
    }
  }
  throw new Error(lastError);
}

/** Gửi một lô kết quả tới một hoặc nhiều Machine ID nhận Cloud. */
export async function pushResultsToCloudRelay(
  targetChannelIds,
  tournamentId,
  events = []
) {
  const targets = [
    ...new Set(
      (Array.isArray(targetChannelIds) ? targetChannelIds : [targetChannelIds])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ),
  ];
  if (targets.length === 0)
    return { success: false, message: "Thiếu Machine ID máy nhận" };
  if (!tournamentId) return { success: false, message: "Thiếu ID giải đấu" };
  if (!Array.isArray(events) || events.length === 0) {
    return { success: false, message: "Chưa có kết quả để đồng bộ" };
  }

  try {
    const sourceMachineId = await dbGetMachineId();
    return await requestCloudResultRelay(
      "/api/cloud-sync/results",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetChannels: targets,
          sourceMachineId: sourceMachineId || "KRT-UNKNOWN",
          tournamentId,
          events,
        }),
      },
      12000
    );
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/** Nhận các kết quả Cloud mới dành cho Machine ID hiện tại. */
export async function pullResultsFromCloudRelay(
  channelId,
  tournamentId,
  since = ""
) {
  const normalizedChannelId = String(channelId || "").trim();
  if (!normalizedChannelId || !tournamentId) {
    return {
      success: false,
      events: [],
      message: "Thiếu Mã nhận Cloud hoặc ID giải đấu",
    };
  }
  const params = new URLSearchParams({
    channelId: normalizedChannelId,
    tournamentId: String(tournamentId),
  });
  if (since) params.set("since", since);
  try {
    const data = await requestCloudResultRelay(
      `/api/cloud-sync/results?${params.toString()}`,
      {
        method: "GET",
      }
    );
    return {
      success: true,
      events: data.events || [],
      cursor: data.cursor || "",
      serverTime: data.serverTime,
    };
  } catch (error) {
    return { success: false, events: [], message: error.message };
  }
}

export async function checkCloudResultRelay(targetMachineId) {
  const normalizedTarget = String(targetMachineId || "").trim();
  if (!normalizedTarget)
    return { success: false, message: "Thiếu Machine ID máy nhận" };
  const params = new URLSearchParams({
    channelId: normalizedTarget,
    health: "1",
  });
  try {
    const data = await requestCloudResultRelay(
      `/api/cloud-sync/results?${params.toString()}`,
      {
        method: "GET",
      }
    );
    return {
      success: true,
      message: data.message || "Cloud VPS đang hoạt động",
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Lấy danh sách giải đấu khả dụng trên VPS Server
 */
export async function fetchCloudTournamentsList() {
  let authHeaders;
  try {
    authHeaders = await getCloudAuthHeaders();
  } catch (error) {
    return { success: false, tournaments: [], message: error.message };
  }
  for (const serverUrl of VPS_SERVERS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${serverUrl}/api/cloud-sync/synced-ids`, {
        method: "GET",
        mode: "cors",
        headers: authHeaders,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tournaments)) {
          return { success: true, tournaments: data.tournaments };
        }
      }
    } catch (e) {
      // thử server tiếp theo
    }
  }
  return {
    success: false,
    tournaments: [],
    message: "Không thể kết nối đến máy chủ Cloud VPS",
  };
}

/**
 * Tải trực tiếp gói .kbackup của một giải đấu từ VPS về Client App
 * @param {string} tournamentId
 */
export async function downloadCloudBackupData(tournamentId) {
  if (!tournamentId) return { success: false, message: "Thiếu ID giải đấu" };

  let authHeaders;
  try {
    authHeaders = await getCloudAuthHeaders();
  } catch (error) {
    return { success: false, message: error.message };
  }

  for (const serverUrl of VPS_SERVERS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for full backup json
      const res = await fetch(
        `${serverUrl}/api/cloud-sync/download-kbackup/${tournamentId}`,
        {
          method: "GET",
          mode: "cors",
          headers: authHeaders,
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      if (res.ok) {
        const backupData = await res.json();
        return { success: true, data: backupData };
      } else {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          message: errData.message || `Lỗi HTTP ${res.status}`,
        };
      }
    } catch (e) {
      // thử server kế tiếp
    }
  }
  return { success: false, message: "Không thể tải gói dữ liệu từ Cloud VPS" };
}
