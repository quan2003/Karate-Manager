import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import {
  useTournament,
  useTournamentDispatch,
  ACTIONS,
} from "../context/TournamentContext";
import { generateBracket } from "../utils/drawEngine";
import { getTeamCountFromAthletes, getTeamsFromAthletes, isTeamCategory as isTeamCategoryMeta } from "../utils/teamDraw";
import AthleteForm from "../components/AthleteForm/AthleteForm";
import AthleteList from "../components/AthleteList/AthleteList";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { useToast } from "../components/common/Toast";
import { useOnboarding } from "../context/OnboardingContext";
import appIcon from "../assets/icon.png";
import {
  createSmartListEntryState,
  getSmartBackContext,
  getStableCategoryIds,
  readSmartListState,
  writeSmartListState,
} from "../utils/smartBackNavigation";
import "./CategoryPage.css";

export default function CategoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const smartBack = getSmartBackContext(location);
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
  const [isSwitchingCategory, setIsSwitchingCategory] = useState(false);
  const countdownTimerRef = useRef(null);
  const shuffleTimerRef = useRef(null);
  const switchTimerRef = useRef(null);
  const isSwitchingCategoryRef = useRef(false);
  const { toast } = useToast();
  const { activeHint, clearHint } = useOnboarding();

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
  }, [id, tournaments, currentTournament?.id, dispatch]);

  const category =
    (currentCategory?.id === id ? currentCategory : null) ||
    tournaments.flatMap((t) => t.categories).find((c) => c.id === id);

  const tournament =
    (currentTournament?.categories?.some((c) => c.id === id) ? currentTournament : null) ||
    tournaments.find((t) => t.categories.some((c) => c.id === id));
  const isTeamCategory = isTeamCategoryMeta(category);

  const savedListState = useMemo(
    () => smartBack?.listKey ? readSmartListState(smartBack.listKey) : null,
    [smartBack?.listKey]
  );
  const snapshotIds = smartBack?.categoryIds?.length
    ? smartBack.categoryIds
    : savedListState?.categoryIds;
  const effectiveNavigationIds = useMemo(() => {
    const tournamentCategoryIds = new Set((tournament?.categories || []).map((item) => item.id));
    const navigationIds = Array.isArray(snapshotIds) && snapshotIds.length > 0
      ? snapshotIds.filter((categoryId) => tournamentCategoryIds.has(categoryId))
      : getStableCategoryIds(tournament?.categories || []);
    return navigationIds.includes(id) ? navigationIds : category ? [id] : [];
  }, [category, id, snapshotIds, tournament?.categories]);
  const effectiveNavigationIndex = effectiveNavigationIds.indexOf(id);
  const previousCategoryId = effectiveNavigationIndex > 0
    ? effectiveNavigationIds[effectiveNavigationIndex - 1]
    : null;
  const nextCategoryId = effectiveNavigationIndex >= 0 && effectiveNavigationIndex < effectiveNavigationIds.length - 1
    ? effectiveNavigationIds[effectiveNavigationIndex + 1]
    : null;

  const navigateToCategory = useCallback((targetId) => {
    if (!targetId || isSwitchingCategoryRef.current) return;
    isSwitchingCategoryRef.current = true;
    setIsSwitchingCategory(true);

    if (smartBack?.listKey) {
      const saved = readSmartListState(smartBack.listKey) || {};
      writeSmartListState(smartBack.listKey, {
        ...saved,
        categoryIds: effectiveNavigationIds,
        openedItemId: targetId,
        pendingRestore: true,
      });
    }

    const nextState = smartBack
      ? {
          ...(location.state || {}),
          smartBack: { ...smartBack, categoryIds: effectiveNavigationIds },
        }
      : location.state;

    switchTimerRef.current = window.setTimeout(() => {
      navigate(`/category/${targetId}`, { replace: true, state: nextState });
    }, 120);
  }, [effectiveNavigationIds, location.state, navigate, smartBack]);

  useEffect(() => {
    isSwitchingCategoryRef.current = false;
    setIsSwitchingCategory(false);
  }, [id]);

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      if (
        !event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        target?.isContentEditable ||
        ["input", "textarea", "select"].includes(tagName)
      ) {
        return;
      }

      if (event.key === "ArrowLeft" && previousCategoryId) {
        event.preventDefault();
        navigateToCategory(previousCategoryId);
      } else if (event.key === "ArrowRight" && nextCategoryId) {
        event.preventDefault();
        navigateToCategory(nextCategoryId);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [navigateToCategory, nextCategoryId, previousCategoryId]);

  // Adjacent category data is already prefetched in TournamentContext. Only
  // navigation is deferred briefly to prevent rapid repeated clicks.
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (shuffleTimerRef.current) clearInterval(shuffleTimerRef.current);
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    };
  }, []);

  const categoryListTarget = smartBack?.returnTo || (tournament ? `/tournament/${tournament.id}` : "/admin");
  const categoryListState = smartBack
    ? createSmartListEntryState(null, smartBack.listKey)
    : undefined;

  if (!category || !tournament) {
    return (
      <div className="page">
        <div className="container">
          <div className="not-found">
            <h2>Không tìm thấy hạng mục</h2>
            <Link to={categoryListTarget} state={categoryListState} className="btn btn-primary">
              Quay lại danh sách nội dung
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleAddAthlete = (data) => {
    dispatch({
      type: ACTIONS.ADD_ATHLETE,
      payload: { categoryId: id, ...data, isTeam: isTeamCategory ? Boolean(data.isTeam) : false },
    });
    setShowAddModal(false);
  };

  const handleEditAthlete = (data) => {
    dispatch({
      type: ACTIONS.UPDATE_ATHLETE,
      payload: { id: editingAthlete.id, ...data, isTeam: isTeamCategory ? Boolean(data.isTeam) : false },
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
      payload: {
        categoryId: id,
        athletes: athletes.map((athlete) => ({
          ...athlete,
          isTeam: isTeamCategory ? Boolean(athlete.isTeam) : false,
        })),
      },
    });
  };
  const handleRestoreAthletesFromBracket = () => {
    dispatch({
      type: ACTIONS.RESTORE_ATHLETES_FROM_BRACKET,
      payload: { categoryId: id },
    });
    toast.success("Đã khôi phục danh sách VĐV từ sơ đồ thi đấu.");
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

  // Check for unticked isTeam athletes in team categories
  const untickedTeamAthletes = isTeamCategory
    ? category.athletes.filter(a => !a.isTeam)
    : [];

  const handleDraw = () => {
    setDrawError(null);
    try {
      let drawEntries;
      if (isTeamCategory) {
        // For team categories: group athletes by club
        drawEntries = getTeamsFromAthletes(category.athletes, category, tournament);
        if (drawEntries.length < 2) {
          setDrawError('Cần ít nhất 2 đội để bốc thăm đồng đội!');
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
        ? getTeamsFromAthletes(category.athletes, category, tournament).map(t => t.name)
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
            navigate(`/bracket/${id}`, { state: location.state });
          }, 500);
        }
      }, 1000);
    } catch (error) {
      setDrawError(error.message);
    }
  };

  const teamCount = isTeamCategory
    ? getTeamCountFromAthletes(category.athletes, category, tournament)
    : 0;
  const canDraw = isTeamCategory
    ? teamCount >= 3
    : category.athletes.length >= 3;
  const allSameClub = (() => {
    if (category.athletes.length < 3) return false;
    const clubs = new Set(category.athletes.map(a => (a.club || '').trim().toLowerCase()).filter(Boolean));
    return clubs.size === 1;
  })();
  const hasBracket = !!category.bracket;
  const canRestoreAthletesFromBracket =
    category.athletes.length === 0 &&
    category.bracket?.matches?.some((m) => m.athlete1 || m.athlete2 || m.winner);
  return (
    <div className="page category-page">
      <div className="container">
        <nav className="breadcrumb">
          <Link to={categoryListTarget} state={categoryListState} className="back-link">
            ← Quay lại
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigateToCategory(previousCategoryId)}
            disabled={!previousCategoryId || isSwitchingCategory}
            title="Phím tắt: Ctrl + ←"
          >
            ← Nội dung trước
          </button>
          <span>
            {isSwitchingCategory
              ? "Đang chuyển..."
              : `Nội dung ${effectiveNavigationIndex + 1}/${effectiveNavigationIds.length}`}
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigateToCategory(nextCategoryId)}
            disabled={!nextCategoryId || isSwitchingCategory}
            title="Phím tắt: Ctrl + →"
          >
            Nội dung tiếp theo →
          </button>
          <span className="breadcrumb-separator">|</span>
          <Link to="/admin">Quản lý giải đấu</Link>
          <span>/</span>
          <Link to={categoryListTarget} state={categoryListState}>{tournament.name}</Link>
          <span>/</span>
          <span>{category.name}</span>
        </nav>
        <header className="page-header">
          <div>
            <div className="category-type-badge">
              {category.type === "kumite" ? "⚔️ Kumite" : "🥋 Kata"}
            </div>
            <h1 className="page-title">
              <img src={appIcon} alt="" className="page-title-logo" />
              {category.name}
            </h1>
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
              className={`btn btn-secondary ${activeHint === "import_athletes" ? "hint-pulse" : ""}`}
              onClick={() => { setShowAddModal(true); clearHint(); }}
            >
              + Thêm VĐV
            </button>

            {hasBracket ? (
              <Link to={`/bracket/${id}`} state={location.state} className="btn btn-primary btn-lg">
                📊 Xem sơ đồ thi đấu
              </Link>
            ) : (
              <button
                className={`btn btn-primary btn-lg ${activeHint === "smart_draw" ? "hint-pulse" : ""}`}
                onClick={() => {
                  clearHint();
                  if (!canDraw) {
                    if (isTeamCategory) {
                      toast.warning("Nội dung đồng đội cần ít nhất 3 đội để bốc thăm!");
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
            {canRestoreAthletesFromBracket && (
              <button
                className="btn btn-secondary"
                onClick={handleRestoreAthletesFromBracket}
              >
                Khôi phục VĐV từ sơ đồ
              </button>
            )}
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
            activeHint={activeHint}
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
                  {teamCount}
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
                    {teamCount}
                  </span>
                </div>
                <div className="draw-info-item">
                  <span className="label">Số slots dự kiến:</span>
                  <span className="value">
                    {Math.pow(2, Math.ceil(Math.log2(
                      teamCount
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
