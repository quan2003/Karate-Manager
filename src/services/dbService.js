/**
 * dbService.js - Wrapper cho SQLite Database (Renderer Process)
 * 
 * Trong Electron: gọi qua window.electronAPI.db (IPC → main process)
 * Trong browser dev: fallback sang localStorage (để dev không bị lỗi)
 */

const isElectron = () =>
  typeof window !== 'undefined' && window.electronAPI?.db != null;

// ====================================================
// TOURNAMENT OPERATIONS
// ====================================================

export async function dbGetTournaments() {
  if (isElectron()) {
    return await window.electronAPI.db.getTournaments();
  }
  // Fallback: localStorage
  try {
    const data = localStorage.getItem('karate_tournament_data');
    if (data) {
      const parsed = JSON.parse(data);
      return parsed.tournaments || [];
    }
  } catch {}
  return [];
}

export async function dbSaveTournaments(tournaments) {
  if (isElectron()) {
    return await window.electronAPI.db.saveTournaments(tournaments);
  }
  // Fallback: localStorage
  try {
    localStorage.setItem('karate_tournament_data', JSON.stringify({ tournaments }));
  } catch {}
  return true;
}

// ====================================================
// SETTINGS OPERATIONS
// ====================================================

export async function dbGetSetting(key) {
  if (isElectron()) {
    return await window.electronAPI.db.getSetting(key);
  }
  return localStorage.getItem(key);
}

export async function dbSetSetting(key, value) {
  if (isElectron()) {
    return await window.electronAPI.db.setSetting(key, value);
  }
  localStorage.setItem(key, value);
  return true;
}

export async function dbDeleteSetting(key) {
  if (isElectron()) {
    return await window.electronAPI.db.deleteSetting(key);
  }
  localStorage.removeItem(key);
  return true;
}

// ====================================================
// AUTO-BACKUP OPERATIONS
// ====================================================

export async function dbSaveAutoBackup(id, reason, data, size) {
  if (isElectron()) {
    return await window.electronAPI.db.saveAutoBackup(id, reason, data, size);
  }
  // Fallback: localStorage (old behavior)
  try {
    const AUTO_BACKUP_KEY = 'karate_auto_backup';
    const MAX = 10;
    const list = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || '[]');
    list.unshift({ id, reason, data, size, timestamp: new Date().toISOString() });
    while (list.length > MAX) list.pop();
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(list));
  } catch {}
  return true;
}

export async function dbGetAutoBackups() {
  if (isElectron()) {
    return await window.electronAPI.db.getAutoBackups();
  }
  try {
    return JSON.parse(localStorage.getItem('karate_auto_backup') || '[]');
  } catch { return []; }
}

export async function dbGetAutoBackupById(id) {
  if (isElectron()) {
    return await window.electronAPI.db.getAutoBackupById(id);
  }
  try {
    const list = JSON.parse(localStorage.getItem('karate_auto_backup') || '[]');
    return list.find(b => b.id === id) || null;
  } catch { return null; }
}

// ====================================================
// BACKUP HISTORY OPERATIONS
// ====================================================

export async function dbSaveBackupHistory(meta) {
  if (isElectron()) {
    return await window.electronAPI.db.saveBackupHistory(meta);
  }
  try {
    const BACKUP_HISTORY_KEY = 'karate_backup_history';
    const list = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || '[]');
    list.unshift({ ...meta, id: meta.id || Date.now().toString(36) });
    while (list.length > 50) list.pop();
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(list));
  } catch {}
  return true;
}

export async function dbGetBackupHistory() {
  if (isElectron()) {
    return await window.electronAPI.db.getBackupHistory();
  }
  try {
    return JSON.parse(localStorage.getItem('karate_backup_history') || '[]');
  } catch { return []; }
}

// ====================================================
// SESSION DATA (Coach / Secretary)
// ====================================================

export async function dbGetSessionData(tournamentId, key) {
  if (isElectron()) {
    return await window.electronAPI.db.getSessionData(tournamentId, key);
  }
  return localStorage.getItem(`${key}_${tournamentId}`);
}

export async function dbSetSessionData(tournamentId, key, value) {
  if (isElectron()) {
    return await window.electronAPI.db.setSessionData(tournamentId, key, value);
  }
  localStorage.setItem(`${key}_${tournamentId}`, value);
  return true;
}

export async function dbDeleteSessionData(tournamentId, key) {
  if (isElectron()) {
    return await window.electronAPI.db.deleteSessionData(tournamentId, key);
  }
  localStorage.removeItem(`${key}_${tournamentId}`);
  return true;
}

// ====================================================
// MACHINE ID (chỉ dùng trong backupService, không phải licenseService)
// ====================================================

export async function dbGetMachineId() {
  if (isElectron()) {
    let id = await window.electronAPI.db.getSetting('krt_machine_id_backup');
    if (!id) {
      id = 'machine_' + Math.random().toString(36).slice(2, 10);
      await window.electronAPI.db.setSetting('krt_machine_id_backup', id);
    }
    return id;
  }
  let id = localStorage.getItem('krt_machine_id');
  if (!id) {
    id = 'machine_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('krt_machine_id', id);
  }
  return id;
}

// ====================================================
// MIGRATION từ localStorage → SQLite
// ====================================================

/**
 * Chạy migration một lần: đọc toàn bộ localStorage và import vào SQLite.
 * Sau đó đánh dấu migration đã xong để không chạy lại.
 */
export async function runMigrationIfNeeded() {
  if (!isElectron()) return; // Chỉ chạy trong Electron

  const done = await window.electronAPI.db.isMigrationDone();
  if (done) return;

  console.log('[DB Migration] Bắt đầu migrate từ localStorage...');

  try {
    const lsData = {
      tournaments: [],
      settings: {},
      autoBackups: [],
      backupHistory: [],
      sessionData: [],
    };

    // 1. Tournament data
    try {
      const raw = localStorage.getItem('karate_tournament_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        lsData.tournaments = parsed.tournaments || [];
      }
    } catch {}

    // 2. Machine ID (backup service only)
    const machineId = localStorage.getItem('krt_machine_id');
    if (machineId) {
      lsData.settings['krt_machine_id_backup'] = machineId;
    }

    // 3. Auto backups
    try {
      const raw = localStorage.getItem('karate_auto_backup');
      if (raw) lsData.autoBackups = JSON.parse(raw);
    } catch {}

    // 4. Backup history
    try {
      const raw = localStorage.getItem('karate_backup_history');
      if (raw) {
        const list = JSON.parse(raw);
        lsData.backupHistory = list.map(h => ({
          id: h.id,
          fileName: h.fileName || h.file_name || '',
          description: h.description || '',
          machineId: h.machineId || '',
          tournamentCount: h.tournamentCount || 0,
          dataSize: h.dataSize || 0,
          type: h.type || 'manual',
          createdAt: h.createdAt || new Date().toISOString(),
        }));
      }
    } catch {}

    // 5. Coach/Secretary session data (scan localStorage keys)
    const sessionPrefixes = [
      'coach_athletes_',
      'coach_name_',
      'club_name_',
      'team_leader_',
      'additional_coaches_',
      'match_results_',
    ];
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i);
      for (const prefix of sessionPrefixes) {
        if (lsKey && lsKey.startsWith(prefix)) {
          const tournamentId = lsKey.slice(prefix.length);
          const value = localStorage.getItem(lsKey);
          if (value !== null) {
            // key stored without prefix in DB (prefix is the "key", tournamentId is separate)
            lsData.sessionData.push({
              tournamentId,
              key: prefix.slice(0, -1), // remove trailing _
              value,
            });
          }
          break;
        }
      }
    }

    // Thực hiện import vào SQLite
    const result = await window.electronAPI.db.importFromLocalStorage(lsData);
    if (result.success) {
      await window.electronAPI.db.markMigrationDone();
      console.log('[DB Migration] Hoàn thành! Đã migrate', lsData.tournaments.length, 'giải đấu.');
      
      // Xóa các key localStorage đã migrate (trừ license keys)
      localStorage.removeItem('karate_tournament_data');
      localStorage.removeItem('karate_auto_backup');
      localStorage.removeItem('karate_backup_history');
      for (const prefix of sessionPrefixes) {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const lsKey = localStorage.key(i);
          if (lsKey && lsKey.startsWith(prefix)) keysToRemove.push(lsKey);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
    } else {
      console.error('[DB Migration] Lỗi:', result.error);
    }
  } catch (error) {
    console.error('[DB Migration] Exception:', error);
  }
}

// ====================================================
// DATA SIZE INFO
// ====================================================

export async function dbGetDataSizeInfo() {
  if (isElectron()) {
    try {
      const stats = await window.electronAPI.db.getDataStats();
      const totalSize = stats.tSize + stats.abSize;
      return {
        dataSize: stats.tSize,
        dataSizeFormatted: formatBytes(stats.tSize),
        autoBackupSize: stats.abSize,
        autoBackupSizeFormatted: formatBytes(stats.abSize),
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
      };
    } catch {}
  }
  // Fallback
  const d = localStorage.getItem('karate_tournament_data');
  const ab = localStorage.getItem('karate_auto_backup');
  return {
    dataSize: d ? d.length : 0,
    dataSizeFormatted: formatBytes(d ? d.length : 0),
    autoBackupSize: ab ? ab.length : 0,
    autoBackupSizeFormatted: formatBytes(ab ? ab.length : 0),
    totalSize: (d ? d.length : 0) + (ab ? ab.length : 0),
    totalSizeFormatted: formatBytes((d ? d.length : 0) + (ab ? ab.length : 0)),
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
