/**
 * Cloud Sync Service
 * Quản lý đồng bộ tự động & thủ công từ Thư ký tổng (Client App) lên Server VPS của Super Admin
 */

import { createBackupData } from './backupService.js';
import { dbGetMachineId } from './dbService.js';
import { getComputedCategoryResults } from '../domain/bronzeIntegration.js';

// Danh sách các VPS Base URL (Ưu tiên Domain HTTPS proxy, sau đó tới Direct IP Port)
const VPS_SERVERS = [
  'https://admin.luuquancoder.id.vn',
  'http://103.82.193.133:2000'
];

let vpsSyncedIds = null;
let lastVPSCheckTime = 0;

const SYNC_STATES_KEY = 'krt_cloud_sync_states';

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
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(SYNC_STATES_KEY, JSON.stringify(states));
  } catch (e) {
    console.error('Error saving sync state:', e);
  }
}


export async function checkVPSOnlineSyncList() {
  const now = Date.now();
  if (vpsSyncedIds !== null && now - lastVPSCheckTime < 10000) {
    return vpsSyncedIds;
  }

  try {
    for (const serverUrl of VPS_SERVERS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        // Gọi Endpoint Công Khai (Public API không cần JWT token)
        const res = await fetch(`${serverUrl}/api/cloud-sync/synced-ids`, {
          method: 'GET',
          mode: 'cors',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data.success && (Array.isArray(data.ids) || Array.isArray(data.tournaments))) {
            const idList = data.ids || (data.tournaments || []).map((t) => t.id);
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
      status: 'idle',
      error: 'Chưa có trên VPS'
    };
  }

  return localState || {
    lastSyncedAt: null,
    status: 'idle',
    error: null
  };
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

  const fields = ["first", "second", "third1", "third2", "club1", "club2", "club3a", "club3b"];
  const merged = {};
  fields.forEach((f) => {
    merged[f] = saved[f] && typeof saved[f] === 'string' && saved[f].trim() !== "" ? saved[f] : (computed[f] || "");
  });
  return merged;
}

/**
 * Đẩy dữ liệu giải đấu lên Server VPS của Super Admin (Thử qua các Endpoint)
 * @param {string} tournamentId 
 * @param {Object} tournamentObj (Optional)
 * @returns {Promise<Object>} { success: boolean, message: string, syncedAt: string }
 */
export async function pushTournamentToCloud(tournamentId, tournamentObj = null) {
  if (!tournamentId) {
    return { success: false, message: 'Thiếu ID giải đấu để đồng bộ' };
  }

  saveSyncState(tournamentId, { status: 'syncing', error: null });

  try {
    // 1. Tạo gói dữ liệu .kbackup cho giải này
    const backupResult = await createBackupData(`Đồng bộ Cloud tự động`, tournamentId);
    if (!backupResult.success || !backupResult.data) {
      throw new Error(backupResult.error || 'Không thể đóng gói dữ liệu giải đấu');
    }

    const backupData = backupResult.data;
    const tournamentData = tournamentObj || (backupData.data?.tournaments && backupData.data.tournaments[0]);

    if (!tournamentData) {
      throw new Error('Dữ liệu giải đấu rỗng');
    }

    // 2. Thu thập metadata & Bảng xếp hạng Toàn đoàn
    const machineId = await dbGetMachineId();
    const totalAthletes = (tournamentData.categories || []).reduce(
      (sum, cat) => sum + (cat.athletes ? cat.athletes.length : 0), 0
    );
    const totalCategories = (tournamentData.categories || []).length;

    // Tính toán Bảng xếp hạng Toàn Đoàn & Danh sách VĐV đạt huy chương
    const clubMedals = {};
    const medalists = [];
    const categoryResults = tournamentData.categoryResults || {};

    (tournamentData.categories || []).forEach((category) => {
      const results = getCategoryMedalResults(category, categoryResults);
      const catName = category.name || category.eventName || "Hạng mục";

      const first = results.first || "";
      const club1 = results.club1 || results.firstClub || category.athletes?.find(a => a.name === first)?.club || "";
      const second = results.second || "";
      const club2 = results.club2 || results.secondClub || category.athletes?.find(a => a.name === second)?.club || "";
      const third1 = results.third1 || results.third || "";
      const club3a = results.club3a || results.third1Club || category.athletes?.find(a => a.name === third1)?.club || "";
      const third2 = results.third2 || "";
      const club3b = results.club3b || results.third2Club || category.athletes?.find(a => a.name === third2)?.club || "";

      const winners = {
        categoryName: catName,
        gold: first || null,
        goldClub: club1 || null,
        silver: second || null,
        silverClub: club2 || null,
        bronze1: third1 || null,
        bronze1Club: club3a || null,
        bronze2: third2 || null,
        bronze2Club: club3b || null,
      };

      if (winners.gold || winners.silver || winners.bronze1) {
        medalists.push(winners);
      }

      const addMedal = (club, type) => {
        if (!club || typeof club !== 'string') return;
        const normalized = club.trim();
        if (!normalized) return;
        if (!clubMedals[normalized]) {
          clubMedals[normalized] = { club: normalized, gold: 0, silver: 0, bronze: 0, total: 0 };
        }
        clubMedals[normalized][type] += 1;
        clubMedals[normalized].total += 1;
      };

      if (winners.goldClub) addMedal(winners.goldClub, 'gold');
      if (winners.silverClub) addMedal(winners.silverClub, 'silver');
      if (winners.bronze1Club) addMedal(winners.bronze1Club, 'bronze');
      if (winners.bronze2Club) addMedal(winners.bronze2Club, 'bronze');
    });

    const delegationRankings = Object.values(clubMedals)
      .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze)
      .map((item, idx) => ({ rank: idx + 1, ...item }));

    const payload = {
      tournamentId: tournamentData.id,
      tournamentName: tournamentData.name,
      machineId: machineId || 'KRT-UNKNOWN',
      startDate: tournamentData.startDate || tournamentData.date || '',
      endDate: tournamentData.endDate || tournamentData.date || '',
      location: tournamentData.location || '',
      totalAthletes,
      totalCategories,
      backupData,
      summary: {
        syncedFrom: 'Client Admin App',
        clientAppVersion: '1.0.1',
        delegationRankings,
        medalists,
        totalClubs: Object.keys(clubMedals).length
      }
    };

    // 3. Gọi API Push lên VPS (Thử lần lượt qua các server domain/IP)
    let lastError = null;
    let successRes = null;

    for (const serverUrl of VPS_SERVERS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s fast timeout per server

        const response = await fetch(`${serverUrl}/api/cloud-sync/tournament`, {
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          successRes = await response.json();
          break; // Đã đẩy thành công!
        } else {
          const errData = await response.json().catch(() => ({}));
          lastError = errData.message || (response.status === 413 ? 'Dữ liệu quá dung lượng cho phép (HTTP 413)' : `Lỗi HTTP ${response.status}`);
        }
      } catch (err) {
        lastError = (err.name === 'AbortError') 
          ? 'Hết thời gian chờ (6s)' 
          : (err.message === 'Failed to fetch' ? 'Không thể kết nối VPS Server (Kiểm tra mạng / SSL)' : err.message);
      }
    }

    if (!successRes) {
      throw new Error(lastError || 'Không thể kết nối đến VPS Server');
    }

    const syncedAt = successRes.syncedAt || new Date().toISOString();

    saveSyncState(tournamentId, {
      status: 'synced',
      lastSyncedAt: syncedAt,
      error: null
    });

    return {
      success: true,
      message: successRes.message || 'Đồng bộ lên VPS thành công!',
      syncedAt
    };
  } catch (error) {
    console.error('Lỗi khi đồng bộ lên VPS:', error);
    const errorMsg = error.message;

    saveSyncState(tournamentId, {
      status: 'error',
      error: errorMsg
    });

    return {
      success: false,
      message: errorMsg
    };
  }
}

/**
 * Tự động chạy tiến trình ngầm kiểm tra và đồng bộ khi có kết nối Internet
 */
let autoSyncInterval = null;
let lastAutoSyncTime = 0;

export function startAutoSyncEngine(getTournamentsFn) {
  if (autoSyncInterval) return;

  // Chạy mỗi 3 phút 1 lần
  autoSyncInterval = setInterval(async () => {
    if (!navigator.onLine) return;

    const now = Date.now();
    if (now - lastAutoSyncTime < 2 * 60 * 1000) return;
    lastAutoSyncTime = now;

    try {
      const tournaments = typeof getTournamentsFn === 'function' ? getTournamentsFn() : [];
      if (Array.isArray(tournaments) && tournaments.length > 0) {
        for (const t of tournaments) {
          const syncStatus = getTournamentSyncStatus(t.id);
          const lastSynced = syncStatus.lastSyncedAt ? new Date(syncStatus.lastSyncedAt).getTime() : 0;
          if (now - lastSynced > 10 * 60 * 1000) {
            await pushTournamentToCloud(t.id, t);
          }
        }
      }
    } catch (e) {
      // Bỏ qua lỗi ngầm
    }
  }, 3 * 60 * 1000);
}

export function stopAutoSyncEngine() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
}

/**
 * Lấy danh sách giải đấu khả dụng trên VPS Server
 */
export async function fetchCloudTournamentsList() {
  for (const serverUrl of VPS_SERVERS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${serverUrl}/api/cloud-sync/synced-ids`, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal
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
  return { success: false, tournaments: [], message: 'Không thể kết nối đến máy chủ Cloud VPS' };
}

/**
 * Tải trực tiếp gói .kbackup của một giải đấu từ VPS về Client App
 * @param {string} tournamentId 
 */
export async function downloadCloudBackupData(tournamentId) {
  if (!tournamentId) return { success: false, message: 'Thiếu ID giải đấu' };

  for (const serverUrl of VPS_SERVERS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout for full backup json
      const res = await fetch(`${serverUrl}/api/cloud-sync/download-kbackup/${tournamentId}`, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const backupData = await res.json();
        return { success: true, data: backupData };
      } else {
        const errData = await res.json().catch(() => ({}));
        return { success: false, message: errData.message || `Lỗi HTTP ${res.status}` };
      }
    } catch (e) {
      // thử server kế tiếp
    }
  }
  return { success: false, message: 'Không thể tải gói dữ liệu từ Cloud VPS' };
}

