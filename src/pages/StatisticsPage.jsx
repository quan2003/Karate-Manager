import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useTournament,
  useTournamentDispatch,
  ACTIONS,
} from "../context/TournamentContext";
import Modal from "../components/common/Modal";
import { useToast } from "../components/common/Toast";
import * as XLSX from "xlsx";
import { updateMatchResult as applyMatchResult } from "../utils/drawEngine";
import { getAppBaseUrl, getTournamentLogos, getTournamentSignatures } from "../services/pdfService";
import { useOnboarding } from "../context/OnboardingContext";
import appIcon from "../assets/icon.png";
import "./StatisticsPage.css";

export default function StatisticsPage() {
  const { id } = useParams();
  const { tournaments } = useTournament();
  const dispatch = useTournamentDispatch();
  const fileInputRef = useRef(null);
  const { toast } = useToast();
  const { activeHint, clearHint } = useOnboarding();

  const tournament = tournaments.find((t) => t.id === id);
  const [activeTab, setActiveTab] = useState("overview"); // overview | results | medals | delegation | fees

  // Tự động chuyển tab và cuộn tới phần được highlight khi có gợi ý (Re-enactment)
  useEffect(() => {
    if (activeHint === "check_fees") {
      setActiveTab("fees");
    }
    
    if (activeHint) {
      setTimeout(() => {
        const highlighted = document.querySelector(".hint-pulse");
        if (highlighted) {
          highlighted.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 500);
    }
  }, [activeHint]);
  const [showResultModal, setShowResultModal] = useState(null);
  const [resultForm, setResultForm] = useState({
    first: "",
    second: "",
    third1: "",
    third2: "",
    club1: "",
    club2: "",
    club3a: "",
    club3b: "",
  });

  // Filters
  const [filterType, setFilterType] = useState("all"); // all | kata | kumite
  const [filterGender, setFilterGender] = useState("all"); // all | male | female
  const [filterSession, setFilterSession] = useState("all"); // all | buoi1 | buoi2 | ...
  const [filterClub, setFilterClub] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedForExport, setSelectedForExport] = useState(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // { rows, fileName, mergedResults, stats }
  const [importMode, setImportMode] = useState("merge"); // 'merge' | 'overwrite'
  const [editingClubReg, setEditingClubReg] = useState(null); // club name being edited
  const [clubRegForm, setClubRegForm] = useState({
    coaches: [""],
    teamLeader: "",
  });
  const [feeSettings, setFeeSettings] = useState(() => {
    return (
      tournament?.feeSettings || {
        individualFee: 300000,
        teamFee: 500000,
        enableSurcharge: false,
        surchargeFee: 150000,
      }
    );
  });
  const [feePayments, setFeePayments] = useState(() => {
    return tournament?.feePayments || {};
  });
  // States for checkbox selection in Delegation tab
  const [selectedDelegationCategories, setSelectedDelegationCategories] =
    useState(new Set());
  const [selectedDelegationClubs, setSelectedDelegationClubs] = useState(
    new Set()
  );

  // PDF loading state
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  // States for checkbox selection in Medal Tally tab
  const [selectedTallyClubs, setSelectedTallyClubs] = useState(new Set());

  if (!tournament) {
    return (
      <div className="page">
        <div className="container">
          <div className="not-found">
            <h2>Không tìm thấy giải đấu</h2>
            <Link to="/admin" className="btn btn-primary">
              Về quản lý giải đấu
            </Link>
          </div>
        </div>
      </div>
    );
  }
  // ===== PDF PRINT HELPER =====
  /**
   * Tạo iframe ẩn, ghi HTML vào, chờ load xong rồi mới print.
   * Hiển thị loading overlay trong lúc chờ.
   */
  const printIframeWithLoading = (htmlContent, title = "In PDF") => {
    setIsPdfLoading(true);
    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.left = "-9999px";
    printFrame.style.top = "0";
    printFrame.style.width = "210mm";
    printFrame.style.height = "297mm";
    printFrame.style.border = "none";
    document.body.appendChild(printFrame);

    const doc = printFrame.contentDocument || printFrame.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Chờ iframe load xong (bao gồm cả ảnh logo)
    const doAfterLoad = () => {
      // Thêm thêm 400ms sau load để đảm bảo ảnh render xong
      setTimeout(() => {
        setIsPdfLoading(false);
        printFrame.contentWindow.print();
        setTimeout(() => {
          if (document.body.contains(printFrame)) {
            document.body.removeChild(printFrame);
          }
        }, 1500);
      }, 400);
    };

    // Dùng onload nếu có thể, fallback sang setTimeout nếu iframe load quá nhanh
    if (printFrame.contentDocument?.readyState === "complete") {
      doAfterLoad();
    } else {
      printFrame.onload = doAfterLoad;
      // Safety timeout: nếu 8 giây vẫn chưa load thì vẫn print
      setTimeout(() => {
        if (isPdfLoading) {
          setIsPdfLoading(false);
          try {
            printFrame.contentWindow.print();
          } catch (e) {}
          setTimeout(() => {
            if (document.body.contains(printFrame))
              document.body.removeChild(printFrame);
          }, 1500);
        }
      }, 8000);
    }
  };

  // ===== SCHEDULE SESSION HELPERS =====
  const schedule = tournament.schedule || {};

  // Get category's schedule session key (e.g., "2026-03-01_morning")
  const getCategorySessionKey = (catId) => {
    const s = schedule[catId];
    if (!s || !s.date) return null;
    const timeNum = parseInt((s.time || "08:00").replace(":", ""));
    const period = timeNum < 1200 ? "morning" : "afternoon";
    return `${s.date}_${period}`;
  };

  // Generate schedule-based sessions
  const getScheduleSessions = () => {
    const sessSet = new Set();
    tournament.categories.forEach((c) => {
      const key = getCategorySessionKey(c.id);
      if (key) sessSet.add(key);
    });
    return Array.from(sessSet).sort();
  };

  const scheduleSessions = getScheduleSessions();

  const getScheduleSessionLabel = (key) => {
    if (!key) return "";
    const [date, period] = key.split("_");
    const startDate = tournament.startDate || tournament.date;
    const d = new Date(date);
    const startD = new Date(startDate);
    const dayDiff = Math.round((d - startD) / (1000 * 60 * 60 * 24));
    const dayNum = dayDiff + 1;
    const periodLabel = period === "morning" ? "Sáng" : "Chiều";
    return `Ngày ${dayNum} - ${periodLabel} (${d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    })})`;
  };

  // ===== FILTER CATEGORIES =====
  const getFilteredCategories = () => {
    let cats = [...tournament.categories];
    if (filterType !== "all") {
      cats = cats.filter((c) => c.type === filterType);
    }
    if (filterGender !== "all") {
      cats = cats.filter((c) => c.gender === filterGender);
    }
    if (filterSession !== "all") {
      cats = cats.filter((c) => getCategorySessionKey(c.id) === filterSession);
    }
    if (filterClub !== "all") {
      const club = filterClub.trim().toLowerCase();
      cats = cats.filter((c) => {
        const r = getCategoryResults(c.id);
        if (!r) return false;
        return (
          r.club1?.trim().toLowerCase() === club ||
          r.club2?.trim().toLowerCase() === club ||
          r.club3a?.trim().toLowerCase() === club ||
          r.club3b?.trim().toLowerCase() === club
        );
      });
    }
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      cats = cats.filter((c) => c.name.toLowerCase().includes(q));
    }
    return cats;
  };

  // ===== STATISTICS HELPERS =====
  const getAllAthletes = () => {
    const athletes = [];
    tournament.categories.forEach((cat) => {
      (cat.athletes || []).forEach((a) => {
        athletes.push({
          ...a,
          categoryName: cat.name,
          categoryId: cat.id,
          isTeam: a.isTeam || cat.isTeam,
        });
      });
    });
    return athletes;
  };

  const handleFeeSettingsChange = (field, value) => {
    const newSettings = { ...feeSettings, [field]: value };
    setFeeSettings(newSettings);
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: { id: tournament.id, feeSettings: newSettings },
    });
  };

  const handleTogglePayment = (clubName) => {
    const newPayments = { ...feePayments, [clubName]: !feePayments[clubName] };
    setFeePayments(newPayments);
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: { id: tournament.id, feePayments: newPayments },
    });
  };

  const getClubFeeSummary = () => {
    const summary = clubs.map((club) => {
      let teamEntries = 0;
      let individualCount = 0;
      let extraEventsForSurcharge = 0;
      const allEventsByAthlete = {};

      tournament.categories.forEach((cat) => {
        // Tính số đội tham gia
        const isTeamCat = cat.isTeam || (cat.name && (cat.name.toLowerCase().includes("đồng đội") || cat.name.toLowerCase().includes("hỗn hợp")));
        if (isTeamCat) {
          const hasAthletesInTeam = (cat.athletes || []).some(
            (a) => a.club?.trim() === club
          );
          if (hasAthletesInTeam) {
            teamEntries += 1;
          }
        }

        // Tính lệ phí cá nhân và phụ thu cho TẤT CẢ VĐV ở TẤT CẢ hạng mục
        (cat.athletes || []).forEach((a) => {
          if (a.club?.trim() === club) {
            const identifier = `${(a.name || "").trim().toLowerCase()}_${
              a.birthDate || a.birthYear || ""
            }_${a.gender || ""}`;
            if (!allEventsByAthlete[identifier]) {
              allEventsByAthlete[identifier] = 0;
            }
            allEventsByAthlete[identifier] += 1;
          }
        });
      });

      Object.values(allEventsByAthlete).forEach((eventCount) => {
        individualCount += 1;
        if (feeSettings.enableSurcharge && eventCount > 1) {
          extraEventsForSurcharge += eventCount - 1;
        }
      });

      const teamFeeTotal = teamEntries * feeSettings.teamFee;
      const individualFeeTotal = individualCount * feeSettings.individualFee;
      const surchargeTotal = extraEventsForSurcharge * feeSettings.surchargeFee;
      const totalFee = teamFeeTotal + individualFeeTotal + surchargeTotal;

      return {
        club,
        teamEntries,
        teamFeeTotal,
        individualCount,
        individualFeeTotal,
        extraEventsForSurcharge,
        surchargeTotal,
        totalFee,
      };
    });

    return summary.sort((a, b) => a.club.localeCompare(b.club, "vi"));
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
  };

  const getClubs = () => {
    const clubSet = new Set();
    tournament.categories.forEach((cat) => {
      (cat.athletes || []).forEach((a) => {
        if (a.club) clubSet.add(a.club.trim());
      });
    });
    return Array.from(clubSet).sort();
  };

  const getGenderCount = (gender) => {
    return getAllAthletes().filter((a) => a.gender === gender).length;
  };

  const getUniqueAthletesCount = () => {
    const unique = new Set();
    getAllAthletes().forEach((a) => {
      const key = `${(a.name || "").trim().toLowerCase()}_${
        a.birthDate || a.birthYear || ""
      }_${a.gender || ""}_${(a.club || "").trim().toLowerCase()}`;
      unique.add(key);
    });
    return unique.size;
  };

  const getEstimatedMedals = () => {
    let gold = 0,
      silver = 0,
      bronze = 0;
    const teamKataSize = tournament.teamMedalsSettings?.kata || 3;
    const teamKumiteSize = tournament.teamMedalsSettings?.kumite || 5;

    tournament.categories.forEach((cat) => {
      const isTeamName = cat.name?.toLowerCase().includes('đồng đội') || cat.name?.toLowerCase().includes('hỗn hợp');
      const isTeamCategory =
        cat.isTeam || (cat.athletes || []).some((a) => a.isTeam) || isTeamName;
      if (isTeamCategory) {
        const teamSize = cat.type === 'kata' ? teamKataSize : teamKumiteSize;
        gold += teamSize;
        silver += teamSize;
        bronze += teamSize * 2;
      } else {
        gold += 1;
        silver += 1;
        bronze += 2;
      }
    });
    return { gold, silver, bronze, total: gold + silver + bronze };
  };
  // ===== RESULTS MANAGEMENT =====
  /**
   * Lấy kết quả hạng mục - merge categoryResults đã lưu với auto-compute từ bracket.
   * Ưu tiên: dữ liệu nhập tay (nếu có giá trị) > auto-compute từ bracket > rỗng
   */
  const getCategoryResults = (categoryId) => {
    const saved = tournament.categoryResults?.[categoryId];

    // Auto-compute từ bracket nếu có
    const cat = tournament.categories.find((c) => c.id === categoryId);
    let computed = null;

    if (cat?.bracket?.matches) {
      const bracket = cat.bracket;
      const finalMatch = bracket.matches.find(
        (m) => m.nextMatchId === null && m.round > 0
      );

      if (finalMatch?.winner) {
        const getLoser = (match) => {
          if (!match?.winner) return null;
          if (match.athlete1?.id === match.winner.id) return match.athlete2;
          if (match.athlete2?.id === match.winner.id) return match.athlete1;
          return null;
        };

        const champion = finalMatch.winner;
        const silver = getLoser(finalMatch);
        const semiFinalRound = bracket.numRounds - 1;
        const semiFinals = bracket.matches.filter(
          (m) => m.round === semiFinalRound && !m.isBye
        );
        const bronzes = semiFinals.map((m) => getLoser(m)).filter(Boolean);

        // Nếu chỉ có ít hơn 2 bronze từ bán kết, tìm thêm từ tứ kết
        // Trường hợp: 1 trận bán kết chỉ có 1 VĐV (auto-advance do BYE vòng trước)
        // → không có loser ở bán kết → tìm loser tứ kết làm HCĐ
        if (bronzes.length < 2 && semiFinalRound > 1) {
          const quarterRound = semiFinalRound - 1;
          const quarterFinals = bracket.matches.filter(
            (m) => m.round === quarterRound && !m.isBye && m.winner
          );
          // Tìm bán kết mà chỉ có 1 VĐV (auto-advance, không có trận thật)
          // Bán kết này có winner nhưng 1 trong 2 athlete là null
          const autoAdvanceSemis = semiFinals.filter(
            (m) => m.winner && (!m.athlete1 || !m.athlete2)
          );
          autoAdvanceSemis.forEach((semi) => {
            // VĐV đã tự advance qua bán kết
            const advancedAthlete =
              semi.winner || semi.athlete1 || semi.athlete2;
            if (!advancedAthlete) return;
            // Tìm trận tứ kết mà VĐV này thắng
            const qMatch = quarterFinals.find(
              (m) => m.winner?.id === advancedAthlete.id
            );
            if (qMatch) {
              const qLoser = getLoser(qMatch);
              if (qLoser && !bronzes.some((b) => b.id === qLoser.id)) {
                bronzes.push(qLoser);
              }
            }
          });

          // Nếu vẫn thiếu bronze: tìm tất cả loser tứ kết mà không phải champion/silver
          if (bronzes.length < 2) {
            quarterFinals.forEach((qm) => {
              const qLoser = getLoser(qm);
              if (
                qLoser &&
                qLoser.id !== champion?.id &&
                qLoser.id !== silver?.id &&
                !bronzes.some((b) => b.id === qLoser.id)
              ) {
                bronzes.push(qLoser);
              }
            });
          }
        }

        computed = {
          first: champion?.name || "",
          club1: champion?.club || "",
          second: silver?.name || "",
          club2: silver?.club || "",
          third1: bronzes[0]?.name || "",
          club3a: bronzes[0]?.club || "",
          third2: bronzes[1]?.name || "",
          club3b: bronzes[1]?.club || "",
          _fromBracket: true,
        };
      }
    }

    // Nếu không có saved và không có computed → null
    if (!saved && !computed) return null;
    // Nếu chỉ có 1 trong 2 → trả về cái có
    if (!saved) return computed;
    if (!computed) return saved;

    // Merge: ưu tiên saved (nếu có giá trị), fallback sang computed
    const fields = [
      "first",
      "second",
      "third1",
      "third2",
      "club1",
      "club2",
      "club3a",
      "club3b",
    ];
    const merged = { _fromBracket: false };
    fields.forEach((f) => {
      merged[f] =
        saved[f] && saved[f].trim() !== "" ? saved[f] : computed[f] || "";
    });
    return merged;
  };

  const handleSaveResult = (categoryId) => {
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: {
        id: tournament.id,
        categoryResults: {
          ...(tournament.categoryResults || {}),
          [categoryId]: {
            first: resultForm.first,
            second: resultForm.second,
            third1: resultForm.third1,
            third2: resultForm.third2,
            club1: resultForm.club1,
            club2: resultForm.club2,
            club3a: resultForm.club3a,
            club3b: resultForm.club3b,
          },
        },
      },
    });
    setShowResultModal(null);
    toast.success("Đã lưu kết quả!");
  };

  const handleOpenResultModal = (cat) => {
    const existing = getCategoryResults(cat.id);
    if (existing) {
      setResultForm({
        first: existing.first || "",
        second: existing.second || "",
        third1: existing.third1 || "",
        third2: existing.third2 || "",
        club1: existing.club1 || "",
        club2: existing.club2 || "",
        club3a: existing.club3a || "",
        club3b: existing.club3b || "",
      });
    } else {
      setResultForm({
        first: "",
        second: "",
        third1: "",
        third2: "",
        club1: "",
        club2: "",
        club3a: "",
        club3b: "",
      });
    }
    setShowResultModal(cat.id);
  };

  // ===== EXPORT RESULTS TO EXCEL =====
  const handleExportResults = () => {
    const cats = getFilteredCategories();
    const data = [];
    cats.forEach((cat) => {
      const result = getCategoryResults(cat.id);
      const row = {
        "Hạng mục": cat.name,
        Loại: cat.type === "kumite" ? "Kumite" : "Kata",
        "Giới tính":
          cat.gender === "male"
            ? "Nam"
            : cat.gender === "female"
            ? "Nữ"
            : "Hỗn hợp",
        "HCV (Vàng)": result?.first || "",
        "CLB HCV": result?.club1 || "",
        "Thành viên HCV":
          getTeamMemberNames(cat, result?.first) ||
          getTeamMemberNames(cat, result?.club1) ||
          "",
        "HCB (Bạc)": result?.second || "",
        "CLB HCB": result?.club2 || "",
        "Thành viên HCB":
          getTeamMemberNames(cat, result?.second) ||
          getTeamMemberNames(cat, result?.club2) ||
          "",
        "HCĐ 1 (Đồng)": result?.third1 || "",
        "CLB HCĐ 1": result?.club3a || "",
        "Thành viên HCĐ 1":
          getTeamMemberNames(cat, result?.third1) ||
          getTeamMemberNames(cat, result?.club3a) ||
          "",
        "HCĐ 2 (Đồng)": result?.third2 || "",
        "CLB HCĐ 2": result?.club3b || "",
        "Thành viên HCĐ 2":
          getTeamMemberNames(cat, result?.third2) ||
          getTeamMemberNames(cat, result?.club3b) ||
          "",
      };
      data.push(row);
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kết quả");

    const colWidths = Object.keys(data[0] || {}).map((key) => ({
      wch:
        Math.max(
          key.length,
          ...data.map((r) => (r[key] || "").toString().length)
        ) + 2,
    }));
    ws["!cols"] = colWidths;

    XLSX.writeFile(
      wb,
      `KetQua_${tournament.name.replace(
        /[^a-zA-Z0-9\u00C0-\u1EF9]/g,
        "_"
      )}.xlsx`
    );
    toast.success("Đã xuất kết quả Excel!");
  };

  // ===== EXPORT SINGLE CATEGORY RESULT =====
  // Helper: get team member full names for a club in a category
  const getTeamMemberNames = (cat, clubName) => {
    if (!clubName) return "";
    const isTeamCat =
      cat.name?.toLowerCase().includes("đồng đội") ||
      cat.isTeam ||
      (cat.athletes || []).some((a) => a.isTeam);
    if (!isTeamCat) return "";
    const members = (cat.athletes || []).filter(
      (a) =>
        (a.club || "").trim().toLowerCase() === clubName.trim().toLowerCase()
    );
    if (members.length === 0) return "";
    return members.map((m) => m.name).join(", ");
  };

  // Helper: generate medal cell HTML for PDF
  const getMedalCellHTML = (cat, name, club) => {
    if (!name) return "-";
    const memberNames =
      getTeamMemberNames(cat, name) || getTeamMemberNames(cat, club);
    let html = `<strong>${name}</strong>`;
    if (club && club !== name) html += `<br/><small>${club}</small>`;
    if (memberNames)
      html += `<br/><small style="color:#1e40af;font-style:italic">${memberNames}</small>`;
    return html;
  };

  const handleExportCategoryResult = (cat) => {
    const result = getCategoryResults(cat.id);
    const printWindow = document.createElement("iframe");
    printWindow.style.display = "none";
    document.body.appendChild(printWindow);
    const genderLabel =
      cat.gender === "male"
        ? "Nam"
        : cat.gender === "female"
        ? "Nữ"
        : "Hỗn hợp";
    const typeLabel = cat.type === "kumite" ? "Kumite" : "Kata";
    const isTeamCat =
      cat.name?.toLowerCase().includes("đồng đội") ||
      cat.isTeam ||
      (cat.athletes || []).some((a) => a.isTeam);

    // Build member names for team categories
    const getMemberList = (clubName) => {
      if (!isTeamCat || !clubName) return "";
      const members = (cat.athletes || []).filter(
        (a) =>
          (a.club || "").trim().toLowerCase() === clubName.trim().toLowerCase()
      );
      if (members.length === 0) return "";
      return `<div class="member-list">${members
        .map((m, i) => `${i + 1}. ${m.name}`)
        .join("<br/>")}</div>`;
    };

    printWindow.contentDocument.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Kết quả - ${cat.name}</title>
      <style>
        @page { size: portrait; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: #1e293b; padding: 20px; }
        .logo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 0; }
        .header-left, .header-center, .header-right { flex: 1; display: flex; align-items: center; }
        .header-left { justify-content: flex-start; }
        .header-center { justify-content: center; }
        .header-right { justify-content: flex-end; }
        .system-logo { height: 55px; max-width: 160px; object-fit: contain; }
        .app-icon { height: 60px; width: 60px; object-fit: contain; }
        .sponsor-logos { display: flex; align-items: center; gap: 10px; }
        .sponsor-logo { height: 45px; max-width: 120px; object-fit: contain; }
        .header { text-align: center; margin-bottom: 24px; }
        .header h1 { font-size: 22px; margin: 0; color: #0f172a; }
        .header h2 { font-size: 16px; margin: 4px 0; color: #64748b; font-weight: normal; }
        .header h3 { font-size: 14px; color: #475569; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #1e3a5f; color: white; padding: 10px 12px; text-align: left; font-size: 13px; }
        td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
        tr:nth-child(even) { background: #f8fafc; }
        .medal-icon { font-size: 18px; }
        .athlete-name { font-size: 15px; font-weight: bold; color: #0f172a; }
        .club-name { font-size: 12px; color: #64748b; margin-top: 2px; }
        .member-list { font-size: 11px; color: #1e40af; margin-top: 6px; font-style: italic; line-height: 1.6; }
        .signature-section { margin-top: 40px; display: flex; flex-direction: column; align-items: flex-end; padding-right: 40px; }
        .signature-label { font-size: 14px; font-weight: bold; margin-bottom: 5px; text-align: center; width: 150px; }
        .signature-img { height: 70px; max-width: 180px; object-fit: contain; }
      </style>

    </head><body>
      ${(() => {
        const appIconUrl = `${getAppBaseUrl()}icon.png`;
        const sl = tournament.sponsorLogos || {};
        const tournamentLogosList = getTournamentLogos(sl);
        const spons = sl.sponsors || [];
        
        let h = '<div class="logo-header">';
        h += `<div class="header-left">`;
        if (tournamentLogosList.length > 0) {
          h += `<div class="sponsor-logos">`;
          tournamentLogosList.forEach(logo => {
            h += `<img src="${logo}" class="system-logo" />`;
          });
          h += `</div>`;
        }
        h += `</div>`;
        h += `<div class="header-center"><img src="${appIconUrl}" class="app-icon" /></div>`;
        h += `<div class="header-right">`;
        if (spons.length > 0) {
          h += '<div class="sponsor-logos">';
          spons.forEach((l) => {
            h += `<img src="${l}" class="sponsor-logo" />`;
          });
          h += "</div>";
        }
        h += "</div></div>";
        return h;
      })()}
    <div class="header">
      <h1>KẾT QUẢ THI ĐẤU</h1>
      <h2>${tournament.name}</h2>
      <h3>${cat.name}</h3>
    </div>
      <table>
        <thead>
          <tr>
            <th style="width:40px">Hạng</th>
            <th>Huy chương</th>
            <th>Đơn vị / VĐV</th>
            ${isTeamCat ? "<th>Thành viên</th>" : ""}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="medal-icon">🥇</span></td>
            <td>HUY CHƯƠNG VÀNG</td>
            <td>
              <div class="athlete-name">${result?.first || "—"}</div>
              ${
                result?.club1 && result.club1 !== result.first
                  ? `<div class="club-name">${result.club1}</div>`
                  : ""
              }
            </td>
            ${
              isTeamCat
                ? `<td>${getMemberList(result?.first || result?.club1)}</td>`
                : ""
            }
          </tr>
          <tr>
            <td><span class="medal-icon">🥈</span></td>
            <td>HUY CHƯƠNG BẠC</td>
            <td>
              <div class="athlete-name">${result?.second || "—"}</div>
              ${
                result?.club2 && result.club2 !== result.second
                  ? `<div class="club-name">${result.club2}</div>`
                  : ""
              }
            </td>
            ${
              isTeamCat
                ? `<td>${getMemberList(result?.second || result?.club2)}</td>`
                : ""
            }
          </tr>
          <tr>
            <td><span class="medal-icon">🥉</span></td>
            <td>HUY CHƯƠNG ĐỒNG (1)</td>
            <td>
              <div class="athlete-name">${result?.third1 || "—"}</div>
              ${
                result?.club3a && result.club3a !== result.third1
                  ? `<div class="club-name">${result.club3a}</div>`
                  : ""
              }
            </td>
            ${
              isTeamCat
                ? `<td>${getMemberList(result?.third1 || result?.club3a)}</td>`
                : ""
            }
          </tr>
          <tr>
            <td><span class="medal-icon">🥉</span></td>
            <td>HUY CHƯƠNG ĐỒNG (2)</td>
            <td>
              <div class="athlete-name">${result?.third2 || "—"}</div>
              ${
                result?.club3b && result.club3b !== result.third2
                  ? `<div class="club-name">${result.club3b}</div>`
                  : ""
              }
            </td>
            ${
              isTeamCat
                ? `<td>${getMemberList(result?.third2 || result?.club3b)}</td>`
                : ""
            }
          </tr>
        </tbody>
      </table>
      ${(() => {
        const sigs = getTournamentSignatures(tournament.sponsorLogos);
        if (sigs.length > 0) {
          return `
            <div class="signature-section">
              <div class="signature-label" style="width: auto; min-width: 150px; text-align: center;">BAN TỔ CHỨC</div>
              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                ${sigs.map(sig => `<img src="${sig}" class="signature-img" style="margin-top: 5px;" />`).join("")}
              </div>
            </div>
          `;
        }
        return "";
      })()}
    </body></html>`);

    printWindow.contentDocument.close();
    setTimeout(() => {
      printWindow.contentWindow.print();
      setTimeout(() => document.body.removeChild(printWindow), 1000);
    }, 300);
  };

  // ===== EXPORT BY SESSION =====
  const handleExportBySession = () => {
    const cats = getFilteredCategories();
    const sessionLabel =
      filterSession !== "all" ? getScheduleSessionLabel(filterSession) : "";
    const filterLabel = [
      filterType !== "all" ? filterType.toUpperCase() : "",
      filterGender !== "all" ? (filterGender === "male" ? "Nam" : "Nữ") : "",
      sessionLabel,
    ]
      .filter(Boolean)
      .join(" - ");

    const data = [];
    cats.forEach((cat) => {
      const result = getCategoryResults(cat.id);
      data.push({
        "Hạng mục": cat.name,
        Loại: cat.type === "kumite" ? "Kumite" : "Kata",
        "Giới tính":
          cat.gender === "male"
            ? "Nam"
            : cat.gender === "female"
            ? "Nữ"
            : "Hỗn hợp",
        "HCV (Vàng)": result?.first || "",
        "CLB HCV": result?.club1 || "",
        "Thành viên HCV":
          getTeamMemberNames(cat, result?.first) ||
          getTeamMemberNames(cat, result?.club1) ||
          "",
        "HCB (Bạc)": result?.second || "",
        "CLB HCB": result?.club2 || "",
        "Thành viên HCB":
          getTeamMemberNames(cat, result?.second) ||
          getTeamMemberNames(cat, result?.club2) ||
          "",
        "HCĐ 1 (Đồng)": result?.third1 || "",
        "CLB HCĐ 1": result?.club3a || "",
        "Thành viên HCĐ 1":
          getTeamMemberNames(cat, result?.third1) ||
          getTeamMemberNames(cat, result?.club3a) ||
          "",
        "HCĐ 2 (Đồng)": result?.third2 || "",
        "CLB HCĐ 2": result?.club3b || "",
        "Thành viên HCĐ 2":
          getTeamMemberNames(cat, result?.third2) ||
          getTeamMemberNames(cat, result?.club3b) ||
          "",
      });
    });

    if (data.length === 0) {
      toast.error("Không có dữ liệu để xuất!");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, filterLabel || "Kết quả");

    const colWidths = Object.keys(data[0] || {}).map((key) => ({
      wch:
        Math.max(
          key.length,
          ...data.map((r) => (r[key] || "").toString().length)
        ) + 2,
    }));
    ws["!cols"] = colWidths;

    const filename = `KetQua_${tournament.name.replace(
      /[^a-zA-Z0-9\u00C0-\u1EF9]/g,
      "_"
    )}${filterLabel ? `_${filterLabel.replace(/\s+/g, "_")}` : ""}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success(
      `Đã xuất ${data.length} kết quả ${filterLabel ? `(${filterLabel})` : ""}`
    );
  };

  // ===== RESULTS BY CLUB HELPERS =====
  const getResultsByClub = () => {
    const clubMap = {};
    const cats = getFilteredCategories();

    cats.forEach((cat) => {
      const result = getCategoryResults(cat.id);
      if (!result) return;

      const addResult = (clubName, medalType, athleteName) => {
        if (!clubName) return;
        const club = clubName.trim();
        if (!clubMap[club]) {
          clubMap[club] = [];
        }
        const memberNames = getTeamMemberNames(cat, clubName);
        clubMap[club].push({
          categoryName: cat.name,
          medal: medalType,
          athleteName: athleteName,
          memberNames: memberNames,
        });
      };

      if (result.club1) addResult(result.club1, "🥇 HCV", result.first);
      if (result.club2) addResult(result.club2, "🥈 HCB", result.second);
      if (result.club3a) addResult(result.club3a, "🥉 HCĐ", result.third1);
      if (result.club3b) addResult(result.club3b, "🥉 HCĐ", result.third2);
    });

    return clubMap;
  };

  const handleExportResultsByClubExcel = (specificClubs = null) => {
    let clubMap = getResultsByClub();
    
    if (specificClubs) {
      const filteredMap = {};
      specificClubs.forEach(c => {
        if (clubMap[c]) filteredMap[c] = clubMap[c];
      });
      clubMap = filteredMap;
    }

    if (Object.keys(clubMap).length === 0) {
      toast.error("Không có kết quả nào để xuất!");
      return;
    }
    const data = [];

    Object.keys(clubMap)
      .sort()
      .forEach((club) => {
        clubMap[club].forEach((res, idx) => {
          data.push({
            "CLB/Đơn vị": idx === 0 ? club : "",
            STT: idx + 1,
            "VĐV/Đội": res.memberNames
              ? `${res.athleteName} (${res.memberNames})`
              : res.athleteName,
            "Hạng mục": res.categoryName,
            "Huy chương": res.medal,
          });
        });
        // Add a blank row between clubs for readability
        data.push({});
      });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kết quả theo CLB");

    const colWidths = [
      { wch: 30 },
      { wch: 5 },
      { wch: 40 },
      { wch: 40 },
      { wch: 15 },
    ];
    ws["!cols"] = colWidths;

    XLSX.writeFile(
      wb,
      `KetQua_TheoCLB_${tournament.name.replace(
        /[^a-zA-Z0-9\u00C0-\u1EF9]/g,
        "_"
      )}.xlsx`
    );
    toast.success("Đã xuất kết quả theo CLB (Excel)!");
  };

  const handleExportResultsByClubPDF = (specificClubs = null) => {
    let clubMap = getResultsByClub();

    if (specificClubs) {
      const filteredMap = {};
      specificClubs.forEach(c => {
        if (clubMap[c]) filteredMap[c] = clubMap[c];
      });
      clubMap = filteredMap;
    }

    if (Object.keys(clubMap).length === 0) {
      toast.error("Không có kết quả nào để xuất!");
      return;
    }
    const appIconUrl = `${getAppBaseUrl()}icon.png`;
    const sponsorLogos = tournament.sponsorLogos || {};
    const tournamentLogosList = getTournamentLogos(sponsorLogos);
    const sponsors = sponsorLogos.sponsors || [];

    let logoHeaderHTML = `
      <div class="logo-header">
        <div class="header-left">
          ${tournamentLogosList.length > 0 ? `<div class="sponsor-logos">${tournamentLogosList.map(logo => `<img src="${logo}" class="system-logo" />`).join("")}</div>` : ""}
        </div>
        <div class="header-center"><img src="${appIconUrl}" class="app-icon" /></div>
        <div class="header-right">
          ${sponsors.length > 0 ? `<div class="sponsor-logos">${sponsors.map(l => `<img src="${l}" class="sponsor-logo" />`).join("")}</div>` : ""}
        </div>
      </div>
    `;


    let htmlContent = `
      ${logoHeaderHTML}
      <h1 style="text-align:center;text-transform:uppercase;font-size:24px;margin-bottom:5px;">KẾT QUẢ THI ĐẤU THEO ĐƠN VỊ</h1>
      <h2 style="text-align:center;font-size:16px;color:#000;margin-bottom:20px;font-weight:bold;font-style:italic;">${tournament.name}</h2>
    `;

    Object.keys(clubMap)
      .sort()
      .forEach((club) => {
        htmlContent += `
        <div style="margin-bottom:24px; page-break-inside: avoid;">
          <h3 style="background:#f1f5f9; padding:8px 12px; border-left:4px solid #1e3a5f; margin-bottom:8px;">${club}</h3>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="border:1px solid #e2e8f0; padding:8px; width:40px;">STT</th>
                <th style="border:1px solid #e2e8f0; padding:8px; text-align:left;">VĐV / Đội</th>
                <th style="border:1px solid #e2e8f0; padding:8px; text-align:left;">Hạng mục</th>
                <th style="border:1px solid #e2e8f0; padding:8px; width:100px;">Huy chương</th>
              </tr>
            </thead>
            <tbody>
              ${clubMap[club]
                .map(
                  (res, idx) => `
                <tr>
                  <td style="border:1px solid #e2e8f0; padding:8px; text-align:center;">${
                    idx + 1
                  }</td>
                  <td style="border:1px solid #e2e8f0; padding:8px; font-weight:bold;">
                    ${res.athleteName}
                    ${
                      res.memberNames
                        ? `<br/><small style="color:#1e40af;font-style:italic;font-weight:normal;">(${res.memberNames})</small>`
                        : ""
                    }
                  </td>
                  <td style="border:1px solid #e2e8f0; padding:8px;">${
                    res.categoryName
                  }</td>
                  <td style="border:1px solid #e2e8f0; padding:8px; text-align:center; font-weight:bold;">${
                    res.medal
                  }</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
      });

    const styleStr = `
      @page { size: portrait; margin: 10mm; }
      body { font-family: 'Times New Roman', Times, serif; color: #000; }
      .logo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
      .header-left, .header-center, .header-right { flex: 1; display: flex; align-items: center; }
      .header-left { justify-content: flex-start; }
      .header-center { justify-content: center; }
      .header-right { justify-content: flex-end; }
      .system-logo { height: 55px; max-width: 160px; object-fit: contain; }
      .app-icon { height: 60px; width: 60px; object-fit: contain; }
      .sponsor-logos { display: flex; align-items: center; gap: 10px; }
      .sponsor-logo { height: 45px; max-width: 120px; object-fit: contain; }

      .signature-section { margin-top: 40px; display: flex; flex-direction: column; align-items: flex-end; padding-right: 40px; }
      .signature-label { font-size: 14px; font-weight: bold; margin-bottom: 5px; text-align: center; width: 150px; }
      .signature-img { height: 70px; max-width: 180px; object-fit: contain; }
    `;

    const sigsList = getTournamentSignatures(sponsorLogos);
    const signatureHTML = sigsList.length > 0 ? `
      <div class="signature-section">
        <div class="signature-label" style="width: auto; min-width: 150px; text-align: center;">BAN TỔ CHỨC</div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          ${sigsList.map(sig => `<img src="${sig}" class="signature-img" style="margin-top: 5px;" />`).join("")}
        </div>
      </div>
    ` : "";

    printIframeWithLoading(
      `<!DOCTYPE html><html><head><style>${styleStr}</style></head><body>${htmlContent}${signatureHTML}</body></html>`
    );
  };

  // ===== IMPORT RESULTS FROM EXCEL =====
  // Hỗ trợ import nhiều file cùng lúc từ nhiều thư ký
  // Merge dữ liệu thay vì ghi đè, cảnh báo trùng lặp

  /**
   * Đọc 1 row Excel và trích xuất kết quả huy chương
   * Hỗ trợ nhiều format header từ các nguồn khác nhau
   */
  const parseResultRow = (row) => {
    const catName = (
      row["Hạng mục"] ||
      row["Nội dung thi đấu"] ||
      row["Nội Dung"] ||
      row["categoryName"] ||
      ""
    )
      .toString()
      .trim();
    if (!catName) return null;

    return {
      catName,
      first: (
        row["HCV (Vàng)"] ||
        row["Nhất (Vàng)"] ||
        row["HCV"] ||
        row["HCV - Chung Kết"] ||
        ""
      )
        .toString()
        .trim(),
      second: (
        row["HCB (Bạc)"] ||
        row["Nhì (Bạc)"] ||
        row["HCB"] ||
        row["HCB - Chung Kết"] ||
        ""
      )
        .toString()
        .trim(),
      third1: (
        row["HCĐ 1 (Đồng)"] ||
        row["Ba 1 (Đồng)"] ||
        row["HCĐ 1"] ||
        row["HCĐ #1 - Bán Kết"] ||
        ""
      )
        .toString()
        .trim(),
      third2: (
        row["HCĐ 2 (Đồng)"] ||
        row["Ba 2 (Đồng)"] ||
        row["HCĐ 2"] ||
        row["HCĐ #2 - Bán Kết"] ||
        ""
      )
        .toString()
        .trim(),
      club1: (
        row["CLB HCV"] ||
        row["CLB Nhất"] ||
        row["Đơn Vị HCV"] ||
        row["Đơn vị"] ||
        ""
      )
        .toString()
        .trim(),
      club2: (
        row["CLB HCB"] ||
        row["CLB Nhì"] ||
        row["Đơn Vị HCB"] ||
        row["Đơn vị_2"] ||
        ""
      )
        .toString()
        .trim(),
      club3a: (
        row["CLB HCĐ 1"] ||
        row["CLB Ba 1"] ||
        row["Đơn Vị HCĐ 1"] ||
        row["Đơn vị_3"] ||
        ""
      )
        .toString()
        .trim(),
      club3b: (
        row["CLB HCĐ 2"] ||
        row["CLB Ba 2"] ||
        row["Đơn Vị HCĐ 2"] ||
        row["Đơn vị_4"] ||
        ""
      )
        .toString()
        .trim(),
    };
  };

  /**
   * Kiểm tra 1 sheet có phải là sheet kết quả chi tiết (match-level) không
   * Trả về true nếu có cột "Match ID" hoặc "Vòng" + "VĐV 1" + "Điểm 1"
   */
  const isMatchDetailSheet = (headers) => {
    const h = headers.map((s) => (s || "").toString().toLowerCase());
    return (
      h.includes("match id") || (h.includes("vđv 1") && h.includes("điểm 1"))
    );
  };

  /**
   * Tổng hợp kết quả match-level thành medal-level (theo hạng mục)
   * Tìm trận chung kết/bán kết để xác định HCV, HCB, HCĐ
   */
  const aggregateMatchesToMedals = (matchRows) => {
    // Group by category
    const byCategory = {};
    matchRows.forEach((row) => {
      const catName = (row["Hạng mục"] || "").toString().trim();
      if (!catName) return;
      if (!byCategory[catName]) byCategory[catName] = [];
      byCategory[catName].push(row);
    });

    const results = [];
    Object.entries(byCategory).forEach(([catName, matches]) => {
      // Tìm trận chung kết (Vòng = "Chung kết" hoặc vòng cao nhất)
      const roundCol =
        matches[0]["Vòng"] !== undefined
          ? "Vòng"
          : matches[0]["roundName"] !== undefined
          ? "roundName"
          : null;

      let finalMatch = null;
      let semiMatches = [];

      if (roundCol) {
        finalMatch = matches.find((m) => {
          const r = (m[roundCol] || "").toString().toLowerCase();
          return r.includes("chung kết") || r.includes("final");
        });
        semiMatches = matches.filter((m) => {
          const r = (m[roundCol] || "").toString().toLowerCase();
          return r.includes("bán kết") || r.includes("semi");
        });
      }

      // Nếu không tìm thấy theo tên vòng, dùng trận cuối cùng
      if (!finalMatch && matches.length > 0) {
        finalMatch = matches[matches.length - 1];
      }

      if (!finalMatch) return;

      // Xác định winner/loser từ trận chung kết
      const winnerName = (
        finalMatch["Người thắng"] ||
        finalMatch["winnerName"] ||
        ""
      )
        .toString()
        .trim();
      const winnerClub = (
        finalMatch["CLB thắng"] ||
        finalMatch["winnerClub"] ||
        ""
      )
        .toString()
        .trim();
      const a1 = (finalMatch["VĐV 1"] || finalMatch["athlete1Name"] || "")
        .toString()
        .trim();
      const a1Club = (finalMatch["CLB 1"] || finalMatch["athlete1Club"] || "")
        .toString()
        .trim();
      const a2 = (finalMatch["VĐV 2"] || finalMatch["athlete2Name"] || "")
        .toString()
        .trim();
      const a2Club = (finalMatch["CLB 2"] || finalMatch["athlete2Club"] || "")
        .toString()
        .trim();

      let gold = winnerName,
        goldClub = winnerClub;
      let silver = "",
        silverClub = "";

      if (winnerName && winnerName === a1) {
        silver = a2;
        silverClub = a2Club;
      } else if (winnerName && winnerName === a2) {
        silver = a1;
        silverClub = a1Club;
      } else if (winnerName) {
        // winner doesn't match either name — use it as gold, guess silver
        silver = a1 === winnerName ? a2 : a1;
        silverClub = a1 === winnerName ? a2Club : a1Club;
      }

      // Bronze từ bán kết losers
      const bronzes = [];
      semiMatches.forEach((m) => {
        const sw = (m["Người thắng"] || m["winnerName"] || "")
          .toString()
          .trim();
        const sa1 = (m["VĐV 1"] || m["athlete1Name"] || "").toString().trim();
        const sa1C = (m["CLB 1"] || m["athlete1Club"] || "").toString().trim();
        const sa2 = (m["VĐV 2"] || m["athlete2Name"] || "").toString().trim();
        const sa2C = (m["CLB 2"] || m["athlete2Club"] || "").toString().trim();
        if (sw === sa1) bronzes.push({ name: sa2, club: sa2C });
        else if (sw === sa2) bronzes.push({ name: sa1, club: sa1C });
      });

      results.push({
        catName,
        first: gold,
        club1: goldClub,
        second: silver,
        club2: silverClub,
        third1: bronzes[0]?.name || "",
        club3a: bronzes[0]?.club || "",
        third2: bronzes[1]?.name || "",
        club3b: bronzes[1]?.club || "",
      });
    });

    return results;
  };

  /**
   * Đọc file Excel và trích xuất kết quả
   * Hỗ trợ nhiều format:
   * 1. Sheet "Kết Quả Import" / "Huy chương" - format medal trực tiếp
   * 2. Sheet "Bảng Kết Quả" - format medals.js với header dòng 4
   * 3. Sheet "Kết quả chi tiết" - match-level data → tổng hợp thành medal
   * 4. Sheet "Kết quả" - admin export format
   */
  const parseExcelFileForResults = (binaryStr) => {
    const wb = XLSX.read(binaryStr, { type: "binary" });
    const allParsedRows = [];

    // Phân loại sheets theo ưu tiên
    const importSheets = []; // "Kết Quả Import", "Huy chương" - format medal
    const displaySheets = []; // "Bảng Kết Quả", "Kết Quả" - format bảng đẹp
    const detailSheets = []; // "Kết quả chi tiết" - match-level
    const otherSheets = [];

    wb.SheetNames.forEach((name) => {
      const lower = name.toLowerCase();
      if (
        lower.includes("import") ||
        lower.includes("huy chương") ||
        lower.includes("huy chuong")
      ) {
        importSheets.push(name);
      } else if (lower.includes("chi tiết") || lower.includes("chi tiet")) {
        detailSheets.push(name);
      } else if (
        lower.includes("kết quả") ||
        lower.includes("ket qua") ||
        lower.includes("bảng")
      ) {
        displaySheets.push(name);
      } else {
        otherSheets.push(name);
      }
    });

    // Thứ tự ưu tiên: import > display > other > detail (detail là fallback cuối)
    const sheetsToTry = [...importSheets, ...displaySheets, ...otherSheets];

    for (const sheetName of sheetsToTry) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      let rows = XLSX.utils.sheet_to_json(ws);

      // Kiểm tra nếu là match-detail (có "Match ID"), bỏ qua ở đây
      if (rows.length > 0 && isMatchDetailSheet(Object.keys(rows[0]))) continue;

      // Thử parse bình thường (header row đầu tiên)
      if (rows.length > 0 && parseResultRow(rows[0])) {
        // Kiểm tra có dữ liệu medal thực sự (không chỉ có catName)
        const validRows = rows.map((r) => parseResultRow(r)).filter(Boolean);
        const hasRealData = validRows.some(
          (r) => r.first || r.second || r.third1 || r.third2
        );
        if (hasRealData) {
          allParsedRows.push(...validRows);
          break;
        }
      }

      // Thử skip header rows (medals.js format có 3 dòng tiêu đề)
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
        const headerRow = rawRows[i];
        if (!headerRow) continue;
        const headerStr = headerRow.join("|").toLowerCase();
        if (headerStr.includes("nội dung") || headerStr.includes("hạng mục")) {
          // Kiểm tra nếu đây là match-detail header
          if (isMatchDetailSheet(headerRow)) break;

          // Deduplicate headers trùng tên (format cũ nhiều cột "Đơn vị")
          const headers = headerRow.map((h, idx) => {
            if (!h) return null;
            const name = h.toString().trim();
            const prevCount = headerRow
              .slice(0, idx)
              .filter((prev) => prev && prev.toString().trim() === name).length;
            return prevCount > 0 ? `${name}_${prevCount + 1}` : name;
          });
          for (let j = i + 1; j < rawRows.length; j++) {
            if (!rawRows[j] || !rawRows[j][1]) continue;
            const rowObj = {};
            headers.forEach((h, idx) => {
              if (h) rowObj[h.toString().trim()] = rawRows[j][idx] ?? "";
            });
            const parsed = parseResultRow(rowObj);
            if (parsed) allParsedRows.push(parsed);
          }
          break;
        }
      }

      if (allParsedRows.length > 0) {
        const hasRealData = allParsedRows.some(
          (r) => r.first || r.second || r.third1 || r.third2
        );
        if (hasRealData) break;
        // Nếu chỉ có catName mà không có medal data, reset và thử sheet tiếp theo
        allParsedRows.length = 0;
      }
    }

    // Fallback: nếu không tìm thấy medal data, thử tổng hợp từ match-detail sheets
    if (allParsedRows.length === 0 && detailSheets.length > 0) {
      for (const sheetName of detailSheets) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json(ws);
        if (rows.length > 0 && isMatchDetailSheet(Object.keys(rows[0]))) {
          const medals = aggregateMatchesToMedals(rows);
          allParsedRows.push(...medals);
          break;
        }
      }
    }

    // Fallback cuối: thử tổng hợp từ BẤT KỲ sheet nào có match-detail format
    if (allParsedRows.length === 0) {
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json(ws);
        if (rows.length > 0 && isMatchDetailSheet(Object.keys(rows[0]))) {
          const medals = aggregateMatchesToMedals(rows);
          if (medals.length > 0) {
            allParsedRows.push(...medals);
            break;
          }
        }
      }
    }

    // Deduplicate: nếu cùng catName xuất hiện nhiều lần, giữ lại cái có data
    const deduped = [];
    const seen = new Set();
    allParsedRows.forEach((row) => {
      const key = row.catName.toLowerCase();
      if (seen.has(key)) {
        // Nếu đã có nhưng chưa có data, thay thế
        const existIdx = deduped.findIndex(
          (r) => r.catName.toLowerCase() === key
        );
        if (existIdx >= 0 && !deduped[existIdx].first && row.first) {
          deduped[existIdx] = row;
        }
      } else {
        seen.add(key);
        deduped.push(row);
      }
    });

    return deduped;
  };

  /**
   * Trích xuất chi tiết trận đấu từ Excel (sheet "Kết quả chi tiết")
   * Trả về mảng { catName, matchId, roundName, athlete1Name, athlete1Club,
   *   score1, athlete2Name, athlete2Club, score2, winnerName, winnerClub }
   */
  const parseMatchDetailsFromExcel = (binaryStr) => {
    const wb = XLSX.read(binaryStr, { type: "binary" });
    const matchDetails = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws);
      if (rows.length === 0) continue;
      const headers = Object.keys(rows[0]);
      if (!isMatchDetailSheet(headers)) continue;

      rows.forEach((row) => {
        const catName = (row["Hạng mục"] || "").toString().trim();
        const matchId = (row["Match ID"] || "").toString().trim();
        const winnerName = (row["Người thắng"] || row["winnerName"] || "")
          .toString()
          .trim();
        if (!catName || !winnerName) return;

        matchDetails.push({
          catName,
          matchId,
          roundName: (row["Vòng"] || "").toString().trim(),
          athlete1Name: (row["VĐV 1"] || "").toString().trim(),
          athlete1Club: (row["CLB 1"] || "").toString().trim(),
          score1: row["Điểm 1"] ?? null,
          athlete2Name: (row["VĐV 2"] || "").toString().trim(),
          athlete2Club: (row["CLB 2"] || "").toString().trim(),
          score2: row["Điểm 2"] ?? null,
          winnerName,
          winnerClub: (row["CLB thắng"] || "").toString().trim(),
          notes: (row["Ghi chú"] || "").toString().trim(),
        });
      });
      if (matchDetails.length > 0) break;
    }
    return matchDetails;
  };

  const handleImportResults = (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    const allParsedRows = [];
    const allMatchDetails = [];
    const fileNames = [];
    let filesRead = 0;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = parseExcelFileForResults(evt.target.result);
          allParsedRows.push(...parsed);
          // Cũng parse match details từ sheet "Kết quả chi tiết"
          const matchDetails = parseMatchDetailsFromExcel(evt.target.result);
          allMatchDetails.push(...matchDetails);
          fileNames.push(file.name);
        } catch (error) {
          toast.error(`Lỗi đọc file ${file.name}: ${error.message}`);
        }

        filesRead++;
        if (filesRead === files.length) {
          showImportPreview(allParsedRows, fileNames, allMatchDetails);
        }
      };
      reader.readAsBinaryString(file);
    });

    e.target.value = "";
  };

  /**
   * Hiển thị preview trước khi import
   */
  const showImportPreview = (parsedRows, fileNames, matchDetails = []) => {
    if (parsedRows.length === 0 && matchDetails.length === 0) {
      toast.error(
        "Không tìm thấy dữ liệu kết quả trong file Excel! Kiểm tra lại format file."
      );
      return;
    }

    const existingResults = { ...(tournament.categoryResults || {}) };
    let matched = 0;
    let skipped = 0;
    let overwritten = 0;
    let newCount = 0;
    const details = [];

    parsedRows.forEach((parsed) => {
      const matchedCat = tournament.categories.find(
        (c) =>
          c.name.toLowerCase().trim() === parsed.catName.toLowerCase().trim()
      );

      if (!matchedCat) {
        skipped++;
        details.push({
          catName: parsed.catName,
          status: "not_found",
          message: "Không tìm thấy hạng mục trong giải đấu",
        });
        return;
      }

      const hasExisting = !!existingResults[matchedCat.id]?.first;
      const hasNewData = !!(
        parsed.first ||
        parsed.second ||
        parsed.third1 ||
        parsed.third2
      );

      if (!hasNewData) {
        skipped++;
        details.push({
          catName: parsed.catName,
          status: "empty",
          message: "Dữ liệu trống",
        });
        return;
      }

      matched++;
      if (hasExisting) {
        overwritten++;
        details.push({
          catName: parsed.catName,
          catId: matchedCat.id,
          status: "overwrite",
          message: `⚠️ Sẽ ghi đè kết quả cũ`,
          oldData: existingResults[matchedCat.id],
          newData: parsed,
        });
      } else {
        newCount++;
        details.push({
          catName: parsed.catName,
          catId: matchedCat.id,
          status: "new",
          message: "✅ Kết quả mới",
          newData: parsed,
        });
      }
    });

    setImportPreview({
      parsedRows,
      fileNames,
      matchDetails,
      details,
      stats: {
        total: parsedRows.length,
        matched,
        skipped,
        overwritten,
        newCount,
        matchDetailsCount: matchDetails.length,
      },
    });
  };

  /**
   * Xác nhận import sau khi preview
   */
  const confirmImport = () => {
    if (!importPreview) return;

    const newResults = { ...(tournament.categoryResults || {}) };
    let imported = 0;

    importPreview.details.forEach((detail) => {
      if (detail.status === "not_found" || detail.status === "empty") return;

      if (importMode === "merge" && detail.status === "overwrite") {
        const existing = newResults[detail.catId] || {};
        const newData = detail.newData;
        newResults[detail.catId] = {
          first: existing.first || newData.first || "",
          second: existing.second || newData.second || "",
          third1: existing.third1 || newData.third1 || "",
          third2: existing.third2 || newData.third2 || "",
          club1: existing.club1 || newData.club1 || "",
          club2: existing.club2 || newData.club2 || "",
          club3a: existing.club3a || newData.club3a || "",
          club3b: existing.club3b || newData.club3b || "",
        };
        imported++;
      } else {
        const newData = detail.newData;
        newResults[detail.catId] = {
          first: newData.first || "",
          second: newData.second || "",
          third1: newData.third1 || "",
          third2: newData.third2 || "",
          club1: newData.club1 || "",
          club2: newData.club2 || "",
          club3a: newData.club3a || "",
          club3b: newData.club3b || "",
        };
        imported++;
      }
    });

    // Lưu kết quả huy chương
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: {
        id: tournament.id,
        categoryResults: newResults,
      },
    });

    // ===== APPLY MATCH DETAILS TO BRACKETS =====
    // Nếu có dữ liệu chi tiết trận đấu từ thư ký, cập nhật vào bracket
    const matchDetails = importPreview.matchDetails || [];
    let bracketUpdated = 0;

    if (matchDetails.length > 0) {
      // Gom match details theo tên hạng mục
      const detailsByCat = {};
      matchDetails.forEach((md) => {
        const key = md.catName.toLowerCase().trim();
        if (!detailsByCat[key]) detailsByCat[key] = [];
        detailsByCat[key].push(md);
      });

      // Duyệt từng hạng mục và apply kết quả vào bracket
      Object.entries(detailsByCat).forEach(([catNameLower, details]) => {
        const cat = tournament.categories.find(
          (c) => c.name.toLowerCase().trim() === catNameLower
        );
        if (!cat?.bracket?.matches) return;

        let updatedBracket = JSON.parse(JSON.stringify(cat.bracket));
        let hasUpdates = false;

        // Sắp xếp theo round để apply đúng thứ tự (vòng 1 trước, vòng 2 sau,...)
        // Dùng roundNames từ bracket để xác định thứ tự chính xác
        const roundNames = updatedBracket.roundNames || [];
        details.sort((a, b) => {
          let ra = roundNames.indexOf(a.roundName);
          let rb = roundNames.indexOf(b.roundName);
          // Fallback: parse "Vòng X" format
          if (ra === -1) {
            const matchA = a.roundName.match(/Vòng\s+(\d+)/i);
            ra = matchA ? parseInt(matchA[1]) - 1 : 999;
          }
          if (rb === -1) {
            const matchB = b.roundName.match(/Vòng\s+(\d+)/i);
            rb = matchB ? parseInt(matchB[1]) - 1 : 999;
          }
          return ra - rb;
        });

        details.forEach((md) => {
          // Tìm match bằng matchId (UUID) hoặc bằng tên VĐV
          let match = updatedBracket.matches.find((m) => m.id === md.matchId);

          // Fallback: tìm bằng tên VĐV nếu matchId không khớp
          if (!match && md.athlete1Name && md.athlete2Name) {
            match = updatedBracket.matches.find(
              (m) =>
                m.athlete1 &&
                m.athlete2 &&
                ((m.athlete1.name === md.athlete1Name &&
                  m.athlete2.name === md.athlete2Name) ||
                  (m.athlete1.name === md.athlete2Name &&
                    m.athlete2.name === md.athlete1Name))
            );
          }

          if (!match || !match.athlete1 || !match.athlete2) return;
          if (match.winner) return; // Đã có kết quả rồi, bỏ qua

          // Xác định winnerId từ winnerName
          let winnerId = null;
          if (md.winnerName === match.athlete1?.name) {
            winnerId = match.athlete1.id;
          } else if (md.winnerName === match.athlete2?.name) {
            winnerId = match.athlete2.id;
          }
          if (!winnerId) return;

          // Apply kết quả và advance VĐV
          updatedBracket = applyMatchResult(
            updatedBracket,
            match.id,
            md.score1 ?? 0,
            md.score2 ?? 0,
            winnerId
          );
          hasUpdates = true;
        });

        if (hasUpdates) {
          dispatch({
            type: ACTIONS.UPDATE_CATEGORY,
            payload: { id: cat.id, bracket: updatedBracket },
          });
          bracketUpdated++;
        }
      });
    }

    const stats = importPreview.stats;
    let message = `✅ Import thành công! ${imported} hạng mục (${stats.newCount} mới, ${stats.overwritten} cập nhật, ${stats.skipped} bỏ qua)`;
    if (bracketUpdated > 0) {
      message += ` | 🏆 Cập nhật bracket ${bracketUpdated} hạng mục`;
    }
    toast.success(message);

    setImportPreview(null);
  };

  // ===== MEDAL TALLY (Bảng tổng sắp) =====
  const getMedalTally = () => {
    const clubMap = {};
    const cats = getFilteredCategories();

    cats.forEach((cat) => {
      const result = getCategoryResults(cat.id);
      if (!result) return;

      const addMedal = (clubName, type) => {
        if (!clubName) return;
        const club = clubName.trim();
        if (!clubMap[club]) {
          clubMap[club] = {
            name: club,
            gold: 0,
            silver: 0,
            bronze: 0,
            total: 0,
          };
        }
        clubMap[club][type] += 1;
        clubMap[club].total += 1;
      };

      if (result.club1) addMedal(result.club1, "gold");
      if (result.club2) addMedal(result.club2, "silver");
      if (result.club3a) addMedal(result.club3a, "bronze");
      if (result.club3b) addMedal(result.club3b, "bronze");
    });

    return Object.values(clubMap).sort((a, b) => {
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.silver !== a.silver) return b.silver - a.silver;
      return b.bronze - a.bronze;
    });
  };

  // ===== EXPORT MEDAL TALLY TO EXCEL =====
  const handleExportMedalTally = () => {
    const tally = getMedalTally();
    const data = tally.map((club, idx) => ({
      Hạng: idx === 0 ? "NHẤT TOÀN ĐOÀN" : idx === 1 ? "NHÌ TOÀN ĐOÀN" : idx === 2 ? "BA TOÀN ĐOÀN" : idx + 1,
      "Đơn vị/CLB": club.name,
      "HCV 🥇": club.gold,
      "HCB 🥈": club.silver,
      "HCĐ 🥉": club.bronze,
      Tổng: club.total,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bảng tổng sắp");

    const colWidths = Object.keys(data[0] || {}).map((key) => ({
      wch:
        Math.max(
          key.length,
          ...data.map((r) => (r[key] || "").toString().length)
        ) + 2,
    }));
    ws["!cols"] = colWidths;

    XLSX.writeFile(
      wb,
      `BangTongSap_${tournament.name.replace(
        /[^a-zA-Z0-9\u00C0-\u1EF9]/g,
        "_"
      )}.xlsx`
    );
    toast.success("Đã xuất bảng tổng sắp Excel!");
  };
  // ===== EXPORT PDF =====
  const handleExportPDF = (type) => {
    let htmlContent = "";
    const filterLabel =
      filterType !== "all" || filterGender !== "all" || filterSession !== "all"
        ? ` (${filterType !== "all" ? filterType.toUpperCase() : ""}${
            filterGender !== "all"
              ? filterGender === "male"
                ? " Nam"
                : " Nữ"
              : ""
          }${
            filterSession !== "all"
              ? ` ${getScheduleSessionLabel(filterSession)}`
              : ""
          })`
        : "";

    // Build logo header HTML - always include app icon.png
    const appIconUrl = `${getAppBaseUrl()}icon.png`;
    const sponsorLogos = tournament.sponsorLogos || {};
    const tournamentLogosList = getTournamentLogos(sponsorLogos);
    const sponsors = sponsorLogos.sponsors || [];
    let logoHeaderHTML = `
      <div class="logo-header">
        <div class="header-left">
          ${tournamentLogosList.length > 0 ? `<div class="sponsor-logos">${tournamentLogosList.map(logo => `<img src="${logo}" class="system-logo" />`).join("")}</div>` : ""}
        </div>
        <div class="header-center"><img src="${appIconUrl}" class="app-icon" /></div>
        <div class="header-right">
          ${sponsors.length > 0 ? `<div class="sponsor-logos">${sponsors.map(l => `<img src="${l}" class="sponsor-logo" />`).join("")}</div>` : ""}
        </div>
      </div>
    `;


    if (type === "results") {
      const cats = getFilteredCategories();
      htmlContent = `
        ${logoHeaderHTML}
        <h1>KẾT QUẢ THI ĐẤU${filterLabel}</h1>
        <h2>${tournament.name}</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Hạng mục</th>
              <th>🥇 HCV</th>
              <th>🥈 HCB</th>
              <th>🥉 HCĐ (1)</th>
              <th>🥉 HCĐ (2)</th>
            </tr>
          </thead>
          <tbody>
            ${cats
              .map((cat, idx) => {
                const r = getCategoryResults(cat.id);
                return `<tr>
                <td>${idx + 1}</td>
                <td><strong>${cat.name}</strong></td>
                <td>${getMedalCellHTML(cat, r?.first, r?.club1)}</td>
                <td>${getMedalCellHTML(cat, r?.second, r?.club2)}</td>
                <td>${getMedalCellHTML(cat, r?.third1, r?.club3a)}</td>
                <td>${getMedalCellHTML(cat, r?.third2, r?.club3b)}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>`;
    } else {
      const tally = getMedalTally();
      htmlContent = `
        ${logoHeaderHTML}
        <h1>BẢNG TỔNG SẮP HUY CHƯƠNG${filterLabel}</h1>
        <h2>${tournament.name}</h2>
        <table>
          <thead>
            <tr>
              <th>Hạng</th>
              <th>Đơn vị / CLB</th>
              <th>🥇 HCV</th>
              <th>🥈 HCB</th>
              <th>🥉 HCĐ</th>
              <th>Tổng</th>
            </tr>
          </thead>
          <tbody>
            ${tally
              .map(
                (club, idx) => `<tr class="${idx < 3 ? "top" : ""}">
              <td style="text-align:center;font-weight:bold">${idx === 0 ? "NHẤT TOÀN ĐOÀN" : idx === 1 ? "NHÌ TOÀN ĐOÀN" : idx === 2 ? "BA TOÀN ĐOÀN" : idx + 1}</td>
              <td><strong>${club.name}</strong></td>
              <td style="text-align:center;color:#b45309">${
                club.gold || "-"
              }</td>
              <td style="text-align:center;color:#6b7280">${
                club.silver || "-"
              }</td>
              <td style="text-align:center;color:#92400e">${
                club.bronze || "-"
              }</td>
              <td style="text-align:center;font-weight:bold">${club.total}</td>
            </tr>`
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="font-weight:bold">Tổng cộng</td>
              <td style="text-align:center;font-weight:bold">${tally.reduce(
                (s, c) => s + c.gold,
                0
              )}</td>
              <td style="text-align:center;font-weight:bold">${tally.reduce(
                (s, c) => s + c.silver,
                0
              )}</td>
              <td style="text-align:center;font-weight:bold">${tally.reduce(
                (s, c) => s + c.bronze,
                0
              )}</td>
              <td style="text-align:center;font-weight:bold">${tally.reduce(
                (s, c) => s + c.total,
                0
              )}</td>
            </tr>
          </tfoot>        </table>`;
    }
    printIframeWithLoading(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>${type === "results" ? "Kết quả thi đấu" : "Bảng tổng sắp"} - ${
      tournament.name
    }</title>
      <style>
        @page { size: portrait; margin: 10mm; }
        body { font-family: 'Times New Roman', Times, serif; color: #000; padding: 20px; }
        h1 { text-align: center; font-size: 24px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
        h2 { text-align: center; font-size: 16px; font-weight: bold; font-style: italic; color: #000; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { color: #000; padding: 8px 6px; text-align: center; font-size: 12px; font-weight: bold; border: 1px solid #000; }
        td { padding: 6px; border: 1px solid #000; }
        small { font-size: 11px; }
        tfoot td { border: 1px solid #000; font-weight: bold; }
        .logo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .header-left, .header-center, .header-right { flex: 1; display: flex; align-items: center; }
        .header-left { justify-content: flex-start; }
        .header-center { justify-content: center; }
        .header-right { justify-content: flex-end; }
        .system-logo { height: 55px; max-width: 160px; object-fit: contain; }
        .app-icon { height: 60px; width: 60px; object-fit: contain; }
        .sponsor-logos { display: flex; align-items: center; gap: 10px; }
        .sponsor-logo { height: 45px; max-width: 120px; object-fit: contain; }

        .signature-section { margin-top: 40px; display: flex; flex-direction: column; align-items: flex-end; padding-right: 40px; }
        .signature-label { font-size: 14px; font-weight: bold; margin-bottom: 5px; text-align: center; width: 150px; }
        .signature-img { height: 70px; max-width: 180px; object-fit: contain; }
      </style>
    </head><body>
      ${htmlContent}
      ${(() => {
        const sigs = getTournamentSignatures(sponsorLogos);
        if (sigs.length > 0) {
          return `
            <div class="signature-section">
              <div class="signature-label" style="width: auto; min-width: 150px; text-align: center;">BAN TỔ CHỨC</div>
              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                ${sigs.map(sig => `<img src="${sig}" class="signature-img" style="margin-top: 5px;" />`).join("")}
              </div>
            </div>
          `;
        }
        return "";
      })()}
    </body></html>`);

  };

  const medals = getEstimatedMedals();
  const clubs = getClubs();
  const medalTally = getMedalTally();
  const filteredCategories = getFilteredCategories();
  const categoriesWithResults = tournament.categories.filter((c) => {
    const r = getCategoryResults(c.id);
    return r && r.first && r.first.trim() !== "";
  });

  // ===== CLUB REGISTRATION HELPERS =====
  const clubRegistrations = tournament.clubRegistrations || {};

  const getClubRegistration = (clubName) => {
    return clubRegistrations[clubName] || { coaches: [], teamLeader: "" };
  };

  const saveClubRegistration = (clubName, regData) => {
    dispatch({
      type: ACTIONS.UPDATE_CLUB_REGISTRATIONS,
      payload: {
        tournamentId: tournament.id,
        clubRegistrations: {
          ...clubRegistrations,
          [clubName]: regData,
        },
      },
    });
  };

  const handleEditClubReg = (club) => {
    const reg = getClubRegistration(club);
    setClubRegForm({
      coaches: reg.coaches.length > 0 ? [...reg.coaches] : [""],
      teamLeader: reg.teamLeader || "",
    });
    setEditingClubReg(club);
  };

  const handleSaveClubReg = () => {
    if (!editingClubReg) return;
    saveClubRegistration(editingClubReg, {
      coaches: clubRegForm.coaches.filter(Boolean),
      teamLeader: clubRegForm.teamLeader.trim(),
    });
    setEditingClubReg(null);
    toast.success(`Đã lưu thông tin đoàn ${editingClubReg}!`);
  };

  const handleDeleteClubReg = () => {
    if (!editingClubReg) return;
    if (
      !window.confirm(
        `Bạn có chắc muốn xóa tất cả VĐV và thông tin của đoàn ${editingClubReg}?`
      )
    )
      return;

    // Delete all athletes belonging to this club across all categories
    tournament.categories.forEach((cat) => {
      if (cat.athletes) {
        cat.athletes
          .filter((a) => a.club?.trim() === editingClubReg)
          .forEach((a) => {
            dispatch({ type: ACTIONS.DELETE_ATHLETE, payload: a.id });
          });
      }
    });

    // Remove club registration info
    const newClubRegistrations = { ...clubRegistrations };
    delete newClubRegistrations[editingClubReg];

    dispatch({
      type: ACTIONS.UPDATE_CLUB_REGISTRATIONS,
      payload: {
        tournamentId: tournament.id,
        clubRegistrations: newClubRegistrations,
      },
    });

    setEditingClubReg(null);
    toast.success(`Đã xóa toàn bộ dữ liệu của đoàn ${editingClubReg}!`);
  };

  // Get athletes grouped by category
  const getAthletesByCategory = () => {
    return tournament.categories.map((cat) => ({
      category: cat,
      athletes: cat.athletes || [],
    }));
  };

  const getClubDelegationSummary = () => {
    const allAthletes = getAllAthletes();
    const summary = clubs.map((club) => {
      const regInfo = getClubRegistration(club);
      const refAthletes = allAthletes.filter((a) => a.club?.trim() === club);

      const uniqueAthletes = new Set();
      const uniqueMale = new Set();
      const uniqueFemale = new Set();

      refAthletes.forEach((a) => {
        const key = `${(a.name || "").trim().toLowerCase()}_${
          a.birthDate || a.birthYear || ""
        }_${a.gender || ""}`;
        uniqueAthletes.add(key);
        if (a.gender === "male") uniqueMale.add(key);
        if (a.gender === "female") uniqueFemale.add(key);
      });

      return {
        club,
        teamLeader: regInfo.teamLeader || "",
        coaches: regInfo.coaches || [],
        teamLeaderCount: regInfo.teamLeader ? 1 : 0,
        coachCount: (regInfo.coaches || []).filter(Boolean).length,
        maleCount: uniqueMale.size,
        femaleCount: uniqueFemale.size,
        athleteCount: uniqueAthletes.size,
        totalEntries: refAthletes.length,
        submittedAt: regInfo.submittedAt || "" // NEW FIELD
      };
    });

    return summary.sort((a, b) => a.club.localeCompare(b.club, "vi"));
  };

  // Export delegation stats to Excel (official format)
  const handleExportDelegation = () => {
    const delegations = getClubDelegationSummary();
    const wb = XLSX.utils.book_new();

    // ===== Sheet 1: Thống kê (official format) =====
    const titleRows = [["THỐNG KÊ"], [tournament.name], []];
    // Header row 1 (merged)
    const headerRow1 = ["TT", "ĐƠN VỊ", "CÁN BỘ", "", "VĐV", ""];
    // Header row 2
    const headerRow2 = ["", "", "TĐ", "HLV", "Nam", "Nữ"];

    const dataRows = delegations.map((d, i) => [
      i + 1,
      d.club,
      d.teamLeaderCount,
      d.coachCount,
      d.maleCount,
      d.femaleCount,
    ]);
    // Totals
    dataRows.push([
      "",
      "TỔNG CỘNG",
      delegations.reduce((s, d) => s + d.teamLeaderCount, 0),
      delegations.reduce((s, d) => s + d.coachCount, 0),
      delegations.reduce((s, d) => s + d.maleCount, 0),
      delegations.reduce((s, d) => s + d.femaleCount, 0),
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet([
      ...titleRows,
      headerRow1,
      headerRow2,
      ...dataRows,
    ]);
    // Merge cells for headers
    ws1["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // Title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }, // Tournament name
      { s: { r: 3, c: 2 }, e: { r: 3, c: 3 } }, // CÁN BỘ
      { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } }, // VĐV
      { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } }, // TT
      { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }, // ĐƠN VỊ
    ];
    ws1["!cols"] = [
      { wch: 5 },
      { wch: 30 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, "Thống kê");

    // ===== Sheet 2: Chi tiết đoàn =====
    const detailData = delegations.map((d, i) => ({
      STT: i + 1,
      "CLB/Đơn vị": d.club,
      "Trưởng đoàn": d.teamLeader,
      HLV: d.coaches.join(", "),
      "Số TĐ": d.teamLeaderCount,
      "Số HLV": d.coachCount,
      "VĐV Nam": d.maleCount,
      "VĐV Nữ": d.femaleCount,
      "Tổng VĐV": d.athleteCount,
    }));
    const ws2 = XLSX.utils.json_to_sheet(detailData);
    ws2["!cols"] = [
      { wch: 5 },
      { wch: 30 },
      { wch: 20 },
      { wch: 40 },
      { wch: 8 },
      { wch: 8 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "Chi tiết đoàn");

    XLSX.writeFile(
      wb,
      `ThongKe_${tournament.name.replace(
        /[^a-zA-Z0-9\u00C0-\u1EF9]/g,
        "_"
      )}.xlsx`
    );
    toast.success("Đã xuất Excel thống kê đoàn!");
  };

  // ----- VĐV THEO HẠNG MỤC EXPORT -----
  const handleExportAthsByCatExcel = () => {
    if (selectedDelegationCategories.size === 0) {
      toast.error("Vui lòng chọn ít nhất một hạng mục để xuất!");
      return;
    }
    const wb = XLSX.utils.book_new();
    const catData = [];
    tournament.categories
      .filter((c) => selectedDelegationCategories.has(c.id))
      .forEach((cat) => {
        (cat.athletes || []).forEach((a, i) => {
          catData.push({
            "Hạng mục": cat.name,
            Loại: cat.type === "kumite" ? "Kumite" : "Kata",
            STT: i + 1,
            "Họ tên VĐV": a.name,
            "Giới tính": a.gender === "male" ? "Nam" : "Nữ",
            CLB: a.club || "",
            "Cân nặng": a.weight || "",
          });
        });
      });
    const ws = XLSX.utils.json_to_sheet(catData);
    ws["!cols"] = [
      { wch: 30 },
      { wch: 10 },
      { wch: 5 },
      { wch: 25 },
      { wch: 10 },
      { wch: 25 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "VĐV theo hạng mục");
    XLSX.writeFile(
      wb,
      `VDV_HangMuc_${tournament.name.replace(
        /[^a-zA-Z0-9\u00C0-\u1EF9]/g,
        "_"
      )}.xlsx`
    );
  };

  const handleExportAthsByCatPDF = () => {
    if (selectedDelegationCategories.size === 0) {
      toast.error("Vui lòng chọn ít nhất một hạng mục để xuất!");
      return;
    }
    const selectedCats = tournament.categories.filter((c) =>
      selectedDelegationCategories.has(c.id)
    );

    const printFrame = document.createElement("iframe");
    printFrame.style.display = "none";
    document.body.appendChild(printFrame);

    // Logos
    const appIconUrl = `${getAppBaseUrl()}icon.png`;
    const sponsorLogos = tournament.sponsorLogos || {};
    const tournamentLogosList = getTournamentLogos(sponsorLogos);
    const sponsors = sponsorLogos.sponsors || [];
    let logoHeaderHTML = `
      <div class="logo-header">
        <div class="header-left">
          ${tournamentLogosList.length > 0 ? `<div class="sponsor-logos">${tournamentLogosList.map(logo => `<img src="${logo}" class="system-logo" />`).join("")}</div>` : ""}
        </div>
        <div class="header-center"><img src="${appIconUrl}" class="app-icon" /></div>
        <div class="header-right">
          ${sponsors.length > 0 ? `<div class="sponsor-logos">${sponsors.map(l => `<img src="${l}" class="sponsor-logo" />`).join("")}</div>` : ""}
        </div>
      </div>
    `;


    let htmlContent = `
      ${logoHeaderHTML}
      <h1 style="text-align:center;text-transform:uppercase;font-size:24px;margin-bottom:5px;">DANH SÁCH VĐV THEO HẠNG MỤC</h1>
      <h2 style="text-align:center;font-size:16px;color:#000;margin-bottom:20px;font-weight:bold;font-style:italic;">${tournament.name}</h2>
    `;

    selectedCats.forEach((cat) => {
      const athletes = cat.athletes || [];
      if (athletes.length === 0) return;
      htmlContent += `
        <div style="margin-bottom:20px;">
          <h3 style="margin:0 0 10px 0;font-size:16px;page-break-after:avoid;">
            ${cat.name} <span style="font-weight:normal;font-size:14px;">(${
        athletes.length
      } VĐV)</span>
          </h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr>
                <th style="border:1px solid #000;padding:6px;width:40px;">STT</th>
                <th style="border:1px solid #000;padding:6px;text-align:left;">Họ tên</th>
                <th style="border:1px solid #000;padding:6px;width:80px;">Giới tính</th>
                <th style="border:1px solid #000;padding:6px;text-align:left;">Đơn vị/CLB</th>
                ${
                  cat.type === "kumite"
                    ? '<th style="border:1px solid #000;padding:6px;width:80px;">Cân nặng</th>'
                    : ""
                }
              </tr>
            </thead>
            <tbody>
              ${athletes
                .map(
                  (a, i) => `
                <tr style="page-break-inside:avoid;">
                  <td style="border:1px solid #000;padding:6px;text-align:center;">${
                    i + 1
                  }</td>
                  <td style="border:1px solid #000;padding:6px;font-weight:bold;">${
                    a.name
                  }</td>
                  <td style="border:1px solid #000;padding:6px;text-align:center;">${
                    a.gender === "male" ? "Nam" : "Nữ"
                  }</td>
                  <td style="border:1px solid #000;padding:6px;">${
                    a.club || ""
                  }</td>
                  ${
                    cat.type === "kumite"
                      ? `<td style="border:1px solid #000;padding:6px;text-align:center;">${
                          a.weight ? a.weight + "kg" : ""
                        }</td>`
                      : ""
                  }
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    });
    const styleStr = `
      @page { size: portrait; margin: 10mm; }
      body { font-family: 'Times New Roman', Times, serif; color: #000; }
      .logo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
      .header-left, .header-center, .header-right { flex: 1; display: flex; align-items: center; }
      .header-left { justify-content: flex-start; }
      .header-center { justify-content: center; }
      .header-right { justify-content: flex-end; }
      .system-logo { height: 55px; max-width: 160px; object-fit: contain; }
      .app-icon { height: 60px; width: 60px; object-fit: contain; }
      .sponsor-logos { display: flex; align-items: center; gap: 10px; }
      .sponsor-logo { height: 45px; max-width: 120px; object-fit: contain; }

      .signature-section { margin-top: 40px; display: flex; flex-direction: column; align-items: flex-end; padding-right: 40px; }
      .signature-label { font-size: 14px; font-weight: bold; margin-bottom: 5px; text-align: center; width: 150px; }
      .signature-img { height: 70px; max-width: 180px; object-fit: contain; }
    `;

    printIframeWithLoading(
      `<!DOCTYPE html><html><head><style>${styleStr}</style></head><body>${htmlContent}
      ${(() => {
        const sigs = getTournamentSignatures(sponsorLogos);
        if (sigs.length > 0) {
          return `
            <div class="signature-section">
              <div class="signature-label" style="width: auto; min-width: 150px; text-align: center;">BAN TỔ CHỨC</div>
              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                ${sigs.map(sig => `<img src="${sig}" class="signature-img" style="margin-top: 5px;" />`).join("")}
              </div>
            </div>
          `;
        }
        return "";
      })()}
      </body></html>`
    );
  };

  // ----- VĐV THEO CLB EXPORT -----
  const handleExportAthsByClubExcel = () => {
    if (selectedDelegationClubs.size === 0) {
      toast.error("Vui lòng chọn ít nhất một CLB để xuất!");
      return;
    }
    const delegations = getClubDelegationSummary().filter((d) =>
      selectedDelegationClubs.has(d.club)
    );
    const wb = XLSX.utils.book_new();
    const clubAthleteData = [];
    delegations.forEach((d) => {
      const allAth = getAllAthletes().filter((a) => a.club?.trim() === d.club);
      allAth.forEach((a, i) => {
        clubAthleteData.push({
          CLB: d.club,
          STT: i + 1,
          "Họ tên VĐV": a.name,
          "Giới tính": a.gender === "male" ? "Nam" : "Nữ",
          "Hạng mục": a.categoryName,
          "Cân nặng": a.weight || "",
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(clubAthleteData);
    ws["!cols"] = [
      { wch: 25 },
      { wch: 5 },
      { wch: 25 },
      { wch: 10 },
      { wch: 30 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "VĐV theo CLB");
    XLSX.writeFile(
      wb,
      `VDV_CLB_${tournament.name.replace(
        /[^a-zA-Z0-9\u00C0-\u1EF9]/g,
        "_"
      )}.xlsx`
    );
  };

  const handleExportAthsByClubPDF = () => {
    if (selectedDelegationClubs.size === 0) {
      toast.error("Vui lòng chọn ít nhất một CLB để xuất!");
      return;
    }
    const delegations = getClubDelegationSummary().filter((d) =>
      selectedDelegationClubs.has(d.club)
    );
    const printFrame = document.createElement("iframe");
    printFrame.style.display = "none";
    document.body.appendChild(printFrame);

    // Logos
    const appIconUrl = `${getAppBaseUrl()}icon.png`;
    const sponsorLogos = tournament.sponsorLogos || {};
    const tournamentLogosList = getTournamentLogos(sponsorLogos);
    const sponsors = sponsorLogos.sponsors || [];
    let logoHeaderHTML = `
      <div class="logo-header">
        <div class="header-left">
          ${tournamentLogosList.length > 0 ? `<div class="sponsor-logos">${tournamentLogosList.map(logo => `<img src="${logo}" class="system-logo" />`).join("")}</div>` : ""}
        </div>
        <div class="header-center"><img src="${appIconUrl}" class="app-icon" /></div>
        <div class="header-right">
          ${sponsors.length > 0 ? `<div class="sponsor-logos">${sponsors.map(l => `<img src="${l}" class="sponsor-logo" />`).join("")}</div>` : ""}
        </div>
      </div>
    `;


    let htmlContent = `
      ${logoHeaderHTML}
      <h1 style="text-align:center;text-transform:uppercase;font-size:24px;margin-bottom:5px;">DANH SÁCH VĐV THEO ĐƠN VỊ</h1>
      <h2 style="text-align:center;font-size:16px;color:#000;margin-bottom:20px;font-weight:bold;font-style:italic;">${tournament.name}</h2>
    `;

    delegations.forEach((d) => {
      const allAth = getAllAthletes().filter((a) => a.club?.trim() === d.club);
      if (allAth.length === 0) return;
      htmlContent += `
        <div style="margin-bottom:20px;">
          <h3 style="margin:0 0 10px 0;font-size:16px;display:flex;justify-content:space-between;page-break-after:avoid;">
            <span>${d.club}</span>
            <span style="font-weight:normal;font-size:14px;">(${
              allAth.length
            } VĐV)</span>
          </h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr>
                <th style="border:1px solid #000;padding:6px;width:40px;">STT</th>
                <th style="border:1px solid #000;padding:6px;text-align:left;">Họ tên</th>
                <th style="border:1px solid #000;padding:6px;width:80px;">Giới tính</th>
                <th style="border:1px solid #000;padding:6px;text-align:left;">Hạng mục</th>
                <th style="border:1px solid #000;padding:6px;width:80px;">Cân nặng</th>
              </tr>
            </thead>
            <tbody>
              ${allAth
                .map(
                  (a, i) => `
                <tr style="page-break-inside:avoid;">
                  <td style="border:1px solid #000;padding:6px;text-align:center;">${
                    i + 1
                  }</td>
                  <td style="border:1px solid #000;padding:6px;font-weight:bold;">${
                    a.name
                  }</td>
                  <td style="border:1px solid #000;padding:6px;text-align:center;">${
                    a.gender === "male" ? "Nam" : "Nữ"
                  }</td>
                  <td style="border:1px solid #000;padding:6px;">${
                    a.categoryName
                  }</td>
                  <td style="border:1px solid #000;padding:6px;text-align:center;">${
                    a.weight ? a.weight + "kg" : ""
                  }</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    });

    const styleStr = `
      @page { size: portrait; margin: 10mm; }
      body { font-family: 'Times New Roman', Times, serif; color: #000; }
      .logo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
      .header-left, .header-center, .header-right { flex: 1; display: flex; align-items: center; }
      .header-left { justify-content: flex-start; }
      .header-center { justify-content: center; }
      .header-right { justify-content: flex-end; }
      .system-logo { height: 55px; max-width: 160px; object-fit: contain; }
      .app-icon { height: 60px; width: 60px; object-fit: contain; }
      .sponsor-logos { display: flex; align-items: center; gap: 10px; }
      .sponsor-logo { height: 45px; max-width: 120px; object-fit: contain; }
      .signature-section { margin-top: 40px; display: flex; flex-direction: column; align-items: flex-end; padding-right: 40px; }
      .signature-label { font-size: 14px; font-weight: bold; margin-bottom: 5px; text-align: center; width: 150px; }
      .signature-img { height: 70px; max-width: 180px; object-fit: contain; }
    `;

    printIframeWithLoading(
      `<!DOCTYPE html><html><head><style>${styleStr}</style></head><body>${htmlContent}
      ${(() => {
        const sigs = getTournamentSignatures(sponsorLogos);
        if (sigs.length > 0) {
          return `
            <div class="signature-section">
              <div class="signature-label" style="width: auto; min-width: 150px; text-align: center;">BAN TỔ CHỨC</div>
              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                ${sigs.map(sig => `<img src="${sig}" class="signature-img" style="margin-top: 5px;" />`).join("")}
              </div>
            </div>
          `;
        }
        return "";
      })()}
      </body></html>`
    );
  };

  // ----- FEES EXPORT -----
  const handleExportFeesExcel = () => {
    const summary = getClubFeeSummary();
    const data = summary.map((d, i) => ({
      STT: i + 1,
      "CLB/Đơn vị": d.club,
      "Số VĐV Cá nhân": d.individualCount,
      "Thành tiền (Cá nhân)": d.individualFeeTotal,
      "Số Đội tham gia": d.teamEntries,
      "Thành tiền (Đồng đội)": d.teamFeeTotal,
      "Nội dung thi thêm": d.extraEventsForSurcharge,
      "Thành tiền (Phụ thu)": d.surchargeTotal,
      "Tổng lệ phí": d.totalFee,
      "Tình trạng": feePayments[d.club] ? "Đã đóng" : "Chưa đóng",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Thong Ke Le Phi");
    XLSX.writeFile(wb, `LePhi_${tournament.name.replace(/\s+/g, "_")}.xlsx`);
    toast.success("Đã xuất file Excel Thống kê Lệ phí");
  };

  const handleExportFeesPDF = () => {
    const summary = getClubFeeSummary();
    const totalInd = summary.reduce((s, d) => s + d.individualFeeTotal, 0);
    const totalTeam = summary.reduce((s, d) => s + d.teamFeeTotal, 0);
    const totalSur = summary.reduce((s, d) => s + d.surchargeTotal, 0);
    const totalAll = summary.reduce((s, d) => s + d.totalFee, 0);

    const sponsorLogos = tournament.sponsorLogos || {};

    // Logos HTML using the same method
    const logoUrl = getAppBaseUrl() + "icon.png";
    const appLogoHTML = `<img src="${logoUrl}" class="app-icon" alt="App Logo" />`;
    const getSystemLogoHTML = () => {
      const savedLogosList = getTournamentLogos(sponsorLogos);
      if (savedLogosList.length > 0) {
        return `<div class="sponsor-logos">${savedLogosList.map(logo => `<img src="${logo}" class="system-logo" alt="System Logo" />`).join("")}</div>`;
      }
      return "";
    };
    const getSponsorLogosHTML = () => {
      const sponsors = tournament.sponsorLogos?.sponsors || [];
      if (sponsors.length === 0) return "";
      return sponsors
        .map(
          (logo) =>
            `<img src="${logo}" class="sponsor-logo" alt="Sponsor Logo" />`
        )
        .join("");
    };

    const logoHeaderHTML = `
      <div class="logo-header">
        <div class="header-left">${getSystemLogoHTML()}</div>
        <div class="header-center">${appLogoHTML}</div>
        <div class="header-right"><div class="sponsor-logos">${getSponsorLogosHTML()}</div></div>
      </div>
    `;

    let htmlContent = `
      ${logoHeaderHTML}
      <h1 style="text-align:center;text-transform:uppercase;font-size:24px;margin-bottom:5px;">BẢNG KÊ LỆ PHÍ THAM GIA ĐOÀN</h1>
      <h2 style="text-align:center;font-size:16px;color:#000;margin-bottom:20px;font-weight:bold;font-style:italic;">${tournament.name}</h2>
    `;

    htmlContent += `
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="border:1px solid #000;padding:6px;width:40px;">STT</th>
            <th style="border:1px solid #000;padding:6px;text-align:left;">Đơn vị/CLB</th>
            <th style="border:1px solid #000;padding:6px;text-align:right;">Tổng lệ phí (VNĐ)</th>
            <th style="border:1px solid #000;padding:6px;text-align:center;">Tình trạng</th>
          </tr>
        </thead>
        <tbody>
          ${summary
            .map(
              (d, i) => `
            <tr style="page-break-inside:avoid;">
              <td style="border:1px solid #000;padding:6px;text-align:center;">${
                i + 1
              }</td>
              <td style="border:1px solid #000;padding:6px;font-weight:bold;">${
                d.club
              }</td>
              <td style="border:1px solid #000;padding:6px;text-align:right;">${formatCurrency(
                d.totalFee
              )}</td>
              <td style="border:1px solid #000;padding:6px;text-align:center;color:${
                feePayments[d.club] ? "#059669" : "#dc2626"
              }">
                 ${feePayments[d.club] ? "Đã đóng" : "Chưa đóng"}
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr style="font-weight:bold;background:#f8fafc;">
            <td colspan="2" style="border:1px solid #000;padding:6px;text-align:center;">TỔNG CỘNG</td>
            <td style="border:1px solid #000;padding:6px;text-align:right;">${formatCurrency(
              totalAll
            )}</td>
            <td style="border:1px solid #000;padding:6px;"></td>
          </tr>
        </tfoot>
      </table>
    `;

    const styleStr = `
      @page { size: portrait; margin: 10mm; }
      body { font-family: 'Times New Roman', Times, serif; color: #000; }
      .logo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
      .header-left, .header-center, .header-right { flex: 1; display: flex; align-items: center; }
      .header-left { justify-content: flex-start; }
      .header-center { justify-content: center; }
      .header-right { justify-content: flex-end; }
      .system-logo { height: 55px; max-width: 160px; object-fit: contain; }
      .app-icon { height: 60px; width: 60px; object-fit: contain; }      .sponsor-logos { display: flex; align-items: center; gap: 10px; justify-content: flex-end;}
      .sponsor-logo { height: 45px; max-width: 120px; object-fit: contain; }
      .signature-section { margin-top: 40px; display: flex; flex-direction: column; align-items: flex-end; padding-right: 40px; }
      .signature-label { font-size: 14px; font-weight: bold; margin-bottom: 5px; text-align: center; width: 150px; }
      .signature-img { height: 70px; max-width: 180px; object-fit: contain; }
    `;

    printIframeWithLoading(
      `<!DOCTYPE html><html><head><style>${styleStr}</style></head><body>${htmlContent}
      ${(() => {
        const sigs = getTournamentSignatures(sponsorLogos);
        if (sigs.length > 0) {
          return `
            <div class="signature-section">
              <div class="signature-label" style="width: auto; min-width: 150px; text-align: center;">BAN TỔ CHỨC</div>
              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                ${sigs.map(sig => `<img src="${sig}" class="signature-img" style="margin-top: 5px;" />`).join("")}
              </div>
            </div>
          `;
        }
        return "";
      })()}
      </body></html>`
    );
  };

  // Export delegation stats to PDF (print via iframe)
  const handleExportDelegationPDF = () => {
    const delegations = getClubDelegationSummary();

    // Logos
    const appIconUrl = `${getAppBaseUrl()}icon.png`;
    const sponsorLogos = tournament.sponsorLogos || {};
    const tournamentLogosList = getTournamentLogos(sponsorLogos);
    const sponsors = sponsorLogos.sponsors || [];
    let logoHeaderHTML = `
      <div class="logo-header">
        <div class="header-left">
          ${tournamentLogosList.length > 0 ? `<div class="sponsor-logos">${tournamentLogosList.map(logo => `<img src="${logo}" class="system-logo" />`).join("")}</div>` : ""}
        </div>
        <div class="header-center"><img src="${appIconUrl}" class="app-icon" /></div>
        <div class="header-right">
          ${sponsors.length > 0 ? `<div class="sponsor-logos">${sponsors.map(l => `<img src="${l}" class="sponsor-logo" />`).join("")}</div>` : ""}
        </div>
      </div>
    `;


    const totalTD = delegations.reduce((s, d) => s + d.teamLeaderCount, 0);
    const totalHLV = delegations.reduce((s, d) => s + d.coachCount, 0);
    const totalMale = delegations.reduce((s, d) => s + d.maleCount, 0);
    const totalFemale = delegations.reduce((s, d) => s + d.femaleCount, 0);

    const htmlContent = `
      ${logoHeaderHTML}
      <h1>THỐNG KÊ</h1>
      <h2>${tournament.name}</h2>
      <table>
        <thead>
          <tr>
            <th rowspan="2" style="text-align:center;width:40px">TT</th>
            <th rowspan="2">ĐƠN VỊ</th>
            <th colspan="2" style="text-align:center">CÁN BỘ</th>
            <th colspan="2" style="text-align:center">VĐV</th>
          </tr>
          <tr>
            <th style="text-align:center;width:50px">TĐ</th>
            <th style="text-align:center;width:50px">HLV</th>
            <th style="text-align:center;width:50px">Nam</th>
            <th style="text-align:center;width:50px">Nữ</th>
          </tr>
        </thead>
        <tbody>
          ${delegations
            .map(
              (d, i) => `
            <tr>
              <td style="text-align:center">${i + 1}</td>
              <td>${d.club}</td>
              <td style="text-align:center">${d.teamLeaderCount}</td>
              <td style="text-align:center">${d.coachCount}</td>
              <td style="text-align:center">${d.maleCount}</td>
              <td style="text-align:center">${d.femaleCount}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="font-weight:bold;text-align:center">TỔNG CỘNG</td>
            <td style="text-align:center;font-weight:bold">${totalTD}</td>
            <td style="text-align:center;font-weight:bold">${totalHLV}</td>
            <td style="text-align:center;font-weight:bold">${totalMale}</td>
            <td style="text-align:center;font-weight:bold">${totalFemale}</td>
          </tr>
        </tfoot>
      </table>
    `;
    printIframeWithLoading(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Thống kê - ${tournament.name}</title>
      <style>
        @page { size: portrait; margin: 10mm; }
        body { font-family: 'Times New Roman', Times, serif; color: #000; padding: 20px; }
        h1 { text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }
        h2 { text-align: center; font-size: 16px; font-weight: bold; font-style: italic; color: #000; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th { color: #000; padding: 8px 6px; text-align: left; font-size: 13px; font-weight: bold; border: 1px solid #000; }
        td { padding: 7px 6px; border: 1px solid #000; }
        tfoot td { border: 1px solid #000; font-weight: bold; }
        .logo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .header-left, .header-center, .header-right { flex: 1; display: flex; align-items: center; }
        .header-left { justify-content: flex-start; }
        .header-center { justify-content: center; }
        .header-right { justify-content: flex-end; }
        .system-logo { height: 55px; max-width: 160px; object-fit: contain; }
        .app-icon { height: 60px; width: 60px; object-fit: contain; }
        .sponsor-logos { display: flex; align-items: center; gap: 10px; }
        .sponsor-logo { height: 45px; max-width: 120px; object-fit: contain; }
        .signature-section { margin-top: 40px; display: flex; flex-direction: column; align-items: flex-end; padding-right: 40px; }
        .signature-label { font-size: 14px; font-weight: bold; margin-bottom: 5px; text-align: center; width: 150px; }
        .signature-img { height: 70px; max-width: 180px; object-fit: contain; }
      </style>
    </head><body>
      ${htmlContent}
      ${sponsorLogos.signature ? `
        <div class="signature-section">
          <div class="signature-label">BAN TỔ CHỨC</div>
          <img src="${sponsorLogos.signature}" class="signature-img" />
        </div>
      ` : ""}
    </body></html>`);

  };
  return (
    <div className="page statistics-page">
      {/* PDF Loading Overlay */}
      {isPdfLoading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15,23,42,0.65)",
            backdropFilter: "blur(3px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "36px 48px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              minWidth: "280px",
            }}
          >
            {/* Spinner */}
            <div
              style={{
                width: "52px",
                height: "52px",
                border: "5px solid #e2e8f0",
                borderTopColor: "#3b82f6",
                borderRadius: "50%",
                animation: "pdf-spin 0.8s linear infinite",
              }}
            />
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "17px",
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: "6px",
                }}
              >
                📄 Đang chuẩn bị file PDF...
              </div>
              <div style={{ fontSize: "13px", color: "#64748b" }}>
                Vui lòng chờ, đừng đóng cửa sổ
              </div>
            </div>
          </div>
          <style>{`@keyframes pdf-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <div className="container">
        <nav className="breadcrumb">
          <Link to={`/tournament/${tournament.id}`} className="back-link">
            ← Quay lại
          </Link>
          <span className="breadcrumb-separator">|</span>
          <Link to="/admin">Quản lý giải đấu</Link>
          <span>/</span>
          <Link to={`/tournament/${tournament.id}`}>{tournament.name}</Link>
          <span>/</span>
          <span>Thống kê</span>
        </nav>

        <header className="page-header">
          <div>
            <h1 className="page-title">
              <img src={appIcon} alt="" className="page-title-logo" />
              Thống kê & Bảng tổng sắp
            </h1>
            <p className="page-subtitle">{tournament.name}</p>
          </div>
        </header>

        {/* Tab navigation */}
        <div className="stats-tabs">
          <button
            className={`stats-tab ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            📋 Tổng quan
          </button>
          <button
            className={`stats-tab ${
              activeTab === "delegation" ? "active" : ""
            }`}
            onClick={() => setActiveTab("delegation")}
          >
            🏢 Thống kê đoàn
          </button>
          <button
            className={`stats-tab ${activeTab === "results" ? "active" : ""}`}
            onClick={() => setActiveTab("results")}
          >
            🏆 Kết quả thi đấu
          </button>
          <button
            className={`stats-tab ${activeTab === "medals" ? "active" : ""}`}
            onClick={() => setActiveTab("medals")}
          >
            🥇 Bảng tổng sắp huy chương
          </button>
          <button
            className={`stats-tab ${activeTab === "fees" ? "active" : ""}`}
            onClick={() => setActiveTab("fees")}
          >
            💰 Thống kê lệ phí
          </button>
        </div>

        {/* ===== TAB: OVERVIEW ===== */}
        {activeTab === "overview" && (
          <div className="stats-content">
            <div className="overview-grid">
              <div className="overview-card">
                <div className="overview-card-icon">📋</div>
                <div className="overview-card-value">
                  {tournament.categories.length}
                </div>
                <div className="overview-card-label">Hạng mục thi đấu</div>
              </div>
              <div className="overview-card">
                <div className="overview-card-icon">👥</div>
                <div className="overview-card-value">
                  {getAllAthletes().length}
                </div>
                <div className="overview-card-label">Tổng VĐV (Lượt)</div>
              </div>
              <div className="overview-card">
                <div className="overview-card-icon">👤</div>
                <div className="overview-card-value">
                  {getUniqueAthletesCount()}
                </div>
                <div className="overview-card-label">VĐV Thực Tế (Unique)</div>
              </div>
              <div className="overview-card">
                <div className="overview-card-icon">🏢</div>
                <div className="overview-card-value">{clubs.length}</div>
                <div className="overview-card-label">Câu lạc bộ</div>
              </div>
              <div className="overview-card male">
                <div className="overview-card-icon">♂️</div>
                <div className="overview-card-value">
                  {getGenderCount("male")}
                </div>
                <div className="overview-card-label">Lượt VĐV Nam</div>
              </div>
              <div className="overview-card female">
                <div className="overview-card-icon">♀️</div>
                <div className="overview-card-value">
                  {getGenderCount("female")}
                </div>
                <div className="overview-card-label">Lượt VĐV Nữ</div>
              </div>
              <div className="overview-card">
                <div className="overview-card-icon">✅</div>
                <div className="overview-card-value">
                  {categoriesWithResults.length}
                </div>
                <div className="overview-card-label">Đã có kết quả</div>
              </div>
            </div>

            {clubs.length > 0 && (
              <div className="section-card">
                <h3>🏢 Danh sách CLB ({clubs.length})</h3>
                <div className="club-list">
                  {clubs.map((club) => {
                    const athletesInClub = getAllAthletes().filter(
                      (a) => a.club?.trim() === club
                    );
                    const uniqueAthletes = new Set();
                    const uniqueMale = new Set();
                    const uniqueFemale = new Set();

                    athletesInClub.forEach((a) => {
                      const key = `${(a.name || "").trim().toLowerCase()}_${
                        a.birthDate || a.birthYear || ""
                      }_${a.gender || ""}_${(a.club || "")
                        .trim()
                        .toLowerCase()}`;
                      uniqueAthletes.add(key);
                      if (a.gender === "male") uniqueMale.add(key);
                      if (a.gender === "female") uniqueFemale.add(key);
                    });

                    return (
                      <div key={club} className="club-item">
                        <span className="club-name">{club}</span>
                        <div
                          className="club-stats"
                          title={`Lượt: ${athletesInClub.length} | Nam: ${
                            athletesInClub.filter((a) => a.gender === "male")
                              .length
                          } | Nữ: ${
                            athletesInClub.filter((a) => a.gender === "female")
                              .length
                          }`}
                        >
                          <span className="club-stat">
                            {uniqueAthletes.size} VĐV
                          </span>
                          <span className="club-stat male">
                            ♂ {uniqueMale.size}
                          </span>
                          <span className="club-stat female">
                            ♀ {uniqueFemale.size}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="section-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>🏅 Dự tính huy chương</h3>
                <div style={{ display: 'flex', gap: '15px', fontSize: '13px', color: '#475569', background: '#f1f5f9', padding: '6px 12px', borderRadius: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    Số HC Kata ĐĐ/đội:
                    <input
                      type="number"
                      min="1"
                      value={tournament.teamMedalsSettings?.kata || 3}
                      onChange={(e) => {
                        dispatch({
                          type: ACTIONS.UPDATE_TOURNAMENT,
                          payload: {
                            id: tournament.id,
                            teamMedalsSettings: {
                              ...(tournament.teamMedalsSettings || {}),
                              kata: parseInt(e.target.value) || 3
                            }
                          }
                        });
                      }}
                      style={{ width: '45px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    Số HC Kumite ĐĐ/đội:
                    <input
                      type="number"
                      min="1"
                      value={tournament.teamMedalsSettings?.kumite || 5}
                      onChange={(e) => {
                        dispatch({
                          type: ACTIONS.UPDATE_TOURNAMENT,
                          payload: {
                            id: tournament.id,
                            teamMedalsSettings: {
                              ...(tournament.teamMedalsSettings || {}),
                              kumite: parseInt(e.target.value) || 5
                            }
                          }
                        });
                      }}
                      style={{ width: '45px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'center' }}
                    />
                  </label>
                </div>
              </div>
              <div className="medal-items">
                <div className="medal-item gold">
                  <span className="medal-icon">🥇</span>
                  <span className="medal-count">{medals.gold}</span>
                  <span className="medal-label">HCV</span>
                </div>
                <div className="medal-item silver">
                  <span className="medal-icon">🥈</span>
                  <span className="medal-count">{medals.silver}</span>
                  <span className="medal-label">HCB</span>
                </div>
                <div className="medal-item bronze">
                  <span className="medal-icon">🥉</span>
                  <span className="medal-count">{medals.bronze}</span>
                  <span className="medal-label">HCĐ</span>
                </div>
                <div className="medal-item total">
                  <span className="medal-icon">🏆</span>
                  <span className="medal-count">{medals.total}</span>
                  <span className="medal-label">Tổng</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB: DELEGATION STATISTICS ===== */}
        {activeTab === "delegation" && (
          <div className="stats-content">
            <div className="results-actions" style={{ marginBottom: "16px" }}>
              <button
                className="btn btn-secondary"
                onClick={handleExportDelegation}
              >
                📤 Xuất Excel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExportDelegationPDF}
              >
                📄 Xuất PDF
              </button>
            </div>

            {/* Official Statistics Table */}
            <div className="section-card">
              <h3
                style={{
                  textAlign: "center",
                  fontSize: "18px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  marginBottom: "2px",
                }}
              >
                THỐNG KÊ
              </h3>
              <p
                style={{
                  textAlign: "center",
                  fontSize: "14px",
                  fontWeight: 600,
                  fontStyle: "italic",
                  color: "#334155",
                  marginBottom: "16px",
                }}
              >
                {tournament.name}
              </p>
              <div className="table-responsive">
                <table className="stats-table delegation-table">
                  <thead>
                    <tr>
                      <th
                        rowSpan={2}
                        style={{
                          textAlign: "center",
                          verticalAlign: "middle",
                          width: "40px",
                        }}
                      >
                        TT
                      </th>
                      <th rowSpan={2} style={{ verticalAlign: "middle" }}>
                        ĐƠN VỊ
                      </th>
                      <th
                        colSpan={2}
                        style={{
                          textAlign: "center",
                          background: "#f59e0b",
                          color: "#000",
                          borderBottom: "1px solid #d97706",
                        }}
                      >
                        CÁN BỘ
                      </th>
                      <th
                        colSpan={2}
                        style={{
                          textAlign: "center",
                          background: "#22c55e",
                          color: "#fff",
                          borderBottom: "1px solid #16a34a",
                        }}
                      >
                        VĐV
                      </th>
                    </tr>
                    <tr>
                      <th
                        style={{
                          textAlign: "center",
                          background: "#fbbf24",
                          color: "#000",
                          width: "55px",
                        }}
                      >
                        TĐ
                      </th>
                      <th
                        style={{
                          textAlign: "center",
                          background: "#fbbf24",
                          color: "#000",
                          width: "55px",
                        }}
                      >
                        HLV
                      </th>
                      <th
                        style={{
                          textAlign: "center",
                          background: "#4ade80",
                          color: "#000",
                          width: "60px",
                        }}
                      >
                        Nam
                      </th>
                      <th
                        style={{
                          textAlign: "center",
                          background: "#4ade80",
                          color: "#000",
                          width: "60px",
                        }}
                      >
                        Nữ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {getClubDelegationSummary().map((d, i) => (
                      <tr key={d.club}>
                        <td style={{ textAlign: "center" }}>{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>{d.club}</td>
                        <td style={{ textAlign: "center" }}>
                          {d.teamLeaderCount}
                        </td>
                        <td style={{ textAlign: "center" }}>{d.coachCount}</td>
                        <td style={{ textAlign: "center", fontWeight: 600 }}>
                          {d.maleCount}
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 600 }}>
                          {d.femaleCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700, background: "#fef9c3" }}>
                      <td
                        colSpan={2}
                        style={{ textAlign: "center", fontWeight: 800 }}
                      >
                        TỔNG CỘNG
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {getClubDelegationSummary().reduce(
                          (s, d) => s + d.teamLeaderCount,
                          0
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {getClubDelegationSummary().reduce(
                          (s, d) => s + d.coachCount,
                          0
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {getClubDelegationSummary().reduce(
                          (s, d) => s + d.maleCount,
                          0
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {getClubDelegationSummary().reduce(
                          (s, d) => s + d.femaleCount,
                          0
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Detailed Club Registration Info (editable) */}
            <div className="section-card" style={{ marginTop: "20px" }}>
              <h3>📝 Chi tiết thông tin đoàn ({clubs.length} CLB)</h3>
              <p
                style={{
                  color: "#64748b",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                Nhấn "✏️" để chỉnh sửa tên Trưởng đoàn & HLV cho từng CLB.
              </p>
              <div className="table-responsive">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>STT</th>
                      <th>CLB/Đơn vị</th>
                      <th>Trưởng đoàn</th>
                      <th>HLV</th>
                      <th style={{ textAlign: "center" }}>VĐV Nam</th>
                      <th style={{ textAlign: "center" }}>VĐV Nữ</th>
                      <th style={{ textAlign: "center" }}>Tổng VĐV</th>
                      <th style={{ textAlign: "center", width: "120px" }}>Thời gian nộp</th>
                      <th style={{ width: "60px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {getClubDelegationSummary().map((d, i) => (
                      <tr key={d.club}>
                        <td style={{ textAlign: "center" }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{d.club}</td>
                        <td>
                          {editingClubReg === d.club ? (
                            <input
                              type="text"
                              value={clubRegForm.teamLeader}
                              onChange={(e) =>
                                setClubRegForm({
                                  ...clubRegForm,
                                  teamLeader: e.target.value,
                                })
                              }
                              placeholder="Tên trưởng đoàn"
                              style={{
                                width: "100%",
                                fontSize: "13px",
                                padding: "4px 6px",
                              }}
                            />
                          ) : (
                            d.teamLeader || (
                              <span
                                style={{
                                  color: "#94a3b8",
                                  fontStyle: "italic",
                                }}
                              >
                                Chưa có
                              </span>
                            )
                          )}
                        </td>
                        <td>
                          {editingClubReg === d.club ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                              }}
                            >
                              {clubRegForm.coaches.map((c, ci) => (
                                <div
                                  key={ci}
                                  style={{ display: "flex", gap: "4px" }}
                                >
                                  <input
                                    type="text"
                                    value={c}
                                    onChange={(e) => {
                                      const updated = [...clubRegForm.coaches];
                                      updated[ci] = e.target.value;
                                      setClubRegForm({
                                        ...clubRegForm,
                                        coaches: updated,
                                      });
                                    }}
                                    placeholder={`HLV ${ci + 1}`}
                                    style={{
                                      flex: 1,
                                      fontSize: "13px",
                                      padding: "4px 6px",
                                    }}
                                  />
                                  {clubRegForm.coaches.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated =
                                          clubRegForm.coaches.filter(
                                            (_, j) => j !== ci
                                          );
                                        setClubRegForm({
                                          ...clubRegForm,
                                          coaches: updated,
                                        });
                                      }}
                                      style={{
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        color: "#ef4444",
                                        fontSize: "14px",
                                      }}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ))}
                              {clubRegForm.coaches.length < 3 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setClubRegForm({
                                      ...clubRegForm,
                                      coaches: [...clubRegForm.coaches, ""],
                                    })
                                  }
                                  style={{
                                    fontSize: "11px",
                                    padding: "2px 6px",
                                    border: "1px dashed #94a3b8",
                                    background: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    color: "#64748b",
                                  }}
                                >
                                  + Thêm HLV
                                </button>
                              )}
                            </div>
                          ) : d.coaches.length > 0 ? (
                            d.coaches.join(", ")
                          ) : (
                            <span
                              style={{ color: "#94a3b8", fontStyle: "italic" }}
                            >
                              Chưa có
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center", color: "#3b82f6" }}>
                          {d.maleCount}
                        </td>
                        <td style={{ textAlign: "center", color: "#ec4899" }}>
                          {d.femaleCount}
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 600 }}>
                          {d.athleteCount}
                        </td>
                        <td style={{ textAlign: "center", fontStyle: "italic", fontSize: "11px", color: "#64748b" }}>
                          {d.submittedAt || "—"}
                        </td>
                        <td>
                          {editingClubReg === d.club ? (
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button
                                className="btn btn-sm"
                                style={{
                                  background: "#22c55e",
                                  color: "#fff",
                                  border: "none",
                                  padding: "4px 8px",
                                  fontSize: "12px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                                onClick={handleSaveClubReg}
                                title="Lưu lại"
                              >
                                ✔
                              </button>
                              <button
                                className="btn btn-sm"
                                style={{
                                  background: "#f1f5f9",
                                  color: "#64748b",
                                  border: "1px solid #e2e8f0",
                                  padding: "4px 8px",
                                  fontSize: "12px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                                onClick={() => setEditingClubReg(null)}
                                title="Hủy bỏ"
                              >
                                ✕
                              </button>
                              <button
                                className="btn btn-sm"
                                style={{
                                  background: "#ef4444",
                                  color: "#fff",
                                  border: "none",
                                  padding: "4px 8px",
                                  fontSize: "12px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                                onClick={handleDeleteClubReg}
                                title="Xóa toàn bộ đoàn bộ này"
                              >
                                🗑
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-sm"
                              style={{
                                background: "#3b82f6",
                                color: "#fff",
                                border: "none",
                                padding: "4px 8px",
                                fontSize: "12px",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                              onClick={() => handleEditClubReg(d.club)}
                              title="Chỉnh sửa Ban huấn luyện"
                            >
                              ✏️
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Athletes by Category */}
            <div className="section-card" style={{ marginTop: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <h3>
                  📋 Danh sách VĐV theo hạng mục ({tournament.categories.length}
                  )
                </h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={handleExportAthsByCatExcel}
                  >
                    📤 Xuất Excel ({selectedDelegationCategories.size})
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleExportAthsByCatPDF}
                  >
                    📄 Xuất PDF ({selectedDelegationCategories.size})
                  </button>
                </div>
              </div>

              <div
                style={{ marginBottom: "12px", display: "flex", gap: "8px" }}
              >
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    setSelectedDelegationCategories(
                      new Set(tournament.categories.map((c) => c.id))
                    )
                  }
                  style={{ background: "#f1f5f9", border: "1px solid #cbd5e1" }}
                >
                  Chọn tất cả
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setSelectedDelegationCategories(new Set())}
                  style={{ background: "#f1f5f9", border: "1px solid #cbd5e1" }}
                >
                  Bỏ chọn tất cả
                </button>
              </div>

              {tournament.categories.map((cat) => {
                const athletes = cat.athletes || [];
                if (athletes.length === 0) return null;
                const isSelected = selectedDelegationCategories.has(cat.id);

                return (
                  <div
                    key={cat.id}
                    style={{
                      marginBottom: "16px",
                      opacity: isSelected ? 1 : 0.6,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <h4
                      style={{
                        fontSize: "14px",
                        color: "#1e293b",
                        marginBottom: "8px",
                        padding: "6px 10px",
                        background: isSelected ? "#eff6ff" : "#f8fafc",
                        borderRadius: "6px",
                        borderLeft: `3px solid ${
                          isSelected ? "#3b82f6" : "#cbd5e1"
                        }`,
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        const newSet = new Set(selectedDelegationCategories);
                        if (isSelected) newSet.delete(cat.id);
                        else newSet.add(cat.id);
                        setSelectedDelegationCategories(newSet);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        style={{
                          marginRight: "10px",
                          width: "16px",
                          height: "16px",
                          cursor: "pointer",
                        }}
                      />
                      {cat.name}
                      <span
                        style={{
                          color: "#64748b",
                          fontWeight: 400,
                          marginLeft: "8px",
                        }}
                      >
                        ({athletes.length} VĐV -{" "}
                        {cat.type === "kumite" ? "Kumite" : "Kata"} -{" "}
                        {cat.gender === "male"
                          ? "Nam"
                          : cat.gender === "female"
                          ? "Nữ"
                          : "Hỗn hợp"}
                        )
                      </span>
                    </h4>
                    {isSelected && (
                      <div className="table-responsive">
                        <table
                          className="stats-table"
                          style={{ fontSize: "13px" }}
                        >
                          <thead>
                            <tr>
                              <th style={{ width: "40px" }}>STT</th>
                              <th>Họ tên</th>
                              <th>Giới tính</th>
                              <th>CLB</th>
                              {cat.type === "kumite" && <th>Cân nặng</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {athletes.map((a, idx) => (
                              <tr key={a.id || idx}>
                                <td>{idx + 1}</td>
                                <td style={{ fontWeight: 500 }}>{a.name}</td>
                                <td>{a.gender === "male" ? "Nam" : "Nữ"}</td>
                                <td>{a.club || "-"}</td>
                                {cat.type === "kumite" && (
                                  <td>{a.weight ? `${a.weight}kg` : "-"}</td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Athletes by Club */}
            <div className="section-card" style={{ marginTop: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <h3>🏢 Danh sách VĐV theo Đơn vị / CLB ({clubs.length})</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={handleExportAthsByClubExcel}
                  >
                    📤 Xuất Excel ({selectedDelegationClubs.size})
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleExportAthsByClubPDF}
                  >
                    📄 Xuất PDF ({selectedDelegationClubs.size})
                  </button>
                </div>
              </div>

              <div
                style={{ marginBottom: "12px", display: "flex", gap: "8px" }}
              >
                <button
                  className="btn btn-sm"
                  onClick={() => setSelectedDelegationClubs(new Set(clubs))}
                  style={{ background: "#f1f5f9", border: "1px solid #cbd5e1" }}
                >
                  Chọn tất cả
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setSelectedDelegationClubs(new Set())}
                  style={{ background: "#f1f5f9", border: "1px solid #cbd5e1" }}
                >
                  Bỏ chọn tất cả
                </button>
              </div>

              {clubs.map((club) => {
                const allAth = getAllAthletes().filter(
                  (a) => a.club?.trim() === club
                );
                if (allAth.length === 0) return null;
                const isSelected = selectedDelegationClubs.has(club);

                return (
                  <div
                    key={club}
                    style={{
                      marginBottom: "16px",
                      opacity: isSelected ? 1 : 0.6,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <h4
                      style={{
                        fontSize: "14px",
                        color: "#1e293b",
                        marginBottom: "8px",
                        padding: "6px 10px",
                        background: isSelected ? "#fefce8" : "#f8fafc",
                        borderRadius: "6px",
                        borderLeft: `3px solid ${
                          isSelected ? "#eab308" : "#cbd5e1"
                        }`,
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        const newSet = new Set(selectedDelegationClubs);
                        if (isSelected) newSet.delete(club);
                        else newSet.add(club);
                        setSelectedDelegationClubs(newSet);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        style={{
                          marginRight: "10px",
                          width: "16px",
                          height: "16px",
                          cursor: "pointer",
                        }}
                      />
                      {club}
                      <span
                        style={{
                          color: "#64748b",
                          fontWeight: 400,
                          marginLeft: "8px",
                        }}
                      >
                        ({allAth.length} VĐV)
                      </span>
                    </h4>
                    {isSelected && (
                      <div className="table-responsive">
                        <table
                          className="stats-table"
                          style={{ fontSize: "13px" }}
                        >
                          <thead>
                            <tr>
                              <th style={{ width: "40px" }}>STT</th>
                              <th>Họ tên</th>
                              <th>Giới tính</th>
                              <th>Hạng mục</th>
                              <th>Cân nặng</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allAth.map((a, idx) => (
                              <tr key={a.id || idx}>
                                <td>{idx + 1}</td>
                                <td style={{ fontWeight: 500 }}>{a.name}</td>
                                <td>{a.gender === "male" ? "Nam" : "Nữ"}</td>
                                <td>{a.categoryName}</td>
                                <td>{a.weight ? `${a.weight}kg` : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== TAB: LỆ PHÍ ===== */}
        {activeTab === "fees" && (
          <div className="stats-content">
            <div className="section-card" style={{ marginBottom: "20px" }}>
              <h3>⚙️ Cài đặt Mức lệ phí</h3>
              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  flexWrap: "wrap",
                  marginTop: "16px",
                }}
              >
                <div
                  className="form-group"
                  style={{ flex: 1, minWidth: "200px" }}
                >
                  <label>Lệ phí cá nhân (VNĐ/người)</label>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={feeSettings.individualFee}
                    onChange={(e) =>
                      handleFeeSettingsChange(
                        "individualFee",
                        parseInt(e.target.value) || 0
                      )
                    }
                    className="form-input"
                  />
                </div>
                <div
                  className="form-group"
                  style={{ flex: 1, minWidth: "200px" }}
                >
                  <label>Lệ phí đồng đội/hỗn hợp (VNĐ/đội)</label>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={feeSettings.teamFee}
                    onChange={(e) =>
                      handleFeeSettingsChange(
                        "teamFee",
                        parseInt(e.target.value) || 0
                      )
                    }
                    className="form-input"
                  />
                </div>
                <div
                  className="form-group"
                  style={{
                    flex: 1,
                    minWidth: "200px",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={feeSettings.enableSurcharge}
                      onChange={(e) =>
                        handleFeeSettingsChange(
                          "enableSurcharge",
                          e.target.checked
                        )
                      }
                    />
                    Phụ thu VĐV thi &ge; 2 nội dung
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={feeSettings.surchargeFee}
                    onChange={(e) =>
                      handleFeeSettingsChange(
                        "surchargeFee",
                        parseInt(e.target.value) || 0
                      )
                    }
                    className="form-input"
                    disabled={!feeSettings.enableSurcharge}
                  />
                  <small style={{ color: "#64748b", marginTop: "4px" }}>
                    Mức cộng thêm cho mỗi nội dung thứ 2 trở lên.
                  </small>
                </div>
              </div>
            </div>

            <div 
              className={`section-card ${activeHint === "check_fees" ? "hint-pulse" : ""}`}
              data-hint="BƯỚC 1: XEM LỆ PHÍ"
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <h3>💰 Bảng kê lệ phí theo CLB/Đoàn</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={handleExportFeesExcel}
                  >
                    📤 Xuất Excel
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleExportFeesPDF}
                  >
                    📄 Xuất PDF
                  </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>STT</th>
                      <th>CLB/Đơn vị</th>
                      <th style={{ textAlign: "center" }}>Số VĐV Cá nhân</th>
                      <th style={{ textAlign: "center" }}>Số Đội tham gia</th>
                      <th style={{ textAlign: "center" }}>
                        Nội dung cá nhân thi thêm
                      </th>
                      <th style={{ textAlign: "right" }}>Tổng lệ phí đóng</th>
                      <th style={{ textAlign: "center" }}>Tình trạng đóng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getClubFeeSummary().map((d, i) => (
                      <tr key={d.club}>
                        <td style={{ textAlign: "center" }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{d.club}</td>
                        <td style={{ textAlign: "center" }}>
                          {d.individualCount} <br />
                          <small style={{ color: "#94a3b8" }}>
                            {formatCurrency(d.individualFeeTotal)}
                          </small>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {d.teamEntries} <br />
                          <small style={{ color: "#94a3b8" }}>
                            {formatCurrency(d.teamFeeTotal)}
                          </small>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {d.extraEventsForSurcharge} <br />
                          <small style={{ color: "#94a3b8" }}>
                            {formatCurrency(d.surchargeTotal)}
                          </small>
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: "bold",
                            color: "#b91c1c",
                          }}
                        >
                          {formatCurrency(d.totalFee)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => handleTogglePayment(d.club)}
                            style={{
                              background: feePayments[d.club]
                                ? "#ecfdf5"
                                : "#fef2f2",
                              color: feePayments[d.club]
                                ? "#059669"
                                : "#dc2626",
                              border: `1px solid ${
                                feePayments[d.club] ? "#34d399" : "#f87171"
                              }`,
                              fontWeight: 600,
                              padding: "4px 8px",
                              borderRadius: "4px",
                              cursor: "pointer",
                              minWidth: "85px",
                            }}
                          >
                            {feePayments[d.club] ? "Đã đóng" : "Chưa đóng"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    {(() => {
                      const summary = getClubFeeSummary();
                      const totalInd = summary.reduce(
                        (s, d) => s + d.individualFeeTotal,
                        0
                      );
                      const totalTeam = summary.reduce(
                        (s, d) => s + d.teamFeeTotal,
                        0
                      );
                      const totalSur = summary.reduce(
                        (s, d) => s + d.surchargeTotal,
                        0
                      );
                      const totalAll = summary.reduce(
                        (s, d) => s + d.totalFee,
                        0
                      );

                      return (
                        <tr
                          style={{
                            background: "#f8fafc",
                            borderTop: "2px solid #cbd5e1",
                          }}
                        >
                          <td
                            colSpan={2}
                            style={{ textAlign: "center", fontWeight: "bold" }}
                          >
                            TỔNG CỘNG
                          </td>
                          <td
                            style={{ textAlign: "center", fontWeight: "bold" }}
                          >
                            {summary.reduce((s, d) => s + d.individualCount, 0)}{" "}
                            <br />
                            <span
                              style={{ color: "#94a3b8", fontSize: "12px" }}
                            >
                              {formatCurrency(totalInd)}
                            </span>
                          </td>
                          <td
                            style={{ textAlign: "center", fontWeight: "bold" }}
                          >
                            {summary.reduce((s, d) => s + d.teamEntries, 0)}{" "}
                            <br />
                            <span
                              style={{ color: "#94a3b8", fontSize: "12px" }}
                            >
                              {formatCurrency(totalTeam)}
                            </span>
                          </td>
                          <td
                            style={{ textAlign: "center", fontWeight: "bold" }}
                          >
                            {summary.reduce(
                              (s, d) => s + d.extraEventsForSurcharge,
                              0
                            )}{" "}
                            <br />
                            <span
                              style={{ color: "#94a3b8", fontSize: "12px" }}
                            >
                              {formatCurrency(totalSur)}
                            </span>
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              color: "#b91c1c",
                              fontSize: "16px",
                              fontWeight: "bold",
                            }}
                          >
                            {formatCurrency(totalAll)}
                          </td>
                          <td
                            style={{ textAlign: "center", fontWeight: "bold" }}
                          >
                            <span style={{ color: "#059669" }}>
                              {formatCurrency(
                                summary.reduce(
                                  (s, d) =>
                                    s + (feePayments[d.club] ? d.totalFee : 0),
                                  0
                                )
                              )}
                            </span>
                            <br />
                            <span
                              style={{ color: "#dc2626", fontSize: "12px" }}
                            >
                              Còn nợ:{" "}
                              {formatCurrency(
                                summary.reduce(
                                  (s, d) =>
                                    s + (!feePayments[d.club] ? d.totalFee : 0),
                                  0
                                )
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB: RESULTS ===== */}
        {activeTab === "results" && (
          <div className="stats-content">
            <div className="filter-bar">
              <div className="filter-group">
                <label>Loại:</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">Tất cả</option>
                  <option value="kata">Kata</option>
                  <option value="kumite">Kumite</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Giới tính:</label>
                <select
                  value={filterGender}
                  onChange={(e) => setFilterGender(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">Tất cả</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Buổi:</label>
                <select
                  value={filterSession}
                  onChange={(e) => setFilterSession(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">Tất cả</option>
                  {scheduleSessions.map((s) => (
                    <option key={s} value={s}>
                      {getScheduleSessionLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>Đơn vị/CLB:</label>
                <select
                  value={filterClub}
                  onChange={(e) => setFilterClub(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">Tất cả</option>
                  {getClubs().map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="search-filter">
                <input
                  type="text"
                  placeholder="🔍 Tìm kiếm hạng mục..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {(filterType !== "all" ||
                filterGender !== "all" ||
                filterSession !== "all" ||
                filterClub !== "all" ||
                searchQuery !== "") && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setFilterType("all");
                    setFilterGender("all");
                    setFilterSession("all");
                    setFilterClub("all");
                    setSearchQuery("");
                  }}
                >
                  ✕ Xóa lọc
                </button>
              )}
            </div>
            <div className="results-actions">
              <button
                className="btn btn-secondary"
                onClick={handleExportResults}
              >
                📤 Xuất Excel
              </button>
              <button
                className="btn btn-secondary"
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  border: "1px solid #fde68a",
                }}
                onClick={handleExportBySession}
              >
                📤 Xuất theo bộ lọc ({filteredCategories.length})
              </button>
              <button
                className="btn btn-secondary"
                style={{ background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd" }}
                onClick={() => handleExportResultsByClubExcel(filterClub !== "all" ? [filterClub] : null)}
              >
                🏢 Kết quả CLB (Excel)
              </button>
              <button
                className="btn btn-secondary"
                style={{ background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd" }}
                onClick={() => handleExportResultsByClubPDF(filterClub !== "all" ? [filterClub] : null)}
              >
                🏢 Kết quả CLB (PDF)
              </button>
              {selectedForExport.size > 0 && (
                <div style={{ position: "relative", display: "inline-block" }}>
                  <button
                    className="btn btn-sm"
                    style={{
                      background: "#dcfce7",
                      color: "#16a34a",
                      border: "1px solid #86efac",
                      fontWeight: 700,
                    }}
                    onClick={() => setShowExportMenu(!showExportMenu)}
                  >
                    ✅ Xuất {selectedForExport.size} đã chọn ▾
                  </button>
                  {showExportMenu && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        zIndex: 100,
                        marginTop: "4px",
                        background: "#fff",
                        borderRadius: "8px",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                        border: "1px solid #e2e8f0",
                        overflow: "hidden",
                        minWidth: "180px",
                      }}
                    >
                      <button
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 16px",
                          border: "none",
                          background: "none",
                          textAlign: "left",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#16a34a",
                        }}
                        onMouseOver={(e) =>
                          (e.currentTarget.style.background = "#f0fdf4")
                        }
                        onMouseOut={(e) =>
                          (e.currentTarget.style.background = "none")
                        }
                        onClick={() => {
                          const cats = tournament.categories.filter((c) =>
                            selectedForExport.has(c.id)
                          );
                          const data = cats.map((cat) => {
                            const result = getCategoryResults(cat.id);
                            return {
                              "Hạng mục": cat.name,
                              Loại: cat.type === "kumite" ? "Kumite" : "Kata",
                              "Giới tính":
                                cat.gender === "male"
                                  ? "Nam"
                                  : cat.gender === "female"
                                  ? "Nữ"
                                  : "Hỗn hợp",
                              HCV: result?.first || "",
                              "CLB HCV": result?.club1 || "",
                              "Thành viên HCV":
                                getTeamMemberNames(cat, result?.first) ||
                                getTeamMemberNames(cat, result?.club1) ||
                                "",
                              HCB: result?.second || "",
                              "CLB HCB": result?.club2 || "",
                              "Thành viên HCB":
                                getTeamMemberNames(cat, result?.second) ||
                                getTeamMemberNames(cat, result?.club2) ||
                                "",
                              "HCĐ 1": result?.third1 || "",
                              "CLB HCĐ 1": result?.club3a || "",
                              "Thành viên HCĐ 1":
                                getTeamMemberNames(cat, result?.third1) ||
                                getTeamMemberNames(cat, result?.club3a) ||
                                "",
                              "HCĐ 2": result?.third2 || "",
                              "CLB HCĐ 2": result?.club3b || "",
                              "Thành viên HCĐ 2":
                                getTeamMemberNames(cat, result?.third2) ||
                                getTeamMemberNames(cat, result?.club3b) ||
                                "",
                            };
                          });
                          if (!data.length) return;
                          const ws = XLSX.utils.json_to_sheet(data);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "Kết quả chọn");
                          const colWidths = Object.keys(data[0]).map((key) => ({
                            wch:
                              Math.max(
                                key.length,
                                ...data.map(
                                  (r) => (r[key] || "").toString().length
                                )
                              ) + 2,
                          }));
                          ws["!cols"] = colWidths;
                          XLSX.writeFile(
                            wb,
                            `KetQua_DaChon_${selectedForExport.size}.xlsx`
                          );
                          toast.success(
                            `Đã xuất ${selectedForExport.size} nội dung ra Excel!`
                          );
                          setShowExportMenu(false);
                        }}
                      >
                        📤 Xuất Excel
                      </button>
                      <div style={{ height: "1px", background: "#e2e8f0" }} />
                      <button
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "10px 16px",
                          border: "none",
                          background: "none",
                          textAlign: "left",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#2563eb",
                        }}
                        onMouseOver={(e) =>
                          (e.currentTarget.style.background = "#eff6ff")
                        }
                        onMouseOut={(e) =>
                          (e.currentTarget.style.background = "none")
                        }
                        onClick={() => {
                          const cats = tournament.categories.filter((c) =>
                            selectedForExport.has(c.id)
                          );
                          let rows = "";
                          cats.forEach((cat, idx) => {
                            const r = getCategoryResults(cat.id);
                            rows += `<tr>
                              <td>${idx + 1}</td>
                              <td><strong>${cat.name}</strong></td>
                              <td>${getMedalCellHTML(
                                cat,
                                r?.first,
                                r?.club1
                              )}</td>
                              <td>${getMedalCellHTML(
                                cat,
                                r?.second,
                                r?.club2
                              )}</td>
                              <td>${getMedalCellHTML(
                                cat,
                                r?.third1,
                                r?.club3a
                              )}</td>
                              <td>${getMedalCellHTML(
                                cat,
                                r?.third2,
                                r?.club3b
                              )}</td>
                            </tr>`;
                          });
                          const appIconUrl = `${getAppBaseUrl()}icon.png`;
                          const sponsorLogos = tournament.sponsorLogos || {};
                          const tournamentLogosList = getTournamentLogos(sponsorLogos);
                          const sponsors = sponsorLogos.sponsors || [];
                          const logoHeaderHTML = `
                            <div class="logo-header">
                              <div class="header-left">
                                ${tournamentLogosList.length > 0 ? `<div class="sponsor-logos">${tournamentLogosList.map(logo => `<img src="${logo}" class="system-logo" />`).join("")}</div>` : ""}
                              </div>
                              <div class="header-center"><img src="${appIconUrl}" class="app-icon" /></div>
                              <div class="header-right">
                                ${sponsors.length > 0 ? `<div class="sponsor-logos">${sponsors.map(l => `<img src="${l}" class="sponsor-logo" />`).join("")}</div>` : ""}
                              </div>
                            </div>
                          `;

                          printIframeWithLoading(`<!DOCTYPE html><html><head>
                            <meta charset="utf-8"/><title>Kết quả thi đấu</title>
                            <style>
                              @page { size: portrait; margin: 10mm; }
                              body { font-family: Arial, sans-serif; padding: 20px; }
                              .logo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
                              .header-left, .header-center, .header-right { flex: 1; display: flex; align-items: center; }
                              .header-left { justify-content: flex-start; }
                              .header-center { justify-content: center; }
                              .header-right { justify-content: flex-end; }
                              .system-logo { height: 55px; max-width: 160px; object-fit: contain; }
                              .app-icon { height: 60px; width: 60px; object-fit: contain; }
                              .sponsor-logos { display: flex; align-items: center; gap: 10px; }
                              .sponsor-logo { height: 45px; max-width: 120px; object-fit: contain; }
                              h1 { text-align: center; font-size: 20px; margin-bottom: 4px; }
                              h2 { text-align: center; font-size: 14px; color: #64748b; font-weight: normal; margin-bottom: 16px; }
                              table { width: 100%; border-collapse: collapse; font-size: 12px; }
                              th { background: #1e3a5f; color: white; padding: 8px 6px; text-align: left; font-size: 11px; }
                              td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
                              tr:nth-child(even) { background: #f8fafc; }
                              small { color: #64748b; font-size: 10px; }
                            </style>
                          </head><body>
                            ${logoHeaderHTML}
                            <h1>KẾT QUẢ THI ĐẤU</h1>
                            <h2>${tournament.name} — ${selectedForExport.size} nội dung</h2>
                            <table><thead><tr>
                              <th>#</th><th>Hạng mục</th>
                              <th>🥇 HCV</th><th>🥈 HCB</th><th>🥉 HCĐ (1)</th><th>🥉 HCĐ (2)</th>
                            </tr></thead><tbody>${rows}</tbody></table>
                            ${(() => {
                              const sigs = getTournamentSignatures(sponsorLogos);
                              if (sigs.length > 0) {
                                return `
                                  <div class="signature-section" style="margin-top: 40px; display: flex; flex-direction: column; align-items: flex-end; padding-right: 40px;">
                                    <div class="signature-label" style="font-size: 14px; font-weight: bold; margin-bottom: 5px; text-align: center; width: 150px;">BAN TỔ CHỨC</div>
                                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                                      ${sigs.map(sig => `<img src="${sig}" style="height: 70px; max-width: 180px; object-fit: contain; margin-top: 5px;" />`).join("")}
                                    </div>
                                  </div>
                                `;
                              }
                              return "";
                            })()}
                          </body></html>`);

                          setShowExportMenu(false);
                        }}
                      >
                        📄 Xuất PDF
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => handleExportPDF("results")}
              >
                📄 Xuất PDF
              </button>{" "}
              <label className="btn btn-primary" style={{ cursor: "pointer" }}>
                📥 Import kết quả từ Excel
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  onChange={handleImportResults}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            <div className="results-table-wrapper">
              <table className="results-table">
                <thead>
                  <tr>
                    <th style={{ width: "30px" }}>
                      <input
                        type="checkbox"
                        checked={
                          filteredCategories.length > 0 &&
                          filteredCategories.every((c) =>
                            selectedForExport.has(c.id)
                          )
                        }
                        onChange={(e) => {
                          const newSet = new Set(selectedForExport);
                          filteredCategories.forEach((c) =>
                            e.target.checked
                              ? newSet.add(c.id)
                              : newSet.delete(c.id)
                          );
                          setSelectedForExport(newSet);
                        }}
                        title="Chọn tất cả"
                      />
                    </th>
                    <th>#</th>
                    <th>Hạng mục</th>
                    <th>Loại</th>
                    <th>🥇 HCV</th>
                    <th>🥈 HCB</th>
                    <th>🥉 HCĐ (1)</th>
                    <th>🥉 HCĐ (2)</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((cat, idx) => {
                    const result = getCategoryResults(cat.id);
                    return (
                      <tr key={cat.id} className={result ? "has-result" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedForExport.has(cat.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedForExport);
                              e.target.checked
                                ? newSet.add(cat.id)
                                : newSet.delete(cat.id);
                              setSelectedForExport(newSet);
                            }}
                          />
                        </td>
                        <td>{idx + 1}</td>
                        <td className="cat-name-cell">
                          <span>{cat.name}</span>
                          <span className={`type-badge ${cat.type}`}>
                            {cat.type === "kumite" ? "Kumite" : "Kata"}
                          </span>
                        </td>
                        <td>
                          {cat.gender === "male"
                            ? "Nam"
                            : cat.gender === "female"
                            ? "Nữ"
                            : "Hỗn hợp"}
                        </td>
                        <td>
                          {result?.first && (
                            <div className="result-cell">
                              <strong>{result.first}</strong>
                              {result.club1 && <small>{result.club1}</small>}
                            </div>
                          )}
                        </td>
                        <td>
                          {result?.second && (
                            <div className="result-cell">
                              <strong>{result.second}</strong>
                              {result.club2 && <small>{result.club2}</small>}
                            </div>
                          )}
                        </td>
                        <td>
                          {result?.third1 && (
                            <div className="result-cell">
                              <strong>{result.third1}</strong>
                              {result.club3a && <small>{result.club3a}</small>}
                            </div>
                          )}
                        </td>
                        <td>
                          {result?.third2 && (
                            <div className="result-cell">
                              <strong>{result.third2}</strong>
                              {result.club3b && <small>{result.club3b}</small>}
                            </div>
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: "4px",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleOpenResultModal(cat)}
                            >
                              {result ? "✏️ Sửa" : "➕ Nhập"}
                            </button>
                            {result && (
                              <button
                                className="btn btn-sm"
                                style={{
                                  background: "#f0fdf4",
                                  color: "#16a34a",
                                  border: "1px solid #bbf7d0",
                                  fontSize: "11px",
                                }}
                                onClick={() => handleExportCategoryResult(cat)}
                                title="Xuất kết quả hạng mục này"
                              >
                                📄
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== TAB: MEDAL TALLY ===== */}
        {activeTab === "medals" && (
          <div className="stats-content">
            <div className="filter-bar">
              <div className="filter-group">
                <label>Loại:</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">Tất cả</option>
                  <option value="kata">Kata</option>
                  <option value="kumite">Kumite</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Giới tính:</label>
                <select
                  value={filterGender}
                  onChange={(e) => setFilterGender(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">Tất cả</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Buổi:</label>
                <select
                  value={filterSession}
                  onChange={(e) => setFilterSession(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">Tất cả</option>
                  {scheduleSessions.map((s) => (
                    <option key={s} value={s}>
                      {getScheduleSessionLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="search-filter">
                <input
                  type="text"
                  placeholder="🔍 Tìm kiếm hạng mục..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {(filterType !== "all" ||
                filterGender !== "all" ||
                filterSession !== "all" ||
                searchQuery !== "") && (
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setFilterType("all");
                    setFilterGender("all");
                    setFilterSession("all");
                    setSearchQuery("");
                  }}
                >
                  ✕ Xóa lọc
                </button>
              )}
            </div>
            <div className="results-actions">
              <button
                className="btn btn-secondary"
                onClick={handleExportMedalTally}
              >
                📤 Xuất Excel
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => handleExportPDF("medals")}
              >
                📄 Xuất PDF
              </button>

              {selectedTallyClubs.size > 0 && (
                <>
                  <button
                    className="btn btn-primary"
                    style={{ background: "#f0fdf4", color: "#16a34a", fontWeight: "bold" }}
                    onClick={() => handleExportResultsByClubExcel(Array.from(selectedTallyClubs))}
                  >
                    🏢 Xuất Excel {selectedTallyClubs.size} CLB đã chọn
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ background: "#f0fdf4", color: "#16a34a", fontWeight: "bold" }}
                    onClick={() => handleExportResultsByClubPDF(Array.from(selectedTallyClubs))}
                  >
                    🏢 Xuất PDF {selectedTallyClubs.size} CLB đã chọn
                  </button>
                </>
              )}
            </div>

            {medalTally.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🏅</div>
                <h3>Chưa có dữ liệu huy chương</h3>
                <p>Hãy nhập kết quả thi đấu trước ở tab "Kết quả thi đấu"</p>
              </div>
            ) : (
              <div className="medal-tally-wrapper">
                <table className="medal-tally-table">
                  <thead>
                    <tr>
                      <th style={{ width: "30px" }}>
                        <input
                          type="checkbox"
                          checked={
                            medalTally.length > 0 &&
                            medalTally.every((c) => selectedTallyClubs.has(c.name))
                          }
                          onChange={(e) => {
                            const newSet = new Set(selectedTallyClubs);
                            medalTally.forEach((c) =>
                              e.target.checked
                                ? newSet.add(c.name)
                                : newSet.delete(c.name)
                            );
                            setSelectedTallyClubs(newSet);
                          }}
                        />
                      </th>
                      <th className="rank-col">Hạng</th>
                      <th className="club-col">Đơn vị / CLB</th>
                      <th className="medal-col gold-col">🥇 HCV</th>
                      <th className="medal-col silver-col">🥈 HCB</th>
                      <th className="medal-col bronze-col">🥉 HCĐ</th>
                      <th className="medal-col total-col">Tổng</th>
                      <th style={{ width: "100px" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medalTally.map((club, idx) => (
                      <tr
                        key={club.name}
                        className={idx < 3 ? `top-${idx + 1}` : ""}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedTallyClubs.has(club.name)}
                            onChange={(e) => {
                              const newSet = new Set(selectedTallyClubs);
                              e.target.checked
                                ? newSet.add(club.name)
                                : newSet.delete(club.name);
                              setSelectedTallyClubs(newSet);
                            }}
                          />
                        </td>
                        <td className="rank-cell">
                          {idx === 0
                            ? "NHẤT TOÀN ĐOÀN"
                            : idx === 1
                            ? "NHÌ TOÀN ĐOÀN"
                            : idx === 2
                            ? "BA TOÀN ĐOÀN"
                            : idx + 1}
                        </td>
                        <td className="club-cell">{club.name}</td>
                        <td className="gold-cell">{club.gold || "-"}</td>
                        <td className="silver-cell">{club.silver || "-"}</td>
                        <td className="bronze-cell">{club.bronze || "-"}</td>
                        <td className="total-cell">{club.total}</td>
                        <td>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              className="btn btn-sm"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                              onClick={() => handleExportResultsByClubExcel([club.name])}
                              title="Xuất kết quả CLB này (Excel)"
                            >
                              📤
                            </button>
                            <button
                              className="btn btn-sm"
                              style={{ padding: "4px 8px", fontSize: "11px" }}
                              onClick={() => handleExportResultsByClubPDF([club.name])}
                              title="Xuất kết quả CLB này (PDF)"
                            >
                              📄
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="3">
                        <strong>Tổng cộng</strong>
                      </td>
                      <td className="gold-cell">
                        <strong>
                          {medalTally.reduce((s, c) => s + c.gold, 0)}
                        </strong>
                      </td>
                      <td className="silver-cell">
                        <strong>
                          {medalTally.reduce((s, c) => s + c.silver, 0)}
                        </strong>
                      </td>
                      <td className="bronze-cell">
                        <strong>
                          {medalTally.reduce((s, c) => s + c.bronze, 0)}
                        </strong>
                      </td>
                      <td className="total-cell">
                        <strong>
                          {medalTally.reduce((s, c) => s + c.total, 0)}
                        </strong>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal nhập kết quả */}
        <Modal
          isOpen={!!showResultModal}
          onClose={() => setShowResultModal(null)}
          title={`Nhập kết quả: ${
            tournament.categories.find((c) => c.id === showResultModal)?.name ||
            ""
          }`}
        >
          {(() => {
            const cat = tournament.categories.find(
              (c) => c.id === showResultModal
            );
            const athletes = cat?.athletes || [];
            const isTeam =
              cat?.name?.toLowerCase().includes("đồng đội") ||
              (athletes.length > 0 && cat?.gender === "mixed");
            // Group athletes by club
            const clubGroups = {};
            athletes.forEach((a) => {
              const club = a.club?.trim() || "Không rõ CLB";
              if (!clubGroups[club]) clubGroups[club] = [];
              clubGroups[club].push(a);
            });
            const clubs = Object.keys(clubGroups).sort();

            // For team events: select CLB and show all members
            const handleSelectTeam = (club, position) => {
              if (position === "first")
                setResultForm((prev) => ({
                  ...prev,
                  first: club,
                  club1: club,
                }));
              else if (position === "second")
                setResultForm((prev) => ({
                  ...prev,
                  second: club,
                  club2: club,
                }));
              else if (position === "third1")
                setResultForm((prev) => ({
                  ...prev,
                  third1: club,
                  club3a: club,
                }));
              else if (position === "third2")
                setResultForm((prev) => ({
                  ...prev,
                  third2: club,
                  club3b: club,
                }));
            };

            // For individual: select athlete and auto-fill CLB
            const handleSelectAthlete = (name, club, position) => {
              if (position === "first")
                setResultForm((prev) => ({
                  ...prev,
                  first: name,
                  club1: club,
                }));
              else if (position === "second")
                setResultForm((prev) => ({
                  ...prev,
                  second: name,
                  club2: club,
                }));
              else if (position === "third1")
                setResultForm((prev) => ({
                  ...prev,
                  third1: name,
                  club3a: club,
                }));
              else if (position === "third2")
                setResultForm((prev) => ({
                  ...prev,
                  third2: name,
                  club3b: club,
                }));
            };

            // Auto-fill CLB when typing name matches an athlete
            const handleNameChange = (value, field, clubField) => {
              const update = { [field]: value };
              const match = athletes.find((a) => a.name === value);
              if (match) update[clubField] = match.club?.trim() || "";
              setResultForm((prev) => ({ ...prev, ...update }));
            };

            return (
              <div
                className="result-form"
                style={{ maxHeight: "70vh", overflowY: "auto" }}
              >
                {/* Athletes / Teams list by CLB */}
                {athletes.length > 0 && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "12px",
                      background: "#f8fafc",
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#334155",
                        marginBottom: "8px",
                      }}
                    >
                      {isTeam ? "👥" : "📝"}{" "}
                      {isTeam ? "Danh sách Đội" : "Danh sách VĐV"} (
                      {athletes.length}) — Click để điền nhanh
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "4px",
                        marginBottom: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          background: "#fef3c7",
                          borderRadius: "4px",
                          color: "#92400e",
                          fontWeight: 600,
                        }}
                      >
                        🥇 Vàng
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          background: "#f1f5f9",
                          borderRadius: "4px",
                          color: "#64748b",
                          fontWeight: 600,
                        }}
                      >
                        🥈 Bạc
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          background: "#fef2f2",
                          borderRadius: "4px",
                          color: "#dc2626",
                          fontWeight: 600,
                        }}
                      >
                        🥉 Đồng 1
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          background: "#fff7ed",
                          borderRadius: "4px",
                          color: "#ea580c",
                          fontWeight: 600,
                        }}
                      >
                        🥉 Đồng 2
                      </span>
                    </div>
                    {clubs.map((club) => (
                      <div
                        key={club}
                        style={{
                          marginBottom: "10px",
                          padding: "6px",
                          background: "#fff",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "4px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "#6366f1",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            🏢 {club}
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#94a3b8",
                                fontWeight: 400,
                              }}
                            >
                              ({clubGroups[club].length} VĐV)
                            </span>
                          </div>
                          {isTeam && (
                            <div style={{ display: "flex", gap: "2px" }}>
                              <button
                                type="button"
                                onClick={() => handleSelectTeam(club, "first")}
                                style={{
                                  fontSize: "9px",
                                  padding: "2px 6px",
                                  border: "1px solid #fde68a",
                                  background: "#fef3c7",
                                  borderRadius: "3px",
                                  cursor: "pointer",
                                  color: "#92400e",
                                }}
                                title="Chọn đội này là HCV"
                              >
                                🥇
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectTeam(club, "second")}
                                style={{
                                  fontSize: "9px",
                                  padding: "2px 6px",
                                  border: "1px solid #e2e8f0",
                                  background: "#f1f5f9",
                                  borderRadius: "3px",
                                  cursor: "pointer",
                                  color: "#64748b",
                                }}
                                title="HCB"
                              >
                                🥈
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectTeam(club, "third1")}
                                style={{
                                  fontSize: "9px",
                                  padding: "2px 6px",
                                  border: "1px solid #fecaca",
                                  background: "#fef2f2",
                                  borderRadius: "3px",
                                  cursor: "pointer",
                                  color: "#dc2626",
                                }}
                                title="HCĐ 1"
                              >
                                🥉
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectTeam(club, "third2")}
                                style={{
                                  fontSize: "9px",
                                  padding: "2px 6px",
                                  border: "1px solid #fed7aa",
                                  background: "#fff7ed",
                                  borderRadius: "3px",
                                  cursor: "pointer",
                                  color: "#ea580c",
                                }}
                                title="HCĐ 2"
                              >
                                🥉
                              </button>
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "4px",
                            paddingLeft: "4px",
                          }}
                        >
                          {clubGroups[club].map((a) => (
                            <div
                              key={a.id}
                              style={{
                                display: "inline-flex",
                                gap: "2px",
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  color: "#1e293b",
                                  padding: "2px 4px",
                                }}
                              >
                                {a.name}
                              </span>
                              {!isTeam && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSelectAthlete(a.name, club, "first")
                                    }
                                    style={{
                                      fontSize: "9px",
                                      padding: "1px 4px",
                                      border: "1px solid #fde68a",
                                      background: "#fef3c7",
                                      borderRadius: "3px",
                                      cursor: "pointer",
                                      color: "#92400e",
                                    }}
                                    title="HCV"
                                  >
                                    🥇
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSelectAthlete(
                                        a.name,
                                        club,
                                        "second"
                                      )
                                    }
                                    style={{
                                      fontSize: "9px",
                                      padding: "1px 4px",
                                      border: "1px solid #e2e8f0",
                                      background: "#f1f5f9",
                                      borderRadius: "3px",
                                      cursor: "pointer",
                                      color: "#64748b",
                                    }}
                                    title="HCB"
                                  >
                                    🥈
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSelectAthlete(
                                        a.name,
                                        club,
                                        "third1"
                                      )
                                    }
                                    style={{
                                      fontSize: "9px",
                                      padding: "1px 4px",
                                      border: "1px solid #fecaca",
                                      background: "#fef2f2",
                                      borderRadius: "3px",
                                      cursor: "pointer",
                                      color: "#dc2626",
                                    }}
                                    title="HCĐ 1"
                                  >
                                    🥉
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSelectAthlete(
                                        a.name,
                                        club,
                                        "third2"
                                      )
                                    }
                                    style={{
                                      fontSize: "9px",
                                      padding: "1px 4px",
                                      border: "1px solid #fed7aa",
                                      background: "#fff7ed",
                                      borderRadius: "3px",
                                      cursor: "pointer",
                                      color: "#ea580c",
                                    }}
                                    title="HCĐ 2"
                                  >
                                    🥉
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="result-form-row">
                  <div className="result-form-group">
                    <label>🥇 HCV (Huy chương Vàng)</label>
                    <input
                      type="text"
                      className="input"
                      value={resultForm.first}
                      onChange={(e) =>
                        handleNameChange(e.target.value, "first", "club1")
                      }
                      placeholder="Tên VĐV / Đội"
                      list="athletes-list"
                    />
                    <input
                      type="text"
                      className="input"
                      value={resultForm.club1}
                      onChange={(e) =>
                        setResultForm((prev) => ({
                          ...prev,
                          club1: e.target.value,
                        }))
                      }
                      placeholder="CLB / Đơn vị"
                      style={{ marginTop: "6px" }}
                      list="clubs-list"
                    />
                  </div>
                </div>
                <div className="result-form-row">
                  <div className="result-form-group">
                    <label>🥈 HCB (Huy chương Bạc)</label>
                    <input
                      type="text"
                      className="input"
                      value={resultForm.second}
                      onChange={(e) =>
                        handleNameChange(e.target.value, "second", "club2")
                      }
                      placeholder="Tên VĐV / Đội"
                      list="athletes-list"
                    />
                    <input
                      type="text"
                      className="input"
                      value={resultForm.club2}
                      onChange={(e) =>
                        setResultForm((prev) => ({
                          ...prev,
                          club2: e.target.value,
                        }))
                      }
                      placeholder="CLB / Đơn vị"
                      style={{ marginTop: "6px" }}
                      list="clubs-list"
                    />
                  </div>
                </div>
                <div className="result-form-row two-col">
                  <div className="result-form-group">
                    <label>🥉 HCĐ (1)</label>
                    <input
                      type="text"
                      className="input"
                      value={resultForm.third1}
                      onChange={(e) =>
                        handleNameChange(e.target.value, "third1", "club3a")
                      }
                      placeholder="Tên VĐV / Đội"
                      list="athletes-list"
                    />
                    <input
                      type="text"
                      className="input"
                      value={resultForm.club3a}
                      onChange={(e) =>
                        setResultForm((prev) => ({
                          ...prev,
                          club3a: e.target.value,
                        }))
                      }
                      placeholder="CLB / Đơn vị"
                      style={{ marginTop: "6px" }}
                      list="clubs-list"
                    />
                  </div>
                  <div className="result-form-group">
                    <label>🥉 HCĐ (2)</label>
                    <input
                      type="text"
                      className="input"
                      value={resultForm.third2}
                      onChange={(e) =>
                        handleNameChange(e.target.value, "third2", "club3b")
                      }
                      placeholder="Tên VĐV / Đội"
                      list="athletes-list"
                    />
                    <input
                      type="text"
                      className="input"
                      value={resultForm.club3b}
                      onChange={(e) =>
                        setResultForm((prev) => ({
                          ...prev,
                          club3b: e.target.value,
                        }))
                      }
                      placeholder="CLB / Đơn vị"
                      style={{ marginTop: "6px" }}
                      list="clubs-list"
                    />
                  </div>
                </div>
                {/* Datalists for autocomplete */}
                <datalist id="athletes-list">
                  {athletes.map((a) => (
                    <option key={a.id} value={a.name} />
                  ))}
                </datalist>
                <datalist id="clubs-list">
                  {clubs.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>{" "}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowResultModal(null)}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleSaveResult(showResultModal)}
                  >
                    💾 Lưu kết quả
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>

        {/* ===== IMPORT PREVIEW MODAL ===== */}
        {importPreview && (
          <Modal
            isOpen={true}
            onClose={() => setImportPreview(null)}
            title="📥 Xem trước Import kết quả"
          >
            <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
              {/* File info */}
              <div
                style={{
                  marginBottom: "16px",
                  padding: "12px",
                  background: "#f0fdf4",
                  borderRadius: "10px",
                  border: "1px solid #bbf7d0",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#166534",
                    marginBottom: "6px",
                  }}
                >
                  📂 File: {importPreview.fileNames.join(", ")}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    flexWrap: "wrap",
                    fontSize: "12px",
                  }}
                >
                  <span
                    style={{
                      padding: "4px 8px",
                      background: "#dcfce7",
                      borderRadius: "6px",
                      color: "#166534",
                      fontWeight: 600,
                    }}
                  >
                    📊 Tổng: {importPreview.stats.total} dòng
                  </span>
                  <span
                    style={{
                      padding: "4px 8px",
                      background: "#dbeafe",
                      borderRadius: "6px",
                      color: "#1e40af",
                      fontWeight: 600,
                    }}
                  >
                    ✅ Khớp: {importPreview.stats.matched}
                  </span>
                  <span
                    style={{
                      padding: "4px 8px",
                      background: "#e0f2fe",
                      borderRadius: "6px",
                      color: "#0369a1",
                      fontWeight: 600,
                    }}
                  >
                    🆕 Mới: {importPreview.stats.newCount}
                  </span>
                  {importPreview.stats.overwritten > 0 && (
                    <span
                      style={{
                        padding: "4px 8px",
                        background: "#fef3c7",
                        borderRadius: "6px",
                        color: "#92400e",
                        fontWeight: 600,
                      }}
                    >
                      ⚠️ Ghi đè: {importPreview.stats.overwritten}
                    </span>
                  )}
                  {importPreview.stats.skipped > 0 && (
                    <span
                      style={{
                        padding: "4px 8px",
                        background: "#fef2f2",
                        borderRadius: "6px",
                        color: "#dc2626",
                        fontWeight: 600,
                      }}
                    >
                      ❌ Bỏ qua: {importPreview.stats.skipped}
                    </span>
                  )}
                </div>
                {/* Match details from secretary */}
                {importPreview.matchDetails?.length > 0 && (
                  <div style={{ marginTop: "8px", fontSize: "12px" }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        background: "#ede9fe",
                        borderRadius: "6px",
                        color: "#6d28d9",
                        fontWeight: 600,
                      }}
                    >
                      🎯 Chi tiết trận đấu: {importPreview.matchDetails.length}{" "}
                      trận (sẽ cập nhật vào bracket)
                    </span>
                  </div>
                )}
              </div>

              {/* Import mode toggle */}
              {importPreview.stats.overwritten > 0 && (
                <div
                  style={{
                    marginBottom: "16px",
                    padding: "12px",
                    background: "#fffbeb",
                    borderRadius: "10px",
                    border: "1px solid #fde68a",
                  }}
                >
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#92400e",
                      marginBottom: "8px",
                    }}
                  >
                    ⚠️ Có {importPreview.stats.overwritten} hạng mục đã có kết
                    quả. Chọn cách xử lý:
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 12px",
                        background: importMode === "merge" ? "#dbeafe" : "#fff",
                        borderRadius: "8px",
                        border:
                          importMode === "merge"
                            ? "2px solid #3b82f6"
                            : "1px solid #e2e8f0",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        value="merge"
                        checked={importMode === "merge"}
                        onChange={() => setImportMode("merge")}
                      />
                      🔀 Merge (chỉ điền vào ô trống)
                    </label>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 12px",
                        background:
                          importMode === "overwrite" ? "#fef2f2" : "#fff",
                        borderRadius: "8px",
                        border:
                          importMode === "overwrite"
                            ? "2px solid #ef4444"
                            : "1px solid #e2e8f0",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        value="overwrite"
                        checked={importMode === "overwrite"}
                        onChange={() => setImportMode("overwrite")}
                      />
                      ♻️ Ghi đè (thay thế hoàn toàn)
                    </label>
                  </div>
                </div>
              )}

              {/* Details table */}
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                  marginBottom: "16px",
                }}
              >
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th
                      style={{
                        padding: "8px",
                        textAlign: "left",
                        borderBottom: "2px solid #e2e8f0",
                      }}
                    >
                      Hạng mục
                    </th>
                    <th
                      style={{
                        padding: "8px",
                        textAlign: "left",
                        borderBottom: "2px solid #e2e8f0",
                      }}
                    >
                      Trạng thái
                    </th>
                    <th
                      style={{
                        padding: "8px",
                        textAlign: "left",
                        borderBottom: "2px solid #e2e8f0",
                      }}
                    >
                      🥇 HCV
                    </th>
                    <th
                      style={{
                        padding: "8px",
                        textAlign: "left",
                        borderBottom: "2px solid #e2e8f0",
                      }}
                    >
                      🥈 HCB
                    </th>
                    <th
                      style={{
                        padding: "8px",
                        textAlign: "left",
                        borderBottom: "2px solid #e2e8f0",
                      }}
                    >
                      🥉 HCĐ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.details.map((detail, idx) => (
                    <tr
                      key={idx}
                      style={{
                        background:
                          detail.status === "not_found"
                            ? "#fef2f2"
                            : detail.status === "overwrite"
                            ? "#fffbeb"
                            : detail.status === "new"
                            ? "#f0fdf4"
                            : "#f8fafc",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>
                        {detail.catName}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background:
                              detail.status === "not_found"
                                ? "#fecaca"
                                : detail.status === "empty"
                                ? "#e2e8f0"
                                : detail.status === "overwrite"
                                ? "#fde68a"
                                : "#bbf7d0",
                            color:
                              detail.status === "not_found"
                                ? "#dc2626"
                                : detail.status === "empty"
                                ? "#64748b"
                                : detail.status === "overwrite"
                                ? "#92400e"
                                : "#166534",
                          }}
                        >
                          {detail.status === "not_found"
                            ? "❌ Không tìm thấy"
                            : detail.status === "empty"
                            ? "⏭️ Trống"
                            : detail.status === "overwrite"
                            ? "⚠️ Ghi đè"
                            : "✅ Mới"}
                        </span>
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {detail.newData?.first || "-"}
                        {detail.oldData?.first &&
                          detail.status === "overwrite" && (
                            <div
                              style={{
                                fontSize: "10px",
                                color: "#94a3b8",
                                textDecoration: "line-through",
                              }}
                            >
                              {detail.oldData.first}
                            </div>
                          )}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {detail.newData?.second || "-"}
                        {detail.oldData?.second &&
                          detail.status === "overwrite" && (
                            <div
                              style={{
                                fontSize: "10px",
                                color: "#94a3b8",
                                textDecoration: "line-through",
                              }}
                            >
                              {detail.oldData.second}
                            </div>
                          )}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {detail.newData?.third1 || "-"}
                        {detail.newData?.third2
                          ? ` / ${detail.newData.third2}`
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                }}
              >
                <button
                  className="btn btn-secondary"
                  onClick={() => setImportPreview(null)}
                >
                  Hủy
                </button>
                <button
                  className="btn btn-primary"
                  onClick={confirmImport}
                  disabled={importPreview.stats.matched === 0}
                  style={{
                    background:
                      importPreview.stats.matched === 0 ? "#94a3b8" : "#16a34a",
                    borderColor:
                      importPreview.stats.matched === 0 ? "#94a3b8" : "#16a34a",
                  }}
                >
                  ✅ Xác nhận Import ({importPreview.stats.matched} hạng mục)
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
