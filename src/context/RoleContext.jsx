import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";

const RoleContext = createContext(null);

/**
 * Trạng thái thời gian nhập liệu
 * - 'before': Chưa đến thời gian nhập
 * - 'during': Đang trong thời gian nhập
 * - 'after': Đã hết thời gian nhập
 */
export const TIME_STATUS = {
  BEFORE: "before",
  DURING: "during",
  AFTER: "after",
};

/**
 * Vai trò người dùng
 */
export const ROLES = {
  ADMIN: "admin",
  COACH: "coach",
  SECRETARY: "secretary",
};

/**
 * RoleProvider - Quản lý vai trò và dữ liệu giải từ file .krt/.kmatch
 */
export function RoleProvider({ children }) {
  const [role, setRole] = useState(null);
  const [tournamentData, setTournamentData] = useState(null);
  const [timeStatus, setTimeStatus] = useState(null);
  const [coachAthletes, setCoachAthletes] = useState([]);
  const [coachName, setCoachName] = useState("");
  const [clubName, setClubName] = useState("");
  const [teamLeaderName, setTeamLeaderName] = useState("");
  const [additionalCoaches, setAdditionalCoaches] = useState([]);

  // Secretary state
  const [matchData, setMatchData] = useState(null);
  const [matchResults, setMatchResults] = useState([]);
  const [scoringEnabled, setScoringEnabled] = useState(false);

  // Owner/System state - Removed

  /**
   * Kiểm tra thời gian hiện tại so với StartTime và EndTime
   */
  const checkTimeStatus = useCallback((startTime, endTime) => {
    const now = new Date();
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (now < start) {
      return TIME_STATUS.BEFORE;
    } else if (now >= start && now <= end) {
      return TIME_STATUS.DURING;
    } else {
      return TIME_STATUS.AFTER;
    }
  }, []);

  /**
   * Load dữ liệu từ file .krt (Coach)
   */
  const loadKrtData = useCallback(
    (data) => {
      setTournamentData(data);
      const status = checkTimeStatus(data.startTime, data.endTime);
      setTimeStatus(status);

      // Load danh sách VĐV từ localStorage nếu có
      const savedAthletes = localStorage.getItem(
        `coach_athletes_${data.tournamentId}`
      );
      if (savedAthletes) {
        setCoachAthletes(JSON.parse(savedAthletes));
      } else {
        setCoachAthletes([]);
      }
      const savedCoachName = localStorage.getItem(
        `coach_name_${data.tournamentId}`
      );
      if (savedCoachName) {
        setCoachName(savedCoachName);
      }

      const savedClubName = localStorage.getItem(
        `club_name_${data.tournamentId}`
      );
      if (savedClubName) {
        setClubName(savedClubName);
      }

      const savedTeamLeader = localStorage.getItem(
        `team_leader_${data.tournamentId}`
      );
      if (savedTeamLeader) {
        setTeamLeaderName(savedTeamLeader);
      }

      const savedAdditionalCoaches = localStorage.getItem(
        `additional_coaches_${data.tournamentId}`
      );
      if (savedAdditionalCoaches) {
        try {
          setAdditionalCoaches(JSON.parse(savedAdditionalCoaches));
        } catch (e) {
          setAdditionalCoaches([]);
        }
      }
    },
    [checkTimeStatus]
  );

  /**
   * Load dữ liệu từ file .kmatch (Secretary)
   */
  const loadMatchData = useCallback(
    (data) => {
      setMatchData(data);
      setScoringEnabled(data.scoringEnabled || false);

      // Load kết quả từ localStorage nếu có
      const savedResults = localStorage.getItem(
        `match_results_${data.tournamentId}`
      );
      if (savedResults) {
        setMatchResults(JSON.parse(savedResults));
      } else {
        setMatchResults([]);
      }

      // Check scoring time
      if (data.startTime && data.endTime) {
        const status = checkTimeStatus(data.startTime, data.endTime);
        setTimeStatus(status);
      }
    },
    [checkTimeStatus]
  );

  // Load system config on mount
  useEffect(() => {
    try {
      const savedLicense = localStorage.getItem("krt_license");
      if (savedLicense) setLicenseData(JSON.parse(savedLicense));

      const savedConfig = localStorage.getItem("krt_system_config");
      if (savedConfig) setSystemConfig(JSON.parse(savedConfig));
    } catch (e) {
      console.error("Error loading system config:", e);
    }
  }, []);

  /**
   * Owner actions removed
   */

  /**
   * Cập nhật trạng thái thời gian (gọi định kỳ)
   */
  const refreshTimeStatus = useCallback(() => {
    if (tournamentData) {
      const status = checkTimeStatus(
        tournamentData.startTime,
        tournamentData.endTime
      );
      setTimeStatus(status);
      return status;
    }
    if (matchData && matchData.startTime && matchData.endTime) {
      const status = checkTimeStatus(matchData.startTime, matchData.endTime);
      setTimeStatus(status);
      return status;
    }
    return null;
  }, [tournamentData, matchData, checkTimeStatus]);

  /**
   * Thêm VĐV mới (chỉ khi trong thời hạn)
   */
  const addAthlete = useCallback(
    (athlete) => {
      if (timeStatus !== TIME_STATUS.DURING) {
        return {
          success: false,
          error: "Không thể thêm VĐV ngoài thời gian cho phép",
        };
      }

      const newAthlete = {
        ...athlete,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      setCoachAthletes((prev) => {
        const updated = [...prev, newAthlete];
        localStorage.setItem(
          `coach_athletes_${tournamentData.tournamentId}`,
          JSON.stringify(updated)
        );
        return updated;
      });

      return { success: true, athlete: newAthlete };
    },
    [timeStatus, tournamentData]
  );

  /**
   * Cập nhật VĐV (chỉ khi trong thời hạn)
   */
  const updateAthlete = useCallback(
    (id, updates) => {
      if (timeStatus !== TIME_STATUS.DURING) {
        return {
          success: false,
          error: "Không thể sửa VĐV ngoài thời gian cho phép",
        };
      }

      setCoachAthletes((prev) => {
        const updated = prev.map((a) =>
          a.id === id
            ? { ...a, ...updates, updatedAt: new Date().toISOString() }
            : a
        );
        localStorage.setItem(
          `coach_athletes_${tournamentData.tournamentId}`,
          JSON.stringify(updated)
        );
        return updated;
      });

      return { success: true };
    },
    [timeStatus, tournamentData]
  );

  /**
   * Xóa VĐV (chỉ khi trong thời hạn)
   */
  const deleteAthlete = useCallback(
    (id) => {
      if (timeStatus !== TIME_STATUS.DURING) {
        return {
          success: false,
          error: "Không thể xóa VĐV ngoài thời gian cho phép",
        };
      }

      setCoachAthletes((prev) => {
        const updated = prev.filter((a) => a.id !== id);
        localStorage.setItem(
          `coach_athletes_${tournamentData.tournamentId}`,
          JSON.stringify(updated)
        );
        return updated;
      });

      return { success: true };
    },
    [timeStatus, tournamentData]
  );

  /**
   * Cập nhật tên HLV
   */
  const updateCoachName = useCallback(
    (name) => {
      setCoachName(name);
      if (tournamentData) {
        localStorage.setItem(`coach_name_${tournamentData.tournamentId}`, name);
      }
    },
    [tournamentData]
  );

  /**
   * Cập nhật tên CLB
   */
  const updateClubName = useCallback(
    (name) => {
      setClubName(name);
      if (tournamentData) {
        localStorage.setItem(`club_name_${tournamentData.tournamentId}`, name);
      }
    },
    [tournamentData]
  );

  /**
   * Cập nhật tên Trưởng đoàn
   */
  const updateTeamLeaderName = useCallback(
    (name) => {
      setTeamLeaderName(name);
      if (tournamentData) {
        localStorage.setItem(`team_leader_${tournamentData.tournamentId}`, name);
      }
    },
    [tournamentData]
  );

  /**
   * Cập nhật danh sách HLV phụ
   */
  const updateAdditionalCoaches = useCallback(
    (coaches) => {
      setAdditionalCoaches(coaches);
      if (tournamentData) {
        localStorage.setItem(
          `additional_coaches_${tournamentData.tournamentId}`,
          JSON.stringify(coaches)
        );
      }
    },
    [tournamentData]
  );

  /**
   * Lấy dữ liệu để xuất file (Coach)
   */ const getExportData = useCallback(() => {
    return {
      tournamentId: tournamentData?.tournamentId,
      tournamentName: tournamentData?.tournamentName,
      coachName,
      clubName,
      teamLeaderName,
      additionalCoaches,
      exportTime: new Date().toISOString(),
      athletes: coachAthletes,
    };
  }, [tournamentData, coachName, clubName, teamLeaderName, additionalCoaches, coachAthletes]);

  // ============ SECRETARY FUNCTIONS ============

  /**
   * Cập nhật kết quả trận đấu (Secretary)
   */
  const updateMatchResult = useCallback(
    (matchId, result) => {
      if (!scoringEnabled) {
        return {
          success: false,
          error: "Chức năng bấm điểm chưa được Admin bật",
        };
      }

      setMatchResults((prev) => {
        const existing = prev.findIndex((r) => r.matchId === matchId);
        let updated;
        if (existing >= 0) {
          updated = prev.map((r, i) =>
            i === existing
              ? { ...r, ...result, updatedAt: new Date().toISOString() }
              : r
          );
        } else {
          updated = [
            ...prev,
            { matchId, ...result, createdAt: new Date().toISOString() },
          ];
        }
        if (matchData) {
          localStorage.setItem(
            `match_results_${matchData.tournamentId}`,
            JSON.stringify(updated)
          );
        }
        return updated;
      });

      return { success: true };
    },
    [scoringEnabled, matchData]
  );
  /**
   * Xóa kết quả trận đấu (dùng cho reset match)
   */
  const removeMatchResult = useCallback(
    (matchId) => {
      setMatchResults((prev) => {
        const updated = prev.filter((r) => r.matchId !== matchId);
        if (matchData) {
          localStorage.setItem(
            `match_results_${matchData.tournamentId}`,
            JSON.stringify(updated)
          );
        }
        return updated;
      });
      return { success: true };
    },
    [matchData]
  );

  /**
   * Lấy kết quả trận đấu
   */
  const getMatchResult = useCallback(
    (matchId) => {
      return matchResults.find((r) => r.matchId === matchId) || null;
    },
    [matchResults]
  );
  /**
   * Lấy dữ liệu để xuất file (Secretary)
   * Bao gồm thông tin huy chương theo hạng mục để admin import được
   */
  const getMatchExportData = useCallback(() => {
    // Tính toán huy chương từ bracket cho mỗi hạng mục
    const categoryMedals = [];

    if (matchData?.categories) {
      matchData.categories.forEach((cat) => {
        const bracket = cat.bracket;
        if (!bracket?.matches) return;

        // Deep clone bracket và apply kết quả từ thư ký
        let clonedBracket = JSON.parse(JSON.stringify(bracket));

        // Bước 1: Auto-advance BYE matches ở vòng 1 (nếu chưa có winner)
        clonedBracket.matches.forEach((match) => {
          if (match.isBye && match.round === 1 && !match.winner) {
            const byeWinner = match.athlete1 || match.athlete2;
            if (byeWinner) {
              match.winner = byeWinner;
              // Advance to next match
              if (match.nextMatchId) {
                const nextMatch = clonedBracket.matches.find(
                  (m) => m.id === match.nextMatchId
                );
                if (nextMatch) {
                  const feedingMatches = clonedBracket.matches
                    .filter((m) => m.nextMatchId === nextMatch.id)
                    .sort((a, b) => a.position - b.position);
                  const isFirst = feedingMatches[0]?.id === match.id;
                  if (isFirst) nextMatch.athlete1 = byeWinner;
                  else nextMatch.athlete2 = byeWinner;
                }
              }
            }
          }
        });

        // Bước 2: Apply kết quả từ thư ký (dùng updateBracketWithResult để advance đúng)
        matchResults.forEach((result) => {
          const match = clonedBracket.matches.find(
            (m) => m.id === result.matchId
          );
          if (!match) return;
          
          if (result.disqualification && result.disqualifiedSlot) {
            // Disqualification
            const opponent = result.disqualifiedSlot === 1 
              ? match.athlete2 
              : match.athlete1;
            if (opponent) {
              match.winner = opponent;
              match.disqualification = true;
              // Advance
              if (match.nextMatchId) {
                const next = clonedBracket.matches.find(
                  (m) => m.id === match.nextMatchId
                );
                if (next) {
                  const feeding = clonedBracket.matches
                    .filter((m) => m.nextMatchId === next.id)
                    .sort((a, b) => a.position - b.position);
                  const isFirst = feeding[0]?.id === match.id;
                  if (isFirst) next.athlete1 = opponent;
                  else next.athlete2 = opponent;
                }
              }
            }
          } else {
            // Normal result
            let winnerId = result.winnerId;
            if (!winnerId) {
              if (result.winner === "athlete1") winnerId = match.athlete1?.id;
              else if (result.winner === "athlete2") winnerId = match.athlete2?.id;
            }
            if (winnerId) {
              match.winner = match.athlete1?.id === winnerId 
                ? match.athlete1 
                : match.athlete2;
              match.score1 = result.score1;
              match.score2 = result.score2;
              // Advance
              if (match.winner && match.nextMatchId) {
                const next = clonedBracket.matches.find(
                  (m) => m.id === match.nextMatchId
                );
                if (next) {
                  const feeding = clonedBracket.matches
                    .filter((m) => m.nextMatchId === next.id)
                    .sort((a, b) => a.position - b.position);
                  const isFirst = feeding[0]?.id === match.id;
                  if (isFirst) next.athlete1 = match.winner;
                  else next.athlete2 = match.winner;
                }
              }
            }
          }
        });

        // Bước 3: Auto-advance trận chỉ có 1 VĐV ở vòng 2+
        // CHỈ auto-advance khi CẢ 2 trận feed (vòng trước) đã có kết quả
        // Nếu 1 trận feed chưa có winner → bracket chưa hoàn thành → KHÔNG advance
        const numRounds =
          bracket.numRounds ||
          Math.max(...clonedBracket.matches.map((m) => m.round || 0));
        
        for (let r = 2; r <= numRounds; r++) {
          clonedBracket.matches
            .filter((m) => m.round === r && !m.winner)
            .forEach((match) => {
              const hasOnly1 =
                (match.athlete1 && !match.athlete2) ||
                (!match.athlete1 && match.athlete2);
              if (hasOnly1) {
                // Kiểm tra cả 2 trận feed đã có kết quả chưa
                const feedingMatches = clonedBracket.matches.filter(
                  (m) => m.nextMatchId === match.id
                );
                const allFeedResolved = feedingMatches.length > 0 &&
                  feedingMatches.every(
                    (fm) => fm.winner || (!fm.athlete1 && !fm.athlete2)
                  );
                
                if (allFeedResolved) {
                  const autoWinner = match.athlete1 || match.athlete2;
                  match.winner = autoWinner;
                  if (match.nextMatchId) {
                    const next = clonedBracket.matches.find(
                      (m) => m.id === match.nextMatchId
                    );
                    if (next) {
                      const feeding = clonedBracket.matches
                        .filter((m) => m.nextMatchId === next.id)
                        .sort((a, b) => a.position - b.position);
                      const isFirst = feeding[0]?.id === match.id;
                      if (isFirst) next.athlete1 = autoWinner;
                      else next.athlete2 = autoWinner;
                    }
                  }
                }
              }
            });
        }

        // Bước 4: Tìm huy chương
        const finalMatch = clonedBracket.matches.find(
          (m) => m.round === numRounds
        );

        const getLoser = (match) => {
          if (!match?.winner) return null;
          if (match.athlete1?.id === match.winner.id) return match.athlete2;
          if (match.athlete2?.id === match.winner.id) return match.athlete1;
          return null;
        };

        const champion = finalMatch?.winner || null;
        const silverMedalist = getLoser(finalMatch);

        // Semi-final losers = bronze
        const semiFinalRound = numRounds - 1;
        const semiFinalMatches = clonedBracket.matches.filter(
          (m) => m.round === semiFinalRound && !m.isBye
        );
        const bronzeMedalists = semiFinalMatches
          .map((m) => getLoser(m))
          .filter((a) => a !== null);

        // Tìm thêm bronze từ tứ kết nếu bán kết có auto-advance
        if (bronzeMedalists.length < 2 && semiFinalRound > 1) {
          const quarterRound = semiFinalRound - 1;
          const quarterFinals = clonedBracket.matches.filter(
            (m) => m.round === quarterRound && !m.isBye && m.winner
          );
          // Tìm bán kết auto-advance (chỉ 1 VĐV)
          const autoAdvanceSemis = semiFinalMatches.filter(
            (m) => m.winner && (!m.athlete1 || !m.athlete2)
          );
          autoAdvanceSemis.forEach((semi) => {
            const advAthlete = semi.winner || semi.athlete1 || semi.athlete2;
            if (!advAthlete) return;
            const qMatch = quarterFinals.find(
              (m) => m.winner?.id === advAthlete.id
            );
            if (qMatch) {
              const qLoser = getLoser(qMatch);
              if (qLoser && !bronzeMedalists.some((b) => b.id === qLoser.id)) {
                bronzeMedalists.push(qLoser);
              }
            }
          });
          // Fallback: tất cả loser tứ kết
          if (bronzeMedalists.length < 2) {
            quarterFinals.forEach((qm) => {
              const qLoser = getLoser(qm);
              if (
                qLoser &&
                qLoser.id !== champion?.id &&
                qLoser.id !== silverMedalist?.id &&
                !bronzeMedalists.some((b) => b.id === qLoser.id)
              ) {
                bronzeMedalists.push(qLoser);
              }
            });
          }
        }

        categoryMedals.push({
          categoryName: cat.name,
          categoryId: cat.id,
          type: cat.type === "kumite" ? "Kumite" : "Kata",
          gender:
            cat.gender === "male"
              ? "Nam"
              : cat.gender === "female"
              ? "Nữ"
              : "Hỗn hợp",
          gold: champion
            ? { name: champion.name, club: champion.club || "" }
            : null,
          silver: silverMedalist
            ? { name: silverMedalist.name, club: silverMedalist.club || "" }
            : null,
          bronze1: bronzeMedalists[0]
            ? {
                name: bronzeMedalists[0].name,
                club: bronzeMedalists[0].club || "",
              }
            : null,
          bronze2: bronzeMedalists[1]
            ? {
                name: bronzeMedalists[1].name,
                club: bronzeMedalists[1].club || "",
              }
            : null,
        });
      });
    }

    // Lưu lại clonedBrackets cho mỗi hạng mục để enrich results
    const processedBrackets = {};
    if (matchData?.categories) {
      matchData.categories.forEach((cat) => {
        const bracket = cat.bracket;
        if (!bracket?.matches) return;

        // Deep clone bracket và apply kết quả (giống logic tìm huy chương ở trên)
        let clonedBracket = JSON.parse(JSON.stringify(bracket));

        // Auto-advance BYE vòng 1
        clonedBracket.matches.forEach((match) => {
          if (match.isBye && match.round === 1 && !match.winner) {
            const byeWinner = match.athlete1 || match.athlete2;
            if (byeWinner) {
              match.winner = byeWinner;
              if (match.nextMatchId) {
                const nextMatch = clonedBracket.matches.find(
                  (m) => m.id === match.nextMatchId
                );
                if (nextMatch) {
                  const feedingMatches = clonedBracket.matches
                    .filter((m) => m.nextMatchId === nextMatch.id)
                    .sort((a, b) => a.position - b.position);
                  const isFirst = feedingMatches[0]?.id === match.id;
                  if (isFirst) nextMatch.athlete1 = byeWinner;
                  else nextMatch.athlete2 = byeWinner;
                }
              }
            }
          }
        });

        // Apply matchResults
        matchResults.forEach((result) => {
          const match = clonedBracket.matches.find(
            (m) => m.id === result.matchId
          );
          if (!match) return;
          let winnerId = result.winnerId;
          if (!winnerId) {
            if (result.winner === "athlete1") winnerId = match.athlete1?.id;
            else if (result.winner === "athlete2") winnerId = match.athlete2?.id;
          }
          if (winnerId) {
            match.winner = match.athlete1?.id === winnerId
              ? match.athlete1
              : match.athlete2;
            match.score1 = result.score1;
            match.score2 = result.score2;
            if (match.winner && match.nextMatchId) {
              const next = clonedBracket.matches.find(
                (m) => m.id === match.nextMatchId
              );
              if (next) {
                const feeding = clonedBracket.matches
                  .filter((m) => m.nextMatchId === next.id)
                  .sort((a, b) => a.position - b.position);
                const isFirst = feeding[0]?.id === match.id;
                if (isFirst) next.athlete1 = match.winner;
                else next.athlete2 = match.winner;
              }
            }
          }
        });

        // Auto-advance (chỉ khi cả 2 feed đã resolved)
        const numR = bracket.numRounds ||
          Math.max(...clonedBracket.matches.map((m) => m.round || 0));
        for (let r = 2; r <= numR; r++) {
          clonedBracket.matches
            .filter((m) => m.round === r && !m.winner)
            .forEach((match) => {
              const hasOnly1 =
                (match.athlete1 && !match.athlete2) ||
                (!match.athlete1 && match.athlete2);
              if (hasOnly1) {
                const feedingMatches = clonedBracket.matches.filter(
                  (m) => m.nextMatchId === match.id
                );
                const allFeedResolved = feedingMatches.length > 0 &&
                  feedingMatches.every(
                    (fm) => fm.winner || (!fm.athlete1 && !fm.athlete2)
                  );
                if (allFeedResolved) {
                  const autoWinner = match.athlete1 || match.athlete2;
                  match.winner = autoWinner;
                  if (match.nextMatchId) {
                    const next = clonedBracket.matches.find(
                      (m) => m.id === match.nextMatchId
                    );
                    if (next) {
                      const feeding = clonedBracket.matches
                        .filter((m) => m.nextMatchId === next.id)
                        .sort((a, b) => a.position - b.position);
                      const isFirst = feeding[0]?.id === match.id;
                      if (isFirst) next.athlete1 = autoWinner;
                      else next.athlete2 = autoWinner;
                    }
                  }
                }
              }
            });
        }

        // Lưu processed bracket theo category name
        processedBrackets[cat.name] = clonedBracket;
      });
    }

    // Enrich match results with category/athlete info
    // SỬ DỤNG processedBrackets (đã apply results + advance) thay vì bracket gốc
    const enrichedResults = matchResults.map((result) => {
      let categoryName = "";
      let roundName = "";
      let athlete1Name = "",
        athlete1Club = "";
      let athlete2Name = "",
        athlete2Club = "";
      let winnerName = "",
        winnerClub = "";

      if (matchData?.categories) {
        for (const cat of matchData.categories) {
          // Tìm trong processedBracket (có athletes đã advance)
          const processedBracket = processedBrackets[cat.name];
          const match = processedBracket?.matches?.find(
            (m) => m.id === result.matchId
          );
          if (match) {
            categoryName = cat.name;
            roundName =
              cat.bracket?.roundNames?.[match.round - 1] ||
              `Vòng ${match.round}`;
            athlete1Name = match.athlete1?.name || "";
            athlete1Club = match.athlete1?.club || "";
            athlete2Name = match.athlete2?.name || "";
            athlete2Club = match.athlete2?.club || "";

            if (
              result.winner === "athlete1" ||
              result.winnerId === match.athlete1?.id
            ) {
              winnerName = athlete1Name;
              winnerClub = athlete1Club;
            } else if (
              result.winner === "athlete2" ||
              result.winnerId === match.athlete2?.id
            ) {
              winnerName = athlete2Name;
              winnerClub = athlete2Club;
            }
            break;
          }
        }
      }

      return {
        ...result,
        categoryName,
        roundName,
        athlete1Name,
        athlete1Club,
        athlete2Name,
        athlete2Club,
        winnerName,
        winnerClub,
      };
    });

    return {
      tournamentId: matchData?.tournamentId,
      tournamentName: matchData?.tournamentName,
      exportTime: new Date().toISOString(),
      results: enrichedResults,
      categoryMedals,
    };
  }, [matchData, matchResults]);

  /**
   * Reset role và dữ liệu
   */ const resetRole = useCallback(() => {
    setRole(null);
    setTournamentData(null);
    setTimeStatus(null);
    setCoachAthletes([]);
    setCoachName("");
    setClubName("");
    setTeamLeaderName("");
    setAdditionalCoaches([]);
    setMatchData(null);
    setMatchResults([]);
    setScoringEnabled(false);
  }, []);

  /**
   * Kiểm tra xem có thể chỉnh sửa không (Coach)
   */
  const canEdit = role === ROLES.COACH && timeStatus === TIME_STATUS.DURING;

  /**
   * Kiểm tra xem có thể bấm điểm không (Secretary)
   */
  const canScore = role === ROLES.SECRETARY && scoringEnabled;

  const value = {
    // State
    role,
    tournamentData,
    timeStatus,
    coachAthletes,
    coachName,
    clubName,
    teamLeaderName,
    additionalCoaches,
    canEdit,

    // Secretary State
    matchData,
    matchResults,
    scoringEnabled,
    canScore,

    // Actions
    setRole,
    loadKrtData,
    loadMatchData,
    refreshTimeStatus,
    addAthlete,
    updateAthlete,
    deleteAthlete,
    updateCoachName,
    updateClubName,
    updateTeamLeaderName,
    updateAdditionalCoaches,
    getExportData, // Secretary Actions
    updateMatchResult,
    removeMatchResult,
    getMatchResult,
    getMatchExportData,

    // Owner Actions - Removed

    resetRole,
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

/**
 * Hook để sử dụng RoleContext
 */
export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}

export default RoleContext;
