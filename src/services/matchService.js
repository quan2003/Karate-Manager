/**
 * Match Service - Xử lý file .kmatch cho Thư ký bấm điểm
 */

import * as XLSX from 'xlsx';

// Version hiện tại
const KMATCH_VERSION = '1.0.0';

/**
 * Tạo file .kmatch từ dữ liệu giải đấu
 * @param {Object} tournament - Thông tin giải đấu
 * @param {Array} categories - Danh sách hạng mục với brackets
 * @param {Object} settings - Cài đặt (cho phép bấm điểm, thời gian, v.v.)
 */
export function createKmatchData(tournament, categories, settings = {}) {
  const data = {
    version: KMATCH_VERSION,
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    tournamentDate: tournament.startDate || tournament.date,
    location: tournament.location,
    
    // Thời gian cho phép bấm điểm
    startTime: settings.startTime || null,
    endTime: settings.endTime || null,
    scoringEnabled: settings.scoringEnabled !== false,
    
    // Danh sách hạng mục và trận đấu
    categories: categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      type: cat.type || 'kumite',
      athletes: cat.athletes || [],
      bracket: cat.bracket || null,
      matches: extractMatchesFromBracket(cat.bracket) || []
    })),
    
    createdAt: new Date().toISOString()
  };
  
  return data;
}

/**
 * Trích xuất danh sách trận đấu từ bracket
 */
function extractMatchesFromBracket(bracket) {
  if (!bracket) return [];

  // Support for new flat structure (drawEngine.js)
  if (bracket.matches && Array.isArray(bracket.matches)) {
    return bracket.matches.map(match => ({
      id: match.id,
      round: match.round,
      matchNumber: match.matchNumber,
      athlete1: match.athlete1,
      athlete2: match.athlete2,
      winner: match.winner,
      score1: match.score1,
      score2: match.score2,
      isBye: match.isBye
    }));
  }
  
  // Legacy support for nested rounds structure
  if (bracket.rounds && Array.isArray(bracket.rounds)) {
    const matches = [];
    bracket.rounds.forEach((round, roundIndex) => {
      if (round.matches && Array.isArray(round.matches)) {
        round.matches.forEach((match, matchIndex) => {
          matches.push({
            id: match.id || `r${roundIndex}_m${matchIndex}`,
            round: roundIndex + 1, // Normalized to 1-based if strictly loop index
            matchNumber: match.matchNumber || (matchIndex + 1),
            athlete1: match.athlete1 || null,
            athlete2: match.athlete2 || null,
            winner: match.winner || null,
            scores: match.scores || null
          });
        });
      }
    });
    return matches;
  }
  
  return [];
}

/**
 * Encode file .kmatch (Base64)
 */
export function encodeKmatchFile(data) {
  const jsonString = JSON.stringify(data, null, 2);
  // Encode to Base64
  const base64 = btoa(unescape(encodeURIComponent(jsonString)));
  return base64;
}

/**
 * Decode file .kmatch
 */
export function decodeKmatchFile(fileContent) {
  try {
    // Decode Base64
    const jsonString = decodeURIComponent(escape(atob(fileContent.trim())));
    const data = JSON.parse(jsonString);
    
    // Validate structure
    if (!data.tournamentId || !data.categories) {
      throw new Error('Invalid .kmatch file structure');
    }
    
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Validate kết quả trận đấu
 */
export function validateMatchResult(result, matchType = 'kumite') {
  const errors = [];
  
  if (matchType === 'kumite') {
    // Kumite: cần có điểm và flags
    if (result.score1 === undefined) errors.push('Thiếu điểm VĐV 1');
    if (result.score2 === undefined) errors.push('Thiếu điểm VĐV 2');
  } else if (matchType === 'kata') {
    // Kata: cần có điểm từ các trọng tài
    if (!result.judges || result.judges.length === 0) {
      errors.push('Thiếu điểm từ trọng tài');
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Lưu file .kmatch qua Electron IPC hoặc download
 */
export async function saveKmatchFile(data, suggestedName) {
  const encoded = encodeKmatchFile(data);
  
  if (window.electronAPI?.saveKmatchFile) {
    return await window.electronAPI.saveKmatchFile(encoded, suggestedName);
  } else {
    // Browser fallback - trigger download
    const blob = new Blob([encoded], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName || 'match_data.kmatch';
    a.click();
    URL.revokeObjectURL(url);
    return { success: true };
  }
}

/**
 * Mở file .kmatch qua Electron IPC hoặc file input
 */
export async function openKmatchFile() {
  if (window.electronAPI?.openKmatchFile) {
    const result = await window.electronAPI.openKmatchFile();
    if (result.success && result.content) {
      return decodeKmatchFile(result.content);
    }
    return result;
  } else {
    // Browser fallback
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.kmatch';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
          resolve({ success: false, error: 'No file selected' });
          return;
        }
        try {
          const content = await file.text();
          resolve(decodeKmatchFile(content));
        } catch (error) {
          resolve({ success: false, error: error.message });
        }
      };
      input.click();
    });
  }
}

/**
 * Xuất kết quả bấm điểm ra JSON
 */
export async function exportResultsToJson(data) {
  const jsonStr = JSON.stringify(data, null, 2);
  
  if (window.electronAPI?.saveExportFile) {
    return await window.electronAPI.saveExportFile(
      jsonStr,
      `ket_qua_${data.tournamentName || 'match'}_${new Date().toISOString().split('T')[0]}.json`,
      'json'
    );
  } else {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ket_qua_${data.tournamentName || 'match'}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return { success: true };
  }
}

/**
 * Xuất kết quả ra Excel
 */
export async function exportResultsToExcel(data) {
  const workbook = XLSX.utils.book_new();
  
  // Sheet thông tin
  const infoData = [
    ['Giải đấu', data.tournamentName || ''],
    ['Thời gian xuất', new Date().toLocaleString('vi-VN')],
    ['Tổng số kết quả', data.results?.length || 0]
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet(infoData);
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'Thông tin');
  
  // Sheet kết quả
  if (data.results && data.results.length > 0) {
    const resultsData = [
      ['Match ID', 'VĐV 1', 'Điểm 1', 'VĐV 2', 'Điểm 2', 'Người thắng', 'Ghi chú']
    ];
    
    data.results.forEach(r => {
      resultsData.push([
        r.matchId,
        r.athlete1Name || '',
        r.score1 || 0,
        r.athlete2Name || '',
        r.score2 || 0,
        r.winner || '',
        r.notes || ''
      ]);
    });
    
    const resultsSheet = XLSX.utils.aoa_to_sheet(resultsData);
    XLSX.utils.book_append_sheet(workbook, resultsSheet, 'Kết quả');
  }
  
  // Save
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  if (window.electronAPI?.saveExportFile) {
    const fileName = `ket_qua_${data.tournamentName || 'match'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    // Convert to base64 for Electron
    const reader = new FileReader();
    return new Promise((resolve) => {
      reader.onloadend = async () => {
        const base64 = reader.result.split(',')[1];
        const result = await window.electronAPI.saveExportFile(base64, fileName, 'xlsx');
        resolve(result);
      };
      reader.readAsDataURL(blob);
    });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ket_qua_${data.tournamentName || 'match'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    return { success: true };
  }
}
