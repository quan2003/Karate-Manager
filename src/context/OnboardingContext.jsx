/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/set-state-in-effect */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useTournament } from "./TournamentContext";

const OnboardingContext = createContext(null);

// ─────────────────────────────────────────────────────────────
// STEP DEFINITIONS
// Each step has a `getRoute(context)` function that is called
// at click-time with live data: { tournaments, currentTournamentId,
// firstCategoryId, firstBracketCategoryId }
// Returns { path, hint } or null if navigation can't resolve.
// ─────────────────────────────────────────────────────────────
export const CHECKLIST_STEPS = [
  // ── Group 1: Thiết lập ──────────────────────────────────────
  {
    id: "create_tournament",
    group: 1,
    label: "Tạo giải đấu",
    description: "Nhập tên, ngày giờ, địa điểm giải đấu",
    icon: "🏆",
    actionLabel: "Bấm 'Tạo giải đấu mới' ở góc trên bên phải",
    getRoute: () => ({
      path: "/admin",
      hint: "create_tournament",
    }),
  },
  {
    id: "create_category",
    group: 1,
    label: "Tạo hạng mục",
    description: "Chia lứa tuổi, cân nặng (Kata / Kumite)",
    icon: "📋",
    actionLabel: "Mở giải đấu → Tab 'Hạng mục' → Thêm hạng mục",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId
        ? { path: `/tournament/${firstTournamentId}`, hint: "create_category" }
        : { path: "/admin", hint: "need_tournament" },
  },
  {
    id: "preview_medals",
    group: 1,
    label: "Dự tính huy chương",
    description: "Xem số lượng huy chương cần chuẩn bị",
    icon: "🥇",
    actionLabel: "Tab 'Thống kê' → Bảng huy chương dự kiến",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId
        ? { path: `/statistics/${firstTournamentId}`, hint: "preview_medals" }
        : { path: "/admin", hint: "need_tournament" },
  },

  // ── Group 2: Đăng ký ────────────────────────────────────────
  {
    id: "export_krt",
    group: 2,
    label: "Gửi file cho HLV",
    description: "Xuất file .krt gửi qua Zalo cho các đoàn",
    icon: "📤",
    actionLabel: "Trang giải đấu → Bấm nút 'Xuất (.krt)'",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId
        ? { path: `/tournament/${firstTournamentId}`, hint: "export_krt" }
        : { path: "/admin", hint: "need_tournament" },
  },
  {
    id: "import_athletes",
    group: 2,
    label: "Nhập danh sách VĐV",
    description: "Kéo thả file HLV đã điền vào phần mềm",
    icon: "📥",
    actionLabel: "Trang giải đấu → Bấm 'Import VĐV từ CLB' ở thanh công cụ",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId
        ? { path: `/tournament/${firstTournamentId}`, hint: "import_athletes" }
        : { path: "/admin", hint: "need_tournament" },
  },
  {
    id: "check_fees",
    group: 2,
    label: "Kiểm tra lệ phí",
    description: "Xác nhận đoàn nào đã đóng tiền, đoàn nào nợ",
    icon: "💰",
    actionLabel: "Tab 'Thống kê' → Kéo xuống phần 'Lệ phí theo CLB'",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId
        ? { path: `/statistics/${firstTournamentId}`, hint: "check_fees" }
        : { path: "/admin", hint: "need_tournament" },
  },

  // ── Group 3: Sắp xếp ────────────────────────────────────────
  {
    id: "setup_schedule",
    group: 3,
    label: "Chia thảm & Lịch",
    description: "Phân nội dung nào đánh thảm nào, lúc mấy giờ",
    icon: "🗓️",
    actionLabel: "Tab 'Lịch thi đấu' → Cấu hình thảm & thời gian",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId
        ? { path: `/schedule/${firstTournamentId}`, hint: "setup_schedule" }
        : { path: "/admin", hint: "need_tournament" },
  },
  {
    id: "smart_draw",
    group: 3,
    label: "Bốc thăm (Smart Draw)",
    description: "Tự động chia nhánh đấu tránh cùng đơn vị",
    icon: "🎲",
    actionLabel: "Mở hạng mục → Bấm 'Bốc thăm thông minh'",
    getRoute: ({ firstTournamentId, firstCategoryId }) => {
      if (firstCategoryId) return { path: `/category/${firstCategoryId}`, hint: "smart_draw" };
      if (firstTournamentId) return { path: `/tournament/${firstTournamentId}`, hint: "smart_draw_need_category" };
      return { path: "/admin", hint: "need_tournament" };
    },
  },
  {
    id: "publish_bracket",
    group: 3,
    label: "Hiệu chỉnh & Xuất bản",
    description: "Kiểm tra lần cuối và in sơ đồ thi đấu",
    icon: "🖨️",
    actionLabel: "Trang sơ đồ đấu → Kiểm tra → Bấm 'In PDF'",
    getRoute: ({ firstBracketCategoryId, firstCategoryId, firstTournamentId }) => {
      const catId = firstBracketCategoryId || firstCategoryId;
      if (catId) return { path: `/bracket/${catId}`, hint: "publish_bracket" };
      if (firstTournamentId) return { path: `/tournament/${firstTournamentId}`, hint: "need_bracket" };
      return { path: "/admin", hint: "need_tournament" };
    },
  },

  // ── Group 4: Thi đấu ────────────────────────────────────────
  {
    id: "export_kmatch",
    group: 4,
    label: "Chuyển dữ liệu bàn",
    description: "Xuất file .kmatch cho máy thư ký bấm điểm",
    icon: "💾",
    actionLabel: "Trang giải đấu → Bấm 'Xuất KMatch'",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId
        ? { path: `/tournament/${firstTournamentId}`, hint: "export_kmatch" }
        : { path: "/admin", hint: "need_tournament" },
  },
  {
    id: "update_results",
    group: 4,
    label: "Cập nhật kết quả",
    description: "Nhận kết quả từ thư ký để hoàn thiện cây sơ đồ",
    icon: "📊",
    actionLabel: "Sơ đồ đấu → Bấm vào trận → Nhập điểm",
    getRoute: ({ firstBracketCategoryId, firstCategoryId, firstTournamentId }) => {
      const catId = firstBracketCategoryId || firstCategoryId;
      if (catId) return { path: `/bracket/${catId}`, hint: "update_results" };
      if (firstTournamentId) return { path: `/tournament/${firstTournamentId}`, hint: "need_bracket" };
      return { path: "/admin", hint: "need_tournament" };
    },
  },
  {
    id: "closing_ceremony",
    group: 4,
    label: "Bế mạc",
    description: "Xuất bảng tổng sắp huy chương & in giấy chứng nhận",
    icon: "🎖️",
    actionLabel: "Tab 'Chứng nhận' → In giấy chứng nhận",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId
        ? { path: `/certificate/${firstTournamentId}`, hint: "closing_ceremony" }
        : { path: "/admin", hint: "need_tournament" },
  },
  {
    id: "import_kmatch_secretary",
    group: 4,
    label: "Mở file thi đấu",
    description: "Dành cho Thư ký: Nạp dữ liệu từ Admin để chuẩn bị báo điểm",
    icon: "📖",
    actionLabel: "Bấm 'Mở file .kmatch'",
    getRoute: () => ({ path: "/secretary", hint: "import_kmatch_secretary" }),
  },
  // -- Specialized --
  {
    id: "sigma_split",
    group: 5,
    label: "Chia nhánh Sigma",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId ? { path: `/tournament/${firstTournamentId}`, hint: "sigma_split" } : null,
  },
  {
    id: "lan_sync",
    group: 5,
    label: "Đồng bộ LAN",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId ? { path: `/tournament/${firstTournamentId}`, hint: "lan_sync" } : null,
  },
  {
    id: "logo_sponsor",
    group: 5,
    label: "Logo & Tài trợ",
    getRoute: ({ firstTournamentId }) =>
      firstTournamentId ? { path: `/tournament/${firstTournamentId}`, hint: "logo_sponsor" } : null,
  },
];

// Human-readable hints for each navigation context
export const NAVIGATION_HINTS = {
  // Step-specific action hints
  create_tournament:          "💡 Bấm nút 'Tạo giải đấu mới' ở góc trên bên phải để bắt đầu.",
  create_category:            "💡 Bạn có thể bấm '+ Thêm hạng mục' thủ công, hoặc dùng nút 'Tải mẫu Excel' & 'Import từ Excel' để làm hàng loạt.",
  preview_medals:             "💡 Kéo xuống phần 'Dự tính huy chương' và tinh chỉnh số Huy chương nội dung đồng đội phù hợp để xem dự kiến.",
  export_krt:                 "💡 Bấm nút 'Xuất (.krt)' ở thanh công cụ phía trên để lưu danh mục giải gửi cho HLV.",
  import_athletes:            "💡 3 CÁCH NẠP VĐV:\n1. Vào Hạng mục bất kỳ → Click '+ Thêm VĐV' hoặc 'Tải/Import Excel'\n2. Bấm nút 'Import VĐV từ CLB' để nạp nhiều\n3. Bấm 'Quản lý VĐV' → 'Đồng bộ Cloud'",
  check_fees:                 "💡 Bấm nút '📊 Quản lý thống kê & Bảng tổng sắp', sau đó mở tab 'Lệ phí' để kiểm tra.",
  setup_schedule:             "💡 5 BƯỚC CHIA LỊCH:\n1. ⚙️ Setup: số thảm, ngày giờ, thời lượng...\n2. 📅 Bấm 'Tự động xếp TẤT CẢ'\n3. ➕ Thêm Khai mạc/Bế mạc\n4. 💾 Lưu cấu hình\n5. Xuất PDF/Excel.",
  lan_sync:                   "💡 BƯỚC ĐỒNG BỘ LAN:\n1. Vào phần 'Đồng bộ LAN' ở dưới\n2. Bấm '▶ Bật máy chủ'\n3. Gửi IP đang hiện cho máy Thư ký nạp.",
  logo_sponsor:               "💡 BƯỚC LOGO & TÀI TRỢ:\n1. Vào phần Logo ở dưới\n2. 'Tải lên logo giải'\n3. 'Thêm logo nhà tài trợ'\n4. 'Tải lên chữ ký'.",
  sigma_split:                "💡 BƯỚC CHIA SIGMA:\n1. Kéo xuống phần '✂️ Bật chia nhánh sigma'\n2. Tích chọn 'Bật'\n3. Chỉnh ngưỡng VĐV (vd: 20) để tự động chia bảng A/B.",
  smart_draw:                 "💡 Bạn có thể bấm 'Bốc thăm tất cả' ở trang Giải đấu, hoặc vào từng Hạng mục bấm '🎲 Bốc thăm'.",
  smart_draw_need_category:   "💡 Chọn một hạng mục từ danh sách bên dưới để vào trang bốc thăm.",
  publish_bracket:            "💡 Bấm '📄 Xuất PDF' ở trang Sơ đồ, hoặc '📄 Xuất tất cả PDF' ở trang Giải đấu để in kết quả.",
  update_results:             "💡 Bấm vào từng trận đấu để nhập kết quả từ bàn thư ký.",
  export_kmatch:              "💡 Bấm nút 'Xuất (.kmatch)' ở thanh công cụ để tạo file nạp cho máy Thư ký.",
  closing_ceremony:           "💡 6 BƯỚC IN GCN:\n1. ➕ Tạo mẫu, chọn hướng giấy\n2. 🖼 Tải ảnh nền\n3. Kéo thả biến vào vị trí\n4. Lọc dữ liệu\n5. Xem trước\n6. In/Xuất PDF.",
  import_kmatch_secretary:    "💡 Dành cho Thư ký: Bấm '📂 Mở file .kmatch' rồi chọn file từ máy Admin gửi sang.",
  // Error states
  need_tournament:            "⚠️ Bạn cần tạo ít nhất một giải đấu trước. Bấm 'Tạo giải đấu mới'.",
  need_bracket:               "⚠️ Bạn cần bốc thăm cho hạng mục trước. Chọn hạng mục → Bốc thăm.",
};

// Storage keys
const STORAGE_KEY   = "krt_onboarding_checklist";
const FIRST_RUN_KEY = "krt_first_run_done";
const TRIAL_DEMO_KEY = "krt_trial_demo_used";
const SIDEBAR_KEY   = "krt_checklist_sidebar_open";
const NAV_HINT_KEY  = "krt_nav_hint"; // Used localStorage for Electron persistence across reloads

export function OnboardingProvider({ children }) {
  const { tournaments } = useTournament();

  const [completedSteps, setCompletedSteps] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch { return {}; }
  });

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY);
      return saved === null ? true : JSON.parse(saved);
    } catch { return true; }
  });

  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [demoDone, setDemoDone] = useState(() =>
    localStorage.getItem(TRIAL_DEMO_KEY) === "true"
  );
  // Current navigation hint (shown on destination page)
  const [activeHint, setActiveHint] = useState(
    () => localStorage.getItem(NAV_HINT_KEY) || null
  );

  // States for help modal
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [selectedHelpRole, setSelectedHelpRole] = useState("admin");

  // ── Derive context object for route resolution ──
  const navContext = (() => {
    const firstTournamentId = tournaments?.[0]?.id ?? null;
    let firstCategoryId = null;
    let firstBracketCategoryId = null;

    if (tournaments?.length) {
      for (const t of tournaments) {
        for (const c of (t.categories || [])) {
          if (!firstCategoryId) firstCategoryId = c.id;
          if (!firstBracketCategoryId && c.bracket?.matches?.length) {
            firstBracketCategoryId = c.id;
          }
        }
      }
    }
    return { firstTournamentId, firstCategoryId, firstBracketCategoryId };
  })();

  const resolveStepRoute = useCallback((step) => {
    return step.getRoute(navContext);
  }, [navContext]);

  const handleReproduceFunction = useCallback((stepId, setRole, navigate) => {
    const step = CHECKLIST_STEPS.find(s => s.id === stepId);
    if (!step) return;

    // Determine target role based on step ID
    let role = "admin";
    const secretarySteps = ["update_results", "export_kmatch", "import_kmatch_secretary"];
    if (secretarySteps.includes(stepId)) {
      role = "secretary";
    }

    // Set role (requires useRole context from caller)
    if (setRole) setRole(role);
    
    // Resolve route
    let route = resolveStepRoute(step);
    
    // Manual overrides for one-off hints
    if (stepId === "sigma_split" || stepId === "lan_sync" || stepId === "logo_sponsor") {
      const firstId = navContext.firstTournamentId;
      if (firstId) {
        route = { path: `/tournament/${firstId}`, hint: stepId };
      }
    }

    if (route) {
      setActiveHint(route.hint);
      localStorage.setItem(NAV_HINT_KEY, route.hint);
      if (navigate) navigate(route.path);
    }
    setShowHelpModal(false);
  }, [navContext, resolveStepRoute]);

  // Check first run
  useEffect(() => {
    const firstRunDone = localStorage.getItem(FIRST_RUN_KEY);
    if (!firstRunDone) {
      const timer = setTimeout(() => setShowWelcomePopup(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // ── AUTO-DETECTION ──────────────────────────────────────────
  useEffect(() => {
    if (!tournaments) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompletedSteps(prev => {
      const previousSteps = prev && typeof prev === "object" && !Array.isArray(prev)
        ? prev
        : {};
      const next = { ...previousSteps };
      
      const hasTournament = tournaments.length > 0;
      if (hasTournament) next.create_tournament = true;
      else delete next.create_tournament; // Uncheck if no tournament

      const hasCategories = tournaments.some(t => t.categories?.length > 0);
      if (hasCategories) {
        next.create_category = true;
        next.preview_medals = true;
      } else {
        delete next.create_category;
        delete next.preview_medals;
      }

      const hasAthletes = tournaments.some(t =>
        t.categories?.some(c => c.athletes?.length > 0)
      );
      if (hasAthletes) {
        next.import_athletes = true;
        next.export_krt = true;
      } else {
        delete next.import_athletes;
        delete next.export_krt;
      }

      const hasFeeData = tournaments.some(t =>
        t.clubRegistrations && Object.keys(t.clubRegistrations).length > 0
      );
      if (hasFeeData) next.check_fees = true;
      else delete next.check_fees;

      const hasSchedule = tournaments.some(t => t.schedule);
      if (hasSchedule) next.setup_schedule = true;
      else delete next.setup_schedule;

      const hasBracket = tournaments.some(t =>
        t.categories?.some(c => c.bracket?.matches?.length > 0)
      );
      if (hasBracket) next.smart_draw = true;
      else delete next.smart_draw;

      const hasResults = tournaments.some(t =>
        t.categories?.some(c => c.bracket?.matches?.some(m => m.winnerId))
      );
      if (hasResults) {
        next.publish_bracket = true;
        next.export_kmatch = true;
        next.update_results = true;
      } else {
        delete next.publish_bracket;
        delete next.export_kmatch;
        delete next.update_results;
      }

      // Only update if changed
      const changed = Object.keys(next).length !== Object.keys(previousSteps).length ||
                      Object.keys(next).some(k => next[k] !== previousSteps[k]);
      return changed ? next : prev;
    });
  }, [tournaments]);

  // Persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedSteps));
  }, [completedSteps]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  const clearHint = useCallback(() => {
    setActiveHint(null);
    localStorage.removeItem(NAV_HINT_KEY);
  }, []);

  // ── Step actions ────────────────────────────────────────────
  const markStepDone = useCallback((stepId) => {
    setCompletedSteps(prev => ({ ...prev, [stepId]: true }));
  }, []);

  const markStepUndone = useCallback((stepId) => {
    setCompletedSteps(prev => {
      const previousSteps = prev && typeof prev === "object" && !Array.isArray(prev)
        ? prev
        : {};
      const next = { ...previousSteps };
      delete next[stepId];
      return next;
    });
  }, []);

  const dismissWelcomePopup = useCallback((startNow = false) => {
    setShowWelcomePopup(false);
    localStorage.setItem(FIRST_RUN_KEY, "true");
    if (startNow) setSidebarOpen(true);
  }, []);

  const markDemoDone = useCallback(() => {
    setDemoDone(true);
    localStorage.setItem(TRIAL_DEMO_KEY, "true");
  }, []);

  const completionPercent = Math.round(
    (Object.keys(completedSteps).filter(k => completedSteps[k]).length /
      CHECKLIST_STEPS.length) * 100
  );

  return (
    <OnboardingContext.Provider
      value={{
        completedSteps,
        markStepDone,
        markStepUndone,
        sidebarOpen,
        setSidebarOpen,
        completionPercent,
        showWelcomePopup,
        dismissWelcomePopup,
        demoDone,
        markDemoDone,
        navContext,
        resolveStepRoute,
        activeHint,
        setActiveHint: (h) => {
          setActiveHint(h);
          if (h) sessionStorage.setItem(NAV_HINT_KEY, h);
          else sessionStorage.removeItem(NAV_HINT_KEY);
        },
        clearHint,
        showHelpModal,
        setShowHelpModal,
        selectedHelpRole,
        setSelectedHelpRole,
        handleReproduceFunction,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
