import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useTournament,
  useTournamentDispatch,
  ACTIONS,
} from "../context/TournamentContext";
import {
  updateMatchResult,
  disqualifyAthlete,
  resetMatch,
} from "../utils/drawEngine";
import {
  exportBracketToPDF,
  exportScoreSheetToPDF,
} from "../services/pdfService";
import {
  openScoreboard,
  listenForMatchResult,
} from "../services/scoreboardService";
import Bracket from "../components/Bracket/Bracket";
import "./BracketPage.css";

export default function BracketPage() {
  const { id } = useParams();
  const { tournaments, currentTournament, currentCategory } = useTournament();
  const dispatch = useTournamentDispatch();
  const [exporting, setExporting] = useState(false);

  // Calculate category and tournament FIRST before using in effects
  const category =
    currentCategory ||
    tournaments.flatMap((t) => t.categories).find((c) => c.id === id);

  const tournament =
    currentTournament ||
    tournaments.find((t) => t.categories.some((c) => c.id === id));

  // Find the category
  useEffect(() => {
    let foundTournament = null;
    let foundCategory = null;

    for (const t of tournaments) {
      const cat = t.categories.find((c) => c.id === id);
      if (cat) {
        foundTournament = t;
        foundCategory = cat;
        break;
      }
    }

    if (foundTournament && foundTournament.id !== currentTournament?.id) {
      dispatch({
        type: ACTIONS.SET_CURRENT_TOURNAMENT,
        payload: foundTournament.id,
      });
    }
    if (foundCategory) {
      dispatch({ type: ACTIONS.SET_CURRENT_CATEGORY, payload: id });
    }
  }, [id, tournaments, dispatch]);

  // Lắng nghe kết quả trận đấu từ scoreboard
  useEffect(() => {
    if (!category?.bracket) return;

    const cleanup = listenForMatchResult((result) => {
      if (result && result.matchId && result.winnerId) {
        const updatedBracket = updateMatchResult(
          category.bracket,
          result.matchId,
          result.score1 || 0,
          result.score2 || 0,
          result.winnerId
        );

        dispatch({
          type: ACTIONS.UPDATE_CATEGORY,
          payload: { id: category.id, bracket: updatedBracket },
        });
      }
    });

    return cleanup;
  }, [category?.bracket, category?.id, dispatch]);
  if (!category || !tournament) {
    return (
      <div className="page">
        <div className="container">
          <div className="not-found">
            <h2>Không tìm thấy hạng mục</h2>
            <Link to="/admin" className="btn btn-primary">
              Về quản lý giải đấu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!category.bracket) {
    return (
      <div className="page">
        <div className="container">
          <div className="not-found">
            <h2>Chưa bốc thăm</h2>
            <p>Hãy bốc thăm trước khi xem sơ đồ thi đấu.</p>
            <Link to={`/category/${id}`} className="btn btn-primary">
              Quay lại hạng mục
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Tìm tên vòng đấu dựa vào round của match
  const getRoundName = (match) => {
    if (!category.bracket?.roundNames) return `Vòng ${match.round}`;
    const roundIndex = match.round - 1;
    return category.bracket.roundNames[roundIndex] || `Vòng ${match.round}`;
  };

  const handleMatchClick = (match) => {
    // If only one athlete exists (other slot is empty/BYE), auto-advance that athlete
    const hasOnlyAthlete1 = match.athlete1 && !match.athlete2;
    const hasOnlyAthlete2 = !match.athlete1 && match.athlete2;

    if (hasOnlyAthlete1 || hasOnlyAthlete2) {
      // Auto-advance the single athlete (only if no winner yet)
      if (!match.winner) {
        const winner = match.athlete1 || match.athlete2;
        const updatedBracket = updateMatchResult(
          category.bracket,
          match.id,
          0,
          0,
          winner.id
        );

        dispatch({
          type: ACTIONS.UPDATE_CATEGORY,
          payload: { id: category.id, bracket: updatedBracket },
        });
      }
      return;
    }

    // Nếu có cả 2 VĐV, mở scoreboard (cho phép cả khi đã có winner để sửa)
    if (match.athlete1 && match.athlete2) {
      const scheduleInfo = tournament.schedule?.[category.id] || null;
      const sponsorLogos = tournament.sponsorLogos || null;
      openScoreboard(
        match,
        category.type, // 'kumite' or 'kata'
        category.name,
        tournament.name,
        getRoundName(match),
        scheduleInfo,
        sponsorLogos
      );
    }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await exportBracketToPDF(
        category,
        tournament.name,
        `${category.name}_so_do.pdf`,
        {
          paperSize: category.bracket.size <= 16 ? "a4" : "a3",
          orientation: "landscape",
          scheduleInfo: tournament.schedule?.[category.id] || null,
          splitSettings: tournament.splitSettings || null,
          sponsorLogos: tournament.sponsorLogos || null,
        }
      );
    } catch (error) {
      alert("Lỗi khi xuất PDF: " + error.message);
    } finally {
      setExporting(false);
    }
  };
  const handleExportScoreSheet = async () => {
    const matches = category.bracket.matches.filter(
      (m) => !m.isBye && m.athlete1 && m.athlete2
    );
    setExporting(true);
    try {
      await exportScoreSheetToPDF(
        category,
        matches,
        `${category.name}_bang_diem.pdf`,
        tournament.sponsorLogos || null
      );
    } catch (e) {
      console.error(e);
      alert("Lỗi xuất bảng điểm: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  // Handle right-click context menu actions from Bracket component
  const handleContextAction = (action, match, athleteSlot) => {
    if (!category?.bracket) return;

    let updatedBracket;

    switch (action) {
      case "disqualify": {
        const athlete = athleteSlot === 1 ? match.athlete1 : match.athlete2;
        const reason = window.prompt(
          `Lý do loại ${athlete?.name || "VĐV"}:`,
          "Vi phạm"
        );
        if (reason === null) return; // User cancelled
        updatedBracket = disqualifyAthlete(
          category.bracket,
          match.id,
          athleteSlot,
          reason || "Loại"
        );
        break;
      }
      case "set_winner": {
        updatedBracket = updateMatchResult(
          category.bracket,
          match.id,
          athleteSlot === 1 ? 1 : 0,
          athleteSlot === 1 ? 0 : 1,
          (athleteSlot === 1 ? match.athlete1 : match.athlete2)?.id
        );
        break;
      }
      case "reset_match": {
        if (!window.confirm("Reset trận đấu này? Kết quả sẽ bị xóa.")) return;
        updatedBracket = resetMatch(category.bracket, match.id);
        break;
      }
      default:
        return;
    }

    if (updatedBracket) {
      dispatch({
        type: ACTIONS.UPDATE_CATEGORY,
        payload: { id: category.id, bracket: updatedBracket },
      });
    }
  };
  // Calculate progress
  const completedMatches = category.bracket.matches.filter(
    (m) => m.winner && !m.isBye
  ).length;
  const totalMatches = category.bracket.matches.filter((m) => !m.isBye).length;
  const progressPercent =
    totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

  // Find medal winners
  const finalMatch = category.bracket.matches.find(
    (m) => m.round === category.bracket.numRounds
  );
  const champion = finalMatch?.winner;

  // Tìm người thua chung kết (Bạc)
  const getLoser = (match) => {
    if (!match?.winner) return null;
    if (match.athlete1?.id === match.winner.id) return match.athlete2;
    if (match.athlete2?.id === match.winner.id) return match.athlete1;
    return null;
  };

  const silverMedalist = getLoser(finalMatch);

  // Tìm 2 người thua bán kết (Đồng)
  const semiFinalRound = category.bracket.numRounds - 1;
  const semiFinalMatches = category.bracket.matches.filter(
    (m) => m.round === semiFinalRound && !m.isBye
  );
  const bronzeMedalists = semiFinalMatches
    .map((m) => getLoser(m))
    .filter((a) => a !== null);

  // Nếu chỉ có ít hơn 2 bronze từ bán kết, tìm thêm từ tứ kết
  // Trường hợp: 1 trận bán kết chỉ có 1 VĐV (auto-advance do BYE vòng trước)
  if (bronzeMedalists.length < 2 && semiFinalRound > 1) {
    const quarterRound = semiFinalRound - 1;
    const quarterFinals = category.bracket.matches.filter(
      (m) => m.round === quarterRound && !m.isBye && m.winner
    );
    // Tìm bán kết mà chỉ có 1 VĐV (auto-advance)
    const autoAdvanceSemis = semiFinalMatches.filter(
      (m) => m.winner && (!m.athlete1 || !m.athlete2)
    );
    autoAdvanceSemis.forEach((semi) => {
      const advancedAthlete = semi.winner || semi.athlete1 || semi.athlete2;
      if (!advancedAthlete) return;
      const qMatch = quarterFinals.find(
        (m) => m.winner?.id === advancedAthlete.id
      );
      if (qMatch) {
        const qLoser = getLoser(qMatch);
        if (qLoser && !bronzeMedalists.some((b) => b.id === qLoser.id)) {
          bronzeMedalists.push(qLoser);
        }
      }
    });
    
    // Fallback: tìm tất cả loser tứ kết mà không phải champion/silver
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
  const isTeamBracket = category.bracket?.isTeamBracket || false;
  return (
    <div className="page bracket-page">
      <div className="container-fluid">
        <nav className="breadcrumb">
          <Link to={`/category/${category.id}`} className="back-link">
            ← Quay lại
          </Link>
          <span className="breadcrumb-separator">|</span>
          <Link to="/admin">Quản lý giải đấu</Link>
          <span>/</span>
          <Link to={`/tournament/${tournament.id}`}>{tournament.name}</Link>
          <span>/</span>
          <Link to={`/category/${category.id}`}>{category.name}</Link>
          <span>/</span>
          <span>Sơ đồ thi đấu</span>
        </nav>
        <header className="page-header bracket-header">
          <div>
            <h1 className="page-title">{category.name}</h1>
            <div className="bracket-info">
              <span>📊 {category.bracket.size} slots</span>
              <span>•</span>
              <span>⚔️ {totalMatches} trận</span>
              <span>•</span>
              <span className={progressPercent === 100 ? "complete" : ""}>
                ✓ {completedMatches}/{totalMatches} hoàn thành (
                {progressPercent}%)
              </span>
            </div>
          </div>

          <div className="header-actions">
            <Link to={`/category/${category.id}`} className="btn btn-secondary">
              ← Quay lại
            </Link>
            <button
              className="btn btn-secondary"
              onClick={handleExportScoreSheet}
            >
              📝 Xuất bảng điểm
            </button>
            <button
              className="btn btn-primary"
              onClick={handleExportPDF}
              disabled={exporting}
            >
              {exporting ? "⏳ Đang xuất..." : "📄 Xuất PDF"}
            </button>
          </div>
        </header>

        <div className="bracket-scroll-container">
          {" "}
          <Bracket
            bracket={category.bracket}
            categoryType={category.type}
            onMatchClick={handleMatchClick}
            onContextAction={handleContextAction}
          />
          {/* Medal Table - Always visible, auto-update */}
          <div className="medal-table-container">
            <table className="medal-table">
              <thead>
                <tr>
                  <th>🏆 VÔ ĐỊCH</th>
                </tr>
              </thead>
              <tbody>
                <tr className="medal-gold">
                  <td>
                    <span className="medal-icon">🥇</span>
                    <span className="medal-athlete">
                      {champion ? (
                        <>
                          {champion.name}
                          {!isTeamBracket && champion.club && (
                            <span className="medal-club">
                              {" "}
                              - {champion.club}
                            </span>
                          )}
                          {isTeamBracket && champion.members && (
                            <span className="medal-club">
                              {" "}
                              (
                              {champion.members
                                .map((m) => m.name.trim().split(/\s+/).pop())
                                .join(", ")}
                              )
                            </span>
                          )}
                        </>
                      ) : (
                        "-"
                      )}
                    </span>
                  </td>
                </tr>
                <tr className="medal-silver">
                  <td>
                    <span className="medal-icon">🥈</span>
                    <span className="medal-athlete">
                      {silverMedalist ? (
                        <>
                          {silverMedalist.name}
                          {!isTeamBracket && silverMedalist.club && (
                            <span className="medal-club">
                              {" "}
                              - {silverMedalist.club}
                            </span>
                          )}
                          {isTeamBracket && silverMedalist.members && (
                            <span className="medal-club">
                              {" "}
                              (
                              {silverMedalist.members
                                .map((m) => m.name.trim().split(/\s+/).pop())
                                .join(", ")}
                              )
                            </span>
                          )}
                        </>
                      ) : (
                        "-"
                      )}
                    </span>
                  </td>
                </tr>
                <tr className="medal-bronze">
                  <td>
                    <span className="medal-icon">🥉</span>
                    <span className="medal-athlete">
                      {bronzeMedalists[0] ? (
                        <>
                          {bronzeMedalists[0].name}
                          {!isTeamBracket && bronzeMedalists[0].club && (
                            <span className="medal-club">
                              {" "}
                              - {bronzeMedalists[0].club}
                            </span>
                          )}
                          {isTeamBracket && bronzeMedalists[0].members && (
                            <span className="medal-club">
                              {" "}
                              (
                              {bronzeMedalists[0].members
                                .map((m) => m.name.trim().split(/\s+/).pop())
                                .join(", ")}
                              )
                            </span>
                          )}
                        </>
                      ) : (
                        "-"
                      )}
                    </span>
                  </td>
                </tr>
                <tr className="medal-bronze">
                  <td>
                    <span className="medal-icon">🥉</span>
                    <span className="medal-athlete">
                      {bronzeMedalists[1] ? (
                        <>
                          {bronzeMedalists[1].name}
                          {!isTeamBracket && bronzeMedalists[1].club && (
                            <span className="medal-club">
                              {" "}
                              - {bronzeMedalists[1].club}
                            </span>
                          )}
                          {isTeamBracket && bronzeMedalists[1].members && (
                            <span className="medal-club">
                              {" "}
                              (
                              {bronzeMedalists[1].members
                                .map((m) => m.name.trim().split(/\s+/).pop())
                                .join(", ")}
                              )
                            </span>
                          )}
                        </>
                      ) : (
                        "-"
                      )}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
