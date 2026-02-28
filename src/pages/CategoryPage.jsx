import { useState, useEffect, useRef, useCallback } from "react";
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
import ConfirmDialog from "../components/common/ConfirmDialog";
import { useToast } from "../components/common/Toast";
import "./CategoryPage.css";

export default function CategoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tournaments, currentTournament, currentCategory } = useTournament();
  const dispatch = useTournamentDispatch();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState(null);
  const [showDrawConfirm, setShowDrawConfirm] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    message: "",
    onConfirm: null,
  });
  const [drawError, setDrawError] = useState(null);
  const [drawCountdown, setDrawCountdown] = useState(null);
  const [shuffledName, setShuffledName] = useState("");
  const countdownTimerRef = useRef(null);
  const shuffleTimerRef = useRef(null);
  const { toast } = useToast();

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
    setConfirmDialog({
      open: true,
      message: "Bạn có chắc muốn xóa VĐV này?",
      onConfirm: () => {
        dispatch({ type: ACTIONS.DELETE_ATHLETE, payload: athleteId });
        setConfirmDialog({ open: false, message: "", onConfirm: null });
      },
    });
  };

  const handleImportAthletes = (athletes) => {
    dispatch({
      type: ACTIONS.IMPORT_ATHLETES,
      payload: { categoryId: id, athletes },
    });
  };
  const handleClearAllAthletes = () => {
    setConfirmDialog({
      open: true,
      message: "Bạn có chắc muốn xóa TẤT CẢ vận động viên?",
      onConfirm: () => {
        category.athletes.forEach((a) => {
          dispatch({ type: ACTIONS.DELETE_ATHLETE, payload: a.id });
        });
        setConfirmDialog({ open: false, message: "", onConfirm: null });
      },
    });
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (shuffleTimerRef.current) clearInterval(shuffleTimerRef.current);
    };
  }, []);

  // Detect if this is a team category
  const isTeamCategory = category.name?.toLowerCase().includes('đồng đội') ||
    category.isTeam || (category.athletes || []).some(a => a.isTeam);

  // Check for unticked isTeam athletes in team categories
  const untickedTeamAthletes = isTeamCategory
    ? category.athletes.filter(a => !a.isTeam)
    : [];

  // Group athletes by club for team categories
  const getTeamsFromAthletes = (athletes) => {
    const clubMap = {};
    athletes.forEach(a => {
      const clubKey = (a.club || 'Không CLB').trim();
      if (!clubMap[clubKey]) {
        clubMap[clubKey] = {
          id: `team_${clubKey.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`,
          name: clubKey,
          club: clubKey,
          country: a.country || 'VN',
          gender: a.gender,
          isTeam: true,
          members: [],
        };
      }
      clubMap[clubKey].members.push(a);
    });
    return Object.values(clubMap);
  };

  const handleDraw = () => {
    setDrawError(null);
    try {
      let drawEntries;
      if (isTeamCategory) {
        // For team categories: group athletes by club
        drawEntries = getTeamsFromAthletes(category.athletes);
        if (drawEntries.length < 2) {
          setDrawError('Cần ít nhất 2 đội (CLB) khác nhau để bốc thăm đồng đội!');
          return;
        }
      } else {
        drawEntries = category.athletes;
      }

      const bracket = generateBracket(drawEntries, {
        format: category.format,
      });

      // Store isTeamCategory flag in bracket for display purposes
      bracket.isTeamBracket = isTeamCategory;

      dispatch({
        type: ACTIONS.SET_BRACKET,
        payload: { categoryId: id, bracket },
      });

      setShowDrawConfirm(false);

      // Start countdown loading animation
      setDrawCountdown(5);
      const displayNames = isTeamCategory
        ? getTeamsFromAthletes(category.athletes).map(t => t.name)
        : category.athletes.map((a) => a.name);

      // Shuffle names rapidly
      shuffleTimerRef.current = setInterval(() => {
        const randomName = displayNames[Math.floor(Math.random() * displayNames.length)];
        setShuffledName(randomName);
      }, 100);

      // Countdown from 5 to 0
      let count = 5;
      countdownTimerRef.current = setInterval(() => {
        count--;
        setDrawCountdown(count);
        if (count <= 0) {
          clearInterval(countdownTimerRef.current);
          clearInterval(shuffleTimerRef.current);
          countdownTimerRef.current = null;
          shuffleTimerRef.current = null;
          // Navigate to bracket view after countdown
          setTimeout(() => {
            setDrawCountdown(null);
            navigate(`/bracket/${id}`);
          }, 500);
        }
      }, 1000);
    } catch (error) {
      setDrawError(error.message);
    }
  };

  const canDraw = isTeamCategory
    ? (() => {
        const clubs = new Set(category.athletes.map(a => (a.club || '').trim().toLowerCase()).filter(Boolean));
        return clubs.size >= 2;
      })()
    : category.athletes.length >= 3;
  const allSameClub = (() => {
    if (category.athletes.length < 3) return false;
    const clubs = new Set(category.athletes.map(a => (a.club || '').trim().toLowerCase()).filter(Boolean));
    return clubs.size === 1;
  })();
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
                    ? "Nam"
                    : category.gender === "female"
                    ? "Nữ"
                    : "Hỗn hợp"}
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
                onClick={() => {
                  if (!canDraw) {
                    if (isTeamCategory) {
                      toast.warning("Nội dung đồng đội cần ít nhất 2 đội (CLB) khác nhau để bốc thăm!");
                    } else {
                      toast.warning("Cần ít nhất 3 VĐV để bốc thăm!");
                    }
                    return;
                  }
                  if (!isTeamCategory && allSameClub) {
                    toast.warning(`Tất cả ${category.athletes.length} VĐV đều cùng CLB "${category.athletes[0]?.club}". Cần ít nhất 2 CLB khác nhau.`);
                    return;
                  }
                  setShowDrawConfirm(true);
                }}
                disabled={!canDraw}
              >
                🎲 Bốc thăm
              </button>
            )}
          </div>
        </header>
        {hasBracket && (
          <div className="bracket-notice">
            <span>✓ Đã bốc thăm với {category.bracket.size} slots</span>{" "}
            <button
              className="btn btn-secondary"
              onClick={() => {
                setConfirmDialog({
                  open: true,
                  message:
                    "Bốc thăm lại sẽ xóa tất cả kết quả hiện tại. Tiếp tục?",
                  onConfirm: () => {
                    setConfirmDialog({
                      open: false,
                      message: "",
                      onConfirm: null,
                    });
                    setShowDrawConfirm(true);
                  },
                });
              }}
            >
              🔄 Bốc thăm lại
            </button>
          </div>
        )}
        <div className="athlete-section card">
          <h2>Danh sách vận động viên ({category.athletes.length})</h2>{" "}
          <AthleteList
            athletes={category.athletes}
            onEdit={setEditingAthlete}
            onDelete={handleDeleteAthlete}
            onImport={handleImportAthletes}
            onClearAll={handleClearAllAthletes}
            category={category}
          />
        </div>
        {/* Add Athlete Modal */}{" "}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Thêm vận động viên"
        >
          <AthleteForm
            onSubmit={handleAddAthlete}
            onCancel={() => setShowAddModal(false)}
            category={category}
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
              category={category}
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
            {isTeamCategory ? (
              <p>
                Bốc thăm đồng đội cho <strong>{category.athletes.length}</strong> VĐV
                {' '}từ <strong>
                  {new Set(category.athletes.map(a => (a.club || '').trim()).filter(Boolean)).size}
                </strong> đội (CLB).
              </p>
            ) : (
              <p>
                Bốc thăm tự động cho <strong>{category.athletes.length}</strong>{" "}
                vận động viên.
              </p>
            )}

            {/* Warning for unticked isTeam */}
            {isTeamCategory && untickedTeamAthletes.length > 0 && (
              <div className="draw-error" style={{background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e'}}>
                ⚠️ <strong>{untickedTeamAthletes.length} VĐV chưa tick "Đ.Đội":</strong>
                <ul style={{margin: '6px 0', paddingLeft: '20px', fontSize: '13px'}}>
                  {untickedTeamAthletes.slice(0, 5).map(a => (
                    <li key={a.id}>{a.name} ({a.club || 'Không CLB'})</li>
                  ))}
                  {untickedTeamAthletes.length > 5 && <li>...và {untickedTeamAthletes.length - 5} VĐV khác</li>}
                </ul>
                <p style={{fontSize: '12px', marginTop: '4px'}}>Các VĐV này vẫn sẽ được ghép vào đội theo CLB.</p>
              </div>
            )}

            {isTeamCategory ? (
              <div className="draw-info">
                <div className="draw-info-item">
                  <span className="label">Số đội:</span>
                  <span className="value">
                    {new Set(category.athletes.map(a => (a.club || '').trim()).filter(Boolean)).size}
                  </span>
                </div>
                <div className="draw-info-item">
                  <span className="label">Số slots dự kiến:</span>
                  <span className="value">
                    {Math.pow(2, Math.ceil(Math.log2(
                      new Set(category.athletes.map(a => (a.club || '').trim()).filter(Boolean)).size
                    )))}
                  </span>
                </div>
              </div>
            ) : (
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
            )}

            <p className="draw-note">
              {isTeamCategory ? (
                <>
                  ⚠️ Bốc thăm đồng đội:
                  <br />• Các VĐV cùng CLB sẽ được ghép thành 1 đội
                  <br />• Tên đội = Tên CLB (Đơn vị)
                  <br />• Sơ đồ sẽ hiển thị tên CLB thay vì tên cá nhân
                </>
              ) : (
                <>
                  ⚠️ Thuật toán sẽ tự động:
                  <br />• Đặt hạt giống vào đúng vị trí
                  <br />• Tránh các VĐV cùng CLB gặp nhau ở vòng 1
                </>
              )}
            </p>

            {!isTeamCategory && allSameClub && (
              <div className="draw-error">
                ⚠️ Tất cả VĐV cùng CLB "{category.athletes[0]?.club}". Thuật toán tránh cùng CLB sẽ không có tác dụng.
              </div>
            )}

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
          </div>{" "}
        </Modal>
        <ConfirmDialog
          isOpen={confirmDialog.open}
          title="Xác nhận"
          message={confirmDialog.message}
          onConfirm={() => confirmDialog.onConfirm?.()}
          onCancel={() =>
            setConfirmDialog({ open: false, message: "", onConfirm: null })
          }
          confirmText="Đồng ý"
          cancelText="Hủy"
          type="danger"
        />
      </div>

      {/* Draw Countdown Overlay */}
      {drawCountdown !== null && (
        <div className="draw-countdown-overlay">
          <div className="draw-countdown-content">
            <div className="draw-countdown-dice">
              {['🎲', '🎯', '🎰', '🎲'][Math.max(0, drawCountdown) % 4]}
            </div>
            <h2 className="draw-countdown-title">Đang bốc thăm...</h2>
            <div className="draw-countdown-number">
              {drawCountdown > 0 ? drawCountdown : '✅'}
            </div>
            <div className="draw-countdown-shuffle">
              <span className="shuffle-label">🏋️ VĐV:</span>
              <span className="shuffle-name">{shuffledName}</span>
            </div>
            <div className="draw-countdown-bar">
              <div 
                className="draw-countdown-bar-fill" 
                style={{ width: `${((5 - drawCountdown) / 5) * 100}%` }}
              />
            </div>
            <p className="draw-countdown-hint">
              {drawCountdown > 0 
                ? 'Thuật toán đang xáo trộn và sắp xếp vị trí...'
                : 'Hoàn tất! Đang hiển thị sơ đồ...'
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
