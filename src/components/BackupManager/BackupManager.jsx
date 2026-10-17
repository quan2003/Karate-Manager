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
import { fetchCloudTournamentsList, downloadCloudBackupData, setAuthorizedMachineForTournament } from "../../services/cloudSyncService";
import { dbGetMachineId } from "../../services/dbService";
import "./BackupManager.css";

/**
 * BackupManager - Giao diện quản lý backup/restore dữ liệu
 * Hỗ trợ nhiều Admin quản lý cùng giải đấu
 */
export default function BackupManager({ isOpen, onClose, onDataRestored }) {
  const [view, setView] = useState("main"); // main | export | import | compare | history | cloud
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
  const [cloudTournaments, setCloudTournaments] = useState([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [cloudSearch, setCloudSearch] = useState("");
  const [myMachineId, setMyMachineId] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    dbGetMachineId().then((id) => setMyMachineId(id));
  }, []);

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

  // ====== CLOUD VPS ======
  const handleOpenCloudView = async () => {
    setView("cloud");
    setLoadingCloud(true);
    showStatus("info", "⏳ Đang kết nối Cloud VPS để lấy danh sách giải...");
    const res = await fetchCloudTournamentsList();
    setLoadingCloud(false);
    if (res.success) {
      setCloudTournaments(res.tournaments || []);
      setStatus(null);
    } else {
      showStatus("error", `❌ ${res.message}`);
    }
  };

  const handleDownloadFromCloud = async (tournamentId) => {
    showStatus("info", "⏳ Đang tải gói dữ liệu từ Cloud VPS...");
    const res = await downloadCloudBackupData(tournamentId);
    if (!res.success || !res.data) {
      showStatus("error", `❌ ${res.message || "Không thể tải dữ liệu"}`);
      return;
    }

    try {
      showStatus("info", "⏳ Đang so sánh dữ liệu với phần mềm...");
      setBackupData(res.data);
      const comp = await compareBackupWithCurrent(res.data);
      setComparison(comp);
      setView("compare");
      setStatus(null);
    } catch (err) {
      showStatus("error", `❌ Lỗi đọc dữ liệu Cloud: ${err.message}`);
    }
  };

  const handleSetAuthorizedMachine = async (tournamentId) => {
    showStatus("info", "⏳ Đang phân quyền Machine ID nguồn chính...");
    const res = await setAuthorizedMachineForTournament(tournamentId, myMachineId);
    if (res.success) {
      showStatus("success", `✅ ${res.message}`);
      handleOpenCloudView();
    } else {
      showStatus("error", `❌ ${res.message}`);
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

                <button className="backup-action-card cloud-card" onClick={handleOpenCloudView} style={{ borderColor: '#3b82f6', background: 'linear-gradient(135deg, #eff6ff, #ffffff)', gridColumn: 'span 2' }}>
                  <div className="backup-action-icon" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff' }}>☁️</div>
                  <div className="backup-action-title" style={{ color: '#1d4ed8' }}>Tải từ Cloud VPS Server</div>
                  <div className="backup-action-desc">Xem danh sách giải đã đồng bộ trên VPS (theo Mã máy) & kéo trực tiếp về máy này</div>
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
                <strong>💡 Hướng dẫn đồng bộ dữ liệu:</strong><br />
                • <b>Tải từ Cloud VPS:</b> Kéo trực tiếp giải đấu đã đẩy lên VPS của các máy khác về máy tính này.<br />
                • <b>Xuất / Nhập Backup thủ công:</b> Xuất file <code>.kbackup</code> gửi qua Zalo / USB để nhập vào máy khác.
              </div>
            </>
          )}

          {/* ===== CLOUD VPS VIEW ===== */}
          {view === "cloud" && (
            <>
              <button className="backup-back-btn" onClick={() => setView("main")}>
                ← Quay lại
              </button>
              <h3 style={{ marginBottom: "0.4rem", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "8px" }}>
                ☁️ Đồng bộ & Khôi phục dữ liệu Cloud VPS
              </h3>
              <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: "0.8rem", lineHeight: 1.5 }}>
                Quản lý đồng bộ Realtime giữa các máy tính qua Cloud VPS. Xác nhận Machine ID nguồn chính để phân quyền xuất dữ liệu chính thức cho các máy khác.
              </p>

              {/* Banner hiển thị Machine ID của máy này */}
              <div style={{
                background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
                color: "#fff",
                borderRadius: "10px",
                padding: "10px 14px",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.82rem"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>💻 <strong>Mã máy hiện tại (My Machine ID):</strong></span>
                  <code style={{ background: "#3b82f6", color: "#fff", padding: "2px 8px", borderRadius: "5px", fontFamily: "monospace", fontWeight: 700 }}>
                    {myMachineId || "Đang lấy..."}
                  </code>
                </div>
                <span style={{ color: "#4ade80", fontSize: "0.78rem", fontWeight: 600 }}>● Đã kết nối VPS</span>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <input
                  type="text"
                  placeholder="🔍 Tìm kiếm theo tên giải đấu hoặc Mã máy (vd: KRT-59EEBC32)..."
                  value={cloudSearch}
                  onChange={(e) => setCloudSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.88rem",
                    outline: "none"
                  }}
                />
              </div>

              {loadingCloud ? (
                <div style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
                  ⏳ Đang kết nối VPS và tải danh sách giải...
                </div>
              ) : cloudTournaments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2.5rem", color: "#94a3b8" }}>
                  Chưa có giải đấu nào được lưu trên Cloud VPS Server.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "360px", overflowY: "auto", paddingRight: "4px" }}>
                  {cloudTournaments
                    .filter((t) => {
                      if (!cloudSearch.trim()) return true;
                      const q = cloudSearch.toLowerCase().trim();
                      return (
                        (t.name && t.name.toLowerCase().includes(q)) ||
                        (t.machine_id && t.machine_id.toLowerCase().includes(q)) ||
                        (t.authorized_machine_id && t.authorized_machine_id.toLowerCase().includes(q)) ||
                        (t.id && t.id.toLowerCase().includes(q))
                      );
                    })
                    .map((t) => {
                      const pushMachineId = t.machine_id || t.summary?.machineId || "KRT-UNKNOWN";
                      const authMachineId = t.authorized_machine_id || t.summary?.authorizedMachineId || pushMachineId;
                      const isMyMachineAuthorized = myMachineId && authMachineId === myMachineId;

                      return (
                        <div
                          key={t.id}
                          style={{
                            background: isMyMachineAuthorized ? "#f0fdf4" : "#f8fafc",
                            border: isMyMachineAuthorized ? "2px solid #86efac" : "1px solid #e2e8f0",
                            borderRadius: "12px",
                            padding: "14px 16px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>
                                {t.name}
                              </div>
                              {isMyMachineAuthorized ? (
                                <span style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", padding: "1px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 700 }}>
                                  👑 Máy Nguồn Chính (Ghi nhận)
                                </span>
                              ) : (
                                <span style={{ background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a", padding: "1px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 600 }}>
                                  ⚠️ Máy phụ / Chờ xác nhận Machine ID
                                </span>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "0.78rem", marginTop: "4px" }}>
                              <span style={{
                                background: "#e0e7ff",
                                color: "#3730a3",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontWeight: 600,
                                fontFamily: "monospace"
                              }}>
                                🔑 Machine ID xuất: {pushMachineId}
                              </span>
                              <span style={{ color: "#475569" }}>
                                👥 {t.total_athletes || 0} VĐV • 🏆 {t.total_categories || 0} Hạng mục
                              </span>
                              <span style={{ color: "#94a3b8" }}>
                                🕒 {t.last_synced_at ? new Date(t.last_synced_at).toLocaleString('vi-VN') : ''}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end", flexShrink: 0 }}>
                            <button
                              className="backup-btn primary-btn"
                              onClick={() => handleDownloadFromCloud(t.id)}
                              style={{
                                whiteSpace: "nowrap",
                                padding: "7px 14px",
                                fontSize: "0.82rem",
                                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                                color: "#fff",
                                border: "none",
                                borderRadius: "8px",
                                fontWeight: 600,
                                cursor: "pointer"
                              }}
                            >
                              📥 Tải & Khôi phục
                            </button>

                            {!isMyMachineAuthorized && (
                              <button
                                onClick={() => handleSetAuthorizedMachine(t.id)}
                                title="Xác nhận máy tính này là máy nguồn chính thức để phân quyền xuất dữ liệu sang máy khác"
                                style={{
                                  fontSize: "0.74rem",
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                  border: "1px solid #cbd5e1",
                                  background: "#ffffff",
                                  color: "#475569",
                                  cursor: "pointer",
                                  fontWeight: 600
                                }}
                              >
                                👑 Đặt làm Máy Nguồn
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
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
