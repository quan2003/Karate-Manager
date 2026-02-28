import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useTournament,
  useTournamentDispatch,
  ACTIONS,
} from "../context/TournamentContext";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { exportAllBracketsToPDF } from "../services/pdfService";
import {
  parseCategoriesExcel,
  generateCategoriesTemplate,
  parseCoachExcelFile,
} from "../services/excelService";
import {
  createKrtData,
  encodeKrtFile,
  validateKrtData,
} from "../services/krtService";
import { createKmatchData, saveKmatchFile } from "../services/matchService";
import { generateBracket } from "../utils/drawEngine";
import DateTimeInput from "../components/common/DateTimeInput";
import { useToast } from "../components/common/Toast";
import "./TournamentPage.css";

export default function TournamentPage() {
  const { id } = useParams();
  const { tournaments, currentTournament } = useTournament();
  const dispatch = useTournamentDispatch();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    message: "",
    onConfirm: null,
  });
  // Bulk draw state
  const [showBulkDrawModal, setShowBulkDrawModal] = useState(false);
  const [bulkDrawSelection, setBulkDrawSelection] = useState({});
  const [bulkDrawResults, setBulkDrawResults] = useState(null);
  const [bulkDrawing, setBulkDrawing] = useState(false);
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "kumite",
    gender: "male",
    ageGroup: "",
    weightClass: "",
    format: "single_elimination",
  });

  // Filters
  const [filterType, setFilterType] = useState("all");
  const [filterGender, setFilterGender] = useState("all");
  const [filterSession, setFilterSession] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    dispatch({ type: ACTIONS.SET_CURRENT_TOURNAMENT, payload: id });
  }, [id, dispatch]);

  const tournament = currentTournament || tournaments.find((t) => t.id === id);

  // Filter Logic
  const getFilteredCategories = () => {
    if (!tournament?.categories) return [];
    let cats = [...tournament.categories];
    if (filterType !== "all") {
      cats = cats.filter(c => c.type === filterType);
    }
    if (filterGender !== "all") {
      cats = cats.filter(c => c.gender === filterGender);
    }
    if (filterSession !== "all") {
      cats = cats.filter(c => (c.session || "buoi1") === filterSession);
    }
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      cats = cats.filter(c => c.name.toLowerCase().includes(q));
    }
    return cats;
  };

  const getSessions = () => {
    if (!tournament?.categories) return [];
    const sessions = new Set();
    tournament.categories.forEach(c => {
      sessions.add(c.session || "buoi1");
    });
    return Array.from(sessions).sort();
  };

  const getSessionLabel = (session) => {
    const map = { buoi1: "Buổi 1", buoi2: "Buổi 2", buoi3: "Buổi 3", buoi4: "Buổi 4", buoi5: "Buổi 5" };
    return map[session] || session;
  };

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

  const filteredCategories = getFilteredCategories();
  const sessions = getSessions();

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
    setConfirmDialog({
      open: true,
      message: "Bạn có chắc muốn xóa hạng mục này?",
      onConfirm: () => {
        dispatch({ type: ACTIONS.DELETE_CATEGORY, payload: categoryId });
        setConfirmDialog({ open: false, message: "", onConfirm: null });
      },
    });
  };

  const getTotalAthletes = () => {
    return tournament.categories.reduce(
      (sum, cat) => sum + (cat.athletes?.length || 0),
      0
    );
  };

  // Statistics helpers
  const getClubs = () => {
    const clubSet = new Set();
    tournament.categories.forEach((cat) => {
      (cat.athletes || []).forEach((a) => {
        if (a.club) clubSet.add(a.club.trim());
      });
    });
    return clubSet;
  };

  const getGenderCount = (gender) => {
    let count = 0;
    tournament.categories.forEach((cat) => {
      (cat.athletes || []).forEach((a) => {
        if (a.gender === gender) count++;
      });
    });
    return count;
  };

  const getEstimatedMedals = () => {
    let gold = 0, silver = 0, bronze = 0;
    tournament.categories.forEach((cat) => {
      const athleteCount = cat.athletes?.length || 0;
      if (athleteCount === 0) return;
      // Check if this is a team category
      const isTeamCategory = cat.isTeam || (cat.athletes || []).some(a => a.isTeam);
      if (isTeamCategory) {
        // Team: medals per participant
        gold += athleteCount;
        silver += athleteCount;
        bronze += athleteCount * 2;
      } else {
        // Individual: 1 gold, 1 silver, 2 bronze per category
        gold += 1;
        silver += 1;
        bronze += 2;
      }
    });
    return { gold, silver, bronze, total: gold + silver + bronze };
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
    const splitSettings = tournament.splitSettings || { enabled: false, threshold: 20 };
    await exportAllBracketsToPDF(tournament.categories, tournament.name, null, tournament.schedule || null, splitSettings);
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

  // ====== Import VĐV từ nhiều file CLB ======
  const clubFileInputRef = useRef(null);
  const [importingClub, setImportingClub] = useState(false);
  const [clubImportResult, setClubImportResult] = useState(null);

  const handleImportFromClubs = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setImportingClub(true);
    const allResults = [];
    const allErrors = [];

    for (const file of files) {
      try {
        const { athletes, errors, clubName, coachName } = await parseCoachExcelFile(file);
        if (errors.length > 0) {
          allErrors.push(...errors.map((err) => `[${file.name}] ${err}`));
        }
        allResults.push({
          fileName: file.name,
          clubName: clubName || file.name,
          coachName,
          athletes,
        });
      } catch (error) {
        allErrors.push(`[${file.name}] ${error.message}`);
      }
    }

    // Match athletes to categories
    let totalMatched = 0;
    let totalUnmatched = 0;
    const matchDetails = [];
    const unmatchedAthletes = [];

    for (const result of allResults) {
      for (const athlete of result.athletes) {
        // Try to match by event name
        const matchedCategory = tournament.categories.find((cat) => {
          if (!athlete.eventName) return false;
          const catName = cat.name.toLowerCase();
          const evName = athlete.eventName.toLowerCase();
          return catName === evName || catName.includes(evName) || evName.includes(catName);
        });

        if (matchedCategory) {
          matchDetails.push({
            athlete,
            categoryId: matchedCategory.id,
            categoryName: matchedCategory.name,
            clubName: result.clubName,
          });
          totalMatched++;
        } else {
          unmatchedAthletes.push({
            ...athlete,
            clubName: result.clubName,
            fileName: result.fileName,
          });
          totalUnmatched++;
        }
      }
    }

    setClubImportResult({
      totalFiles: files.length,
      totalAthletes: totalMatched + totalUnmatched,
      totalMatched,
      totalUnmatched,
      matchDetails,
      unmatchedAthletes,
      errors: allErrors,
      results: allResults,
    });

    setImportingClub(false);
    e.target.value = "";
  };

  const handleConfirmClubImport = () => {
    if (!clubImportResult) return;

    // Group by categoryId
    const grouped = {};
    for (const item of clubImportResult.matchDetails) {
      if (!grouped[item.categoryId]) {
        grouped[item.categoryId] = [];
      }
      grouped[item.categoryId].push(item.athlete);
    }

    // Dispatch IMPORT_ATHLETES for each category
    for (const [categoryId, athletes] of Object.entries(grouped)) {
      dispatch({
        type: ACTIONS.IMPORT_ATHLETES,
        payload: { categoryId, athletes },
      });
    }

    alert(`Đã import thành công ${clubImportResult.totalMatched} VĐV vào ${Object.keys(grouped).length} hạng mục!`);
    setClubImportResult(null);
  };

  // === Bulk Draw ===
  const handleOpenBulkDraw = () => {
    const cats = tournament.categories || [];
    const selection = {};
    cats.forEach(cat => {
      // Pre-select categories that can be drawn (>=3 athletes, no bracket yet)
      const canDraw = (cat.athletes?.length || 0) >= 3 && !cat.bracket;
      selection[cat.id] = canDraw;
    });
    setBulkDrawSelection(selection);
    setBulkDrawResults(null);
    setShowBulkDrawModal(true);
  };

  // Helper: group athletes by club into teams
  const getTeamsFromAthletes = (athletes) => {
    const clubMap = {};
    athletes.forEach(a => {
      const clubKey = (a.club || 'Không CLB').trim();
      if (!clubMap[clubKey]) {
        clubMap[clubKey] = {
          id: `team_${clubKey.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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

  const handleBulkDraw = async () => {
    const cats = tournament.categories.filter(cat => bulkDrawSelection[cat.id]);
    if (cats.length === 0) {
      toast.error("Vui lòng chọn ít nhất một nội dung!");
      return;
    }

    setBulkDrawing(true);
    const results = { success: [], failed: [], skipped: [] };

    for (const cat of cats) {
      const athleteCount = cat.athletes?.length || 0;
      const isTeamCategory = cat.name?.toLowerCase().includes('đồng đội') ||
        cat.isTeam || (cat.athletes || []).some(a => a.isTeam);

      if (isTeamCategory) {
        // Team category: group by club
        const teams = getTeamsFromAthletes(cat.athletes || []);
        if (teams.length < 2) {
          results.skipped.push({ name: cat.name, reason: `Chỉ có ${teams.length} đội (cần ≥ 2 CLB khác nhau)` });
          continue;
        }
        try {
          const bracket = generateBracket(teams, { format: cat.format });
          bracket.isTeamBracket = true;
          dispatch({
            type: ACTIONS.SET_BRACKET,
            payload: { categoryId: cat.id, bracket },
          });
          results.success.push({ name: cat.name, athletes: `${teams.length} đội` });
        } catch (error) {
          results.failed.push({ name: cat.name, error: error.message });
        }
      } else {
        // Individual category
        if (athleteCount < 3) {
          results.skipped.push({ name: cat.name, reason: `Chỉ có ${athleteCount} VĐV (cần ≥ 3)` });
          continue;
        }

        // Check all same club
        const clubs = new Set(cat.athletes.map(a => (a.club || '').trim().toLowerCase()).filter(Boolean));
        if (clubs.size === 1 && athleteCount > 2) {
          // Still allow but note it
        }

        try {
          const bracket = generateBracket(cat.athletes, { format: cat.format });
          dispatch({
            type: ACTIONS.SET_BRACKET,
            payload: { categoryId: cat.id, bracket },
          });
          results.success.push({ name: cat.name, athletes: athleteCount });
        } catch (error) {
          results.failed.push({ name: cat.name, error: error.message });
        }
      }
    }

    setBulkDrawing(false);
    setBulkDrawResults(results);
    toast.success(`Đã bốc thăm ${results.success.length}/${cats.length} nội dung`);
  };

  const drawableCount = tournament.categories.filter(c => (c.athletes?.length || 0) >= 3 && !c.bracket).length;
  const alreadyDrawnCount = tournament.categories.filter(c => c.bracket).length;
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
        </header>

        {/* ===== ACTION TOOLBAR - UNIFORM GRID ===== */}
        <div className="tournament-actions-toolbar">
          <button
            className="tournament-action-btn action-export"
            onClick={handleOpenKrtModal}
            title="Xuất file .krt cho HLV đăng ký"
          >
            <span className="action-icon">📤</span>
            <span className="action-label">Xuất<br/>(.krt)</span>
          </button>

          <button
            className="tournament-action-btn action-export"
            onClick={handleOpenKmatchModal}
            title="Xuất file chấm điểm cho Thư ký"
          >
            <span className="action-icon">🎯</span>
            <span className="action-label">Xuất<br/>(.kmatch)</span>
          </button>

          {tournament.categories.filter((c) => c.bracket).length > 0 && (
            <button
              className="tournament-action-btn action-export"
              onClick={handleExportAllPDF}
            >
              <span className="action-icon">📄</span>
              <span className="action-label">Xuất tất cả<br/>PDF</span>
            </button>
          )}

          <button
            className="tournament-action-btn action-export"
            onClick={handleDownloadTemplate}
          >
            <span className="action-icon">📥</span>
            <span className="action-label">Tải mẫu<br/>Excel</span>
          </button>

          <label className="tournament-action-btn action-import" style={{ cursor: "pointer" }}>
            <span className="action-icon">📤</span>
            <span className="action-label">Import từ<br/>Excel</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportCategories}
              style={{ display: "none" }}
            />
          </label>

          <label className="tournament-action-btn action-import" style={{ cursor: "pointer" }}>
            <span className="action-icon">🏢</span>
            <span className="action-label">{importingClub ? "Đang nhập..." : "Import VĐV\ntừ CLB"}</span>
            <input
              ref={clubFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={handleImportFromClubs}
              style={{ display: "none" }}
              disabled={importingClub}
            />
          </label>

          <button
            className="tournament-action-btn action-draw"
            onClick={handleOpenBulkDraw}
            title={`${drawableCount} nội dung có thể bốc thăm`}
          >
            <span className="action-icon">🎲</span>
            <span className="action-label">Bốc thăm<br/>tất cả {drawableCount > 0 && <span className="action-badge">{drawableCount}</span>}</span>
          </button>

          <Link
            to={`/schedule/${tournament.id}`}
            className="tournament-action-btn action-schedule"
          >
            <span className="action-icon">📋</span>
            <span className="action-label">Lịch thi<br/>đấu</span>
          </Link>

          <button
            className="tournament-action-btn action-add"
            onClick={() => setShowModal(true)}
          >
            <span className="action-icon">➕</span>
            <span className="action-label">Thêm hạng<br/>mục</span>
          </button>
        </div>

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
            <span className="stat-value">{getClubs().size}</span>
            <span className="stat-label">Câu lạc bộ</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{color: '#3b82f6'}}>{getGenderCount('male')}</span>
            <span className="stat-label">VĐV Nam</span>
          </div>
          <div className="stat-item">
            <span className="stat-value" style={{color: '#ec4899'}}>{getGenderCount('female')}</span>
            <span className="stat-label">VĐV Nữ</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">
              {tournament.categories.filter((c) => c.bracket).length}
            </span>
            <span className="stat-label">Đã bốc thăm</span>
          </div>
        </div>

        {/* Medal estimation */}
        {getTotalAthletes() > 0 && (
          <div className="medal-estimation-bar">
            <h3 className="medal-estimation-title">🏅 Dự tính huy chương</h3>
            <div className="medal-items">
              <div className="medal-item gold">
                <span className="medal-icon">🥇</span>
                <span className="medal-count">{getEstimatedMedals().gold}</span>
                <span className="medal-label">Vàng</span>
              </div>
              <div className="medal-item silver">
                <span className="medal-icon">🥈</span>
                <span className="medal-count">{getEstimatedMedals().silver}</span>
                <span className="medal-label">Bạc</span>
              </div>
              <div className="medal-item bronze">
                <span className="medal-icon">🥉</span>
                <span className="medal-count">{getEstimatedMedals().bronze}</span>
                <span className="medal-label">Đồng</span>
              </div>
              <div className="medal-item total">
                <span className="medal-icon">🏆</span>
                <span className="medal-count">{getEstimatedMedals().total}</span>
                <span className="medal-label">Tổng</span>
              </div>
            </div>
            <Link to={`/statistics/${tournament.id}`} className="btn btn-secondary" style={{marginTop: '12px', alignSelf: 'flex-start'}}>
              📊 Quản lý thống kê & Bảng tổng sắp huy chương
            </Link>
          </div>
        )}

        {/* Split Settings */}
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
          padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#334155', fontSize: '14px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={tournament.splitSettings?.enabled || false}
              onChange={(e) => {
                dispatch({
                  type: ACTIONS.UPDATE_TOURNAMENT,
                  payload: {
                    id: tournament.id,
                    splitSettings: {
                      ...(tournament.splitSettings || { threshold: 20 }),
                      enabled: e.target.checked,
                    },
                  },
                });
              }}
              style={{ width: '18px', height: '18px', accentColor: '#7c3aed' }}
            />
            ✂️ Bật chia nhánh sigma
          </label>
          {tournament.splitSettings?.enabled && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Ngưỡng:</span>
                <input
                  type="number"
                  value={tournament.splitSettings?.threshold || 20}
                  onChange={(e) => {
                    dispatch({
                      type: ACTIONS.UPDATE_TOURNAMENT,
                      payload: {
                        id: tournament.id,
                        splitSettings: {
                          ...(tournament.splitSettings || {}),
                          threshold: Math.max(8, parseInt(e.target.value) || 20),
                        },
                      },
                    });
                  }}
                  min="8" max="64"
                  style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '14px', fontWeight: 700 }}
                />
                <span style={{ fontSize: '13px', color: '#64748b' }}>VĐV trở lên</span>
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                💡 Nội dung trên {tournament.splitSettings?.threshold || 20} VĐV sẽ tự động chia thành nhiều sigma (PDF, Bracket, Thư ký)
              </span>
            </>
          )}
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
          <>
            <div className="filter-bar">
              <div className="filter-group">
                <label>Loại:</label>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="filter-select">
                  <option value="all">Tất cả</option>
                  <option value="kata">Kata</option>
                  <option value="kumite">Kumite</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Giới tính:</label>
                <select value={filterGender} onChange={e => setFilterGender(e.target.value)} className="filter-select">
                  <option value="all">Tất cả</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                </select>
              </div>
              {sessions.length > 1 && (
                <div className="filter-group">
                  <label>Buổi:</label>
                  <select value={filterSession} onChange={e => setFilterSession(e.target.value)} className="filter-select">
                    <option value="all">Tất cả</option>
                    {sessions.map(s => (
                      <option key={s} value={s}>{getSessionLabel(s)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="search-filter">
                <input
                  type="text"
                  placeholder="🔍 Tìm kiếm hạng mục..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              {(filterType !== "all" || filterGender !== "all" || filterSession !== "all" || searchQuery !== "") && (
                <button className="btn btn-sm btn-secondary" onClick={() => { setFilterType("all"); setFilterGender("all"); setFilterSession("all"); setSearchQuery(""); }}>
                  ✕ Xóa lọc
                </button>
              )}
            </div>

            {filteredCategories.length === 0 ? (
              <div className="empty-state" style={{marginTop: '2rem'}}>
                <div className="empty-icon">🔍</div>
                <h3>Không tìm thấy hạng mục</h3>
                <p>Thử xóa bộ lọc hoặc tìm kiếm tên khác.</p>
              </div>
            ) : (
              <div className="categories-grid">
                {filteredCategories.map((category) => (
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
                      ? "Nam"
                      : category.gender === "female"
                      ? "Nữ"
                      : "Hỗn hợp"}
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
                  <p>
                    {category.bracket && (
                      <span className="drawn-icon">✓ Đã bốc thăm</span>
                    )}
                  </p>
                </div>

                <Link
                  to={`/category/${category.id}`}
                  className="manage-btn"
                >
                  Quản lý →
                </Link>
              </div>
            ))}
          </div>
          )}
          </>
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
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                  <option value="mixed">Hỗn hợp</option>
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
                <DateTimeInput
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
                <DateTimeInput
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
                <DateTimeInput
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
                <DateTimeInput
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
          </div>{" "}
        </Modal>

        <ConfirmDialog
          isOpen={confirmDialog.open}
          title="Xác nhận xóa"
          message={confirmDialog.message}
          onConfirm={() => confirmDialog.onConfirm?.()}
          onCancel={() =>
            setConfirmDialog({ open: false, message: "", onConfirm: null })
          }
          confirmText="Xóa"
          cancelText="Hủy"
          type="danger"
        />

        {/* Modal xem trước import VĐV từ CLB */}
        <Modal
          isOpen={!!clubImportResult}
          onClose={() => setClubImportResult(null)}
          title="📥 Xem trước Import VĐV từ CLB"
        >
          {clubImportResult && (
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#6366f1' }}>{clubImportResult.totalFiles}</div>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>File CLB</div>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{clubImportResult.totalMatched}</div>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>VĐV khớp hạng mục</div>
                </div>
                <div style={{ background: clubImportResult.totalUnmatched > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(100, 116, 139, 0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: clubImportResult.totalUnmatched > 0 ? '#ef4444' : '#64748b' }}>{clubImportResult.totalUnmatched}</div>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>Không khớp</div>
                </div>
              </div>

              {/* Per-club breakdown */}
              {clubImportResult.results.map((result, idx) => (
                <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                    🏢 {result.clubName || result.fileName}
                    {result.coachName && <span style={{ fontWeight: '400', color: '#94a3b8', marginLeft: '8px' }}>HLV: {result.coachName}</span>}
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                    {result.athletes.length} VĐV • File: {result.fileName}
                  </div>
                </div>
              ))}

              {/* Matched details by category */}
              {clubImportResult.totalMatched > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ marginBottom: '8px' }}>✅ VĐV khớp hạng mục:</h4>
                  {Object.entries(
                    clubImportResult.matchDetails.reduce((acc, item) => {
                      if (!acc[item.categoryName]) acc[item.categoryName] = [];
                      acc[item.categoryName].push(item);
                      return acc;
                    }, {})
                  ).map(([catName, items]) => (
                    <div key={catName} style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '6px', padding: '8px 12px', marginBottom: '6px', fontSize: '13px' }}>
                      <strong>{catName}</strong> — {items.length} VĐV
                      <span style={{ color: '#94a3b8', marginLeft: '8px' }}>
                        ({items.map((i) => i.athlete.name).join(', ')})
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Unmatched athletes */}
              {clubImportResult.totalUnmatched > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ color: '#ef4444', marginBottom: '8px' }}>⚠️ VĐV không khớp hạng mục ({clubImportResult.totalUnmatched}):</h4>
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
                    {clubImportResult.unmatchedAthletes.map((a, idx) => (
                      <div key={idx} style={{ marginBottom: '4px' }}>
                        • <strong>{a.name}</strong> ({a.clubName}) — Nội dung: "{a.eventName || 'Trống'}"
                      </div>
                    ))}
                    <p style={{ marginTop: '8px', color: '#fca5a5', fontStyle: 'italic' }}>
                      Các VĐV này sẽ KHÔNG được import. Kiểm tra lại tên nội dung trong file Excel khớp với tên hạng mục trong giải đấu.
                    </p>
                  </div>
                </div>
              )}

              {/* Errors */}
              {clubImportResult.errors.length > 0 && (
                <div style={{ marginTop: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px' }}>
                  <strong style={{ color: '#ef4444' }}>Lỗi:</strong>
                  <ul style={{ margin: '8px 0 0 16px', fontSize: '13px', color: '#fca5a5' }}>
                    {clubImportResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setClubImportResult(null)}
                >
                  Hủy
                </button>
                {clubImportResult.totalMatched > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmClubImport}
                  >
                    ✅ Import {clubImportResult.totalMatched} VĐV
                  </button>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* Bulk Draw Modal */}
        <Modal
          isOpen={showBulkDrawModal}
          onClose={() => setShowBulkDrawModal(false)}
          title="🎲 Bốc thăm hàng loạt"
        >
          <div style={{maxHeight: '60vh', overflowY: 'auto'}}>
            {!bulkDrawResults ? (
              <>
                <p style={{color:'#64748b',fontSize:'13px',marginBottom:'12px'}}>
                  Chọn các nội dung muốn bốc thăm. Chỉ các nội dung có ≥ 3 VĐV mới có thể bốc thăm.
                </p>

                {/* Select all */}
                <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 12px',background:'#f1f5f9',borderRadius:'8px',marginBottom:'8px'}}>
                  <input
                    type="checkbox"
                    checked={tournament.categories.filter(c => (c.athletes?.length || 0) >= 3).every(c => bulkDrawSelection[c.id])}
                    onChange={(e) => {
                      const newSel = {...bulkDrawSelection};
                      tournament.categories.forEach(cat => {
                        if ((cat.athletes?.length || 0) >= 3) newSel[cat.id] = e.target.checked;
                      });
                      setBulkDrawSelection(newSel);
                    }}
                    style={{width:'16px',height:'16px',accentColor:'#6366f1'}}
                  />
                  <span style={{fontWeight:600,fontSize:'13px',color:'#334155'}}>Chọn tất cả</span>
                  <span style={{marginLeft:'auto',fontSize:'12px',color:'#64748b'}}>
                    {Object.values(bulkDrawSelection).filter(Boolean).length} / {tournament.categories.length} đã chọn
                  </span>
                </div>

                {/* Category list */}
                <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                  {tournament.categories.map(cat => {
                    const athleteCount = cat.athletes?.length || 0;
                    const canDraw = athleteCount >= 3;
                    const hasBracket = !!cat.bracket;
                    return (
                      <label
                        key={cat.id}
                        style={{
                          display:'flex',alignItems:'center',gap:'10px',padding:'8px 12px',
                          borderRadius:'8px',border:'1px solid #e2e8f0',cursor: canDraw ? 'pointer' : 'not-allowed',
                          opacity: canDraw ? 1 : 0.5,
                          background: bulkDrawSelection[cat.id] ? '#eef2ff' : '#fff',
                          transition: 'all 0.15s'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!!bulkDrawSelection[cat.id]}
                          disabled={!canDraw}
                          onChange={(e) => setBulkDrawSelection(prev => ({...prev, [cat.id]: e.target.checked}))}
                          style={{width:'16px',height:'16px',accentColor:'#6366f1'}}
                        />
                        <span className={`cat-type-dot ${cat.type}`} style={{width:'8px',height:'8px',borderRadius:'50%',background: cat.type==='kumite'?'#ef4444':'#3b82f6',flexShrink:0}}></span>
                        <span style={{flex:1,fontWeight:600,fontSize:'13px',color:'#1e293b'}}>{cat.name}</span>
                        <span style={{fontSize:'11px',color:'#64748b'}}>{athleteCount} VĐV</span>
                        {hasBracket && <span style={{fontSize:'10px',background:'#dcfce7',color:'#16a34a',padding:'2px 6px',borderRadius:'4px',fontWeight:600}}>✓ Đã bốc</span>}
                        {!canDraw && <span style={{fontSize:'10px',background:'#fef2f2',color:'#dc2626',padding:'2px 6px',borderRadius:'4px',fontWeight:600}}>Ín VĐV</span>}
                      </label>
                    );
                  })}
                </div>

                <div className="modal-actions" style={{marginTop:'16px'}}>
                  <button className="btn btn-secondary" onClick={() => setShowBulkDrawModal(false)}>Hủy</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleBulkDraw}
                    disabled={bulkDrawing || Object.values(bulkDrawSelection).filter(Boolean).length === 0}
                  >
                    {bulkDrawing ? '⏳ Đang bốc thăm...' : `🎲 Bốc thăm ${Object.values(bulkDrawSelection).filter(Boolean).length} nội dung`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{color:'#16a34a',marginBottom:'12px'}}>✅ Kết quả bốc thăm</h3>

                {bulkDrawResults.success.length > 0 && (
                  <div style={{marginBottom:'12px'}}>
                    <h4 style={{color:'#16a34a',fontSize:'13px',marginBottom:'6px'}}>✅ Thành công ({bulkDrawResults.success.length})</h4>
                    {bulkDrawResults.success.map((r, i) => (
                      <div key={i} style={{padding:'4px 8px',fontSize:'12px',color:'#334155'}}>
                        • {r.name} ({r.athletes} VĐV)
                      </div>
                    ))}
                  </div>
                )}

                {bulkDrawResults.failed.length > 0 && (
                  <div style={{marginBottom:'12px'}}>
                    <h4 style={{color:'#dc2626',fontSize:'13px',marginBottom:'6px'}}>❌ Thất bại ({bulkDrawResults.failed.length})</h4>
                    {bulkDrawResults.failed.map((r, i) => (
                      <div key={i} style={{padding:'4px 8px',fontSize:'12px',color:'#dc2626'}}>
                        • {r.name}: {r.error}
                      </div>
                    ))}
                  </div>
                )}

                {bulkDrawResults.skipped.length > 0 && (
                  <div style={{marginBottom:'12px'}}>
                    <h4 style={{color:'#d97706',fontSize:'13px',marginBottom:'6px'}}>⚠️ Bỏ qua ({bulkDrawResults.skipped.length})</h4>
                    {bulkDrawResults.skipped.map((r, i) => (
                      <div key={i} style={{padding:'4px 8px',fontSize:'12px',color:'#92400e'}}>
                        • {r.name}: {r.reason}
                      </div>
                    ))}
                  </div>
                )}

                <div className="modal-actions" style={{marginTop:'16px'}}>
                  <button className="btn btn-primary" onClick={() => setShowBulkDrawModal(false)}>Đóng</button>
                </div>
              </>
            )}
          </div>
        </Modal>
      </div>
    </div>
  );
}
