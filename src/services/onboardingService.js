import { getCurrentLicense } from "./licenseService.js";

const ONBOARDING_STORAGE_PREFIX = "ksport_smart_onboarding_v1_";

function getProfileSuffix() {
  try {
    const lic = getCurrentLicense();
    return String(lic?.machineId || lic?.licenseKey || "default").slice(0, 32);
  } catch {
    return "default";
  }
}

export function loadOnboardingState() {
  try {
    if (typeof localStorage === "undefined") {
      return { dontShowWelcome: false, completedTours: {}, inProgressTour: null, firstResultSeen: false };
    }
    const raw = localStorage.getItem(`${ONBOARDING_STORAGE_PREFIX}${getProfileSuffix()}`);
    if (!raw) {
      return { dontShowWelcome: false, completedTours: {}, inProgressTour: null, firstResultSeen: false };
    }
    const parsed = JSON.parse(raw);
    return {
      dontShowWelcome: Boolean(parsed.dontShowWelcome),
      completedTours: parsed.completedTours || {},
      inProgressTour: parsed.inProgressTour || null,
      firstResultSeen: Boolean(parsed.firstResultSeen),
    };
  } catch {
    return { dontShowWelcome: false, completedTours: {}, inProgressTour: null, firstResultSeen: false };
  }
}

export function saveOnboardingState(partial) {
  const curr = loadOnboardingState();
  const next = { ...curr, ...partial };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`${ONBOARDING_STORAGE_PREFIX}${getProfileSuffix()}`, JSON.stringify(next));
    }
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function resetOnboardingState() {
  const fresh = { dontShowWelcome: false, completedTours: {}, inProgressTour: null, firstResultSeen: false };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`${ONBOARDING_STORAGE_PREFIX}${getProfileSuffix()}`, JSON.stringify(fresh));
    }
  } catch {
    // Ignore
  }
  return fresh;
}

export const WIZARD_STEP_GUIDES = {
  1: {
    title: "Bước 1: Phân tích dữ liệu giải đấu",
    purpose: "Kiểm tra nhanh toàn bộ quy mô giải trước khi xếp lịch.",
    whyNeeded: "Giúp phát hiện sớm nội dung chưa bốc thăm, VĐV thi nhiều nội dung hoặc nội dung trống.",
    howTo: "Xem các thẻ thống kê. Nếu có cảnh báo màu vàng, kiểm tra lại trước khi sang bước sau.",
    example: "Giải có 72 nội dung, 15 nội dung chưa bốc thăm sẽ hiển thị 'tổng trận ước tính'.",
    commonMistakes: "Bỏ qua cảnh báo thiếu VĐV hoặc để thời lượng mặc định sai lệch.",
  },
  2: {
    title: "Bước 2: Thời gian tổ chức",
    purpose: "Thiết lập khung giờ thi đấu Sáng/Chiều và các sự kiện khóa (Khai mạc, Nghỉ trưa...).",
    whyNeeded: "Hệ thống chỉ xếp lịch vào khoảng thời gian hợp lệ và tự né giờ Khai mạc, Nghỉ trưa.",
    howTo: "Kiểm tra giờ Sáng/Chiều, Giờ kết thúc mục tiêu, Giờ tối đa và bấm '+ Thêm sự kiện' nếu có Khai mạc/Bế mạc.",
    example: "Khai mạc 09:30 (30 phút, Buổi Sáng, Tất cả thảm) để không xếp trận nào vào giờ khai mạc.",
    commonMistakes: "Quên thêm Khai mạc hoặc đặt Giờ tối đa quá sớm khiến không đủ sức chứa.",
  },
  3: {
    title: "Bước 3: Thời lượng thi đấu",
    purpose: "Xác nhận thời lượng trung bình mỗi trận theo lứa tuổi và thời gian nghỉ VĐV.",
    whyNeeded: "Tính chính xác tổng thời lượng giải đấu (dùng chung với Setup lịch thủ công).",
    howTo: "Điều chỉnh phút/trận cho Kata, Kumite theo từng lứa tuổi hoặc đặt ngoại lệ cho nội dung đặc biệt.",
    example: "Lứa tuổi dưới 8 đánh 3 phút/trận, lứa tuổi 18+ đánh 5 phút/trận, nghỉ VĐV tối thiểu 15 phút.",
    commonMistakes: "Để đồng loạt 5 phút/trận cho mọi lứa tuổi làm tổng thời lượng bị đội lên cao.",
  },
  4: {
    title: "Bước 4: Phân bổ thảm",
    purpose: "Quyết định thảm nào được nhận nội dung nào (hoặc để tự động cân bằng).",
    whyNeeded: "Phản ánh đúng bố trí sân bãi thực tế của Ban tổ chức.",
    howTo: "Chọn nhanh 1 trong 6 mẫu phía trên hoặc bấm trực tiếp vào từng thẻ trên thảm để xoay 5 trạng thái.",
    example: "Bấm '★ Bắt buộc: Kumite' ở Thảm cuối chỉ có nghĩa Thảm cuối chỉ nhận Kumite, các thảm khác vẫn chạy cả Kata và Kumite.",
    commonMistakes: "Đặt '★ Bắt buộc: Kata' cho tất cả các thảm làm Kumite không còn thảm thi đấu.",
  },
  5: {
    title: "Bước 5: Yêu cầu chuyên môn Karate",
    purpose: "Thiết lập trình tự Kata/Kumite, thứ tự lứa tuổi, giới tính và gán ngày/buổi.",
    whyNeeded: "Giữ đúng nghi thức và trình tự chuyên môn của giải Karate.",
    howTo: "Chọn Bắt buộc hoặc Ưu tiên mềm cho từng quy tắc. Lưu ý các yêu cầu bên trong cùng 1 nhánh đấu do trọng tài thảm điều phối.",
    example: "Từng thảm xong Kata mới sang Kumite; ưu tiên lứa tuổi nhỏ thi đấu trước.",
    commonMistakes: "Ép quá nhiều quy tắc thành 'Bắt buộc nghiêm ngặt' cùng lúc gây mâu thuẫn.",
  },
  6: {
    title: "Bước 6: Chiến lược tối ưu",
    purpose: "Chọn tiêu chí ưu tiên để hệ thống tạo ra các phương án lịch khác nhau.",
    whyNeeded: "Mỗi giải đấu có mục tiêu khác nhau: xong sớm, đều thảm hoặc ít đổi thảm cho VĐV.",
    howTo: "Tick chọn các chiến lược muốn so sánh, chọn ngân sách thời gian (10s/30s/45s) và xem bảng kiểm tra sức chứa.",
    example: "Chọn 30 giây cho giải 50–80 nội dung; chọn 10 giây cho giải nhỏ cấp CLB.",
    commonMistakes: "Chạy tối ưu khi tỷ lệ sử dụng vượt 100% (cần quay lại Bước 2 hoặc 3 để điều chỉnh).",
  },
  7: {
    title: "Bước 7: Kết quả và phê duyệt",
    purpose: "So sánh các phương án, xem trước timeline từng thảm và áp dụng lịch.",
    whyNeeded: "Đảm bảo Ban tổ chức kiểm tra trực quan trước khi thay đổi lịch chính thức.",
    howTo: "Bấm qua từng tab phương án, xem bảng so sánh, kiểm tra timeline từng thảm rồi bấm 'Áp dụng phương án này'.",
    example: "Phương án 1 kết thúc 15:54 đều cả 3 thảm, 0 xung đột VĐV.",
    commonMistakes: "Quên xem lại timeline trước khi áp dụng (nếu áp dụng nhầm vẫn có nút Hoàn tác ở trang Lịch).",
  },
};

export function buildQuickTourSteps({
  matCount = 3,
  tournamentDays = [],
  hasResult = false,
  hasTemplates = true,
  hasWarnings = false,
}) {
  const steps = [
    {
      id: "quick-intro",
      targetId: "tour-mode-switcher",
      mode: "quick",
      title: "1. Giới thiệu Smart Schedule Pro",
      content: `Chào mừng bạn đến với Trợ lý xếp lịch tự động cho giải ${tournamentDays.length} ngày, ${matCount} thảm. Bạn có thể chọn 'Xếp lịch nhanh' hoặc 'Xếp lịch nâng cao (7 bước)'.`,
    },
    {
      id: "quick-mode",
      targetId: "tour-mode-quick-btn",
      mode: "quick",
      title: "2. Chế độ Xếp lịch nhanh",
      content: "Chế độ này tự động lấy toàn bộ cấu hình hiện có của giải, phù hợp khi bạn muốn có lịch tối ưu ngay trong 1 màn hình.",
    },
  ];

  if (hasTemplates) {
    steps.push({
      id: "quick-templates",
      targetId: "tour-templates-bar",
      mode: "quick",
      title: "3. Chọn hoặc bỏ qua mẫu cấu hình",
      content: "Bạn có thể chọn nhanh 1 mẫu khởi đầu (như Giải cấp CLB, Giải phong trào, Giải cấp tỉnh...) hoặc bỏ qua để giữ nguyên cấu hình giải.",
    });
  }

  steps.push(
    {
      id: "quick-summary",
      targetId: "tour-quick-summary",
      mode: "quick",
      title: "4. Đọc tóm tắt dữ liệu giải đấu",
      content: "Kiểm tra số nội dung, tổng số trận, tổng thời lượng dự kiến và sức chứa thực tế của các thảm.",
    },
    ...(hasWarnings
      ? [
          {
            id: "quick-bracket-warn",
            targetId: "tour-quick-warnings",
            mode: "quick",
            title: "5. Kiểm tra trạng thái bốc thăm",
            content: "Nếu có nội dung chưa bốc thăm, số trận đang là ước tính. Hãy lưu ý trước khi chốt lịch chính thức.",
          },
        ]
      : []),
    {
      id: "quick-target-end",
      targetId: "tour-quick-target-end",
      mode: "quick",
      title: "Giờ kết thúc mục tiêu",
      content: "Đặt giờ bạn mong muốn giải đấu hoàn thành (ví dụ 16:00 hoặc 17:00). Hệ thống sẽ cố gắng xếp xong trước giờ này.",
    },
    {
      id: "quick-max-end",
      targetId: "tour-quick-max-end",
      mode: "quick",
      title: "Giờ kết thúc tối đa",
      content: "Là giới hạn muộn nhất Ban tổ chức cho phép nếu giải quá đông không thể xong đúng giờ mục tiêu.",
    },
    {
      id: "quick-custom-events",
      targetId: "tour-quick-events-link",
      mode: "quick",
      title: "Kiểm tra sự kiện cố định",
      content: "Xem số sự kiện khóa (Khai mạc, Bế mạc...) đang áp dụng. Bấm '+ Thêm/sửa sự kiện' nếu cần thêm giờ Khai mạc.",
    },
    {
      id: "quick-mats",
      targetId: "tour-mat-allocation",
      mode: "quick",
      title: "Chọn cách phân bổ thảm",
      content: `Giải hiện có ${matCount} thảm. Bạn có thể bấm các nút chọn nhanh như 'Tự động cân bằng' hoặc 'Thảm cuối chỉ Kumite'.`,
    },
    {
      id: "quick-constraints",
      targetId: "tour-quick-strict-check",
      mode: "quick",
      title: "Kiểm tra ràng buộc deadline",
      content: "Tick ô này nếu bắt buộc phải xong trước giờ mục tiêu; bỏ tick nếu cho phép nới nhẹ đến giờ kết thúc tối đa.",
    },
    {
      id: "quick-run",
      targetId: "tour-run-solver-btn",
      mode: "quick",
      title: "Chạy tối ưu",
      content: "Nhấn nút này để hệ thống tự động tính toán và kiểm định toàn bộ xung đột VĐV, giờ nghỉ và sức chứa thảm.",
    }
  );

  if (hasResult) {
    steps.push(
      {
        id: "quick-results",
        targetId: "tour-results-panel",
        mode: "quick",
        title: "Đọc và so sánh kết quả",
        content: "So sánh giờ kết thúc, chênh lệch giữa các thảm và xung đột VĐV giữa các phương án đề xuất.",
      },
      {
        id: "quick-apply",
        targetId: "tour-apply-btn",
        mode: "quick",
        title: "Xem trước và áp dụng lịch",
        content: "Sau khi xem timeline từng thảm ở bên dưới, nhấn 'Áp dụng phương án này' để cập nhật lên lịch thi đấu.",
      }
    );
  }

  return steps;
}

export function buildWizardTourSteps({ matCount = 3, tournamentDays = [], hasResult = false }) {
  const steps = [
    {
      id: "wiz-step-1",
      targetId: "tour-wizard-content",
      mode: "wizard",
      wizardStep: 1,
      title: WIZARD_STEP_GUIDES[1].title,
      content: `${WIZARD_STEP_GUIDES[1].purpose} ${WIZARD_STEP_GUIDES[1].howTo}`,
    },
    {
      id: "wiz-step-2",
      targetId: "tour-wizard-content",
      mode: "wizard",
      wizardStep: 2,
      title: WIZARD_STEP_GUIDES[2].title,
      content: `Cấu hình giờ Sáng/Chiều cho ${tournamentDays.length} ngày và thêm Khai mạc, Nghỉ trưa, Bế mạc để hệ thống tự né giờ.`,
    },
    {
      id: "wiz-step-3",
      targetId: "tour-wizard-content",
      mode: "wizard",
      wizardStep: 3,
      title: WIZARD_STEP_GUIDES[3].title,
      content: `${WIZARD_STEP_GUIDES[3].purpose} Ví dụ: ${WIZARD_STEP_GUIDES[3].example}`,
    },
    {
      id: "wiz-step-4",
      targetId: "tour-wizard-content",
      mode: "wizard",
      wizardStep: 4,
      title: WIZARD_STEP_GUIDES[4].title,
      content: `Phân bổ ${matCount} thảm: dùng mẫu nhanh hoặc bấm từng thẻ. Lưu ý '★ Bắt buộc' chỉ giới hạn trên chính thảm đó.`,
    },
    {
      id: "wiz-step-5",
      targetId: "tour-wizard-content",
      mode: "wizard",
      wizardStep: 5,
      title: WIZARD_STEP_GUIDES[5].title,
      content: `${WIZARD_STEP_GUIDES[5].purpose} Bạn có thể gán nội dung theo từng ngày hoặc buổi Sáng/Chiều.`,
    },
    {
      id: "wiz-step-6",
      targetId: "tour-wizard-content",
      mode: "wizard",
      wizardStep: 6,
      title: WIZARD_STEP_GUIDES[6].title,
      content: "Chọn các chiến lược muốn so sánh (Cân bằng thời gian, Kết thúc sớm, Trải nghiệm VĐV...) và kiểm tra bảng sức chứa trước khi chạy.",
    },
  ];
  if (hasResult) {
    steps.push({
      id: "wiz-step-7",
      targetId: "tour-results-panel",
      mode: "wizard",
      wizardStep: 7,
      title: WIZARD_STEP_GUIDES[7].title,
      content: `${WIZARD_STEP_GUIDES[7].purpose} ${WIZARD_STEP_GUIDES[7].howTo}`,
    });
  }
  return steps;
}

export function buildResultTourSteps() {
  return [
    {
      id: "res-tabs",
      targetId: "tour-result-tabs",
      title: "Chọn phương án phù hợp",
      content: "Mỗi thẻ là 1 phương án lịch khác biệt. Bạn có thể bấm qua lại để so sánh giờ kết thúc và độ lệch thảm.",
    },
    {
      id: "res-table",
      targetId: "tour-result-table",
      title: "Đọc bảng chỉ số đánh giá",
      content: "Kiểm tra số nội dung đã xếp, xung đột VĐV (cần bằng 0), giờ kết thúc toàn giải, vượt giờ mục tiêu và thời gian trống.",
    },
    {
      id: "res-status",
      targetId: "tour-result-status",
      title: "Hiểu trạng thái FEASIBLE và OPTIMAL",
      content: "FEASIBLE nghĩa là đã tìm được lịch hợp lệ; OPTIMAL là đã chứng minh tối ưu toán học. Mọi kiểm định hiện áp dụng ở cấp độ Nội dung.",
    },
    {
      id: "res-timeline",
      targetId: "tour-result-timeline",
      title: "Xem trước Timeline trước khi áp dụng",
      content: "Kiểm tra thứ tự từng nội dung trên từng thảm. Hệ thống chỉ cập nhật khi bạn tự bấm 'Áp dụng phương án này'.",
    },
  ];
}

/**
 * Anonymized synthetic Practice Dataset (Section 10): never touches real tournament data.
 */
export const DEMO_PRACTICE_CATEGORIES = [
  { id: "demo-1", name: "Kata cá nhân Nam lứa tuổi dưới 8", type: "kata", athletes: [{ id: "D1" }, { id: "D2" }, { id: "D3" }, { id: "D4" }] },
  { id: "demo-2", name: "Kata cá nhân Nữ lứa tuổi dưới 8", type: "kata", athletes: [{ id: "D5" }, { id: "D6" }, { id: "D7" }] },
  { id: "demo-3", name: "Kata cá nhân Nam lứa tuổi 9-11", type: "kata", athletes: [{ id: "D8" }, { id: "D9" }, { id: "D10" }, { id: "D11" }] },
  { id: "demo-4", name: "Kumite cá nhân Nam hạng -26kg lứa tuổi dưới 8", type: "kumite", athletes: [{ id: "D1" }, { id: "D12" }, { id: "D13" }, { id: "D14" }] },
  { id: "demo-5", name: "Kumite cá nhân Nữ hạng -26kg lứa tuổi dưới 8", type: "kumite", athletes: [{ id: "D5" }, { id: "D15" }, { id: "D16" }] },
  { id: "demo-6", name: "Kumite cá nhân Nam hạng -32kg lứa tuổi 9-11", type: "kumite", athletes: [{ id: "D8" }, { id: "D17" }, { id: "D18" }, { id: "D19" }] },
  { id: "demo-7", name: "Kumite đồng đội Nam lứa tuổi 9-11", type: "kumite", athletes: [{ id: "D20" }, { id: "D21" }, { id: "D22" }] },
  { id: "demo-8", name: "Kumite đồng đội Nữ lứa tuổi 9-11", type: "kumite", athletes: [{ id: "D23" }, { id: "D24" }, { id: "D25" }] },
];
