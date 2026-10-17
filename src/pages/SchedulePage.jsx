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
  getCategoryAgeKey,
  getCategoryScheduleGroupKey,
  getCategoryCustomPlanGroupKey,
} from "../services/scheduleService";
import {
  exportScheduleToPDF,
  exportScheduleToExcel,
} from "../services/scheduleExportService";
import { exportScheduleHorizontalToPDF } from "../services/scheduleHorizontalExportService";
import { exportScheduleVerticalByMatToPDF } from "../services/scheduleVerticalByMatExportService";
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
  const { toast } = useToast();
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
  const [assignForm, setAssignForm] = useState({ mat: 1, time: "08:00", endTime: "", order: 1 });
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
  const [showVerticalMatExportModal, setShowVerticalMatExportModal] = useState(false);
  const [exportingVerticalMat, setExportingVerticalMat] = useState(false);
  const [verticalMatExportProgress, setVerticalMatExportProgress] = useState({
    percent: 0,
    label: "",
  });
  const [setupForm, setSetupForm] = useState({
    matCount: 4,
    competitionDays: 2,
    startDate: "",
    morningStart: "07:00",
    morningEnd: "11:30",
    afternoonStart: "13:00",
    afternoonEnd: "17:30",
    durations: DEFAULT_MATCH_DURATIONS,
    priorityMode: "standard_gender_order",
    customPriorityOrder: [],
    athleteRestMinutes: 15,
    ageGroupsByDay: [],
    customMatPlanByDay: [],
    startSessionByDay: [],
    startTimeByDay: [],
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

  const categories = useMemo(() => {
    if (!tournament) return [];
    const splitSettings = tournament.splitSettings || { enabled: false, threshold: 20 };
    const items = [];
    
    // We need getSplitCount logic here but let's simple re-implement for now or export it
    // Threshold and enabled check
    const getCount = (cat) => {
      const athleteCount = cat.athletes?.length || 0;
      const threshold = splitSettings.threshold || 20;
      if (cat.sigmaCount && cat.sigmaCount > 1) return cat.sigmaCount;
      if (cat.sigmaSplitEnabled === false) return 1;
      if (cat.sigmaSplitEnabled === true) return Math.max(2, Math.floor(athleteCount / threshold)) || 2;
      if (!splitSettings.enabled || athleteCount <= threshold) return 1;
      return Math.max(2, Math.floor(athleteCount / threshold));
    };

    tournament.categories.forEach(cat => {
      const numSplits = getCount(cat);
      if (numSplits > 1) {
        for (let i = 0; i < numSplits; i++) {
          const perSplit = Math.ceil((cat.athletes?.length || 0) / numSplits);
          items.push({
            ...cat,
            id: `${cat.id}_split${i}`,
            baseId: cat.id,
            name: `${cat.name} - Bảng ${i + 1}/${numSplits}`,
            isSplit: true,
            splitIndex: i,
            totalSplits: numSplits,
            bracket: null,
            athletes: (cat.athletes || []).slice(i * perSplit, (i + 1) * perSplit),
          });
        }
      } else {
        items.push(cat);
      }
    });
    return items;
  }, [tournament]);

  const availableAgeGroups = useMemo(() => {
    const groups = new Map();
    categories.forEach((category) => {
      const ageKey = getCategoryAgeKey(category);
      const key = getCategoryScheduleGroupKey(category);
      if (!groups.has(key)) {
        const rawLabel = String(category.ageGroup || '').trim();
        const discipline = key.startsWith('kumite:') ? 'Kumite' : 'Kata';
        const ageLabel = ageKey === '18' ? '18 tuổi trở lên (gồm Vô địch tuyệt đối)' : ageKey === 'unknown' ? 'Không xác định lứa tuổi' : rawLabel || ageKey + ' tuổi';
        groups.set(key, discipline + ' - ' + ageLabel);
      }
    });
    return [...groups.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => {
      const [disciplineA, ageA] = a.key.split(':');
      const [disciplineB, ageB] = b.key.split(':');
      return disciplineA.localeCompare(disciplineB) || (Number(ageB) || -1) - (Number(ageA) || -1);
    });
  }, [categories]);

  const availableCustomPlanGroups = useMemo(() => {
    const groups = new Map();
    categories.forEach((category) => {
      const key = getCategoryCustomPlanGroupKey(category);
      if (groups.has(key)) {
        groups.get(key).count += 1;
        return;
      }
      const [discipline, ageKey, gender, competitionClass] = key.split(':');
      const rawAgeLabel = String(category.ageGroup || '').trim();
      const ageLabel = ageKey === '18'
        ? '18 tuổi trở lên'
        : (ageKey === 'unknown' ? 'Không rõ tuổi' : (rawAgeLabel || `${ageKey} tuổi`));
      const genderLabel = gender === 'female'
        ? 'Nữ'
        : (gender === 'mixed' ? 'Hỗn hợp' : 'Nam');
      const classLabel = competitionClass === 'absolute'
        ? 'Vô địch tuyệt đối'
        : (competitionClass === 'team'
          ? 'Đồng đội'
          : (competitionClass === 'mixed' ? 'Hỗn hợp' : 'Cá nhân'));
      groups.set(key, {
        key,
        baseLabel: `${discipline === 'kumite' ? 'Kumite' : 'Kata'} - ${ageLabel} - ${genderLabel} ${classLabel}`,
        count: 1,
      });
    });
    return [...groups.values()]
      .map((group) => ({
        ...group,
        label: `${group.baseLabel} (${group.count} nội dung)`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  }, [categories]);

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
    return detectScheduleConflicts(schedule, categories, matchDurations);
  }, [schedule, categories, matchDurations]);

  // Unassigned categories (not assigned on ANY day)
  const unassignedCategories = categories.filter(c => !schedule[c.id]);
  const selectedDayPlanForDisplay =
    tournament?.scheduleConfig?.customMatPlan?.[selectedDate] || {};
  const selectedDayGroupKeys = new Set(
    ['morning', 'afternoon'].flatMap((sessionKey) =>
      Object.values(selectedDayPlanForDisplay?.[sessionKey] || {}).flatMap((keys) => keys || [])
    )
  );
  const unassignedForSelectedDay = unassignedCategories.filter((category) =>
    selectedDayGroupKeys.has(getCategoryCustomPlanGroupKey(category))
  );
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

  const getNextAvailableTimeAndOrder = (matId, targetDate) => {
    let nextTime = sessionConfig?.morningStart || "08:00";
    let nextOrder = 1;
    let maxTimeMins = -1;

    Object.entries(schedule).forEach(([catId, s]) => {
      if (s.mat === matId && s.date === targetDate) {
        if ((s.order || 0) >= nextOrder) nextOrder = (s.order || 0) + 1;
        const cat = categories.find(c => c.id === catId);
        if (cat) {
          const dur = estimateCategoryDuration(cat, matchDurations);
          const endT = s.endTime || addMinutesToTime(s.time, dur);
          const [h, m] = endT.split(':').map(Number);
          const mins = h * 60 + m;
          if (mins > maxTimeMins) {
            maxTimeMins = mins;
            nextTime = endT;
          }
        }
      }
    });

    customEvents.forEach(evt => {
      if ((evt.mat === 0 || evt.mat === matId) && (evt.date === targetDate || !evt.date)) {
        if (evt.time) {
          const [h, m] = evt.time.split(':').map(Number);
          const endMins = h * 60 + m + 15; // Mặc định sự kiện chiếm 15p
          if (endMins > maxTimeMins) {
            maxTimeMins = endMins;
            nextTime = addMinutesToTime(evt.time, 15);
          }
        }
      }
    });

    // Làm tròn lên 5 phút để khớp với UI dropdown
    let [h, m] = nextTime.split(':').map(Number);
    const rem = m % 5;
    if (rem !== 0) {
      m += (5 - rem);
      if (m >= 60) {
        m -= 60;
        h += 1;
      }
    }
    return { 
      nextTime: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`, 
      nextOrder 
    };
  };

  // Open assign modal
  const handleOpenAssign = (category) => {
    setSelectedCategory(category);
    const existing = schedule[category.id];
    if (existing) {
      setAssignForm({ mat: existing.mat, time: existing.time, endTime: existing.endTime || "", order: existing.order || 1, date: existing.date || selectedDate });
    } else {
      const { nextTime, nextOrder } = getNextAvailableTimeAndOrder(1, selectedDate);
      setAssignForm({ mat: 1, time: nextTime, endTime: "", order: nextOrder, date: selectedDate });
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
        endTime: assignForm.endTime,
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

  const handleAutoAssign = () => {
    const isCustomMatPlanMode =
      tournament.scheduleConfig?.priorityMode === 'custom_mat_plan';
    if (!isCustomMatPlanMode && unassignedCategories.length === 0) {
      toast.info("Tất cả nội dung đã được xếp lịch");
      return;
    }

    if (!selectedDate) {
      toast.error("Vui lòng chọn ngày thi đấu trước!");
      return;
    }

    const selectedDayPlan =
      tournament.scheduleConfig?.customMatPlan?.[selectedDate] || {};
    const configuredGroupKeys = new Set(
      ['morning', 'afternoon'].flatMap((sessionKey) =>
        Object.values(selectedDayPlan?.[sessionKey] || {}).flatMap((keys) => keys || [])
      )
    );
    if (isCustomMatPlanMode && configuredGroupKeys.size === 0) {
      toast.info("Ngày này chưa được gán nhóm nội dung nào trong Setup.");
      return;
    }
    const scheduleBeforeAutoAssign = isCustomMatPlanMode
      ? Object.fromEntries(
        Object.entries(schedule).filter(([categoryId, assignment]) => {
          if (assignment.date === selectedDate) return false;
          const category = categories.find((item) => item.id === categoryId);
          return !category || !configuredGroupKeys.has(getCategoryCustomPlanGroupKey(category));
        })
      )
      : schedule;

    const morningSlots = generateTimeSlotsFromRange(sessionConfig.morningStart, sessionConfig.morningEnd, 5);
    const afternoonSlots = generateTimeSlotsFromRange(sessionConfig.afternoonStart, sessionConfig.afternoonEnd, 5);
    const slotsPerMat = [...morningSlots, ...afternoonSlots];
    if (slotsPerMat.length === 0) {
      toast.error("Vui lòng cấu hình thời gian buổi sáng/chiều trước!");
      return;
    }

    const newSchedule = smartAutoAssign(
      categories,
      [selectedDate],
      matCount,
      sessionConfig,
      matchDurations,
      scheduleBeforeAutoAssign,
      {
        customEvents,
        priorityMode: tournament.scheduleConfig?.priorityMode || "standard_gender_order",
        customPriorityOrder: tournament.scheduleConfig?.customPriorityOrder || categories.map((category) => category.id),
        ageGroupsByDay: tournament.scheduleConfig?.ageGroupsByDay || {},
        customMatPlan: tournament.scheduleConfig?.customMatPlan || {},
        startSessionByDay: tournament.scheduleConfig?.startSessionByDay || {},
        startTimeByDay: tournament.scheduleConfig?.startTimeByDay || {},
        onlyConfiguredCustomPlan: isCustomMatPlanMode,
        athleteRestMinutes: tournament.scheduleConfig?.athleteRestMinutes ?? 15,
      }
    );

    saveSchedule(newSchedule);
    const newlyScheduled = isCustomMatPlanMode
      ? categories.filter((category) => newSchedule[category.id]?.date === selectedDate).length
      : categories.filter(
        (category) => !schedule[category.id] && newSchedule[category.id]
      ).length;
    if (isCustomMatPlanMode) {
      const stillMissingForDay = categories.filter(
        (category) =>
          configuredGroupKeys.has(getCategoryCustomPlanGroupKey(category)) &&
          newSchedule[category.id]?.date !== selectedDate
      ).length;
      if (stillMissingForDay > 0) {
        toast.warning(`Đã xếp thêm ${newlyScheduled} nội dung; còn ${stillMissingForDay} nội dung đã cấu hình nhưng không đủ khung giờ ngày này.`);
      } else {
        toast.success(`Đã xếp ${newlyScheduled} nội dung theo đúng cấu hình ngày này.`);
      }
      return;
    }
    const stillMissing = categories.filter((category) => !newSchedule[category.id]).length;
    if (stillMissing > 0) {
      toast.warning(`Đã xếp thêm ${newlyScheduled} nội dung; còn ${stillMissing} nội dung không đủ khung giờ ngày này.`);
    } else {
      toast.success(`Đã xếp thêm ${newlyScheduled} nội dung trong ngày này.`);
    }
  };

  // Auto-assign ALL categories across ALL days
  const handleAutoAssignAll = () => {
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
      {},
      {
        customEvents,
        priorityMode: tournament.scheduleConfig?.priorityMode || "standard_gender_order",
        customPriorityOrder: tournament.scheduleConfig?.customPriorityOrder || categories.map((category) => category.id),
        ageGroupsByDay: tournament.scheduleConfig?.ageGroupsByDay || {},
        customMatPlan: tournament.scheduleConfig?.customMatPlan || {},
        startSessionByDay: tournament.scheduleConfig?.startSessionByDay || {},
        startTimeByDay: tournament.scheduleConfig?.startTimeByDay || {},
        athleteRestMinutes: tournament.scheduleConfig?.athleteRestMinutes ?? 15,
      }
    );

    saveSchedule(newSchedule);
    const scheduledCount = Object.keys(newSchedule).length;
    const missingCount = Math.max(0, categories.length - scheduledCount);
    if (missingCount > 0) {
      toast.warning(`Đã xếp ${scheduledCount}/${categories.length} nội dung; còn ${missingCount} nội dung không đủ khung giờ.`);
    } else {
      toast.success(`Đã xếp lại và cân bằng toàn bộ ${scheduledCount} nội dung.`);
    }
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
      priorityMode: tournament.scheduleConfig?.priorityMode || "standard_gender_order",
      ageGroupsByDay: tournament.scheduleConfig?.ageGroupsByDay || {},
      customPriorityOrder: tournament.scheduleConfig?.customPriorityOrder || categories.map((category) => category.id),
      customMatPlan: tournament.scheduleConfig?.customMatPlan || {},
      startSessionByDay: tournament.scheduleConfig?.startSessionByDay || {},
      startTimeByDay: tournament.scheduleConfig?.startTimeByDay || {},
      athleteRestMinutes: tournament.scheduleConfig?.athleteRestMinutes ?? 15,
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
      priorityMode: cfg.priorityMode || "standard_gender_order",
      customPriorityOrder: cfg.customPriorityOrder || categories.map((category) => category.id),
      athleteRestMinutes: cfg.athleteRestMinutes ?? 15,
      ageGroupsByDay: (cfg.dates || []).map((date) => {
        const savedGroups = cfg.ageGroupsByDay?.[date] || [];
        return [...new Set(savedGroups.flatMap((savedKey) =>
          savedKey.includes(':')
            ? [savedKey]
            : availableAgeGroups.filter((group) => group.key.endsWith(':' + savedKey)).map((group) => group.key)
        ))];
      }),
      customMatPlanByDay: (cfg.dates || []).map((date) =>
        cfg.customMatPlan?.[date] || { morning: {}, afternoon: {} }
      ),
      startSessionByDay: (cfg.dates || []).map((date) =>
        cfg.startSessionByDay?.[date] || 'morning'
      ),
      startTimeByDay: (cfg.dates || []).map((date) => {
        const session = cfg.startSessionByDay?.[date] || 'morning';
        return cfg.startTimeByDay?.[date] ||
          (session === 'afternoon'
            ? (cfg.afternoonStart || sessionConfig.afternoonStart)
            : (cfg.morningStart || sessionConfig.morningStart));
      }),
    });
    setShowSetupModal(true);
  };

  const updateCustomMatLane = (dayIndex, sessionKey, mat, updateLane) => {
    setSetupForm((prev) => {
      const plans = [...(prev.customMatPlanByDay || [])];
      const dayPlan = plans[dayIndex] || { morning: {}, afternoon: {} };
      const sessionPlan = { ...(dayPlan[sessionKey] || {}) };
      const currentLane = [...(sessionPlan[mat] || [])];
      sessionPlan[mat] = updateLane(currentLane);
      plans[dayIndex] = { ...dayPlan, [sessionKey]: sessionPlan };
      return { ...prev, customMatPlanByDay: plans };
    });
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
    const ageGroupsByDay = Object.fromEntries(
      dates.map((date, index) => [date, setupForm.ageGroupsByDay?.[index] || []])
    );
    const customMatPlan = Object.fromEntries(
      dates.map((date, index) => [
        date,
        setupForm.customMatPlanByDay?.[index] || { morning: {}, afternoon: {} },
      ])
    );
    const startSessionByDay = Object.fromEntries(
      dates.map((date, index) => [
        date,
        setupForm.startSessionByDay?.[index] || 'morning',
      ])
    );
    const startTimeByDay = Object.fromEntries(
      dates.map((date, index) => {
        const session = setupForm.startSessionByDay?.[index] || 'morning';
        return [
          date,
          setupForm.startTimeByDay?.[index] ||
            (session === 'afternoon' ? setupForm.afternoonStart : setupForm.morningStart),
        ];
      })
    );
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
      priorityMode: setupForm.priorityMode || "standard_gender_order",
      customPriorityOrder: setupForm.customPriorityOrder || categories.map((category) => category.id),
      athleteRestMinutes: setupForm.athleteRestMinutes ?? 15,
      ageGroupsByDay,
      customMatPlan,
      startSessionByDay,
      startTimeByDay,
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

  const handleExportVerticalByMat = async (separateFiles) => {
    if (exportingVerticalMat) return;
    setExportingVerticalMat(true);
    setVerticalMatExportProgress({
      percent: 0,
      label: separateFiles
        ? "Đang chuẩn bị xuất từng thảm..."
        : "Đang chuẩn bị file tổng hợp...",
    });

    try {
      const result = await exportScheduleVerticalByMatToPDF(
        schedule,
        categories,
        customEvents,
        matCount,
        tournament,
        tournamentDays,
        {
          separateFiles,
          onProgress: (progress) => setVerticalMatExportProgress({
            percent: progress.percent || 0,
            label: separateFiles
              ? `[${progress.current}/${progress.total}] ${progress.matName}`
              : "Đang tạo file PDF tổng hợp...",
          }),
        }
      );
      toast.success(
        separateFiles
          ? `Đã xuất ${result.fileCount} file PDF, mỗi thảm một file!`
          : "Đã xuất một file PDF tổng hợp tất cả thảm!"
      );
      setShowVerticalMatExportModal(false);
    } catch (error) {
      console.error("Vertical schedule by mat export error:", error);
      toast.error(error.message || "Không thể xuất PDF dọc theo thảm.");
    } finally {
      setExportingVerticalMat(false);
      setVerticalMatExportProgress({ percent: 0, label: "" });
    }
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
                📅 Xếp lại TẤT CẢ
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
            <button
              className="btn btn-sm"
              style={{background:'#eff6ff',color:'#1d4ed8',border:'1px solid #bfdbfe'}}
              onClick={async () => {
                try {
                  toast.info("Đang tạo lịch thi đấu dạng ngang...");
                  await exportScheduleHorizontalToPDF(
                    schedule,
                    categories,
                    customEvents,
                    matCount,
                    tournament,
                    tournamentDays
                  );
                  toast.success("Đã xuất PDF lịch thi đấu dạng ngang!");
                } catch (error) {
                  console.error("Horizontal schedule export error:", error);
                  toast.error("Không thể xuất lịch thi đấu dạng ngang.");
                }
              }}
              title="Xuất tất cả ngày, các thảm nằm song song như bảng chương trình thi đấu"
            >
              ↔️ PDF Ngang
            </button>
            <button
              className="btn btn-sm"
              style={{background:'#f5f3ff',color:'#6d28d9',border:'1px solid #ddd6fe'}}
              onClick={() => setShowVerticalMatExportModal(true)}
              title="Xuất A4 dọc, lần lượt từng thảm, dạng bảng giống màn hình hiện tại"
            >
              ↕️ PDF Dọc Theo Thảm
            </button>
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
              <span>📦 Chưa xếp toàn giải</span>
              <span className="panel-count">{unassignedCategories.length}</span>
            </h3>
            {tournament.scheduleConfig?.priorityMode === 'custom_mat_plan' && (
              <div style={{margin: '-2px 12px 9px', padding: '7px 9px', borderRadius: '6px', background: '#eff6ff', color: '#1d4ed8', fontSize: '11px', lineHeight: 1.4}}>
                Ngày đang xem còn <strong>{unassignedForSelectedDay.length}</strong> nội dung theo Setup.
                Nội dung của ngày khác vẫn được tính trong tổng {unassignedCategories.length}.
              </div>
            )}
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
                        
                        let assignedTime = existing?.time;
                        let assignedOrder = existing?.order;
                        
                        if (!existing) {
                          const { nextTime, nextOrder } = getNextAvailableTimeAndOrder(mat.id, selectedDate);
                          assignedTime = nextTime;
                          assignedOrder = nextOrder;
                        }

                        setAssignForm({
                          mat: mat.id,
                          time: assignedTime || '08:00',
                          endTime: existing?.endTime || '',
                          order: assignedOrder || (matItems.length + 1),
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
                                        - {item.endTime || addMinutesToTime(item.time, estimateCategoryDuration(item.category, currentTournament.setup?.durations))}
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
                          <td style={{fontWeight:600, color:'#4338ca'}}>{s?.time ? `${s.time}${s.endTime ? ` - ${s.endTime}` : ''}` : '—'}</td>
                          <td>
                            <div className="table-actions">
                              {s && (
                                <button className="btn btn-sm" style={{background:'#ede9fe',color:'#6d28d9',fontWeight:800}} onClick={() => navigate(`/bracket/${cat.id}`, { state: { reviewSigma: true } })} title="Xem review sigma">Σ Review</button>
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
                        onClick={() => {
                          setAssignForm(prev => {
                            const newState = { ...prev, mat: mat.id };
                            if (selectedCategory && !schedule[selectedCategory.id]) {
                              const { nextTime, nextOrder } = getNextAvailableTimeAndOrder(mat.id, selectedDate);
                              newState.time = nextTime;
                              newState.order = nextOrder;
                            }
                            return newState;
                          });
                        }}
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
                  <label className="input-label">Giờ kết thúc</label>
                  <select
                    className="input"
                    value={assignForm.endTime || ""}
                    onChange={(e) => setAssignForm(prev => ({ ...prev, endTime: e.target.value }))}
                  >
                    <option value="">--:-- (Tự ước tính)</option>
                    {ALL_TIME_OPTIONS.map(t => (
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
          size="large"
        >
          <div className="assign-form schedule-setup-form">
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

            <div style={{marginTop: '14px'}}>
              <div className="input-label">⏱️ Thời điểm bắt đầu từng ngày</div>
              <div style={{fontSize: '11px', color: '#64748b', marginTop: '3px', marginBottom: '7px'}}>
                Chọn “Buổi chiều” nếu ngày đó không tổ chức thi đấu vào buổi sáng.
              </div>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px'}}>
                {Array.from({length: setupForm.competitionDays}).map((_, dayIndex) => {
                  const startSession = setupForm.startSessionByDay?.[dayIndex] || 'morning';
                  const defaultStartTime = startSession === 'afternoon'
                    ? setupForm.afternoonStart
                    : setupForm.morningStart;
                  const startTime = setupForm.startTimeByDay?.[dayIndex] || defaultStartTime;
                  const sessionEnd = startSession === 'afternoon'
                    ? setupForm.afternoonEnd
                    : setupForm.morningEnd;
                  return (
                  <div key={dayIndex} style={{display: 'grid', gridTemplateColumns: 'auto 1fr 90px', alignItems: 'center', gap: '8px', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '7px', background: '#f8fafc'}}>
                    <span style={{fontSize: '12px', fontWeight: 700}}>Ngày {dayIndex + 1}</span>
                    <select
                      className="input"
                      value={startSession}
                      onChange={(event) => {
                        const nextSession = event.target.value;
                        setSetupForm((prev) => {
                          const starts = [...(prev.startSessionByDay || [])];
                          starts[dayIndex] = nextSession;
                          const startTimes = [...(prev.startTimeByDay || [])];
                          startTimes[dayIndex] = nextSession === 'afternoon'
                            ? prev.afternoonStart
                            : prev.morningStart;
                          const plans = [...(prev.customMatPlanByDay || [])];
                          if (nextSession === 'afternoon') {
                            const dayPlan = plans[dayIndex] || { morning: {}, afternoon: {} };
                            plans[dayIndex] = { ...dayPlan, morning: {} };
                          }
                          return {
                            ...prev,
                            startSessionByDay: starts,
                            startTimeByDay: startTimes,
                            customMatPlanByDay: plans,
                          };
                        });
                      }}
                    >
                      <option value="morning">☀️ Buổi sáng</option>
                      <option value="afternoon">🌤️ Buổi chiều</option>
                    </select>
                    <select
                      className="input"
                      value={startTime}
                      title="Giờ bắt đầu ngày này"
                      onChange={(event) => setSetupForm((prev) => {
                        const startTimes = [...(prev.startTimeByDay || [])];
                        startTimes[dayIndex] = event.target.value;
                        return { ...prev, startTimeByDay: startTimes };
                      })}
                    >
                      {ALL_TIME_OPTIONS
                        .filter((time) => time >= defaultStartTime && time < sessionEnd)
                        .map((time) => <option key={time} value={time}>{time}</option>)}
                    </select>
                  </div>
                  );
                })}
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginTop:'16px'}}>
              <div className="input-group">
                <label className="input-label">Ưu tiên xếp trước</label>
                <select className="input" value={setupForm.priorityMode || "standard_gender_order"}
                  onChange={(e) => setSetupForm(prev => ({
                    ...prev,
                    priorityMode: e.target.value,
                    customPriorityOrder: prev.customPriorityOrder?.length
                      ? prev.customPriorityOrder
                      : categories.map((category) => category.id),
                  }))}>
                  <option value="karate_standard">Thứ tự chuẩn Karate</option>
                  <option value="standard_gender_order">Nam CN → Nữ CN → Đội nam → Đội nữ → Hỗn hợp</option>
                  <option value="custom_order">Tự sắp xếp từng hạng mục</option>
                  <option value="category_order">Theo thứ tự danh sách hạng mục</option>
                  <option value="kata_first">Kata trước</option>
                  <option value="kumite_first">Kumite trước</option>
                  <option value="age_young_first">Lứa tuổi nhỏ trước</option>
                  <option value="age_old_first">Lứa tuổi lớn trước</option>
                  <option value="day_group_order">Tùy chỉnh Kata/Kumite + lứa tuổi theo từng ngày</option>
                  <option value="custom_mat_plan">Tùy chỉnh theo ngày, buổi và thảm</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Nghỉ giữa nội dung trùng VĐV (phút)</label>
                <input type="number" min="0" step="5" className="input"
                  value={setupForm.athleteRestMinutes ?? 15}
                  onChange={(e) => setSetupForm(prev => ({...prev, athleteRestMinutes: Math.max(0, parseInt(e.target.value) || 0)}))} />
              </div>
            </div>

            {setupForm.priorityMode === 'custom_mat_plan' && (
              <div style={{marginTop: '14px'}}>
                <div className="input-label">🗂️ Chia nội dung theo ngày, buổi và thảm</div>
                <div style={{fontSize: '11px', color: '#64748b', marginTop: '4px', marginBottom: '10px'}}>
                  Thêm nhóm vào từng thảm rồi dùng ↑ ↓ để sắp STT. Nhóm bắt đầu trong buổi đã chọn; nếu buổi đó không đủ thời gian, các nội dung còn lại sẽ nối sang buổi kế tiếp trên đúng thảm.
                </div>
                <div style={{display: 'grid', gap: '12px'}}>
                  {Array.from({length: setupForm.competitionDays}).map((_, dayIndex) => (
                    <div key={dayIndex} style={{padding: '12px', border: '1px solid #cbd5e1', borderRadius: '10px', background: '#f8fafc'}}>
                      <div style={{fontWeight: 800, fontSize: '14px', color: '#1e293b', marginBottom: '10px'}}>
                        Ngày {dayIndex + 1}
                      </div>
                      {[
                        {
                          key: 'morning',
                          label: '☀️ Buổi sáng',
                          time: `${(setupForm.startSessionByDay?.[dayIndex] || 'morning') === 'morning'
                            ? (setupForm.startTimeByDay?.[dayIndex] || setupForm.morningStart)
                            : setupForm.morningStart} – ${setupForm.morningEnd}`,
                        },
                        {
                          key: 'afternoon',
                          label: '🌤️ Buổi chiều',
                          time: `${(setupForm.startSessionByDay?.[dayIndex] || 'morning') === 'afternoon'
                            ? (setupForm.startTimeByDay?.[dayIndex] || setupForm.afternoonStart)
                            : setupForm.afternoonStart} – ${setupForm.afternoonEnd}`,
                        },
                      ]
                        .filter((session) =>
                          (setupForm.startSessionByDay?.[dayIndex] || 'morning') !== 'afternoon' ||
                          session.key === 'afternoon'
                        )
                        .map((session) => (
                        <div key={session.key} style={{marginTop: '10px'}}>
                          <div style={{fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '7px'}}>
                            {session.label} · {session.time}
                          </div>
                          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '8px'}}>
                            {Array.from({length: setupForm.matCount}).map((__, matIndex) => {
                              const mat = matIndex + 1;
                              const lane = setupForm.customMatPlanByDay?.[dayIndex]?.[session.key]?.[mat] || [];
                              const assignedKeys = new Set(
                                (setupForm.customMatPlanByDay || []).flatMap((dayPlan) =>
                                  ['morning', 'afternoon'].flatMap((sessionKey) =>
                                    Object.values(dayPlan?.[sessionKey] || {}).flatMap((keys) => keys || [])
                                  )
                                )
                              );
                              return (
                                <div key={mat} style={{padding: '9px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff'}}>
                                  <div style={{fontSize: '12px', fontWeight: 800, color: '#2563eb', marginBottom: '6px'}}>
                                    Thảm {mat}
                                  </div>
                                  <div style={{display: 'grid', gap: '5px'}}>
                                    {lane.map((key, index) => {
                                      const group = availableCustomPlanGroups.find((item) => item.key === key);
                                      return (
                                        <div key={key} style={{display: 'flex', alignItems: 'center', gap: '5px', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc'}}>
                                          <span style={{minWidth: '20px', fontWeight: 800, color: '#0f766e'}}>{index + 1}</span>
                                          <span style={{flex: 1, fontSize: '11px', fontWeight: 600, lineHeight: 1.35}}>{group?.label || key}</span>
                                          <button type="button" className="btn btn-sm" title="Đưa lên" disabled={index === 0}
                                            onClick={() => updateCustomMatLane(dayIndex, session.key, mat, (items) => {
                                              [items[index - 1], items[index]] = [items[index], items[index - 1]];
                                              return items;
                                            })}>↑</button>
                                          <button type="button" className="btn btn-sm" title="Đưa xuống" disabled={index === lane.length - 1}
                                            onClick={() => updateCustomMatLane(dayIndex, session.key, mat, (items) => {
                                              [items[index], items[index + 1]] = [items[index + 1], items[index]];
                                              return items;
                                            })}>↓</button>
                                          <button type="button" className="btn btn-sm" title="Bỏ khỏi thảm"
                                            onClick={() => updateCustomMatLane(dayIndex, session.key, mat, (items) =>
                                              items.filter((item) => item !== key)
                                            )}>×</button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <select
                                    className="input"
                                    value=""
                                    style={{marginTop: '7px', fontSize: '11px', minHeight: '32px'}}
                                    onChange={(event) => {
                                      const key = event.target.value;
                                      if (key) {
                                        updateCustomMatLane(dayIndex, session.key, mat, (items) => [...items, key]);
                                      }
                                    }}
                                  >
                                    <option value="">+ Thêm nhóm nội dung...</option>
                                    {availableCustomPlanGroups
                                      .filter((group) => !assignedKeys.has(group.key))
                                      .map((group) => (
                                        <option key={group.key} value={group.key}>{group.label}</option>
                                      ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(
              setupForm.priorityMode === 'day_group_order' ||
              (setupForm.competitionDays > 1 &&
                (setupForm.priorityMode === 'age_old_first' || setupForm.priorityMode === 'age_young_first'))
            ) && (
              <div style={{marginTop: '14px'}}>
                <div className='input-label'>
                  📅 {setupForm.priorityMode === 'day_group_order'
                    ? 'Chọn và sắp STT nhóm Kata/Kumite - lứa tuổi theo từng ngày'
                    : 'Chọn Kata/Kumite và lứa tuổi theo từng ngày'}
                </div>
                <div style={{display: 'grid', gap: '8px', marginTop: '8px'}}>
                  {Array.from({length: setupForm.competitionDays}).map((_, dayIndex) => (
                    <div key={dayIndex} style={{padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc'}}>
                      <div style={{fontWeight: 700, fontSize: '13px', marginBottom: '7px'}}>Ngày {dayIndex + 1}</div>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px 14px'}}>
                        {availableAgeGroups.map((group) => {
                          const checked = (setupForm.ageGroupsByDay?.[dayIndex] || []).includes(group.key);
                          return (
                            <label key={group.key} style={{display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer'}}>
                              <input type='checkbox' checked={checked} onChange={() => setSetupForm((prev) => {
                                const byDay = [...(prev.ageGroupsByDay || [])];
                                const selected = new Set(byDay[dayIndex] || []);
                                if (selected.has(group.key)) selected.delete(group.key); else selected.add(group.key);
                                byDay[dayIndex] = [...selected];
                                return {...prev, ageGroupsByDay: byDay};
                              })} />
                              {group.label}
                            </label>
                          );
                        })}
                      </div>
                      {setupForm.priorityMode === 'day_group_order' && (() => {
                        const selectedKeys = (setupForm.ageGroupsByDay?.[dayIndex] || [])
                          .filter((key) => availableAgeGroups.some((group) => group.key === key));
                        if (selectedKeys.length === 0) return (
                          <div style={{fontSize: '11px', color: '#94a3b8', marginTop: '8px'}}>
                            Chọn các nhóm phía trên, sau đó sắp STT tại đây.
                          </div>
                        );
                        return (
                          <div style={{marginTop: '10px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px'}}>
                            <div style={{fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '5px'}}>
                              Thứ tự thi đấu trong ngày
                            </div>
                            <div style={{display: 'grid', gap: '5px'}}>
                              {selectedKeys.map((key, index) => {
                                const group = availableAgeGroups.find((item) => item.key === key);
                                return (
                                  <div key={key} style={{display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px'}}>
                                    <span style={{width: '24px', fontWeight: 800, color: '#2563eb'}}>{index + 1}</span>
                                    <span style={{flex: 1, fontSize: '12px', fontWeight: 600}}>{group?.label || key}</span>
                                    <button type='button' className='btn btn-sm' disabled={index === 0}
                                      onClick={() => setSetupForm((prev) => {
                                        const byDay = [...(prev.ageGroupsByDay || [])];
                                        const order = [...(byDay[dayIndex] || [])];
                                        [order[index - 1], order[index]] = [order[index], order[index - 1]];
                                        byDay[dayIndex] = order;
                                        return {...prev, ageGroupsByDay: byDay};
                                      })}>↑</button>
                                    <button type='button' className='btn btn-sm' disabled={index === selectedKeys.length - 1}
                                      onClick={() => setSetupForm((prev) => {
                                        const byDay = [...(prev.ageGroupsByDay || [])];
                                        const order = [...(byDay[dayIndex] || [])];
                                        [order[index], order[index + 1]] = [order[index + 1], order[index]];
                                        byDay[dayIndex] = order;
                                        return {...prev, ageGroupsByDay: byDay};
                                      })}>↓</button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
                <div style={{fontSize: '11px', color: '#64748b', marginTop: '5px'}}>
                  {setupForm.priorityMode === 'day_group_order'
                    ? 'Nhóm STT sau chỉ bắt đầu khi nhóm trước đã hoàn tất. Nhóm chưa chọn sẽ tự đưa vào ngày cuối.'
                    : 'Có thể chọn cùng một nhóm ở nhiều ngày để hệ thống phân bổ. Chọn Kata - 12-14 tuổi ở Ngày 1 để đưa nhóm này lên ngày đầu. Nhóm chưa chọn sẽ tự đưa vào ngày cuối.'}
                </div>
              </div>
            )}

            {setupForm.priorityMode === "custom_order" && (
              <div style={{marginTop:'12px'}}>
                <div className="input-label">Sắp xếp hạng mục theo ý muốn</div>
                <div style={{maxHeight:'260px',overflowY:'auto',border:'1px solid #e2e8f0',borderRadius:'8px'}}>
                  {(setupForm.customPriorityOrder || categories.map((category) => category.id))
                    .map((categoryId) => categories.find((category) => category.id === categoryId))
                    .filter(Boolean)
                    .map((category, index, orderedCategories) => (
                      <div key={category.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'7px 9px',borderBottom:'1px solid #f1f5f9'}}>
                        <span style={{minWidth:'24px',fontWeight:700,color:'#64748b'}}>{index + 1}</span>
                        <span style={{flex:1,fontSize:'12px',fontWeight:600}}>{category.name}</span>
                        <button type="button" className="btn btn-sm" disabled={index === 0}
                          onClick={() => setSetupForm((prev) => {
                            const order = [...(prev.customPriorityOrder || categories.map((item) => item.id))];
                            [order[index - 1], order[index]] = [order[index], order[index - 1]];
                            return {...prev, customPriorityOrder: order};
                          })}>↑</button>
                        <button type="button" className="btn btn-sm" disabled={index === orderedCategories.length - 1}
                          onClick={() => setSetupForm((prev) => {
                            const order = [...(prev.customPriorityOrder || categories.map((item) => item.id))];
                            [order[index], order[index + 1]] = [order[index + 1], order[index]];
                            return {...prev, customPriorityOrder: order};
                          })}>↓</button>
                      </div>
                    ))}
                </div>
              </div>
            )}

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
                      <span style={{color:'#94a3b8'}}>
                        {' '}({(setupForm.startSessionByDay?.[i] || 'morning') === 'afternoon'
                          ? `${setupForm.startTimeByDay?.[i] || setupForm.afternoonStart}-${setupForm.afternoonEnd}`
                          : `${setupForm.startTimeByDay?.[i] || setupForm.morningStart}-${setupForm.morningEnd}, ${setupForm.afternoonStart}-${setupForm.afternoonEnd}`})
                      </span>
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

        <Modal
          isOpen={showVerticalMatExportModal}
          onClose={() => { if (!exportingVerticalMat) setShowVerticalMatExportModal(false); }}
          title="Xuất PDF Dọc Theo Thảm"
          size="large"
        >
          <div style={{color:'#475569',fontSize:'14px',marginBottom:'16px'}}>
            Chọn cách tạo file. Cả hai chế độ đều dùng mẫu A4 dọc và sắp xếp lịch theo ngày, giờ của từng thảm.
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>
            <button
              type="button"
              disabled={exportingVerticalMat}
              onClick={() => handleExportVerticalByMat(false)}
              style={{
                padding:'20px',textAlign:'left',border:'2px solid #bfdbfe',borderRadius:'14px',
                background:'linear-gradient(135deg,#eff6ff,#fff)',cursor:exportingVerticalMat?'wait':'pointer',
                color:'#1e3a8a'
              }}
            >
              <div style={{fontSize:'28px',marginBottom:'8px'}}>📚</div>
              <div style={{fontSize:'17px',fontWeight:900,marginBottom:'6px'}}>Xuất Full — 1 file</div>
              <div style={{fontSize:'13px',lineHeight:1.5,color:'#64748b'}}>
                Gộp toàn bộ các thảm vào một file PDF. Mỗi thảm bắt đầu ở một nhóm trang riêng.
              </div>
              <div style={{marginTop:'10px',fontSize:'11px',fontWeight:700,color:'#2563eb',fontFamily:'monospace'}}>
                LichThiDau_Doc_TheoTham_....pdf
              </div>
            </button>

            <button
              type="button"
              disabled={exportingVerticalMat}
              onClick={() => handleExportVerticalByMat(true)}
              style={{
                padding:'20px',textAlign:'left',border:'2px solid #ddd6fe',borderRadius:'14px',
                background:'linear-gradient(135deg,#f5f3ff,#fff)',cursor:exportingVerticalMat?'wait':'pointer',
                color:'#5b21b6'
              }}
            >
              <div style={{fontSize:'28px',marginBottom:'8px'}}>🥋</div>
              <div style={{fontSize:'17px',fontWeight:900,marginBottom:'6px'}}>Từng thảm — từng file</div>
              <div style={{fontSize:'13px',lineHeight:1.5,color:'#64748b'}}>
                Tạo riêng một file PDF cho mỗi thảm đang có lịch thi đấu, thuận tiện gửi và in riêng.
              </div>
              <div style={{marginTop:'10px',fontSize:'11px',fontWeight:700,color:'#7c3aed',fontFamily:'monospace'}}>
                LichThiDau_Doc_Tham_1_....pdf
              </div>
            </button>
          </div>

          {exportingVerticalMat && (
            <div style={{marginTop:'16px',padding:'13px 15px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'10px'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:'12px',fontSize:'13px',fontWeight:700,color:'#475569',marginBottom:'7px'}}>
                <span>{verticalMatExportProgress.label}</span>
                <span>{verticalMatExportProgress.percent}%</span>
              </div>
              <div style={{height:'8px',background:'#e2e8f0',borderRadius:'5px',overflow:'hidden'}}>
                <div style={{height:'100%',width:`${verticalMatExportProgress.percent}%`,background:'#7c3aed',transition:'width .2s ease'}} />
              </div>
            </div>
          )}

          <div className="modal-actions" style={{marginTop:'18px'}}>
            <button
              className="btn btn-secondary"
              disabled={exportingVerticalMat}
              onClick={() => setShowVerticalMatExportModal(false)}
            >
              Đóng
            </button>
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
