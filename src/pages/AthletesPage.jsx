import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useTournament,
  useTournamentDispatch,
  ACTIONS,
} from "../context/TournamentContext";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import AthleteForm from "../components/AthleteForm/AthleteForm";
import SearchableSelect from "../components/common/SearchableSelect";
import { useToast } from "../components/common/Toast";
import {
  fetchSubmissions,
  deleteSubmissions,
  removeAthletesFromClubSubmission,
} from "../services/supabaseService";
import { useOnboarding } from "../context/OnboardingContext";
import appIcon from "../assets/icon.png";
import * as XLSX from "xlsx";
import "./AthletesPage.css";

export default function AthletesPage() {
  const { id } = useParams();
  const { tournaments } = useTournament();
  const dispatch = useTournamentDispatch();
  const { toast } = useToast();
  const { activeHint, clearHint } = useOnboarding();

  const tournament = tournaments.find((t) => t.id === id);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterClub, setFilterClub] = useState("all");
  const [filterGender, setFilterGender] = useState("all");

  const [editingAthlete, setEditingAthlete] = useState(null);
  const [movingAthlete, setMovingAthlete] = useState(null);
  const [targetCategory, setTargetCategory] = useState("");
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    onConfirm: null,
    type: "danger"
  });
  const [syncing, setSyncing] = useState(false);
  const [showCleanupMenu, setShowCleanupMenu] = useState(false);
  const [showCloudIdModal, setShowCloudIdModal] = useState(false);
  const [customCloudId, setCustomCloudId] = useState("");
  const [showWithdrawAthletesModal, setShowWithdrawAthletesModal] = useState(false);
  const [withdrawClubName, setWithdrawClubName] = useState("");
  const [selectedWithdrawAthleteIds, setSelectedWithdrawAthleteIds] = useState([]);
  const [withdrawingAthletes, setWithdrawingAthletes] = useState(false);

  if (!tournament) {
    return (
      <div className="page">
        <div className="container">
          <h2>Không tìm thấy giải đấu</h2>
          <Link to="/admin" className="btn btn-primary">Về quản lý giải đấu</Link>
        </div>
      </div>
    );
  }

  const allAthletes = useMemo(() => {
    const list = [];
    tournament.categories.forEach((cat) => {
      (cat.athletes || []).forEach((a) => {
        list.push({
          ...a,
          categoryName: cat.name,
          categoryId: cat.id,
          categoryType: cat.type,
        });
      });
    });
    return list;
  }, [tournament]);

  const uniqueClubs = useMemo(() => {
    const clubs = new Set();
    allAthletes.forEach((a) => {
      if (a.club) clubs.add(a.club.trim());
    });
    return Array.from(clubs).sort();
  }, [allAthletes]);

  const filteredAthletes = useMemo(() => {
    return allAthletes.filter((a) => {
      if (filterCategory !== "all" && a.categoryId !== filterCategory) return false;
      if (filterClub !== "all" && (a.club || "").trim() !== filterClub) return false;
      if (filterGender !== "all" && a.gender !== filterGender) return false;
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        if (!a.name.toLowerCase().includes(q) && !(a.club || "").toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [allAthletes, filterCategory, filterClub, filterGender, searchQuery]);

  const handleEdit = (athlete) => {
    // AthleteForm expects standard athlete object without categoryName inside
    setEditingAthlete(athlete);
  };

  const handleSaveAthlete = (data) => {
    // If we're editing
    dispatch({
      type: ACTIONS.UPDATE_ATHLETE,
      payload: { ...data, id: editingAthlete.id },
    });
    toast.success("Cập nhật thành công!");
    setEditingAthlete(null);
  };

  const handleDeleteClick = (athleteId) => {
    setConfirmDialog({
      open: true,
      title: "Xóa VĐV",
      message: "Bạn có chắc chắn muốn xóa VĐV này khỏi danh sách?",
      type: "danger",
      onConfirm: () => {
        dispatch({ type: ACTIONS.DELETE_ATHLETE, payload: athleteId });
        setConfirmDialog(p => ({ ...p, open: false }));
        toast.success("Đã xóa VĐV.");
      }
    });
  };

  const handleClearAllLocal = () => {
    setConfirmDialog({
      open: true,
      title: "⚠️ XÓA TOÀN BỘ VĐV",
      message: "Cảnh báo: Hành động này sẽ xóa SẠCH danh sách vận động viên của giải đấu này trên máy của bạn. Bạn có chắc chắn không?",
      type: "danger",
      onConfirm: () => {
        dispatch({ type: ACTIONS.CLEAR_TOURNAMENT_ATHLETES, payload: tournament.id });
        setConfirmDialog(p => ({ ...p, open: false }));
        toast.success("Đã xóa toàn bộ VĐV địa phương.");
      }
    });
  };

  const handleClearCloudData = () => {
    setConfirmDialog({
      open: true,
      title: "☁️ XÓA DỮ LIỆU ĐÁM MÂY",
      message: "Hành động này sẽ xóa tất cả các bản đăng ký trực tuyến của giải đấu này trên Server. Sau khi xóa, các CLB phải nộp lại từ đầu. Tiếp tục?",
      type: "danger",
      onConfirm: async () => {
        const result = await deleteSubmissions(tournament.id);
        if (result.success) {
          toast.success("Đã xóa dữ liệu trên đám mây.");
        } else {
          toast.error("Lỗi: " + result.message);
        }
        setConfirmDialog(p => ({ ...p, open: false }));
      }
    });
  };

  const normalizeClubName = (value) =>
    String(value || "").trim().normalize("NFC").toLowerCase();

  const athletesInWithdrawClub = withdrawClubName
    ? allAthletes.filter(
        (athlete) =>
          normalizeClubName(athlete.club) === normalizeClubName(withdrawClubName)
      )
    : [];

  const handleWithdrawAthletes = () => {
    const clubName = withdrawClubName.trim();
    if (!clubName) {
      toast.error("Vui lòng chọn CLB.");
      return;
    }

    const selectedAthletes = allAthletes.filter((athlete) =>
      selectedWithdrawAthleteIds.includes(athlete.id)
    );
    if (selectedAthletes.length === 0) {
      toast.error("Vui lòng tích chọn ít nhất một VĐV rút lui.");
      return;
    }

    setShowWithdrawAthletesModal(false);
    setConfirmDialog({
      open: true,
      title: "Xác nhận VĐV rút lui",
      message: `Bạn đã chọn ${selectedAthletes.length} VĐV của CLB “${clubName}”. Hệ thống chỉ loại những VĐV này khỏi Cloud, máy hiện tại và bảng đấu liên quan; các thành viên còn lại vẫn được giữ nguyên. Tiếp tục?`,
      type: "danger",
      onConfirm: async () => {
        setConfirmDialog((current) => ({ ...current, open: false }));
        setWithdrawingAthletes(true);
        try {
          const submissionsResult = await fetchSubmissions(tournament.id);
          if (!submissionsResult.success) {
            toast.error("Không thể kiểm tra dữ liệu Cloud: " + submissionsResult.message);
            return;
          }

          const cloudSubmission = submissionsResult.data.find((submission) => {
            const submittedData =
              typeof submission.data === "string"
                ? JSON.parse(submission.data)
                : submission.data;
            return [submission.club_name, submittedData?.clubName]
              .filter(Boolean)
              .some((name) => normalizeClubName(name) === normalizeClubName(clubName));
          });

          if (cloudSubmission) {
            const updateResult = await removeAthletesFromClubSubmission(
              tournament.id,
              cloudSubmission.club_name,
              selectedAthletes
            );
            if (!updateResult.success) {
              toast.error("Không thể cập nhật danh sách CLB trên Cloud: " + updateResult.message);
              return;
            }
          }

          dispatch({
            type: ACTIONS.REMOVE_WITHDRAWN_ATHLETES,
            payload: {
              tournamentId: tournament.id,
              athleteIds: selectedAthletes.map((athlete) => athlete.id),
            },
          });
          setWithdrawClubName("");
          setSelectedWithdrawAthleteIds([]);
          toast.success(
            cloudSubmission
              ? `Đã ghi nhận ${selectedAthletes.length} VĐV của CLB “${clubName}” rút lui.`
              : `Không tìm thấy submission Cloud; đã xóa ${selectedAthletes.length} VĐV tại máy.`
          );
        } catch (error) {
          console.error("Withdraw athletes error:", error);
          toast.error("Không thể xử lý VĐV rút lui: " + (error.message || "Lỗi không xác định"));
        } finally {
          setWithdrawingAthletes(false);
          setConfirmDialog((current) => ({ ...current, open: false }));
        }
      },
    });
  };

  const handleSyncOnline = async (overrideCloudId) => {
    setSyncing(true);
    const cloudTournamentId = overrideCloudId || tournament.id;
    try {
      const result = await fetchSubmissions(cloudTournamentId);
      if (result.success && result.data.length > 0) {
        let totalAthletes = 0;
        let totalClubs = result.data.length;

        // Collect all data BEFORE dispatching to avoid race conditions in loops
        let currentClubRegs = { ...(tournament.clubRegistrations || {}) };
        const athletesToImportMap = {}; // { categoryId: [athletes] }

        for (const submission of result.data) {
          const data = submission.data;
          const clubName = (data.clubName || data.coachName || "Chưa Rõ").trim();

          // 1. Merge Club Regs
          const existingReg = currentClubRegs[clubName] || { coaches: [], teamLeader: "" };
          const allCoaches = [data.coachName, ...(data.additionalCoaches || [])].filter(Boolean);
          const mergedCoaches = [...new Set([...existingReg.coaches, ...allCoaches])].filter(Boolean);
          const teamLeader = data.teamLeaderName || existingReg.teamLeader || "";
          const submittedAt = data.updated_at_local || (submission.submitted_at ? new Date(submission.submitted_at).toLocaleString('vi-VN') : '—');
          
          currentClubRegs[clubName] = { 
            coaches: mergedCoaches, 
            teamLeader,
            submittedAt: submittedAt // Save the time here
          };

          // 2. Group Athletes
          if (data.athletes && data.athletes.length > 0) {
            data.athletes.forEach(a => {
              // Try to find the correct category by ID first, then by explicit name match
              let categoryId = a.eventId;
              let targetCategory = tournament.categories.find(c => c.id === categoryId);
              
              if (!targetCategory && a.eventName) {
                // Find by exact name if ID didn't match, handling Vietnamese NFC/NFD variations
                const evNameNorm = a.eventName.trim().normalize("NFC");
                const targetCategoryByName = tournament.categories.find(c => c.name.trim().normalize("NFC") === evNameNorm);
                if (targetCategoryByName) {
                  categoryId = targetCategoryByName.id;
                }
              }
              
              if (!athletesToImportMap[categoryId]) athletesToImportMap[categoryId] = [];
              // Force athlete club and category ID to match
              athletesToImportMap[categoryId].push({ ...a, club: clubName, eventId: categoryId });
              totalAthletes++;
            });
          }
        }

        // Dispatch ONCE for all club registrations
        dispatch({
          type: ACTIONS.UPDATE_CLUB_REGISTRATIONS,
          payload: {
            tournamentId: tournament.id,
            clubRegistrations: currentClubRegs
          }
        });

        // Dispatch per category for athletes
        Object.keys(athletesToImportMap).forEach(categoryId => {
          if (tournament.categories.find(c => c.id === categoryId)) {
            dispatch({
              type: ACTIONS.IMPORT_ATHLETES,
              payload: { categoryId, athletes: athletesToImportMap[categoryId] }
            });
          }
        });

        const syncDetails = result.data.map(sub => {
          // Robust parsing of time
          const jsonVal = typeof sub.data === 'string' ? JSON.parse(sub.data) : sub.data;
          let time = jsonVal?.updated_at_local;
          
          if (!time && sub.submitted_at) {
            // Manual fallback if toLocaleString fails to catch TZ
            const d = new Date(sub.submitted_at);
            time = d.toLocaleTimeString('vi-VN', { hour12: false });
          }
          
          return `${sub.club_name} (${time || '—'})`;
        }).join(', ');
        toast.success(`✅ Đồng bộ thành công ${totalClubs} đoàn: ${syncDetails}. Tổng ${totalAthletes} VĐV.`);
      } else if (result.success) {
        toast.info("☁️ Không có đăng ký mới nào trên Server.");
      } else {
        toast.error("Lỗi đồng bộ: " + result.message);
      }
    } catch (err) {
      console.error("Sync Online Error:", err);
      toast.error("Lỗi đồng bộ hoặc kết nối Server: " + (err.message || "Không xác định"));
    } finally {
      setSyncing(false);
    }
  };

  const handleMoveClick = (athlete) => {
    setMovingAthlete(athlete);
    setTargetCategory(athlete.categoryId);
  };

  const handleConfirmMove = () => {
    if (!movingAthlete || !targetCategory) return;
    if (movingAthlete.categoryId === targetCategory) {
      setMovingAthlete(null);
      return;
    }

    dispatch({
      type: ACTIONS.MOVE_ATHLETE,
      payload: {
        athleteId: movingAthlete.id,
        newCategoryId: targetCategory,
      },
    });
    toast.success("Chuyển VĐV thành công");
    setMovingAthlete(null);
  };

  const handleExportExcel = () => {
    if (filteredAthletes.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }

    const data = filteredAthletes.map((a, index) => ({
      STT: index + 1,
      "Tên VĐV": a.name,
      "Loại": a.isTeam ? "Đồng đội" : "Cá nhân",
      "Giới tính": a.gender === "male" ? "Nam" : a.gender === "female" ? "Nữ" : "",
      "Năm sinh": a.birthDate || a.birthYear || "",
      "Đơn vị / CLB": a.club || "",
      "Hạng mục (Nội dung)": a.categoryName,
      "Cân nặng": a.weight || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_sach_VDV");
    XLSX.writeFile(wb, `Danh_sach_VDV_${new Date().getTime()}.xlsx`);
  };

  const printIframeWithLoading = (htmlContent, title = "In PDF") => {
    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.left = "-9999px";
    printFrame.style.top = "0";
    printFrame.style.width = "210mm";
    printFrame.style.height = "297mm";
    printFrame.style.border = "none";
    document.body.appendChild(printFrame);

    const doc = printFrame.contentDocument || printFrame.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    const doAfterLoad = () => {
      try {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
      } catch (e) {
        console.error("Print error:", e);
      }
      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
      }, 1000);
    };

    setTimeout(doAfterLoad, 1000);
  };

  const handleExportPDF = () => {
    if (filteredAthletes.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }

    let htmlContent = `
      <div style="text-align: center; margin-bottom: 20px;">
        <h2>DANH SÁCH VẬN ĐỘNG VIÊN - ${tournament.name}</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>STT</th>
            <th>Tên VĐV</th>
            <th>Giới tính</th>
            <th>Năm sinh</th>
            <th>Đơn vị / CLB</th>
            <th>Hạng mục thi đấu</th>
            <th>Loại</th>
          </tr>
        </thead>
        <tbody>
          ${filteredAthletes.map((a, i) => `
            <tr>
              <td style="text-align:center">${i + 1}</td>
              <td style="font-weight:bold">${a.name}</td>
              <td style="text-align:center">${a.gender === "male" ? "Nam" : a.gender === "female" ? "Nữ" : ""}</td>
              <td style="text-align:center">${a.birthDate || a.birthYear || ""}</td>
              <td>${a.club || ""}</td>
              <td>${a.categoryName}</td>
              <td style="text-align:center">${a.isTeam ? "Đồng đội" : "Cá nhân"}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    printIframeWithLoading(
      `<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Danh sách VĐV - ${tournament.name}</title>
      <style>
        @page { size: portrait; margin: 10mm; }
        body { font-family: 'Times New Roman', Times, serif; color: #000; padding: 10px; }
        h2 { text-align: center; font-size: 16px; font-weight: bold; text-transform: uppercase; margin-bottom: 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { color: #000; padding: 6px 4px; text-align: center; font-size: 10px; font-weight: bold; border: 1px solid #000; background-color: #f1f5f9; }
        td { padding: 5px 4px; border: 1px solid #000; word-break: break-word; }
        td:nth-child(1) { text-align: center; width: 6%; }
        td:nth-child(2) { width: 18%; }
        td:nth-child(3) { text-align: center; width: 8%; }
        td:nth-child(4) { text-align: center; width: 10%; }
        td:nth-child(5) { width: 20%; }
        td:nth-child(6) { width: 30%; }
        td:nth-child(7) { text-align: center; width: 8%; }
      </style>
      </head><body>${htmlContent}</body></html>`
    );
  };

  return (
    <div className="page athletes-page">
      <div className="container">
        <nav className="breadcrumb">
          <Link to={`/tournament/${tournament.id}`} className="back-link">
            ← Quay lại
          </Link>
          <span className="breadcrumb-separator">|</span>
          <Link to="/admin">Quản lý giải đấu</Link>
          <span>/</span>
          <Link to={`/tournament/${tournament.id}`}>{tournament.name}</Link>
          <span>/</span>
          <span>Quản lý VĐV</span>
        </nav>

        <header className="page-header">
          <div>
            <h1 className="page-title">
              <img src={appIcon} alt="" className="page-title-logo" />
              Tổng quan Vận Động Viên
            </h1>
            <p className="page-subtitle">Quản lý tất cả VĐV trong giải đấu</p>
          </div>
          <div className="header-actions" style={{ gap: '10px', position: 'relative' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button 
                className={`btn-sync-premium ${activeHint === "import_athletes" ? "hint-pulse" : ""}`} 
                onClick={() => { handleSyncOnline(); clearHint(); }} 
                disabled={syncing}
                data-hint="ĐỒNG BỘ CLOUD"
                title={`Sync với Tournament ID: ${tournament.id}`}
                style={{ 
                  background: 'linear-gradient(135deg, #0284c7, #0369a1)', 
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: '8px 0 0 8px',
                  border: 'none',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.3)',
                  cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: '18px' }}>☁️</span>
                {syncing ? "Đang đồng bộ..." : "Đồng bộ từ Cloud"}
              </button>
              <button
                onClick={() => setShowCloudIdModal(true)}
                disabled={syncing}
                title="Sync với Cloud ID tùy chỉnh (khi ID local khác cloud)"
                style={{
                  background: 'linear-gradient(135deg, #0369a1, #1e3a5f)',
                  color: '#fff',
                  padding: '10px 12px',
                  borderRadius: '0 8px 8px 0',
                  border: 'none',
                  borderLeft: '1px solid rgba(255,255,255,0.2)',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.3)',
                }}
              >
                🔧
              </button>
            </div>

            <button className="btn btn-secondary" onClick={handleExportExcel} style={{ borderRadius: '8px' }}>
              📥 Xuất Excel
            </button>
            
            <button className="btn btn-secondary" onClick={handleExportPDF} style={{ borderRadius: '8px' }}>
              📄 Xuất PDF
            </button>

            <div style={{ position: 'relative' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowCleanupMenu(!showCleanupMenu)}
                disabled={withdrawingAthletes}
                style={{ 
                  borderRadius: '8px', 
                  borderColor: showCleanupMenu ? '#ef4444' : '#e2e8f0',
                  color: showCleanupMenu ? '#ef4444' : 'inherit'
                }}
              >
                🛠️ Công cụ Admin {showCleanupMenu ? '▼' : '▶'}
              </button>
              
              {showCleanupMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '10px',
                  background: '#fff',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  padding: '8px',
                  zIndex: 100,
                  width: '260px',
                  border: '1px solid #e2e8f0'
                }}>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setWithdrawClubName(filterClub === "all" ? "" : filterClub);
                      setSelectedWithdrawAthleteIds([]);
                      setShowWithdrawAthletesModal(true);
                      setShowCleanupMenu(false);
                    }}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px', borderRadius: '6px',
                      background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                      color: '#b45309'
                    }}
                  >
                    <span>🚪</span> <strong>Chọn VĐV rút lui</strong>
                  </button>
                  <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }} />
                  <button 
                    className="menu-item"
                    onClick={() => { handleClearAllLocal(); setShowCleanupMenu(false); }}
                    style={{ 
                      width: '100%', textAlign: 'left', padding: '10px', borderRadius: '6px', 
                      background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                      color: '#ef4444'
                    }}
                  >
                    <span>🗑️</span> <strong>Xóa sạch dữ liệu địa phương</strong>
                  </button>
                  <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }} />
                  <button 
                    className="menu-item"
                    onClick={() => { handleClearCloudData(); setShowCleanupMenu(false); }}
                    style={{ 
                      width: '100%', textAlign: 'left', padding: '10px', borderRadius: '6px', 
                      background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                      color: '#64748b'
                    }}
                  >
                    <span>🧹</span> <strong>Xóa dữ liệu trên Cloud</strong>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="filter-bar">
          <div className="search-filter">
            <input
              type="text"
              placeholder="🔍 Tìm VĐV, CLB..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="filter-select"
            >
              <option value="all">- Mọi hạng mục -</option>
              {tournament.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <select
              value={filterClub}
              onChange={(e) => setFilterClub(e.target.value)}
              className="filter-select"
            >
              <option value="all">- Mọi Câu Lạc Bộ -</option>
              {uniqueClubs.map((club) => (
                <option key={club} value={club}>
                  {club}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
              className="filter-select"
            >
              <option value="all">- Mọi giới tính -</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
            </select>
          </div>
        </div>

        <div className="table-responsive" style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
          <table className="athletes-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Tên VĐV</th>
                <th>Giới/NămSinh</th>
                <th>CLB</th>
                <th>Hạng mục</th>
                <th className="actions-col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredAthletes.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                    Không tìm thấy VĐV nào phù hợp!
                  </td>
                </tr>
              ) : (
                filteredAthletes.map((a, idx) => (
                  <tr key={a.id}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td>
                      {a.gender === "male" ? "Nam" : a.gender === "female" ? "Nữ" : "—"}{" "}
                      {a.birthDate || a.birthYear ? `(${a.birthDate || a.birthYear})` : ""}
                    </td>
                    <td>{a.club || "—"}</td>
                    <td>
                      <span className="cat-badge">
                         {a.categoryName}
                      </span>
                    </td>
                    <td className="actions-col">
                      <button className="btn-icon text-blue" onClick={() => handleEdit(a)} title="Sửa thông tin">
                        ✏️
                      </button>
                      <button className="btn-icon text-orange" onClick={() => handleMoveClick(a)} title="Chuyển hạng cân">
                        🔄
                      </button>
                       <button className="btn-icon text-red" onClick={() => handleDeleteClick(a.id)} title="Xóa VĐV">
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', color: '#64748b', fontSize: '13px' }}>
             Hiển thị <strong>{filteredAthletes.length}</strong> / {allAthletes.length} VĐV
          </div>
        </div>

        <Modal
          isOpen={showWithdrawAthletesModal}
          onClose={() => {
            setShowWithdrawAthletesModal(false);
            setWithdrawClubName("");
            setSelectedWithdrawAthleteIds([]);
          }}
          title="Chọn VĐV rút lui"
        >
          <div style={{ padding: "10px" }}>
            <p style={{ margin: "0 0 16px", color: "#64748b", lineHeight: 1.6 }}>
              Chọn CLB, sau đó tích đúng những VĐV rút lui. Các thành viên không
              được tích vẫn được giữ nguyên trên Cloud và trong giải đấu.
            </p>
            <div className="form-group">
              <label>CLB</label>
              <select
                className="form-control"
                value={withdrawClubName}
                onChange={(event) => {
                  setWithdrawClubName(event.target.value);
                  setSelectedWithdrawAthleteIds([]);
                }}
              >
                <option value="">-- Chọn CLB --</option>
                {uniqueClubs.map((club) => (
                  <option key={club} value={club}>
                    {club} ({allAthletes.filter((athlete) => normalizeClubName(athlete.club) === normalizeClubName(club)).length} VĐV)
                  </option>
                ))}
              </select>
            </div>
            {withdrawClubName && (
              <div style={{ marginTop: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                  <strong>Danh sách VĐV ({athletesInWithdrawClub.length})</strong>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={
                        athletesInWithdrawClub.length > 0 &&
                        selectedWithdrawAthleteIds.length === athletesInWithdrawClub.length
                      }
                      onChange={(event) =>
                        setSelectedWithdrawAthleteIds(
                          event.target.checked
                            ? athletesInWithdrawClub.map((athlete) => athlete.id)
                            : []
                        )
                      }
                    />
                    Chọn tất cả
                  </label>
                </div>
                <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                  {athletesInWithdrawClub.map((athlete) => (
                    <label
                      key={athlete.id}
                      style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: "8px", alignItems: "start", padding: "10px 12px", borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedWithdrawAthleteIds.includes(athlete.id)}
                        onChange={(event) =>
                          setSelectedWithdrawAthleteIds((current) =>
                            event.target.checked
                              ? [...current, athlete.id]
                              : current.filter((id) => id !== athlete.id)
                          )
                        }
                      />
                      <span>
                        <strong>{athlete.name}</strong>
                        <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "2px" }}>
                          {athlete.categoryName}
                          {athlete.birthDate || athlete.birthYear
                            ? ` · ${athlete.birthDate || athlete.birthYear}`
                            : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: "8px", color: "#b45309", fontSize: "13px" }}>
                  Đã chọn: <strong>{selectedWithdrawAthleteIds.length}</strong> VĐV
                </div>
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: "20px" }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowWithdrawAthletesModal(false);
                  setWithdrawClubName("");
                  setSelectedWithdrawAthleteIds([]);
                }}
              >
                Hủy
              </button>
              <button
                className="btn btn-danger"
                onClick={handleWithdrawAthletes}
                disabled={!withdrawClubName || selectedWithdrawAthleteIds.length === 0}
              >
                Xác nhận {selectedWithdrawAthleteIds.length} VĐV rút lui
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal chỉnh sửa */}
        <Modal
          isOpen={!!editingAthlete}
          onClose={() => setEditingAthlete(null)}
          title="Chỉnh sửa VĐV"
        >
          {editingAthlete && (
            <AthleteForm
              initialData={editingAthlete}
              onSubmit={handleSaveAthlete}
              onCancel={() => setEditingAthlete(null)}
              category={tournament.categories.find(c => c.id === editingAthlete.categoryId)}
            />
          )}
        </Modal>

        {/* Modal chuyển hạng mục */}
        <Modal
          isOpen={!!movingAthlete}
          onClose={() => setMovingAthlete(null)}
          title="Chuyển hạng mục thi đấu"
        >
          {movingAthlete && (
            <div style={{ padding: "10px" }}>
              <p style={{ marginBottom: "16px" }}>
                VĐV: <strong>{movingAthlete.name}</strong>
                <br />
                Đang ở nội dung: <span style={{ color: "#ef4444", fontWeight: 600 }}>{movingAthlete.categoryName}</span>
              </p>
              <div className="form-group">
                <label>Chọn nội dung mới:</label>
                <select
                  className="form-control"
                  value={targetCategory}
                  onChange={(e) => setTargetCategory(e.target.value)}
                >
                  {tournament.categories.map(c => (
                    <option key={c.id} value={c.id} disabled={c.id === movingAthlete.categoryId}>
                      {c.name} {c.id === movingAthlete.categoryId ? "(Hiện tại)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions" style={{ marginTop: "20px" }}>
                <button className="btn btn-secondary" onClick={() => setMovingAthlete(null)}>
                  Hủy
                </button>
                <button className="btn btn-primary" onClick={handleConfirmMove}>
                  Xác nhận chuyển
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Modal đổi Cloud ID */}
        {showCloudIdModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{
              background: '#fff', borderRadius: '16px', padding: '28px',
              width: '480px', maxWidth: '90vw',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)'
            }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700 }}>🔧 Sync với Cloud ID tùy chỉnh</h3>
              <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '14px', lineHeight: 1.6 }}>
                Dùng khi ID giải đấu local <strong>không khớp</strong> với ID trên Cloud (ví dụ: sau khi tạo lại giải đấu).
                Nhập <strong>Tournament ID trên Supabase</strong> để kéo dữ liệu về.
              </p>
              
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Cloud Tournament ID
                </label>
                <input
                  type="text"
                  value={customCloudId}
                  onChange={e => setCustomCloudId(e.target.value.trim())}
                  placeholder="ví dụ: d3c564c9-3ff3-4d71-9d7f-9d3a93851f64"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 14px', borderRadius: '8px',
                    border: '1.5px solid #cbd5e1', fontSize: '13px',
                    fontFamily: 'monospace', outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.target.style.borderColor = '#0284c7'}
                  onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                />
              </div>

              <div style={{ background: '#f0f9ff', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '12px', color: '#0369a1' }}>
                <strong>ID local hiện tại:</strong><br/>
                <code style={{ fontSize: '11px' }}>{tournament.id}</code>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowCloudIdModal(false); setCustomCloudId(""); }}
                  style={{
                    padding: '9px 20px', borderRadius: '8px',
                    border: '1.5px solid #e2e8f0', background: '#fff',
                    cursor: 'pointer', fontWeight: 600, color: '#64748b'
                  }}
                >Hủy</button>
                <button
                  onClick={() => {
                    if (!customCloudId) { toast.error('Vui lòng nhập Cloud ID!'); return; }
                    setShowCloudIdModal(false);
                    handleSyncOnline(customCloudId);
                    clearHint();
                  }}
                  style={{
                    padding: '9px 20px', borderRadius: '8px',
                    border: 'none', background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    color: '#fff', cursor: 'pointer', fontWeight: 600
                  }}
                >☁️ Đồng bộ ngay</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal xóa */}
        <ConfirmDialog
          isOpen={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(p => ({ ...p, open: false }))}
          type={confirmDialog.type}
          confirmText="Xác nhận"
          cancelText="Hủy"
        />
      </div>
    </div>
  );
}
