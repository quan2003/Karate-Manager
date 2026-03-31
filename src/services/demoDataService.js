/**
 * demoDataService.js
 * Tải dữ liệu mẫu (demo) vào ứng dụng để người dùng có thể
 * trải nghiệm bốc thăm, in PDF,... mà không cần nhập tay.
 *
 * Chỉ dùng trong lần đầu dùng thử (trial). Sau khi đã tải,
 * nút "Tải dữ liệu mẫu" sẽ ẩn đi.
 */

import { ACTIONS } from "../context/TournamentContext";

const DEMO_TOURNAMENT_ID = "demo-karate-2026";

const DEMO_TOURNAMENT = {
  id: DEMO_TOURNAMENT_ID,
  name: "🏆 [DEMO] Giải Karate Mở Rộng 2026",
  date: "2026-04-15",
  startDate: "2026-04-15",
  endDate: "2026-04-16",
  location: "Nhà thi đấu tỉnh ABC",
  createdAt: new Date().toISOString(),
  isDemo: true,
};

const DEMO_CLUBS = [
  "CLB Karate Phú Nhuận",
  "CLB Karate Bình Thạnh",
  "CLB Karate Gò Vấp",
  "CLB Karate Tân Bình",
  "CLB Karate Quận 7",
];

const MALE_NAMES = [
  "Nguyễn Minh Khoa",  "Trần Văn Hùng",  "Lê Quang Vinh",  "Phạm Đức Anh",
  "Hoàng Bảo Trung",   "Vũ Tiến Long",   "Đặng Quốc Tuấn", "Bùi Thế Mạnh",
  "Đỗ Ngọc Hải",       "Ngô Văn Phúc",   "Dương Gia Huy",  "Lưu Tấn Lộc",
  "Phan Đình Kiên",    "Tô Anh Minh",    "Chu Hoài Nam",   "Mai Quốc Khánh",
];

const FEMALE_NAMES = [
  "Trần Thị Lan",     "Nguyễn Thị Nhung",  "Lê Thị Mai",      "Phạm Thị Hoa",
  "Hoàng Thị Thanh",  "Vũ Thị Ngọc",       "Đặng Thị Linh",   "Bùi Thị Thu",
  "Đinh Thị Khánh",   "Cao Thị Hương",     "Lý Thị Quỳnh",    "Tạ Thị Phương",
];

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[rnd(0, arr.length - 1)];
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function makeAthletes(gender, names, count) {
  const shuffled = [...names].sort(() => Math.random() - 0.5).slice(0, count);
  return shuffled.map((name, i) => ({
    id: uuid(),
    name,
    gender,
    club: DEMO_CLUBS[i % DEMO_CLUBS.length],
    country: "VN",
    birthDate: null,
    weight: null,
    isTeam: false,
    seed: null,
    flagUrl: null,
  }));
}

const DEMO_CATEGORIES = [
  {
    id: uuid(),
    name: "Nam Kumite -75kg Thanh Niên",
    type: "kumite",
    gender: "male",
    weightClass: "-75kg",
    ageGroup: "Thanh Niên",
    format: "single_elimination",
    bracket: null,
    athletes: makeAthletes("male", MALE_NAMES, rnd(6, 8)),
  },
  {
    id: uuid(),
    name: "Nam Kumite -67kg Thanh Niên",
    type: "kumite",
    gender: "male",
    weightClass: "-67kg",
    ageGroup: "Thanh Niên",
    format: "single_elimination",
    bracket: null,
    athletes: makeAthletes("male", MALE_NAMES, rnd(4, 6)),
  },
  {
    id: uuid(),
    name: "Nữ Kumite -61kg Thanh Niên",
    type: "kumite",
    gender: "female",
    weightClass: "-61kg",
    ageGroup: "Thanh Niên",
    format: "single_elimination",
    bracket: null,
    athletes: makeAthletes("female", FEMALE_NAMES, rnd(4, 6)),
  },
  {
    id: uuid(),
    name: "Nam Kata Thiếu Nhi",
    type: "kata",
    gender: "male",
    weightClass: "",
    ageGroup: "Thiếu Nhi",
    format: "single_elimination",
    bracket: null,
    athletes: makeAthletes("male", MALE_NAMES, rnd(6, 8)),
  },
  {
    id: uuid(),
    name: "Nữ Kata Thiếu Nhi",
    type: "kata",
    gender: "female",
    weightClass: "",
    ageGroup: "Thiếu Nhi",
    format: "single_elimination",
    bracket: null,
    athletes: makeAthletes("female", FEMALE_NAMES, rnd(4, 6)),
  },
];

// Build fake club registrations from athletes
function buildClubRegistrations() {
  const regs = {};
  DEMO_CLUBS.forEach((club, i) => {
    regs[club] = {
      coaches: [`HLV ${["Nguyễn Văn An", "Trần Thị Bình", "Lê Hoàng Nam", "Phạm Anh Tuấn", "Đỗ Minh Trí"][i]}`],
      teamLeader: `${["Trưởng đoàn A", "Trưởng đoàn B", "Trưởng đoàn C", "Trưởng đoàn D", "Trưởng đoàn E"][i]}`,
      isPaid: i % 2 === 0,
    };
  });
  return regs;
}

/**
 * Load demo data by dispatching to TournamentContext.
 * Merges the demo tournament into existing data so nothing is lost.
 * @param {Function} dispatch - from useTournamentDispatch()
 * @param {Array} existingTournaments - current tournaments from context
 */
export async function loadDemoData(dispatch, existingTournaments = []) {
  if (isDemoDataLoaded()) {
    throw new Error("Dữ liệu mẫu đã được tải trước đó.");
  }

  // Avoid adding demo duplicate
  const alreadyExists = existingTournaments.some(
    (t) => t.isDemo || t.name?.includes("[DEMO]")
  );
  if (alreadyExists) {
    throw new Error("Dữ liệu mẫu đã tồn tại trong danh sách giải đấu.");
  }

  const demoTournament = {
    ...DEMO_TOURNAMENT,
    categories: DEMO_CATEGORIES,
    clubRegistrations: buildClubRegistrations(),
  };

  // LOAD_DATA merges: keep existing + add demo
  dispatch({
    type: ACTIONS.LOAD_DATA,
    payload: {
      tournaments: [...existingTournaments, demoTournament],
    },
  });

  // Small delay for UX
  await new Promise((r) => setTimeout(r, 600));

  return { success: true };
}

export function isDemoDataLoaded() {
  try {
    const saved = localStorage.getItem("krt_trial_demo_used");
    return saved === "true";
  } catch {
    return false;
  }
}
