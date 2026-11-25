import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./common/Modal";
import { useToast } from "./common/Toast";
import {
  SMART_SCHEDULE_TEMPLATES,
  analyzeTournamentForScheduling,
  checkTemplateCompatibility,
  computePreSolveSummary,
  computeTournamentFingerprint,
  deleteCustomScheduleTemplate,
  filterMeaningfulPlans,
  loadCustomScheduleTemplates,
  saveCustomScheduleTemplate,
  solveSmartSchedule,
  validateSmartScheduleConfig,
} from "../services/smartScheduleService";
import {
  getCategoryAgeGroupInfo,
  getEstimatedParticipantCount,
  parseKarateCategory,
} from "../services/scheduleService";
import {
  KSPORT_SMART_API_URL,
  createSmartScheduleUpgradeOrder,
  generateMachineId,
  getCurrentLicense,
  getPaymentOrderStatus,
  hasSmartSchedulePro,
  revalidateLicenseWithServer,
} from "../services/licenseService";
import {
  WizardStep1Analysis,
  WizardStep2Time,
  WizardStep3Durations,
} from "./SmartScheduleWizard/WizardSteps1to3";
import {
  WizardStep4Mats,
  WizardStep5KarateRules,
  WizardStep6Strategy,
} from "./SmartScheduleWizard/WizardSteps4to6";
import { WizardStep7Results } from "./SmartScheduleWizard/WizardStep7Results";
import {
  WIZARD_STEP_GUIDES,
  buildQuickTourSteps,
  buildResultTourSteps,
  buildWizardTourSteps,
  loadOnboardingState,
  resetOnboardingState,
  saveOnboardingState,
} from "../services/onboardingService";
import { HelpTip } from "./onboarding/ContextualHelp";
import GuidedTourOverlay from "./onboarding/GuidedTourOverlay";
import { HelpCenterModal, WelcomeOnboardingModal } from "./onboarding/SmartScheduleOnboardingModals";

const WIZARD_STEPS = [
  { num: 1, label: "1. Dữ liệu" },
  { num: 2, label: "2. Thời gian" },
  { num: 3, label: "3. Thời lượng" },
  { num: 4, label: "4. Thảm" },
  { num: 5, label: "5. Chuyên môn" },
  { num: 6, label: "6. Chiến lược" },
  { num: 7, label: "7. Kết quả" },
];

function createEmptyMatRules(matCount) {
  const r = {};
  for (let m = 1; m <= matCount; m += 1) r[m] = {};
  return r;
}

export default function SmartScheduleProModal({
  isOpen,
  onClose,
  categories,
  existingSchedule,
  tournamentDays,
  selectedDate,
  matCount,
  sessionConfig,
  customEvents,
  scheduleConfig,
  matchDurations,
  onApplySchedule,
}) {
  const { toast } = useToast();
  const abortRef = useRef(null);

  const [license, setLicense] = useState(() => getCurrentLicense());
  const [proUnlocked, setProUnlocked] = useState(() => hasSmartSchedulePro());

  const [mode, setMode] = useState("quick"); // "quick" | "wizard"
  const [wizardStep, setWizardStep] = useState(1);

  const [scope, setScope] = useState("all");
  const [localSessionConfig, setLocalSessionConfig] = useState(() => ({
    morningStart: sessionConfig?.morningStart || "08:00",
    morningEnd: sessionConfig?.morningEnd || "11:30",
    afternoonStart: sessionConfig?.afternoonStart || "13:30",
    afternoonEnd: sessionConfig?.afternoonEnd || "17:30",
  }));
  const [daySessionConfigs, setDaySessionConfigs] = useState({});
  const [localCustomEvents, setLocalCustomEvents] = useState(() => (Array.isArray(customEvents) ? customEvents : []));
  const [localDurations, setLocalDurations] = useState(() => matchDurations || {});
  const [categoryDurationOverrides, setCategoryDurationOverrides] = useState({});
  const [categoryDaySessionRules, setCategoryDaySessionRules] = useState({});

  const [karateOrderMode, setKarateOrderMode] = useState("kata_then_kumite");
  const [kataMode, setKataMode] = useState("per_mat_kata_first");
  const [intraAgeMode, setIntraAgeMode] = useState("preferred");
  const [absoluteLast, setAbsoluteLast] = useState("preferred");
  const [strictTargetEndTime, setStrictTargetEndTime] = useState(false);
  const [targetEndTime, setTargetEndTime] = useState(sessionConfig?.targetEndTime || sessionConfig?.afternoonEnd || "16:00");
  const [maximumEndTime, setMaximumEndTime] = useState(sessionConfig?.maximumEndTime || sessionConfig?.afternoonEnd || "18:00");
  const [minRestMinutes, setMinRestMinutes] = useState(Number(scheduleConfig?.athleteRestMinutes) || 15);
  const [transitionMinutes, setTransitionMinutes] = useState(0);
  const [maxTimeSeconds, setMaxTimeSeconds] = useState(30);
  const [keepPinned, setKeepPinned] = useState(true);
  const [skipEmptyCategories] = useState(true);
  const [perMatRules, setPerMatRules] = useState(() => createEmptyMatRules(matCount));
  const [matOperatingWindows, setMatOperatingWindows] = useState({});
  const [selectedStrategies, setSelectedStrategies] = useState([
    "balanced_time",
    "earliest_finish",
    "organization_priority",
  ]);

  // Templates & Draft
  const [customTemplates, setCustomTemplates] = useState(() => loadCustomScheduleTemplates());
  const [templateNotice, setTemplateNotice] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState("");

  const [solving, setSolving] = useState(false);
  const [solveResult, setSolveResult] = useState(null);
  const [solveFingerprint, setSolveFingerprint] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [solveError, setSolveError] = useState("");

  // In-page 100K Upgrade state
  const [showUpgradeBox, setShowUpgradeBox] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [upgradeOrder, setUpgradeOrder] = useState(null);
  const [checkingOrder, setCheckingOrder] = useState(false);

  // Onboarding & Guided Tour state
  const [onboarding, setOnboarding] = useState(() => loadOnboardingState());
  const [showWelcome, setShowWelcome] = useState(false);
  const [showHelpCenter, setShowHelpCenter] = useState(false);
  const [activeTourType, setActiveTourType] = useState(null); // "quick" | "wizard" | "result" | null
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [showStepGuide, setShowStepGuide] = useState(false);

  const syncLicenseState = () => {
    setLicense(getCurrentLicense());
    setProUnlocked(hasSmartSchedulePro());
  };

  useEffect(() => {
    setPerMatRules((prev) => {
      const next = createEmptyMatRules(matCount);
      for (let m = 1; m <= matCount; m += 1) {
        if (prev[m]) next[m] = prev[m];
      }
      return next;
    });
  }, [matCount]);

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;
    if (!isOpen) return;
    if (justOpened) {
      syncLicenseState();
      setSolveError("");
      setLocalCustomEvents(Array.isArray(customEvents) ? customEvents : []);
      if (matchDurations) setLocalDurations(matchDurations);
      setLocalSessionConfig({
        morningStart: sessionConfig?.morningStart || "08:00",
        morningEnd: sessionConfig?.morningEnd || "11:30",
        afternoonStart: sessionConfig?.afternoonStart || "13:30",
        afternoonEnd: sessionConfig?.afternoonEnd || "17:30",
      });
      const st = loadOnboardingState();
      setOnboarding(st);
      if (!st.dontShowWelcome && !st.completedTours?.quick && !st.completedTours?.wizard) {
        setShowWelcome(true);
      }
    }
    const onLicChange = () => syncLicenseState();
    window.addEventListener("licenseChanged", onLicChange);
    return () => {
      window.removeEventListener("licenseChanged", onLicChange);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [isOpen, customEvents, matchDurations, sessionConfig]);

  // Auto-poll payment order status every 4s while QR is visible
  useEffect(() => {
    if (!isOpen || !upgradeOrder?.order?.order_code || proUnlocked) return;
    const machineId = license?.machineId || generateMachineId();
    const timer = setInterval(async () => {
      try {
        const res = await getPaymentOrderStatus(
          upgradeOrder.order.order_code,
          machineId,
          KSPORT_SMART_API_URL
        );
        if (res?.success && (res.order?.status === "paid" || res.order?.smart_schedule_enabled)) {
          await revalidateLicenseWithServer();
          syncLicenseState();
          setUpgradeOrder(null);
          setShowUpgradeBox(false);
          toast.success("🎉 Đã mở khóa Smart Schedule Pro thành công!");
        }
      } catch {
        // Silent retry
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [isOpen, upgradeOrder, proUnlocked, license, toast]);

  const targetDays = useMemo(
    () => (scope === "day" && selectedDate ? [selectedDate] : tournamentDays),
    [scope, selectedDate, tournamentDays]
  );

  const analysis = useMemo(
    () =>
      analyzeTournamentForScheduling({
        categories,
        existingSchedule,
        durations: localDurations,
        categoryDurationOverrides,
        skipEmptyCategories,
      }),
    [categories, existingSchedule, localDurations, categoryDurationOverrides, skipEmptyCategories]
  );

  const preSolveSummary = useMemo(
    () =>
      computePreSolveSummary({
        categories,
        durations: localDurations,
        categoryDurationOverrides,
        skipEmptyCategories,
        tournamentDays: targetDays,
        matCount,
        sessionConfig: { ...localSessionConfig, targetEndTime, maximumEndTime, afternoonEnd: maximumEndTime },
        daySessionConfigs,
        customEvents: localCustomEvents,
        matOperatingWindows,
        transitionMinutes,
        strictTargetEndTime,
      }),
    [
      categories,
      localDurations,
      categoryDurationOverrides,
      skipEmptyCategories,
      targetDays,
      matCount,
      localSessionConfig,
      targetEndTime,
      maximumEndTime,
      daySessionConfigs,
      localCustomEvents,
      matOperatingWindows,
      transitionMinutes,
      strictTargetEndTime,
    ]
  );

  const ageGroupChips = useMemo(() => {
    const map = new Map();
    categories.forEach((cat) => {
      if (skipEmptyCategories && getEstimatedParticipantCount(cat) === 0) return;
      const info = getCategoryAgeGroupInfo(cat);
      if (!map.has(info.key)) map.set(info.key, info);
    });
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [categories, skipEmptyCategories]);

  const categoryMap = useMemo(() => {
    const map = new Map();
    categories.forEach((c) => map.set(c.id, { ...c, parsed: parseKarateCategory(c) }));
    return map;
  }, [categories]);

  const preflightCheck = useMemo(
    () =>
      validateSmartScheduleConfig({
        categories,
        matCount,
        perMatRules,
        durations: localDurations,
        scheduleConfig,
        tournamentDays: targetDays,
      }),
    [categories, matCount, perMatRules, localDurations, scheduleConfig, targetDays]
  );

  const applyQuickMatPreset = (preset) => {
    const next = createEmptyMatRules(matCount);
    if (preset === "kata_kumite_split" && matCount >= 2) {
      const kumiteOnlyStart = matCount === 3 ? 3 : Math.max(2, Math.ceil(matCount / 2) + 1);
      for (let m = kumiteOnlyStart; m <= matCount; m += 1) {
        next[m] = { kata: "forbidden", kumite: "required" };
      }
    } else if (preset === "separate_kata_kumite" && matCount >= 2) {
      next[1] = { kata: "required", kumite: "forbidden" };
      for (let m = 2; m <= matCount; m += 1) {
        next[m] = { kata: "forbidden", kumite: "required" };
      }
    } else if (preset === "by_gender" && matCount >= 2) {
      for (let m = 1; m <= matCount; m += 1) {
        next[m] = m % 2 === 1 ? { male: "required", female: "forbidden" } : { female: "required", male: "forbidden" };
      }
    } else if (preset === "by_event_type" && matCount >= 2) {
      next[matCount] = { team: "required", individual: "forbidden" };
    } else if (preset === "by_age" && ageGroupChips.length > 0) {
      ageGroupChips.forEach((ag, idx) => {
        const targetMat = Math.min(matCount, Math.floor((idx * matCount) / ageGroupChips.length) + 1);
        next[targetMat][`age:${ag.key}`] = "required";
      });
    }
    setPerMatRules(next);
  };

  const handleApplyTemplate = (tpl) => {
    if (!tpl?.config) return;
    const compat = checkTemplateCompatibility(tpl, { matCount, tournamentDays: targetDays, categories });
    setTemplateNotice(compat.warnings);
    const c = tpl.config;
    if (c.kataMode) setKataMode(c.kataMode);
    if (c.karateOrderMode) setKarateOrderMode(c.karateOrderMode);
    if (c.intraAgeMode) setIntraAgeMode(c.intraAgeMode);
    if (c.minRestMinutes !== undefined) setMinRestMinutes(c.minRestMinutes);
    if (c.transitionMinutes !== undefined) setTransitionMinutes(c.transitionMinutes);
    if (c.maxTimeSeconds !== undefined) setMaxTimeSeconds(c.maxTimeSeconds);
    if (c.matPreset) applyQuickMatPreset(c.matPreset);
    if (c.perMatRules) setPerMatRules(c.perMatRules);
    if (Array.isArray(c.selectedStrategies)) setSelectedStrategies(c.selectedStrategies);
    toast.success(`Đã áp dụng mẫu "${tpl.name}".`);
  };

  const handleSaveTemplate = () => {
    const name = newTemplateName.trim();
    if (!name) return;
    const next = saveCustomScheduleTemplate({
      name,
      description: `Tùy chỉnh (${matCount} thảm, nghỉ ${minRestMinutes}p)`,
      config: {
        kataMode,
        karateOrderMode,
        intraAgeMode,
        minRestMinutes,
        transitionMinutes,
        maxTimeSeconds,
        perMatRules,
        selectedStrategies,
      },
    });
    setCustomTemplates(next);
    setNewTemplateName("");
    toast.success(`Đã lưu mẫu "${name}".`);
  };

  const handleSaveDraft = () => {
    try {
      const fp = computeTournamentFingerprint({ categories, customEvents: localCustomEvents, matCount, sessionConfig: localSessionConfig });
      localStorage.setItem(
        `ksport_smart_wizard_draft_${fp}`,
        JSON.stringify({
          wizardStep,
          localSessionConfig,
          daySessionConfigs,
          targetEndTime,
          maximumEndTime,
          strictTargetEndTime,
          minRestMinutes,
          transitionMinutes,
          kataMode,
          karateOrderMode,
          intraAgeMode,
          absoluteLast,
          perMatRules,
          selectedStrategies,
        })
      );
      toast.success("Đã lưu bản nháp cấu hình.");
    } catch {
      toast.info("Không thể lưu nháp vào bộ nhớ trình duyệt.");
    }
  };

  const hasBaseLicense = Boolean(license?.active && !license?.isTrial && license?.licenseKey);

  const handleCancelSolve = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setSolving(false);
    toast.info("Đã hủy quá trình xếp lịch.");
  };

  const handleRunSolver = async () => {
    if (!hasBaseLicense) {
      setShowUpgradeBox(true);
      setSolveError("Bạn cần kích hoạt License K-SPORT trước khi chạy Smart Schedule Pro.");
      return;
    }
    if (!preflightCheck.valid) {
      setSolveError(preflightCheck.errors[0]);
      return;
    }
    if (!targetDays.length || !categories.length) {
      toast.info("Chưa có nội dung hoặc ngày thi đấu.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const effectiveSession = { ...localSessionConfig, targetEndTime, maximumEndTime, afternoonEnd: maximumEndTime };
    const currentFp = computeTournamentFingerprint({
      categories,
      customEvents: localCustomEvents,
      matCount,
      sessionConfig: effectiveSession,
    });
    setSolving(true);
    setSolveError("");
    setSolveResult(null);
    setSolveFingerprint(currentFp);

    try {
      const res = await solveSmartSchedule({
        categories,
        existingSchedule,
        tournamentDays: targetDays,
        matCount,
        sessionConfig: effectiveSession,
        daySessionConfigs,
        customEvents: localCustomEvents,
        scheduleConfig,
        durations: localDurations,
        categoryDurationOverrides,
        categoryDaySessionRules,
        minRestMinutes,
        transitionMinutes,
        keepPinned,
        karateOrderMode,
        kataMode,
        intraAgeMode,
        absoluteLast,
        strictTargetEndTime,
        perMatRules,
        matOperatingWindows,
        skipEmptyCategories,
        multiPlan: true,
        selectedStrategies,
        previewOnly: !proUnlocked,
        maxTimeSeconds,
        signal: controller.signal,
      });

      setSolveResult(res);
      const distinct = filterMeaningfulPlans(res?.plans || []);
      if (distinct.length > 0) {
        setSelectedPlanId(distinct[0].id);
        if (mode === "wizard") setWizardStep(7);
        const st = loadOnboardingState();
        if (!st.firstResultSeen) {
          const next = saveOnboardingState({ firstResultSeen: true });
          setOnboarding(next);
          if (!activeTourType) {
            setTimeout(() => {
              setActiveTourType("result");
              setTourStepIndex(0);
            }, 250);
          }
        }
      }
      if (!res?.success || distinct.length === 0) {
        setSolveError(res?.message || "Không tìm được lịch hợp lệ với các ràng buộc hiện tại (không có phương án trả về).");
      }
      if (res?.locked) setShowUpgradeBox(true);
    } catch (err) {
      if (err.name === "AbortError") {
        if (abortRef.current) setSolveError("Quá trình xếp lịch đã bị hủy hoặc gián đoạn kết nối.");
        return;
      }
      setSolveError(err.message || "Không thể kết nối máy chủ xếp lịch K-SPORT.");
    } finally {
      setSolving(false);
      abortRef.current = null;
    }
  };

  const handleCreateUpgradeOrder = async () => {
    setCreatingOrder(true);
    try {
      const res = await createSmartScheduleUpgradeOrder();
      if (!res?.success) {
        toast.error(res?.message || "Không thể tạo đơn nâng cấp 100K.");
        return;
      }
      setUpgradeOrder(res);
      toast.info("Đã tạo mã VietQR 100.000đ.");
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleManualCheckActivation = async () => {
    setCheckingOrder(true);
    try {
      if (upgradeOrder?.order?.order_code) {
        const machineId = license?.machineId || generateMachineId();
        await getPaymentOrderStatus(upgradeOrder.order.order_code, machineId, KSPORT_SMART_API_URL);
      }
      await revalidateLicenseWithServer();
      const unlocked = hasSmartSchedulePro();
      syncLicenseState();
      if (unlocked) {
        setUpgradeOrder(null);
        setShowUpgradeBox(false);
        toast.success("🎉 Đã kích hoạt Smart Schedule Pro!");
        if (solveResult?.locked) setTimeout(() => { void handleRunSolver(); }, 100);
      } else {
        toast.info("Đơn chưa được duyệt xong. Vui lòng đợi vài giây rồi thử lại.");
      }
    } finally {
      setCheckingOrder(false);
    }
  };

  const distinctPlans = useMemo(() => filterMeaningfulPlans(solveResult?.plans || []), [solveResult]);
  const selectedPlan = useMemo(
    () => distinctPlans.find((p) => p.id === selectedPlanId) || distinctPlans[0] || null,
    [distinctPlans, selectedPlanId]
  );

  const handleApply = () => {
    if (!selectedPlan?.schedule || solveResult?.locked) {
      setShowUpgradeBox(true);
      return;
    }
    const effectiveSession = { ...localSessionConfig, targetEndTime, maximumEndTime, afternoonEnd: maximumEndTime };
    const latestFp = computeTournamentFingerprint({
      categories,
      customEvents: localCustomEvents,
      matCount,
      sessionConfig: effectiveSession,
    });
    if (solveFingerprint && latestFp !== solveFingerprint) {
      toast.error("Dữ liệu giải đấu đã thay đổi trong lúc tối ưu. Vui lòng chạy lại trước khi áp dụng!");
      return;
    }
    if (!selectedPlan.validation?.valid) {
      toast.error("Không thể áp dụng lịch có vi phạm ràng buộc bắt buộc.");
      return;
    }
    const merged = scope === "day" && selectedDate
      ? { ...existingSchedule, ...selectedPlan.schedule }
      : selectedPlan.schedule;
    onApplySchedule(merged, selectedPlan, solveResult);
    onClose();
  };

  const activeTourSteps = useMemo(() => {
    if (activeTourType === "quick") {
      return buildQuickTourSteps({
        matCount,
        tournamentDays: targetDays,
        hasResult: distinctPlans.length > 0,
        hasTemplates: true,
        hasWarnings: analysis.missingWarnings.length > 0,
      });
    }
    if (activeTourType === "wizard") {
      return buildWizardTourSteps({
        matCount,
        tournamentDays: targetDays,
        hasResult: distinctPlans.length > 0,
      });
    }
    if (activeTourType === "result") {
      return buildResultTourSteps();
    }
    return [];
  }, [activeTourType, matCount, targetDays, distinctPlans.length, analysis.missingWarnings.length]);

  const handlePrepareTourStep = (step) => {
    if (step?.mode && step.mode !== mode) setMode(step.mode);
    if (step?.wizardStep && step.wizardStep !== wizardStep) setWizardStep(step.wizardStep);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="large"
      title="⚡ Smart Schedule Pro — Trợ lý xếp lịch thi đấu Karate thông minh"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "81vh", overflowY: "auto", paddingRight: "4px" }}>
        {/* Top Bar: Mode Switcher + License Status + Help Center */}
        <div data-tour-id="tour-mode-switcher" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", padding: "8px 12px", borderRadius: "9px", background: proUnlocked ? "#eff6ff" : "#fff7ed", border: `1px solid ${proUnlocked ? "#93c5fd" : "#fdba74"}` }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              data-tour-id="tour-mode-quick-btn"
              type="button"
              className={`btn btn-sm ${mode === "quick" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMode("quick")}
            >
              ⚡ Xếp lịch nhanh
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === "wizard" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMode("wizard")}
            >
              🧭 Xếp lịch nâng cao (7 bước)
            </button>
            <span style={{ fontSize: "11.5px", fontWeight: 600, color: proUnlocked ? "#1e40af" : "#9a3412", marginLeft: "4px" }}>
              {proUnlocked ? "✅ Đã mở khóa" : hasBaseLicense ? "🔒 Bản dùng thử so sánh (+100K để áp dụng)" : "⚠️ Chưa có License"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "11.5px", fontWeight: 700 }} onClick={() => setShowHelpCenter(true)}>
              📖 Hướng dẫn sử dụng
            </button>
            {!proUnlocked && hasBaseLicense && (
              <button type="button" className="btn btn-sm" style={{ background: "#ea580c", color: "#fff", border: "none", fontWeight: 700 }} onClick={() => setShowUpgradeBox((v) => !v)}>
                💳 Nâng cấp ngay (100K)
              </button>
            )}
          </div>
        </div>

        {/* Starter & Custom Templates Bar (Section 10) */}
        <div data-tour-id="tour-templates-bar" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "8px 10px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>📂 Mẫu cấu hình khởi đầu (tùy chọn):</span>
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              {SMART_SCHEDULE_TEMPLATES.map((tpl) => (
                <button key={tpl.id} type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "10.5px", padding: "2px 7px" }} title={tpl.description} onClick={() => handleApplyTemplate(tpl)}>
                  {tpl.name}
                </button>
              ))}
              {customTemplates.map((tpl) => (
                <span key={tpl.id} style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "10.5px", padding: "2px 7px", borderColor: "#2563eb", color: "#1d4ed8" }} onClick={() => handleApplyTemplate(tpl)}>
                    ★ {tpl.name}
                  </button>
                  <button type="button" onClick={() => setCustomTemplates(deleteCustomScheduleTemplate(tpl.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontSize: "11px", fontWeight: 800 }}>×</button>
                </span>
              ))}
            </div>
          </div>
          {mode === "wizard" && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                className="input"
                placeholder="Tên mẫu mới để lưu dùng lại..."
                style={{ fontSize: "11px", padding: "3px 8px", width: "210px" }}
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
              />
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "10.5px", padding: "3px 8px" }} disabled={!newTemplateName.trim()} onClick={handleSaveTemplate}>
                💾 Lưu mẫu
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "10.5px", padding: "3px 8px" }} onClick={handleSaveDraft}>
                📝 Lưu nháp
              </button>
            </div>
          )}
          {templateNotice.length > 0 && (
            <div style={{ fontSize: "11px", color: "#92400e" }}>
              ⚠️ {templateNotice.join(" · ")}
            </div>
          )}
        </div>

        {/* MODE A: QUICK SCHEDULING */}
        {mode === "quick" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div data-tour-id="tour-quick-summary" style={{ padding: "10px 12px", borderRadius: "8px", background: "#fff", border: "1px solid #cbd5e1", fontSize: "12px" }}>
              <div style={{ fontWeight: 700, marginBottom: "6px", color: "#0f172a" }}>
                📋 Tóm tắt cấu hình giải hiện tại ({analysis.activeCategories} nội dung · {analysis.totalRemainingMatches} trận{analysis.isMatchCountEstimated ? " ước tính" : ""} · {preSolveSummary.totalWorkloadMinutes} phút):
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "8px" }}>
                <label data-tour-id="tour-quick-target-end" style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span>🎯 Giờ kết thúc mục tiêu <HelpTip title="Giờ kết thúc mục tiêu" description="Thời điểm bạn mong muốn giải đấu hoàn thành." example="Đặt 16:00 để ưu tiên xếp xong trước 16:00." /></span>
                  <input type="time" className="input" value={targetEndTime} onChange={(e) => setTargetEndTime(e.target.value)} />
                </label>
                <label data-tour-id="tour-quick-max-end" style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span>🛑 Giờ kết thúc tối đa <HelpTip title="Giờ kết thúc tối đa" description="Giới hạn muộn nhất cho phép nếu không kịp giờ mục tiêu." example="Đặt 18:00 để không bao giờ xếp quá 18:00." /></span>
                  <input type="time" className="input" value={maximumEndTime} onChange={(e) => setMaximumEndTime(e.target.value)} />
                </label>
                <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span>📅 Phạm vi ngày <HelpTip title="Phạm vi tối ưu" description="Chọn xếp toàn bộ các ngày của giải hoặc chỉ 1 ngày đang xem." /></span>
                  <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                    <option value="all">Toàn bộ giải ({tournamentDays.length} ngày)</option>
                    {selectedDate && <option value="day">Chỉ ngày {selectedDate}</option>}
                  </select>
                </label>
                <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span>⏱️ Thời gian tối ưu <HelpTip title="Thời gian tìm phương án" description="Thời gian càng dài, hệ thống tìm được lịch càng đều và gọn hơn." example="Giải 70 nội dung nên chọn 30 giây." /></span>
                  <select className="input" value={maxTimeSeconds} onChange={(e) => setMaxTimeSeconds(Number(e.target.value))}>
                    <option value={10}>Nhanh (10 giây)</option>
                    <option value={30}>Tiêu chuẩn (30 giây)</option>
                    <option value={45}>Chuyên sâu (45 giây)</option>
                  </select>
                </label>
              </div>
              <div style={{ marginTop: "8px", fontSize: "11px", color: "#475569", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <span>🏟️ {matCount} thảm · Sức chứa {preSolveSummary.effectiveCapacityMinutes}p</span>
                <span data-tour-id="tour-quick-events-link">🎗️ {localCustomEvents.length} sự kiện khóa</span>
                <button
                  type="button"
                  onClick={() => { setMode("wizard"); setWizardStep(2); }}
                  style={{ background: "none", border: "none", color: "#2563eb", fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline", fontSize: "11px" }}
                >
                  + Thêm/sửa sự kiện
                </button>
                <span>📌 {analysis.pinnedCount} nội dung ghim tay</span>
                <span>⏱️ Nghỉ VĐV {minRestMinutes}p</span>
                <label data-tour-id="tour-quick-strict-check" style={{ display: "inline-flex", alignItems: "center", gap: "4px", cursor: "pointer", fontWeight: 600 }}>
                  <input type="checkbox" checked={strictTargetEndTime} onChange={(e) => setStrictTargetEndTime(e.target.checked)} />
                  Bắt buộc xong trước giờ mục tiêu
                  <HelpTip title="Deadline bắt buộc" description="Khi tick, hệ thống chỉ chấp nhận lịch xong trước hoặc đúng giờ mục tiêu. Nếu bỏ tick, cho phép vượt nhẹ đến giờ tối đa." />
                </label>
              </div>
              {analysis.missingWarnings.length > 0 && (
                <div data-tour-id="tour-quick-warnings" style={{ marginTop: "6px", fontSize: "11px", color: "#92400e" }}>
                  ⚠️ {analysis.missingWarnings[0]}
                </div>
              )}
            </div>

            <div data-tour-id="tour-mat-allocation">
              <WizardStep4Mats
                matCount={matCount}
                perMatRules={perMatRules}
                setPerMatRules={setPerMatRules}
                ageGroupChips={ageGroupChips}
                applyQuickMatPreset={applyQuickMatPreset}
                preflightCheck={preflightCheck}
                matOperatingWindows={matOperatingWindows}
                setMatOperatingWindows={setMatOperatingWindows}
              />
            </div>
          </div>
        )}

        {/* MODE B: ADAPTIVE 7-STEP WIZARD */}
        {mode === "wizard" && (
          <div data-tour-id="tour-wizard-content" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px", flex: 1 }}>
                {WIZARD_STEPS.map((st) => {
                  const active = wizardStep === st.num;
                  const done = wizardStep > st.num;
                  return (
                    <button
                      key={st.num}
                      type="button"
                      onClick={() => setWizardStep(st.num)}
                      style={{
                        padding: "6px 4px",
                        borderRadius: "6px",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        border: `1.5px solid ${active ? "#2563eb" : done ? "#86efac" : "#e2e8f0"}`,
                        background: active ? "#2563eb" : done ? "#f0fdf4" : "#fff",
                        color: active ? "#fff" : done ? "#166534" : "#475569",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: "11px" }}
                onClick={() => setShowStepGuide((v) => !v)}
              >
                {showStepGuide ? "✕ Ẩn hướng dẫn" : "📖 Xem hướng dẫn bước này"}
              </button>
            </div>
            {showStepGuide && WIZARD_STEP_GUIDES[wizardStep] && (
              <div style={{ padding: "9px 11px", borderRadius: "8px", background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: "11.5px", color: "#1e3a8a", lineHeight: 1.45 }}>
                <div><strong>{WIZARD_STEP_GUIDES[wizardStep].title}</strong> — {WIZARD_STEP_GUIDES[wizardStep].purpose}</div>
                <div>• <strong>Vì sao cần:</strong> {WIZARD_STEP_GUIDES[wizardStep].whyNeeded}</div>
                <div>• <strong>Thao tác:</strong> {WIZARD_STEP_GUIDES[wizardStep].howTo}</div>
                <div>• <strong>Ví dụ:</strong> {WIZARD_STEP_GUIDES[wizardStep].example}</div>
                <div style={{ color: "#991b1b" }}>• <strong>Lỗi thường gặp:</strong> {WIZARD_STEP_GUIDES[wizardStep].commonMistakes}</div>
              </div>
            )}

            {wizardStep === 1 && <WizardStep1Analysis analysis={analysis} />}
            {wizardStep === 2 && (
              <WizardStep2Time
                tournamentDays={targetDays}
                matCount={matCount}
                sessionConfig={localSessionConfig}
                setSessionConfig={setLocalSessionConfig}
                daySessionConfigs={daySessionConfigs}
                setDaySessionConfigs={setDaySessionConfigs}
                targetEndTime={targetEndTime}
                setTargetEndTime={setTargetEndTime}
                maximumEndTime={maximumEndTime}
                setMaximumEndTime={setMaximumEndTime}
                strictTargetEndTime={strictTargetEndTime}
                setStrictTargetEndTime={setStrictTargetEndTime}
                localCustomEvents={localCustomEvents}
                setLocalCustomEvents={setLocalCustomEvents}
                preSolveSummary={preSolveSummary}
              />
            )}
            {wizardStep === 3 && (
              <WizardStep3Durations
                analysis={analysis}
                categories={categories}
                durations={localDurations}
                setDurations={setLocalDurations}
                categoryDurationOverrides={categoryDurationOverrides}
                setCategoryDurationOverrides={setCategoryDurationOverrides}
                minRestMinutes={minRestMinutes}
                setMinRestMinutes={setMinRestMinutes}
                transitionMinutes={transitionMinutes}
                setTransitionMinutes={setTransitionMinutes}
                preSolveSummary={preSolveSummary}
              />
            )}
            {wizardStep === 4 && (
              <WizardStep4Mats
                matCount={matCount}
                perMatRules={perMatRules}
                setPerMatRules={setPerMatRules}
                ageGroupChips={ageGroupChips}
                applyQuickMatPreset={applyQuickMatPreset}
                preflightCheck={preflightCheck}
                matOperatingWindows={matOperatingWindows}
                setMatOperatingWindows={setMatOperatingWindows}
              />
            )}
            {wizardStep === 5 && (
              <WizardStep5KarateRules
                kataMode={kataMode}
                setKataMode={setKataMode}
                karateOrderMode={karateOrderMode}
                setKarateOrderMode={setKarateOrderMode}
                intraAgeMode={intraAgeMode}
                setIntraAgeMode={setIntraAgeMode}
                absoluteLast={absoluteLast}
                setAbsoluteLast={setAbsoluteLast}
                keepPinned={keepPinned}
                setKeepPinned={setKeepPinned}
                tournamentDays={targetDays}
                categories={categories}
                categoryDaySessionRules={categoryDaySessionRules}
                setCategoryDaySessionRules={setCategoryDaySessionRules}
              />
            )}
            {wizardStep === 6 && (
              <WizardStep6Strategy
                selectedStrategies={selectedStrategies}
                setSelectedStrategies={setSelectedStrategies}
                maxTimeSeconds={maxTimeSeconds}
                setMaxTimeSeconds={setMaxTimeSeconds}
                preSolveSummary={preSolveSummary}
                preflightCheck={preflightCheck}
                strictTargetEndTime={strictTargetEndTime}
              />
            )}
          </div>
        )}

        {/* Running Indicator */}
        {solving && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", borderRadius: "8px", background: "#e0f2fe", border: "1px solid #7dd3fc", color: "#0369a1", fontSize: "13px", fontWeight: 600 }}>
            <span>⏳ Đang tính toán và kiểm tra lịch thi đấu tối ưu (tối đa {maxTimeSeconds} giây)...</span>
            <button type="button" className="btn btn-sm" style={{ background: "#dc2626", color: "#fff", border: "none" }} onClick={handleCancelSolve}>
              ❌ Hủy
            </button>
          </div>
        )}

        {/* Error / Infeasibility Diagnosis */}
        {solveError && (
          <div style={{ padding: "12px", borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: "12.5px" }}>
            <div style={{ fontWeight: 700, marginBottom: "4px" }}>
              🚨 {solveResult?.solverStatus ? `Trạng thái: ${solveResult.solverStatus}` : "Không thể xếp lịch"} — {solveError}
            </div>
            {solveResult?.diagnosis?.suspectedReasons?.length > 0 && (
              <div style={{ marginTop: "6px" }}>
                <strong>Nguyên nhân dự kiến:</strong>
                <ul style={{ margin: "4px 0 6px 18px", padding: 0 }}>
                  {solveResult.diagnosis.suspectedReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                <strong>Đề xuất điều chỉnh:</strong>
                <ul style={{ margin: "4px 0 0 18px", padding: 0, color: "#1e40af" }}>
                  {solveResult.diagnosis.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "11px" }} onClick={() => { setMode("wizard"); setWizardStep(2); }}>
                → Sửa giờ tổ chức (Bước 2)
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "11px" }} onClick={() => { setMode("wizard"); setWizardStep(3); }}>
                → Sửa thời lượng (Bước 3)
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "11px" }} onClick={() => { setMode("wizard"); setWizardStep(4); }}>
                → Sửa phân bổ thảm (Bước 4)
              </button>
              <button type="button" className="btn btn-primary btn-sm" style={{ fontSize: "11px" }} onClick={handleRunSolver}>
                🔄 Thử lại ngay
              </button>
            </div>
          </div>
        )}

        {/* Step 7 / Results Panel */}
        {(mode === "quick" || wizardStep === 7) && distinctPlans.length > 0 && (
          <div data-tour-id="tour-results-panel">
            <WizardStep7Results
              solveResult={solveResult}
              selectedPlanId={selectedPlanId}
              setSelectedPlanId={setSelectedPlanId}
              matCount={matCount}
              categoryMap={categoryMap}
              minRestMinutes={minRestMinutes}
              tournamentDays={targetDays}
              customEvents={localCustomEvents}
            />
          </div>
        )}

        {/* In-Page 100K Upgrade Box */}
        {showUpgradeBox && !proUnlocked && (
          <div style={{ padding: "12px", borderRadius: "10px", background: "#fffbeb", border: "1.5px solid #f59e0b" }}>
            <h4 style={{ margin: "0 0 6px", color: "#92400e", fontSize: "13.5px" }}>
              🔓 Mở khóa Smart Schedule Pro — Chỉ 100.000đ
            </h4>
            {!hasBaseLicense ? (
              <p style={{ margin: 0, fontSize: "12px", color: "#78350f" }}>
                Máy chưa kích hoạt License K-SPORT. Vui lòng kích hoạt hoặc mua License + Smart Schedule (+100K) trước.
              </p>
            ) : !upgradeOrder ? (
              <button type="button" className="btn btn-primary btn-sm" disabled={creatingOrder} onClick={handleCreateUpgradeOrder}>
                {creatingOrder ? "Đang tạo mã VietQR..." : "💳 Tạo mã VietQR thanh toán 100.000đ"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", background: "#fff", padding: "10px", borderRadius: "8px" }}>
                {upgradeOrder.qrUrl && <img src={upgradeOrder.qrUrl} alt="VietQR 100K" style={{ width: "130px", height: "130px", objectFit: "contain" }} />}
                <div style={{ flex: 1, minWidth: "200px", fontSize: "12px" }}>
                  <div><strong>Mã đơn:</strong> <code>{upgradeOrder.order?.order_code}</code> · <strong>100.000đ</strong></div>
                  <div style={{ color: "#64748b", margin: "4px 0 8px" }}>Quét mã để thanh toán. Hệ thống tự mở khóa sau khi Admin duyệt đơn.</div>
                  <button type="button" className="btn btn-sm" style={{ background: "#16a34a", color: "#fff", border: "none", fontWeight: 700 }} disabled={checkingOrder} onClick={handleManualCheckActivation}>
                    {checkingOrder ? "Đang kiểm tra..." : "🔄 Kiểm tra kích hoạt ngay"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", flexWrap: "wrap", borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Đóng</button>
          {mode === "wizard" && wizardStep > 1 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWizardStep((s) => Math.max(1, s - 1))}>
              ← Quay lại
            </button>
          )}
          {mode === "wizard" && wizardStep < 6 && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setWizardStep((s) => Math.min(7, s + 1))}>
              Tiếp tục →
            </button>
          )}
          {(mode === "quick" || wizardStep >= 6) && (
            <button data-tour-id="tour-run-solver-btn" type="button" className="btn btn-sm" style={{ background: "#0369a1", color: "#fff", border: "none", fontWeight: 700 }} disabled={solving || !preflightCheck.valid} onClick={handleRunSolver}>
              {solving ? "⏳ Đang xếp lịch..." : proUnlocked ? "⚡ Tự động xếp lịch tối ưu" : "🔍 Chạy thử so sánh (Miễn phí)"}
            </button>
          )}
          {selectedPlan?.schedule && !solveResult?.locked && (
            <button data-tour-id="tour-apply-btn" type="button" className="btn btn-sm" style={{ background: "#16a34a", color: "#fff", border: "none", fontWeight: 700 }} disabled={!selectedPlan.validation?.valid} onClick={handleApply}>
              ✅ Áp dụng phương án này
            </button>
          )}
        </div>
      </div>

      <WelcomeOnboardingModal
        isOpen={showWelcome}
        onStartTour={(dontShow) => {
          setShowWelcome(false);
          if (dontShow) setOnboarding(saveOnboardingState({ dontShowWelcome: true }));
          setActiveTourType(mode === "wizard" ? "wizard" : "quick");
          setTourStepIndex(0);
        }}
        onSkip={() => setShowWelcome(false)}
        onDontShowAgain={() => {
          setShowWelcome(false);
          setOnboarding(saveOnboardingState({ dontShowWelcome: true }));
        }}
      />

      <HelpCenterModal
        isOpen={showHelpCenter}
        onClose={() => setShowHelpCenter(false)}
        matCount={matCount}
        ageGroupChips={ageGroupChips}
        hasInProgressTour={Boolean(onboarding.inProgressTour)}
        hasResult={distinctPlans.length > 0}
        onResumeTour={() => {
          if (onboarding.inProgressTour) {
            setActiveTourType(onboarding.inProgressTour.type);
            setTourStepIndex(onboarding.inProgressTour.stepIndex || 0);
          }
        }}
        onStartQuickTour={() => {
          setMode("quick");
          setActiveTourType("quick");
          setTourStepIndex(0);
        }}
        onStartWizardTour={() => {
          setMode("wizard");
          setWizardStep(1);
          setActiveTourType("wizard");
          setTourStepIndex(0);
        }}
        onStartResultTour={() => {
          if (mode === "wizard") setWizardStep(7);
          setActiveTourType("result");
          setTourStepIndex(0);
        }}
        onResetOnboarding={() => {
          setOnboarding(resetOnboardingState());
          toast.info("Đã đặt lại trạng thái hướng dẫn.");
        }}
      />

      <GuidedTourOverlay
        isOpen={Boolean(activeTourType) && activeTourSteps.length > 0}
        steps={activeTourSteps}
        stepIndex={tourStepIndex}
        onStepChange={setTourStepIndex}
        onPrepareStep={handlePrepareTourStep}
        onSkip={(idx) => {
          if (activeTourType) {
            setOnboarding(saveOnboardingState({ inProgressTour: { type: activeTourType, stepIndex: idx } }));
          }
          setActiveTourType(null);
        }}
        onFinish={() => {
          if (activeTourType) {
            setOnboarding(
              saveOnboardingState({
                completedTours: { ...(onboarding.completedTours || {}), [activeTourType]: true },
                inProgressTour: null,
              })
            );
          }
          setActiveTourType(null);
          toast.success("🎓 Đã hoàn thành hướng dẫn!");
        }}
      />
    </Modal>
  );
}
