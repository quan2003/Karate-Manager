import { getTeamCountFromAthletes, isTeamCategory } from "../utils/teamDraw.js";

/**
 * Schedule Service - Quản lý lịch thi đấu, chia thảm
 * 
 * Features:
 * - Set thảm (mat) và giờ cho từng nội dung
 * - Phát hiện xung đột: VĐV đang đấu thảm này không thể ở thảm kia
 * - Tính toán thông minh dựa trên số VĐV + loại nội dung
 * - Hỗ trợ custom thời lượng theo loại (kata cá nhân/đồng đội, kumite cá nhân/đồng đội)
 */

/**
 * Thời lượng mặc định theo loại nội dung (phút/hạng mục đầy đủ)
 * Tính từ khi bắt đầu đến khi xong toàn bộ hạng mục này
 */
export const DEFAULT_MATCH_DURATIONS = {
  kata_individual: 5,    // Kata cá nhân: ~5 phút/trận
  kata_team: 5,          // Kata đồng đội: ~5 phút/trận
  kumite_individual: 5,  // Kumite cá nhân: ~5 phút/trận
  kumite_team: 5,        // Kumite đồng đội: ~5 phút/trận
};

/**
 * Xác định loại chi tiết của hạng mục (để tính thời lượng)
 */
export function getCategoryDetailType(category) {
  const isKata = category.type === "kata";
  const isTeam = isTeamCategory(category);

  if (isKata && isTeam) return "kata_team";
  if (isKata) return "kata_individual";
  if (isTeam) return "kumite_team";
  return "kumite_individual";
}

/**
 * Ước tính số trận đấu dựa trên số VĐV (single elimination)
 * n VĐV → n-1 trận
 */
export function estimateMatchCount(athleteCount) {
  if (athleteCount <= 1) return 0;
  return athleteCount - 1; // Single elimination: n-1 trận
}

/**
 * Ước tính thời lượng thực tế cho 1 hạng mục (phút)
 * Dựa trên số VĐV và loại nội dung
 * @param {Object} category - hạng mục
 * @param {Object} durations - cài đặt thời lượng trận { kata_individual, kata_team, kumite_individual, kumite_team }
 * @returns {number} thời lượng tính bằng phút
 */
export function getEstimatedParticipantCount(category) {
  if (isTeamCategory(category)) {
    return getTeamCountFromAthletes(category.athletes || [], category);
  }
  return category.athletes?.length || 0;
}

export function getEstimatedMatchCount(category) {
  const bracketMatches = category.bracket?.matches;
  if (!category.isSplit && Array.isArray(bracketMatches) && bracketMatches.length > 0) {
    return bracketMatches.filter((match) => !match.isBye).length;
  }
  return estimateMatchCount(getEstimatedParticipantCount(category));
}

export function estimateCategoryDuration(category, durations = DEFAULT_MATCH_DURATIONS) {
  const detailType = getCategoryDetailType(category);
  const participantCount = getEstimatedParticipantCount(category);
  if (participantCount === 0) return 5;

  const matchCount = getEstimatedMatchCount(category);
  const matchDuration = Number(durations[detailType]) || 5;
  return Math.max(5, Math.ceil(matchCount * matchDuration));
}

/**
 * Tính toán tổng thời gian cần thiết cho toàn bộ giải đấu (phút)
 * và phân bổ vào số thảm
 * @param {Array} categories - danh sách hạng mục
 * @param {number} matCount - số thảm
 * @param {Object} durations - cài đặt thời lượng
 * @returns {Object} { totalMinutes, perMatMinutes, estimatedHours }
 */
export function estimateTotalScheduleTime(categories, matCount = 1, durations = DEFAULT_MATCH_DURATIONS) {
  const totalMinutes = categories.reduce((sum, cat) => {
    return sum + estimateCategoryDuration(cat, durations);
  }, 0);
  
  // Các thảm chạy song song → chia đều
  const perMatMinutes = Math.ceil(totalMinutes / Math.max(1, matCount));
  const estimatedHours = (perMatMinutes / 60).toFixed(1);
  
  return {
    totalMinutes,
    perMatMinutes,
    estimatedHours: parseFloat(estimatedHours),
  };
}

/**
 * Tính số ngày tối thiểu cần thiết
 * @param {Array} categories
 * @param {number} matCount
 * @param {number} availableMinutesPerDay - thời gian có thể thi đấu/ngày (phút)
 * @param {Object} durations
 * @returns {number} số ngày tối thiểu
 */
export function estimateRequiredDays(categories, matCount, availableMinutesPerDay, durations = DEFAULT_MATCH_DURATIONS) {
  const { perMatMinutes } = estimateTotalScheduleTime(categories, matCount, durations);
  if (availableMinutesPerDay <= 0) return 1;
  return Math.max(1, Math.ceil(perMatMinutes / availableMinutesPerDay));
}

/**
 * Smart auto-assign: phân bổ nội dung thông minh vào lịch
 * Dựa trên: số VĐV, loại nội dung, thời lượng ước tính
 * @param {Array} categories - danh sách hạng mục
 * @param {Array} tournamentDays - danh sách ngày thi đấu
 * @param {number} matCount - số thảm
 * @param {Object} sessionConfig - cấu hình buổi sáng/chiều
 * @param {Object} durations - thời lượng theo loại
 * @param {Object} existingSchedule - lịch hiện tại
 * @returns {Object} schedule mới
 */
export function convertTimeToMins(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function convertMinsToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function normalizeAgeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function getCategoryAgeOrder(category) {
  const explicitAge = normalizeAgeText(category.ageGroup);
  const text = explicitAge || normalizeAgeText(category.name);
  const labeledAge = text.match(/lua\s*tuoi\s*(\d+)/);
  if (labeledAge) return Number(labeledAge[1]);
  if (text.includes('vo dich tuyet doi')) return 18;
  if (explicitAge) {
    const number = explicitAge.match(/\d+/);
    if (number) return Number(number[0]);
  }
  const groups = [
    ["nhi dong", 6],
    ["thieu nhi", 9],
    ["thieu nien", 12],
    ["tre", 15],
    ["thanh nien", 18],
    ["senior", 18],
  ];
  return groups.find(([label]) => text.includes(label))?.[1] ?? Number.POSITIVE_INFINITY;
}

function getCategoryGender(category) {
  const gender = String(category.gender || "").toLowerCase();
  const name = ` ${normalizeAgeText(category.name)} `;
  if (gender === "female" || /\bnu\b/.test(name)) return "female";
  if (gender === "mixed" || name.includes("hon hop") || name.includes("mixed")) return "mixed";
  return "male";
}

function getStandardGenderOrder(category) {
  const gender = getCategoryGender(category);
  if (gender === "mixed") return 4;
  const team = isTeamCategory(category);
  if (!team && gender === "male") return 0;
  if (!team && gender === "female") return 1;
  if (team && gender === "male") return 2;
  if (team && gender === "female") return 3;
  return 4;
}

export function parseKarateCategory(category) {
  const name = normalizeAgeText(category.name);
  const discipline = String(category.type || "").toLowerCase() === "kata" || name.includes("kata") ? "kata" : "kumite";
  const gender = getCategoryGender(category);
  const team = isTeamCategory(category);
  const eventType = gender === "mixed" ? "mixed" : (team ? "team" : "individual");
  const explicitAgeText = normalizeAgeText(category.ageGroup);
  const ageText = explicitAgeText || name;
  const ageRange = ageText.match(/(\d+)\s*[-–]\s*(\d+)(?:\s*tuoi)?/);
  const ageSingle = ageText.match(/(\d+)\s*tuoi/);
  let ageMin = Number.POSITIVE_INFINITY;
  let ageMax = Number.POSITIVE_INFINITY;
  if (ageRange && (explicitAgeText || ageText.includes("tuoi"))) {
    ageMin = Number(ageRange[1]);
    ageMax = Number(ageRange[2]);
  } else if (ageSingle) {
    ageMin = Number(ageSingle[1]);
    ageMax = /tro len|\+|senior/.test(ageText) ? Number.POSITIVE_INFINITY : ageMin;
  } else if (explicitAgeText) {
    ageMin = getCategoryAgeOrder(category);
    ageMax = ageMin;
  }
  if (name.includes('vo dich tuyet doi') || explicitAgeText.includes('vo dich tuyet doi')) {
    ageMin = 18;
    ageMax = Number.POSITIVE_INFINITY;
  }
  const weightText = normalizeAgeText(category.weightClass || category.name);
  const above = weightText.match(/tren\s*(\d+(?:[.,]\d+)?)\s*kg?/);
  const below = weightText.match(/duoi\s*(\d+(?:[.,]\d+)?)\s*kg?/);
  const signed = weightText.match(/([+-])\s*(\d+(?:[.,]\d+)?)\s*kg/);
  const range = weightText.match(/(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*kg/);
  const plain = weightText.match(/(\d+(?:[.,]\d+)?)\s*kg/);
  let weightValue = null;
  let weightType = null;
  if (above && below) {
    weightValue = Number(below[1].replace(",", "."));
    weightType = "minus";
  } else if (above) {
    weightValue = Number(above[1].replace(",", "."));
    weightType = "plus";
  } else if (below) {
    weightValue = Number(below[1].replace(",", "."));
    weightType = "minus";
  } else if (signed) {
    weightValue = Number(signed[2].replace(",", "."));
    weightType = signed[1] === "+" ? "plus" : "minus";
  } else if (range) {
    weightValue = Number(range[2].replace(",", "."));
    weightType = "minus";
  } else if (plain) {
    weightValue = Number(plain[1].replace(",", "."));
    weightType = "minus";
  }  let priority = 99;
  if (discipline === "kata") {
    if (gender === "mixed") priority = 5;
    else if (!team && gender === "male") priority = 1;
    else if (!team && gender === "female") priority = 2;
    else if (team && gender === "male") priority = 3;
    else if (team && gender === "female") priority = 4;
  } else if (!team && gender === "male") priority = 6;
  else if (!team && gender === "female") priority = 7;
  else if (team && gender === "male") priority = 8;
  else if (team && gender === "female") priority = 9;
  return { discipline, eventType, gender, ageMin, ageMax, weightValue, weightType, priority };
}

function compareKarateCategories(a, b, originalOrder) {
  const keyA = parseKarateCategory(a);
  const keyB = parseKarateCategory(b);
  const weightTypeA = keyA.weightType === "plus" ? 1 : 0;
  const weightTypeB = keyB.weightType === "plus" ? 1 : 0;
  return keyA.priority - keyB.priority ||
    keyA.ageMin - keyB.ageMin ||
    keyA.ageMax - keyB.ageMax ||
    weightTypeA - weightTypeB ||
    (keyA.weightValue ?? Number.POSITIVE_INFINITY) - (keyB.weightValue ?? Number.POSITIVE_INFINITY) ||
    originalOrder.get(a.id) - originalOrder.get(b.id);
}

export function sortCategoriesByKarateStandard(categories) {
  const originalOrder = new Map(categories.map((category, index) => [category.id, index]));
  return [...categories].sort((a, b) => compareKarateCategories(a, b, originalOrder));
}

function getKarateSchedulingGroupKey(category) {
  const key = parseKarateCategory(category);
  return `${key.priority}:${key.ageMin}:${key.ageMax}`;
}

function getKataAgeGroupKey(category) {
  const key = parseKarateCategory(category);
  if (key.discipline === 'kata') return `kata:${key.ageMin}:${key.ageMax}`;
  const name = normalizeAgeText(category.name);
  if (!name.includes('vo dich tuyet doi')) return null;
  const level = name.includes('nang cao')
    ? 'nang_cao'
    : (name.includes('phong trao') ? 'phong_trao' : 'chung');
  return `tuyet_doi:${getCategoryGender(category)}:${level}`;
}
function compareCategoriesByPriority(
  a,
  b,
  priorityMode,
  originalOrder,
  customPriorityOrder = []
) {
  if (priorityMode === 'custom_order') {
    const customOrder = new Map(customPriorityOrder.map((id, index) => [id, index]));
    const rankA = customOrder.has(a.id) ? customOrder.get(a.id) : Number.MAX_SAFE_INTEGER;
    const rankB = customOrder.has(b.id) ? customOrder.get(b.id) : Number.MAX_SAFE_INTEGER;
    return rankA - rankB || originalOrder.get(a.id) - originalOrder.get(b.id);
  }

  // Chế độ tuổi chỉ đổi chiều lứa tuổi. Trong mỗi lứa tuổi luôn giữ:
  // Kata cá nhân Nam, cá nhân Nữ, đồng đội Nam, đồng đội Nữ, hỗn hợp,
  // sau đó mới tới Kumite.
  const canonicalA = parseKarateCategory(a);
  const canonicalB = parseKarateCategory(b);
  let canonicalAgeDifference = priorityMode === 'age_old_first'
    ? canonicalB.ageMin - canonicalA.ageMin
    : canonicalA.ageMin - canonicalB.ageMin;
  if (canonicalAgeDifference === 0 && canonicalA.ageMax !== canonicalB.ageMax) {
    canonicalAgeDifference = priorityMode === 'age_old_first'
      ? (canonicalB.ageMax < canonicalA.ageMax ? -1 : 1)
      : (canonicalA.ageMax < canonicalB.ageMax ? -1 : 1);
  }
  if (canonicalAgeDifference !== 0) return canonicalAgeDifference;
  if (canonicalA.priority !== canonicalB.priority) return canonicalA.priority - canonicalB.priority;
  const canonicalWeightTypeA = canonicalA.weightType === 'plus' ? 1 : 0;
  const canonicalWeightTypeB = canonicalB.weightType === 'plus' ? 1 : 0;
  if (canonicalWeightTypeA !== canonicalWeightTypeB) return canonicalWeightTypeA - canonicalWeightTypeB;
  const canonicalWeightDifference = (canonicalA.weightValue ?? Number.POSITIVE_INFINITY) -
    (canonicalB.weightValue ?? Number.POSITIVE_INFINITY);
  return canonicalWeightDifference || originalOrder.get(a.id) - originalOrder.get(b.id);

  if (priorityMode === "karate_standard") {
    const difference = compareKarateCategories(a, b, originalOrder);
    if (difference !== 0) return difference;
  }  if (priorityMode === "kata_first" || priorityMode === "kumite_first") {
    const preferredType = priorityMode === "kata_first" ? "kata" : "kumite";
    const typeDiff = Number(b.type === preferredType) - Number(a.type === preferredType);
    if (typeDiff !== 0) return typeDiff;
  }
  if (priorityMode === "age_young_first" || priorityMode === "age_old_first") {
    const ageA = getCategoryAgeOrder(a);
    const ageB = getCategoryAgeOrder(b);
    if (ageA !== ageB) {
      return priorityMode === "age_young_first" ? ageA - ageB : ageB - ageA;
    }
  }
  if (priorityMode === "standard_gender_order") {
    const rankDifference = getStandardGenderOrder(a) - getStandardGenderOrder(b);
    if (rankDifference !== 0) return rankDifference;
  }
  if (priorityMode === "custom_order") {
    const customOrder = new Map(customPriorityOrder.map((id, index) => [id, index]));
    const rankA = customOrder.has(a.id) ? customOrder.get(a.id) : Number.MAX_SAFE_INTEGER;
    const rankB = customOrder.has(b.id) ? customOrder.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
  }
  return originalOrder.get(a.id) - originalOrder.get(b.id);
}

export function getCategoryAgeKey(category) {
  const age = getCategoryAgeOrder(category);
  return Number.isFinite(age) ? String(age) : "unknown";
}

function assignAgeGroupsToDays(categories, tournamentDays, durations, priorityMode) {
  if (
    tournamentDays.length <= 1 ||
    (priorityMode !== "age_young_first" && priorityMode !== "age_old_first")
  ) {
    return new Map();
  }

  const groupDurations = new Map();
  categories.forEach((category) => {
    const key = getCategoryAgeKey(category);
    groupDurations.set(
      key,
      (groupDurations.get(key) || 0) + estimateCategoryDuration(category, durations)
    );
  });

  const dayLoads = new Map(tournamentDays.map((day) => [day, 0]));
  const groupDays = new Map();
  groupDurations.forEach((duration, key) => {
    const day = [...tournamentDays].sort(
      (a, b) => dayLoads.get(a) - dayLoads.get(b)
    )[0];
    groupDays.set(key, day);
    dayLoads.set(day, dayLoads.get(day) + duration);
  });
  return groupDays;
}
export function smartAutoAssign(
  categories,
  tournamentDays,
  matCount,
  sessionConfig,
  durations = DEFAULT_MATCH_DURATIONS,
  existingSchedule = {},
  options = {}
) {
  const {
    customEvents = [],
    priorityMode = "standard_gender_order",
    customPriorityOrder = [],
    ageGroupsByDay = {},
  } = options;
  const originalOrder = new Map(categories.map((category, index) => [category.id, index]));
  const prioritySortedCategories = [...categories].sort((a, b) =>
    compareCategoriesByPriority(
      a,
      b,
      priorityMode,
      originalOrder,
      customPriorityOrder
    )
  );
  const sortedCategories = prioritySortedCategories;
  if (priorityMode === "karate_standard") {
    console.groupCollapsed(`[AUTO SCHEDULE] Thứ tự chuẩn Karate (${sortedCategories.length} nội dung)`);
    console.table(sortedCategories.map((category, index) => ({
      STT: index + 1,
      "Nội dung": category.name,
      ...parseKarateCategory(category),
    })));
    console.groupEnd();
  }
  const isAgePriority =
    priorityMode === 'age_young_first' || priorityMode === 'age_old_first';


  const sessions = [
    {
      start: convertTimeToMins(sessionConfig.morningStart || "07:00"),
      end: convertTimeToMins(sessionConfig.morningEnd || "11:30"),
    },
    {
      start: convertTimeToMins(sessionConfig.afternoonStart || "13:00"),
      end: convertTimeToMins(sessionConfig.afternoonEnd || "17:30"),
    },
  ].filter((session) => session.end > session.start);

  const newSchedule = { ...existingSchedule };
  const scheduleLog = {};
  tournamentDays.forEach((day) => { scheduleLog[day] = []; });

  const addLogItem = (day, item) => {
    if (!scheduleLog[day]) scheduleLog[day] = [];
    scheduleLog[day].push(item);
  };

  for (const [catId, assignment] of Object.entries(existingSchedule)) {
    const category = categories.find((item) => item.id === catId);
    if (!category || !assignment.date) continue;
    const startMins = convertTimeToMins(assignment.time);
    const duration = assignment.endTime
      ? convertTimeToMins(assignment.endTime) - startMins
      : estimateCategoryDuration(category, durations);
    addLogItem(assignment.date, {
      catId,
      mat: assignment.mat,
      startMins,
      endMins: startMins + Math.max(5, duration),
      category,
    });
  }

  customEvents.forEach((event) => {
    const eventDays = event.date ? [event.date] : tournamentDays;
    const eventMats = Number(event.mat) === 0
      ? Array.from({ length: matCount }, (_, index) => index + 1)
      : [Number(event.mat)];
    const startMins = convertTimeToMins(event.time);
    const duration = Math.max(5, Number(event.duration) || 15);
    eventDays.forEach((day) => {
      eventMats.forEach((mat) => addLogItem(day, {
        catId: `event_${event.id || event.name}`,
        mat,
        startMins,
        endMins: startMins + duration,
        category: null,
        isEvent: true,
      }));
    });
  });

  const overlaps = (startA, endA, startB, endB) =>
    Math.max(startA, startB) < Math.min(endA, endB);

  const hasMatConflict = (day, mat, startMins, endMins) =>
    scheduleLog[day].some((item) =>
      item.mat === mat && overlaps(startMins, endMins, item.startMins, item.endMins)
    );

  const findEarliestFreeSlot = (day, mat, duration, minimumStart = 0) => {
    for (const session of sessions) {
      const firstStart = Math.max(session.start, Math.ceil(minimumStart / 5) * 5);
      for (let start = firstStart; start + duration <= session.end; start += 5) {
        const end = start + duration;
        if (!hasMatConflict(day, mat, start, end)) {
          return start;
        }
      }
    }
    return null;
  };

  const getLoad = (day, mat = null) =>
    scheduleLog[day]
      .filter((item) => !item.isEvent && (mat === null || item.mat === mat))
      .reduce((sum, item) => sum + (item.endMins - item.startMins), 0);

  const groupStarts = new Map();
  const lastGroupByDay = new Map();
  // Kata cùng lứa tuổi và các nhánh của cùng nhóm Vô địch tuyệt đối
  // phải xếp nối tiếp trên cùng ngày, cùng thảm.
  const kataAgeGroupLanes = new Map();

  for (const category of sortedCategories) {
    if (newSchedule[category.id]) continue;
    const duration = estimateCategoryDuration(category, durations);
    const candidates = [];
    const kataAgeGroup = getKataAgeGroupKey(category);
    const fixedKataLane = kataAgeGroup ? kataAgeGroupLanes.get(kataAgeGroup) : null;
    const isKarateStandard = priorityMode === "karate_standard";
    const schedulingGroup = isKarateStandard
      ? getKarateSchedulingGroupKey(category)
      : getCategoryAgeKey(category);
    const configuredAgeDays = isAgePriority
      ? tournamentDays.filter((day) => (ageGroupsByDay[day] || []).includes(getCategoryAgeKey(category)))
      : [];
    const configuredGroups = Object.values(ageGroupsByDay);
    const hasAgeDayConfig = configuredGroups.some((groups) => groups?.length > 0);
    const groupHasConfiguredDay = configuredGroups.some((groups) => groups?.includes(getCategoryAgeKey(category)));
    const eligibleDays = isAgePriority && hasAgeDayConfig
      ? (configuredAgeDays.length > 0
        ? configuredAgeDays
        : (groupHasConfiguredDay ? [] : [tournamentDays[tournamentDays.length - 1]]))
      : tournamentDays;

    for (const day of eligibleDays) {
      if (fixedKataLane && fixedKataLane.day !== day) continue;
      const lastGroup = lastGroupByDay.get(day);
      const groupStartKey = `${day}::${schedulingGroup}`;
      if (!groupStarts.has(groupStartKey)) {
        const minimumStart = !isKarateStandard && !isAgePriority && lastGroup && lastGroup !== schedulingGroup
          ? Math.max(
            0,
            ...scheduleLog[day]
              .filter((item) => !item.isEvent)
              .map((item) => item.endMins)
          )
          : 0;
        groupStarts.set(groupStartKey, minimumStart);
      }
      const categoryPhase = parseKarateCategory(category);
      const kataPhaseEnd = categoryPhase.discipline === 'kumite'
        ? Math.max(
          0,
          ...scheduleLog[day]
            .filter((item) => {
              if (!item.category) return false;
              const itemPhase = parseKarateCategory(item.category);
              return itemPhase.discipline === 'kata' &&
                itemPhase.ageMin === categoryPhase.ageMin &&
                itemPhase.ageMax === categoryPhase.ageMax;
            })
            .map((item) => item.endMins)
        )
        : 0;
      for (let mat = 1; mat <= matCount; mat += 1) {
        if (fixedKataLane && fixedKataLane.mat !== mat) continue;
        const lane = tournamentDays.indexOf(day) * matCount + (mat - 1);
        const earliestSlot = findEarliestFreeSlot(
          day,
          mat,
          duration,
          Math.max(groupStarts.get(groupStartKey), kataPhaseEnd)
        );
        if (earliestSlot === null) continue;
        candidates.push({
          day,
          dayIndex: tournamentDays.indexOf(day),
          mat,
          lane,
          earliestSlot,
          overtime: sessions.length > 0 && earliestSlot >= sessions[sessions.length - 1].end,
          dayLoad: getLoad(day),
          matLoad: getLoad(day, mat),
        });
      }
    }

    candidates.sort((a, b) => isKarateStandard
      ? a.dayIndex - b.dayIndex ||
        a.earliestSlot - b.earliestSlot ||
        a.matLoad - b.matLoad ||
        a.mat - b.mat
      : isAgePriority
        ? a.dayLoad - b.dayLoad ||
          a.earliestSlot - b.earliestSlot ||
          a.matLoad - b.matLoad ||
          a.mat - b.mat
      : a.dayLoad - b.dayLoad ||
        a.earliestSlot - b.earliestSlot ||
        a.matLoad - b.matLoad ||
        a.mat - b.mat
    );

    const chosen = candidates[0];
    if (!chosen) continue;
    if (kataAgeGroup && !fixedKataLane) {
      kataAgeGroupLanes.set(kataAgeGroup, { day: chosen.day, mat: chosen.mat });
    }
    if (!isKarateStandard) lastGroupByDay.set(chosen.day, schedulingGroup);
    const itemsOnMat = scheduleLog[chosen.day].filter(
      (item) => !item.isEvent && item.mat === chosen.mat
    ).length;
    newSchedule[category.id] = {
      mat: chosen.mat,
      time: convertMinsToTime(chosen.earliestSlot),
      endTime: convertMinsToTime(chosen.earliestSlot + duration),
      order: itemsOnMat + 1,
      date: chosen.day,
    };
    addLogItem(chosen.day, {
      catId: category.id,
      mat: chosen.mat,
      startMins: chosen.earliestSlot,
      endMins: chosen.earliestSlot + duration,
      category,
    });
  }
  return newSchedule;
}


export function addMinutesToTime(timeStr, mins) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(':').map(Number);
  const totalMins = h * 60 + m + Math.round(mins);
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Phát hiện các xung đột thực sự sau khi xếp lịch:
 * VĐV bị xếp thi đấu cùng thời điểm ở 2 thảm khác nhau trong cùng ngày.
 * @returns {Array} Danh sách conflict { date, time, catA, catB, matA, matB, athletes }
 */
export function detectScheduleConflicts(schedule, categories, durations = DEFAULT_MATCH_DURATIONS) {
  const conflicts = [];
  const entries = Object.entries(schedule)
    .map(([catId, s]) => {
      const category = categories.find(c => c.id === catId);
      if (!category) return null;
      const startMins = convertTimeToMins(s.time);
      const dur = estimateCategoryDuration(category, durations);
      return { 
        catId, ...s, 
        category, 
        startMins, 
        endMins: startMins + dur 
      };
    })
    .filter(Boolean);

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      
      // Khác thảm, cùng ngày
      if (a.date !== b.date || a.mat === b.mat) continue;

      // KIỂM TRA OVERLAP (SONG SONG)
      const isParallel = Math.max(a.startMins, b.startMins) < Math.min(a.endMins, b.endMins);
      if (!isParallel) continue;

      const overlapping = findAthleteConflicts(a.category, b.category);
      if (overlapping.length > 0) {
        conflicts.push({
          date: a.date,
          time: a.time,
          catA: a.category,
          catB: b.category,
          matA: a.mat,
          matB: b.mat,
          athletes: overlapping,
        });
      }
    }
  }
  return conflicts;
}



/**
 * Lấy tất cả VĐV trong 1 nội dung
 */
export function getAthletesInCategory(category) {
  return category.athletes || [];
}

/**
 * Kiểm tra xung đột VĐV giữa 2 nội dung
 * @returns {Array} danh sách VĐV bị trùng
 */
export function findAthleteConflicts(category1, category2) {
  const athletes1 = getAthletesInCategory(category1);
  const athletes2 = getAthletesInCategory(category2);

  const conflicts = [];
  for (const a1 of athletes1) {
    for (const a2 of athletes2) {
      if (
        a1.id === a2.id ||
        (a1.name && a2.name && a1.name.toLowerCase() === a2.name.toLowerCase() &&
         a1.club && a2.club && a1.club.toLowerCase() === a2.club.toLowerCase())
      ) {
        conflicts.push({
          name: a1.name,
          club: a1.club,
          category1Name: category1.name,
          category2Name: category2.name,
        });
      }
    }
  }
  return conflicts;
}

/**
 * Kiểm tra xung đột lịch thi đấu khi gán thảm + giờ
 */
export function checkScheduleConflicts(schedule, categories, targetCategoryId, mat, time, date) {
  const warnings = [];
  const targetCategory = categories.find(c => c.id === targetCategoryId);
  if (!targetCategory) return warnings;

  const sameMat = Object.entries(schedule).filter(
    ([catId, s]) => catId !== targetCategoryId && s.mat === mat && s.date === date
  );

  const otherMats = Object.entries(schedule).filter(
    ([catId, s]) => catId !== targetCategoryId && s.mat !== mat && s.time === time && s.date === date
  );

  for (const [catId, s] of otherMats) {
    const otherCategory = categories.find(c => c.id === catId);
    if (!otherCategory) continue;

    const conflicts = findAthleteConflicts(targetCategory, otherCategory);
    if (conflicts.length > 0) {
      warnings.push({
        type: 'athlete_conflict',
        severity: 'error',
        message: `⚠️ ${conflicts.length} VĐV bị trùng với "${otherCategory.name}" (Thảm ${s.mat}, ${s.time})`,
        details: conflicts.map(c => `${c.name} (${c.club})`),
        conflictCategoryId: catId,
        conflictCategoryName: otherCategory.name,
        conflictMat: s.mat,
        conflictTime: s.time,
      });
    }
  }

  for (const [catId, s] of sameMat) {
    if (s.time === time) {
      const otherCategory = categories.find(c => c.id === catId);
      warnings.push({
        type: 'same_time_same_mat',
        severity: 'error',
        message: `🚫 Trùng giờ với "${otherCategory?.name}" trên cùng Thảm ${mat} lúc ${time}`,
        conflictCategoryId: catId,
        conflictCategoryName: otherCategory?.name,
      });
    }
  }

  const allOtherMats = Object.entries(schedule).filter(
    ([catId, s]) => catId !== targetCategoryId && s.mat !== mat && s.date === date
  );

  const targetDur = estimateCategoryDuration(targetCategory);
  const targetStart = convertTimeToMins(time);
  const targetEnd = targetStart + targetDur;

  for (const [catId, s] of allOtherMats) {
    const otherCategory = categories.find(c => c.id === catId);
    if (!otherCategory) continue;

    const conflicts = findAthleteConflicts(targetCategory, otherCategory);
    if (conflicts.length === 0) continue;

    const sStart = convertTimeToMins(s.time);
    const sDur = estimateCategoryDuration(otherCategory);
    const sEnd = sStart + sDur;

    // KIỂM TRA SONG SONG (OVERLAP)
    const isParallel = Math.max(targetStart, sStart) < Math.min(targetEnd, sEnd);

    if (isParallel) {
      warnings.push({
        type: 'athlete_conflict',
        severity: 'error',
        message: `🚨 ${conflicts.length} VĐV THI ĐẤU SONG SONG tại Thảm ${s.mat} ("${otherCategory.name}", lúc ${s.time})`,
        details: conflicts.map(c => `${c.name} (${c.club})`),
        conflictCategoryId: catId,
        conflictCategoryName: otherCategory?.name,
        conflictMat: s.mat,
        conflictTime: s.time,
      });
    } else {
      // Khác giờ nhưng cùng ngày (VĐV thi nhiều nội dung)
      // Chỉ hiện warning nếu thời gian nghỉ quá ít (dưới 15 phút)
      const gap = Math.abs(targetStart > sStart ? targetStart - sEnd : sStart - targetEnd);
      if (gap < 15) {
        warnings.push({
          type: 'athlete_other_mat',
          severity: 'warning',
          message: `⚡ ${conflicts.length} VĐV thi đấu gần giờ tại Thảm ${s.mat} (cách ${gap} phút)`,
          details: conflicts.map(c => `${c.name} (${c.club})`),
          conflictCategoryId: catId,
        });
      }
    }
  }

  return warnings;
}

/**
 * Chia đôi sigma - khi 1 nội dung > maxAthletesPerBracket VĐV
 */
export function splitBracket(category, maxAthletesPerBracket = 18) {
  const athletes = getAthletesInCategory(category);
  
  if (athletes.length <= maxAthletesPerBracket) {
    return [{ 
      ...category, 
      splitIndex: 0, 
      totalSplits: 1,
      splitLabel: null,
    }];
  }

  const numSplits = Math.ceil(athletes.length / maxAthletesPerBracket);
  const perSplit = Math.ceil(athletes.length / numSplits);
  
  const splits = [];
  for (let i = 0; i < numSplits; i++) {
    const startIdx = i * perSplit;
    const endIdx = Math.min((i + 1) * perSplit, athletes.length);
    const splitAthletes = athletes.slice(startIdx, endIdx);
    
    splits.push({
      ...category,
      id: `${category.id}_split_${i}`,
      originalCategoryId: category.id,
      athletes: splitAthletes,
      splitIndex: i,
      totalSplits: numSplits,
      splitLabel: `Trận ${i + 1}/${numSplits}`,
      name: `${category.name} - Trận ${i + 1}/${numSplits}`,
    });
  }

  return splits;
}

/**
 * Tính toán chia đôi sigma cho tất cả nội dung
 */
export function computeAllSplits(categories, maxAthletesPerBracket = 18) {
  const allSplits = [];
  for (const cat of categories) {
    const splits = splitBracket(cat, maxAthletesPerBracket);
    allSplits.push(...splits);
  }
  return allSplits;
}

/**
 * Tạo danh sách thảm mặc định
 */
export function generateDefaultMats(count = 6) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Thảm ${i + 1}`,
    color: getMatColor(i + 1),
  }));
}

/**
 * Màu sắc cho từng thảm
 */
function getMatColor(matNumber) {
  const colors = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
  ];
  return colors[(matNumber - 1) % colors.length];
}

/**
 * Sắp xếp lịch thi đấu theo thảm và thời gian
 */
export function sortScheduleByMatAndTime(schedule, categories) {
  const entries = Object.entries(schedule)
    .map(([catId, s]) => {
      const cat = categories.find(c => c.id === catId);
      return { categoryId: catId, category: cat, ...s };
    })
    .filter(e => e.category);

  entries.sort((a, b) => {
    if (a.mat !== b.mat) return a.mat - b.mat;
    if (a.time !== b.time) return (a.time || '').localeCompare(b.time || '');
    return (a.order || 0) - (b.order || 0);
  });

  return entries;
}

/**
 * Tạo lịch dạng timeline cho hiển thị
 */
export function buildTimeline(schedule, categories) {
  const sorted = sortScheduleByMatAndTime(schedule, categories);
  const timeline = {};

  for (const entry of sorted) {
    const matKey = `mat_${entry.mat}`;
    if (!timeline[matKey]) {
      timeline[matKey] = {
        mat: entry.mat,
        matName: `Thảm ${entry.mat}`,
        color: getMatColor(entry.mat),
        items: [],
      };
    }
    timeline[matKey].items.push(entry);
  }

  return Object.values(timeline).sort((a, b) => a.mat - b.mat);
}

/**
 * Tạo các slot thời gian theo khoảng bước nhảy (phút)
 */
export function generateTimeSlotsFromRange(start, end, stepMinutes = 5) {
  const slots = [];
  if (!start || !end) return slots;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let current = sh * 60 + sm;
  const endMin = eh * 60 + em;
  while (current <= endMin) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    current += stepMinutes;
  }
  return slots;
}
