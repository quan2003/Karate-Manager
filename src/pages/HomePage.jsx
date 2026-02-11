import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useTournament,
  useTournamentDispatch,
  ACTIONS,
} from "../context/TournamentContext";
import { useRole, ROLES } from "../context/RoleContext";
import {
  createKrtData,
  encodeKrtFile,
  validateKrtData,
} from "../services/krtService";
import { createKmatchData, saveKmatchFile } from "../services/matchService";
import { importCoachFile } from "../services/adminImportService";
import Modal from "../components/common/Modal";
import DateInput from "../components/common/DateInput";
import "./HomePage.css";

export default function HomePage() {
  const navigate = useNavigate();
  const { tournaments } = useTournament();
  const dispatch = useTournamentDispatch();
  const { role, resetRole } = useRole();
  const [showModal, setShowModal] = useState(false);
  const [showKrtModal, setShowKrtModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [editingTournament, setEditingTournament] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    location: "",
  });

  // KRT Form Data
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

  // Redirect nếu không phải Admin
  if (role !== ROLES.ADMIN) {
    navigate("/");
    return null;
  }

  const resetForm = () => {
    setFormData({
      name: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0],
      location: "",
    });
    setEditingTournament(null);
  };

  const handleOpenModal = (tournament = null) => {
    if (tournament) {
      setEditingTournament(tournament);
      setFormData({
        name: tournament.name,
        startDate:
          tournament.startDate ||
          tournament.date ||
          new Date().toISOString().split("T")[0],
        endDate:
          tournament.endDate ||
          tournament.date ||
          new Date().toISOString().split("T")[0],
        location: tournament.location || "",
      });
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingTournament) {
      dispatch({
        type: ACTIONS.UPDATE_TOURNAMENT,
        payload: {
          id: editingTournament.id,
          ...formData,
          date: formData.startDate,
        },
      });
    } else {
      dispatch({
        type: ACTIONS.ADD_TOURNAMENT,
        payload: {
          ...formData,
          date: formData.startDate,
        },
      });
    }

    handleCloseModal();
  };

  const handleDelete = (id) => {
    if (confirm("Bạn có chắc muốn xóa giải đấu này?")) {
      dispatch({ type: ACTIONS.DELETE_TOURNAMENT, payload: id });
    }
  };

  // Mở modal xuất KRT
  const handleOpenKrtModal = (tournament) => {
    setSelectedTournament(tournament);

    // Lấy events từ categories nếu có
    const events = (tournament.categories || []).map((cat) => ({
      id: cat.id,
      name: cat.name,
      gender: cat.gender || "any",
      type: cat.type || "kumite",
      weightMin: cat.weightMin,
      weightMax: cat.weightMax,
    }));

    // Set default times
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

  // Thêm event mới
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

    setKrtFormData((prev) => ({
      ...prev,
      events: [...prev.events, event],
    }));

    setNewEvent({
      name: "",
      gender: "any",
      type: "kumite",
      weightMin: "",
      weightMax: "",
    });
  };

  // Xóa event
  const handleRemoveEvent = (eventId) => {
    setKrtFormData((prev) => ({
      ...prev,
      events: prev.events.filter((e) => e.id !== eventId),
    }));
  };

  // KMatch State
  const [showKmatchModal, setShowKmatchModal] = useState(false);
  const [kmatchSettings, setKmatchSettings] = useState({
    scoringEnabled: true,
    startTime: "",
    endTime: "",
  });

  // Mở modal xuất KMatch
  const handleOpenKmatchModal = (tournament) => {
    setSelectedTournament(tournament);
    // Default times: similar to KRT
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    setKmatchSettings({
      scoringEnabled: true,
      startTime: now.toISOString().slice(0, 16),
      endTime: nextWeek.toISOString().slice(0, 16),
    });

    setShowKmatchModal(true);
  };

  // Xuất file KMatch
  const handleExportKmatch = async () => {
    try {
      // Lấy dữ liệu giải đấu mới nhất từ Context để đảm bảo có đầy đủ bracket
      // selectedTournament có thể bị cũ (stale state)
      const freshTournament =
        tournaments.find((t) => t.id === selectedTournament.id) ||
        selectedTournament;

      const categories = freshTournament.categories || [];

      const kmatchData = createKmatchData(
        freshTournament,
        categories,
        kmatchSettings
      );

      const suggestedName = `match_${freshTournament.id.slice(0, 6)}.kmatch`;
      const result = await saveKmatchFile(kmatchData, suggestedName);

      if (result.success) {
        alert(
          "Đã xuất file chấm điểm (.kmatch) thành công! Gửi file này cho Thư ký."
        );
        setShowKmatchModal(false);
      } else if (!result.canceled) {
        alert("Lỗi xuất file: " + result.error);
      }
    } catch (error) {
      alert("Lỗi: " + error.message);
    }
  };

  // Xuất file KRT
  const handleExportKrt = async () => {
    const krtData = createKrtData({
      id: selectedTournament.id,
      name: selectedTournament.name,
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
    const suggestedName = `${selectedTournament.name.replace(
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
        } else if (!result.canceled) {
          alert("Lỗi: " + result.error);
        }
      } else {
        // Browser fallback
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

  // Import file từ HLV
  const handleImportCoachFile = async () => {
    try {
      const result = await importCoachFile();

      if (result.success) {
        setImportResult(result);
        setShowImportModal(true);
      } else if (!result.canceled) {
        alert("Lỗi: " + result.error);
      }
    } catch (error) {
      alert("Lỗi import: " + error.message);
    }
  };

  // Chấp nhận import
  const handleAcceptImport = () => {
    if (!importResult) return;

    // TODO: Add athletes to tournament
    const tournament = tournaments.find(
      (t) => t.id === importResult.data.tournamentId
    );
    if (tournament) {
      // Import logic here - dispatch action to add athletes
      alert(
        `Đã import ${importResult.data.athletes.length} VĐV từ ${importResult.data.coachName}!`
      );
    } else {
      alert("Không tìm thấy giải đấu phù hợp với Tournament ID trong file!");
    }

    setShowImportModal(false);
    setImportResult(null);
  };

  // Quay lại chọn role
  const handleBackToRoleSelect = () => {
    resetRole();
    navigate("/");
  };

  return (
    <div className="page home-page">
      <div className="container">
        <header className="page-header">
          <div>
            <button className="back-btn" onClick={handleBackToRoleSelect}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginRight: "6px" }}
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Đổi vai trò
            </button>
            <h1 className="page-title">🥋 Karate Tournament Manager</h1>
            <p className="page-subtitle">
              Hệ thống quản lý & bốc thăm thi đấu Karate (Admin)
            </p>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-secondary btn-lg"
              onClick={handleImportCoachFile}
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
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Import từ HLV
            </button>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => handleOpenModal()}
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Tạo giải đấu mới
            </button>
          </div>
        </header>

        {tournaments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#64748b"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="7" />
                <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
              </svg>
            </div>
            <h3>Chưa có giải đấu nào</h3>
            <p>Tạo giải đấu đầu tiên để bắt đầu quản lý và bốc thăm.</p>
            <button
              className="btn btn-primary"
              onClick={() => handleOpenModal()}
            >
              Tạo giải đấu
            </button>
          </div>
        ) : (
          <div className="tournaments-grid">
            {tournaments.map((tournament) => (
              <div key={tournament.id} className="tournament-card card">
                <div className="tournament-header">
                  <h3 className="tournament-name">{tournament.name}</h3>
                  <div className="tournament-actions">
                    <button
                      className="action-btn edit-btn"
                      onClick={() => handleOpenModal(tournament)}
                      title="Chỉnh sửa giải đấu"
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
                      >
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
                    <button
                      className="action-btn delete-btn"
                      onClick={() => handleDelete(tournament.id)}
                      title="Xóa giải đấu"
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
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="tournament-info">
                  <div className="info-item">
                    <span className="info-icon">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect
                          x="3"
                          y="4"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </span>
                    <span>
                      {new Date(
                        tournament.startDate || tournament.date
                      ).toLocaleDateString("vi-VN")}
                      {tournament.endDate &&
                        tournament.endDate !== tournament.startDate && (
                          <>
                            {" "}
                            -{" "}
                            {new Date(tournament.endDate).toLocaleDateString(
                              "vi-VN"
                            )}
                          </>
                        )}
                    </span>
                  </div>
                  {tournament.location && (
                    <div className="info-item">
                      <span className="info-icon">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </span>
                      <span>{tournament.location}</span>
                    </div>
                  )}
                  <div className="info-item">
                    <span className="info-icon">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </span>
                    <span>{tournament.categories?.length || 0} hạng mục</span>
                  </div>
                </div>

                <Link
                  to={`/tournament/${tournament.id}`}
                  className="btn btn-secondary tournament-link"
                >
                  Mở giải đấu →
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Modal tạo/sửa giải đấu */}
        <Modal
          isOpen={showModal}
          onClose={handleCloseModal}
          title={editingTournament ? "Chỉnh sửa giải đấu" : "Tạo giải đấu mới"}
        >
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Tên giải đấu *</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="VD: Vô địch Karate Quốc gia 2026"
                required
              />
            </div>{" "}
            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Ngày bắt đầu</label>
                <DateInput
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="input-group">
                <label className="input-label">Ngày kết thúc</label>
                <DateInput
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      endDate: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Địa điểm</label>
              <input
                type="text"
                className="input"
                value={formData.location}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, location: e.target.value }))
                }
                placeholder="VD: Nhà thi đấu Quốc gia"
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCloseModal}
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                {editingTournament ? "Lưu thay đổi" : "Tạo giải đấu"}
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
                <select
                  className="input"
                  value={newEvent.gender}
                  onChange={(e) =>
                    setNewEvent((prev) => ({ ...prev, gender: e.target.value }))
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

        {/* Modal import từ HLV */}
        <Modal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          title="Xem trước dữ liệu từ HLV"
        >
          {importResult && (
            <div className="import-preview">
              <div className="import-info">
                <div className="info-row">
                  <strong>HLV/CLB:</strong> {importResult.data.coachName}
                </div>
                <div className="info-row">
                  <strong>Thời gian xuất:</strong>{" "}
                  {new Date(importResult.data.exportTime).toLocaleString(
                    "vi-VN"
                  )}
                </div>
                <div className="info-row">
                  <strong>Số VĐV:</strong> {importResult.data.athletes.length}
                </div>
                <div
                  className={`info-row status ${
                    importResult.isLate ? "late" : "ontime"
                  }`}
                >
                  <strong>Trạng thái:</strong>{" "}
                  {importResult.isLate ? "⚠️ Nộp trễ hạn" : "✅ Nộp đúng hạn"}
                </div>
              </div>

              {importResult.data.athletes.length > 0 && (
                <div className="athletes-preview">
                  <h5>Danh sách VĐV:</h5>
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Họ tên</th>
                        <th>Năm sinh</th>
                        <th>Nội dung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.data.athletes.slice(0, 10).map((a, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{a.name}</td>
                          <td>{a.birthYear}</td>
                          <td>{a.eventName}</td>
                        </tr>
                      ))}
                      {importResult.data.athletes.length > 10 && (
                        <tr>
                          <td colSpan="4" className="more-text">
                            ... và {importResult.data.athletes.length - 10} VĐV
                            khác
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowImportModal(false)}
                >
                  Từ chối
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAcceptImport}
                >
                  ✅ Chấp nhận import
                </button>
              </div>
            </div>
          )}
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
              <label className="checkbox-label">
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
