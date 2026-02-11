import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  useTournament,
  useTournamentDispatch,
  ACTIONS,
} from "../context/TournamentContext";
import { generateBracket } from "../utils/drawEngine";
import AthleteForm from "../components/AthleteForm/AthleteForm";
import AthleteList from "../components/AthleteList/AthleteList";
import Modal from "../components/common/Modal";
import "./CategoryPage.css";

export default function CategoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tournaments, currentTournament, currentCategory } = useTournament();
  const dispatch = useTournamentDispatch();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState(null);
  const [showDrawConfirm, setShowDrawConfirm] = useState(false);
  const [drawError, setDrawError] = useState(null);

  // Find the category from tournaments
  useEffect(() => {
    let foundTournament = null;
    let foundCategory = null;

    for (const t of tournaments) {
      const cat = t.categories.find((c) => c.id === id);
      if (cat) {
        foundTournament = t;
        foundCategory = cat;
        break;
      }
    }

    if (foundTournament && foundTournament.id !== currentTournament?.id) {
      dispatch({
        type: ACTIONS.SET_CURRENT_TOURNAMENT,
        payload: foundTournament.id,
      });
    }
    if (foundCategory) {
      dispatch({ type: ACTIONS.SET_CURRENT_CATEGORY, payload: id });
    }
  }, [id, tournaments, dispatch]);

  const category =
    currentCategory ||
    tournaments.flatMap((t) => t.categories).find((c) => c.id === id);

  const tournament =
    currentTournament ||
    tournaments.find((t) => t.categories.some((c) => c.id === id));
  if (!category || !tournament) {
    return (
      <div className="page">
        <div className="container">
          <div className="not-found">
            <h2>Không tìm thấy hạng mục</h2>
            <Link to="/admin" className="btn btn-primary">
              Về quản lý giải đấu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleAddAthlete = (data) => {
    dispatch({
      type: ACTIONS.ADD_ATHLETE,
      payload: { categoryId: id, ...data },
    });
    setShowAddModal(false);
  };

  const handleEditAthlete = (data) => {
    dispatch({
      type: ACTIONS.UPDATE_ATHLETE,
      payload: { id: editingAthlete.id, ...data },
    });
    setEditingAthlete(null);
  };

  const handleDeleteAthlete = (athleteId) => {
    if (confirm("Bạn có chắc muốn xóa VĐV này?")) {
      dispatch({ type: ACTIONS.DELETE_ATHLETE, payload: athleteId });
    }
  };

  const handleImportAthletes = (athletes) => {
    dispatch({
      type: ACTIONS.IMPORT_ATHLETES,
      payload: { categoryId: id, athletes },
    });
  };

  const handleClearAllAthletes = () => {
    if (confirm("Bạn có chắc muốn xóa TẤT CẢ vận động viên?")) {
      category.athletes.forEach((a) => {
        dispatch({ type: ACTIONS.DELETE_ATHLETE, payload: a.id });
      });
    }
  };

  const handleDraw = () => {
    setDrawError(null);
    try {
      const bracket = generateBracket(category.athletes, {
        format: category.format,
      });

      dispatch({
        type: ACTIONS.SET_BRACKET,
        payload: { categoryId: id, bracket },
      });

      setShowDrawConfirm(false);
      // Navigate to bracket view
      navigate(`/bracket/${id}`);
    } catch (error) {
      setDrawError(error.message);
    }
  };

  const canDraw = category.athletes.length >= 2;
  const hasBracket = !!category.bracket;
  return (
    <div className="page category-page">
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
          <span>{category.name}</span>
        </nav>

        <header className="page-header">
          <div>
            <div className="category-type-badge">
              {category.type === "kumite" ? "⚔️ Kumite" : "🥋 Kata"}
            </div>
            <h1 className="page-title">{category.name}</h1>
            <div className="category-meta">
              {category.gender && (
                <span>
                  {category.gender === "male"
                    ? "👨 Nam"
                    : category.gender === "female"
                    ? "👩 Nữ"
                    : "👥 Hỗn hợp"}
                </span>
              )}
              {category.weightClass && <span>{category.weightClass}</span>}
              {category.ageGroup && <span>{category.ageGroup}</span>}
            </div>
          </div>

          <div className="header-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setShowAddModal(true)}
            >
              + Thêm VĐV
            </button>

            {hasBracket ? (
              <Link to={`/bracket/${id}`} className="btn btn-primary btn-lg">
                📊 Xem sơ đồ thi đấu
              </Link>
            ) : (
              <button
                className="btn btn-primary btn-lg"
                onClick={() => setShowDrawConfirm(true)}
                disabled={!canDraw}
              >
                🎲 Bốc thăm
              </button>
            )}
          </div>
        </header>

        {hasBracket && (
          <div className="bracket-notice">
            <span>✓ Đã bốc thăm với {category.bracket.size} slots</span>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (
                  confirm(
                    "Bốc thăm lại sẽ xóa tất cả kết quả hiện tại. Tiếp tục?"
                  )
                ) {
                  setShowDrawConfirm(true);
                }
              }}
            >
              🔄 Bốc thăm lại
            </button>
          </div>
        )}

        <div className="athlete-section card">
          <h2>Danh sách vận động viên ({category.athletes.length})</h2>

          <AthleteList
            athletes={category.athletes}
            onEdit={setEditingAthlete}
            onDelete={handleDeleteAthlete}
            onImport={handleImportAthletes}
            onClearAll={handleClearAllAthletes}
          />
        </div>

        {/* Add Athlete Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Thêm vận động viên"
        >
          <AthleteForm
            onSubmit={handleAddAthlete}
            onCancel={() => setShowAddModal(false)}
          />
        </Modal>

        {/* Edit Athlete Modal */}
        <Modal
          isOpen={!!editingAthlete}
          onClose={() => setEditingAthlete(null)}
          title="Sửa thông tin VĐV"
        >
          {editingAthlete && (
            <AthleteForm
              initialData={editingAthlete}
              onSubmit={handleEditAthlete}
              onCancel={() => setEditingAthlete(null)}
            />
          )}
        </Modal>

        {/* Draw Confirmation Modal */}
        <Modal
          isOpen={showDrawConfirm}
          onClose={() => setShowDrawConfirm(false)}
          title="🎲 Xác nhận bốc thăm"
        >
          <div className="draw-confirm">
            <p>
              Bốc thăm tự động cho <strong>{category.athletes.length}</strong>{" "}
              vận động viên.
            </p>

            <div className="draw-info">
              <div className="draw-info-item">
                <span className="label">Số slots dự kiến:</span>
                <span className="value">
                  {Math.pow(2, Math.ceil(Math.log2(category.athletes.length)))}
                </span>
              </div>
              <div className="draw-info-item">
                <span className="label">Số BYE:</span>
                <span className="value">
                  {Math.pow(2, Math.ceil(Math.log2(category.athletes.length))) -
                    category.athletes.length}
                </span>
              </div>
              <div className="draw-info-item">
                <span className="label">Hạt giống:</span>
                <span className="value">
                  {category.athletes.filter((a) => a.seed).length}
                </span>
              </div>
            </div>

            <p className="draw-note">
              ⚠️ Thuật toán sẽ tự động:
              <br />• Đặt hạt giống vào đúng vị trí
              <br />• Tránh các VĐV cùng CLB gặp nhau ở vòng 1
            </p>

            {drawError && <div className="draw-error">❌ {drawError}</div>}

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDrawConfirm(false)}
              >
                Hủy
              </button>
              <button className="btn btn-primary" onClick={handleDraw}>
                🎲 Bốc thăm ngay
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
