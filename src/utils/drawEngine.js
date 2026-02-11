import { v4 as uuidv4 } from 'uuid';

/**
 * Bracket Generation Engine - WKF Standard (Improved)
 * 
 * Logic phân bố:
 * 1. Số bracket = 2^n (ví dụ 32 slot cho 20 VĐV)
 * 2. Số trận vòng 1 = bracketSize / 2 = 16 trận.
 * 3. Số BYE = 32 - 20 = 12.
 * 4. Số trận được BYE (chỉ có 1 VĐV) = 12.
 * 5. Số trận Full (2 VĐV đấu nhau) = 16 - 12 = 4.
 * 
 * Nguyên tắc Seeding:
 * - Các trận chứa hạt giống cao (Seed 1, 2, 3...) được ưu tiên nhận BYE.
 * - Các trận còn lại (ít ưu tiên hơn) sẽ là các trận đấu (Full Matches).
 */

// ============ HELPER FUNCTIONS ============

function nextPowerOf2(n) {
  let power = 1;
  while (power < n) power *= 2;
  return power;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sameClub(athlete1, athlete2) {
  if (!athlete1 || !athlete2) return false;
  if (!athlete1.club || !athlete2.club) return false;
  return athlete1.club.toLowerCase().trim() === athlete2.club.toLowerCase().trim();
}

/**
 * Trả về thứ tự ưu tiên của các trận đấu (Match Indices) để đặt hạt giống/Bye.
 * Dựa trên vị trí Seed chuẩn WKF.
 * 
 * Ví dụ 16 trận (Bracket 32):
 * Match 0 (chứa Seed 1) -> Ưu tiên 1
 * Match 15 (chứa Seed 2) -> Ưu tiên 2
 * Match 8 (chứa Seed 3) -> Ưu tiên 3
 * ...
 */
function getMatchPriorityOrder(numMatches) {
  // Mảng thứ tự match index dựa trên seeding chuẩn
  // Seed 1 -> Match 0
  // Seed 2 -> Match N-1
  // Seed 3 -> Match N/2
  // Seed 4 -> Match N/2 - 1
  // ...
  // Ta có thể đệ quy để lấy thứ tự này
  
  if (numMatches === 1) return [0];
  
  // Pattern đệ quy seeding:
  // [0, 1] -> [0, 3, 2, 1] (positions)
  // Nhưng ở đây ta cần Match Indices.
  // Match Indices cho bracket size 32 (16 matches) tương ứng với Seed Positions của bracket size 16.
  
  const seedOrder = getWKFSeedOrder(numMatches); // Trả về thứ tự match indices
  return seedOrder;
}

/**
 * Trả về danh sách Match Indices theo thứ tự Seeding (0 đến numMatches-1)
 */
function getWKFSeedOrder(n) {
  let rounds = Math.log2(n);
  let seeds = [0, 1];
  
  for (let i = 1; i < rounds; i++) {
    const nextSeeds = [];
    const sum = Math.pow(2, i + 1) - 1;
    for (let j = 0; j < seeds.length; j++) {
      nextSeeds.push(seeds[j]);
      nextSeeds.push(sum - seeds[j]);
    }
    seeds = nextSeeds;
  }
  
  // seeds lúc này là thứ tự hạt giống (1, 2, 3, 4...) mapping vào vị trí
  // Nhưng ta cần ngược lại: Vị trí nào ứng với hạt giống tốt nhất.
  // Mảng `seeds` hiện tại: index 0 là Seed 1 (val 0), index 1 là Seed 2 (val 15)...
  // Nghĩa là: Seed 1 ở Match seeds[0]. Seed 2 ở Match seeds[1].
  
  return seeds; 
}


// ============ MAIN FUNCTION ============

export function generateBracket(athletes, options = {}) {
  const { format = 'single_elimination' } = options;
  
  if (athletes.length < 2) {
    throw new Error('Cần ít nhất 2 VĐV');
  }
  
  const bracketSize = nextPowerOf2(athletes.length);
  const numRounds = Math.log2(bracketSize);
  const numMatches = bracketSize / 2;
  
  // 1. Phân loại số trận
  // Số BYE = bracketSize - athletes.length
  // 20 VĐV, 32 Slots -> 12 BYE.
  // Số trận có 1 VĐV (Bye Match) = 12.
  // Số trận có 2 VĐV (Full Match) = 16 - 12 = 4.
  const numByes = bracketSize - athletes.length;
  const numByeMatches = numByes;
  const numFullMatches = numMatches - numByeMatches;
  
  // 2. Xác định trận nào là Bye Match, trận nào là Full Match
  // Dùng thứ tự ưu tiên seeding: Các trận ưu tiên cao nhất được nhận Bye trước (giữ sức cho hạt giống).
  // Các trận ưu tiên thấp nhất (cuối bảng priority) sẽ phải đấu (Full Match).
  const matchPriority = getMatchPriorityOrder(numMatches);
  
  const byeMatchIndices = new Set(matchPriority.slice(0, numByeMatches));
  // Các trận còn lại là Full Matches (đấu loại)
  
  // 3. Sắp xếp VĐV
  // Seeded top đầu -> Unseeded
  const 
    seeded = athletes.filter(a => a.seed && a.seed > 0).sort((a,b) => a.seed - b.seed),
    unseeded = shuffle(athletes.filter(a => !a.seed || a.seed <= 0));
    
  const orderedAthletes = [...seeded, ...unseeded];
  
  // 4. Đặt VĐV vào Slots
  // Nguyên tắc:
  // - Những VĐV "xịn" nhất (đầu danh sách) sẽ vào các trận Bye Match (chỉ chiếm 1 slot).
  // - Những VĐV còn lại sẽ vào các trận Full Match (chiếm 2 slot).
  
  const slots = new Array(bracketSize).fill(null);
  
  // Nhóm 1: VĐV vào Bye Matches (được vào thẳng vòng 2)
  // Số lượng VĐV = numByeMatches (12 người)
  const byeAthletes = orderedAthletes.slice(0, numByeMatches);
  
  // Nhóm 2: VĐV vào Full Matches (phải đấu vòng 1)
  // Số lượng VĐV = numFullMatches * 2 (4 * 2 = 8 người)
  const combatAthletes = orderedAthletes.slice(numByeMatches);
  
  // Điền Bye Athletes vào các trận Bye Matches
  // Lưu ý: Bye Match chỉ điền slot 1 (chẵn), slot 2 để trống
  let currentByeAthIdx = 0;
  // Duyệt theo thứ tự priority để đảm bảo Seed 1 vào đúng Match 0
  for (const matchIdx of matchPriority) {
    if (byeMatchIndices.has(matchIdx)) {
      if (currentByeAthIdx < byeAthletes.length) {
        slots[matchIdx * 2] = byeAthletes[currentByeAthIdx++];
        // slots[matchIdx * 2 + 1] = null;
      }
    }
  }
  
  // Điền Combat Athletes vào các trận Full Matches
  // Duyệt theo thứ tự priority (từ dưới lên hoặc trên xuống đều được, nhưng thường fill tiếp)
  let currentCombatAthIdx = 0;
  for (const matchIdx of matchPriority) {
    if (!byeMatchIndices.has(matchIdx)) {
      // Full Match -> điền cả 2 slot
      if (currentCombatAthIdx < combatAthletes.length) {
        slots[matchIdx * 2] = combatAthletes[currentCombatAthIdx++];
      }
      if (currentCombatAthIdx < combatAthletes.length) {
        slots[matchIdx * 2 + 1] = combatAthletes[currentCombatAthIdx++];
      }
    }
  }
  
  // Swap tránh cùng CLB cho các trận Full Match
  // TODO: Có thể thêm logic swap ở đây nếu cần thiết
  
  // TẠO MATCHES OBJECTS
  const matches = [];
  // No initial matchNumber assignment
  
  const round1Matches = [];
  for (let i = 0; i < bracketSize; i += 2) {
    const athlete1 = slots[i];
    const athlete2 = slots[i + 1];
    
    // Mark IS_BYE if one is missing
    const isBye = (athlete1 && !athlete2) || (!athlete1 && athlete2) || (!athlete1 && !athlete2);
    
    const match = {
      id: uuidv4(),
      matchNumber: null, // Will assign later
      matchCode: null,
      round: 1,
      position: Math.floor(i/2),
      athlete1,
      athlete2,
      score1: null,
      score2: null,
      winner: null,
      isBye: isBye,
      nextMatchId: null
    };
    round1Matches.push(match);
    matches.push(match);
  }
  
  // Next Rounds
  let prevRoundMatches = round1Matches;
  for (let r = 2; r <= numRounds; r++) {
    const roundMatches = [];
    for (let i = 0; i < prevRoundMatches.length; i += 2) {
      const p1 = prevRoundMatches[i];
      const p2 = prevRoundMatches[i+1];
      const match = {
        id: uuidv4(),
        matchNumber: null, // Will assign later
        matchCode: null,
        round: r,
        position: Math.floor(i/2),
        athlete1: null,
        athlete2: null,
        score1: null,
        score2: null,
        winner: null,
        isBye: false,
        nextMatchId: null
      };
      p1.nextMatchId = match.id;
      p2.nextMatchId = match.id;
      roundMatches.push(match);
      matches.push(match);
    }
    prevRoundMatches = roundMatches;
  }

  // --- POST-PROCESSING: NUMBERING & CODES ---
  // Sort by Round ASC, then Position ASC
  matches.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return a.position - b.position;
  });

  let counter = 1;
  for (const match of matches) {
    // Only number real matches (skip round 1 Byes)
    // Future round matches are always considered 'real' potential fights initially
    if (!match.isBye) {
      match.matchNumber = counter++;
      // Mã trận: M + số thứ tự (ví dụ M1, M2...)
      match.matchCode = `M${match.matchNumber}`; 
    }
  }
  
  // AUTO-ADVANCE: Xử lý BYE matches - VĐV có BYE tự động vào vòng tiếp theo
  for (const match of matches) {
    if (match.isBye && match.round === 1) {
      // Xác định VĐV được BYE
      const byeWinner = match.athlete1 || match.athlete2;
      
      if (byeWinner) {
        // Đánh dấu winner
        match.winner = byeWinner;
        
        // Đẩy vào trận vòng tiếp theo
        if (match.nextMatchId) {
          const nextMatch = matches.find(m => m.id === match.nextMatchId);
          if (nextMatch) {
            // Xác định vị trí (athlete1 hoặc athlete2) dựa trên position
            const feedingMatches = matches.filter(m => m.nextMatchId === nextMatch.id)
              .sort((a, b) => a.position - b.position);
            
            const isFirstFeeder = feedingMatches[0]?.id === match.id;
            
            if (isFirstFeeder) {
              nextMatch.athlete1 = byeWinner;
            } else {
              nextMatch.athlete2 = byeWinner;
            }
          }
        }
      }
    }
  }
  
  return {
    id: uuidv4(),
    size: bracketSize,
    numRounds,
    format,
    matches,
    roundNames: getRoundNames(numRounds),
    createdAt: new Date().toISOString()
  };
}

function getRoundNames(n) {
  const names = [];
  for (let i=1; i<=n; i++) {
    const rem = n-i;
    if (rem===0) names.push('Chung kết');
    else if (rem===1) names.push('Bán kết');
    else if (rem===2) names.push('Tứ kết');
    else names.push(`Vòng ${i}`);
  }
  return names;
}

export function updateMatchResult(bracket, matchId, score1, score2, winnerId) {
  const match = bracket.matches.find(m => m.id === matchId);
  if (!match) return bracket;
  
  match.score1 = score1;
  match.score2 = score2;
  
  if (winnerId) {
    match.winner = (match.athlete1?.id === winnerId) ? match.athlete1 : match.athlete2;
  } else if (score1 !== null && score2 !== null) {
    match.winner = (parseInt(score1) > parseInt(score2)) ? match.athlete1 : match.athlete2;
  }
  
  // Advance
  if (match.winner && match.nextMatchId) {
    const next = bracket.matches.find(m => m.id === match.nextMatchId);
    if (next) {
      const feeding = bracket.matches.filter(m => m.nextMatchId === next.id)
        .sort((a,b) => a.position - b.position);
      const isFirst = (feeding[0].id === match.id);
      if (isFirst) next.athlete1 = match.winner;
      else next.athlete2 = match.winner;
    }
  }
  
  return { ...bracket, matches: [...bracket.matches] };
}

export function swapAthletes(bracket, a1id, a2id) {
  // Simple swap in Round 1
  let m1, s1, m2, s2;
  for (const m of bracket.matches) {
    if (m.round !== 1) continue;
    if (m.athlete1?.id === a1id) { m1=m; s1='athlete1'; }
    else if (m.athlete2?.id === a1id) { m1=m; s1='athlete2'; }
    
    if (m.athlete1?.id === a2id) { m2=m; s2='athlete1'; }
    else if (m.athlete2?.id === a2id) { m2=m; s2='athlete2'; }
  }
  if (m1 && m2) {
    const tmp = m1[s1];
    m1[s1] = m2[s2];
    m2[s2] = tmp;
    
    // Re-check isBye
    [m1, m2].forEach(m => {
       m.isBye = (!!m.athlete1 && !m.athlete2) || (!m.athlete1 && !!m.athlete2);
       // Reset winner if it was auto-set? (Though we are not auto-setting winner now)
       if (m.isBye && !m.winner) {
          // Keep as is
       }
    });
  }
  return { ...bracket, matches: [...bracket.matches] };
}

export function getMatchesByRound(bracket) {
  const byRound = {};
  bracket.matches.forEach(m => {
    if (!byRound[m.round]) byRound[m.round] = [];
    byRound[m.round].push(m);
  });
  Object.keys(byRound).forEach(r => byRound[r].sort((a,b)=>a.position - b.position));
  return byRound;
}
