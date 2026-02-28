/**
 * Backup Service - Quản lý backup/restore dữ liệu giải đấu
 * 
 * Chức năng:
 * - Xuất backup toàn bộ dữ liệu (tournaments + settings) ra file .kbackup
 * - Restore dữ liệu từ file backup
 * - Auto-backup trước mỗi thay đổi quan trọng
 * - Quản lý lịch sử backup
 * - Hỗ trợ merge dữ liệu khi nhiều Admin quản lý cùng giải
 */

const STORAGE_KEY = "karate_tournament_data";
const BACKUP_HISTORY_KEY = "karate_backup_history";
const AUTO_BACKUP_KEY = "karate_auto_backup";
const MAX_AUTO_BACKUPS = 10;

/**
 * Tạo metadata cho backup
 */
function createBackupMeta(description = "") {
  return {
    version: "1.0.0",
    appVersion: "1.0.1",
    createdAt: new Date().toISOString(),
    description: description || `Backup lúc ${new Date().toLocaleString("vi-VN")}`,
    machineId: getMachineId(),
    dataSize: 0,
  };
}

/**
 * Lấy machine ID (để phân biệt máy khi merge)
 */
function getMachineId() {
  let id = localStorage.getItem("krt_machine_id");
  if (!id) {
    id = "machine_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("krt_machine_id", id);
  }
  return id;
}

/**
 * Tạo backup data object
 */
export function createBackupData(description = "") {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) {
      return { success: false, error: "Không có dữ liệu để backup" };
    }

    const tournaments = JSON.parse(rawData);
    const meta = createBackupMeta(description);
    
    const backupData = {
      _type: "karate_backup",
      meta: {
        ...meta,
        dataSize: rawData.length,
        tournamentCount: tournaments.tournaments?.length || 0,
      },
      data: tournaments,
    };

    return { success: true, data: backupData };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Xuất backup ra file .kbackup
 */
export async function exportBackup(description = "") {
  const result = createBackupData(description);
  if (!result.success) {
    return result;
  }

  const jsonString = JSON.stringify(result.data, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const suggestedName = `karate_backup_${timestamp}.kbackup`;

  try {
    // Electron mode
    if (window.electronAPI?.saveExportFile) {
      const saveResult = await window.electronAPI.saveExportFile(
        jsonString,
        suggestedName,
        "kbackup"
      );
      if (saveResult.success) {
        saveBackupHistory({ 
          ...result.data.meta, 
          fileName: suggestedName,
          type: "manual" 
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
    
    saveBackupHistory({ 
      ...result.data.meta, 
      fileName: suggestedName,
      type: "manual" 
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
 * Trả về thông tin diff để user quyết định
 */
export function compareBackupWithCurrent(backupData) {
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    const currentData = currentRaw ? JSON.parse(currentRaw) : { tournaments: [] };
    const backupTournaments = backupData.data.tournaments || [];
    const currentTournaments = currentData.tournaments || [];

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
      conflicts: [],      // Giải đấu cùng ID, khác dữ liệu
      newInBackup: [],     // Giải đấu mới chỉ có trong backup
      newInCurrent: [],    // Giải đấu mới chỉ có ở máy hiện tại
      identical: [],       // Giải đấu giống nhau
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
  } catch (error) {
    return null;
  }
}

/**
 * Restore dữ liệu từ backup
 * @param {Object} backupData - Dữ liệu backup đã parse
 * @param {string} mode - 'replace' | 'merge'
 *   - replace: Thay thế toàn bộ dữ liệu hiện tại
 *   - merge: Gộp dữ liệu (giữ lại cả hai, ưu tiên dữ liệu mới hơn)
 */
export function restoreBackup(backupData, mode = "replace") {
  try {
    // Auto-backup trước khi restore
    createAutoBackup("Trước khi restore backup");

    if (mode === "replace") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(backupData.data));
      return { 
        success: true, 
        message: `Đã khôi phục ${backupData.data.tournaments?.length || 0} giải đấu`,
        tournamentCount: backupData.data.tournaments?.length || 0,
      };
    }

    if (mode === "merge") {
      return mergeBackupData(backupData);
    }

    return { success: false, error: "Chế độ restore không hợp lệ" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Merge (gộp) dữ liệu backup với dữ liệu hiện tại
 * - Giải đấu mới trong backup → thêm vào
 * - Giải đấu trùng ID → giữ bản có nhiều dữ liệu hơn (nhiều VĐV, nhiều bracket hơn)
 * - Giải đấu chỉ có ở current → giữ nguyên
 */
function mergeBackupData(backupData) {
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    const currentData = currentRaw ? JSON.parse(currentRaw) : { tournaments: [] };
    const backupTournaments = backupData.data.tournaments || [];
    const currentTournaments = currentData.tournaments || [];

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
        // Mới hoàn toàn → thêm
        mergedMap.set(bt.id, bt);
        addedCount++;
      } else {
        const ct = mergedMap.get(bt.id);
        // So sánh: giải nào có nhiều dữ liệu hơn thì giữ
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

    const mergedData = {
      tournaments: Array.from(mergedMap.values()),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedData));

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
 * Giải nào có nhiều VĐV, nhiều bracket, nhiều kết quả hơn thì điểm cao hơn
 */
function calculateDataScore(tournament) {
  let score = 0;
  const categories = tournament.categories || [];
  score += categories.length * 10;
  
  for (const cat of categories) {
    score += (cat.athletes?.length || 0) * 2;
    if (cat.bracket) {
      score += 50;
      // Đếm số trận có kết quả
      const matches = cat.bracket.matches || [];
      score += matches.filter((m) => m.winner).length * 5;
    }
  }

  if (tournament.schedule) score += 20;
  
  return score;
}

/**
 * Auto-backup vào localStorage (không xuất file)
 */
export function createAutoBackup(reason = "") {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) return;

    const history = getAutoBackupHistory();
    
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      reason: reason || "Auto-backup",
      data: rawData,
      size: rawData.length,
    };

    history.unshift(entry);
    
    // Giữ tối đa MAX_AUTO_BACKUPS bản
    while (history.length > MAX_AUTO_BACKUPS) {
      history.pop();
    }

    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    console.error("Auto-backup failed:", error);
    return false;
  }
}

/**
 * Lấy danh sách auto-backup
 */
export function getAutoBackupHistory() {
  try {
    const data = localStorage.getItem(AUTO_BACKUP_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Restore từ auto-backup
 */
export function restoreFromAutoBackup(backupId) {
  try {
    const history = getAutoBackupHistory();
    const entry = history.find((h) => h.id === backupId);
    if (!entry) {
      return { success: false, error: "Không tìm thấy bản backup" };
    }

    // Backup current state first
    createAutoBackup("Trước khi restore auto-backup");

    localStorage.setItem(STORAGE_KEY, entry.data);
    return { 
      success: true, 
      message: `Đã khôi phục dữ liệu từ ${new Date(entry.timestamp).toLocaleString("vi-VN")}` 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Lưu lịch sử backup thủ công
 */
function saveBackupHistory(meta) {
  try {
    const history = getBackupHistory();
    history.unshift({
      ...meta,
      id: Date.now().toString(36),
    });
    // Giữ tối đa 50 records
    while (history.length > 50) {
      history.pop();
    }
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error("Failed to save backup history:", error);
  }
}

/**
 * Lấy lịch sử backup thủ công
 */
export function getBackupHistory() {
  try {
    const data = localStorage.getItem(BACKUP_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Tính dung lượng dữ liệu hiện tại
 */
export function getDataSizeInfo() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    const autoBackups = localStorage.getItem(AUTO_BACKUP_KEY);
    
    return {
      dataSize: rawData ? rawData.length : 0,
      dataSizeFormatted: formatBytes(rawData ? rawData.length : 0),
      autoBackupSize: autoBackups ? autoBackups.length : 0,
      autoBackupSizeFormatted: formatBytes(autoBackups ? autoBackups.length : 0),
      totalSize: (rawData ? rawData.length : 0) + (autoBackups ? autoBackups.length : 0),
      totalSizeFormatted: formatBytes(
        (rawData ? rawData.length : 0) + (autoBackups ? autoBackups.length : 0)
      ),
    };
  } catch {
    return {
      dataSize: 0,
      dataSizeFormatted: "0 B",
      autoBackupSize: 0,
      autoBackupSizeFormatted: "0 B",
      totalSize: 0,
      totalSizeFormatted: "0 B",
    };
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
