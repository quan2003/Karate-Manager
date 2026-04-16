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
import { useOnboarding } from "../context/OnboardingContext";
import { publishTournament, unpublishTournament, fetchTournamentById } from "../services/supabaseService";
import appIcon from "../assets/icon.png";
import "./TournamentPage.css";

export default function TournamentPage() {
  const { id } = useParams();
  const { tournaments, currentTournament } = useTournament();
  const dispatch = useTournamentDispatch();
  const { toast } = useToast();
  const { activeHint, clearHint } = useOnboarding();
  const [editingId, setEditingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    message: "",
    onConfirm: null,
  });
  const [showBulkDrawModal, setShowBulkDrawModal] = useState(false);
  const [bulkDrawSelection, setBulkDrawSelection] = useState({});
  const [bulkDrawResults, setBulkDrawResults] = useState(null);
  const [bulkDrawing, setBulkDrawing] = useState(false);
  const fileInputRef = useRef(null);
  const [lanStatus, setLanStatus] = useState({ running: false, ip: '', port: 3000 });
  const [publishing, setPublishing] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showExportPDFModal, setShowExportPDFModal] = useState(false);
  const [exportFilter, setExportFilter] = useState({ type: 'all', format: 'all', gender: 'all' });
  const [exportSelectedIds, setExportSelectedIds] = useState([]);
  const [searchQueryExport, setSearchQueryExport] = useState("");
  const [publishedSlug, setPublishedSlug] = useState("");
  const [linkStartTime, setLinkStartTime] = useState("");
  const [linkEndTime, setLinkEndTime] = useState("");

  // Tự động cuộn tới phần được highlight khi có gợi ý (Re-enactment)
  useEffect(() => {
    if (activeHint) {
      setTimeout(() => {
        const highlighted = document.querySelector(".hint-pulse");
        if (highlighted) {
          highlighted.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);
    }
  }, [activeHint]);

  const handleOpenModal = () => {
    setEditingId(null);
    setFormData({
      name: "",
      type: "kumite",
      gender: "male",
      ageGroup: "",
      weightClass: "",
      format: "single_elimination",
    });
    setShowModal(true);
  };

  const handleEditCategory = (category) => {
    setEditingId(category.id);
    setFormData({
      name: category.name || "",
      type: category.type || "kumite",
      gender: category.gender || "male",
      ageGroup: category.ageGroup || "",
      weightClass: category.weightClass || "",
      format: category.format || "single_elimination",
    });
    setShowModal(true);
  };
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

    // Fetch initial LAN server status
    const fetchLanStatus = async () => {
      if (window.electronAPI && window.electronAPI.lan) {
        const stats = await window.electronAPI.lan.getServerStatus();
        setLanStatus(stats || { running: false, ip: '', port: 3000 });
      }
    };
    fetchLanStatus();
  }, [id, dispatch]);

  // Fetch published config if exists when opening the modal
  useEffect(() => {
    if (showLinkModal && id) {
      const checkPublished = async () => {
        const result = await fetchTournamentById(id);
        if (result.success) {
          setPublishedSlug(result.slug);
          if (result.data) {
            setLinkStartTime(result.data.startTime || "");
            setLinkEndTime(result.data.endTime || "");
          }
        }
      };
      checkPublished();
    }
  }, [showLinkModal, id]);

  const tournament = currentTournament || tournaments.find((t) => t.id === id);

  const isCategoryFinished = (cat) => {
    if (!cat) return false;
    // 1. Check manually entered results
    const saved = tournament?.categoryResults?.[cat.id];
    if (saved && saved.first && saved.first.trim() !== "") return true;

    // 2. Check bracket final match
    if (cat.bracket?.matches) {
      const bracket = cat.bracket;
      const maxRound = Math.max(...bracket.matches.map(m => m.round || 0));
      const finalMatch = bracket.matches.find(
        (m) => m.round === maxRound && (m.round > 0 || m.isBye)
      );
      if (finalMatch?.winner) return true;
    }
    return false;
  };

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

    if (editingId) {
      dispatch({
        type: ACTIONS.UPDATE_CATEGORY,
        payload: {
          id: editingId,
          ...formData,
        },
      });
      toast.success("Đã cập nhật hạng mục!");
    } else {
      dispatch({
        type: ACTIONS.ADD_CATEGORY,
        payload: {
          tournamentId: tournament.id,
          ...formData,
        },
      });
      toast.success("Đã thêm hạng mục mới!");
    }

    setFormData({
      name: "",
      type: "kumite",
      gender: "male",
      ageGroup: "",
      weightClass: "",
      format: "single_elimination",
    });
    setEditingId(null);
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
    const clubs = new Set();
    tournament.categories?.forEach((c) => {
      c.athletes?.forEach((a) => {
        if (a.club) clubs.add(a.club.trim());
      });
    });
    return clubs;
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
    const teamKataSize = tournament.teamMedalsSettings?.kata || 3;
    const teamKumiteSize = tournament.teamMedalsSettings?.kumite || 3;
    const splitSettings = tournament.splitSettings || { enabled: false, threshold: 20 };

    tournament.categories.forEach((cat) => {
      const nameLower = cat.name?.toLowerCase() || '';
      const hasTeamKeywords = nameLower.includes('đồng đội') || nameLower.includes('hỗn hợp');
      const hasIndividualKeywords = nameLower.includes('cá nhân');
      
      // Determination logic: 
      // 1. If name says 'cá nhân', it's individual (ignores athlete isTeam flags)
      // 2. Otherwise, if cat.isTeam is true or name has team keywords, it's a team
      // 3. Fallback: only trust athlete isTeam flags if the category name is ambiguous
      let isTeamCategory = false;
      if (hasIndividualKeywords) {
        isTeamCategory = false;
      } else if (cat.isTeam || hasTeamKeywords) {
        isTeamCategory = true;
      } else if ((cat.athletes || []).some(a => a.isTeam)) {
        // Only fallback to athlete flags if no explicit 'individual' or 'team' keyword is in the name
        isTeamCategory = true;
      }
      
      // Calculate how many sets of medals are awarded (accounts for Sigma splits)
      let setsCount = 1;
      const threshold = splitSettings.threshold || 20;
      const athleteCount = cat.athletes?.length || 0;

      if (cat.sigmaSplitEnabled === false) {
        setsCount = 1;
      } else if (cat.sigmaSplitEnabled === true) {
        setsCount = athleteCount > 1 ? Math.max(2, Math.floor(athleteCount / threshold)) : 1;
      } else if (splitSettings.enabled && athleteCount > threshold) {
        setsCount = Math.max(2, Math.floor(athleteCount / threshold));
      }

      if (isTeamCategory) {
        // Team: medals per participant depending on type
        const teamSize = cat.type === 'kata' ? teamKataSize : teamKumiteSize;
        gold += teamSize * setsCount;
        silver += teamSize * setsCount;
        bronze += (teamSize * 2) * setsCount;
      } else {
        // Individual: 1 gold, 1 silver, 2 bronze per category (per set)
        gold += 1 * setsCount;
        silver += 1 * setsCount;
        bronze += 2 * setsCount;
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
    const categoriesWithBracket = tournament.categories.filter((c) => c.bracket);
    if (categoriesWithBracket.length === 0) {
      alert("Chưa có hạng mục nào đã bốc thăm!");
      return;
    }
    setExportSelectedIds(categoriesWithBracket.map(c => c.id));
    setShowExportPDFModal(true);
  };

  const handleExportSelectedPDF = async () => {
    const categoriesToExport = tournament.categories.filter(c => exportSelectedIds.includes(c.id) && c.bracket);
    if (categoriesToExport.length === 0) {
      alert("Vui lòng chọn ít nhất một hạng mục đã bốc thăm!");
      return;
    }
    
    const splitSettings = tournament.splitSettings || { enabled: false, threshold: 20 };
    const sponsorLogos = tournament.sponsorLogos || null;
    
    // Sort logic to make the PDF organized: Type -> Format -> Name
    const sorted = [...categoriesToExport].sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.name.localeCompare(b.name);
    });

    await exportAllBracketsToPDF(sorted, tournament.name, null, tournament.schedule || null, splitSettings, sponsorLogos);
    setShowExportPDFModal(false);
  };

  const applyBulkFilter = (filters) => {
    const filtered = tournament.categories.filter(c => {
      if (!c.bracket) return false;
      const matchesType = filters.type === 'all' || c.type === filters.type;
      const isTeam = c.isTeam || c.name.toLowerCase().includes('đồng đội') || c.name.toLowerCase().includes('hỗn hợp');
      const matchesFormat = filters.format === 'all' || (filters.format === 'team' ? isTeam : !isTeam);
      const matchesGender = filters.gender === 'all' || c.gender === filters.gender;
      return matchesType && matchesFormat && matchesGender;
    });
    setExportSelectedIds(filtered.map(f => f.id));
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
        const { athletes, errors, clubName, coachName, teamLeaderName, additionalCoaches } = await parseCoachExcelFile(file);
        if (errors.length > 0) {
          allErrors.push(...errors.map((err) => `[${file.name}] ${err}`));
        }
        allResults.push({
          fileName: file.name,
          clubName: clubName || file.name,
          coachName,
          teamLeaderName,
          additionalCoaches,
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

    // Dispatch update for club registrations based on parsed coach names & team leaders
    const existingRegs = tournament.clubRegistrations || {};
    let newRegs = { ...existingRegs };
    let regsUpdated = false;

    clubImportResult.results.forEach(result => {
       const cName = result.clubName || result.fileName;
       if (!newRegs[cName]) {
          newRegs[cName] = { coaches: [], teamLeader: '' };
       }
       
       if (result.coachName && !newRegs[cName].coaches.includes(result.coachName)) {
           newRegs[cName].coaches.push(result.coachName);
           regsUpdated = true;
       }
       if (result.additionalCoaches && result.additionalCoaches.length > 0) {
           result.additionalCoaches.forEach(hm => {
               if (!newRegs[cName].coaches.includes(hm)) {
                   newRegs[cName].coaches.push(hm);
                   regsUpdated = true;
               }
           });
       }
       if (result.teamLeaderName && !newRegs[cName].teamLeader) {
           newRegs[cName].teamLeader = result.teamLeaderName;
           regsUpdated = true;
       }
    });

    if (regsUpdated) {
        dispatch({
          type: ACTIONS.UPDATE_CLUB_REGISTRATIONS,
          payload: {
             tournamentId: tournament.id,
             clubRegistrations: newRegs
          }
        });
    }

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
        if (teams.length < 3) {
          results.skipped.push({ name: cat.name, reason: `Chỉ có ${teams.length} đội (cần ≥ 3 CLB khác nhau)` });
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

        // Check if all athletes are from the same club, but still allow drawing if count >= 3
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

  const drawableCount = tournament.categories.filter(c => {
    const isTeamCategory = c.name?.toLowerCase().includes('đồng đội') ||
      c.isTeam || (c.athletes || []).some(a => a.isTeam);
    return !c.bracket && (
      isTeamCategory
        ? (new Set((c.athletes || []).map(a => (a.club || '').trim().toLowerCase()).filter(Boolean))).size >= 3
        : (c.athletes?.length || 0) >= 3
    );
  }).length;
  const handlePublishTournament = async () => {
    setPublishing(true);
    try {
      const result = await publishTournament(tournament, linkStartTime, linkEndTime);
      if (result.success) {
        setPublishedSlug(result.slug);
        setShowLinkModal(true);
        toast.success("Đã cài đặt link đăng ký trực tiếp!");
      } else {
        toast.error("Lỗi: " + result.message);
      }
    } catch (err) {
      toast.error("Lỗi xuất bản: " + err.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublishTournament = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa link đăng ký này? Link sẽ không còn truy cập được nữa.")) return;
    
    setPublishing(true);
    try {
      const result = await unpublishTournament(tournament.id);
      if (result.success) {
        setPublishedSlug("");
        setShowLinkModal(false);
        toast.success("Đã xóa link đăng ký!");
      } else {
        toast.error("Lỗi: " + result.message);
      }
    } catch (err) {
      toast.error("Lỗi xóa link: " + err.message);
    } finally {
      setPublishing(false);
    }
  };

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
            <h1 className="page-title">
              <img src={appIcon} alt="" className="page-title-logo" />
              {tournament.name}
            </h1>
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
            className={`tournament-action-btn action-export ${activeHint === "export_krt" ? "hint-pulse" : ""}`}
            onClick={() => { handleOpenKrtModal(); clearHint(); }}
            title="Xuất file .krt cho HLV đăng ký"
            data-hint="XUẤT FILE .KRT"
          >
            <span className="action-icon">📤</span>
            <span className="action-label">Xuất<br/>(.krt)</span>
          </button>

          <button
            className={`tournament-action-btn action-export ${activeHint === "export_kmatch" ? "hint-pulse" : ""}`}
            onClick={() => { handleOpenKmatchModal(); clearHint(); }}
            title="Xuất file chấm điểm cho Thư ký"
          >
            <span className="action-icon">🎯</span>
            <span className="action-label">Xuất<br/>(.kmatch)</span>
          </button>

          {tournament.categories.filter((c) => c.bracket).length > 0 && (
            <button
              className={`tournament-action-btn action-export ${activeHint === "publish_bracket" ? "hint-pulse" : ""}`}
              onClick={() => { handleExportAllPDF(); clearHint(); }}
            >
              <span className="action-icon">📄</span>
              <span className="action-label">Xuất tất cả<br/>PDF</span>
            </button>
          )}

          <button
            className={`tournament-action-btn action-export ${activeHint === "create_category" ? "hint-pulse" : ""}`}
            onClick={() => { handleDownloadTemplate(); clearHint(); }}
          >
            <span className="action-icon">📥</span>
            <span className="action-label">Tải mẫu<br/>Excel</span>
          </button>

          <label className={`tournament-action-btn action-import ${activeHint === "create_category" ? "hint-pulse" : ""}`} style={{ cursor: "pointer" }} onClick={() => clearHint()}>
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

          <label className={`tournament-action-btn action-import ${activeHint === "import_athletes" ? "hint-pulse" : ""}`} style={{ cursor: "pointer" }} onClick={() => clearHint()}>
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
            className={`tournament-action-btn action-draw ${(activeHint === "smart_draw" || activeHint === "smart_draw_need_category") ? "hint-pulse" : ""}`}
            onClick={() => { handleOpenBulkDraw(); clearHint(); }}
            title={`${drawableCount} nội dung có thể bốc thăm`}
          >
            <span className="action-icon">🎲</span>
            <span className="action-label">Bốc thăm<br/>tất cả {drawableCount > 0 && <span className="action-badge">{drawableCount}</span>}</span>
          </button>

          <Link
            to={`/schedule/${tournament.id}`}
            className={`tournament-action-btn action-schedule ${activeHint === "setup_schedule" ? "hint-pulse" : ""}`}
            onClick={() => clearHint()}
            data-hint="BƯỚC 1: XẾP LỊCH"
          >
            <span className="action-icon">📋</span>
            <span className="action-label">Lịch thi<br/>đấu</span>
          </Link>

          <Link
            to={`/athletes/${tournament.id}`}
            className={`tournament-action-btn action-schedule ${activeHint === "import_athletes" ? "hint-pulse" : ""}`}
            title="Quản lý toàn bộ VĐV"
            onClick={() => clearHint()}
            data-hint="QUẢN LÝ VĐV"
          >
            <span className="action-icon">👥</span>
            <span className="action-label">Quản lý<br/>VĐV</span>
          </Link>

          <Link
            to={`/certificate/${tournament.id}`}
            className={`tournament-action-btn action-schedule ${activeHint === "closing_ceremony" ? "hint-pulse" : ""}`}
            title="In giấy chứng nhận huy chương"
            onClick={() => clearHint()}
            data-hint="IN GIẤY CHỨNG NHẬN"
          >
            <span className="action-icon">🏅</span>
            <span className="action-label">In<br/>GCN</span>
          </Link>

          <button
            className={`tournament-action-btn action-add ${activeHint === "create_category" ? "hint-pulse" : ""}`}
            onClick={() => { handleOpenModal(); clearHint(); }}
            data-hint="THÊM HẠNG MỤC"
          >
            <span className="action-icon">➕</span>
            <span className="action-label">Thêm hạng<br/>mục</span>
          </button>

          <button
            className={`tournament-action-btn action-lan ${activeHint === "lan_sync" ? "hint-pulse" : ""}`}
            onClick={() => {
              clearHint();
              alert("Chức năng Đồng bộ LAN: Kết nối máy Admin với các máy Thư ký qua WIFI/LAN nội bộ để nhận kết quả trực tiếp.");
            }}
            title="Đồng bộ kết quả qua mạng nội bộ LAN/WIFI"
            data-hint="BẬT ĐỒNG BỘ LAN"
          >
            <span className="action-icon">🌐</span>
            <span className="action-label">Đồng bộ<br/>LAN</span>
          </button>

          <button
            className={`tournament-action-btn action-logo ${activeHint === "logo_sponsor" ? "hint-pulse" : ""}`}
            onClick={() => {
              clearHint();
              alert("Chức năng Logo & Tài trợ: Tùy chỉnh Logo giải đấu, Logo nhà tài trợ và Chữ ký số trên các bản in.");
            }}
            title="Tùy chỉnh Logo, Chữ ký và Nhà tài trợ"
            data-hint="LOGO & TÀI TRỢ"
          >
            <span className="action-icon">🏷️</span>
            <span className="action-label">Logo &<br/>Tài trợ</span>
          </button>

          <button
            className={`tournament-action-btn action-link ${activeHint === "direct_link" ? "hint-pulse" : ""}`}
            onClick={() => {
              clearHint();
              handlePublishTournament();
            }}
            disabled={publishing}
            title="Tạo link gửi cho HLV đăng ký trực tuyến"
          >
            <span className="action-icon">🔗</span>
            <span className="action-label">Link trực<br/>tiếp</span>
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
          <div className="stat-item">
            <span className="stat-value" style={{color: '#059669'}}>
              {tournament.categories.filter(isCategoryFinished).length}
            </span>
            <span className="stat-label">Đã có kết quả</span>
          </div>
        </div>

        {/* Medal estimation */}
        {tournament.categories.length > 0 && (
          <div className="medal-estimation-bar">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <h3 className="medal-estimation-title" style={{ margin: 0 }}>🏅 Dự tính huy chương</h3>
              <div style={{ display: 'flex', gap: '15px', fontSize: '13px', color: '#475569', background: '#f1f5f9', padding: '6px 12px', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  Số HC Kata ĐĐ/đội:
                  <input
                    type="number"
                    min="1"
                    value={tournament.teamMedalsSettings?.kata || 3}
                    onChange={(e) => {
                      dispatch({
                        type: ACTIONS.UPDATE_TOURNAMENT,
                        payload: {
                          id: tournament.id,
                          teamMedalsSettings: {
                            ...(tournament.teamMedalsSettings || {}),
                            kata: parseInt(e.target.value) || 3
                          }
                        }
                      });
                    }}
                    style={{ width: '45px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  Số HC Kumite ĐĐ/đội:
                  <input
                    type="number"
                    min="1"
                    value={tournament.teamMedalsSettings?.kumite || 5}
                    onChange={(e) => {
                      dispatch({
                        type: ACTIONS.UPDATE_TOURNAMENT,
                        payload: {
                          id: tournament.id,
                          teamMedalsSettings: {
                            ...(tournament.teamMedalsSettings || {}),
                            kumite: parseInt(e.target.value) || 5
                          }
                        }
                      });
                    }}
                    style={{ width: '45px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                  />
                </label>
              </div>
            </div>
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
            <Link to={`/statistics/${tournament.id}`} className={`btn btn-secondary ${activeHint === "check_fees" ? "hint-pulse" : ""}`} style={{marginTop: '12px', alignSelf: 'flex-start'}}>
              📊 Quản lý thống kê & Bảng tổng sắp huy chương
            </Link>
          </div>
        )}

        {/* Split Settings */}
        <div 
          className={activeHint === "sigma_split" ? "hint-pulse" : ""}
          style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
            padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap'
          }}
        >
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#111827', fontWeight: 600 }}
            className={activeHint === "sigma_split" ? "hint-pulse" : ""}
            data-hint="BƯỚC 1: BẬT CHIA"
          >
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
                clearHint();
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
                  data-hint="BƯỚC 2: CHỈNH NGƯỠNG"
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

              <button 
                className="btn btn-secondary btn-sm" 
                style={{ marginLeft: 'auto', background: '#fff', border: '1px solid #7c3aed', color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setShowSplitModal(true)}
              >
                📋 Chọn nội dung chia ({tournament.categories.filter(c => {
                   const threshold = tournament.splitSettings?.threshold || 20;
                   const athleteCount = c.athletes?.length || 0;
                   if (c.sigmaSplitEnabled === false) return false;
                   if (c.sigmaSplitEnabled === true) return true;
                   return (tournament.splitSettings?.enabled && athleteCount > threshold);
                }).length})
              </button>
            </>
          )}
        </div>

        {/* Dual Combat (LAN Sync) Settings */}
        <div 
          className={activeHint === "lan_sync" ? "hint-pulse" : ""}
          data-hint="BƯỚC 1: ĐẾN ĐÂY"
          style={{
            background: lanStatus.running ? '#f0fdf4' : '#f8fafc', 
            border: lanStatus.running ? '1px solid #bbf7d0' : '1px solid #e2e8f0', 
            borderRadius: '12px',
            padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap',
            transition: 'all 0.3s'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>📡</span>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', color: '#1e293b' }}>Chế độ Tác chiến kép (Đồng bộ LAN)</h4>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                Cho phép nhận kết quả trực tiếp từ máy Thư ký qua mạng nội bộ
              </p>
            </div>
          </div>
          
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '15px' }}>
            {lanStatus.running && (
              <div style={{ background: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 0 rgba(34, 197, 94, 0.4)', animation: 'pulse 2s infinite' }}></span>
                Đang chạy: {lanStatus.ip}:{lanStatus.port}
              </div>
            )}
            
            <button 
              onClick={async () => {
                clearHint();
                if (!window.electronAPI?.lan) {
                  toast.error("Không hỗ trợ tính năng này trên trình duyệt");
                  return;
                }
                
                if (lanStatus.running) {
                  await window.electronAPI.lan.stopServer();
                  setLanStatus({ ...lanStatus, running: false });
                  toast.success("Đã tắt máy chủ nhận điểm");
                } else {
                  const result = await window.electronAPI.lan.startServer();
                  if (result.success) {
                    setLanStatus({ ...lanStatus, running: true, ip: result.ip });
                    toast.success(`Đã bật máy chủ nhận điểm tại IP: ${result.ip}`);
                  } else {
                    toast.error(`Lỗi bật máy chủ: ${result.error}`);
                  }
                }
              }}
              className={`btn ${lanStatus.running ? 'btn-danger' : 'btn-primary'} ${activeHint === "lan_sync" ? "hint-pulse" : ""}`}
              style={{ padding: '8px 16px', borderRadius: '8px', fontWeight: 600 }}
              data-hint="BƯỚC 2: BẬT MÁY CHỦ"
            >
              {lanStatus.running ? '⏹ Tắt máy chủ' : '▶ Bật máy chủ nhận điểm'}
            </button>
          </div>
        </div>

        {/* Sponsor & Logo Settings */}
        <div 
          className={activeHint === "logo_sponsor" ? "hint-pulse" : ""}
          style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
            padding: '16px 20px', marginBottom: '20px'
          }}
        >
          <h3 
            className={activeHint === "logo_sponsor" ? "hint-pulse" : ""}
            data-hint="BƯỚC 1: XUỐNG ĐÂY"
            style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            🏷️ Logo hệ thống & Nhà tài trợ
          </h3>
          
          {/* Tournament Logos (multiple) */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '8px' }}>
              🏆 Logo giải đấu — có thể thêm nhiều logo (hiển thị góc trái trên PDF)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {/* Backward compat: show old systemLogo as first item if exists and no tournamentLogos */}
              {(tournament.sponsorLogos?.tournamentLogos || (tournament.sponsorLogos?.systemLogo ? [tournament.sponsorLogos.systemLogo] : [])).map((logo, idx) => (
                <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                  <img 
                    src={logo} 
                    alt={`Logo giải đấu ${idx + 1}`}
                    style={{ height: '60px', maxWidth: '180px', objectFit: 'contain', borderRadius: '8px', border: '2px solid #bfdbfe', background: '#fff', padding: '4px', boxShadow: '0 1px 4px rgba(59,130,246,0.10)' }} 
                  />
                  <div style={{ position: 'absolute', top: '-8px', left: '-8px', background: '#3b82f6', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{idx + 1}</div>
                  <button
                    onClick={() => {
                      const currentLogos = tournament.sponsorLogos?.tournamentLogos || (tournament.sponsorLogos?.systemLogo ? [tournament.sponsorLogos.systemLogo] : []);
                      const newLogos = currentLogos.filter((_, i) => i !== idx);
                      const updated = { ...(tournament.sponsorLogos || {}) };
                      updated.tournamentLogos = newLogos;
                      delete updated.systemLogo; // migrate away from old key
                      dispatch({
                        type: ACTIONS.UPDATE_SPONSOR_LOGOS,
                        payload: { tournamentId: tournament.id, sponsorLogos: updated }
                      });
                      toast.success("Đã xóa logo giải đấu");
                    }}
                    style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                    title="Xóa logo"
                  >×</button>
                </div>
              ))}
              <label 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#e0f2fe', color: '#0369a1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, border: '1px dashed #7dd3fc', transition: 'all 0.2s' }}
                onClick={() => clearHint()}
                className={activeHint === "logo_sponsor" ? "hint-pulse" : ""}
                data-hint="BƯỚC 2: TẢI LOGO"
              >
                ➕ Thêm logo giải đấu
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    if (!files.length) return;
                    const currentLogos = tournament.sponsorLogos?.tournamentLogos || (tournament.sponsorLogos?.systemLogo ? [tournament.sponsorLogos.systemLogo] : []);
                    let loaded = 0;
                    const newLogos = [...currentLogos];
                    files.forEach((file) => {
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error(`${file.name}: quá lớn (tối đa 2MB)`);
                        loaded++;
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        newLogos.push(evt.target.result);
                        loaded++;
                        if (loaded === files.length) {
                          const updated = { ...(tournament.sponsorLogos || {}) };
                          updated.tournamentLogos = newLogos;
                          delete updated.systemLogo; // migrate to new key
                          dispatch({
                            type: ACTIONS.UPDATE_SPONSOR_LOGOS,
                            payload: { tournamentId: tournament.id, sponsorLogos: updated }
                          });
                          toast.success(`Đã thêm ${files.length} logo giải đấu!`);
                        }
                      };
                      reader.readAsDataURL(file);
                    });
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {((tournament.sponsorLogos?.tournamentLogos?.length || 0) === 0 && !tournament.sponsorLogos?.systemLogo) && (
              <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                💡 Tải lên logo giải đấu để hiển thị góc trái trên tất cả file PDF xuất ra (hỗ trợ nhiều logo)
              </span>
            )}
          </div>

          {/* Sponsor Logos */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '8px' }}>
              Logo nhà tài trợ (hiển thị trên PDF & bảng điểm)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {(tournament.sponsorLogos?.sponsors || []).map((logo, idx) => (
                <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                  <img 
                    src={logo} 
                    alt={`Tài trợ ${idx + 1}`} 
                    style={{ height: '55px', maxWidth: '160px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', padding: '4px' }} 
                  />
                  <button
                    onClick={() => {
                      const newSponsors = [...(tournament.sponsorLogos?.sponsors || [])];
                      newSponsors.splice(idx, 1);
                      dispatch({
                        type: ACTIONS.UPDATE_SPONSOR_LOGOS,
                        payload: {
                          tournamentId: tournament.id,
                          sponsorLogos: {
                            ...(tournament.sponsorLogos || {}),
                            sponsors: newSponsors,
                          }
                        }
                      });
                      toast.success("Đã xóa logo nhà tài trợ");
                    }}
                    style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                    title="Xóa logo"
                  >×</button>
                </div>
              ))}
              <label 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#fef3c7', color: '#92400e', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, border: '1px dashed #fbbf24', transition: 'all 0.2s' }}
                onClick={() => clearHint()}
                className={activeHint === "logo_sponsor" ? "hint-pulse" : ""}
                data-hint="BƯỚC 2: TẢI LOGO"
              >
                ➕ Thêm logo nhà tài trợ
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    if (!files.length) return;
                    const currentSponsors = [...(tournament.sponsorLogos?.sponsors || [])];
                    let loaded = 0;
                    files.forEach((file) => {
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error(`${file.name}: quá lớn (tối đa 2MB)`);
                        loaded++;
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        currentSponsors.push(evt.target.result);
                        loaded++;
                        if (loaded === files.length) {
                          dispatch({
                            type: ACTIONS.UPDATE_SPONSOR_LOGOS,
                            payload: {
                              tournamentId: tournament.id,
                              sponsorLogos: {
                                ...(tournament.sponsorLogos || {}),
                                sponsors: currentSponsors,
                              }
                            }
                          });
                          toast.success(`Đã thêm ${files.length} logo nhà tài trợ!`);
                        }
                      };
                      reader.readAsDataURL(file);
                    });
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {(tournament.sponsorLogos?.sponsors || []).length === 0 && (
              <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                💡 Tải lên logo nhà tài trợ để hiển thị trên file PDF xuất ra và bảng điểm
              </span>
            )}
          </div>
          {/* Signature Images (multiple) */}
          <div style={{ marginTop: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '8px' }}>
              ✍️ Chữ ký Ban tổ chức — có thể thêm nhiều chữ ký (hiển thị cuối PDF)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {/* Backward compat: show old signature as first item if exists and no signatures array */}
              {(tournament.sponsorLogos?.signatures || (tournament.sponsorLogos?.signature ? [tournament.sponsorLogos.signature] : [])).map((sig, idx) => (
                <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                  <img 
                    src={sig} 
                    alt={`Chữ ký ${idx + 1}`} 
                    style={{ height: '60px', maxWidth: '180px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', padding: '4px' }} 
                  />
                  <div style={{ position: 'absolute', top: '-8px', left: '-8px', background: '#22c55e', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{idx + 1}</div>
                  <button
                    onClick={() => {
                      const currentSigs = tournament.sponsorLogos?.signatures || (tournament.sponsorLogos?.signature ? [tournament.sponsorLogos.signature] : []);
                      const newSigs = currentSigs.filter((_, i) => i !== idx);
                      const updated = { ...(tournament.sponsorLogos || {}) };
                      updated.signatures = newSigs;
                      delete updated.signature; // migrate away from old key
                      dispatch({
                        type: ACTIONS.UPDATE_SPONSOR_LOGOS,
                        payload: { tournamentId: tournament.id, sponsorLogos: updated }
                      });
                      toast.success("Đã xóa chữ ký");
                    }}
                    style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                    title="Xóa chữ ký"
                  >×</button>
                </div>
              ))}
              <label 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#f0fdf4', color: '#16a34a', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, border: '1px dashed #86efac', transition: 'all 0.2s' }}
                onClick={() => clearHint()}
                className={activeHint === "logo_sponsor" ? "hint-pulse" : ""}
                data-hint="BƯỚC 2: TẢI CHỮ KÝ"
              >
                ➕ Thêm chữ ký (PNG/JPG)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    if (!files.length) return;
                    const currentSigs = tournament.sponsorLogos?.signatures || (tournament.sponsorLogos?.signature ? [tournament.sponsorLogos.signature] : []);
                    let loaded = 0;
                    const newSigs = [...currentSigs];
                    files.forEach((file) => {
                      if (file.size > 1 * 1024 * 1024) {
                        toast.error(`${file.name}: quá lớn (tối đa 1MB)`);
                        loaded++;
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        newSigs.push(evt.target.result);
                        loaded++;
                        if (loaded === files.length) {
                          const updated = { ...(tournament.sponsorLogos || {}) };
                          updated.signatures = newSigs;
                          delete updated.signature; // migrate to new key
                          dispatch({
                            type: ACTIONS.UPDATE_SPONSOR_LOGOS,
                            payload: { tournamentId: tournament.id, sponsorLogos: updated }
                          });
                          toast.success(`Đã thêm ${files.length} chữ ký!`);
                        }
                      };
                      reader.readAsDataURL(file);
                    });
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {((tournament.sponsorLogos?.signatures?.length || 0) === 0 && !tournament.sponsorLogos?.signature) && (
              <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', display: 'block', marginTop: '6px' }}>
                💡 Tải lên chữ ký Ban tổ chức để hiển thị cuối các file PDF (hỗ trợ nhiều chữ ký, dàn ngang qua phải)
              </span>
            )}
          </div>
        </div>

        {tournament.categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>Chưa có hạng mục nào</h3>
            <p>Thêm các hạng mục thi đấu như Kumite Nam -60kg, Kata Nữ...</p>
            <button
              className="btn btn-primary"
              onClick={handleOpenModal}
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
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="edit-btn"
                      onClick={() => {
                        const nextValue = category.sigmaSplitEnabled === undefined ? true : (category.sigmaSplitEnabled === true ? false : undefined);
                        dispatch({
                          type: ACTIONS.UPDATE_CATEGORY,
                          payload: { id: category.id, sigmaSplitEnabled: nextValue }
                        });
                        if (nextValue === true) toast.success(`Đã ép buộc chia Sigma cho: ${category.name}`);
                        else if (nextValue === false) toast.success(`Đã tắt chia Sigma cho: ${category.name}`);
                        else toast.info(`Đã đặt lại Sigma mặc định cho: ${category.name}`);
                      }}
                      title={category.sigmaSplitEnabled === true ? "Đang ép buộc chia Sigma" : (category.sigmaSplitEnabled === false ? "Đang tắt chia Sigma" : "Chia Sigma theo cài đặt chung")}
                      style={{
                        background: category.sigmaSplitEnabled === true ? '#7c3aed' : (category.sigmaSplitEnabled === false ? '#94a3b8' : 'transparent'),
                        color: category.sigmaSplitEnabled !== undefined ? '#fff' : '#475569',
                        padding: '4px',
                        border: category.sigmaSplitEnabled !== undefined ? 'none' : '1px solid #e2e8f0',
                        fontSize: '12px'
                      }}
                    >
                      {category.sigmaSplitEnabled === false ? "🚫" : "✂️"}
                    </button>
                    <button
                      className="edit-btn"
                      onClick={() => handleEditCategory(category)}
                      title="Sửa"
                    >
                      ✏️
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => handleDeleteCategory(category.id)}
                      title="Xóa"
                    >
                      🗑️
                    </button>
                  </div>
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
                  {category.bracket && (() => {
                    const nonByeMatches = category.bracket.matches?.filter(m => !m.isBye) || [];
                    const completedMatches = nonByeMatches.filter(m => m.winner);
                    const total = nonByeMatches.length;
                    const completed = completedMatches.length;
                    const isComplete = isCategoryFinished(category);
                    const hasResults = completed > 0;
                    
                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        <span className="drawn-icon">✓ Đã bốc thăm</span>
                        {isComplete ? (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'linear-gradient(135deg, #dcfce7, #d1fae5)',
                            color: '#059669',
                            border: '1px solid #86efac',
                          }}>
                            🏆 Đã có kết quả
                          </span>
                        ) : hasResults ? (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                            color: '#92400e',
                            border: '1px solid #fcd34d',
                          }}>
                            ⏳ Đang thi đấu {completed}/{total}
                          </span>
                        ) : null}
                      </div>
                    );
                  })()}
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
          title={editingId ? "Cập nhật hạng mục" : "Thêm hạng mục mới"}
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
                {editingId ? "Cập nhật" : "Thêm hạng mục"}
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

        {/* Link Modal */}
        <Modal
          isOpen={showLinkModal}
          onClose={() => setShowLinkModal(false)}
          title="🔗 Link đăng ký trực tiếp"
        >
        <div style={{ padding: "20px" }}>
          <p
            style={{
              fontSize: "14px",
              color: "#64748b",
              marginBottom: "16px",
              lineHeight: 1.5,
            }}
          >
            HLV chỉ cần mở link này là có thể nhập danh sách VĐV ngay lập tức mà
            không cần tải file .krt:
          </p>
          
          <div className="link-time-settings" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="input-group">
              <label className="input-label" style={{ marginBottom: '4px', display: 'block' }}>Thời gian bắt đầu nhập</label>
              <DateTimeInput
                value={linkStartTime}
                onChange={(e) => setLinkStartTime(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label className="input-label" style={{ marginBottom: '4px', display: 'block' }}>Thời gian kết thúc nhập</label>
              <DateTimeInput
                value={linkEndTime}
                onChange={(e) => setLinkEndTime(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              background: "#f1f5f9",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              wordBreak: "break-all",
              fontFamily: "monospace",
              fontSize: "13px",
              color: "#0f172a",
              marginBottom: "20px",
            }}
          >
            {`https://dang-ky-vdv.pages.dev/${publishedSlug || '...'}`}
          </div>
          <div className="modal-actions" style={{ flexDirection: 'column', gap: '8px' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                const url = `https://dang-ky-vdv.pages.dev/${publishedSlug}`;
                navigator.clipboard.writeText(url);
                toast.success("Đã sao chép link!");
              }}
              style={{ width: "100%" }}
              disabled={!publishedSlug}
            >
              📋 Sao chép Link
            </button>
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <button
                className="btn btn-secondary"
                onClick={handlePublishTournament}
                style={{ flex: 1 }}
                disabled={publishing}
              >
                {publishedSlug ? "🔄 Cập nhật" : "🚀 Tạo Link"}
              </button>
              {publishedSlug && (
                <button
                  className="btn btn-danger"
                  onClick={handleUnpublishTournament}
                  style={{ flex: 1 }}
                  disabled={publishing}
                >
                  🗑️ Xóa link
                </button>
              )}
            </div>
          </div>
        </div>
        </Modal>

        {/* Modal chọn nội dung chia Sigma */}
        <Modal
          isOpen={showSplitModal}
          onClose={() => setShowSplitModal(false)}
          title="Chọn nội dung áp dụng Sigma"
        >
          <div className="split-selection-modal" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
              Dưới đây là danh sách các nội dung. Bạn có thể ép buộc chia nhánh (✂️) hoặc tắt chia nhánh (🚫) cho từng hạng mục.
              Nhánh Sigma giúp chia các bảng đông người thành nhiều phần để thi đấu song song.
            </p>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
               <button className="btn btn-sm btn-secondary" onClick={() => {
                 tournament.categories.forEach(c => {
                   dispatch({ type: ACTIONS.UPDATE_CATEGORY, payload: { id: c.id, sigmaSplitEnabled: undefined } });
                 });
                 toast.info("Đã đặt lại tất cả về mặc định");
               }} style={{ padding: '4px 12px', fontSize: '12px' }}>Đặt lại tất cả</button>
               <button className="btn btn-sm btn-secondary" onClick={() => {
                 tournament.categories.filter(c => c.type === 'kata').forEach(c => {
                   dispatch({ type: ACTIONS.UPDATE_CATEGORY, payload: { id: c.id, sigmaSplitEnabled: true } });
                 });
                 toast.success("Đã bật Sigma cho toàn bộ Kata");
               }} style={{ padding: '4px 12px', fontSize: '12px' }}>Bật toàn bộ Kata</button>
               <button className="btn btn-sm btn-secondary" onClick={() => {
                 tournament.categories.filter(c => c.type === 'kumite').forEach(c => {
                   dispatch({ type: ACTIONS.UPDATE_CATEGORY, payload: { id: c.id, sigmaSplitEnabled: true } });
                 });
                 toast.success("Đã bật Sigma cho toàn bộ Kumite");
               }} style={{ padding: '4px 12px', fontSize: '12px' }}>Bật toàn bộ Kumite</button>
            </div>

            <table className="table table-compact" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', background: '#f8fafc' }}>
                  <th style={{ padding: '8px' }}>Hạng mục</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>VĐV</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Trạng thái</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {tournament.categories.map(cat => {
                  const threshold = tournament.splitSettings?.threshold || 20;
                  const athleteCount = cat.athletes?.length || 0;
                  const isSplitting = cat.sigmaSplitEnabled === true || (cat.sigmaSplitEnabled !== false && tournament.splitSettings?.enabled && athleteCount > threshold);
                  
                  return (
                    <tr key={cat.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px' }}>
                        <div style={{ fontWeight: 600 }}>{cat.name}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {cat.type === 'kata' ? '🥋 Kata' : '⚔️ Kumite'} • {cat.gender === 'male' ? 'Nam' : 'Nữ'}
                        </div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{athleteCount}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {isSplitting ? (
                          <span style={{ color: '#059669', fontWeight: 600 }}>✅ Sẽ chia</span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Không chia</span>
                        )}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                         <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button 
                              onClick={() => dispatch({ type: ACTIONS.UPDATE_CATEGORY, payload: { id: cat.id, sigmaSplitEnabled: true } })}
                              title="Bắt buộc chia"
                              style={{ 
                                padding: '4px 8px', borderRadius: '4px', border: '1px solid #7c3aed', 
                                background: cat.sigmaSplitEnabled === true ? '#7c3aed' : '#fff',
                                color: cat.sigmaSplitEnabled === true ? '#fff' : '#7c3aed',
                                cursor: 'pointer', fontSize: '12px'
                              }}
                            >✂️</button>
                            <button 
                              onClick={() => dispatch({ type: ACTIONS.UPDATE_CATEGORY, payload: { id: cat.id, sigmaSplitEnabled: false } })}
                              title="Tắt chia"
                              style={{ 
                                padding: '4px 8px', borderRadius: '4px', border: '1px solid #94a3b8',
                                background: cat.sigmaSplitEnabled === false ? '#64748b' : '#fff',
                                color: cat.sigmaSplitEnabled === false ? '#fff' : '#64748b',
                                cursor: 'pointer', fontSize: '12px'
                              }}
                            >🚫</button>
                            <button 
                              onClick={() => dispatch({ type: ACTIONS.UPDATE_CATEGORY, payload: { id: cat.id, sigmaSplitEnabled: undefined } })}
                              title="Theo cài đặt chung"
                              style={{ 
                                padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0',
                                background: cat.sigmaSplitEnabled === undefined ? '#f1f5f9' : '#fff',
                                color: '#475569',
                                cursor: 'pointer', fontSize: '12px'
                              }}
                            >⚙️</button>
                         </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="modal-actions" style={{ marginTop: '20px' }}>
            <button className="btn btn-primary" onClick={() => setShowSplitModal(false)} style={{ width: '100%' }}>Đóng</button>
          </div>
        </Modal>

        {/* Modal xuất PDF chọn lọc - Giao diện nâng cấp đầy đủ */}
        <Modal
          isOpen={showExportPDFModal}
          onClose={() => setShowExportPDFModal(false)}
          title="Tùy chọn xuất PDF tất cả sơ đồ"
        >
          <div className="export-pdf-selection" style={{ padding: '4px' }}>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px', lineHeight: '1.5' }}>
              Hệ thống sẽ tổng hợp các sơ đồ đã chọn vào một file PDF vector chất lượng cao, giúp bạn in ấn hàng loạt nhanh chóng.
            </p>

            {/* Bộ lọc Dimension - Sửa lỗi tràn ngang bằng cách xếp chồng dọc */}
            <div style={{ 
              background: '#f8fafc', 
              padding: '16px 20px', 
              borderRadius: '16px', 
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              marginBottom: '20px'
            }}>
              {/* Thể thức */}
              <div className="filter-group">
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🥋 Thể thức
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: 'Tất cả', color: '#7c3aed' },
                    { id: 'kata', label: 'KATA', color: '#7c3aed' },
                    { id: 'kumite', label: 'KUMITE', color: '#7c3aed' }
                  ].map(t => (
                    <button 
                      key={t.id}
                      onClick={() => {
                        const nextFilter = { ...exportFilter, type: t.id };
                        setExportFilter(nextFilter);
                        applyBulkFilter(nextFilter);
                      }}
                      style={{ 
                        padding: '8px 16px', fontSize: '11px', borderRadius: '10px', cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: exportFilter.type === t.id ? `2px solid ${t.color}` : '2px solid #e2e8f0',
                        background: exportFilter.type === t.id ? t.color : '#fff',
                        color: exportFilter.type === t.id ? '#fff' : '#64748b',
                        fontWeight: 700,
                        minWidth: '80px'
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tính chất */}
              <div className="filter-group">
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  👥 Tính chất
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: 'Tất cả', color: '#2563eb' },
                    { id: 'individual', label: 'Cá nhân', color: '#2563eb' },
                    { id: 'team', label: 'Đồng đội', color: '#2563eb' }
                  ].map(f => (
                    <button 
                      key={f.id}
                      onClick={() => {
                        const nextFilter = { ...exportFilter, format: f.id };
                        setExportFilter(nextFilter);
                        applyBulkFilter(nextFilter);
                      }}
                      style={{ 
                        padding: '8px 16px', fontSize: '11px', borderRadius: '10px', cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: exportFilter.format === f.id ? `2px solid ${f.color}` : '2px solid #e2e8f0',
                        background: exportFilter.format === f.id ? f.color : '#fff',
                        color: exportFilter.format === f.id ? '#fff' : '#64748b',
                        fontWeight: 700,
                        minWidth: '80px'
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Giới tính */}
              <div className="filter-group">
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ⚤ Giới tính
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: 'Tất cả', color: '#059669' },
                      { id: 'male', label: '♂ NAM', color: '#3b82f6' },
                      { id: 'female', label: '♀ NỮ', color: '#ec4899' }
                    ].map(g => (
                      <button 
                        key={g.id}
                        onClick={() => {
                          const nextFilter = { ...exportFilter, gender: g.id };
                          setExportFilter(nextFilter);
                          applyBulkFilter(nextFilter);
                        }}
                        style={{ 
                          padding: '8px 16px', fontSize: '11px', borderRadius: '10px', cursor: 'pointer',
                          transition: 'all 0.2s',
                          border: exportFilter.gender === g.id ? `2px solid ${g.color}` : '2px solid #e2e8f0',
                          background: exportFilter.gender === g.id ? g.color : '#fff',
                          color: exportFilter.gender === g.id ? '#fff' : '#64748b',
                          fontWeight: 700,
                          minWidth: '80px'
                        }}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
              </div>
            </div>

            {/* Search & Actions */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input 
                    type="text" 
                    placeholder="Tìm tên nội dung..." 
                    value={searchQueryExport}
                    onChange={(e) => setSearchQueryExport(e.target.value)}
                    style={{ 
                      width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px', 
                      border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none' 
                    }}
                  />
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', grayscale: 1 }}>🔍</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                   <button 
                     className="btn btn-secondary btn-sm"
                     onClick={() => setExportSelectedIds(tournament.categories.filter(c => c.bracket).map(c => c.id))}
                     style={{ borderRadius: '10px', fontWeight: 600 }}
                   >Chọn hết</button>
                   <button 
                     className="btn btn-secondary btn-sm"
                     onClick={() => setExportSelectedIds([])}
                     style={{ borderRadius: '10px', fontWeight: 600, color: '#ef4444' }}
                   >Bỏ chọn</button>
                </div>
            </div>

            {/* Category List */}
            <div style={{ 
              maxHeight: '400px', 
              overflowY: 'auto', 
              border: '1px solid #e2e8f0', 
              borderRadius: '16px',
              background: '#fff'
            }}>
              {tournament.categories
                .filter(c => c.bracket)
                .filter(c => {
                   if (!searchQueryExport) return true;
                   return c.name.toLowerCase().includes(searchQueryExport.toLowerCase());
                })
                .map((cat, idx) => {
                 const isChecked = exportSelectedIds.includes(cat.id);
                 const isTeam = cat.isTeam || cat.name.toLowerCase().includes('đồng đội') || cat.name.toLowerCase().includes('hỗn hợp');
                 
                 return (
                   <label 
                     key={cat.id} 
                     style={{ 
                       display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', 
                       background: isChecked ? 'linear-gradient(to right, #f5f3ff, #ede9fe)' : (idx % 2 === 0 ? '#fff' : '#f8fafc'), 
                       borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                       transition: 'background 0.2s'
                     }}
                   >
                     <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                       <input 
                         type="checkbox" 
                         checked={isChecked} 
                         onChange={() => {
                           if (isChecked) {
                             setExportSelectedIds(prev => prev.filter(id => id !== cat.id));
                           } else {
                             setExportSelectedIds(prev => [...prev, cat.id]);
                           }
                         }}
                         style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#7c3aed' }}
                       />
                     </div>
                     <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontSize: '14px', 
                          fontWeight: 700, 
                          color: isChecked ? '#5b21b6' : '#1e293b',
                          marginBottom: '2px'
                        }}>
                          {cat.name}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span style={{ 
                            fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                            background: cat.type === 'kata' ? '#f5f3ff' : '#fff1f2',
                            color: cat.type === 'kata' ? '#7c3aed' : '#e11d48',
                            border: `1px solid ${cat.type === 'kata' ? '#ddd6fe' : '#fecdd3'}`
                          }}>
                            {cat.type.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {isTeam ? '👥 Nhóm' : '👤 Cá nhân'} • {cat.athletes?.length || 0} VĐV
                          </span>
                          {cat.gender === 'male' ? <span style={{color:'#3b82f6'}}>♂️</span> : <span style={{color:'#ec4899'}}>♀️</span>}
                        </div>
                     </div>
                     {isChecked && <span style={{ color: '#7c3aed', fontWeight: 900 }}>✓</span>}
                   </label>
                 );
              })}
            </div>
            
            <div style={{ marginTop: '12px', textAlign: 'right', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
               Đã chọn <span style={{ color: '#7c3aed', fontSize: '16px' }}>{exportSelectedIds.length}</span> sơ đồ
            </div>
          </div>
          
          <div className="modal-actions" style={{ marginTop: '12px', gap: '12px' }}>
             <button 
               className="btn btn-primary" 
               style={{ 
                 flex: 2, background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', 
                 padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
                 boxShadow: '0 4px 15px -1px rgba(124, 58, 237, 0.4)'
               }}
               onClick={handleExportSelectedPDF}
               disabled={exportSelectedIds.length === 0}
             >
               🚀 XUẤT FILE PDF TỔNG HỢP ({exportSelectedIds.length})
             </button>
             <button 
               className="btn btn-secondary" 
               onClick={() => setShowExportPDFModal(false)}
               style={{ flex: 1, padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 600 }}
             >
               HUỶ BỎ
             </button>
          </div>
        </Modal>
      </div>
    </div>
  );
}
