import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRole, ROLES } from "../context/RoleContext";
import {
  openKmatchFile,
  exportResultsToJson,
  exportResultsToExcel,
} from "../services/matchService";
import {
  openScoreboard,
  listenForMatchResult,
} from "../services/scoreboardService";
import {
  updateMatchResult as updateBracketWithResult,
  disqualifyAthlete,
} from "../utils/drawEngine";
import { sendMatchResult, getMyIp, checkAdminAvailability } from "../services/lanService";
import Modal from "../components/common/Modal";
import Bracket from "../components/Bracket/Bracket";
import appIcon from "../assets/icon.png";
import "./SecretaryPage.css";

/**
 * SecretaryPage - Trang bấm điểm cho Thư ký
 */
function SecretaryPage() {
  const navigate = useNavigate();
  const {
    role,
    matchData,
    matchResults,
    scoringEnabled,
    canScore,
    loadMatchData,
    updateMatchResult,
    removeMatchResult,
    getMatchResult,
    getMatchExportData,
    resetRole,
  } = useRole();
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState("");
  const [finishedMatch, setFinishedMatch] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [adminIp, setAdminIp] = useState(localStorage.getItem("adminIp") || "");

  // Sidebar search/filter
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState("all"); // all | kata | kumite

  // Custom dialog (replaces window.prompt / window.confirm for Electron compatibility)
  const [dialog, setDialog] = useState(null);
  // dialog shape: { type: "prompt"|"confirm", title, message, defaultValue, onOk, onCancel }
  const dialogInputRef = useRef(null);

  // Focus input when prompt dialog opens
  useEffect(() => {
    if (dialog?.type === "prompt" && dialogInputRef.current) {
      setTimeout(() => dialogInputRef.current?.focus(), 50);
    }
  }, [dialog]);

  // Redirect if not Secretary
  useEffect(() => {
    if (role !== ROLES.SECRETARY) {
      navigate("/");
    }
  }, [role, navigate]);

  // Helper to find match by ID (for winner determination)
  const getMatchById = (matchId) => {
    if (!matchData?.categories) return null;
    for (const cat of matchData.categories) {
      const match = cat.matches?.find((m) => m.id === matchId);
      if (match) return match;
    }
    return null;
  };

  // Listen for match results from scoreboard
  useEffect(() => {
    const handleMatchResult = (result) => {
      console.log("Received match result:", result);

      // Update result in context
      const updateStatus = updateMatchResult(result.matchId, {
        score1: result.score1,
        score2: result.score2,
        winner: result.winnerId
          ? result.winnerId ===
            (getMatchById(result.matchId)?.athlete1?.id || "athlete1")
            ? "athlete1"
            : "athlete2"
          : null,
        ...result,
      });

      if (updateStatus.success) {
        setNotification(`✅ Đã cập nhật kết quả trận đấu!`);
        
        // Show Match End Modal for sync/export options
        const match = getMatchById(result.matchId);
        if (match) {
          const winner = result.winnerId 
            ? (result.winnerId === match.athlete1?.id ? match.athlete1 : match.athlete2) 
            : null;

          setFinishedMatch({
            ...result,
            match,
            matchCode: match.matchCode,
            winner,
            categoryName: selectedCategory?.name,
            tournamentName: matchData?.tournamentName,
            tournamentId: matchData?.tournamentId
          });
        }
        
        setTimeout(() => setNotification(""), 3000);
      } else {
        setError(`Lỗi cập nhật kết quả: ${updateStatus.error}`);
      }
    };

    // listenForMatchResult returns a cleanup function
    const cleanup = listenForMatchResult(handleMatchResult);

    return () => {
      cleanup();
    };
  }, [updateMatchResult]);

  // Open .kmatch file
  const handleOpenFile = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await openKmatchFile();
      if (result.success) {
        loadMatchData(result.data);
      } else {
        setError(result.error || "Không thể đọc file");
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };
  // Prepare bracket with live scores
  const bracketWithScores = useMemo(() => {
    if (!selectedCategory?.bracket) return null;

    // Deep clone bracket to allow mutation by the engine helper
    const clonedBracket = JSON.parse(JSON.stringify(selectedCategory.bracket));

    // Apply all local results to the cloned bracket
    // This ensures winners are advanced to next rounds automatically
    // Sort results by round to ensure proper advancement dependency
    const sortedResults = [...matchResults].sort((a, b) => {
      const matchA = clonedBracket.matches.find(m => m.id === a.matchId);
      const matchB = clonedBracket.matches.find(m => m.id === b.matchId);
      return (matchA?.round || 0) - (matchB?.round || 0);
    });

    sortedResults.forEach((result) => {
      if (result.disqualification && result.disqualifiedSlot) {
        // Apply disqualification
        disqualifyAthlete(
          clonedBracket,
          result.matchId,
          result.disqualifiedSlot,
          result.disqualifiedReason || "Loại"
        );
      } else if (result.winnerId) {
        updateBracketWithResult(
          clonedBracket,
          result.matchId,
          result.score1,
          result.score2,
          result.winnerId
        );
      }
    });

    return clonedBracket;
  }, [selectedCategory, matchResults]);
  // Handle right-click context menu actions from Bracket component
  const handleContextAction = (action, match, athleteSlot) => {
    if (!selectedCategory?.bracket) return;

    switch (action) {
      case "disqualify": {
        const athlete = athleteSlot === 1 ? match.athlete1 : match.athlete2;
        const opponent = athleteSlot === 1 ? match.athlete2 : match.athlete1;
        setDialog({
          type: "prompt",
          title: "🚫 Loại VĐV (sức khỏe / vi phạm)",
          message: `Lý do loại ${athlete?.name || "VĐV"}:`,
          defaultValue: "Vi phạm",
          onOk: (reason) => {
            setDialog(null);
            if (reason === null || reason === undefined) return;
            updateMatchResult(match.id, {
              matchId: match.id,
              disqualification: true,
              disqualifiedSlot: athleteSlot,
              disqualifiedReason: reason || "Loại",
              winnerId: opponent?.id || null,
              score1: null,
              score2: null,
            });
            setNotification(
              `🚫 Đã loại ${athlete?.name || "VĐV"}. ${
                opponent?.name || ""
              } thắng tự động.`
            );

            // Show sync modal for manual disqualify
            setFinishedMatch({
              matchId: match.id,
              matchCode: match.matchCode,
              score1: null,
              score2: null,
              winnerId: opponent?.id || null,
              disqualification: true,
              disqualifiedSlot: athleteSlot,
              disqualifiedReason: reason || "Loại",
              match,
              winner: opponent,
              categoryName: selectedCategory?.name,
              tournamentName: matchData?.tournamentName,
              tournamentId: matchData?.tournamentId
            });

            setTimeout(() => setNotification(""), 3000);
          },
          onCancel: () => setDialog(null),
        });
        break;
      }
      case "set_winner": {
        const winner = athleteSlot === 1 ? match.athlete1 : match.athlete2;
        if (!winner) return;
        updateMatchResult(match.id, {
          matchId: match.id,
          winnerId: winner.id,
          score1: athleteSlot === 1 ? 1 : 0,
          score2: athleteSlot === 1 ? 0 : 1,
        });
        setNotification(`🏆 ${winner.name} thắng trận!`);

        // Show sync modal for manual winner
        setFinishedMatch({
          matchId: match.id,
          matchCode: match.matchCode,
          score1: athleteSlot === 1 ? 1 : 0,
          score2: athleteSlot === 1 ? 0 : 1,
          winnerId: winner.id,
          match,
          winner,
          categoryName: selectedCategory?.name,
          tournamentName: matchData?.tournamentName,
          tournamentId: matchData?.tournamentId
        });

        setTimeout(() => setNotification(""), 3000);
        break;
      }
      case "reset_match": {
        setDialog({
          type: "confirm",
          title: "↩️ Reset trận đấu",
          message: "Reset trận đấu này? Toàn bộ kết quả và loại VĐV sẽ bị xóa.",
          onOk: () => {
            setDialog(null);
            removeMatchResult(match.id);
            setNotification("↩️ Đã reset trận đấu.");
            setTimeout(() => setNotification(""), 3000);
          },
          onCancel: () => setDialog(null),
        });
        break;
      }
      default:
        return;
    }
  };

  // Select a match to score - opens the external scoreboard
  const handleSelectMatch = (match) => {
    if (!canScore) {
      setError("Chức năng bấm điểm chưa được bật");
      return;
    }

    // Only allow if match has athletes (at least one for bye handling, or both for fight)
    if (!match.athlete1 && !match.athlete2) return;

    if (!selectedCategory) return;

    // Determine round name
    const roundName =
      selectedCategory.bracket?.roundNames?.[match.round - 1] ||
      `Round ${match.round}`;

    try {
      openScoreboard(
        match,
        selectedCategory.type || "kumite",
        selectedCategory.name,
        matchData.tournamentName,
        roundName
      );
      setNotification("📺 Đã mở bảng điểm. Vui lòng thao tác trên cửa sổ mới.");
      setTimeout(() => setNotification(""), 5000);
    } catch (err) {
      setError("Không thể mở bảng điểm: " + err.message);
    }
  };

  // Export results
  const handleExport = async (format) => {
    const data = getMatchExportData();
    try {
      if (format === "json") {
        await exportResultsToJson(data);
      } else {
        await exportResultsToExcel(data);
      }
    } catch (err) {
      setError("Lỗi khi xuất file: " + err.message);
    }
  };

  // Back to role select
  const handleBack = () => {
    resetRole();
    navigate("/");
  };

  if (role !== ROLES.SECRETARY) return null;
  return (
    <div className="secretary-page">
      {/* Match End Modal (Dual Combat Sync) */}
      {finishedMatch && (
        <Modal
          title="🏆 TRẬN ĐẤU KẾT THÚC"
          onClose={() => setFinishedMatch(null)}
          maxWidth="500px"
        >
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#1e293b' }}>
              {finishedMatch.match.athlete1?.name} vs {finishedMatch.match.athlete2?.name}
            </h3>
            
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
              <div style={{ fontSize: '32px', fontWeight: 800, color: finishedMatch.winnerId === finishedMatch.match.athlete1?.id ? '#ef4444' : '#64748b' }}>
                {finishedMatch.score1}
              </div>
              <div style={{ fontSize: '20px', color: '#94a3b8' }}>-</div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: finishedMatch.winnerId === finishedMatch.match.athlete2?.id ? '#3b82f6' : '#64748b' }}>
                {finishedMatch.score2}
              </div>
            </div>

            {finishedMatch.winner && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
                <span style={{ display: 'block', fontSize: '13px', color: '#166534', marginBottom: '4px' }}>NGƯỜI CHIẾN THẮNG:</span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#065f46' }}>🥇 {finishedMatch.winner.name}</span>
              </div>
            )}

            <div style={{ marginBottom: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
              <p style={{ fontSize: '14px', color: '#475569', marginBottom: '12px', fontWeight: 600 }}>📡 ĐỒNG BỘ TÁC CHIẾN KÉP (LAN)</p>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <input 
                  type="text"
                  placeholder="IP máy Admin (ví dụ: 192.168.1.10)"
                  value={adminIp}
                  onChange={(e) => {
                    setAdminIp(e.target.value);
                    localStorage.setItem("adminIp", e.target.value);
                  }}
                  style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
              
              <button 
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '16px', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
                disabled={syncing}
                onClick={async () => {
                  if (!adminIp) {
                    setError("Vui lòng nhập IP máy Admin");
                    return;
                  }
                  setSyncing(true);
                  localStorage.setItem("adminIp", adminIp);
                  
                  const syncData = {
                    matchId: finishedMatch.matchId,
                    matchCode: finishedMatch.matchCode,
                    score1: finishedMatch.score1,
                    score2: finishedMatch.score2,
                    winnerId: finishedMatch.winnerId,
                    tournamentId: finishedMatch.tournamentId || matchData?.tournamentId
                  };
                  
                  const result = await sendMatchResult(adminIp, 3000, syncData);
                  setSyncing(false);
                  
                  if (result.success) {
                    setNotification("✅ Đã đồng bộ LAN thành công!");
                    setFinishedMatch(null);
                    setTimeout(() => setNotification(""), 3000);
                  } else {
                    setDialog({
                      type: "confirm",
                      title: "⚠️ Kết nối không ổn định",
                      message: `Không thể đồng bộ qua LAN (Lỗi: ${result.message}). Bạn có muốn xuất file Excel để dự phòng không?`,
                      onOk: () => {
                        setDialog(null);
                        handleExport("excel");
                        setFinishedMatch(null);
                      },
                      onCancel: () => setDialog(null)
                    });
                  }
                }}
              >
                {syncing ? "⏳ Đang đồng bộ..." : "🚀 Lưu & Đồng bộ LAN"}
              </button>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                💡 Nếu Admin chưa nhận được, hãy kiểm tra Firewall trên máy Admin hoặc bấm nút "Đồng bộ lại" bên dưới.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn btn-secondary"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => {
                  handleExport("excel");
                  setFinishedMatch(null);
                }}
              >
                📊 Chỉ xuất Excel (Dự phòng)
              </button>
              <button 
                className="btn btn-outline"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => setFinishedMatch(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="secretary-container">
        <header className="secretary-header">
          <div className="header-left">
            <button className="back-btn" onClick={handleBack}>
              ← Đổi vai trò
            </button>
            <h1 className="page-title">
              <img src={appIcon} alt="" className="page-title-logo" />
              Thư Ký
            </h1>
          </div>
          <div className="header-right">
            {!matchData && (
              <button
                className="open-file-btn"
                onClick={handleOpenFile}
                disabled={loading}
              >
                {loading ? "⏳ Đang tải..." : "📂 Mở file .kmatch"}
              </button>
            )}
            {matchData && (
              <button className="open-file-btn small" onClick={handleOpenFile}>
                🔄 Đổi file
              </button>
            )}
          </div>
        </header>
        {error && <div className="error-message">{error}</div>}
        {notification && (
          <div className="notification-toast">{notification}</div>
        )}
        {!matchData ? (
          <div className="no-file-section">
            <div className="no-file-icon">📂</div>
            <h2>Chưa có file giải đấu</h2>
            <p>Mở file .kmatch từ Admin để bắt đầu bấm điểm</p>
            <button className="open-file-btn" onClick={handleOpenFile}>
              Mở file .kmatch
            </button>
          </div>
        ) : (
          <>
            {/* Status Banner */}
            <div
              className={`status-banner ${
                scoringEnabled ? "enabled" : "disabled"
              }`}
            >
              <div className="status-info">
                <span className="status-icon">
                  {scoringEnabled ? "🟢" : "🔴"}
                </span>
                <span className="status-text">
                  {scoringEnabled
                    ? "Bấm điểm đang được bật"
                    : "Bấm điểm đang TẮT"}
                </span>
              </div>

              {/* Permanent LAN Sync Setting Area */}
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  background: 'rgba(255, 255, 255, 0.9)', 
                  padding: '4px 12px', 
                  borderRadius: '25px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '18px' }}>📡</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Cấu hình LAN:</span>
                </div>
                <input 
                  type="text"
                  placeholder="Nhập IP máy Admin"
                  value={adminIp}
                  onChange={(e) => {
                    setAdminIp(e.target.value);
                    localStorage.setItem("adminIp", e.target.value);
                  }}
                  style={{ 
                    padding: '4px 10px', 
                    borderRadius: '4px', 
                    border: '1px solid #cbd5e1', 
                    fontSize: '13px',
                    width: '140px'
                  }}
                />
                <button 
                  onClick={async () => {
                    if (!adminIp) {
                      setError("Vui lòng nhập IP máy Admin");
                      return;
                    }
                    setSyncing(true);
                    const isAvailable = await checkAdminAvailability(adminIp, 3000);
                    setSyncing(false);
                    if (isAvailable) {
                      setNotification("✅ Kết nối tới máy Admin OK!");
                    } else {
                      setError("❌ Không thể kết nối tới máy Admin. Hãy kiểm tra IP và Firewall.");
                    }
                    setTimeout(() => setNotification(""), 3000);
                  }}
                  className="btn btn-sm"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  disabled={syncing}
                >
                  {syncing ? "..." : "Kiểm tra"}
                </button>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  (Cài đặt một lần, dùng mãi mãi)
                </span>
              </div>
              <div className="tournament-info">
                <strong>{matchData.tournamentName}</strong>
                <span>{matchData.location}</span>
              </div>
            </div>{" "}
            <div className="secretary-content">
              {/* Categories Sidebar */}
              <div className="categories-sidebar">
                <h3>Hạng mục thi đấu</h3>

                {/* Search */}
                <div className="sidebar-search-wrap">
                  <span className="sidebar-search-icon">🔍</span>
                  <input
                    className="sidebar-search-input"
                    type="text"
                    placeholder="Tìm hạng mục..."
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                  />
                  {sidebarSearch && (
                    <button
                      className="sidebar-search-clear"
                      onClick={() => setSidebarSearch("")}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter tabs */}
                <div className="sidebar-filter-tabs">
                  {["all", "kata", "kumite"].map((f) => (
                    <button
                      key={f}
                      className={`sidebar-filter-tab ${
                        sidebarFilter === f ? "active" : ""
                      }`}
                      onClick={() => setSidebarFilter(f)}
                    >
                      {f === "all"
                        ? "Tất cả"
                        : f === "kata"
                        ? "🥋 Kata"
                        : "⚔️ Kumite"}
                    </button>
                  ))}
                </div>

                <div className="categories-list">
                  {(() => {
                    const cats =
                      matchData.categories?.filter((cat) => {
                        const matchesSearch =
                          sidebarSearch.trim() === "" ||
                          cat.name
                            .toLowerCase()
                            .includes(sidebarSearch.toLowerCase().trim());
                        const matchesFilter =
                          sidebarFilter === "all" || cat.type === sidebarFilter;
                        return matchesSearch && matchesFilter;
                      }) || [];
                    if (cats.length === 0) {
                      return (
                        <div className="sidebar-no-result">
                          Không tìm thấy hạng mục
                        </div>
                      );
                    }
                    return cats.map((cat) => (
                      <button
                        key={cat.id}
                        className={`category-btn ${
                          selectedCategory?.id === cat.id ? "active" : ""
                        }`}
                        onClick={() => setSelectedCategory(cat)}
                      >
                        <span className="category-btn-name">{cat.name}</span>
                        <span className="match-count">
                          {cat.matches?.length || 0} trận
                        </span>
                      </button>
                    ));
                  })()}
                </div>
              </div>

              {/* Main Bracket View */}
              <div className="bracket-view-area">
                {selectedCategory ? (
                  <>
                    <div className="bracket-header-info">
                      <h2>{selectedCategory.name}</h2>
                      <div className="bracket-stats">
                        <span>
                          {selectedCategory.bracket?.matches?.filter(
                            (m) => !m.isBye
                          ).length || 0}{" "}
                          trận đấu
                        </span>
                      </div>
                    </div>

                    {/* Bracket + Medal Table */}
                    <div className="secretary-bracket-medal-wrapper">
                      {/* Bracket Component */}
                      <div className="secretary-bracket-wrapper">
                        {" "}
                        <Bracket
                          bracket={bracketWithScores}
                          categoryType={selectedCategory.type}
                          onMatchClick={handleSelectMatch}
                          onContextAction={handleContextAction}
                          dragEnabled={false}
                        />
                      </div>

                      {/* Medal Table */}
                      {bracketWithScores &&
                        (() => {
                          // Tìm trận chung kết (trận có round cao nhất)
                          const maxRound = Math.max(...(bracketWithScores.matches?.map(m => m.round) || [0]));
                          const finalMatch = bracketWithScores.matches?.find(
                            (m) => m.round === maxRound && m.round > 0
                          );
                          const champion = finalMatch?.winner;

                          const getLoser = (match) => {
                            if (!match?.winner) return null;
                            if (match.athlete1?.id === match.winner.id)
                              return match.athlete2;
                            if (match.athlete2?.id === match.winner.id)
                              return match.athlete1;
                            return null;
                          };

                          const silverMedalist = getLoser(finalMatch);
                          const semiFinalRound =
                            bracketWithScores.numRounds - 1;
                          const semiFinalMatches =
                            bracketWithScores.matches?.filter(
                              (m) => m.round === semiFinalRound && !m.isBye
                            ) || [];
                          const bronzeMedalists = semiFinalMatches
                            .map((m) => getLoser(m))
                            .filter((a) => a !== null);

                          // Tìm thêm bronze từ tứ kết nếu bán kết có auto-advance
                          if (
                            bronzeMedalists.length < 2 &&
                            semiFinalRound > 1
                          ) {
                            const quarterRound = semiFinalRound - 1;
                            const quarterFinals =
                              bracketWithScores.matches?.filter(
                                (m) =>
                                  m.round === quarterRound &&
                                  !m.isBye &&
                                  m.winner
                              ) || [];
                            const autoAdvanceSemis = semiFinalMatches.filter(
                              (m) => m.winner && (!m.athlete1 || !m.athlete2)
                            );
                            autoAdvanceSemis.forEach((semi) => {
                              const advAthlete =
                                semi.winner || semi.athlete1 || semi.athlete2;
                              if (!advAthlete) return;
                              const qMatch = quarterFinals.find(
                                (m) => m.winner?.id === advAthlete.id
                              );
                              if (qMatch) {
                                const qLoser = getLoser(qMatch);
                                if (
                                  qLoser &&
                                  !bronzeMedalists.some(
                                    (b) => b.id === qLoser.id
                                  )
                                ) {
                                  bronzeMedalists.push(qLoser);
                                }
                              }
                            });
                            if (bronzeMedalists.length < 2) {
                              quarterFinals.forEach((qm) => {
                                const qLoser = getLoser(qm);
                                if (
                                  qLoser &&
                                  qLoser.id !== champion?.id &&
                                  qLoser.id !== silverMedalist?.id &&
                                  !bronzeMedalists.some(
                                    (b) => b.id === qLoser.id
                                  )
                                ) {
                                  bronzeMedalists.push(qLoser);
                                }
                              });
                            }
                          }

                          return (
                            <div className="secretary-medal-table-container">
                              <table className="secretary-medal-table">
                                <thead>
                                  <tr>
                                    <th style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span>🏆 KẾT QUẢ</span>
                                      <button 
                                        className="btn btn-primary btn-sm"
                                        style={{ fontSize: '10px', padding: '2px 6px' }}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!adminIp) {
                                            setError("Vui lòng nhập IP máy Admin");
                                            return;
                                          }
                                          setSyncing(true);
                                          let count = 0;
                                          for (const result of matchResults) {
                                            const match = getMatchById(result.matchId);
                                            if (match) {
                                              await sendMatchResult(adminIp, 3000, {
                                                ...result,
                                                matchCode: match.matchCode,
                                                tournamentId: matchData?.tournamentId
                                              });
                                              count++;
                                            }
                                          }
                                          setSyncing(false);
                                          setNotification(`✅ Đã đồng bộ ${count} trận đấu sang Admin!`);
                                          setTimeout(() => setNotification(""), 3000);
                                        }}
                                        disabled={syncing || matchResults.length === 0}
                                      >
                                        📡 Sync
                                      </button>
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="medal-row medal-gold">
                                    <td>
                                      <span className="medal-icon-sm">🥇</span>
                                      <span className="medal-info">
                                        {champion ? (
                                          <>
                                            <span className="medal-name">
                                              {champion.name}
                                            </span>
                                            {champion.club && (
                                              <span className="medal-club-sm">
                                                {champion.club}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          "-"
                                        )}
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="medal-row medal-silver">
                                    <td>
                                      <span className="medal-icon-sm">🥈</span>
                                      <span className="medal-info">
                                        {silverMedalist ? (
                                          <>
                                            <span className="medal-name">
                                              {silverMedalist.name}
                                            </span>
                                            {silverMedalist.club && (
                                              <span className="medal-club-sm">
                                                {silverMedalist.club}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          "-"
                                        )}
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="medal-row medal-bronze">
                                    <td>
                                      <span className="medal-icon-sm">🥉</span>
                                      <span className="medal-info">
                                        {bronzeMedalists[0] ? (
                                          <>
                                            <span className="medal-name">
                                              {bronzeMedalists[0].name}
                                            </span>
                                            {bronzeMedalists[0].club && (
                                              <span className="medal-club-sm">
                                                {bronzeMedalists[0].club}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          "-"
                                        )}
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="medal-row medal-bronze">
                                    <td>
                                      <span className="medal-icon-sm">🥉</span>
                                      <span className="medal-info">
                                        {bronzeMedalists[1] ? (
                                          <>
                                            <span className="medal-name">
                                              {bronzeMedalists[1].name}
                                            </span>
                                            {bronzeMedalists[1].club && (
                                              <span className="medal-club-sm">
                                                {bronzeMedalists[1].club}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          "-"
                                        )}
                                      </span>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                    </div>
                  </>
                ) : (
                  <div className="select-category-hint">
                    <p>⬅️ Chọn một hạng mục để xem sơ đồ và bấm điểm</p>
                  </div>
                )}
              </div>
            </div>
            {/* Export Footer */}
            <div className="export-section">
              <div className="export-info">
                Đã lưu kết quả: <strong>{matchResults.length}</strong> trận
              </div>
              <div className="export-buttons">
                <button
                  className="export-btn json"
                  onClick={() => handleExport("json")}
                  disabled={matchResults.length === 0}
                >
                  📄 Xuất JSON
                </button>
                <button
                  className="export-btn sync"
                  style={{ background: '#22c55e', color: '#fff' }}
                  onClick={async () => {
                    if (!adminIp) {
                      setError("Vui lòng nhập IP máy Admin để đồng bộ");
                      return;
                    }
                    setSyncing(true);
                    let successCount = 0;
                    for (const result of matchResults) {
                      const match = getMatchById(result.matchId);
                      const res = await sendMatchResult(adminIp, 3000, {
                        ...result,
                        matchCode: match?.matchCode,
                        tournamentId: matchData?.tournamentId
                      });
                      if (res.success) successCount++;
                    }
                    setSyncing(false);
                    setNotification(`✅ Đã đồng bộ ${successCount}/${matchResults.length} trận thành công!`);
                    setTimeout(() => setNotification(""), 3000);
                  }}
                  disabled={matchResults.length === 0 || syncing}
                >
                  📡 {syncing ? "Đang gửi..." : "Đồng bộ LAN"}
                </button>
                <button
                  className="export-btn excel"
                  onClick={() => handleExport("excel")}
                  disabled={matchResults.length === 0}
                >
                  📊 Xuất Excel
                </button>
              </div>
            </div>{" "}
          </>
        )}{" "}
      </div>

      {/* ===== CUSTOM DIALOG (replaces window.prompt / window.confirm) ===== */}
      {dialog && (
        <div
          className="secretary-dialog-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) dialog.onCancel();
          }}
        >
          <div className="secretary-dialog">
            <div className="secretary-dialog-title">{dialog.title}</div>
            <div className="secretary-dialog-message">{dialog.message}</div>
            {dialog.type === "prompt" && (
              <input
                ref={dialogInputRef}
                className="secretary-dialog-input"
                type="text"
                defaultValue={dialog.defaultValue || ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") dialog.onOk(e.target.value);
                  if (e.key === "Escape") dialog.onCancel();
                }}
              />
            )}
            <div className="secretary-dialog-actions">
              <button
                className="secretary-dialog-btn cancel"
                onClick={dialog.onCancel}
              >
                Hủy
              </button>
              <button
                className={`secretary-dialog-btn ok ${
                  dialog.type === "confirm" ? "danger" : "primary"
                }`}
                onClick={() => {
                  if (dialog.type === "prompt") {
                    dialog.onOk(dialogInputRef.current?.value ?? "");
                  } else {
                    dialog.onOk();
                  }
                }}
              >
                {dialog.type === "confirm" ? "Xác nhận" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SecretaryPage;
