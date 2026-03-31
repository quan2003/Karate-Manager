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
  
  if (athleteCount === 0) return 5; // Mặc định 5 phút nếu chưa có VĐV

  const matchCount = estimateMatchCount(athleteCount);
  
  let matchDuration = durations[detailType] || 5;


  // Phương pháp chuẩn: Cứ mỗi trận tính đúng matchDuration (hiện tại mặc định 5 phút)
  // Xóa bỏ các công thức chia cho log2 gây sai lệch và nhân dồn làm phình thời gian
  return Math.ceil(matchCount * matchDuration);
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

export function smartAutoAssign(
  categories,
  tournamentDays,
  matCount,
  sessionConfig,
  durations = DEFAULT_MATCH_DURATIONS,
  existingSchedule = {}
) {
  // Ưu tiên xếp hạng mục Kata trước để tránh chấn thương
  // Các nội dung còn lại giữ nguyên thứ tự khai báo (thường là theo độ tuổi/hạng cân) thay vì xếp số lượng VĐV đông lên trước.
  const sortedCategories = [...categories].sort((a, b) => {
    const aIsKata = getCategoryDetailType(a).startsWith('kata') ? 1 : 0;
    const bIsKata = getCategoryDetailType(b).startsWith('kata') ? 1 : 0;
    
    if (aIsKata !== bIsKata) return bIsKata - aIsKata; // Kata lên trên
    
    // Sort logically by name if both are Kata or both are Kumite
    return a.name.localeCompare(b.name);
  });

  const morningStartMins = convertTimeToMins(sessionConfig.morningStart || "07:15");
  const morningEndMins = convertTimeToMins(sessionConfig.morningEnd || "11:30");
  const afternoonStartMins = convertTimeToMins(sessionConfig.afternoonStart || "13:00");

  const newSchedule = { ...existingSchedule };

  // Track the exact occupation per day
  const scheduleLog = {}; // log[day] = list of { catId, mat, startMins, endMins, athletes }
  tournamentDays.forEach(day => { scheduleLog[day] = []; });

  // Init log from existing schedule
  for (const [catId, s] of Object.entries(existingSchedule)) {
    const startMins = convertTimeToMins(s.time);
    const cat = categories.find(c => c.id === catId);
    const dur = estimateCategoryDuration(cat || {}, durations);
    
    if (!scheduleLog[s.date]) scheduleLog[s.date] = [];
    scheduleLog[s.date].push({
      catId, mat: s.mat,
      startMins: startMins, 
      endMins: startMins + dur,
      athletes: cat?.athletes || []
    });
  }

  function getMatCount(day, mat) {
    return scheduleLog[day].filter(x => x.mat === mat).length;
  }
  function getDayCount(day) {
    return scheduleLog[day].length;
  }
  
  // Check if a category overlaps with another on the SAME MAT
  function isMatOccupied(day, mat, startMins, endMins) {
    const matItems = scheduleLog[day].filter(x => x.mat === mat);
    for (const item of matItems) {
      if (!(endMins <= item.startMins || startMins >= item.endMins)) return true;
    }
    return false;
  }

  // Check if athlete conflicts across ANY MAT
  function hasAthleteConflict(cat, day, startMins, endMins) {
    for (const item of scheduleLog[day]) {
      if (!(endMins <= item.startMins || startMins >= item.endMins)) {
        const assignedCat = categories.find(c => c.id === item.catId);
        if (assignedCat && findAthleteConflicts(cat, assignedCat).length > 0) return true;
      }
    }
    return false;
  }

  function findEarliestFreeSlot(cat, day, mat, dur) {
    let s = morningStartMins;
    while (s < 1440) { // max 24 hours
      // Nếu khe thời gian hiện tại rơi vào giờ nghỉ trưa, nhảy thẳng sang đầu giờ chiều
      if (s >= morningEndMins && s < afternoonStartMins) {
        s = afternoonStartMins;
        continue;
      }
      
      const end = s + dur;
      if (!isMatOccupied(day, mat, s, end) && !hasAthleteConflict(cat, day, s, end)) {
        return s;
      }
      s += 5; // step 5 phút
    }
    return 1440;
  }

  for (const cat of sortedCategories) {
    if (newSchedule[cat.id]) continue; // already assigned
    const dur = estimateCategoryDuration(cat, durations);

    // Candidates: all combination of Day and Mat
    const candidates = [];
    for (const day of tournamentDays) {
      for (let mat = 1; mat <= matCount; mat++) {
        const earliestSlot = findEarliestFreeSlot(cat, day, mat, dur);
        candidates.push({
          day, mat, earliestSlot,
          dayItems: getDayCount(day),
          matItems: getMatCount(day, mat)
        });
      }
    }

    // ⭐ Rule to balance:
    // 1. Day with least items
    // 2. Mat with least items
    // 3. Earliest possible slot
    candidates.sort((a, b) => {
      if (a.dayItems !== b.dayItems) return a.dayItems - b.dayItems; // balance days
      if (a.matItems !== b.matItems) return a.matItems - b.matItems; // balance mats
      return a.earliestSlot - b.earliestSlot; // keep it early
    });

    const chosen = candidates[0];
    const startMins = chosen.earliestSlot;
    
    newSchedule[cat.id] = {
      mat: chosen.mat,
      time: convertMinsToTime(startMins),
      order: chosen.matItems + 1,
      date: chosen.day
    };
    
    scheduleLog[chosen.day].push({
      catId: cat.id,
      mat: chosen.mat,
      startMins: startMins,
      endMins: startMins + dur,
      athletes: cat.athletes
    });
  }

  // Sort them sequentially by time so order numbers are nice
  Object.values(newSchedule).forEach(s => {
    const timeVal = s.time.replace(':', '');
    s._sortVal = parseInt(timeVal);
  });
  
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
export function detectScheduleConflicts(schedule, categories) {
  const conflicts = [];
  const entries = Object.entries(schedule)
    .map(([catId, s]) => {
      const category = categories.find(c => c.id === catId);
      if (!category) return null;
      const startMins = convertTimeToMins(s.time);
      const dur = estimateCategoryDuration(category);
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
