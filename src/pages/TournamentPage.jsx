import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useTournament,
  useTournamentDispatch,
  ACTIONS,
} from "../context/TournamentContext";
import Modal from "../components/common/Modal";
import { exportAllBracketsToPDF } from "../services/pdfService";
import {
  parseCategoriesExcel,
  generateCategoriesTemplate,
} from "../services/excelService";
import {
  createKrtData,
  encodeKrtFile,
  validateKrtData,
} from "../services/krtService";
import { createKmatchData, saveKmatchFile } from "../services/matchService";
import "./TournamentPage.css";

export default function TournamentPage() {
  const { id } = useParams();
  const { tournaments, currentTournament } = useTournament();
  const dispatch = useTournamentDispatch();
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "kumite",
    gender: "male",
    ageGroup: "",
    weightClass: "",
    format: "single_elimination",
  });

  useEffect(() => {
    dispatch({ type: ACTIONS.SET_CURRENT_TOURNAMENT, payload: id });
  }, [id, dispatch]);

  const tournament = currentTournament || tournaments.find((t) => t.id === id);
  if (!tournament) {
    return (
      <div className="page">
        <div className="container">
          <div className="not-found">
            <h2>Không tìm thấy giải đấu</h2>
            <Link to="/admin" className="btn btn-primary">
              Về quản lý giải đấu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    dispatch({
      type: ACTIONS.ADD_CATEGORY,
      payload: {
        tournamentId: tournament.id,
        ...formData,
      },
    });

    setFormData({
      name: "",
      type: "kumite",
      gender: "male",
      ageGroup: "",
      weightClass: "",
      format: "single_elimination",
    });
    setShowModal(false);
  };

  const handleDeleteCategory = (categoryId) => {
    if (confirm("Bạn có chắc muốn xóa hạng mục này?")) {
      dispatch({ type: ACTIONS.DELETE_CATEGORY, payload: categoryId });
    }
  };

  const getTotalAthletes = () => {
    return tournament.categories.reduce(
      (sum, cat) => sum + (cat.athletes?.length || 0),
      0
    );
  };

  // --- KRT Export Logic ---
  const [showKrtModal, setShowKrtModal] = useState(false);
  const [krtFormData, setKrtFormData] = useState({
    startTime: "",
    endTime: "",
    events: [],
  });
  const [newEvent, setNewEvent] = useState({
    name: "",
    gender: "any",
    type: "kumite",
    weightMin: "",
    weightMax: "",
  });

  const handleOpenKrtModal = () => {
    const events = (tournament.categories || []).map((cat) => ({
      id: cat.id,
      name: cat.name,
      gender: cat.gender || "any",
      type: cat.type || "kumite",
      weightMin: cat.weightMin,
      weightMax: cat.weightMax,
    }));

    // Default times
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    setKrtFormData({
      startTime: tomorrow.toISOString().slice(0, 16),
      endTime: nextWeek.toISOString().slice(0, 16),
      events,
    });
    setShowKrtModal(true);
  };

  const handleAddEvent = () => {
    if (!newEvent.name.trim()) return;
    const event = {
      id: crypto.randomUUID(),
      ...newEvent,
      weightMin: newEvent.weightMin
        ? parseFloat(newEvent.weightMin)
        : undefined,
      weightMax: newEvent.weightMax
        ? parseFloat(newEvent.weightMax)
        : undefined,
    };
    setKrtFormData((prev) => ({ ...prev, events: [...prev.events, event] }));
    setNewEvent({
      name: "",
      gender: "any",
      type: "kumite",
      weightMin: "",
      weightMax: "",
    });
  };

  const handleRemoveEvent = (eventId) => {
    setKrtFormData((prev) => ({
      ...prev,
      events: prev.events.filter((e) => e.id !== eventId),
    }));
  };

  const handleExportKrt = async () => {
    const krtData = createKrtData({
      id: tournament.id,
      name: tournament.name,
      events: krtFormData.events,
      startTime: new Date(krtFormData.startTime).toISOString(),
      endTime: new Date(krtFormData.endTime).toISOString(),
    });

    const validation = validateKrtData(krtData);
    if (!validation.valid) {
      alert("Lỗi:\n" + validation.errors.join("\n"));
      return;
    }

    const content = encodeKrtFile(krtData);
    const suggestedName = `${tournament.name.replace(
      /[^a-zA-Z0-9\u00C0-\u1EF9]/g,
      "_"
    )}.krt`;

    try {
      if (window.electronAPI?.saveKrtFile) {
        const result = await window.electronAPI.saveKrtFile(
          content,
          suggestedName
        );
        if (result.success) {
          alert("Đã xuất file .krt thành công!");
          setShowKrtModal(false);
        } else if (!result.canceled) alert("Lỗi: " + result.error);
      } else {
        const blob = new Blob([content], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = suggestedName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("Đã xuất file .krt thành công!");
        setShowKrtModal(false);
      }
    } catch (error) {
      alert("Lỗi xuất file: " + error.message);
    }
  };

  // --- KMatch Export Logic ---
  const [showKmatchModal, setShowKmatchModal] = useState(false);
  const [kmatchSettings, setKmatchSettings] = useState({
    scoringEnabled: true,
    startTime: "",
    endTime: "",
  });

  const handleOpenKmatchModal = () => {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    setKmatchSettings({
      scoringEnabled: true,
      startTime: now.toISOString().slice(0, 16),
      endTime: nextWeek.toISOString().slice(0, 16),
    });
    setShowKmatchModal(true);
  };

  const handleExportKmatch = async () => {
    try {
      const kmatchData = createKmatchData(
        tournament,
        tournament.categories || [],
        kmatchSettings
      );
      const suggestedName = `match_${tournament.id.slice(0, 6)}.kmatch`;
      const result = await saveKmatchFile(kmatchData, suggestedName);

      if (result.success) {
        alert("Đã xuất file chấm điểm (.kmatch) thành công!");
        setShowKmatchModal(false);
      } else if (!result.canceled) alert("Lỗi xuất file: " + result.error);
    } catch (error) {
      alert("Lỗi: " + error.message);
    }
  };

  const handleExportAllPDF = async () => {
    const categoriesWithBracket = tournament.categories.filter(
      (c) => c.bracket
    );
    if (categoriesWithBracket.length === 0) {
      alert("Chưa có hạng mục nào đã bốc thăm!");
      return;
    }
    await exportAllBracketsToPDF(tournament.categories, tournament.name);
  };

  const handleImportCategories = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const { categories, errors } = await parseCategoriesExcel(file);

      if (errors.length > 0) {
        alert("Có lỗi khi đọc file:\n" + errors.join("\n"));
      }

      if (categories.length > 0) {
        dispatch({
          type: ACTIONS.IMPORT_CATEGORIES,
          payload: {
            tournamentId: tournament.id,
            categories,
          },
        });
        alert(`Đã import ${categories.length} hạng mục thành công!`);
      } else {
        alert("Không tìm thấy hạng mục nào trong file.");
      }
    } catch (error) {
      alert("Lỗi: " + error.message);
    }

    // Reset file input
    e.target.value = "";
  };

  const handleDownloadTemplate = () => {
    generateCategoriesTemplate();
  };
  return (
    <div className="page tournament-page">
      <div className="container">
        <nav className="breadcrumb">
          <Link to="/admin" className="back-link">
            ← Quay lại
          </Link>
          <span className="breadcrumb-separator">|</span>
          <Link to="/admin">Quản lý giải đấu</Link>
          <span>/</span>
          <span>{tournament.name}</span>
        </nav>

        <header className="page-header">
          <div>
            <h1 className="page-title">{tournament.name}</h1>
            <div className="tournament-meta">
              <span>
                📅 {new Date(tournament.date).toLocaleDateString("vi-VN")}
              </span>
              {tournament.location && <span>📍 {tournament.location}</span>}
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-secondary btn-lg"
              onClick={handleOpenKrtModal}
              title="Xuất file .krt cho HLV đăng ký"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginRight: "8px" }}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Xuất (.krt)
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={handleOpenKmatchModal}
              title="Xuất file chấm điểm cho Thư ký"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginRight: "8px" }}
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              Xuất (.kmatch)
            </button>
            {tournament.categories.filter((c) => c.bracket).length > 0 && (
              <button
                className="btn btn-secondary btn-lg"
                onClick={handleExportAllPDF}
              >
                📄 Xuất tất cả PDF
              </button>
            )}
            <button
              className="btn btn-secondary btn-lg"
              onClick={handleDownloadTemplate}
            >
              📥 Tải mẫu Excel
            </button>
            <label
              className="btn btn-secondary btn-lg"
              style={{ cursor: "pointer" }}
            >
              📤 Import từ Excel
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportCategories}
                style={{ display: "none" }}
              />
            </label>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setShowModal(true)}
            >
              + Thêm hạng mục
            </button>
          </div>
        </header>

        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-value">{tournament.categories.length}</span>
            <span className="stat-label">Hạng mục</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{getTotalAthletes()}</span>
            <span className="stat-label">Vận động viên</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">
              {tournament.categories.filter((c) => c.bracket).length}
            </span>
            <span className="stat-label">Đã bốc thăm</span>
          </div>
        </div>

        {tournament.categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>Chưa có hạng mục nào</h3>
            <p>Thêm các hạng mục thi đấu như Kumite Nam -60kg, Kata Nữ...</p>
            <button
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
            >
              Thêm hạng mục
            </button>
          </div>
        ) : (
          <div className="categories-grid">
            {tournament.categories.map((category) => (
              <div key={category.id} className="category-card card">
                <div className="category-header">
                  <span className={`category-type ${category.type}`}>
                    {category.type === "kumite" ? "⚔️ Kumite" : "🥋 Kata"}
                  </span>
                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteCategory(category.id)}
                    title="Xóa"
                  >
                    🗑️
                  </button>
                </div>

                <h3 className="category-name">{category.name}</h3>

                <div className="category-info">
                  <span className="badge">
                    {category.gender === "male"
                      ? "👨 Nam"
                      : category.gender === "female"
                      ? "👩 Nữ"
                      : "👥 Hỗn hợp"}
                  </span>
                  {category.weightClass && (
                    <span className="badge">{category.weightClass}</span>
                  )}
                  {category.ageGroup && (
                    <span className="badge">{category.ageGroup}</span>
                  )}
                </div>

                <div className="category-stats">
                  <span>{category.athletes?.length || 0} VĐV</span>
                  <span>•</span>
                  <span
                    className={
                      category.bracket ? "status-done" : "status-pending"
                    }
                  >
                    {category.bracket ? "✓ Đã bốc thăm" : "Chưa bốc thăm"}
                  </span>
                </div>

                <Link
                  to={`/category/${category.id}`}
                  className="btn btn-secondary"
                >
                  Quản lý →
                </Link>
              </div>
            ))}
          </div>
        )}

        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title="Thêm hạng mục mới"
        >
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Tên hạng mục *</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="VD: Kumite Nam -60kg"
                required
              />
            </div>

            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Nội dung</label>
                <select
                  className="input"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, type: e.target.value }))
                  }
                >
                  <option value="kumite">⚔️ Kumite (Đối kháng)</option>
                  <option value="kata">🥋 Kata (Quyền)</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Giới tính</label>
                <select
                  className="input"
                  value={formData.gender}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, gender: e.target.value }))
                  }
                >
                  <option value="male">👨 Nam</option>
                  <option value="female">👩 Nữ</option>
                  <option value="mixed">👥 Hỗn hợp</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Hạng cân</label>
                <input
                  type="text"
                  className="input"
                  value={formData.weightClass}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      weightClass: e.target.value,
                    }))
                  }
                  placeholder="VD: -60kg, -67kg"
                />
              </div>

              <div className="input-group">
                <label className="input-label">Lứa tuổi</label>
                <input
                  type="text"
                  className="input"
                  value={formData.ageGroup}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      ageGroup: e.target.value,
                    }))
                  }
                  placeholder="VD: U18, Senior"
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Thể thức</label>
              <select
                className="input"
                value={formData.format}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, format: e.target.value }))
                }
              >
                <option value="single_elimination">
                  Loại trực tiếp (Single Elimination)
                </option>
                <option value="repechage">Có vòng đấu vớt (Repechage)</option>
              </select>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Thêm hạng mục
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal xuất KRT */}
        <Modal
          isOpen={showKrtModal}
          onClose={() => setShowKrtModal(false)}
          title="Xuất file .krt cho HLV"
        >
          <div className="krt-form">
            <p className="krt-description">
              File .krt chứa thông tin giải đấu và thời gian cho phép HLV nhập
              danh sách VĐV.
            </p>
            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Thời gian bắt đầu nhập *</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={krtFormData.startTime}
                  onChange={(e) =>
                    setKrtFormData((prev) => ({
                      ...prev,
                      startTime: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="input-group">
                <label className="input-label">Thời gian kết thúc nhập *</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={krtFormData.endTime}
                  onChange={(e) =>
                    setKrtFormData((prev) => ({
                      ...prev,
                      endTime: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="events-section">
              <h4>Nội dung thi đấu ({krtFormData.events.length})</h4>
              {krtFormData.events.length > 0 && (
                <div className="events-list">
                  {krtFormData.events.map((event) => (
                    <div key={event.id} className="event-item">
                      <span>{event.name}</span>
                      <button
                        type="button"
                        className="remove-event-btn"
                        onClick={() => handleRemoveEvent(event.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="add-event-form">
                <input
                  type="text"
                  className="input"
                  value={newEvent.name}
                  onChange={(e) =>
                    setNewEvent((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Tên nội dung (VD: Kumite Nam -60kg)"
                />
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <select
                    className="input"
                    value={newEvent.gender}
                    onChange={(e) =>
                      setNewEvent((prev) => ({
                        ...prev,
                        gender: e.target.value,
                      }))
                    }
                  >
                    <option value="any">Tất cả</option>
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                  <select
                    className="input"
                    value={newEvent.type}
                    onChange={(e) =>
                      setNewEvent((prev) => ({ ...prev, type: e.target.value }))
                    }
                  >
                    <option value="kumite">Kumite</option>
                    <option value="kata">Kata</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddEvent}
                  >
                    + Thêm
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowKrtModal(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExportKrt}
              >
                📤 Xuất file .krt
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal xuất KMatch */}
        <Modal
          isOpen={showKmatchModal}
          onClose={() => setShowKmatchModal(false)}
          title="Xuất file chấm điểm cho Thư ký"
        >
          <div className="krt-form">
            <p className="krt-description">
              Tạo file .kmatch chứa thông tin trận đấu để Thư ký nhập điểm.
            </p>
            <div className="input-group">
              <label
                className="checkbox-label"
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={kmatchSettings.scoringEnabled}
                  onChange={(e) =>
                    setKmatchSettings((prev) => ({
                      ...prev,
                      scoringEnabled: e.target.checked,
                    }))
                  }
                />
                Cho phép nhập điểm ngay
              </label>
            </div>
            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Thời gian bắt đầu nhập</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={kmatchSettings.startTime}
                  onChange={(e) =>
                    setKmatchSettings((prev) => ({
                      ...prev,
                      startTime: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="input-group">
                <label className="input-label">Thời gian kết thúc nhập</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={kmatchSettings.endTime}
                  onChange={(e) =>
                    setKmatchSettings((prev) => ({
                      ...prev,
                      endTime: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowKmatchModal(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExportKmatch}
              >
                🎯 Xuất file .kmatch
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
