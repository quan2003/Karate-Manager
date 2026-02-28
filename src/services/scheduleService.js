/**
 * Schedule Service - Quản lý lịch thi đấu, chia thảm, chia đôi sigma
 * 
 * Features:
 * - Set thảm (mat) và giờ cho từng nội dung
 * - Phát hiện xung đột: VĐV đang đấu thảm này không thể ở thảm kia
 * - Chia đôi sigma khi nội dung > 18 VĐV 
 */

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
      // So sánh bằng tên + CLB (hoặc id nếu có)
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
 * @param {Object} schedule - lịch hiện tại { categoryId: { mat, time, order } }
 * @param {Array} categories - tất cả nội dung
 * @param {string} targetCategoryId - nội dung muốn set lịch
 * @param {number} mat - số thảm
 * @param {string} time - thời gian bắt đầu (HH:mm)
 * @returns {Array} danh sách cảnh báo
 */
export function checkScheduleConflicts(schedule, categories, targetCategoryId, mat, time) {
  const warnings = [];
  const targetCategory = categories.find(c => c.id === targetCategoryId);
  if (!targetCategory) return warnings;

  // Tìm tất cả nội dung cùng thảm, cùng giờ
  const sameMat = Object.entries(schedule).filter(
    ([catId, s]) => catId !== targetCategoryId && s.mat === mat
  );

  // Kiểm tra xung đột VĐV - VĐV đang đấu ở thảm khác cùng thời gian
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

  // Cảnh báo cùng thảm cùng giờ
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

  // Cảnh báo VĐV đang đấu thảm khác (bất kể giờ - cảnh báo nhẹ)
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
 * @param {Object} category - nội dung cần chia
 * @param {number} maxAthletesPerBracket - tối đa VĐV/sigma (mặc định 18)
 * @returns {Array} mảng các bracket đã chia
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

  // Tính số bracket cần chia
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
 * @param {Array} categories - tất cả nội dung
 * @param {number} maxAthletesPerBracket - tối đa VĐV/sigma
 * @returns {Array} tất cả bracket (đã chia)
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

  // Sort by mat first, then by time, then by order
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
