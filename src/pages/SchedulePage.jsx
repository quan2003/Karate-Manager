import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import {
  useTournament,
  useTournamentDispatch,
  ACTIONS,
} from "../context/TournamentContext";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { useToast } from "../components/common/Toast";
import {
  checkScheduleConflicts,
  generateDefaultMats,
  buildTimeline,
  sortScheduleByMatAndTime,
  findAthleteConflicts,
  generateTimeSlotsFromRange,
  smartAutoAssign,
  estimateTotalScheduleTime,
  estimateRequiredDays,
  DEFAULT_MATCH_DURATIONS,
  detectScheduleConflicts,
  addMinutesToTime,
  estimateCategoryDuration,
} from "../services/scheduleService";
import {
  exportScheduleToPDF,
  exportScheduleToExcel,
} from "../services/scheduleExportService";
import { useOnboarding } from "../context/OnboardingContext";
import appIcon from "../assets/icon.png";
import "./SchedulePage.css";

// All possible time options for dropdowns (05:00 - 21:00)
const ALL_TIME_OPTIONS = generateTimeSlotsFromRange("05:00", "21:00", 5);

// Event presets for quick add
const EVENT_PRESETS = [
  { name: "Khai mạc", icon: "🎉" },
  { name: "Bế mạc", icon: "🎊" },
  { name: "Trao thưởng", icon: "🏆" },
  { name: "Nghỉ giải lao", icon: "☕" },
  { name: "Nghỉ trưa", icon: "🍜" },
];

export default function SchedulePage() {
  const { id } = useParams();
  const { tournaments, currentTournament } = useTournament();
  const dispatch = useTournamentDispatch();
  const toast = useToast();
  const navigate = useNavigate();

  const [matCount, setMatCount] = useState(4);
  const [schedule, setSchedule] = useState({});
  const [sessionConfig, setSessionConfig] = useState({
    morningStart: "07:00",
    morningEnd: "11:30",
    afternoonStart: "13:00",
    afternoonEnd: "17:30",
  });
  const [matchDurations, setMatchDurations] = useState(DEFAULT_MATCH_DURATIONS);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [assignForm, setAssignForm] = useState({ mat: 1, time: "08:00", order: 1 });
  const [warnings, setWarnings] = useState([]);
  const [viewMode, setViewMode] = useState("timeline"); // "timeline" | "table"
  const [showConflictDetails, setShowConflictDetails] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: "", onConfirm: null });
  const [dragCategoryId, setDragCategoryId] = useState(null); // Drag & Drop state
  const [unassignedFilter, setUnassignedFilter] = useState(""); // Filter state for unassigned items

  // Multi-day & custom events state
  const [selectedDate, setSelectedDate] = useState(null);
  const [customEvents, setCustomEvents] = useState([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({ name: "", time: "07:00", mat: 0, icon: "🎉", date: "" });
  // Schedule Setup
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showConflictInfo, setShowConflictInfo] = useState(false);
  const [activeConflicts, setActiveConflicts] = useState([]);
  const [setupForm, setSetupForm] = useState({
    matCount: 4,
    competitionDays: 2,
    startDate: "",
    morningStart: "07:00",
    morningEnd: "11:30",
    afternoonStart: "13:00",
    afternoonEnd: "17:30",
    durations: DEFAULT_MATCH_DURATIONS,
  });

  useEffect(() => {
    dispatch({ type: ACTIONS.SET_CURRENT_TOURNAMENT, payload: id });
  }, [id, dispatch]);

  const tournament = currentTournament || tournaments.find((t) => t.id === id);
  const { activeHint, clearHint } = useOnboarding();

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

  // Load saved schedule & config
  useEffect(() => {
    if (tournament?.schedule) {
      setSchedule(tournament.schedule);
    }
    if (tournament?.customEvents) {
      setCustomEvents(tournament.customEvents);
    }
    if (tournament?.scheduleConfig) {
      const cfg = tournament.scheduleConfig;
      setMatCount(cfg.matCount || 4);
      setSessionConfig({
        morningStart: cfg.morningStart || "07:00",
        morningEnd: cfg.morningEnd || "11:30",
        afternoonStart: cfg.afternoonStart || "13:00",
        afternoonEnd: cfg.afternoonEnd || "17:30",
      });
      if (cfg.durations) {
        setMatchDurations(cfg.durations);
      }
    }
  }, [tournament?.id]);

  const mats = useMemo(() => generateDefaultMats(matCount), [matCount]);

  const categories = tournament?.categories || [];

  const setupEstimations = useMemo(() => {
    if (!showSetupModal || !categories) return null;
    const morningSlots = generateTimeSlotsFromRange(setupForm.morningStart, setupForm.morningEnd, 5);
    const afternoonSlots = generateTimeSlotsFromRange(setupForm.afternoonStart, setupForm.afternoonEnd, 5);
    
    const getMins = (t) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
    const minsPerDay = (getMins(setupForm.morningEnd) - getMins(setupForm.morningStart)) + 
                       (getMins(setupForm.afternoonEnd) - getMins(setupForm.afternoonStart)); 
    
    const requiredDays = estimateRequiredDays(categories, setupForm.matCount, minsPerDay, setupForm.durations || DEFAULT_MATCH_DURATIONS);
    const { totalMinutes, estimatedHours } = estimateTotalScheduleTime(categories, setupForm.matCount, setupForm.durations || DEFAULT_MATCH_DURATIONS);

    return {
      requiredDays,
      totalMinutes,
      estimatedHours
    };
  }, [showSetupModal, setupForm, categories]);

  // Generate tournament days from saved config
  const tournamentDays = useMemo(() => {
    if (!tournament) return [];
    const cfg = tournament.scheduleConfig;
    if (cfg?.dates && cfg.dates.length > 0) {
      return cfg.dates;
    }
    // Fallback: single day from tournament date
    const start = tournament.startDate || tournament.date;
    if (!start) return [];
    return [new Date(start).toISOString().split('T')[0]];
  }, [tournament]);

  // Set default selected date
  useEffect(() => {
    if (tournamentDays.length > 0 && !selectedDate) {
      setSelectedDate(tournamentDays[0]);
    }
  }, [tournamentDays]);

  // Generate dynamic time slots from session config
  const timeSlots = useMemo(() => {
    const morning = generateTimeSlotsFromRange(sessionConfig.morningStart, sessionConfig.morningEnd);
    const afternoon = generateTimeSlotsFromRange(sessionConfig.afternoonStart, sessionConfig.afternoonEnd);
    return [...morning, ...afternoon];
  }, [sessionConfig]);

  // All athlete conflicts across categories (dùng cho cảnh báo "thi nhiều nội dung")
  const globalConflicts = useMemo(() => {
    const conflicts = [];
    
    const getSession = (timeStr) => {
      if (!timeStr) return 'morning';
      const [h, m] = timeStr.split(':').map(Number);
      const mins = h * 60 + m;
      // Dựa vào sessionConfig.morningEnd để xác định (mặc định < 12:00 là sáng)
      let morningEndMins = 720;
      if (sessionConfig && sessionConfig.morningEnd) {
        const [mh, mm] = sessionConfig.morningEnd.split(':').map(Number);
        morningEndMins = mh * 60 + mm;
      }
      return mins <= morningEndMins ? 'morning' : 'afternoon';
    };

    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        const cat1 = categories[i];
        const cat2 = categories[j];
        const found = findAthleteConflicts(cat1, cat2);
        
        if (found.length > 0) {
          const s1 = schedule[cat1.id];
          const s2 = schedule[cat2.id];

          if (s1 && s2) {
            // Khác ngày -> không sao
            if (s1.date !== s2.date) continue;
            // Cùng thảm -> không sao
            if (s1.mat === s2.mat) continue;
            // Khác buổi -> không sao
            if (getSession(s1.time) !== getSession(s2.time)) continue;
          }

          conflicts.push({
            cat1: cat1,
            cat2: cat2,
            athletes: found,
          });
        }
      }
    }
    return conflicts;
  }, [categories, schedule, sessionConfig]);

  // Xung đột thực sự trong lịch: VĐV bị xếp CÙNG GIỜ ở 2 thảm khác nhau
  const scheduleConflicts = useMemo(() => {
    return detectScheduleConflicts(schedule, categories);
  }, [schedule, categories]);

  // Unassigned categories (not assigned on ANY day)
  const unassignedCategories = categories.filter(c => !schedule[c.id]);
  // Assigned on current day
  const assignedOnDay = categories.filter(c => schedule[c.id]?.date === selectedDate);
  const assignedCategories = categories.filter(c => schedule[c.id]);

  // Timeline view
  const timeline = useMemo(() => buildTimeline(schedule, categories), [schedule, categories]);

  const isStepActive = activeHint === "setup_schedule";
  const scheduleStepNum = useMemo(() => {
    if (!isStepActive) return 0;
    if (!tournament?.scheduleConfig) return 1;
    if (unassignedCategories.length > 0) return 2;
    if (customEvents.length === 0) return 3;
    // Step 4 is usually Save Config, but if already saved, we go to Step 5
    return 4;
  }, [isStepActive, tournament?.scheduleConfig, unassignedCategories, customEvents]);

  // Save schedule
  const saveSchedule = (newSchedule) => {
    setSchedule(newSchedule);
    if (tournament) {
      dispatch({
        type: ACTIONS.UPDATE_SCHEDULE,
        payload: {
          tournamentId: tournament.id,
          schedule: newSchedule,
        },
      });
    }
  };

  // Open assign modal
  const handleOpenAssign = (category) => {
    setSelectedCategory(category);
    const existing = schedule[category.id];
    if (existing) {
      setAssignForm({ mat: existing.mat, time: existing.time, order: existing.order || 1, date: existing.date || selectedDate });
    } else {
      const mat1Items = Object.values(schedule).filter(s => s.mat === 1 && s.date === selectedDate);
      setAssignForm({ mat: 1, time: "08:00", order: mat1Items.length + 1, date: selectedDate });
    }
    setWarnings([]);
    setShowAssignModal(true);
  };

  // Check warnings when form changes
  useEffect(() => {
    if (!showAssignModal || !selectedCategory) return;
    const w = checkScheduleConflicts(
      schedule, categories, selectedCategory.id, assignForm.mat, assignForm.time, assignForm.date || selectedDate
    );
    setWarnings(w);
  }, [assignForm, showAssignModal, selectedCategory]);

  // Assign category to mat/time
  const handleAssign = () => {
    if (warnings.length > 0) {
      toast.warning("Hệ thống ghi nhận có cảnh báo xếp lịch, nhưng vẫn cho phép cập nhật!");
    }
    
    const newSchedule = {
      ...schedule,
      [selectedCategory.id]: {
        mat: assignForm.mat,
        time: assignForm.time,
        order: assignForm.order,
        date: assignForm.date || selectedDate,
      },
    };
    saveSchedule(newSchedule);
    setShowAssignModal(false);
    toast.success(`Đã xếp "${selectedCategory.name}" vào Thảm ${assignForm.mat} lúc ${assignForm.time}`);
  };

  // View conflict details
  const handleViewConflicts = (conflicts) => {
    setActiveConflicts(conflicts);
    setShowConflictInfo(true);
  };

  // Remove assignment
  const handleRemoveAssignment = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId);
    setConfirmDialog({
      open: true,
      message: `Xóa lịch thi đấu cho "${cat?.name}"?`,
      onConfirm: () => {
        const newSchedule = { ...schedule };
        delete newSchedule[categoryId];
        saveSchedule(newSchedule);
        setConfirmDialog({ open: false, message: "", onConfirm: null });
        toast.success("Đã xóa lịch thi đấu");
      },
    });
  };

  // Quick assign all unassigned
  const handleAutoAssign = () => {
    if (unassignedCategories.length === 0) {
      toast.info("Tất cả nội dung đã được xếp lịch");
      return;
    }

    const morningSlots = generateTimeSlotsFromRange(sessionConfig.morningStart, sessionConfig.morningEnd);
    const afternoonSlots = generateTimeSlotsFromRange(sessionConfig.afternoonStart, sessionConfig.afternoonEnd);
    
    // Total slots per mat = morning + afternoon
    const slotsPerMat = [...morningSlots, ...afternoonSlots];
    if (slotsPerMat.length === 0) {
      toast.error("Vui lòng cấu hình thời gian buổi sáng/chiều trước!");
      return;
    }

    const newSchedule = { ...schedule };
    
    // Track slot index per mat (how many items already on this mat ON THIS DAY)
    const slotIndexPerMat = {};
    for (let m = 1; m <= matCount; m++) {
      slotIndexPerMat[m] = Object.values(schedule).filter(s => s.mat === m && s.date === selectedDate).length;
    }

    // Round-robin across mats, assign time slots sequentially per mat
    let matCursor = 0;
    unassignedCategories.forEach((cat) => {
      const mat = (matCursor % matCount) + 1;
      const slotIdx = slotIndexPerMat[mat] || 0;
      const time = slotsPerMat[Math.min(slotIdx, slotsPerMat.length - 1)];
      
      newSchedule[cat.id] = {
        mat: mat,
        time: time,
        order: slotIdx + 1,
        date: selectedDate,
      };
      slotIndexPerMat[mat] = slotIdx + 1;
      matCursor++;
    });

    saveSchedule(newSchedule);
    toast.success(`Đã tự động xếp lịch cho ${unassignedCategories.length} nội dung`);
  };

  // Auto-assign ALL categories across ALL days
  const handleAutoAssignAll = () => {
    const allUnassigned = categories.filter(c => !schedule[c.id]);
    if (allUnassigned.length === 0) {
      toast.info("Tất cả nội dung đã được xếp lịch");
      return;
    }
    if (tournamentDays.length === 0) {
      toast.error("Vui lòng setup lịch thi đấu trước!");
      return;
    }

    const morningSlots = generateTimeSlotsFromRange(sessionConfig.morningStart, sessionConfig.morningEnd, 5);
    const afternoonSlots = generateTimeSlotsFromRange(sessionConfig.afternoonStart, sessionConfig.afternoonEnd, 5);
    const slotsPerMat = [...morningSlots, ...afternoonSlots];
    if (slotsPerMat.length === 0) {
      toast.error("Vui lòng cấu hình thời gian buổi sáng/chiều!");
      return;
    }

    const newSchedule = smartAutoAssign(
      categories,
      tournamentDays,
      matCount,
      sessionConfig,
      matchDurations,
      schedule
    );

    saveSchedule(newSchedule);
    toast.success(`Đã tự động phân bổ thông minh cho ${allUnassigned.length} nội dung.`);
  };

  // Save schedule config
  const handleSaveConfig = () => {
    if (!tournament) return;
    const config = {
      ...sessionConfig,
      matCount,
      competitionDays: tournamentDays.length,
      dates: tournamentDays,
      startDate: tournamentDays[0] || tournament.startDate || tournament.date,
      durations: matchDurations,
    };
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: {
        id: tournament.id,
        scheduleConfig: config,
      },
    });
    toast.success("Đã lưu cấu hình lịch thi đấu!");
  };

  // Open setup modal
  const handleOpenSetup = () => {
    const cfg = tournament?.scheduleConfig || {};
    setSetupForm({
      competitionDays: cfg.competitionDays || 2,
      startDate: cfg.startDate || tournament?.startDate || tournament?.date || "",
      morningStart: cfg.morningStart || sessionConfig.morningStart,
      morningEnd: cfg.morningEnd || sessionConfig.morningEnd,
      afternoonStart: cfg.afternoonStart || sessionConfig.afternoonStart,
      afternoonEnd: cfg.afternoonEnd || sessionConfig.afternoonEnd,
      matCount: cfg.matCount || matCount,
      durations: cfg.durations || matchDurations || DEFAULT_MATCH_DURATIONS,
    });
    setShowSetupModal(true);
  };

  // Apply setup
  const handleApplySetup = () => {
    const startD = new Date(setupForm.startDate);
    if (isNaN(startD.getTime())) {
      toast.error("Vui lòng chọn ngày bắt đầu hợp lệ!");
      return;
    }
    const dates = [];
    for (let i = 0; i < setupForm.competitionDays; i++) {
      const d = new Date(startD);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    const config = {
      competitionDays: setupForm.competitionDays,
      startDate: setupForm.startDate,
      dates,
      morningStart: setupForm.morningStart,
      morningEnd: setupForm.morningEnd,
      afternoonStart: setupForm.afternoonStart,
      afternoonEnd: setupForm.afternoonEnd,
      matCount: setupForm.matCount,
      durations: setupForm.durations,
    };
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: {
        id: tournament.id,
        scheduleConfig: config,
        startDate: setupForm.startDate,
        endDate: dates[dates.length - 1],
      },
    });
    setMatCount(setupForm.matCount);
    setSessionConfig({
      morningStart: setupForm.morningStart,
      morningEnd: setupForm.morningEnd,
      afternoonStart: setupForm.afternoonStart,
      afternoonEnd: setupForm.afternoonEnd,
    });
    setMatchDurations(setupForm.durations || DEFAULT_MATCH_DURATIONS);
    setSelectedDate(dates[0]);
    setShowSetupModal(false);
    toast.success(`Đã cấu hình ${setupForm.competitionDays} ngày thi đấu!`);
  };

  // Clear all
  const handleClearAll = () => {
    setConfirmDialog({
      open: true,
      message: "Xóa toàn bộ lịch thi đấu?",
      onConfirm: () => {
        saveSchedule({});
        setConfirmDialog({ open: false, message: "", onConfirm: null });
        toast.success("Đã xóa toàn bộ lịch thi đấu");
      },
    });
  };

  // === Custom Events ===
  const saveCustomEvents = (events) => {
    setCustomEvents(events);
    if (tournament) {
      dispatch({
        type: ACTIONS.UPDATE_CUSTOM_EVENTS,
        payload: { tournamentId: tournament.id, customEvents: events },
      });
    }
  };

  const handleOpenEventModal = (event = null) => {
    if (event) {
      setEditingEvent(event);
      setEventForm({ name: event.name, time: event.time, mat: event.mat, icon: event.icon, date: event.date || selectedDate });
    } else {
      setEditingEvent(null);
      setEventForm({ name: "", time: "07:00", mat: 0, icon: "🎉", date: selectedDate });
    }
    setShowEventModal(true);
  };

  const handleSaveEvent = () => {
    if (!eventForm.name.trim()) {
      toast.error("Vui lòng nhập tên sự kiện");
      return;
    }
    if (editingEvent) {
      const updated = customEvents.map(e => e.id === editingEvent.id ? { ...e, ...eventForm } : e);
      saveCustomEvents(updated);
      toast.success(`Đã cập nhật sự kiện "${eventForm.name}"`);
    } else {
      const newEvent = { id: uuidv4(), ...eventForm };
      saveCustomEvents([...customEvents, newEvent]);
      toast.success(`Đã thêm sự kiện "${eventForm.name}"`);
    }
    setShowEventModal(false);
  };

  const handleRemoveEvent = (eventId) => {
    const evt = customEvents.find(e => e.id === eventId);
    setConfirmDialog({
      open: true,
      message: `Xóa sự kiện "${evt?.name}"?`,
      onConfirm: () => {
        saveCustomEvents(customEvents.filter(e => e.id !== eventId));
        setConfirmDialog({ open: false, message: "", onConfirm: null });
        toast.success("Đã xóa sự kiện");
      },
    });
  };

  if (!tournament) {
    return (
      <div className="page">
        <div className="container">
          <div className="not-found">
            <h2>Không tìm thấy giải đấu</h2>
            <Link to="/admin" className="btn btn-primary">Về quản lý giải đấu</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page schedule-page">
      <div className="container">
        <nav className="breadcrumb">
          <Link to={`/tournament/${tournament.id}`} className="back-link">← Quay lại</Link>
          <span className="breadcrumb-separator">|</span>
          <Link to="/admin">Quản lý giải đấu</Link>
          <span>/</span>
          <Link to={`/tournament/${tournament.id}`}>{tournament.name}</Link>
          <span>/</span>
          <span>Lịch thi đấu</span>
        </nav>

        <header className="page-header">
          <div>
            <h1 className="page-title">
              <img src={appIcon} alt="" className="page-title-logo" />
              Lịch thi đấu & Chia thảm
            </h1>
            <div className="tournament-meta">
              <span>🏆 {tournament.name}</span>
              <span>📅 {new Date(tournament.date).toLocaleDateString("vi-VN")}</span>
              {tournament.scheduleConfig && (
                <span style={{background:'#dcfce7',color:'#16a34a',padding:'2px 8px',borderRadius:'4px',fontSize:'12px',fontWeight:600}}>
                  ✅ {tournament.scheduleConfig.competitionDays} ngày thi đấu
                </span>
              )}
            </div>
          </div>
          <button 
            className={`btn btn-primary ${isStepActive ? "hint-pulse" : ""}`} 
            onClick={() => { handleOpenSetup(); clearHint(); }} 
            style={{background:'#7c3aed'}}
            data-hint="BƯỚC 1: SETUP LỊCH"
          >
            ⚙️ Setup lịch thi đấu
          </button>
        </header>

        {/* Day Tabs */}
        <div className="day-tabs">
          {tournamentDays.length > 0 ? tournamentDays.map((day, idx) => (
            <button
              key={day}
              className={`day-tab ${selectedDate === day ? 'active' : ''}`}
              onClick={() => setSelectedDate(day)}
            >
              <span className="day-tab-label">Ngày {idx + 1}</span>
              <span className="day-tab-date">{new Date(day).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            </button>
          )) : (
            <button className="day-tab" onClick={handleOpenSetup} style={{borderStyle:'dashed',color:'#6366f1'}}>
              ⚙️ Chưa setup — Click để cấu hình ngày thi đấu
            </button>
          )}
        </div>

        {/* Config Bar */}
        <div className="schedule-config">
          <div className="config-item">
            <label>Số thảm:</label>
            <div className="mat-counter">
              <button className="btn btn-sm" onClick={() => setMatCount(Math.max(1, matCount - 1))}>−</button>
              <span className="mat-count-value">{matCount}</span>
              <button className="btn btn-sm" onClick={() => setMatCount(Math.min(10, matCount + 1))}>+</button>
            </div>
          </div>

          <div className="session-config-group">
            <div className="session-row">
              <span className="session-label">☀️ Sáng:</span>
              <select className="input time-select" value={sessionConfig.morningStart}
                onChange={(e) => setSessionConfig(prev => ({...prev, morningStart: e.target.value}))}>
                {ALL_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="session-separator">→</span>
              <select className="input time-select" value={sessionConfig.morningEnd}
                onChange={(e) => setSessionConfig(prev => ({...prev, morningEnd: e.target.value}))}>
                {ALL_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="session-row">
              <span className="session-label">🌅 Chiều:</span>
              <select className="input time-select" value={sessionConfig.afternoonStart}
                onChange={(e) => setSessionConfig(prev => ({...prev, afternoonStart: e.target.value}))}>
                {ALL_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="session-separator">→</span>
              <select className="input time-select" value={sessionConfig.afternoonEnd}
                onChange={(e) => setSessionConfig(prev => ({...prev, afternoonEnd: e.target.value}))}>
                {ALL_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="config-actions">
            <button 
              className={`btn btn-primary btn-sm ${isStepActive ? "hint-pulse" : ""}`} 
              onClick={() => { handleAutoAssign(); clearHint(); }}
              data-hint="BƯỚC 2: TỰ ĐỘNG XẾP"
            >
              🪄 Tự động xếp (ngày này)
            </button>
            {tournamentDays.length > 1 && (
              <button 
                className={`btn btn-sm ${isStepActive ? "hint-pulse" : ""}`} 
                style={{background:'#eef2ff',color:'#4f46e5',border:'1px solid #c7d2fe'}} 
                onClick={() => { handleAutoAssignAll(); clearHint(); }}
                data-hint="BƯỚC 2: XẾP TẤT CẢ"
              >
                📅 Tự động xếp TẤT CẢ
              </button>
            )}
            <button 
              className={`btn btn-sm ${isStepActive ? "hint-pulse" : ""}`} 
              style={{background:'#f0fdf4',color:'#16a34a',border:'1px solid #bbf7d0'}} 
              onClick={() => { handleOpenEventModal(); clearHint(); }}
              data-hint="BƯỚC 3: THÊM SỰ KIỆN"
            >
              ➕ Thêm sự kiện
            </button>
            <button 
              className={`btn btn-sm ${isStepActive ? "hint-pulse" : ""}`} 
              style={{background:'#eff6ff',color:'#2563eb',border:'1px solid #bfdbfe'}} 
              onClick={() => { handleSaveConfig(); clearHint(); }}
              data-hint="BƯỚC 4: LƯU CẤU HÌNH"
            >
              💾 Lưu cấu hình
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleClearAll}>
              🗑️ Xóa hết
            </button>
          </div>
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
            >
              📊 Timeline
            </button>
            <button
              className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              📋 Bảng
            </button>
          </div>
          <div className="export-actions" style={{display:'flex', gap:'8px'}}>
            <div className="dropdown-container" style={{position:'relative', display:'inline-block'}}>
              <button 
                className={`btn btn-sm ${isStepActive ? "hint-pulse" : ""}`} 
                style={{background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca'}}
                onClick={() => {
                  exportScheduleToPDF(schedule, categories, customEvents, matCount, tournament, selectedDate, tournamentDays, viewMode);
                  toast.success(`Đang xuất PDF ngày hiện tại (${viewMode === 'table' ? 'Dạng bảng' : 'Timeline'})...`);
                  clearHint();
                }}
                data-hint="BƯỚC 5: XUẤT PDF"
              >
                📄 PDF Ngày này
              </button>
              {tournamentDays.length > 1 && (
                <button 
                  className="btn btn-sm" 
                  style={{background:'#fee2e2',color:'#b91c1c',border:'1px solid #fca5a5', marginLeft:'4px'}}
                  onClick={() => {
                    exportScheduleToPDF(schedule, categories, customEvents, matCount, tournament, 'all', tournamentDays, viewMode);
                    toast.success(`Đang xuất PDF tất cả các ngày (${viewMode === 'table' ? 'Dạng bảng' : 'Timeline'})...`);
                  }}
                >
                  📄 PDF Tất cả
                </button>
              )}
            </div>
            
            <div className="dropdown-container" style={{position:'relative', display:'inline-block'}}>
              <button className="btn btn-sm" style={{background:'#f0fdf4',color:'#16a34a',border:'1px solid #bbf7d0'}} onClick={() => {
                exportScheduleToExcel(schedule, categories, customEvents, matCount, tournament, selectedDate, tournamentDays);
                toast.success('Đang xuất Excel ngày hiện tại...');
              }}>
                📊 Excel Ngày này
              </button>
              {tournamentDays.length > 1 && (
                <button className="btn btn-sm" style={{background:'#dcfce7',color:'#15803d',border:'1px solid #86efac', marginLeft:'4px'}} onClick={() => {
                  exportScheduleToExcel(schedule, categories, customEvents, matCount, tournament, 'all', tournamentDays);
                  toast.success('Đang xuất Excel tất cả các ngày...');
                }}>
                  📊 Excel Tất cả
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Global Conflicts Warning - VĐV thi nhiều nội dung (chỉ thông tin) */}
        {globalConflicts.length > 0 && (
          <div className="global-conflicts-banner">
            <div className="conflict-banner-header">
              <span className="conflict-icon">ℹ️</span>
              <span className="conflict-title" style={{color:'#d97706'}}>
                {globalConflicts.reduce((sum, c) => sum + c.athletes.length, 0)} VĐV thi đấu nhiều nội dung
                <span style={{fontSize:'11px',fontWeight:400,marginLeft:8,color:'#92400e'}}>— Hệ thống sẽ cố tránh xếp cùng giờ</span>
              </span>
            </div>
            <div className="conflict-list">
              {globalConflicts.map((c, idx) => (
                <div key={idx} className="conflict-item" onClick={() => setShowConflictDetails(c)}>
                  <span className="conflict-badge" style={{background:'#d97706'}}>{c.athletes.length} VĐV</span>
                  <span className="conflict-cats">{c.cat1.name} ↔ {c.cat2.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Schedule Conflicts - VĐV bị TRÙNG GIỜ thực sự (lỗi nghiêm trọng) */}
        {scheduleConflicts.length > 0 && (
          <div className="schedule-conflict-banner">
            <div className="conflict-banner-header">
              <span className="conflict-icon">🚨</span>
              <span className="conflict-title" style={{color:'#dc2626'}}>
                CẢNH BÁO: {scheduleConflicts.length} cặp nội dung bị TRÙNG GIỜ VĐV!
                <span style={{fontSize:'11px',fontWeight:400,marginLeft:8,color:'#991b1b'}}>— Vui lòng điều chỉnh thủ công hoặc xóa và xếp lại lịch</span>
              </span>
            </div>
            <div className="conflict-list">
              {scheduleConflicts.map((c, idx) => (
                <div key={idx} className="conflict-item conflict-item--error">
                  <span className="conflict-badge" style={{background:'#dc2626'}}>🕐 {c.time}</span>
                  <span className="conflict-cats">
                    Thảm {c.matA}: {c.catA.name} &amp; Thảm {c.matB}: {c.catB.name}
                    <span style={{color:'#ef4444',fontWeight:700,marginLeft:6}}>({c.athletes.length} VĐV trùng)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="schedule-stats">
          <div className="sstat-item assigned">
            <span className="sstat-value">{assignedOnDay.length}</span>
            <span className="sstat-label">Đã xếp (ngày này)</span>
          </div>
          <div className="sstat-item unassigned">
            <span className="sstat-value">{unassignedCategories.length}</span>
            <span className="sstat-label">Chưa xếp</span>
          </div>
          <div className="sstat-item total-mats">
            <span className="sstat-value">{matCount}</span>
            <span className="sstat-label">Thảm</span>
          </div>
        </div>

        <div className="schedule-main">
          {/* Unassigned Categories */}
          <div className="unassigned-panel">
            <h3 className="panel-title">
              <span>📦 Chưa xếp lịch</span>
              <span className="panel-count">{unassignedCategories.length}</span>
            </h3>
            <div style={{padding: '0 12px 10px'}}>
              <input
                type="text"
                placeholder="🔍 Lọc nội dung..."
                value={unassignedFilter}
                onChange={(e) => setUnassignedFilter(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '6px',
                  border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none'
                }}
              />
            </div>
            <div className="unassigned-list">
              {unassignedCategories.length === 0 ? (
                <div className="empty-unassigned">
                  <span>✅</span>
                  <p>Tất cả đã xếp lịch!</p>
                </div>
              ) : (
                unassignedCategories
                  .filter(cat => cat.name.toLowerCase().includes(unassignedFilter.toLowerCase()))
                  .map(cat => (
                  <div 
                    key={cat.id} 
                    className={`unassigned-card ${dragCategoryId === cat.id ? 'dragging' : ''}`} 
                    draggable
                    onDragStart={(e) => {
                      setDragCategoryId(cat.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDragCategoryId(null)}
                    onClick={() => handleOpenAssign(cat)}
                  >
                    <div className="ucard-header">
                      <span className={`cat-type-badge ${cat.type}`}>
                        {cat.type === 'kumite' ? '⚔️' : '🥋'}
                      </span>
                      <span className="ucard-name">{cat.name}</span>
                    </div>
                    <div className="ucard-info">
                      <span className="ucard-athletes">{cat.athletes?.length || 0} VĐV</span>

                      {cat.bracket && <span className="ucard-drawn">✓ Đã bốc thăm</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Timeline / Table View */}
          <div className="schedule-content">
            {viewMode === 'timeline' ? (
              <div className="timeline-view">
                {mats.map(mat => {
                  const matItems = Object.entries(schedule)
                    .filter(([, s]) => s.mat === mat.id && s.date === selectedDate)
                    .map(([catId, s]) => ({
                      categoryId: catId,
                      category: categories.find(c => c.id === catId),
                      ...s,
                      itemType: 'category',
                    }))
                    .filter(e => e.category);

                  // Add custom events for this mat and date
                  const matEvents = customEvents
                    .filter(evt => (evt.mat === 0 || evt.mat === mat.id) && (evt.date === selectedDate || !evt.date))
                    .map(evt => ({
                      ...evt,
                      itemType: 'event',
                    }));

                  const allItems = [...matItems, ...matEvents]
                    .sort((a, b) => (a.time || '').localeCompare(b.time || '') || (a.order || 0) - (b.order || 0));

                  return (
                    <div key={mat.id} className="mat-column"
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drop-target'); }}
                      onDragLeave={(e) => e.currentTarget.classList.remove('drop-target')}
                      onDrop={(e) => {
                        e.currentTarget.classList.remove('drop-target');
                        if (!dragCategoryId) return;
                        const cat = categories.find(c => c.id === dragCategoryId);
                        if (!cat) return;
                        setSelectedCategory(cat);
                        const existing = schedule[dragCategoryId];
                        setAssignForm({
                          mat: mat.id,
                          time: existing?.time || '08:00',
                          order: matItems.length + 1,
                          date: existing?.date || selectedDate,
                        });
                        setWarnings([]);
                        setDragCategoryId(null);
                        setShowAssignModal(true);
                      }}
                    >
                      <div className="mat-header" style={{ borderColor: mat.color, background: `${mat.color}15` }}>
                        <div className="mat-header-dot" style={{ background: mat.color }}></div>
                        <span className="mat-header-name">{mat.name}</span>
                        <span className="mat-header-count">{matItems.length} nội dung</span>
                      </div>
                      <div className="mat-items">
                        {allItems.length === 0 ? (
                          <div className="mat-empty">
                            <p>Chưa có nội dung</p>
                          </div>
                        ) : (
                          allItems.map((item) => {
                            if (item.itemType === 'event') {
                              return (
                                <div key={`evt-${item.id}`} className="schedule-card event-card" style={{ borderLeftColor: '#f59e0b' }}>
                                  <div className="scard-time">
                                    <span className="scard-clock">🕐</span>
                                    <span>{item.time}</span>
                                  </div>
                                  <div className="scard-body">
                                    <div className="scard-name">
                                      <span className="event-icon">{item.icon}</span>
                                      {item.name}
                                    </div>
                                    <div className="scard-meta">
                                      <span className="event-type-label">Sự kiện</span>
                                    </div>
                                  </div>
                                  <div className="scard-actions">
                                    <button className="scard-edit" onClick={() => handleOpenEventModal(item)} title="Sửa">✏️</button>
                                    <button className="scard-remove" onClick={() => handleRemoveEvent(item.id)} title="Xóa">✕</button>
                                  </div>
                                </div>
                              );
                            }

                            // Category item (existing code)
                            const itemConflicts = globalConflicts.filter(c =>
                              c.cat1.id === item.categoryId || c.cat2.id === item.categoryId
                            );
                            const hasConflictOnSameMat = itemConflicts.some(c => {
                              const otherCatId = c.cat1.id === item.categoryId ? c.cat2.id : c.cat1.id;
                              const otherSchedule = schedule[otherCatId];
                              return otherSchedule && otherSchedule.mat === item.mat;
                            });
                            
                            return (
                              <div 
                                key={item.categoryId} 
                                className={`schedule-card ${hasConflictOnSameMat ? 'has-conflict' : ''} ${dragCategoryId === item.categoryId ? 'dragging' : ''}`}
                                style={{ borderLeftColor: mat.color }}
                                draggable
                                onDragStart={(e) => {
                                  setDragCategoryId(item.categoryId);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragEnd={() => setDragCategoryId(null)}
                              >
                                <div className="scard-drag-handle" title="Kéo thả để chuyển thảm">⠇</div>
                                <div className="scard-time">
                                  <span className="scard-clock">🕐</span>
                                  <span>
                                    {item.time || '--:--'}
                                    {item.category && item.time && (
                                      <span className="scard-time-end"> 
                                        - {addMinutesToTime(item.time, estimateCategoryDuration(item.category, currentTournament.setup?.durations))}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="scard-body">
                                  <div className="scard-name">
                                    <span className={`cat-type-dot ${item.category.type}`}></span>
                                    {item.category.name}
                                  </div>
                                  <div className="scard-meta">
                                    <span>{item.category.athletes?.length || 0} VĐV</span>
                                    {itemConflicts.length > 0 && (
                                      <span 
                                        className="scard-conflict-badge clickable" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleViewConflicts(itemConflicts.map(c => ({
                                            type: 'warning',
                                            message: `Trùng VĐV với "${c.cat1.id === item.categoryId ? c.cat2.name : c.cat1.name}"`,
                                            details: c.athletes.map(a => `${a.name} (${a.club})`)
                                          })));
                                        }}
                                        title="Click để xem chi tiết VĐV trùng"
                                      >
                                        ⚠️ {itemConflicts.reduce((s, c) => s + c.athletes.length, 0)} VĐV trùng
                                      </span>
                                    )}
                                  </div>
                                  {hasConflictOnSameMat && (
                                    <div 
                                      className="scard-conflict-warn clickable"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const sameMatConflicts = itemConflicts.filter(c => {
                                          const otherCatId = c.cat1.id === item.categoryId ? c.cat2.id : c.cat1.id;
                                          const otherSchedule = schedule[otherCatId];
                                          // Chỉ lấy các nội dung trên CÙNG THẢM mà có trùng VĐV
                                          return otherSchedule && otherSchedule.mat === item.mat;
                                        });

                                        if (sameMatConflicts.length > 0) {
                                          handleViewConflicts(sameMatConflicts.map(c => ({
                                            type: 'error',
                                            message: `TRÙNG GIỜ (Cùng thảm): "${c.cat1.id === item.categoryId ? c.cat2.name : c.cat1.name}"`,
                                            details: c.athletes.map(a => `${a.name} (${a.club})`)
                                          })));
                                        } else {
                                          handleViewConflicts([{ type: 'error', message: 'Trùng giờ cùng thảm' }]);
                                        }
                                      }}
                                    >
                                      🚨 Trùng giờ cùng thảm!
                                    </div>
                                  )}
                                </div>
                                <div className="scard-actions">
                                  <button
                                    className="scard-sigma"
                                    title="Xem sigma (bảng đấu)"
                                    onClick={() => navigate(`/bracket/${item.categoryId}`)}
                                  >Σ</button>
                                  <button className="scard-edit" onClick={() => handleOpenAssign(item.category)} title="Sửa">✏️</button>
                                  <button className="scard-remove" onClick={() => handleRemoveAssignment(item.categoryId)} title="Xóa">✕</button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Table View */
              <div className="table-view">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Nội dung</th>
                      <th>Loại</th>
                      <th>VĐV</th>
                      <th>Thảm</th>
                      <th>Ngày</th>
                      <th>Giờ</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat, idx) => {
                      const s = schedule[cat.id];
                      const dayIdx = s?.date ? tournamentDays.indexOf(s.date) : -1;
                      const dayLabel = dayIdx >= 0
                        ? `Ngày ${dayIdx + 1} (${new Date(s.date).toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'})})`
                        : '—';

                      return (
                        <tr key={cat.id} className={s ? 'assigned-row' : 'unassigned-row'}>
                          <td>{idx + 1}</td>
                          <td className="td-name">
                            <span className={`cat-type-dot ${cat.type}`}></span>
                            {cat.name}
                          </td>
                          <td>
                            <span className={`type-badge ${cat.type}`}>
                              {cat.type === 'kumite' ? 'Kumite' : 'Kata'}
                            </span>
                          </td>
                          <td>{cat.athletes?.length || 0}</td>
                          <td>
                            {s ? (
                              <span className="mat-badge" style={{ background: mats[(s.mat - 1) % mats.length]?.color }}>
                                Thảm {s.mat}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{fontSize:'12px', color:'#475569', whiteSpace:'nowrap'}}>{dayLabel}</td>
                          <td style={{fontWeight:600, color:'#4338ca'}}>{s?.time || '—'}</td>
                          <td>
                            <div className="table-actions">
                              {s && (
                                <button className="btn btn-sm" style={{background:'#ede9fe',color:'#6d28d9',fontWeight:800}} onClick={() => navigate(`/bracket/${cat.id}`)} title="Xem sigma">Σ</button>
                              )}
                              <button className="btn btn-sm btn-primary" onClick={() => handleOpenAssign(cat)}>
                                {s ? '✏️ Sửa' : '📌 Xếp'}
                              </button>
                              {s && (
                                <button className="btn btn-sm btn-danger" onClick={() => handleRemoveAssignment(cat.id)}>
                                  ✕
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Assign Modal */}
        <Modal
          isOpen={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          title={`📌 Xếp lịch: ${selectedCategory?.name || ''}`}
        >
          {selectedCategory && (
            <div className="assign-form">
              <div className="assign-info">
                <span className={`cat-type-badge ${selectedCategory.type}`}>
                  {selectedCategory.type === 'kumite' ? '⚔️ Kumite' : '🥋 Kata'}
                </span>
                <span className="assign-athlete-count">{selectedCategory.athletes?.length || 0} VĐV</span>
                {selectedCategory.bracket && <span className="assign-drawn">✓ Đã bốc thăm</span>}
              </div>



              <div className="form-row">
                <div className="input-group">
                  <label className="input-label">Thảm *</label>
                  <div className="mat-selector">
                    {mats.map(mat => (
                      <button
                        key={mat.id}
                        type="button"
                        className={`mat-option ${assignForm.mat === mat.id ? 'selected' : ''}`}
                        style={{
                          '--mat-color': mat.color,
                          borderColor: assignForm.mat === mat.id ? mat.color : 'transparent',
                          background: assignForm.mat === mat.id ? `${mat.color}20` : 'rgba(255,255,255,0.05)',
                        }}
                        onClick={() => setAssignForm(prev => ({ ...prev, mat: mat.id }))}
                      >
                        <div className="mat-option-dot" style={{ background: mat.color }}></div>
                        {mat.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="input-group">
                  <label className="input-label">Giờ thi đấu *</label>
                  <select
                    className="input"
                    value={assignForm.time}
                    onChange={(e) => setAssignForm(prev => ({ ...prev, time: e.target.value }))}
                  >
                    {timeSlots.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Thứ tự</label>
                  <input
                    type="number"
                    className="input"
                    value={assignForm.order}
                    onChange={(e) => setAssignForm(prev => ({ ...prev, order: parseInt(e.target.value) || 1 }))}
                    min="1"
                  />
                </div>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="assign-warnings">
                  {warnings.map((w, idx) => (
                    <div key={idx} className={`warning-item ${w.severity}`}>
                      <span className="warning-msg">{w.message}</span>
                      {w.details && (
                        <div className="warning-details">
                          {w.details.map((d, i) => (
                            <span key={i} className="warning-athlete">{d}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>
                  Hủy
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={warnings.length > 0 ? { background: '#f59e0b', color: '#fff', border: 'none' } : {}}
                  onClick={handleAssign}
                >
                  {warnings.length > 0 ? '⚠️ Vẫn Xếp Lịch' : (schedule[selectedCategory.id] ? '✅ Cập nhật' : '📌 Xếp lịch')}
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Conflict Details Modal */}
        <Modal
          isOpen={!!showConflictDetails}
          onClose={() => setShowConflictDetails(null)}
          title="⚠️ Chi tiết xung đột VĐV"
        >
          {showConflictDetails && (
            <div className="conflict-details-modal">
              <div className="conflict-detail-header">
                <div className="conflict-cat">
                  <span className={`cat-type-badge ${showConflictDetails.cat1.type}`}>
                    {showConflictDetails.cat1.type === 'kumite' ? '⚔️' : '🥋'}
                  </span>
                  {showConflictDetails.cat1.name}
                </div>
                <span className="conflict-arrow">↔</span>
                <div className="conflict-cat">
                  <span className={`cat-type-badge ${showConflictDetails.cat2.type}`}>
                    {showConflictDetails.cat2.type === 'kumite' ? '⚔️' : '🥋'}
                  </span>
                  {showConflictDetails.cat2.name}
                </div>
              </div>
              <div className="conflict-athlete-list">
                <h4>{showConflictDetails.athletes.length} VĐV trùng:</h4>
                {showConflictDetails.athletes.map((a, idx) => (
                  <div key={idx} className="conflict-athlete-item">
                    <span className="ca-name">{a.name}</span>
                    <span className="ca-club">{a.club}</span>
                  </div>
                ))}
              </div>
              <p className="conflict-advice">
                💡 Hãy xếp 2 nội dung này vào thời gian khác nhau hoặc cùng thảm (thi đấu nối tiếp).
              </p>
            </div>
          )}
        </Modal>

        {/* Event Modal */}
        <Modal
          isOpen={showEventModal}
          onClose={() => setShowEventModal(false)}
          title={editingEvent ? `✏️ Sửa sự kiện` : `➕ Thêm sự kiện`}
        >
          <div className="assign-form">
            {/* Presets */}
            {!editingEvent && (
              <div className="event-presets">
                <label className="input-label">Mẫu nhanh:</label>
                <div className="preset-buttons">
                  {EVENT_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`preset-btn ${eventForm.name === preset.name ? 'active' : ''}`}
                      onClick={() => setEventForm(prev => ({ ...prev, name: preset.name, icon: preset.icon }))}
                    >
                      {preset.icon} {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="input-group" style={{flex:1}}>
                <label className="input-label">Tên sự kiện *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="VD: Khai mạc, Trao thưởng..."
                  value={eventForm.name}
                  onChange={(e) => setEventForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="input-group" style={{width: 80}}>
                <label className="input-label">Icon</label>
                <input
                  type="text"
                  className="input"
                  style={{textAlign:'center', fontSize: 20}}
                  value={eventForm.icon}
                  onChange={(e) => setEventForm(prev => ({ ...prev, icon: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Giờ *</label>
                <select
                  className="input"
                  value={eventForm.time}
                  onChange={(e) => setEventForm(prev => ({ ...prev, time: e.target.value }))}
                >
                  {ALL_TIME_OPTIONS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Thảm</label>
                <select
                  className="input"
                  value={eventForm.mat}
                  onChange={(e) => setEventForm(prev => ({ ...prev, mat: parseInt(e.target.value) }))}
                >
                  <option value={0}>📢 Tất cả thảm</option>
                  {mats.map(mat => (
                    <option key={mat.id} value={mat.id}>{mat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {tournamentDays.length > 1 && (
              <div className="form-row">
                <div className="input-group">
                  <label className="input-label">Ngày</label>
                  <select
                    className="input"
                    value={eventForm.date || selectedDate}
                    onChange={(e) => setEventForm(prev => ({ ...prev, date: e.target.value }))}
                  >
                    {tournamentDays.map((day, idx) => (
                      <option key={day} value={day}>
                        Ngày {idx + 1} — {new Date(day).toLocaleDateString('vi-VN')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEventModal(false)}>
                Hủy
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveEvent}>
                {editingEvent ? '✅ Cập nhật' : '➕ Thêm sự kiện'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Schedule Setup Modal */}
        <Modal
          isOpen={showSetupModal}
          onClose={() => setShowSetupModal(false)}
          title="⚙️ Setup lịch thi đấu"
        >
          <div className="assign-form">
            <p style={{color:'#64748b',fontSize:'13px',marginBottom:'12px'}}>
              Cấu hình số ngày, giờ thi đấu. Hệ thống sẽ tự động phân bổ các nội dung vào các ngày.
            </p>

            <div className="input-label">📅 Ngày bắt đầu</div>
            <input
              type="date"
              className="input"
              value={setupForm.startDate}
              onChange={(e) => setSetupForm(prev => ({...prev, startDate: e.target.value}))}
            />

            <div className="input-label" style={{marginTop:'12px'}}>🗓️ Số ngày thi đấu</div>
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              <button className="btn btn-sm" onClick={() => setSetupForm(prev => ({...prev, competitionDays: Math.max(1, prev.competitionDays - 1)}))}>−</button>
              <span style={{fontSize:'24px',fontWeight:800,color:'#4f46e5',minWidth:'40px',textAlign:'center'}}>{setupForm.competitionDays}</span>
              <button className="btn btn-sm" onClick={() => setSetupForm(prev => ({...prev, competitionDays: Math.min(10, prev.competitionDays + 1)}))}>+</button>
              <span style={{fontSize:'13px',color:'#64748b'}}>ngày</span>
            </div>

            <div className="input-label" style={{marginTop:'12px'}}>🏟️ Số thảm</div>
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              <button className="btn btn-sm" onClick={() => setSetupForm(prev => ({...prev, matCount: Math.max(1, prev.matCount - 1)}))}>−</button>
              <span style={{fontSize:'24px',fontWeight:800,color:'#ea580c',minWidth:'40px',textAlign:'center'}}>{setupForm.matCount}</span>
              <button className="btn btn-sm" onClick={() => setSetupForm(prev => ({...prev, matCount: Math.min(10, prev.matCount + 1)}))}>+</button>
              <span style={{fontSize:'13px',color:'#64748b'}}>thảm</span>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginTop:'12px'}}>
              <div>
                <div className="input-label">☀️ Buổi sáng</div>
                <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
                  <select className="input" value={setupForm.morningStart}
                    onChange={(e) => setSetupForm(prev => ({...prev, morningStart: e.target.value}))}>
                    {ALL_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span>→</span>
                  <select className="input" value={setupForm.morningEnd}
                    onChange={(e) => setSetupForm(prev => ({...prev, morningEnd: e.target.value}))}>
                    {ALL_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className="input-label">🌅 Buổi chiều</div>
                <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
                  <select className="input" value={setupForm.afternoonStart}
                    onChange={(e) => setSetupForm(prev => ({...prev, afternoonStart: e.target.value}))}>
                    {ALL_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span>→</span>
                  <select className="input" value={setupForm.afternoonEnd}
                    onChange={(e) => setSetupForm(prev => ({...prev, afternoonEnd: e.target.value}))}>
                    {ALL_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{marginTop:'16px'}}>
              <div className="input-label">⏱️ Thời lượng trận đấu dự kiến (phút)</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginTop:'8px'}}>
                <div className="input-group">
                  <label className="input-label" style={{fontSize:'11px'}}>Kata cá nhân</label>
                  <input type="number" className="input" value={setupForm.durations?.kata_individual || 5}
                    onChange={(e) => setSetupForm(prev => ({...prev, durations: {...prev.durations, kata_individual: parseInt(e.target.value) || 5}}))} />
                </div>
                <div className="input-group">
                  <label className="input-label" style={{fontSize:'11px'}}>Kata đồng đội</label>
                  <input type="number" className="input" value={setupForm.durations?.kata_team || 5}
                    onChange={(e) => setSetupForm(prev => ({...prev, durations: {...prev.durations, kata_team: parseInt(e.target.value) || 5}}))} />
                </div>
                <div className="input-group">
                  <label className="input-label" style={{fontSize:'11px'}}>Kumite cá nhân</label>
                  <input type="number" className="input" value={setupForm.durations?.kumite_individual || 5}
                    onChange={(e) => setSetupForm(prev => ({...prev, durations: {...prev.durations, kumite_individual: parseInt(e.target.value) || 5}}))} />
                </div>
                <div className="input-group">
                  <label className="input-label" style={{fontSize:'11px'}}>Kumite đồng đội</label>
                  <input type="number" className="input" value={setupForm.durations?.kumite_team || 5}
                    onChange={(e) => setSetupForm(prev => ({...prev, durations: {...prev.durations, kumite_team: parseInt(e.target.value) || 5}}))} />
                </div>
              </div>
            </div>

            {/* Preview */}
            {setupForm.startDate && (
              <div style={{marginTop:'16px',padding:'12px',background:'#f1f5f9',borderRadius:'8px'}}>
                <div style={{fontSize:'13px',fontWeight:700,color:'#334155',marginBottom:'6px'}}>👁️ Xem trước & Ước tính:</div>
                {setupEstimations && (
                  <div style={{fontSize:'12px',marginBottom:'12px',color:'#b45309',background:'#fef3c7',padding:'8px',borderRadius:'6px'}}>
                    💡 Với {categories.length} nội dung đăng ký, tổng cộng ước tính <strong>{setupEstimations.estimatedHours} giờ</strong> thời gian biểu diễn thi đấu cho mỗi thảm. 
                    Khuyến nghị cấu hình <strong>Tối thiểu {setupEstimations.requiredDays} ngày thi đấu</strong>.
                  </div>
                )}
                {Array.from({length: setupForm.competitionDays}).map((_, i) => {
                  const d = new Date(setupForm.startDate);
                  d.setDate(d.getDate() + i);
                  return (
                    <div key={i} style={{fontSize:'12px',color:'#475569',padding:'2px 0'}}>
                      📅 <strong>Ngày {i + 1}</strong>: {d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                      <span style={{color:'#94a3b8'}}> ({setupForm.morningStart}-{setupForm.morningEnd}, {setupForm.afternoonStart}-{setupForm.afternoonEnd})</span>
                    </div>
                  );
                })}
                <div style={{fontSize:'11px',color:'#94a3b8',marginTop:'4px'}}>
                  Tổng: {setupForm.matCount} thảm × {setupForm.competitionDays} ngày
                </div>
              </div>
            )}

            <div className="modal-actions" style={{marginTop:'16px'}}>
              <button className="btn btn-secondary" onClick={() => setShowSetupModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleApplySetup}>
                ✅ Áp dụng & Lưu
              </button>
            </div>
          </div>
        </Modal>

        <ConfirmDialog
          isOpen={confirmDialog.open}
          title="Xác nhận"
          message={confirmDialog.message}
          onConfirm={() => confirmDialog.onConfirm?.()}
          onCancel={() => setConfirmDialog({ open: false, message: "", onConfirm: null })}
          confirmText="Xác nhận"
          cancelText="Hủy"
          type="danger"
        />
      </div>
      {/* Conflict Info Modal */}
      <Modal
        isOpen={showConflictInfo}
        onClose={() => setShowConflictInfo(false)}
        title="⚠️ Chi tiết xung đột VĐV"
      >
        <div className="conflict-detail-container">
          {activeConflicts.length === 0 ? (
            <p className="no-conflicts">Không có thông tin chi tiết.</p>
          ) : (
            activeConflicts.map((c, idx) => (
              <div key={idx} className={`conflict-detail-card ${c.type}`}>
                <div className="conflict-detail-header">
                  <span className="conflict-detail-type">
                    {c.type === 'error' ? '🚨 LỖI NGHIÊM TRỌNG' : '⚠️ CẢNH BÁO'}
                  </span>
                  <div className="conflict-detail-msg">{c.message}</div>
                </div>
                {c.details && c.details.length > 0 && (
                  <div className="conflict-detail-body">
                    <div className="conflict-detail-label">Danh sách VĐV trùng:</div>
                    <ul className="conflict-athlete-list">
                      {c.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          )}
          <div className="modal-actions" style={{marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '15px'}}>
            <button className="btn btn-primary" onClick={() => setShowConflictInfo(false)}>Đóng</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
