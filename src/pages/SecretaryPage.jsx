import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useRole, ROLES } from "../context/RoleContext";
import {
  openKmatchFile,
  exportResultsToJson,
  exportResultsToExcel,
} from "../services/matchService";
import {
  openScoreboard,
  listenForMatchResult,
} from "../services/scoreboardService";
import { useOnboarding } from "../context/OnboardingContext";
import {
  updateMatchResult as updateBracketWithResult,
  disqualifyAthlete,
} from "../utils/drawEngine";
import { sendMatchResult, sendCategoryMedals, checkAdminAvailability } from "../services/lanService";
import {
  publishLiveStatus,
  getCategoryLiveQueue,
  getConfiguredMats,
  getCategoryMatId,
  isCategoryCompleted,
} from "../services/liveEventService";
import { validateKataRegistration } from "../services/kataRegistrationRules";
import Modal from "../components/common/Modal";
import Bracket from "../components/Bracket/Bracket";
import appIcon from "../assets/icon.png";
import { updateAuxiliaryMatchResult } from "../domain/bronzeIntegration.js";
import { selectCategoryMedalists } from "../domain/bronzeMedalSelection.js";
import QRCode from "qrcode";
import "./SecretaryPage.css";

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

const getAthleteKey = (athlete) =>
  String(athlete?.id || athlete?.name || "").trim().toLowerCase();

const getKataHistory = (category, currentMatch, athlete, registrations) => {
  const athleteKey = getAthleteKey(athlete);
  return (category?.bracket?.matches || [])
    .filter((item) => !item.isBye && Number(item.round) < Number(currentMatch.round))
    .sort((left, right) => Number(left.round) - Number(right.round))
    .map((item) => {
      const slot = getAthleteKey(item.athlete1) === athleteKey
        ? 1
        : getAthleteKey(item.athlete2) === athleteKey
          ? 2
          : 0;
      if (!slot) return "";
      return registrations[item.id]?.[slot === 1 ? "kata1" : "kata2"]
        || item[slot === 1 ? "kata1" : "kata2"]
        || "";
    })
    .filter(Boolean);
};

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

  const filteredOptions = options.filter((o) => {
    const search = removeVietnameseAccents(value).toLowerCase();
    const target = removeVietnameseAccents(o).toLowerCase();
    return target.includes(search) || o.toLowerCase().includes(value.toLowerCase());
  });

  return (
    <div style={{ position: "relative", textAlign: "left" }}>
      <input
        ref={inputRef}
        className="secretary-dialog-input"
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setShowOptions(true); }}
        onFocus={() => setShowOptions(true)}
        onBlur={() => setTimeout(() => setShowOptions(false), 200)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOk(value);
          if (e.key === "Escape") onCancel();
        }}
        autoComplete="off"
        placeholder="Nhập tên bài quyền..."
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      {showOptions && filteredOptions.length > 0 && (
        <ul style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "#fff", border: "1px solid #cbd5e1", borderRadius: "6px",
          maxHeight: "200px", overflowY: "auto", margin: 0, padding: 0,
          listStyle: "none", zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
        }}>
          {filteredOptions.map((opt, i) => (
            <li
              key={i}
              onMouseDown={() => { setValue(opt); setShowOptions(false); setTimeout(() => onOk(opt), 0); }}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: "13px",
                borderBottom: "1px solid #f1f5f9"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f0f9ff"}
              onMouseLeave={(e) => e.currentTarget.style.background = ""}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * SecretaryPage - Trang bấm điểm cho Thư ký
 */
function SecretaryPage() {
  const navigate = useNavigate();
  const {
    role,
    matchData,
    matchResults,
    matchResultsRevision,
    scoringEnabled,
    canScore,
    loadMatchData,
    updateMatchResult,
    removeMatchResult,
    getMatchExportData,
    resetRole,
  } = useRole();
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [activeMatchId, setActiveMatchId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState("");
  const [finishedMatch, setFinishedMatch] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [adminIp, setAdminIp] = useState(localStorage.getItem("adminIp") || "");
  const [autoMedalStatus, setAutoMedalStatus] = useState({ synced: 0, complete: 0 });
  const medalSyncQueueRef = useRef(Promise.resolve());
  const liveExtraRef = useRef({});
  const { activeHint, clearHint } = useOnboarding();
  // Lưu tên bài quyền đã đăng ký: { [matchId]: { kata1, kata2 } }
  const [kataRegistrations, setKataRegistrations] = useState(() => {
    try {
      const saved = localStorage.getItem("secretary_kata_registrations");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const saveKataRegistration = useCallback((matchId, slot, kataName) => {
    setKataRegistrations((prev) => {
      const prefix = slot === 1 ? "kata1" : "kata2";
      const updated = {
        ...prev,
        [matchId]: {
          ...(prev[matchId] || {}),
          [prefix]: kataName,
          [`${prefix}Source`]: "secretary",
          [`${prefix}RegisteredBy`]: "Thư ký",
          [`${prefix}RegisteredAt`]: new Date().toISOString(),
        },
      };
      localStorage.setItem("secretary_kata_registrations", JSON.stringify(updated));
      return updated;
    });
  }, []);


  // Sidebar search/filter
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState("all"); // all | kata | kumite
  const [selectedMat, setSelectedMat] = useState(
    () => localStorage.getItem("secretary_selected_mat") || "all"
  );

  const matOptions = useMemo(() => getConfiguredMats(matchData), [matchData]);
  const activeSelectedMat = selectedMat === "all" || matOptions.some((mat) => mat.id === selectedMat)
    ? selectedMat
    : "all";

  // ===== KATA RECEIVE SERVER STATE =====
  const [kataReceive, setKataReceive] = useState({
    running: false, ip: '', port: 3002, pin: '', url: '', matId: '1'
  });
  const [showKataQR, setShowKataQR] = useState(false);
  const [kataQrDataUrl, setKataQrDataUrl] = useState("");
  const isElectron = Boolean(window.electronAPI?.kataReceive);

  const getKataPinStorageKey = useCallback((matId) => {
    const tournamentKey = matchData?.exportId || matchData?.tournamentId || "default";
    return `kata_receive_pin_${tournamentKey}_${matId}`;
  }, [matchData?.exportId, matchData?.tournamentId]);

  const getOrCreateKataPin = useCallback((matId, forceNew = false) => {
    const storageKey = getKataPinStorageKey(matId);
    if (!forceNew) {
      const savedPin = localStorage.getItem(storageKey);
      if (/^\d{4}$/.test(savedPin || "")) return savedPin;
    }
    const nextPin = Math.floor(1000 + Math.random() * 9000).toString();
    localStorage.setItem(storageKey, nextPin);
    return nextPin;
  }, [getKataPinStorageKey]);

  const startKataReceiveServer = useCallback(async (forceNewPin = false) => {
    if (!isElectron) return;
    const matId = activeSelectedMat === 'all' ? '1' : activeSelectedMat;
    const pin = getOrCreateKataPin(matId, forceNewPin);
    try {
      const result = await window.electronAPI.kataReceive.start(matId, pin);
      if (result.success) {
        const url = `http://${result.ip}:${result.port}/?mat=${encodeURIComponent(matId)}&pin=${encodeURIComponent(pin)}`;
        setKataReceive({ running: true, ip: result.ip, port: result.port, pin, url, matId });
        setShowKataQR(true);
        setNotification('📱 Đã bật nhận bài quyền từ thiết bị ngoài');
        setTimeout(() => setNotification(''), 3000);
      } else {
        setError('Không thể bật server: ' + (result.error || ''));
      }
    } catch (e) { setError('Lỗi: ' + e.message); }
  }, [isElectron, activeSelectedMat, getOrCreateKataPin]);

  const changeKataReceivePin = useCallback(async () => {
    if (!isElectron) return;
    try {
      await window.electronAPI.kataReceive.stop();
      setKataQrDataUrl("");
      await startKataReceiveServer(true);
      setNotification("🔐 Đã đổi PIN và tạo QR mới");
      setTimeout(() => setNotification(""), 3000);
    } catch (error) {
      setError(`Không thể đổi PIN: ${error.message}`);
    }
  }, [isElectron, startKataReceiveServer]);

  useEffect(() => {
    let active = true;
    if (!kataReceive.url) {
      return undefined;
    }
    QRCode.toDataURL(kataReceive.url, { width: 400, margin: 2, errorCorrectionLevel: "M" })
      .then((dataUrl) => { if (active) setKataQrDataUrl(dataUrl); })
      .catch((error) => { if (active) setError(`Không thể tạo QR offline: ${error.message}`); });
    return () => { active = false; };
  }, [kataReceive.url]);

  const stopKataReceiveServer = useCallback(async () => {
    if (!isElectron) return;
    try { await window.electronAPI.kataReceive.stop(); } catch (error) { console.warn("Không thể dừng máy chủ nhận bài quyền:", error.message); }
    setKataQrDataUrl("");
    setKataReceive({ running: false, ip: '', port: 3002, pin: '', url: '', matId: '1' });
    setShowKataQR(false);
    setNotification('📴 Đã tắt nhận bài quyền từ thiết bị ngoài');
    setTimeout(() => setNotification(''), 3000);
  }, [isElectron]);

  // Lắng nghe kata được gửi từ thiết bị ngoài → cập nhật kataRegistrations
  useEffect(() => {
    if (!isElectron) return undefined;
    const cleanup = window.electronAPI.kataReceive.onKataRegistered((data) => {
      setKataRegistrations((prev) => {
        const updated = {
          ...prev,
          [data.matchId]: {
            ...(prev[data.matchId] || {}),
            [data.slot === 1 ? 'kata1' : 'kata2']: data.kataName,
            [data.slot === 1 ? 'kata1Source' : 'kata2Source']: 'remote',
            [data.slot === 1 ? 'kata1RegisteredBy' : 'kata2RegisteredBy']: data.registeredBy || '',
            [data.slot === 1 ? 'kata1RegisteredAt' : 'kata2RegisteredAt']: data.registeredAt || new Date().toISOString(),
          },
        };
        localStorage.setItem('secretary_kata_registrations', JSON.stringify(updated));
        return updated;
      });
      setNotification(`📱 Nhận từ thiết bị: ${data.kataName}${data.registeredBy ? ' (' + data.registeredBy + ')' : ''}`);
      setTimeout(() => setNotification(''), 4000);
    });
    return cleanup;
  }, [isElectron]);

  // Đồng bộ danh sách trận lên Kata Receive Server
  const forceSyncKata = useCallback(() => {
    if (!isElectron || !kataReceive.running || !matchData?.categories) return;

    // Lấy TẤT CẢ các nội dung Kata thuộc Thảm đang chọn
    const kataCategories = matchData.categories.filter((c) => {
      const matchesMat = activeSelectedMat === "all" || String(getCategoryMatId(matchData, c)) === String(activeSelectedMat);
      const typeStr = String(c.type || "").toLowerCase();
      const nameStr = String(c.name || "").toLowerCase();
      const isKata = typeStr === "kata" || nameStr.includes("kata") || nameStr.includes("quyền");
      return isKata && matchesMat;
    });

    let allKataMatches = [];
    for (const c of kataCategories) {
      // Apply local results before publishing, including automatic advancement.
      let sourceBracket = c.bracket;
      if (sourceBracket?.matches) {
        sourceBracket = JSON.parse(JSON.stringify(sourceBracket));
        [...matchResults]
          .sort((a, b) => {
            const matchA = sourceBracket.matches.find((m) => m.id === a.matchId);
            const matchB = sourceBracket.matches.find((m) => m.id === b.matchId);
            return (matchA?.round || 0) - (matchB?.round || 0);
          })
          .forEach((result) => {
            if (!sourceBracket.matches.some((m) => m.id === result.matchId)) return;
            if (result.disqualifiedSlot) {
              disqualifyAthlete(sourceBracket, result.matchId, result.disqualifiedSlot, result.disqualifiedReason || "Loại");
            } else if (result.winnerId) {
              updateBracketWithResult(sourceBracket, result.matchId, result.score1, result.score2, result.winnerId);
            }
          });
      }
      const rawMatches = (sourceBracket?.matches || c.matches || []).filter((m) => !m.isBye);
      const maxRound = Math.max(...rawMatches.map((item) => Number(item.round) || 0));
      const matchesWithKata = rawMatches.map((m) => {
        const hasWinner = matchResults.some(r => r.matchId === m.id && r.winnerId) || !!m.winner;
        return {
          id: m.id,
          matchCode: m.matchCode,
          categoryId: c.id,
          categoryName: c.name,
          athlete1: m.athlete1,
          athlete2: m.athlete2,
          kata1: kataRegistrations[m.id]?.kata1 || m.kata1 || "",
          kata2: kataRegistrations[m.id]?.kata2 || m.kata2 || "",
          isCompleted: hasWinner,
          round: Number(m.round) || 1,
          roundName: c.bracket?.roundNames?.[m.round - 1] || `Vòng ${m.round}`,
          ageGroup: c.ageGroup || c.name,
          isFinal: Number(m.round) === maxRound,
          previousKatas1: getKataHistory(c, m, m.athlete1, kataRegistrations),
          previousKatas2: getKataHistory(c, m, m.athlete2, kataRegistrations),
        };
      });
      allKataMatches = allKataMatches.concat(matchesWithKata);
    }

    return window.electronAPI.kataReceive.updateMatches(allKataMatches);
  }, [isElectron, kataReceive.running, matchData, activeSelectedMat, kataRegistrations, matchResults]);

  useEffect(() => {
    forceSyncKata();
  }, [forceSyncKata]);

  // Khóa trận đang thi đấu
  useEffect(() => {
    if (!isElectron || !kataReceive.running) return;
    window.electronAPI.kataReceive.lockMatch(activeMatchId || null).catch(() => {});
  }, [isElectron, kataReceive.running, activeMatchId]);

  const filteredCategories = useMemo(() => {
    if (!matchData?.categories) return [];
    const search = sidebarSearch.toLowerCase().trim();
    return matchData.categories
      .filter((category) => {
        const matchesMat = activeSelectedMat === "all" ||
          getCategoryMatId(matchData, category) === activeSelectedMat;
        const matchesSearch = !search || category.name.toLowerCase().includes(search);
        const matchesType = sidebarFilter === "all" || category.type === sidebarFilter;
        return matchesMat && matchesSearch && matchesType;
      })
      .sort((left, right) => {
        const completionOrder = Number(isCategoryCompleted(left, matchResults)) -
          Number(isCategoryCompleted(right, matchResults));
        if (completionOrder !== 0) return completionOrder;
        const a = matchData.schedule?.[left.id] || {};
        const b = matchData.schedule?.[right.id] || {};
        return String(a.date || "").localeCompare(String(b.date || "")) ||
          String(a.time || "").localeCompare(String(b.time || "")) ||
          Number(a.order || 0) - Number(b.order || 0);
      });
  }, [activeSelectedMat, matchData, matchResults, sidebarFilter, sidebarSearch]);

  // Custom dialog (replaces window.prompt / window.confirm for Electron compatibility)
  const [dialog, setDialog] = useState(null);
  // dialog shape: { type: "prompt"|"confirm", title, message, defaultValue, onOk, onCancel }
  const dialogInputRef = useRef(null);

  // Focus input when prompt dialog opens
  useEffect(() => {
    if (dialog?.type === "prompt" && dialogInputRef.current) {
      setTimeout(() => dialogInputRef.current?.focus(), 50);
    }
  }, [dialog]);

  // Redirect if not Secretary
  useEffect(() => {
    if (role !== ROLES.SECRETARY) {
      navigate("/");
    }
  }, [role, navigate]);

  // Helper to find match by ID (for winner determination)
  const getMatchById = useCallback((matchId) => {
    if (!matchData?.categories) return null;
    for (const cat of matchData.categories) {
      const match = cat.matches?.find((m) => m.id === matchId);
      if (match) return match;
    }
    return null;
  }, [matchData]);

  // Listen for match results from scoreboard
  useEffect(() => {
    const handleMatchResult = (result) => {
      console.log("Received match result:", result);

      // Update result in context
      const updateStatus = updateMatchResult(result.matchId, {
        score1: result.score1,
        score2: result.score2,
        winner: result.winnerId
          ? result.winnerId ===
            (getMatchById(result.matchId)?.athlete1?.id || "athlete1")
            ? "athlete1"
            : "athlete2"
          : null,
        ...result,
      });

      if (updateStatus.success) {
        setNotification(`✅ Đã cập nhật kết quả trận đấu!`);
        
        // Show Match End Modal for sync/export options
        const match = getMatchById(result.matchId);
        if (match) {
          const winner = result.winnerId 
            ? (result.winnerId === match.athlete1?.id ? match.athlete1 : match.athlete2) 
            : null;

          setFinishedMatch({
            ...result,
            match,
            matchCode: match.matchCode,
            winner,
            categoryName: selectedCategory?.name,
            tournamentName: matchData?.tournamentName,
            tournamentId: matchData?.tournamentId
          });
        }
        
        setTimeout(() => setNotification(""), 3000);
      } else {
        setError(`Lỗi cập nhật kết quả: ${updateStatus.error}`);
      }
    };

    // listenForMatchResult returns a cleanup function
    const cleanup = listenForMatchResult(handleMatchResult);

    return () => {
      cleanup();
    };
  }, [
    getMatchById,
    matchData?.tournamentId,
    matchData?.tournamentName,
    selectedCategory?.name,
    updateMatchResult,
  ]);

  // Open .kmatch file
  const handleOpenFile = async () => {
    clearHint();
    setError("");
    setLoading(true);
    try {
      const result = await openKmatchFile();
      if (result.success) {
        setSelectedCategory(null);
        setActiveMatchId(null);
        loadMatchData(result.data);
      } else {
        setError(result.error || "Không thể đọc file");
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };
  const publishCategoryLive = (category, extra = {}) => {
    if (!category || !matchData?.tournamentId) return;
    liveExtraRef.current = extra;
    publishLiveStatus(adminIp, matchData, category, {
      selectedMatId: activeSelectedMat,
      matchResults,
      ...extra,
    }).then((result) => {
      if (!result.success) console.warn("Không thể đồng bộ trạng thái TV:", result.message);
    });
  };
  const handleSelectCategory = (category) => {
    setSelectedCategory(category);
    setActiveMatchId(null);
    liveExtraRef.current = {};
    publishCategoryLive(category);
  };
  const handleMatChange = (matId) => {
    setSelectedMat(matId);
    localStorage.setItem("secretary_selected_mat", matId);
    const categoriesOnMat = (matchData?.categories || []).filter(
      (category) => matId === "all" || getCategoryMatId(matchData, category) === matId
    );
    const nextCategory = categoriesOnMat.find(
      (category) => !isCategoryCompleted(category, matchResults)
    ) || categoriesOnMat[0] || null;
    setSelectedCategory(nextCategory);
    setActiveMatchId(null);
    liveExtraRef.current = {};
  };

  // Keep this secretary machine visible on the Admin TV dashboard and recover
  // automatically when either machine or the LAN connection restarts.
  useEffect(() => {
    if (!adminIp || !selectedCategory || !matchData?.tournamentId) return undefined;
    let active = true;
    const heartbeat = () => {
      publishLiveStatus(adminIp, matchData, selectedCategory, {
        selectedMatId: activeSelectedMat,
        matchResults,
        ...liveExtraRef.current,
      })
        .then((result) => {
          if (active && !result.success) {
            console.warn("Không thể duy trì đồng bộ trạng thái TV:", result.message);
          }
        });
    };
    heartbeat();
    const intervalId = window.setInterval(heartbeat, 4000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [activeSelectedMat, adminIp, matchData, matchResults, selectedCategory]);

  // Khi đủ HCV, HCB và hai HCĐ, tự động gửi đúng một phiên bản kết quả
  // qua LAN. Nếu Thư ký sửa kết quả, fingerprint đổi và bản mới sẽ được gửi lại.
  useEffect(() => {
    if (!matchData?.tournamentId) return;

    // Restored SQLite results are useful for continuing interrupted work, but
    // opening/restoring a session must never broadcast them automatically.
    // Arm auto-medal sync only after the secretary changes a result now.
    if (matchResultsRevision === 0) {
      setAutoMedalStatus({ synced: 0, complete: 0 });
      return;
    }

    const medals = getMatchExportData()?.categoryMedals || [];
    const completeMedals = medals.filter(
      (item) => item.gold && item.silver && item.bronze1 && item.bronze2
    );
    const storagePrefix = `lan_medals_${matchData.exportId || matchData.tournamentId}_`;
    const alreadySynced = completeMedals.filter((item) => {
      const fingerprint = JSON.stringify({
        gold: item.gold,
        silver: item.silver,
        bronze1: item.bronze1,
        bronze2: item.bronze2,
      });
      return localStorage.getItem(`${storagePrefix}${item.categoryId}`) === fingerprint;
    }).length;
    medalSyncQueueRef.current = medalSyncQueueRef.current.then(async () => {
      let synced = alreadySynced;
      if (adminIp) {
        for (const item of completeMedals) {
          const medalsPayload = {
            gold: item.gold,
            silver: item.silver,
            bronze1: item.bronze1,
            bronze2: item.bronze2,
          };
          const fingerprint = JSON.stringify(medalsPayload);
          const storageKey = `${storagePrefix}${item.categoryId}`;
          if (localStorage.getItem(storageKey) === fingerprint) continue;

          const result = await sendCategoryMedals(adminIp, 3000, {
            tournamentId: matchData.tournamentId,
            exportId: matchData.exportId,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            medals: medalsPayload,
            syncProtocol: 2,
            confirmedInCurrentRun: true,
            syncedAt: new Date().toISOString(),
          });
          if (result.success) {
            localStorage.setItem(storageKey, fingerprint);
            synced += 1;
          }
        }
      }
      setAutoMedalStatus({ synced, complete: completeMedals.length });
    });
  }, [adminIp, getMatchExportData, matchData, matchResults, matchResultsRevision]);
  // Prepare bracket with live scores
  const bracketWithScores = useMemo(() => {
    if (!selectedCategory?.bracket) return null;

    // Deep clone bracket to allow mutation by the engine helper
    let clonedBracket = JSON.parse(JSON.stringify(selectedCategory.bracket));

    // Merge kata registrations vào bracket
    if (kataRegistrations && Object.keys(kataRegistrations).length > 0) {
      clonedBracket.matches = clonedBracket.matches.map((m) => {
        const kataInfo = kataRegistrations[m.id];
        if (!kataInfo) return m;
        return { ...m, ...kataInfo };
      });
    }

    // Apply all local results to the cloned bracket
    // This ensures winners are advanced to next rounds automatically
    // Sort results by round to ensure proper advancement dependency
    const sortedResults = [...matchResults].sort((a, b) => {
      const matchA = clonedBracket.matches.find(m => m.id === a.matchId);
      const matchB = clonedBracket.matches.find(m => m.id === b.matchId);
      return (matchA?.round || 0) - (matchB?.round || 0);
    });

    sortedResults.forEach((result) => {
      if ((clonedBracket.auxiliaryMatches || []).some((match) => match.id === result.matchId)) {
        if (result.winnerId) {
          const auxiliary = updateAuxiliaryMatchResult({
            bracket: clonedBracket,
            matchId: result.matchId,
            winnerId: result.winnerId,
            score1: result.score1,
            score2: result.score2,
          });
          if (auxiliary.ok) clonedBracket = auxiliary.bracketCopy;
        }
        return;
      }
      if (result.disqualification && result.disqualifiedSlot) {
        // Apply disqualification
        disqualifyAthlete(
          clonedBracket,
          result.matchId,
          result.disqualifiedSlot,
          result.disqualifiedReason || "Loại"
        );
      } else if (result.winnerId) {
        updateBracketWithResult(
          clonedBracket,
          result.matchId,
          result.score1,
          result.score2,
          result.winnerId
        );
      }
    });

    return clonedBracket;
  }, [selectedCategory, matchResults, kataRegistrations]);
  const matQueuePreview = useMemo(() => {
    if (!matchData || !selectedCategory) return null;
    return getCategoryLiveQueue(matchData, selectedCategory, {
      selectedMatId: activeSelectedMat,
      currentMatchId: activeMatchId,
      matchResults,
    });
  }, [activeMatchId, activeSelectedMat, matchData, matchResults, selectedCategory]);
  // Handle right-click context menu actions from Bracket component
  const handleContextAction = (action, match, athleteSlot) => {
    if (!selectedCategory?.bracket) return;

    switch (action) {
      case "set_kata": {
        const athlete = athleteSlot === 1 ? match.athlete1 : match.athlete2;
        const currentKata = (kataRegistrations[match.id] || {})[athleteSlot === 1 ? "kata1" : "kata2"] || "";
        setDialog({
          type: "prompt",
          title: "🥋 Đăng ký bài quyền (Kata)",
          message: `Nhập hoặc chọn tên bài quyền cho ${athlete?.name || "VĐV"}:`,
          defaultValue: currentKata,
          options: WKF_KATA_LIST,
          onOk: (kataName) => {
            setDialog(null);
            if (kataName === null || kataName === undefined) return;
            const trimmedKata = kataName.trim();
            const maxRound = Math.max(
              ...(selectedCategory.bracket.matches || []).map((item) => Number(item.round) || 0)
            );
            const validation = validateKataRegistration({
              ageGroup: selectedCategory.ageGroup || selectedCategory.name,
              kataName: trimmedKata,
              previousKatas: getKataHistory(selectedCategory, match, athlete, kataRegistrations),
              round: Number(match.round) || 1,
              isFinal: Number(match.round) === maxRound,
            });
            if (!validation.valid) {
              setError(`⚠️ ${validation.message}`);
              setTimeout(() => setError(""), 6000);
              return;
            }
            saveKataRegistration(match.id, athleteSlot, trimmedKata);
            setNotification(`🥋 Đã đăng ký bài "${trimmedKata}" cho ${athlete?.name || "VĐV"}${validation.warning ? ` — ⚠️ ${validation.warning}` : ""}`);
            setTimeout(() => setNotification(""), 3000);
          },
          onCancel: () => setDialog(null),
        });
        break;
      }
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
            updateMatchResult(match.id, {
              matchId: match.id,
              disqualification: true,
              disqualifiedSlot: athleteSlot,
              disqualifiedReason: reason || "Loại",
              winnerId: opponent?.id || null,
              score1: null,
              score2: null,
            });
            setNotification(
              `🚫 Đã loại ${athlete?.name || "VĐV"}. ${
                opponent?.name || ""
              } thắng tự động.`
            );

            // Show sync modal for manual disqualify
            setFinishedMatch({
              matchId: match.id,
              matchCode: match.matchCode,
              score1: null,
              score2: null,
              winnerId: opponent?.id || null,
              disqualification: true,
              disqualifiedSlot: athleteSlot,
              disqualifiedReason: reason || "Loại",
              match,
              winner: opponent,
              categoryName: selectedCategory?.name,
              tournamentName: matchData?.tournamentName,
              tournamentId: matchData?.tournamentId
            });

            setTimeout(() => setNotification(""), 3000);
          },
          onCancel: () => setDialog(null),
        });
        break;
      }
      case "set_winner": {
        const winner = athleteSlot === 1 ? match.athlete1 : match.athlete2;
        if (!winner) return;
        updateMatchResult(match.id, {
          matchId: match.id,
          winnerId: winner.id,
          score1: athleteSlot === 1 ? 1 : 0,
          score2: athleteSlot === 1 ? 0 : 1,
        });
        setNotification(`🏆 ${winner.name} thắng trận!`);

        // Show sync modal for manual winner
        setFinishedMatch({
          matchId: match.id,
          matchCode: match.matchCode,
          score1: athleteSlot === 1 ? 1 : 0,
          score2: athleteSlot === 1 ? 0 : 1,
          winnerId: winner.id,
          match,
          winner,
          categoryName: selectedCategory?.name,
          tournamentName: matchData?.tournamentName,
          tournamentId: matchData?.tournamentId
        });

        setTimeout(() => setNotification(""), 3000);
        break;
      }
      case "reset_match": {
        setDialog({
          type: "confirm",
          title: "↩️ Reset trận đấu",
          message: "Reset trận đấu này? Toàn bộ kết quả và loại VĐV sẽ bị xóa.",
          onOk: () => {
            setDialog(null);
            removeMatchResult(match.id);
            setNotification("↩️ Đã reset trận đấu.");
            setTimeout(() => setNotification(""), 3000);
          },
          onCancel: () => setDialog(null),
        });
        break;
      }
      default:
        return;
    }
  };

  // Select a match to score - opens the external scoreboard
  const handleSelectMatch = (match) => {
    if (!canScore) {
      setError("Chức năng bấm điểm chưa được bật");
      return;
    }

    // Only allow if match has athletes (at least one for bye handling, or both for fight)
    if (!match.athlete1 && !match.athlete2) return;

    if (!selectedCategory) return;

    // Determine round name
    const roundName =
      selectedCategory.bracket?.roundNames?.[match.round - 1] ||
      `Round ${match.round}`;

    try {
      setActiveMatchId(match.id);
      openScoreboard(
        match,
        selectedCategory.type || "kumite",
        selectedCategory.name,
        matchData.tournamentName,
        roundName,
        matchData.schedule?.[selectedCategory.id] || null,
        matchData.sponsorLogos || null
      );
      publishCategoryLive(selectedCategory, {
        currentMatch: match,
        currentMatchId: match.id,
        matchCode: match.matchCode || null,
        roundName,
      });
      setNotification("📺 Đã mở bảng điểm. Vui lòng thao tác trên cửa sổ mới.");
      setTimeout(() => setNotification(""), 5000);
    } catch (err) {
      setError("Không thể mở bảng điểm: " + err.message);
    }
  };

  // Export results
  const handleExport = async (format) => {
    const data = getMatchExportData();
    try {
      if (format === "json") {
        await exportResultsToJson(data);
      } else {
        await exportResultsToExcel(data);
      }
    } catch (err) {
      setError("Lỗi khi xuất file: " + err.message);
    }
  };

  // Back to role select
  const handleBack = () => {
    resetRole();
    navigate("/");
  };

  if (role !== ROLES.SECRETARY) return null;
  return (
    <div className="secretary-page">
      {/* Match End Modal (Dual Combat Sync) */}
      {finishedMatch && (
        <Modal
          title="🏆 TRẬN ĐẤU KẾT THÚC"
          onClose={() => setFinishedMatch(null)}
          maxWidth="500px"
        >
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#1e293b' }}>
              {finishedMatch.match.athlete1?.name} vs {finishedMatch.match.athlete2?.name}
            </h3>
            
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
              <div style={{ fontSize: '32px', fontWeight: 800, color: finishedMatch.winnerId === finishedMatch.match.athlete1?.id ? '#ef4444' : '#64748b' }}>
                {finishedMatch.score1}
              </div>
              <div style={{ fontSize: '20px', color: '#94a3b8' }}>-</div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: finishedMatch.winnerId === finishedMatch.match.athlete2?.id ? '#3b82f6' : '#64748b' }}>
                {finishedMatch.score2}
              </div>
            </div>

            {finishedMatch.winner && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
                <span style={{ display: 'block', fontSize: '13px', color: '#166534', marginBottom: '4px' }}>NGƯỜI CHIẾN THẮNG:</span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#065f46' }}>🥇 {finishedMatch.winner.name}</span>
              </div>
            )}

            <div style={{ marginBottom: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
              <p style={{ fontSize: '14px', color: '#475569', marginBottom: '12px', fontWeight: 600 }}>📡 ĐỒNG BỘ TÁC CHIẾN KÉP (LAN)</p>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <input 
                  type="text"
                  placeholder="IP máy Admin (ví dụ: 192.168.1.10)"
                  value={adminIp}
                  onChange={(e) => {
                    setAdminIp(e.target.value);
                    localStorage.setItem("adminIp", e.target.value);
                  }}
                  style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
              
              <button 
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '16px', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
                disabled={syncing}
                onClick={async () => {
                  if (!adminIp) {
                    setError("Vui lòng nhập IP máy Admin");
                    return;
                  }
                  setSyncing(true);
                  localStorage.setItem("adminIp", adminIp);
                  
                  const syncData = {
                    matchId: finishedMatch.matchId,
                    matchCode: finishedMatch.matchCode,
                    score1: finishedMatch.score1,
                    score2: finishedMatch.score2,
                    winnerId: finishedMatch.winnerId,
                    tournamentId: finishedMatch.tournamentId || matchData?.tournamentId
                  };
                  
                  const result = await sendMatchResult(adminIp, 3000, syncData);
                  setSyncing(false);
                  
                  if (result.success) {
                    setNotification("✅ Đã đồng bộ LAN thành công!");
                    setFinishedMatch(null);
                    setTimeout(() => setNotification(""), 3000);
                  } else {
                    setDialog({
                      type: "confirm",
                      title: "⚠️ Kết nối không ổn định",
                      message: `Không thể đồng bộ qua LAN (Lỗi: ${result.message}). Bạn có muốn xuất file Excel để dự phòng không?`,
                      onOk: () => {
                        setDialog(null);
                        handleExport("excel");
                        setFinishedMatch(null);
                      },
                      onCancel: () => setDialog(null)
                    });
                  }
                }}
              >
                {syncing ? "⏳ Đang đồng bộ..." : "🚀 Lưu & Đồng bộ LAN"}
              </button>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                💡 Nếu Admin chưa nhận được, hãy kiểm tra Firewall trên máy Admin hoặc bấm nút "Đồng bộ lại" bên dưới.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn btn-secondary"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => {
                  handleExport("excel");
                  setFinishedMatch(null);
                }}
              >
                📊 Chỉ xuất Excel (Dự phòng)
              </button>
              <button 
                className="btn btn-outline"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => setFinishedMatch(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="secretary-container">
        <header className="secretary-header">
          <div className="header-left">
            <button className="back-btn" onClick={handleBack}>
              ← Đổi vai trò
            </button>
            <h1 className="page-title">
              <img src={appIcon} alt="" className="page-title-logo" />
              Thư Ký
            </h1>
          </div>
          <div className="header-right">
            {!matchData && (
              <button
                className={`open-file-btn ${activeHint === "import_kmatch_secretary" ? "hint-pulse" : ""}`}
                onClick={handleOpenFile}
                disabled={loading}
                data-hint="MỞ FILE .KMATCH"
              >
                {loading ? "⏳ Đang tải..." : "📂 Mở file .kmatch"}
              </button>
            )}
            {matchData && (
              <button className="open-file-btn small" onClick={handleOpenFile}>
                🔄 Đổi file
              </button>
            )}
          </div>
        </header>
        {/* ===== KATA RECEIVE PANEL ===== */}
        {isElectron && matchData && (
          <div style={{
            background: kataReceive.running ? 'linear-gradient(135deg,#14532d,#166534)' : '#1e293b',
            border: `1px solid ${kataReceive.running ? '#22c55e' : '#334155'}`,
            borderRadius: '10px', padding: '10px 14px', margin: '0 0 8px 0',
            display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '16px' }}>📱</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: kataReceive.running ? '#86efac' : '#94a3b8', flex: 1 }}>
              {kataReceive.running
                ? `Đang tiếp nhận bài quyền – Thảm ${kataReceive.matId} • PIN: ${kataReceive.pin}`
                : 'Tiếp nhận bài quyền từ thiết bị ngoài'}
            </span>
            {kataReceive.running && (
              <>
                <button
                  onClick={async () => {
                    try {
                      await forceSyncKata();
                      setNotification('🔄 Đã làm mới dữ liệu bài quyền ở cả hai bên');
                    } catch {
                      setError('Không thể làm mới dữ liệu bài quyền');
                    }
                    setTimeout(() => setNotification(''), 3000);
                  }}
                  style={{ background: '#0284c7', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 700, padding: '5px 10px', cursor: 'pointer' }}
                >
                  🔄 Cập nhật ĐT
                </button>
                <button
                  onClick={() => setShowKataQR(v => !v)}
                  style={{ background: '#15803d', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 700, padding: '5px 10px', cursor: 'pointer' }}
                >
                  {showKataQR ? 'Ẩn QR' : '🔍 Xem QR & Link'}
                </button>
              </>
            )}
            <button
              onClick={kataReceive.running ? stopKataReceiveServer : () => startKataReceiveServer(false)}
              style={{
                background: kataReceive.running ? '#dc2626' : '#2563eb',
                border: 'none', borderRadius: '6px', color: '#fff',
                fontSize: '12px', fontWeight: 700, padding: '6px 14px', cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {kataReceive.running ? '⏹ Tắt' : '▶ Bật tiếp nhận bài quyền'}
            </button>
          </div>
        )}

        {/* QR Modal */}
        {showKataQR && kataReceive.running && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} onClick={() => setShowKataQR(false)}>
            <div style={{
              background: '#1e293b', border: '1px solid #334155', borderRadius: '16px',
              padding: '24px', maxWidth: '380px', width: '90vw', textAlign: 'center',
            }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px', color: '#f1f5f9' }}>
                📱 Đăng ký bài quyền từ điện thoại
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
                Mở camera quét QR hoặc nhập link trên cùng mạng Wi-Fi
              </p>
              <img
                src={kataQrDataUrl}
                alt="QR Code"
                style={{ width: 200, height: 200, background: '#fff', borderRadius: '8px', padding: 4 }}
              />
              <div style={{ margin: '14px 0 8px', fontSize: '13px', color: '#64748b' }}>hoặc mở link:</div>
              <div style={{
                background: '#0f172a', borderRadius: '8px', padding: '10px 12px',
                fontSize: '12px', wordBreak: 'break-all', color: '#60a5fa',
                fontFamily: 'monospace', marginBottom: '10px',
              }}>
                {kataReceive.url}
              </div>
              <div style={{
                display: 'flex', gap: '8px', justifyContent: 'center',
                background: '#0f172a', borderRadius: '8px', padding: '10px',
                marginBottom: '14px',
              }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Mã PIN:</span>
                <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '4px', color: '#fbbf24' }}>
                  {kataReceive.pin}
                </span>
              </div>
              <button
                onClick={changeKataReceivePin}
                style={{ background: '#b45309', border: 'none', borderRadius: '8px', color: '#fff', padding: '8px 14px', cursor: 'pointer', fontWeight: 700, marginRight: '8px' }}
              >🔐 Đổi PIN</button>
              <button
                onClick={() => setShowKataQR(false)}
                style={{ background: '#475569', border: 'none', borderRadius: '8px', color: '#fff', padding: '8px 24px', cursor: 'pointer', fontWeight: 600 }}
              >
                Đóng
              </button>
            </div>
          </div>
        )}
        {error && <div className="error-message">{error}</div>}
        {notification && (
          <div className="notification-toast">{notification}</div>
        )}
        {!matchData ? (
          <div className="no-file-section">
            <div className="no-file-icon">📂</div>
            <h2>Chưa có file giải đấu</h2>
            <p>Mở file .kmatch từ Admin để bắt đầu bấm điểm</p>
            <button 
              className={`open-file-btn ${activeHint === "import_kmatch_secretary" ? "hint-pulse" : ""}`} 
              onClick={handleOpenFile}
              data-hint="MỞ FILE .KMATCH"
            >
              Mở file .kmatch
            </button>
          </div>
        ) : (
          <>
            {/* Status Banner */}
            <div
              className={`status-banner ${
                scoringEnabled ? "enabled" : "disabled"
              }`}
            >
              <div className="status-info">
                <span className="status-icon">
                  {scoringEnabled ? "🟢" : "🔴"}
                </span>
                <span className="status-text">
                  {scoringEnabled
                    ? "Bấm điểm đang được bật"
                    : "Bấm điểm đang TẮT"}
                </span>
              </div>

              {/* Permanent LAN Sync Setting Area */}
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  background: 'rgba(255, 255, 255, 0.9)', 
                  padding: '4px 12px', 
                  borderRadius: '25px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '18px' }}>📡</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Cấu hình LAN:</span>
                </div>
                <input 
                  type="text"
                  placeholder="Nhập IP máy Admin"
                  value={adminIp}
                  onChange={(e) => {
                    setAdminIp(e.target.value);
                    localStorage.setItem("adminIp", e.target.value);
                  }}
                  style={{ 
                    padding: '4px 10px', 
                    borderRadius: '4px', 
                    border: '1px solid #cbd5e1', 
                    fontSize: '13px',
                    width: '140px'
                  }}
                />
                <button 
                  onClick={async () => {
                    if (!adminIp) {
                      setError("Vui lòng nhập IP máy Admin");
                      return;
                    }
                    setSyncing(true);
                    const isAvailable = await checkAdminAvailability(adminIp, 3000);
                    setSyncing(false);
                    if (isAvailable) {
                      setNotification("✅ Kết nối tới máy Admin OK!");
                    } else {
                      setError("❌ Không thể kết nối tới máy Admin. Hãy kiểm tra IP và Firewall.");
                    }
                    setTimeout(() => setNotification(""), 3000);
                  }}
                  className="btn btn-sm"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  disabled={syncing}
                >
                  {syncing ? "..." : "Kiểm tra"}
                </button>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  (Cài đặt một lần, dùng mãi mãi)
                </span>
                <span
                  title="Tự động đồng bộ khi đủ HCV, HCB và hai HCĐ"
                  style={{ fontSize: '11px', fontWeight: 700, color: autoMedalStatus.complete > 0 && autoMedalStatus.synced === autoMedalStatus.complete ? '#15803d' : '#64748b' }}
                >
                  🏅 Tự động: {autoMedalStatus.synced}/{autoMedalStatus.complete}
                </span>

              </div>
              <div className="tournament-info">
                <strong>{matchData.tournamentName}</strong>
                <span>{matchData.location}</span>
              </div>
            </div>{" "}
            <div className="secretary-content">
              {/* Categories Sidebar */}
              <div className="categories-sidebar">
                <h3>Hạng mục thi đấu</h3>

                <label className="mat-filter-label" htmlFor="secretary-mat-filter">
                  Thảm thi đấu
                </label>
                <select
                  id="secretary-mat-filter"
                  className="mat-filter-select"
                  value={activeSelectedMat}
                  onChange={(event) => handleMatChange(event.target.value)}
                >
                  <option value="all">Tất cả thảm</option>
                  {matOptions.map((mat) => (
                    <option key={mat.id} value={mat.id}>
                      {mat.name}
                    </option>
                  ))}
                </select>

                {/* Search */}
                <div className="sidebar-search-wrap">
                  <span className="sidebar-search-icon">🔍</span>
                  <input
                    className="sidebar-search-input"
                    type="text"
                    placeholder="Tìm hạng mục..."
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                  />
                  {sidebarSearch && (
                    <button
                      className="sidebar-search-clear"
                      onClick={() => setSidebarSearch("")}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter tabs */}
                <div className="sidebar-filter-tabs">
                  {["all", "kata", "kumite"].map((f) => (
                    <button
                      key={f}
                      className={`sidebar-filter-tab ${
                        sidebarFilter === f ? "active" : ""
                      }`}
                      onClick={() => setSidebarFilter(f)}
                    >
                      {f === "all"
                        ? "Tất cả"
                        : f === "kata"
                        ? "🥋 Kata"
                        : "⚔️ Kumite"}
                    </button>
                  ))}
                </div>

                <div className="categories-list">
                  {filteredCategories.length === 0 ? (
                    <div className="sidebar-no-result">
                      Không có hạng mục phù hợp ở thảm này
                    </div>
                  ) : (
                    filteredCategories.map((cat) => {
                      const completed = isCategoryCompleted(cat, matchResults);
                      return (
                      <button
                        key={cat.id}
                        className={`category-btn ${
                          selectedCategory?.id === cat.id ? "active" : ""
                        } ${completed ? "completed" : ""}`}
                        onClick={() => handleSelectCategory(cat)}
                      >
                        <span className="category-btn-row">
                          <span className="category-btn-name">{cat.name}</span>
                          {completed && <span className="completed-badge">Đã xong</span>}
                        </span>
                        <span className="match-count">
                          {cat.matches?.length || 0} trận • Thảm {getCategoryMatId(matchData, cat)}
                        </span>
                      </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Main Bracket View */}
              <div className="bracket-view-area">
                {selectedCategory ? (
                  <>
                    <div className={`bracket-header-info ${
                      isCategoryCompleted(selectedCategory, matchResults) ? "completed" : ""
                    }`}>
                      <h2>{selectedCategory.name}</h2>
                      <div className="bracket-stats">
                        {isCategoryCompleted(selectedCategory, matchResults) && (
                          <span className="completed-badge">Đã hoàn thành</span>
                        )}
                        <span>
                          {selectedCategory.bracket?.matches?.filter(
                            (m) => !m.isBye
                          ).length || 0}{" "}
                          trận đấu
                        </span>
                      </div>
                    </div>

                    {matQueuePreview && (
                      <div className="mat-queue-preview">
                        <div className="queue-preview-card current">
                          <span className="queue-preview-label">
                            {matQueuePreview.current?.status === "completed"
                              ? "Trạng thái"
                              : "Đang thi đấu"} • Thảm {matQueuePreview.matId}
                          </span>
                          <strong>{matQueuePreview.current?.name || "Chưa có trận đang thi đấu"}</strong>
                          <span>
                            {matQueuePreview.current?.participantText || "Chưa xác định VĐV"}
                          </span>
                        </div>
                        <div className={`queue-preview-card next ${
                          matQueuePreview.next ? "" : "empty"
                        }`}>
                          <span className="queue-preview-label">Trận tiếp theo</span>
                          <strong>
                            {matQueuePreview.next?.name || "Không còn trận tiếp theo"}
                          </strong>
                          <span>
                            {matQueuePreview.next?.participantText ||
                              "Đã hoàn tất lịch thi đấu của thảm này"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Bracket + Medal Table */}
                    <div className="secretary-bracket-medal-wrapper">
                      {/* Bracket Component */}
                      <div className="secretary-bracket-wrapper">
                        {" "}
                        <Bracket
                          bracket={bracketWithScores}
                          categoryType={selectedCategory.type}
                          onMatchClick={handleSelectMatch}
                          onContextAction={handleContextAction}
                          dragEnabled={false}
                          dimCompleted
                        />
                        {(bracketWithScores?.auxiliaryMatches || []).length > 0 && (
                          <section className="auxiliary-bronze-section">
                            <h3>Trận phụ huy chương đồng / Repechage</h3>
                            {bracketWithScores.auxiliaryMatches.map((match) => (
                              <button
                                type="button"
                                key={match.id}
                                className="auxiliary-bronze-match"
                                disabled={match.operationalStatus !== "READY" || match.resultStatus === "UNDER_APPEAL"}
                                onClick={() => handleSelectMatch(match)}
                              >
                                <strong>{match.matchCode}</strong>
                                <span>{match.athlete1?.name || "Chưa xác định"} — {match.athlete2?.name || "Chưa xác định"}</span>
                              </button>
                            ))}
                          </section>
                        )}
                      </div>

                      {/* Medal Table */}
                      {bracketWithScores &&
                        (() => {
                          // Tìm trận chung kết (trận có round cao nhất)
                          const maxRound = Math.max(...(bracketWithScores.matches?.map(m => m.round) || [0]));
                          const finalMatch = bracketWithScores.matches?.find(
                            (m) => m.round === maxRound && m.round > 0
                          );
                          let champion = finalMatch?.winner;

                          const getLoser = (match) => {
                            if (!match?.winner) return null;
                            if (match.athlete1?.id === match.winner.id)
                              return match.athlete2;
                            if (match.athlete2?.id === match.winner.id)
                              return match.athlete1;
                            return null;
                          };

                          let silverMedalist = getLoser(finalMatch);
                          const semiFinalRound =
                            bracketWithScores.numRounds - 1;
                          const semiFinalMatches =
                            bracketWithScores.matches?.filter(
                              (m) => m.round === semiFinalRound && !m.isBye
                            ) || [];
                          const bronzeMedalists = semiFinalMatches
                            .map((m) => getLoser(m))
                            .filter((a) => a !== null);

                          // Tìm thêm bronze từ tứ kết nếu bán kết có auto-advance
                          if (
                            bronzeMedalists.length < 2 &&
                            semiFinalRound > 1
                          ) {
                            const quarterRound = semiFinalRound - 1;
                            const quarterFinals =
                              bracketWithScores.matches?.filter(
                                (m) =>
                                  m.round === quarterRound &&
                                  !m.isBye &&
                                  m.winner
                              ) || [];
                            const autoAdvanceSemis = semiFinalMatches.filter(
                              (m) => m.winner && (!m.athlete1 || !m.athlete2)
                            );
                            autoAdvanceSemis.forEach((semi) => {
                              const advAthlete =
                                semi.winner || semi.athlete1 || semi.athlete2;
                              if (!advAthlete) return;
                              const qMatch = quarterFinals.find(
                                (m) => m.winner?.id === advAthlete.id
                              );
                              if (qMatch) {
                                const qLoser = getLoser(qMatch);
                                if (
                                  qLoser &&
                                  !bronzeMedalists.some(
                                    (b) => b.id === qLoser.id
                                  )
                                ) {
                                  bronzeMedalists.push(qLoser);
                                }
                              }
                            });
                            if (bronzeMedalists.length < 2) {
                              quarterFinals.forEach((qm) => {
                                const qLoser = getLoser(qm);
                                if (
                                  qLoser &&
                                  qLoser.id !== champion?.id &&
                                  qLoser.id !== silverMedalist?.id &&
                                  !bronzeMedalists.some(
                                    (b) => b.id === qLoser.id
                                  )
                                ) {
                                  bronzeMedalists.push(qLoser);
                                }
                              });
                            }
                          }

                          const selected = selectCategoryMedalists({
                            category: { ...selectedCategory, bracket: bracketWithScores },
                            bracket: bracketWithScores,
                          });
                          if (selected.ok) {
                            champion = selected.medals.gold;
                            silverMedalist = selected.medals.silver;
                            bronzeMedalists.splice(0, bronzeMedalists.length,
                              ...[selected.medals.bronze1, selected.medals.bronze2].filter(Boolean));
                          }

                          return (
                            <div className="secretary-medal-table-container">
                              <table className="secretary-medal-table">
                                <thead>
                                  <tr>
                                    <th style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span>🏆 KẾT QUẢ</span>
                                      <button 
                                        className="btn btn-primary btn-sm"
                                        style={{ fontSize: '10px', padding: '2px 6px' }}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!adminIp) {
                                            setError("Vui lòng nhập IP máy Admin");
                                            return;
                                          }
                                          setSyncing(true);
                                          let count = 0;
                                          for (const result of matchResults) {
                                            const match = getMatchById(result.matchId);
                                            if (match) {
                                              await sendMatchResult(adminIp, 3000, {
                                                ...result,
                                                matchCode: match.matchCode,
                                                tournamentId: matchData?.tournamentId
                                              });
                                              count++;
                                            }
                                          }
                                          setSyncing(false);
                                          setNotification(`✅ Đã đồng bộ ${count} trận đấu sang Admin!`);
                                          setTimeout(() => setNotification(""), 3000);
                                        }}
                                        disabled={syncing || matchResults.length === 0}
                                      >
                                        📡 Sync
                                      </button>
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="medal-row medal-gold">
                                    <td>
                                      <span className="medal-icon-sm">🥇</span>
                                      <span className="medal-info">
                                        {champion ? (
                                          <>
                                            <span className="medal-name">
                                              {champion.name}
                                            </span>
                                            {champion.club && (
                                              <span className="medal-club-sm">
                                                {champion.club}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          "-"
                                        )}
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="medal-row medal-silver">
                                    <td>
                                      <span className="medal-icon-sm">🥈</span>
                                      <span className="medal-info">
                                        {silverMedalist ? (
                                          <>
                                            <span className="medal-name">
                                              {silverMedalist.name}
                                            </span>
                                            {silverMedalist.club && (
                                              <span className="medal-club-sm">
                                                {silverMedalist.club}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          "-"
                                        )}
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="medal-row medal-bronze">
                                    <td>
                                      <span className="medal-icon-sm">🥉</span>
                                      <span className="medal-info">
                                        {bronzeMedalists[0] ? (
                                          <>
                                            <span className="medal-name">
                                              {bronzeMedalists[0].name}
                                            </span>
                                            {bronzeMedalists[0].club && (
                                              <span className="medal-club-sm">
                                                {bronzeMedalists[0].club}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          "-"
                                        )}
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="medal-row medal-bronze">
                                    <td>
                                      <span className="medal-icon-sm">🥉</span>
                                      <span className="medal-info">
                                        {bronzeMedalists[1] ? (
                                          <>
                                            <span className="medal-name">
                                              {bronzeMedalists[1].name}
                                            </span>
                                            {bronzeMedalists[1].club && (
                                              <span className="medal-club-sm">
                                                {bronzeMedalists[1].club}
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
                          );
                        })()}
                    </div>
                  </>
                ) : (
                  <div className="select-category-hint">
                    <p>⬅️ Chọn một hạng mục để xem sơ đồ và bấm điểm</p>
                  </div>
                )}
              </div>
            </div>
            {/* Export Footer */}
            <div className="export-section">
              <div className="export-info">
                Đã lưu kết quả: <strong>{matchResults.length}</strong> trận
              </div>
              <div className="export-buttons">
                <button
                  className="export-btn json"
                  onClick={() => handleExport("json")}
                  disabled={matchResults.length === 0}
                >
                  📄 Xuất JSON
                </button>
                <button
                  className="export-btn sync"
                  style={{ background: '#22c55e', color: '#fff' }}
                  onClick={async () => {
                    if (!adminIp) {
                      setError("Vui lòng nhập IP máy Admin để đồng bộ");
                      return;
                    }
                    setSyncing(true);
                    let successCount = 0;
                    for (const result of matchResults) {
                      const match = getMatchById(result.matchId);
                      const res = await sendMatchResult(adminIp, 3000, {
                        ...result,
                        matchCode: match?.matchCode,
                        tournamentId: matchData?.tournamentId
                      });
                      if (res.success) successCount++;
                    }
                    setSyncing(false);
                    setNotification(`✅ Đã đồng bộ ${successCount}/${matchResults.length} trận thành công!`);
                    setTimeout(() => setNotification(""), 3000);
                  }}
                  disabled={matchResults.length === 0 || syncing}
                >
                  📡 {syncing ? "Đang gửi..." : "Đồng bộ LAN"}
                </button>
                <button
                  className="export-btn excel"
                  onClick={() => handleExport("excel")}
                  disabled={matchResults.length === 0}
                >
                  📊 Xuất Excel
                </button>
              </div>
            </div>{" "}
          </>
        )}{" "}
      </div>

      {/* ===== CUSTOM DIALOG (replaces window.prompt / window.confirm) ===== */}
      {dialog && (
        <div
          className="secretary-dialog-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) dialog.onCancel();
          }}
        >
          <div className="secretary-dialog" style={{ overflow: "visible" }}>
            <div className="secretary-dialog-title">{dialog.title}</div>
            <div className="secretary-dialog-message">{dialog.message}</div>
            {dialog.type === "prompt" && (
              dialog.options ? (
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
                  className="secretary-dialog-input"
                  type="text"
                  defaultValue={dialog.defaultValue || ""}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") dialog.onOk(e.target.value);
                    if (e.key === "Escape") dialog.onCancel();
                  }}
                />
              )
            )}
            <div className="secretary-dialog-actions">
              <button
                className="secretary-dialog-btn cancel"
                onClick={dialog.onCancel}
              >
                Hủy
              </button>
              <button
                className={`secretary-dialog-btn ok ${
                  dialog.type === "confirm" ? "danger" : "primary"
                }`}
                onClick={() => {
                  if (dialog.type === "prompt") {
                    if (dialog.options) {
                      dialog.onOk(dialogInputRef.current?.value ?? "");
                    } else {
                      dialog.onOk(dialogInputRef.current?.value ?? "");
                    }
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

export default SecretaryPage;
