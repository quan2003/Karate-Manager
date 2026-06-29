import { useState, useRef, useEffect } from "react";
import {
  exportBackup,
  readBackupFile,
  compareBackupWithCurrent,
  restoreBackup,
  restoreSingleTournament,
  getAutoBackupHistory,
  restoreFromAutoBackup,
  getDataSizeInfo,
  createAutoBackup,
} from "../../services/backupService";
import "./BackupManager.css";

/**
 * BackupManager - Giao diện quản lý backup/restore dữ liệu
 * Hỗ trợ nhiều Admin quản lý cùng giải đấu
 */
export default function BackupManager({ isOpen, onClose, onDataRestored }) {
  const [view, setView] = useState("main"); // main | export | import | compare | history
  const [status, setStatus] = useState(null); // { type: 'success'|'error'|'info', message }
  const [description, setDescription] = useState("");
  const [backupData, setBackupData] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [autoBackups, setAutoBackups] = useState([]);
  const [dataInfo, setDataInfo] = useState(null);
  const [tournamentCount, setTournamentCount] = useState(0);
  const [tournaments, setTournaments] = useState([]);
  const [exportScope, setExportScope] = useState("all");
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setView("main");
      setStatus(null);
      setBackupData(null);
      setComparison(null);
      setExportScope("all");
      setSelectedTournamentId("");
      refreshInfo();
    }
  }, [isOpen]);

  const refreshInfo = async () => {
    const info = await getDataSizeInfo();
    setDataInfo(info);
    const backups = await getAutoBackupHistory();
    setAutoBackups(backups);
    // Đếm số giải đấu từ backup service
    try {
      const { createBackupData } = await import("../../services/backupService");
      const bd = await createBackupData();
      const availableTournaments = bd.data?.data?.tournaments || [];
      setTournaments(availableTournaments);
      setTournamentCount(availableTournaments.length);
    } catch { setTournamentCount(0); }
  };

  const showStatus = (type, message) => {
    setStatus({ type, message });
    if (type === "success") {
      setTimeout(() => setStatus(null), 5000);
    }
  };

  // ====== EXPORT ======
  const handleExport = async () => {
    showStatus("info", "⏳ Đang tạo file backup...");
    const tournamentId = exportScope === "single" ? selectedTournamentId : null;
    if (exportScope === "single" && !tournamentId) {
      showStatus("error", "Vui lòng chọn giải đấu cần xuất");
      return;
    }
    const result = await exportBackup(description || undefined, tournamentId);
    if (result.success) {
      showStatus("success", `✅ Đã xuất backup: ${result.fileName}`);
      setDescription("");
      refreshInfo();
    } else if (!result.canceled) {
      showStatus("error", `❌ ${result.error}`);
    } else {
      setStatus(null);
    }
  };

  // ====== IMPORT ======
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showStatus("info", "⏳ Đang đọc file backup...");
      const result = await readBackupFile(file);

      if (!result.success) {
        showStatus("error", `❌ ${result.error}`);
        return;
      }

      setBackupData(result.data);
      showStatus("info", "⏳ Đang so sánh dữ liệu...");
      const comp = await compareBackupWithCurrent(result.data);
      setComparison(comp);
      setView("compare");
      setStatus(null);
    } catch (error) {
      showStatus("error", `❌ ${error.message}`);
    }

    e.target.value = "";
  };

  // ====== RESTORE ======
  const handleRestore = async (mode) => {
    if (!backupData) return;

    const confirmMsg = mode === "replace"
      ? "⚠️ Thay thế toàn bộ dữ liệu hiện tại bằng backup?\nDữ liệu hiện tại sẽ được auto-backup trước khi thay thế."
      : "Gộp dữ liệu backup vào dữ liệu hiện tại?\nGiải đấu trùng sẽ giữ bản có nhiều dữ liệu hơn.";

    if (!window.confirm(confirmMsg)) return;

    showStatus("info", "⏳ Đang khôi phục dữ liệu...");
    const result = await restoreBackup(backupData, mode);
    if (result.success) {
      showStatus("success", `✅ ${result.message}`);
      setView("main");
      setBackupData(null);
      setComparison(null);
      setExportScope("all");
      setSelectedTournamentId("");
      refreshInfo();
      if (onDataRestored) {
        onDataRestored();
      }
    } else {
      showStatus("error", `❌ ${result.error}`);
    }
  };

  const handleSingleTournamentRestore = async (mode) => {
    if (!backupData || backupData.data?.tournaments?.length !== 1) return;

    const tournamentName = backupData.data.tournaments[0]?.name || "giải đấu";
    const messages = {
      add: `Thêm giải "${tournamentName}" vào máy này?`,
      overwrite: `Ghi đè dữ liệu của giải "${tournamentName}"? Các giải khác không bị ảnh hưởng.`,
      copy: `Tạo một bản sao mới của giải "${tournamentName}"?`,
    };
    if (!window.confirm(messages[mode])) return;

    showStatus("info", "⏳ Đang nhập giải đấu...");
    const result = await restoreSingleTournament(backupData, mode);
    if (result.success) {
      showStatus("success", `✅ ${result.message}`);
      setView("main");
      setBackupData(null);
      setComparison(null);
      refreshInfo();
      onDataRestored?.();
    } else {
      showStatus("error", `❌ ${result.error}`);
    }
  };
  // ====== AUTO-BACKUP RESTORE ======
  const handleAutoRestore = async (backupId) => {
    if (!window.confirm("Khôi phục dữ liệu từ bản auto-backup này?\nDữ liệu hiện tại sẽ được backup trước.")) {
      return;
    }

    showStatus("info", "⏳ Đang khôi phục...");
    const result = await restoreFromAutoBackup(backupId);
    if (result.success) {
      showStatus("success", `✅ ${result.message}`);
      refreshInfo();
      if (onDataRestored) {
        onDataRestored();
      }
    } else {
      showStatus("error", `❌ ${result.error}`);
    }
  };

  // ====== CREATE MANUAL AUTO-BACKUP ======
  const handleCreateCheckpoint = async () => {
    showStatus("info", "⏳ Đang tạo checkpoint...");
    await createAutoBackup("Checkpoint thủ công");
    showStatus("success", "✅ Đã tạo checkpoint backup");
    refreshInfo();
  };

  if (!isOpen) return null;

  return (
    <div className="backup-manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="backup-manager-panel">
        {/* Header */}
        <div className="backup-header">
          <div className="backup-header-left">
            <div className="backup-header-icon">💾</div>
            <div>
              <h2>Quản lý Backup</h2>
              <p>Sao lưu & đồng bộ dữ liệu giữa nhiều Admin</p>
            </div>
          </div>
          <button className="backup-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="backup-body">
          {/* Status Message */}
          {status && (
            <div className={`backup-status ${status.type}`}>
              {status.message}
            </div>
          )}

          {/* ===== MAIN VIEW ===== */}
          {view === "main" && (
            <>
              {/* Info Bar */}
              <div className="backup-info-bar">
                <div className="backup-info-item">
                  <span className="backup-info-value">{tournamentCount}</span>
                  <span className="backup-info-label">Giải đấu</span>
                </div>
                <div className="backup-info-item">
                  <span className="backup-info-value">{dataInfo?.dataSizeFormatted || "—"}</span>
                  <span className="backup-info-label">Dung lượng</span>
                </div>
                <div className="backup-info-item">
                  <span className="backup-info-value">{autoBackups.length}</span>
                  <span className="backup-info-label">Auto-backup</span>
                </div>
              </div>

              {/* Action Cards */}
              <div className="backup-actions-grid">
                <button className="backup-action-card export-card" onClick={() => setView("export")}>
                  <div className="backup-action-icon">📤</div>
                  <div className="backup-action-title">Xuất Backup</div>
                  <div className="backup-action-desc">Tạo file backup gửi cho Admin khác</div>
                </button>

                <button className="backup-action-card import-card" onClick={() => fileInputRef.current?.click()}>
                  <div className="backup-action-icon">📥</div>
                  <div className="backup-action-title">Nhập Backup</div>
                  <div className="backup-action-desc">Khôi phục từ file backup của Admin khác</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".kbackup,.json"
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                  />
                </button>

                <button className="backup-action-card merge-card" onClick={handleCreateCheckpoint}>
                  <div className="backup-action-icon">📌</div>
                  <div className="backup-action-title">Tạo Checkpoint</div>
                  <div className="backup-action-desc">Lưu trạng thái hiện tại để phục hồi sau</div>
                </button>

                <button className="backup-action-card history-card" onClick={() => { refreshInfo(); setView("history"); }}>
                  <div className="backup-action-icon">🕐</div>
                  <div className="backup-action-title">Lịch sử Backup</div>
                  <div className="backup-action-desc">Xem và khôi phục các bản backup cũ</div>
                </button>
              </div>

              {/* Quick tip */}
              <div style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "12px",
                padding: "14px 16px",
                fontSize: "0.82rem",
                color: "#1e40af",
                lineHeight: 1.6,
              }}>
                <strong>💡 Hướng dẫn đồng bộ nhiều Admin:</strong><br />
                1. Admin chính <b>xuất backup</b> gửi file cho Admin phụ<br />
                2. Admin phụ <b>nhập backup</b> → chọn <b>Gộp dữ liệu</b> để giữ cả hai<br />
                3. Sau khi làm xong, Admin phụ <b>xuất backup</b> gửi lại cho Admin chính
              </div>
            </>
          )}

          {/* ===== EXPORT VIEW ===== */}
          {view === "export" && (
            <>
              <button className="backup-back-btn" onClick={() => setView("main")}>
                ← Quay lại
              </button>
              <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>📤 Xuất file Backup</h3>
              <p style={{ color: "#64748b", fontSize: "0.88rem", marginBottom: "1rem", lineHeight: 1.6 }}>
                Chọn xuất toàn bộ các giải hoặc chỉ một giải cụ thể. File vẫn chứa đầy đủ hạng mục, VĐV,
                sơ đồ và lịch thi đấu của phạm vi đã chọn.
              </p>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontWeight: 700, fontSize: "0.86rem", marginBottom: "0.5rem" }}>
                  Phạm vi backup
                </label>
                <select
                  className="backup-desc-input"
                  value={exportScope}
                  onChange={(e) => {
                    setExportScope(e.target.value);
                    if (e.target.value === "all") setSelectedTournamentId("");
                  }}
                  style={{ marginBottom: exportScope === "single" ? "0.75rem" : 0 }}
                >
                  <option value="all">Toàn bộ {tournamentCount} giải trên máy</option>
                  <option value="single">Chỉ một giải đấu</option>
                </select>
                {exportScope === "single" && (
                  <select
                    className="backup-desc-input"
                    value={selectedTournamentId}
                    onChange={(e) => setSelectedTournamentId(e.target.value)}
                  >
                    <option value="">-- Chọn giải cần xuất --</option>
                    {tournaments.map((tournament) => (
                      <option key={tournament.id} value={tournament.id}>
                        {tournament.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <input
                type="text"
                className="backup-desc-input"
                placeholder="Ghi chú (VD: Backup sau khi nhập VĐV CLB Hà Nội)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button
                onClick={handleExport}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                  color: "#fff",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 15px rgba(59, 130, 246, 0.3)",
                  transition: "all 0.2s",
                  fontFamily: "inherit",
                }}
              >
                💾 Xuất file Backup (.kbackup)
              </button>
            </>
          )}

          {/* ===== COMPARE VIEW ===== */}
          {view === "compare" && comparison && (
            <>
              <button className="backup-back-btn" onClick={() => { setView("main"); setBackupData(null); setComparison(null); }}>
                ← Quay lại
              </button>
              <h3 style={{ marginBottom: "0.5rem", fontSize: "1.1rem" }}>📊 So sánh dữ liệu</h3>
              <p style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: "1rem" }}>
                {backupData?.meta?.description || "File backup"} • {backupData?.meta?.createdAt ? new Date(backupData.meta.createdAt).toLocaleString("vi-VN") : ""}
              </p>

              <div className="backup-compare">
                <h4>📋 Tổng quan so sánh</h4>
                <div className="compare-columns">
                  <div className="compare-col current">
                    <h5>💻 Máy hiện tại</h5>
                    <div className="compare-stat"><span>Giải đấu</span><span>{comparison.current.tournamentCount}</span></div>
                    <div className="compare-stat"><span>Hạng mục</span><span>{comparison.current.totalCategories}</span></div>
                    <div className="compare-stat"><span>VĐV</span><span>{comparison.current.totalAthletes}</span></div>
                    <div className="compare-stat"><span>Đã bốc thăm</span><span>{comparison.current.drawnCategories}</span></div>
                  </div>
                  <div className="compare-arrow">⇄</div>
                  <div className="compare-col backup">
                    <h5>📦 File backup</h5>
                    <div className="compare-stat"><span>Giải đấu</span><span>{comparison.backup.tournamentCount}</span></div>
                    <div className="compare-stat"><span>Hạng mục</span><span>{comparison.backup.totalCategories}</span></div>
                    <div className="compare-stat"><span>VĐV</span><span>{comparison.backup.totalAthletes}</span></div>
                    <div className="compare-stat"><span>Đã bốc thăm</span><span>{comparison.backup.drawnCategories}</span></div>
                  </div>
                </div>

                {/* Diff Details */}
                <div className="backup-diff-list">
                  {comparison.newInBackup.length > 0 && (
                    <div className="diff-section">
                      <div className="diff-section-title">🆕 Mới trong backup ({comparison.newInBackup.length})</div>
                      {comparison.newInBackup.map((t) => (
                        <div key={t.id} className="diff-item new">
                          ➕ {t.name} ({t.categories} hạng mục, {t.athletes} VĐV)
                        </div>
                      ))}
                    </div>
                  )}
                  {comparison.conflicts.length > 0 && (
                    <div className="diff-section">
                      <div className="diff-section-title">⚠️ Khác biệt ({comparison.conflicts.length})</div>
                      {comparison.conflicts.map((t) => (
                        <div key={t.id} className="diff-item conflict">
                          ⚡ {t.name}: Hiện tại ({t.currentCategories} HM, {t.currentAthletes} VĐV) ↔ Backup ({t.backupCategories} HM, {t.backupAthletes} VĐV)
                        </div>
                      ))}
                    </div>
                  )}
                  {comparison.newInCurrent.length > 0 && (
                    <div className="diff-section">
                      <div className="diff-section-title">💻 Chỉ có ở máy này ({comparison.newInCurrent.length})</div>
                      {comparison.newInCurrent.map((t) => (
                        <div key={t.id} className="diff-item kept">
                          📌 {t.name} ({t.categories} hạng mục)
                        </div>
                      ))}
                    </div>
                  )}
                  {comparison.identical.length > 0 && (
                    <div className="diff-section">
                      <div className="diff-section-title">✅ Giống nhau ({comparison.identical.length})</div>
                      {comparison.identical.map((t) => (
                        <div key={t.id} className="diff-item" style={{ background: "#f8fafc", color: "#64748b" }}>
                          ✓ {t.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Restore Actions */}
              <div className="restore-actions">
                <button className="restore-btn-cancel" onClick={() => { setView("main"); setBackupData(null); setComparison(null); }}>
                  Hủy
                </button>
                {backupData.data?.tournaments?.length === 1 ? (
                  comparison.newInBackup.length > 0 ? (
                    <button className="restore-btn-merge" onClick={() => handleSingleTournamentRestore("add")}>
                      ➕ Thêm giải này
                    </button>
                  ) : (
                    <>
                      <button className="restore-btn-merge" onClick={() => handleSingleTournamentRestore("copy")}>
                        📋 Tạo bản sao
                      </button>
                      <button className="restore-btn-replace" onClick={() => handleSingleTournamentRestore("overwrite")}>
                        🔄 Ghi đè giải này
                      </button>
                    </>
                  )
                ) : (
                  <>
                    <button className="restore-btn-merge" onClick={() => handleRestore("merge")}>
                      🔀 Gộp dữ liệu
                    </button>
                    <button className="restore-btn-replace" onClick={() => handleRestore("replace")}>
                      🔄 Thay thế toàn bộ
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* ===== HISTORY VIEW ===== */}
          {view === "history" && (
            <>
              <button className="backup-back-btn" onClick={() => setView("main")}>
                ← Quay lại
              </button>
              <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>🕐 Lịch sử Auto-backup</h3>
              <p style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: "1rem" }}>
                Hệ thống tự động backup trước mỗi thay đổi quan trọng. Bạn có thể khôi phục về trạng thái trước đó.
              </p>

              {autoBackups.length === 0 ? (
                <div className="backup-empty">
                  <div className="backup-empty-icon">📭</div>
                  <p>Chưa có bản auto-backup nào</p>
                </div>
              ) : (
                <div className="auto-backup-list">
                  {autoBackups.map((backup) => (
                    <div key={backup.id} className="auto-backup-item">
                      <div className="auto-backup-info">
                        <div className="auto-backup-time">
                          {new Date(backup.timestamp).toLocaleString("vi-VN")}
                        </div>
                        <div className="auto-backup-reason">{backup.reason}</div>
                        <div className="auto-backup-size">
                          {((backup.size || 0) / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <button
                        className="auto-backup-restore-btn"
                        onClick={() => handleAutoRestore(backup.id)}
                      >
                        Khôi phục
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
