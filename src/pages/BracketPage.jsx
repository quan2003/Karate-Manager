import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
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
import { useOnboarding } from "../context/OnboardingContext";
import appIcon from "../assets/icon.png";
import "./BracketPage.css";

const WKF_KATA_LIST = [
  "001 Anan", "002 Anan Dai", "003 Ananko", "004 Aoyagi", "005 Bassai", 
  "006 Bassai Dai", "007 Bassai Sho", "008 Chatanyara Kusanku", 
  "009 Chibana No Kushanku", "010 Chinte", "011 Chinto", "012 Enpi", 
  "013 Fukyugata Ichi", "014 Fukyugata Ni", "015 Gankaku", "016 Garyu", 
  "017 Gekisai (Geksai) 1", "018 Gekisai (Geksai) 2", "019 Gojushiho", 
  "020 Gojushiho Dai", "021 Gojushiho Sho", "022 Hakucho", "023 Hangetsu", 
  "024 Haufa (Haffa)", "025 Heian Shodan", "026 Heian Nidan", 
  "027 Heian Sandan", "028 Heian Yondan", "029 Heian Godan", "030 Heiku", 
  "031 Ishimine Bassai", "032 Itosu Rohai Shodan", "033 Itosu Rohai Nidan", 
  "034 Itosu Rohai Sandan", "035 Jiin", "036 Jion", "037 Jitte", 
  "038 Juroku", "039 Kanchin", "040 Kanku Dai", "041 Kanku Sho", 
  "042 Kanshu", "043 Kishimoto No Kushanku", "044 Kousoukun", 
  "045 Kousoukun Dai", "046 Kousoukun Sho", "047 Kururunfa", "048 Kusanku", 
  "049 Kyan No Chinto", "050 Kyan No Wanshu", "051 Matsukaze", 
  "052 Matsumura Bassai", "053 Matsumura Rohai", "054 Meikyo", "055 Myojo", 
  "056 Naifanchin Shodan", "057 Naifanchin Nidan", "058 Naifanchin Sandan", 
  "059 Naihanchi", "060 Nijushiho", "061 Nipaipo", "062 Niseishi", 
  "063 Ohan", "064 Ohan Dai", "065 Oyadomari No Passai", "066 Pachu", 
  "067 Paiku", "068 Papuren", "069 Passai", "070 Pinan Shodan", 
  "071 Pinan Nidan", "072 Pinan Sandan", "073 Pinan Yondan", 
  "074 Pinan Godan", "075 Rohai", "076 Saifa", "077 Sanchin", "078 Sansai", 
  "079 Sanseiru", "080 Sanseru", "081 Seichin", "082 Seienchin (Seiyunchin)", 
  "083 Seipai", "084 Seiryu", "085 Seishan", "086 Seisan (Sesan)", 
  "087 Shiho Kousoukun", "088 Shinpa", "089 Shinsei", "090 Shisochin", 
  "091 Sochin", "092 Suparinpei", "093 Tekki Shodan", "094 Tekki Nidan", 
  "095 Tekki Sandan", "096 Tensho", "097 Tomari Bassai", "098 Unshu", 
  "099 Unsu", "100 Useishi", "101 Wankan", "102 Wanshu"
];

const removeVietnameseAccents = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

function AutocompleteInput({ defaultValue, options, onOk, onCancel, inputRef }) {
  const [value, setValue] = useState(defaultValue || "");
  const [showOptions, setShowOptions] = useState(false);
  
  const filteredOptions = options.filter(o => {
    const search = removeVietnameseAccents(value).toLowerCase();
    const target = removeVietnameseAccents(o).toLowerCase();
    // Also try to match raw number or string
    return target.includes(search) || o.toLowerCase().includes(value.toLowerCase());
  });

  return (
    <div style={{ position: 'relative', textAlign: 'left' }}>
      <input
        ref={inputRef}
        className="bracket-dialog-input"
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setShowOptions(true);
        }}
        onFocus={() => setShowOptions(true)}
        onBlur={() => setTimeout(() => setShowOptions(false), 200)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Check if filtered options has exact 1 match and value is not exactly it, we might want to auto-select, but let's just submit the value.
            onOk(value);
          }
          if (e.key === "Escape") onCancel();
        }}
        autoComplete="off"
        placeholder="Nhập tên bài quyền..."
      />
      {showOptions && filteredOptions.length > 0 && (
        <ul className="custom-datalist">
          {filteredOptions.map((opt, i) => (
            <li 
              key={i} 
              onClick={() => {
                setValue(opt);
                setShowOptions(false);
                // Also auto focus back to let user hit Enter or just submit right away:
                setTimeout(() => onOk(opt), 0);
              }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BracketPage() {
  const { id } = useParams();
  const { tournaments, currentTournament, currentCategory } = useTournament();
  const dispatch = useTournamentDispatch();
  const [exporting, setExporting] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(true); // Bật drag & drop mặc định
  const [swapHistory, setSwapHistory] = useState([]); // Lưu lịch sử swap để undo
  const { activeHint, clearHint } = useOnboarding();
  const navigate = useNavigate();
  // Custom dialog — replaces window.prompt / window.confirm (Electron blocks those)
  const [dialog, setDialog] = useState(null);
  const dialogInputRef = useRef(null);
  useEffect(() => {
    if (dialog?.type === "prompt" && dialogInputRef.current) {
      setTimeout(() => dialogInputRef.current?.focus(), 50);
    }
  }, [dialog]);

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
    clearHint();
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
    clearHint();
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

    switch (action) {
      case "disqualify": {
        const athlete = athleteSlot === 1 ? match.athlete1 : match.athlete2;
        const opponent = athleteSlot === 1 ? match.athlete2 : match.athlete1;
        setDialog({
          type: "prompt",
          title: "🚫 Loại VĐV (sức khỏe / vi phạm)",
          message: `Lý do loại ${athlete?.name || "VĐV"}:`,
          defaultValue: "Vi phạm",
          onOk: (reason) => {
            setDialog(null);
            if (reason === null || reason === undefined) return;
            const updatedBracket = disqualifyAthlete(
              category.bracket,
              match.id,
              athleteSlot,
              reason || "Loại"
            );
            dispatch({
              type: ACTIONS.UPDATE_CATEGORY,
              payload: { id: category.id, bracket: updatedBracket },
            });
          },
          onCancel: () => setDialog(null),
        });
        break;
      }
      case "set_winner": {
        const updatedBracket = updateMatchResult(
          category.bracket,
          match.id,
          athleteSlot === 1 ? 1 : 0,
          athleteSlot === 1 ? 0 : 1,
          (athleteSlot === 1 ? match.athlete1 : match.athlete2)?.id
        );
        dispatch({
          type: ACTIONS.UPDATE_CATEGORY,
          payload: { id: category.id, bracket: updatedBracket },
        });
        break;
      }
      case "reset_match": {
        setDialog({
          type: "confirm",
          title: "↩️ Reset trận đấu",
          message: "Reset trận đấu này? Kết quả sẽ bị xóa.",
          onOk: () => {
            setDialog(null);
            const updatedBracket = resetMatch(category.bracket, match.id);
            dispatch({
              type: ACTIONS.UPDATE_CATEGORY,
              payload: { id: category.id, bracket: updatedBracket },
            });
          },
          onCancel: () => setDialog(null),
        });
        break;
      }
      case "set_kata": {
        const athlete = athleteSlot === 1 ? match.athlete1 : match.athlete2;
        const currentKata = athleteSlot === 1 ? match.kata1 : match.kata2;
        setDialog({
          type: "prompt",
          title: "🥋 Đăng ký bài quyền (Kata)",
          message: `Nhập hoặc chọn tên bài quyền cho ${athlete?.name || "VĐV"}:`,
          defaultValue: currentKata || "",
          options: WKF_KATA_LIST,
          onOk: (kataName) => {
            setDialog(null);
            if (kataName === null || kataName === undefined) return;
            const updatedMatches = category.bracket.matches.map(m => {
              if (m.id === match.id) {
                return { ...m, [athleteSlot === 1 ? "kata1" : "kata2"]: kataName.trim() };
              }
              return m;
            });
            const updatedBracket = { ...category.bracket, matches: updatedMatches };
            dispatch({
              type: ACTIONS.UPDATE_CATEGORY,
              payload: { id: category.id, bracket: updatedBracket },
            });
          },
          onCancel: () => setDialog(null),
        });
        break;
      }
      default:
        return;
    }
  };
  /**
   * Xử lý hoán đổi VĐV giữa 2 vị trí trong sơ đồ
   * Hoạt động cho cả cùng trận và khác trận
   */
  const handleSwapAthletes = (fromMatchId, fromSlot, toMatchId, toSlot) => {
    if (!category?.bracket) return;
    
    const matches = [...category.bracket.matches];
    const fromMatch = matches.find(m => m.id === fromMatchId);
    const toMatch = matches.find(m => m.id === toMatchId);
    
    if (!fromMatch || !toMatch) return;
    
    // Lưu trạng thái trước khi swap vào history (có thể undo)
    setSwapHistory(prev => [...prev.slice(-9), {
      fromMatchId, fromSlot, toMatchId, toSlot,
      fromAthlete1: fromMatch.athlete1,
      fromAthlete2: fromMatch.athlete2,
      toAthlete1: toMatch.athlete1,
      toAthlete2: toMatch.athlete2,
    }]);
    
    // Lấy VĐV từ cả hai vị trí
    const fromAthlete = fromSlot === 1 ? fromMatch.athlete1 : fromMatch.athlete2;
    const toAthlete = toSlot === 1 ? toMatch.athlete1 : toMatch.athlete2;
    
    // Deep clone matches để update
    const updatedMatches = matches.map(m => {
      if (m.id === fromMatchId && m.id === toMatchId) {
        // Swap trong cùng trận
        const updated = { ...m };
        if (fromSlot === 1) updated.athlete1 = toAthlete;
        else updated.athlete2 = toAthlete;
        if (toSlot === 1) updated.athlete1 = fromAthlete;
        else updated.athlete2 = fromAthlete;
        return updated;
      } else if (m.id === fromMatchId) {
        const updated = { ...m };
        if (fromSlot === 1) updated.athlete1 = toAthlete;
        else updated.athlete2 = toAthlete;
        // Reset winner nếu có thay đổi VĐV
        if (m.winner) updated.winner = null;
        return updated;
      } else if (m.id === toMatchId) {
        const updated = { ...m };
        if (toSlot === 1) updated.athlete1 = fromAthlete;
        else updated.athlete2 = fromAthlete;
        // Reset winner nếu có thay đổi VĐV
        if (m.winner) updated.winner = null;
        return updated;
      }
      return m;
    });
    
    const updatedBracket = { ...category.bracket, matches: updatedMatches };
    dispatch({
      type: ACTIONS.UPDATE_CATEGORY,
      payload: { id: category.id, bracket: updatedBracket },
    });
  };

  /**
   * Undo thao tác swap cuối cùng
   */
  const handleUndoSwap = () => {
    if (swapHistory.length === 0 || !category?.bracket) return;
    
    const last = swapHistory[swapHistory.length - 1];
    const matches = category.bracket.matches.map(m => {
      if (m.id === last.fromMatchId) {
        return { ...m, athlete1: last.fromAthlete1, athlete2: last.fromAthlete2, winner: null };
      }
      if (m.id === last.toMatchId) {
        return { ...m, athlete1: last.toAthlete1, athlete2: last.toAthlete2, winner: null };
      }
      return m;
    });
    
    dispatch({
      type: ACTIONS.UPDATE_CATEGORY,
      payload: { id: category.id, bracket: { ...category.bracket, matches } },
    });
    setSwapHistory(prev => prev.slice(0, -1));
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
            <h1 className="page-title">
              <img src={appIcon} alt="" className="page-title-logo" />
              {category.name}
            </h1>
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
            <button className="btn btn-secondary" onClick={() => navigate(-1)} title="Quay về trang trước">
              ← Quay lại
            </button>
            <Link to={`/category/${category.id}`} className="btn btn-secondary">
              📄 Chi tiết nội dung
            </Link>
            {/* Nút toggle Drag & Drop */}
            <button
              className={`btn ${dragEnabled ? 'btn-warning' : 'btn-secondary'}`}
              onClick={() => setDragEnabled(!dragEnabled)}
              title={dragEnabled ? 'Tắt chế độ kéo thả' : 'Bật chế độ kéo thả sửa sơ đồ'}
              style={{
                background: dragEnabled ? 'linear-gradient(135deg, #f59e0b, #d97706)' : undefined,
                color: dragEnabled ? '#fff' : undefined,
                border: dragEnabled ? 'none' : undefined,
                fontWeight: 600,
              }}
            >
              {dragEnabled ? '🔒 Tắt kéo thả' : '🔓 Bật kéo thả'}
            </button>
            {/* Nút Undo swap */}
            {swapHistory.length > 0 && (
              <button
                className="btn btn-secondary"
                onClick={handleUndoSwap}
                title="Hoàn tác thao tác hoán đổi VĐV cuối cùng"
              >
                ↩️ Undo ({swapHistory.length})
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={handleExportScoreSheet}
            >
              📝 Xuất bảng điểm
            </button>
            <button
              className={`btn btn-primary ${activeHint === "publish_bracket" ? "hint-pulse" : ""}`}
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
            onSwapAthletes={handleSwapAthletes}
            dragEnabled={dragEnabled}
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
                </tr>{" "}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== CUSTOM DIALOG (replaces window.prompt / window.confirm) ===== */}
      {dialog && (
        <div
          className="bracket-dialog-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) dialog.onCancel();
          }}
        >
          <div className="bracket-dialog">
            <div className="bracket-dialog-title">{dialog.title}</div>
            <div className="bracket-dialog-message">{dialog.message}</div>
            {dialog.type === "prompt" && (
              <>
                {dialog.options ? (
                  <AutocompleteInput 
                    defaultValue={dialog.defaultValue} 
                    options={dialog.options} 
                    onOk={dialog.onOk} 
                    onCancel={dialog.onCancel} 
                    inputRef={dialogInputRef}
                  />
                ) : (
                  <input
                    ref={dialogInputRef}
                    className="bracket-dialog-input"
                    type="text"
                    defaultValue={dialog.defaultValue || ""}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") dialog.onOk(e.target.value);
                      if (e.key === "Escape") dialog.onCancel();
                    }}
                    autoComplete="off"
                  />
                )}
              </>
            )}
            <div className="bracket-dialog-actions">
              <button
                className="bracket-dialog-btn cancel"
                onClick={dialog.onCancel}
              >
                Hủy
              </button>
              <button
                className={`bracket-dialog-btn ok ${
                  dialog.type === "confirm" ? "danger" : "primary"
                }`}
                onClick={() => {
                  if (dialog.type === "prompt") {
                    dialog.onOk(dialogInputRef.current?.value ?? "");
                  } else {
                    dialog.onOk();
                  }
                }}
              >
                {dialog.type === "confirm" ? "Xác nhận" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
