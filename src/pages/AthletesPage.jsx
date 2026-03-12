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
import * as XLSX from "xlsx";
import appIcon from "../assets/icon.png";
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
    athleteId: null,
  });

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
    setConfirmDialog({ open: true, athleteId });
  };

  const handleConfirmDelete = () => {
    dispatch({
      type: ACTIONS.DELETE_ATHLETE,
      payload: confirmDialog.athleteId,
    });
    setConfirmDialog({ open: false, athleteId: null });
    toast.success("Đã xóa VĐV");
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
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={handleExportExcel}>
              📥 Xuất Excel
            </button>
            <button className="btn btn-secondary" onClick={handleExportPDF}>
              📄 Xuất PDF
            </button>
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
          title="Xóa VĐV"
          message="Bạn có chắc chắn muốn xóa VĐV này? VĐV sẽ bị xóa khỏi hạng mục hiện tại."
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDialog({ open: false, athleteId: null })}
        />
      </div>
    </div>
  );
}
