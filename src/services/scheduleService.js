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
  kata_individual: 15,    // Kata cá nhân: ~15 phút/hạng mục (ít VĐV, vòng loại nhanh)
  kata_team: 25,          // Kata đồng đội: ~25 phút/hạng mục (3 người biểu diễn)
  kumite_individual: 20,  // Kumite cá nhân: ~20 phút/hạng mục (nhiều trận)
  kumite_team: 35,        // Kumite đồng đội: ~35 phút/hạng mục (3 trận/đội, nhiều thời gian)
};

/**
 * Xác định loại chi tiết của hạng mục (để tính thời lượng)
 */
export function getCategoryDetailType(category) {
  const isKata = category.type === 'kata';
  const isTeam = category.isTeam || category.name?.toLowerCase().includes('đồng đội') || 
                 category.name?.toLowerCase().includes('doi') ||
                 category.name?.toLowerCase().includes('team');
  
  if (isKata && isTeam) return 'kata_team';
  if (isKata && !isTeam) return 'kata_individual';
  if (!isKata && isTeam) return 'kumite_team';
  return 'kumite_individual';
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
export function estimateCategoryDuration(category, durations = DEFAULT_MATCH_DURATIONS) {
  const detailType = getCategoryDetailType(category);
  const athleteCount = category.athletes?.length || 0;
  
  if (athleteCount === 0) return durations[detailType] || 20; // Mặc định nếu chưa có VĐV
  
  // Số trận trong single elimination
  const matchCount = estimateMatchCount(athleteCount);
  
  // Thời lượng mỗi trận theo loại
  const matchDuration = durations[detailType] || 20;
  
  if (['kata_individual', 'kata_team'].includes(detailType)) {
    // Kata: mỗi VĐV/đội biểu diễn khoảng matchDuration phút
    // Không phải "trận vs trận" mà là từng người lần lượt
    // Chia theo số vòng (thường 2-3 vòng cho kata)
    const rounds = Math.ceil(Math.log2(athleteCount)) || 1;
    return Math.ceil(athleteCount * matchDuration / (rounds > 0 ? rounds : 1));
  } else {
    // Kumite: mỗi trận khoảng matchDuration phút (bao gồm cả chuẩn bị)
    // Các trận trong 1 vòng có thể song song, nhưng tính tuần tự cho 1 thảm
    return Math.ceil(matchCount * matchDuration);
  }
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
export function smartAutoAssign(
  categories,
  tournamentDays,
  matCount,
  sessionConfig,
  durations = DEFAULT_MATCH_DURATIONS,
  existingSchedule = {}
) {
  // Sắp xếp nội dung: kata trước (thường nhanh hơn), rồi đến kumite
  // Trong mỗi loại: đồng đội trước (nhiều thời gian), cá nhân sau
  const sortedCategories = [...categories].sort((a, b) => {
    const typeOrder = { kata_team: 0, kata_individual: 1, kumite_team: 2, kumite_individual: 3 };
    const aType = getCategoryDetailType(a);
    const bType = getCategoryDetailType(b);
    const typeDiff = (typeOrder[aType] || 0) - (typeOrder[bType] || 0);
    if (typeDiff !== 0) return typeDiff;
    // Cùng loại: ưu tiên ít VĐV hơn để tránh dồn thảm
    return (a.athletes?.length || 0) - (b.athletes?.length || 0);
  });

  const morningSlots = generateTimeSlotsFromRange(sessionConfig.morningStart, sessionConfig.morningEnd, 30);
  const afternoonSlots = generateTimeSlotsFromRange(sessionConfig.afternoonStart, sessionConfig.afternoonEnd, 30);
  const allSlots = [...morningSlots, ...afternoonSlots];
  if (allSlots.length === 0) return existingSchedule;

  const newSchedule = { ...existingSchedule };

  // Tracking: số phút đã dùng trên mỗi thảm trong mỗi ngày
  // key: "date_mat", value: phút đã dùng
  const matTimeUsed = {};
  const availablePerSlot = 30; // 30 phút/slot

  // Tính thời gian có thể dùng mỗi ngày (phút)
  const minsPerDay = allSlots.length * availablePerSlot; // 30 phút/slot × số slot

  for (const cat of sortedCategories) {
    if (newSchedule[cat.id]) continue; // Đã xếp thì bỏ qua

    const catDuration = estimateCategoryDuration(cat, durations);
    // Tìm slot vừa đủ trong ngày+thảm chưa quá tải
    // Tìm (day, mat) trống nhiều nhất trong ngày+thảm chưa quá tải
    let bestKey = null;
    let minUsed = Infinity;
    let bestDay = null;
    let bestMat = null;

    for (const day of tournamentDays) {
      for (let mat = 1; mat <= matCount; mat++) {
        const key = `${day}_${mat}`;
        const used = matTimeUsed[key] || 0;

        if (used < minUsed && used + catDuration <= minsPerDay) {
          minUsed = used;
          bestKey = key;
          bestDay = day;
          bestMat = mat;
        }
      }
    }

    let assigned = false;
    if (bestKey !== null) {
      // Tính slot bắt đầu dựa trên số phút đã dùng
      const slotIdx = Math.min(Math.floor(minUsed / availablePerSlot), allSlots.length - 1);
      const time = allSlots[slotIdx];
      const order = Object.values(newSchedule).filter(s => s.mat === bestMat && s.date === bestDay).length + 1;

      newSchedule[cat.id] = { mat: bestMat, time, order, date: bestDay };
      matTimeUsed[bestKey] = (matTimeUsed[bestKey] || 0) + catDuration;
      assigned = true;
    }

    if (!assigned) {
      // Overflow: put on last day, mat 1
      const lastDay = tournamentDays[tournamentDays.length - 1];
      const order = Object.values(newSchedule).filter(s => s.mat === 1 && s.date === lastDay).length + 1;
      newSchedule[cat.id] = { mat: 1, time: allSlots[allSlots.length - 1], order: order + 100, date: lastDay };
    }
  }

  return newSchedule;
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
export function checkScheduleConflicts(schedule, categories, targetCategoryId, mat, time) {
  const warnings = [];
  const targetCategory = categories.find(c => c.id === targetCategoryId);
  if (!targetCategory) return warnings;

  const sameMat = Object.entries(schedule).filter(
    ([catId, s]) => catId !== targetCategoryId && s.mat === mat
  );

  const otherMats = Object.entries(schedule).filter(
    ([catId, s]) => catId !== targetCategoryId && s.mat !== mat && s.time === time
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
    ([catId, s]) => catId !== targetCategoryId && s.mat !== mat
  );

  for (const [catId, s] of allOtherMats) {
    const otherCategory = categories.find(c => c.id === catId);
    if (!otherCategory) continue;

    const conflicts = findAthleteConflicts(targetCategory, otherCategory);
    if (conflicts.length > 0 && s.time !== time) {
      warnings.push({
        type: 'athlete_other_mat',
        severity: 'warning',
        message: `⚡ ${conflicts.length} VĐV cũng thi đấu tại Thảm ${s.mat} (${otherCategory.name}, lúc ${s.time})`,
        details: conflicts.map(c => `${c.name} (${c.club})`),
        conflictCategoryId: catId,
        conflictCategoryName: otherCategory?.name,
        conflictMat: s.mat,
        conflictTime: s.time,
      });
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
export function generateTimeSlotsFromRange(start, end, stepMinutes = 30) {
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
