/**
 * database.cjs - SQLite Database Service (Electron Main Process)
 * Thay thế toàn bộ localStorage cho dữ liệu giải đấu, backup, coach session.
 * License data vẫn giữ nguyên trên VPS.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

/**
 * Khởi tạo database, tạo các bảng nếu chưa có
 */
function initDatabase(userDataPath) {
  const dbDir = path.join(userDataPath, 'database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, 'karate_manager.db');
  db = new Database(dbPath);

  // Bật WAL mode để performance tốt hơn
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  console.log('[DB] Database initialized at:', dbPath);
  return dbPath;
}

/**
 * Tạo các bảng cần thiết
 */
function createTables() {
  // Bảng lưu dữ liệu giải đấu chính (JSON blob)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Bảng settings (machine_id, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Bảng auto-backup history
  db.exec(`
    CREATE TABLE IF NOT EXISTS auto_backups (
      id TEXT PRIMARY KEY,
      reason TEXT,
      data TEXT NOT NULL,
      size INTEGER,
      created_at TEXT NOT NULL
    );
  `);

  // Bảng manual backup history (chỉ lưu metadata, không lưu data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS backup_history (
      id TEXT PRIMARY KEY,
      file_name TEXT,
      description TEXT,
      machine_id TEXT,
      tournament_count INTEGER,
      data_size INTEGER,
      type TEXT DEFAULT 'manual',
      created_at TEXT NOT NULL
    );
  `);

  // Bảng session data cho Coach & Secretary (lưu theo tournamentId)
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_data (
      tournament_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tournament_id, key)
    );
  `);
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

const now = () => new Date().toISOString();

// ====================================================
// TOURNAMENT OPERATIONS
// ====================================================

function getAllTournaments() {
  const rows = getDb().prepare('SELECT id, data FROM tournaments ORDER BY created_at DESC').all();
  return rows.map(row => JSON.parse(row.data));
}

function saveTournaments(tournaments) {
  const upsert = getDb().prepare(`
    INSERT INTO tournaments (id, name, data, created_at, updated_at)
    VALUES (@id, @name, @data, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      data = excluded.data,
      updated_at = excluded.updated_at
  `);

  const deleteMissing = getDb().prepare('DELETE FROM tournaments WHERE id NOT IN (SELECT value FROM json_each(?))');

  const transaction = getDb().transaction((tournamentList) => {
    const n = now();
    for (const t of tournamentList) {
      upsert.run({
        id: t.id,
        name: t.name || '',
        data: JSON.stringify(t),
        created_at: t.createdAt || n,
        updated_at: n,
      });
    }
    // Xóa các tournament không còn tồn tại
    const ids = JSON.stringify(tournamentList.map(t => t.id));
    deleteMissing.run(ids);
  });

  transaction(tournaments);
  return true;
}

function deleteTournament(id) {
  getDb().prepare('DELETE FROM tournaments WHERE id = ?').run(id);
  return true;
}

// ====================================================
// SETTINGS OPERATIONS
// ====================================================

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  getDb().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now());
  return true;
}

function deleteSetting(key) {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
  return true;
}

// ====================================================
// AUTO-BACKUP OPERATIONS
// ====================================================

function saveAutoBackup(id, reason, data, size) {
  const MAX_AUTO_BACKUPS = 10;
  const insert = getDb().prepare(`
    INSERT OR REPLACE INTO auto_backups (id, reason, data, size, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  insert.run(id, reason, data, size, now());

  // Xóa cũ nếu vượt quá MAX
  const deleteOld = getDb().prepare(`
    DELETE FROM auto_backups WHERE id NOT IN (
      SELECT id FROM auto_backups ORDER BY created_at DESC LIMIT ?
    )
  `);
  deleteOld.run(MAX_AUTO_BACKUPS);
  return true;
}

function getAutoBackups() {
  const rows = getDb().prepare('SELECT * FROM auto_backups ORDER BY created_at DESC').all();
  return rows.map(row => ({
    id: row.id,
    reason: row.reason,
    data: row.data,
    size: row.size,
    timestamp: row.created_at,
  }));
}

function getAutoBackupById(id) {
  const row = getDb().prepare('SELECT * FROM auto_backups WHERE id = ?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    reason: row.reason,
    data: row.data,
    size: row.size,
    timestamp: row.created_at,
  };
}

// ====================================================
// BACKUP HISTORY OPERATIONS
// ====================================================

function saveBackupHistory(meta) {
  const MAX_HISTORY = 50;
  const insert = getDb().prepare(`
    INSERT OR REPLACE INTO backup_history (id, file_name, description, machine_id, tournament_count, data_size, type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    meta.id || Date.now().toString(36),
    meta.fileName || '',
    meta.description || '',
    meta.machineId || '',
    meta.tournamentCount || 0,
    meta.dataSize || 0,
    meta.type || 'manual',
    meta.createdAt || now()
  );

  // Giữ tối đa 50 records
  getDb().prepare(`
    DELETE FROM backup_history WHERE id NOT IN (
      SELECT id FROM backup_history ORDER BY created_at DESC LIMIT ?
    )
  `).run(MAX_HISTORY);
  return true;
}

function getBackupHistory() {
  const rows = getDb().prepare('SELECT * FROM backup_history ORDER BY created_at DESC').all();
  return rows.map(row => ({
    id: row.id,
    fileName: row.file_name,
    description: row.description,
    machineId: row.machine_id,
    tournamentCount: row.tournament_count,
    dataSize: row.data_size,
    type: row.type,
    createdAt: row.created_at,
  }));
}

// ====================================================
// SESSION DATA (Coach / Secretary)
// ====================================================

function getSessionData(tournamentId, key) {
  const row = getDb().prepare(
    'SELECT value FROM session_data WHERE tournament_id = ? AND key = ?'
  ).get(tournamentId, key);
  return row ? row.value : null;
}

function setSessionData(tournamentId, key, value) {
  getDb().prepare(`
    INSERT INTO session_data (tournament_id, key, value, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(tournament_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(tournamentId, key, value, now());
  return true;
}

function deleteSessionData(tournamentId, key) {
  getDb().prepare(
    'DELETE FROM session_data WHERE tournament_id = ? AND key = ?'
  ).run(tournamentId, key);
  return true;
}

// ====================================================
// MIGRATION: Import từ localStorage data
// ====================================================

function importFromLocalStorage(lsData) {
  try {
    // lsData: { tournaments, settings, autoBackups, backupHistory, sessionData }
    const transaction = getDb().transaction(() => {
      const n = now();

      // Import tournaments
      if (lsData.tournaments && Array.isArray(lsData.tournaments)) {
        const upsert = getDb().prepare(`
          INSERT INTO tournaments (id, name, data, created_at, updated_at)
          VALUES (@id, @name, @data, @created_at, @updated_at)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at
        `);
        for (const t of lsData.tournaments) {
          upsert.run({
            id: t.id,
            name: t.name || '',
            data: JSON.stringify(t),
            created_at: t.createdAt || n,
            updated_at: n,
          });
        }
      }

      // Import settings
      if (lsData.settings) {
        const upsertSetting = getDb().prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `);
        for (const [key, value] of Object.entries(lsData.settings)) {
          upsertSetting.run(key, value, n);
        }
      }

      // Import auto backups
      if (lsData.autoBackups && Array.isArray(lsData.autoBackups)) {
        const insertAB = getDb().prepare(`
          INSERT OR IGNORE INTO auto_backups (id, reason, data, size, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const ab of lsData.autoBackups) {
          insertAB.run(ab.id, ab.reason, ab.data, ab.size, ab.timestamp || n);
        }
      }

      // Import backup history
      if (lsData.backupHistory && Array.isArray(lsData.backupHistory)) {
        const insertBH = getDb().prepare(`
          INSERT OR IGNORE INTO backup_history (id, file_name, description, machine_id, tournament_count, data_size, type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const bh of lsData.backupHistory) {
          insertBH.run(
            bh.id, bh.fileName || '', bh.description || '',
            bh.machineId || '', bh.tournamentCount || 0,
            bh.dataSize || 0, bh.type || 'manual', bh.createdAt || n
          );
        }
      }

      // Import session data
      if (lsData.sessionData && Array.isArray(lsData.sessionData)) {
        const insertSD = getDb().prepare(`
          INSERT INTO session_data (tournament_id, key, value, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(tournament_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `);
        for (const sd of lsData.sessionData) {
          insertSD.run(sd.tournamentId, sd.key, sd.value, n);
        }
      }
    });

    transaction();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Đánh dấu migration đã hoàn thành
 */
function markMigrationDone() {
  setSetting('ls_migration_done', 'true');
}

function isMigrationDone() {
  return getSetting('ls_migration_done') === 'true';
}

/**
 * Stats cho getDataSizeInfo
 */
function getDataStats() {
  const tCount = getDb().prepare('SELECT COUNT(*) as cnt FROM tournaments').get().cnt;
  const tSize = getDb().prepare("SELECT SUM(LENGTH(data)) as total FROM tournaments").get().total || 0;
  const abCount = getDb().prepare('SELECT COUNT(*) as cnt FROM auto_backups').get().cnt;
  const abSize = getDb().prepare("SELECT SUM(LENGTH(data)) as total FROM auto_backups").get().total || 0;
  return { tCount, tSize, abCount, abSize };
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  closeDatabase,
  // Tournaments
  getAllTournaments,
  saveTournaments,
  deleteTournament,
  // Settings
  getSetting,
  setSetting,
  deleteSetting,
  // Auto backups
  saveAutoBackup,
  getAutoBackups,
  getAutoBackupById,
  // Backup history
  saveBackupHistory,
  getBackupHistory,
  // Session data
  getSessionData,
  setSessionData,
  deleteSessionData,
  // Migration
  importFromLocalStorage,
  markMigrationDone,
  isMigrationDone,
  // Stats
  getDataStats,
};
