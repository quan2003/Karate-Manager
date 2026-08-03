/**
 * Backup Service - Quản lý backup/restore dữ liệu giải đấu
 * 
 * Chức năng:
 * - Xuất backup toàn bộ dữ liệu (tournaments + settings) ra file .kbackup
 * - Restore dữ liệu từ file backup
 * - Auto-backup trước mỗi thay đổi quan trọng
 * - Quản lý lịch sử backup
 * - Hỗ trợ merge dữ liệu khi nhiều Admin quản lý cùng giải
 * 
 * ⚠️ Đã migrate sang SQLite - không còn dùng localStorage cho backup data
 */

import {
  dbGetTournaments,
  dbSaveTournaments,
  dbGetMachineId,
  dbSaveAutoBackup,
  dbGetAutoBackups,
  dbGetAutoBackupById,
  dbSaveBackupHistory,
  dbGetBackupHistory,
  dbGetDataSizeInfo,
} from './dbService.js';

/**
 * Tạo metadata cho backup
 */
async function createBackupMeta(description = "") {
  return {
    version: "1.0.0",
    appVersion: "1.0.1",
    createdAt: new Date().toISOString(),
    description: description || `Backup lúc ${new Date().toLocaleString("vi-VN")}`,
    machineId: await dbGetMachineId(),
    dataSize: 0,
  };
}

/**
 * Tạo backup data object
 */
export async function createBackupData(description = "", tournamentId = null) {
  try {
    const allTournaments = await dbGetTournaments();
    const tournaments = tournamentId
      ? allTournaments.filter((tournament) => tournament.id === tournamentId)
      : allTournaments;
    if (!tournaments || tournaments.length === 0) {
      return { success: false, error: "Không có dữ liệu để backup" };
    }

    const meta = await createBackupMeta(description);
    const dataObj = { tournaments };
    const rawData = JSON.stringify(dataObj);

    const backupData = {
      _type: "karate_backup",
      meta: {
        ...meta,
        dataSize: rawData.length,
        tournamentCount: tournaments.length,
        backupScope: tournamentId ? "single" : "all",
        tournamentId: tournamentId || null,
        tournamentName: tournamentId ? tournaments[0]?.name || "" : null,
      },
      data: dataObj,
    };

    return { success: true, data: backupData };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Xuất backup ra file .kbackup
 */
export async function exportBackup(description = "", tournamentId = null) {
  const result = await createBackupData(description, tournamentId);
  if (!result.success) {
    return result;
  }

  const jsonString = JSON.stringify(result.data, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeTournamentName = result.data.meta.tournamentName
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  const suggestedName = tournamentId
    ? `karate_${safeTournamentName || "tournament"}_${timestamp}.kbackup`
    : `karate_backup_all_${timestamp}.kbackup`;

  try {
    // Electron mode
    if (window.electronAPI?.saveExportFile) {
      const saveResult = await window.electronAPI.saveExportFile(
        jsonString,
        suggestedName,
        "kbackup"
      );
      if (saveResult.success) {
        await dbSaveBackupHistory({
          ...result.data.meta,
          fileName: suggestedName,
          type: "manual",
        });
        return { success: true, fileName: suggestedName };
      } else if (saveResult.canceled) {
        return { success: false, canceled: true };
      } else {
        return { success: false, error: saveResult.error };
      }
    }

    // Browser fallback
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await dbSaveBackupHistory({
      ...result.data.meta,
      fileName: suggestedName,
      type: "manual",
    });

    return { success: true, fileName: suggestedName };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Parse và validate file backup
 */
export function parseBackupFile(content) {
  try {
    let data;
    if (typeof content === "string") {
      data = JSON.parse(content);
    } else {
      data = content;
    }

    // Validate structure
    if (!data._type || data._type !== "karate_backup") {
      // Có thể là file backup cũ (chỉ chứa tournaments trực tiếp)
      if (data.tournaments && Array.isArray(data.tournaments)) {
        return {
          success: true,
          data: {
            _type: "karate_backup",
            meta: {
              version: "legacy",
              createdAt: new Date().toISOString(),
              description: "File backup định dạng cũ",
              tournamentCount: data.tournaments.length,
            },
            data: data,
          },
          isLegacy: true,
        };
      }
      return { success: false, error: "File không phải là file backup hợp lệ" };
    }

    if (!data.data || !data.data.tournaments) {
      return { success: false, error: "File backup bị hỏng hoặc thiếu dữ liệu" };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: "Không thể đọc file: " + error.message };
  }
}

/**
 * Import backup file (đọc file từ input)
 */
export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseBackupFile(e.target.result);
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Không thể đọc file"));
    reader.readAsText(file);
  });
}

/**
 * So sánh dữ liệu backup với dữ liệu hiện tại
 */
export async function compareBackupWithCurrent(backupData) {
  try {
    const currentTournaments = await dbGetTournaments();
    const backupTournaments = backupData.data.tournaments || [];

    const result = {
      backup: {
        tournamentCount: backupTournaments.length,
        totalCategories: 0,
        totalAthletes: 0,
        drawnCategories: 0,
      },
      current: {
        tournamentCount: currentTournaments.length,
        totalCategories: 0,
        totalAthletes: 0,
        drawnCategories: 0,
      },
      conflicts: [],
      newInBackup: [],
      newInCurrent: [],
      identical: [],
    };

    // Count stats
    for (const t of backupTournaments) {
      result.backup.totalCategories += t.categories?.length || 0;
      for (const c of (t.categories || [])) {
        result.backup.totalAthletes += c.athletes?.length || 0;
        if (c.bracket) result.backup.drawnCategories++;
      }
    }

    for (const t of currentTournaments) {
      result.current.totalCategories += t.categories?.length || 0;
      for (const c of (t.categories || [])) {
        result.current.totalAthletes += c.athletes?.length || 0;
        if (c.bracket) result.current.drawnCategories++;
      }
    }

    // Compare tournaments
    const backupIds = new Set(backupTournaments.map((t) => t.id));
    const currentIds = new Set(currentTournaments.map((t) => t.id));

    for (const bt of backupTournaments) {
      if (!currentIds.has(bt.id)) {
        result.newInBackup.push({
          id: bt.id,
          name: bt.name,
          categories: bt.categories?.length || 0,
          athletes: (bt.categories || []).reduce((sum, c) => sum + (c.athletes?.length || 0), 0),
        });
      } else {
        const ct = currentTournaments.find((t) => t.id === bt.id);
        const backupCatCount = bt.categories?.length || 0;
        const currentCatCount = ct.categories?.length || 0;
        const backupAthletes = (bt.categories || []).reduce((sum, c) => sum + (c.athletes?.length || 0), 0);
        const currentAthletes = (ct.categories || []).reduce((sum, c) => sum + (c.athletes?.length || 0), 0);

        if (backupCatCount !== currentCatCount || backupAthletes !== currentAthletes) {
          result.conflicts.push({
            id: bt.id,
            name: bt.name,
            backupCategories: backupCatCount,
            currentCategories: currentCatCount,
            backupAthletes,
            currentAthletes,
          });
        } else {
          result.identical.push({ id: bt.id, name: bt.name });
        }
      }
    }

    for (const ct of currentTournaments) {
      if (!backupIds.has(ct.id)) {
        result.newInCurrent.push({
          id: ct.id,
          name: ct.name,
          categories: ct.categories?.length || 0,
        });
      }
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Restore dữ liệu từ backup
 * @param {Object} backupData - Dữ liệu backup đã parse
 * @param {string} mode - 'replace' | 'merge'
 */
export async function restoreBackup(backupData, mode = "replace") {
  try {
    // Auto-backup trước khi restore
    await createAutoBackup("Trước khi restore backup");

    if (mode === "replace") {
      await dbSaveTournaments(backupData.data.tournaments || []);
      return {
        success: true,
        message: `Đã khôi phục ${backupData.data.tournaments?.length || 0} giải đấu`,
        tournamentCount: backupData.data.tournaments?.length || 0,
      };
    }

    if (mode === "merge") {
      return await mergeBackupData(backupData);
    }

    return { success: false, error: "Chế độ restore không hợp lệ" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Merge (gộp) dữ liệu backup với dữ liệu hiện tại
 */
export async function restoreSingleTournament(backupData, mode = "add") {
  try {
    const backupTournaments = backupData?.data?.tournaments || [];
    if (backupTournaments.length !== 1) {
      return { success: false, error: "File backup phải chứa đúng một giải đấu" };
    }

    await createAutoBackup("Trước khi nhập một giải đấu");

    const sourceTournament = backupTournaments[0];
    const currentTournaments = await dbGetTournaments();
    const existingIndex = currentTournaments.findIndex(
      (tournament) => tournament.id === sourceTournament.id,
    );

    if (mode === "add") {
      if (existingIndex >= 0) {
        return {
          success: false,
          error: "Giải đấu này đã tồn tại. Hãy chọn Ghi đè hoặc Tạo bản sao.",
        };
      }
      await dbSaveTournaments([...currentTournaments, sourceTournament]);
      return {
        success: true,
        message: `Đã thêm giải "${sourceTournament.name}"`,
        tournamentId: sourceTournament.id,
      };
    }

    if (mode === "overwrite") {
      const updatedTournaments = [...currentTournaments];
      if (existingIndex >= 0) {
        updatedTournaments[existingIndex] = sourceTournament;
      } else {
        updatedTournaments.push(sourceTournament);
      }
      await dbSaveTournaments(updatedTournaments);
      return {
        success: true,
        message: `Đã cập nhật giải "${sourceTournament.name}"`,
        tournamentId: sourceTournament.id,
      };
    }

    if (mode === "copy") {
      const copyId =
        globalThis.crypto?.randomUUID?.() ||
        `tournament_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tournamentCopy = {
        ...sourceTournament,
        id: copyId,
        name: `${sourceTournament.name} (Bản sao)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await dbSaveTournaments([...currentTournaments, tournamentCopy]);
      return {
        success: true,
        message: `Đã tạo bản sao "${tournamentCopy.name}"`,
        tournamentId: copyId,
      };
    }

    return { success: false, error: "Chế độ nhập giải không hợp lệ" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Merge (gộp) dữ liệu backup với dữ liệu hiện tại
 */
async function mergeBackupData(backupData) {
  try {
    const currentTournaments = await dbGetTournaments();
    const backupTournaments = backupData.data.tournaments || [];

    const mergedMap = new Map();
    let addedCount = 0;
    let updatedCount = 0;
    let keptCount = 0;

    // Add all current tournaments first
    for (const ct of currentTournaments) {
      mergedMap.set(ct.id, ct);
    }

    // Process backup tournaments
    for (const bt of backupTournaments) {
      if (!mergedMap.has(bt.id)) {
        mergedMap.set(bt.id, bt);
        addedCount++;
      } else {
        const ct = mergedMap.get(bt.id);
        const backupScore = calculateDataScore(bt);
        const currentScore = calculateDataScore(ct);

        if (backupScore > currentScore) {
          mergedMap.set(bt.id, bt);
          updatedCount++;
        } else {
          keptCount++;
        }
      }
    }

    const mergedTournaments = Array.from(mergedMap.values());
    await dbSaveTournaments(mergedTournaments);

    return {
      success: true,
      message: `Gộp dữ liệu thành công: +${addedCount} mới, ${updatedCount} cập nhật, ${keptCount} giữ nguyên`,
      stats: { addedCount, updatedCount, keptCount, total: mergedMap.size },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Tính điểm "hoàn thiện" của dữ liệu giải đấu
 */
function calculateDataScore(tournament) {
  let score = 0;
  const categories = tournament.categories || [];
  score += categories.length * 10;

  for (const cat of categories) {
    score += (cat.athletes?.length || 0) * 2;
    if (cat.bracket) {
      score += 50;
      const matches = cat.bracket.matches || [];
      score += matches.filter((m) => m.winner).length * 5;
    }
  }

  if (tournament.schedule) score += 20;

  return score;
}

/**
 * Auto-backup vào SQLite (không xuất file)
 */
export async function createAutoBackup(reason = "") {
  try {
    const tournaments = await dbGetTournaments();
    if (!tournaments || tournaments.length === 0) return;

    const rawData = JSON.stringify({ tournaments });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    await dbSaveAutoBackup(id, reason || "Auto-backup", rawData, rawData.length);
    return true;
  } catch (error) {
    console.error("Auto-backup failed:", error);
    return false;
  }
}

/**
 * Create and verify a snapshot before an explicitly approved schema migration.
 * This function does not run a migration or advance a schema version.
 */
export async function createVerifiedMigrationBackup(migrationName) {
  try {
    if (!migrationName || typeof migrationName !== "string") {
      return { success: false, error: "migrationName is required" };
    }

    const tournaments = await dbGetTournaments();
    const rawData = JSON.stringify({ tournaments: tournaments || [] });
    const id = `migration_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const reason = `Before migration: ${migrationName}`;

    await dbSaveAutoBackup(id, reason, rawData, rawData.length);
    const saved = await dbGetAutoBackupById(id);

    if (!saved || saved.data !== rawData || saved.size !== rawData.length) {
      return { success: false, error: "Migration backup verification failed" };
    }

    JSON.parse(saved.data);
    return {
      success: true,
      backupId: id,
      tournamentCount: tournaments?.length || 0,
      size: rawData.length,
    };
  } catch (error) {
    console.error("Migration backup failed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Lấy danh sách auto-backup
 */
export async function getAutoBackupHistory() {
  try {
    return await dbGetAutoBackups();
  } catch {
    return [];
  }
}

/**
 * Restore từ auto-backup
 */
export async function restoreFromAutoBackup(backupId) {
  try {
    const entry = await dbGetAutoBackupById(backupId);
    if (!entry) {
      return { success: false, error: "Không tìm thấy bản backup" };
    }

    // Backup current state first
    await createAutoBackup("Trước khi restore auto-backup");

    const parsed = JSON.parse(entry.data);
    await dbSaveTournaments(parsed.tournaments || []);

    return {
      success: true,
      message: `Đã khôi phục dữ liệu từ ${new Date(entry.timestamp).toLocaleString("vi-VN")}`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Lấy lịch sử backup thủ công
 */
export async function getBackupHistory() {
  try {
    return await dbGetBackupHistory();
  } catch {
    return [];
  }
}

/**
 * Tính dung lượng dữ liệu hiện tại
 */
export async function getDataSizeInfo() {
  return await dbGetDataSizeInfo();
}
