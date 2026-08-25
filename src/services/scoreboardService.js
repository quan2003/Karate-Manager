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
export function openScoreboard(match, categoryType, categoryName, tournamentName, roundName, scheduleInfo = null, sponsorLogos = null, categoryId = null, categoryData = null) {
  // Always send an explicit logo configuration for the current tournament.
  // An empty sponsor list tells the scoreboard to show the K-SPORT default
  // instead of reusing logos left in another scoreboard session.
  const currentTournamentLogos = {
    ...(sponsorLogos || {}),
    sponsors: Array.isArray(sponsorLogos?.sponsors) ? sponsorLogos.sponsors : [],
  };

  // Chuẩn bị data để gửi sang scoreboard
  const resolveMembers = (participant) => {
    if (Array.isArray(participant?.members) && participant.members.length > 0) {
      return participant.members;
    }
    const bracket = categoryData?.bracket || {};
    const matches = [
      ...(Array.isArray(bracket.matches) ? bracket.matches : []),
      ...(Array.isArray(bracket.auxiliaryMatches) ? bracket.auxiliaryMatches : []),
    ];
    const candidates = matches.flatMap((item) => [
      item?.athlete1,
      item?.athlete2,
      item?.winner && typeof item.winner === "object" ? item.winner : null,
    ]).filter(Boolean);
    const sameTeam = candidates.find((candidate) =>
      candidate.id === participant?.id &&
      Array.isArray(candidate.members) &&
      candidate.members.length > 0
    );
    if (sameTeam?.members?.length) return sameTeam.members;

    // A team propagated to a later bracket round can lose its nested members
    // while retaining only the team id/name. Recover only athletes registered
    // in this category and belonging to that exact club/team.
    const normalizeTeamName = (value) => String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    const teamNames = new Set([
      normalizeTeamName(participant?.name),
      normalizeTeamName(participant?.club),
    ].filter(Boolean));
    const categoryAthletes = Array.isArray(categoryData?.athletes) ? categoryData.athletes : [];
    const participantId = String(participant?.id || "").toLowerCase().replace(/-/g, "_");
    const idMembers = categoryAthletes.filter((athlete) => {
      const athleteId = String(athlete?.id || "").toLowerCase().replace(/-/g, "_");
      return athleteId.length > 8 && participantId.includes(athleteId);
    });
    if (idMembers.length) return idMembers;

    const canonicalClub = (value) => normalizeTeamName(value)
      .replace(/\b(CLB|NDK|KARATE|KARATEDO|KARATE DO|VO DUONG)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const canonicalTeams = [...teamNames].map(canonicalClub).filter(Boolean);
    return categoryAthletes.filter((athlete) => {
      const club = canonicalClub(athlete?.club);
      return canonicalTeams.some((team) =>
        club === team ||
        (team.length >= 4 && club.includes(team)) ||
        (club.length >= 4 && team.includes(club))
      );
    });
  };

  const athlete1Members = resolveMembers(match.athlete1);
  const athlete2Members = resolveMembers(match.athlete2);

  const pendingMatch = {
    matchId: match.id,
    categoryId,
    categoryType,
    categoryName,
    categoryAthletes: (Array.isArray(categoryData?.athletes) ? categoryData.athletes : []).map((athlete) => ({
      id: athlete?.id || null,
      name: athlete?.name || "",
      club: athlete?.club || "",
      isTeam: athlete?.isTeam === true,
    })),
    teamRosters: {
      aka: athlete1Members,
      ao: athlete2Members,
    },
    tournamentName,
    roundName,
    athlete1: match.athlete1 ? {
      id: match.athlete1.id,
      name: match.athlete1.name,
      club: match.athlete1.club || '',
      members: athlete1Members,
    } : null,
    athlete2: match.athlete2 ? {
      id: match.athlete2.id,
      name: match.athlete2.name,
      club: match.athlete2.club || '',
      members: athlete2Members,
    } : null,
    // Existing scores for re-editing completed matches
    score1: match.score1,
    score2: match.score2,
    kata1: match.kata1 || '',
    kata2: match.kata2 || '',
    hasWinner: !!match.winner,
    winnerId: match.winner || null,
    // Schedule info (mat number)
    matNumber: scheduleInfo?.mat || null,
    // Sponsor logos (base64 images)
    sponsorLogos: currentTournamentLogos,
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
  
  // Open the audience display from the same user click that launches the
  // scoreboard. Using the same window names as the manual buttons makes a
  // later manual click focus/reuse the display instead of creating duplicates.
  const displayPath = scoreboardPath.replace(/admin\.html(?:[?#].*)?$/, "display.html");
  const displayWindowName = categoryType === "kata"
    ? "KarateScoreboardDisplay"
    : "KumiteDisplay";
  window.open(
    displayPath,
    displayWindowName,
    "width=1920,height=1080,resizable=yes"
  );

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
    const deliverMatch = () => {
      try {
        popup.postMessage({ type: 'LOAD_SCOREBOARD_MATCH', match: pendingMatch }, '*');
      } catch (error) {
        console.warn('Scoreboard match delivery failed:', error);
      }
    };
    deliverMatch();
    popup.addEventListener('load', deliverMatch, { once: true });
    setTimeout(deliverMatch, 150);
    setTimeout(deliverMatch, 500);
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
    } else if (event.data && event.data.type === 'MATCH_LOG_UPDATE') {
      // Bắn trực tiếp vào SQLite bằng sessionData IPC
      if (window.electronAPI?.db?.setSessionData) {
        window.electronAPI.db.setSessionData('GLOBAL', `match_log_${event.data.matchId}`, JSON.stringify(event.data.logs))
          .catch(err => console.log('Error saving log to SQLite:', err));
      }
    } else if (event.data && event.data.type === 'MATCH_LOG_REQUEST') {
      const matchId = event.data.matchId;
      const replyTarget = event.source;
      if (matchId && replyTarget && window.electronAPI?.db?.getSessionData) {
        window.electronAPI.db.getSessionData('GLOBAL', `match_log_${matchId}`)
          .then((value) => {
            let logs = [];
            try {
              logs = value ? JSON.parse(value) : [];
            } catch (error) {
              console.error('Error parsing match log from SQLite:', error);
            }
            replyTarget.postMessage({
              type: 'MATCH_LOG_RESPONSE',
              matchId,
              logs,
            }, '*');
          })
          .catch((error) => console.error('Error loading match log from SQLite:', error));
      }
    } else if (event.data && event.data.type === 'MATCH_LOG_DELETE') {
      const matchId = event.data.matchId;
      if (matchId && window.electronAPI?.db?.deleteSessionData) {
        window.electronAPI.db.deleteSessionData('GLOBAL', `match_log_${matchId}`)
          .catch((error) => console.error('Error deleting match log from SQLite:', error));
      }
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
