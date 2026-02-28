/**
 * Scoreboard Integration Service
 * Quản lý việc mở scoreboard và nhận kết quả từ kata/kumite scoreboard
 */

const PENDING_MATCH_KEY = 'pending_match';
const MATCH_RESULT_KEY = 'match_result';

/**
 * Mở scoreboard popup với thông tin trận đấu
 * @param {Object} match - Match data từ bracket
 * @param {string} categoryType - 'kumite' hoặc 'kata'
 * @param {string} categoryName - Tên hạng mục (vd: "Kumite Nam -60kg")
 * @param {string} tournamentName - Tên giải đấu
 * @param {string} roundName - Tên vòng đấu (vd: "Bán kết")
 */
export function openScoreboard(match, categoryType, categoryName, tournamentName, roundName) {
  // Chuẩn bị data để gửi sang scoreboard
  const pendingMatch = {
    matchId: match.id,
    categoryType,
    categoryName,
    tournamentName,
    roundName,
    athlete1: match.athlete1 ? {
      id: match.athlete1.id,
      name: match.athlete1.name,
      club: match.athlete1.club || '',
      members: match.athlete1.members || [],
    } : null,
    athlete2: match.athlete2 ? {
      id: match.athlete2.id,
      name: match.athlete2.name,
      club: match.athlete2.club || '',
      members: match.athlete2.members || [],
    } : null,
    // Existing scores for re-editing completed matches
    score1: match.score1,
    score2: match.score2,
    hasWinner: !!match.winner,
    timestamp: Date.now(),
  };
  
  // Lưu vào localStorage để scoreboard đọc
  localStorage.setItem(PENDING_MATCH_KEY, JSON.stringify(pendingMatch));
  
  // Xác định URL scoreboard dựa vào loại và môi trường
  const scoreboardFolder = categoryType === 'kata' 
    ? 'kata-scoreboard'
    : 'kumite-scoreboard';
  
  // Kiểm tra môi trường: development (localhost) hay production (Electron/file)
  const isElectron = window.location.protocol === 'file:' || 
    (typeof process !== 'undefined' && process.versions && process.versions.electron);
  const isDev = window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1';
  
  let scoreboardPath;
  if (isDev) {
    // Development: Vite dev server
    scoreboardPath = `/${scoreboardFolder}/admin.html`;
  } else if (isElectron || window.location.protocol === 'file:') {
    // Production Electron: file relative to app root
    // Get the base path from current location
    const basePath = window.location.pathname.replace(/\/dist\/.*$/, '').replace(/\/index\.html$/, '');
    scoreboardPath = `${basePath}/${scoreboardFolder}/admin.html`;
  } else {
    // Production web: relative path
    scoreboardPath = `/${scoreboardFolder}/admin.html`;
  }
  
  // Mở popup window
  const width = 1400;
  const height = 900;
  const left = (window.screen.width - width) / 2;
  const top = (window.screen.height - height) / 2;
  
  const popup = window.open(
    scoreboardPath,
    'scoreboard',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
  
  if (popup) {
    popup.focus();
  } else {
    alert('Không thể mở bảng điểm. Vui lòng kiểm tra cài đặt popup blocker.');
  }
  
  return popup;
}

/**
 * Lắng nghe kết quả trận đấu từ scoreboard
 * @param {Function} callback - Hàm xử lý khi có kết quả
 * @returns {Function} - Hàm để cleanup listener
 */
export function listenForMatchResult(callback) {
  const handleStorageChange = (event) => {
    if (event.key === MATCH_RESULT_KEY && event.newValue) {
      try {
        const result = JSON.parse(event.newValue);
        callback(result);
        // Cleanup sau khi nhận kết quả
        cleanupMatchData();
      } catch (error) {
        console.error('Error parsing match result:', error);
      }
    }
  };
  
  // Cũng lắng nghe postMessage từ popup
  const handleMessage = (event) => {
    if (event.data && event.data.type === 'MATCH_RESULT') {
      callback(event.data.result);
      cleanupMatchData();
    }
  };
  
  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('message', handleMessage);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('message', handleMessage);
  };
}

/**
 * Dọn dẹp data tạm trong localStorage
 */
export function cleanupMatchData() {
  localStorage.removeItem(PENDING_MATCH_KEY);
  localStorage.removeItem(MATCH_RESULT_KEY);
}

/**
 * Lấy pending match data (dùng trong scoreboard)
 * @returns {Object|null}
 */
export function getPendingMatch() {
  try {
    const data = localStorage.getItem(PENDING_MATCH_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting pending match:', error);
    return null;
  }
}

/**
 * Gửi kết quả trận đấu về React app (gọi từ scoreboard)
 * @param {Object} result - { matchId, winnerId, score1, score2 }
 */
export function sendMatchResult(result) {
  // Lưu vào localStorage
  localStorage.setItem(MATCH_RESULT_KEY, JSON.stringify(result));
  
  // Gửi postMessage đến opener window
  if (window.opener) {
    window.opener.postMessage({
      type: 'MATCH_RESULT',
      result,
    }, '*');
  }
}
