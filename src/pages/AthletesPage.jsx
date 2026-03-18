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
import { fetchSubmissions, deleteSubmissions } from "../services/supabaseService";
import appIcon from "../assets/icon.png";
import * as XLSX from "xlsx";
import "./AthletesPage.css";

export default function AthletesPage() {
  const { id } = useParams();
  const { tournaments } = useTournament();
  const dispatch = useTournamentDispatch();
  const { toast } = useToast();

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

  const handleSyncOnline = async () => {
    setSyncing(true);
    try {
      const result = await fetchSubmissions(tournament.id);
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
              if (!athletesToImportMap[a.eventId]) athletesToImportMap[a.eventId] = [];
              // Force athlete club to match the submission club to avoid "missing info" bugs
              athletesToImportMap[a.eventId].push({ ...a, club: clubName });
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
        @page { size: landscape; margin: 10mm; }
        body { font-family: 'Times New Roman', Times, serif; color: #000; padding: 10px; }
        h2 { text-align: center; font-size: 18px; font-weight: bold; text-transform: uppercase; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { color: #000; padding: 8px 6px; text-align: center; font-size: 12px; font-weight: bold; border: 1px solid #000; background-color: #f1f5f9; }
        td { padding: 6px; border: 1px solid #000; }
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
            <button 
              className="btn-sync-premium" 
              onClick={handleSyncOnline} 
              disabled={syncing}
              style={{ 
                background: 'linear-gradient(135deg, #0284c7, #0369a1)', 
                color: '#fff',
                padding: '10px 20px',
                borderRadius: '8px',
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
                  width: '220px',
                  border: '1px solid #e2e8f0'
                }}>
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
