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
import "./StatisticsPage.css";

export default function StatisticsPage() {
  const { id } = useParams();
  const { tournaments } = useTournament();
  const dispatch = useTournamentDispatch();
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  const tournament = tournaments.find((t) => t.id === id);
  const [activeTab, setActiveTab] = useState("overview"); // overview | results | medals
  const [showResultModal, setShowResultModal] = useState(null);
  const [resultForm, setResultForm] = useState({ first: "", second: "", third1: "", third2: "", club1: "", club2: "", club3a: "", club3b: "" });

  // Filters
  const [filterType, setFilterType] = useState("all"); // all | kata | kumite
  const [filterGender, setFilterGender] = useState("all"); // all | male | female
  const [filterSession, setFilterSession] = useState("all"); // all | buoi1 | buoi2 | ...
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedForExport, setSelectedForExport] = useState(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);

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
    tournament.categories.forEach(c => {
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
    return `Ngày ${dayNum} - ${periodLabel} (${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })})`;
  };

  // ===== FILTER CATEGORIES =====
  const getFilteredCategories = () => {
    let cats = [...tournament.categories];
    if (filterType !== "all") {
      cats = cats.filter(c => c.type === filterType);
    }
    if (filterGender !== "all") {
      cats = cats.filter(c => c.gender === filterGender);
    }
    if (filterSession !== "all") {
      cats = cats.filter(c => getCategorySessionKey(c.id) === filterSession);
    }
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      cats = cats.filter(c => c.name.toLowerCase().includes(q));
    }
    return cats;
  };

  // ===== STATISTICS HELPERS =====
  const getAllAthletes = () => {
    const athletes = [];
    tournament.categories.forEach((cat) => {
      (cat.athletes || []).forEach((a) => {
        athletes.push({ ...a, categoryName: cat.name, categoryId: cat.id, isTeam: a.isTeam || cat.isTeam });
      });
    });
    return athletes;
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

  const getEstimatedMedals = () => {
    let gold = 0, silver = 0, bronze = 0;
    tournament.categories.forEach((cat) => {
      const athleteCount = cat.athletes?.length || 0;
      if (athleteCount === 0) return;
      const isTeamCategory = cat.isTeam || (cat.athletes || []).some(a => a.isTeam);
      if (isTeamCategory) {
        gold += athleteCount;
        silver += athleteCount;
        bronze += athleteCount * 2;
      } else {
        gold += 1;
        silver += 1;
        bronze += 2;
      }
    });
    return { gold, silver, bronze, total: gold + silver + bronze };
  };

  // ===== RESULTS MANAGEMENT =====
  const getCategoryResults = (categoryId) => {
    return tournament.categoryResults?.[categoryId] || null;
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
      setResultForm({ first: "", second: "", third1: "", third2: "", club1: "", club2: "", club3a: "", club3b: "" });
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
        "Loại": cat.type === "kumite" ? "Kumite" : "Kata",
        "Giới tính": cat.gender === "male" ? "Nam" : cat.gender === "female" ? "Nữ" : "Hỗn hợp",
        "HCV (Vàng)": result?.first || "",
        "CLB HCV": result?.club1 || "",
        "Thành viên HCV": getTeamMemberNames(cat, result?.first) || getTeamMemberNames(cat, result?.club1) || "",
        "HCB (Bạc)": result?.second || "",
        "CLB HCB": result?.club2 || "",
        "Thành viên HCB": getTeamMemberNames(cat, result?.second) || getTeamMemberNames(cat, result?.club2) || "",
        "HCĐ 1 (Đồng)": result?.third1 || "",
        "CLB HCĐ 1": result?.club3a || "",
        "Thành viên HCĐ 1": getTeamMemberNames(cat, result?.third1) || getTeamMemberNames(cat, result?.club3a) || "",
        "HCĐ 2 (Đồng)": result?.third2 || "",
        "CLB HCĐ 2": result?.club3b || "",
        "Thành viên HCĐ 2": getTeamMemberNames(cat, result?.third2) || getTeamMemberNames(cat, result?.club3b) || "",
      };
      data.push(row);
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kết quả");

    const colWidths = Object.keys(data[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...data.map((r) => (r[key] || "").toString().length)) + 2,
    }));
    ws["!cols"] = colWidths;

    XLSX.writeFile(wb, `KetQua_${tournament.name.replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, "_")}.xlsx`);
    toast.success("Đã xuất kết quả Excel!");
  };

  // ===== EXPORT SINGLE CATEGORY RESULT =====
  // Helper: get team member full names for a club in a category
  const getTeamMemberNames = (cat, clubName) => {
    if (!clubName) return '';
    const isTeamCat = cat.name?.toLowerCase().includes('đồng đội') || cat.isTeam || (cat.athletes || []).some(a => a.isTeam);
    if (!isTeamCat) return '';
    const members = (cat.athletes || []).filter(a => 
      (a.club || '').trim().toLowerCase() === clubName.trim().toLowerCase()
    );
    if (members.length === 0) return '';
    return members.map(m => m.name).join(', ');
  };

  // Helper: generate medal cell HTML for PDF
  const getMedalCellHTML = (cat, name, club) => {
    if (!name) return '-';
    const memberNames = getTeamMemberNames(cat, name) || getTeamMemberNames(cat, club);
    let html = `<strong>${name}</strong>`;
    if (club && club !== name) html += `<br/><small>${club}</small>`;
    if (memberNames) html += `<br/><small style="color:#1e40af;font-style:italic">${memberNames}</small>`;
    return html;
  };

  const handleExportCategoryResult = (cat) => {
    const result = getCategoryResults(cat.id);
    const printWindow = document.createElement('iframe');
    printWindow.style.display = 'none';
    document.body.appendChild(printWindow);
    const genderLabel = cat.gender === "male" ? "Nam" : cat.gender === "female" ? "Nữ" : "Hỗn hợp";
    const typeLabel = cat.type === "kumite" ? "Kumite" : "Kata";
    const isTeamCat = cat.name?.toLowerCase().includes('đồng đội') || cat.isTeam || (cat.athletes || []).some(a => a.isTeam);

    // Build member names for team categories
    const getMemberList = (clubName) => {
      if (!isTeamCat || !clubName) return '';
      const members = (cat.athletes || []).filter(a => 
        (a.club || '').trim().toLowerCase() === clubName.trim().toLowerCase()
      );
      if (members.length === 0) return '';
      return `<div class="member-list">${members.map((m, i) => `${i + 1}. ${m.name}`).join('<br/>')}</div>`;
    };

    printWindow.contentDocument.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Kết quả - ${cat.name}</title>
      <style>
        @page { size: portrait; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: #1e293b; padding: 20px; }
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
      </style>
    </head><body>
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
            ${isTeamCat ? '<th>Thành viên</th>' : ''}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="medal-icon">🥇</span></td>
            <td>HUY CHƯƠNG VÀNG</td>
            <td>
              <div class="athlete-name">${result?.first || "—"}</div>
              ${result?.club1 && result.club1 !== result.first ? `<div class="club-name">${result.club1}</div>` : ''}
            </td>
            ${isTeamCat ? `<td>${getMemberList(result?.first || result?.club1)}</td>` : ''}
          </tr>
          <tr>
            <td><span class="medal-icon">🥈</span></td>
            <td>HUY CHƯƠNG BẠC</td>
            <td>
              <div class="athlete-name">${result?.second || "—"}</div>
              ${result?.club2 && result.club2 !== result.second ? `<div class="club-name">${result.club2}</div>` : ''}
            </td>
            ${isTeamCat ? `<td>${getMemberList(result?.second || result?.club2)}</td>` : ''}
          </tr>
          <tr>
            <td><span class="medal-icon">🥉</span></td>
            <td>HUY CHƯƠNG ĐỒNG (1)</td>
            <td>
              <div class="athlete-name">${result?.third1 || "—"}</div>
              ${result?.club3a && result.club3a !== result.third1 ? `<div class="club-name">${result.club3a}</div>` : ''}
            </td>
            ${isTeamCat ? `<td>${getMemberList(result?.third1 || result?.club3a)}</td>` : ''}
          </tr>
          <tr>
            <td><span class="medal-icon">🥉</span></td>
            <td>HUY CHƯƠNG ĐỒNG (2)</td>
            <td>
              <div class="athlete-name">${result?.third2 || "—"}</div>
              ${result?.club3b && result.club3b !== result.third2 ? `<div class="club-name">${result.club3b}</div>` : ''}
            </td>
            ${isTeamCat ? `<td>${getMemberList(result?.third2 || result?.club3b)}</td>` : ''}
          </tr>
        </tbody>
      </table>
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
    const sessionLabel = filterSession !== "all" ? getScheduleSessionLabel(filterSession) : "";
    const filterLabel = [filterType !== "all" ? filterType.toUpperCase() : "", filterGender !== "all" ? (filterGender === "male" ? "Nam" : "Nữ") : "", sessionLabel].filter(Boolean).join(" - ");

    const data = [];
    cats.forEach((cat) => {
      const result = getCategoryResults(cat.id);
      data.push({
        "Hạng mục": cat.name,
        "Loại": cat.type === "kumite" ? "Kumite" : "Kata",
        "Giới tính": cat.gender === "male" ? "Nam" : cat.gender === "female" ? "Nữ" : "Hỗn hợp",
        "HCV (Vàng)": result?.first || "",
        "CLB HCV": result?.club1 || "",
        "Thành viên HCV": getTeamMemberNames(cat, result?.first) || getTeamMemberNames(cat, result?.club1) || "",
        "HCB (Bạc)": result?.second || "",
        "CLB HCB": result?.club2 || "",
        "Thành viên HCB": getTeamMemberNames(cat, result?.second) || getTeamMemberNames(cat, result?.club2) || "",
        "HCĐ 1 (Đồng)": result?.third1 || "",
        "CLB HCĐ 1": result?.club3a || "",
        "Thành viên HCĐ 1": getTeamMemberNames(cat, result?.third1) || getTeamMemberNames(cat, result?.club3a) || "",
        "HCĐ 2 (Đồng)": result?.third2 || "",
        "CLB HCĐ 2": result?.club3b || "",
        "Thành viên HCĐ 2": getTeamMemberNames(cat, result?.third2) || getTeamMemberNames(cat, result?.club3b) || "",
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
      wch: Math.max(key.length, ...data.map((r) => (r[key] || "").toString().length)) + 2,
    }));
    ws["!cols"] = colWidths;

    const filename = `KetQua_${tournament.name.replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, "_")}${filterLabel ? `_${filterLabel.replace(/\s+/g, "_")}` : ""}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success(`Đã xuất ${data.length} kết quả ${filterLabel ? `(${filterLabel})` : ""}`);
  };

  // ===== IMPORT RESULTS FROM EXCEL =====
  const handleImportResults = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);

        const newResults = { ...(tournament.categoryResults || {}) };
        let matched = 0;

        rows.forEach((row) => {
          const catName = row["Hạng mục"]?.trim();
          if (!catName) return;

          const matchedCat = tournament.categories.find(
            (c) => c.name.toLowerCase() === catName.toLowerCase()
          );
          if (matchedCat) {
            newResults[matchedCat.id] = {
              first: row["HCV (Vàng)"] || row["Nhất (Vàng)"] || "",
              second: row["HCB (Bạc)"] || row["Nhì (Bạc)"] || "",
              third1: row["HCĐ 1 (Đồng)"] || row["Ba 1 (Đồng)"] || "",
              third2: row["HCĐ 2 (Đồng)"] || row["Ba 2 (Đồng)"] || "",
              club1: row["CLB HCV"] || row["CLB Nhất"] || "",
              club2: row["CLB HCB"] || row["CLB Nhì"] || "",
              club3a: row["CLB HCĐ 1"] || row["CLB Ba 1"] || "",
              club3b: row["CLB HCĐ 2"] || row["CLB Ba 2"] || "",
            };
            matched++;
          }
        });

        dispatch({
          type: ACTIONS.UPDATE_TOURNAMENT,
          payload: {
            id: tournament.id,
            categoryResults: newResults,
          },
        });

        toast.success(`Đã import kết quả cho ${matched}/${rows.length} hạng mục!`);
      } catch (error) {
        toast.error("Lỗi đọc file: " + error.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  // ===== MEDAL TALLY (Bảng tổng sắp) =====
  const getMedalTally = () => {
    const clubMap = {};
    const cats = getFilteredCategories();

    cats.forEach((cat) => {
      const result = getCategoryResults(cat.id);
      if (!result) return;

      const isTeamCategory = cat.isTeam || (cat.athletes || []).some(a => a.isTeam);

      const addMedal = (clubName, type, count = 1) => {
        if (!clubName) return;
        const club = clubName.trim();
        if (!clubMap[club]) {
          clubMap[club] = { name: club, gold: 0, silver: 0, bronze: 0, total: 0 };
        }
        clubMap[club][type] += count;
        clubMap[club].total += count;
      };

      if (isTeamCategory) {
        const teamAthleteCount = (catName, clubName) => {
          if (!clubName) return 1;
          return (cat.athletes || []).filter(a =>
            a.club?.trim().toLowerCase() === clubName.trim().toLowerCase()
          ).length || 1;
        };

        if (result.first && result.club1) {
          const count = teamAthleteCount(cat.name, result.club1);
          addMedal(result.club1, "gold", count);
        }
        if (result.second && result.club2) {
          const count = teamAthleteCount(cat.name, result.club2);
          addMedal(result.club2, "silver", count);
        }
        if (result.third1 && result.club3a) {
          const count = teamAthleteCount(cat.name, result.club3a);
          addMedal(result.club3a, "bronze", count);
        }
        if (result.third2 && result.club3b) {
          const count = teamAthleteCount(cat.name, result.club3b);
          addMedal(result.club3b, "bronze", count);
        }
      } else {
        if (result.club1) addMedal(result.club1, "gold");
        if (result.club2) addMedal(result.club2, "silver");
        if (result.club3a) addMedal(result.club3a, "bronze");
        if (result.club3b) addMedal(result.club3b, "bronze");
      }
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
      "Hạng": idx + 1,
      "Đơn vị/CLB": club.name,
      "HCV 🥇": club.gold,
      "HCB 🥈": club.silver,
      "HCĐ 🥉": club.bronze,
      "Tổng": club.total,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bảng tổng sắp");

    const colWidths = Object.keys(data[0] || {}).map((key) => ({
      wch: Math.max(key.length, ...data.map((r) => (r[key] || "").toString().length)) + 2,
    }));
    ws["!cols"] = colWidths;

    XLSX.writeFile(wb, `BangTongSap_${tournament.name.replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, "_")}.xlsx`);
    toast.success("Đã xuất bảng tổng sắp Excel!");
  };

  // ===== EXPORT PDF =====
  const handleExportPDF = (type) => {
    const printFrame = document.createElement('iframe');
    printFrame.style.display = 'none';
    document.body.appendChild(printFrame);

    let htmlContent = "";
    const filterLabel = filterType !== "all" || filterGender !== "all" || filterSession !== "all"
      ? ` (${filterType !== "all" ? filterType.toUpperCase() : ""}${filterGender !== "all" ? (filterGender === "male" ? " Nam" : " Nữ") : ""}${filterSession !== "all" ? ` ${getScheduleSessionLabel(filterSession)}` : ""})`
      : "";

    if (type === "results") {
      const cats = getFilteredCategories();
      htmlContent = `
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
            ${cats.map((cat, idx) => {
              const r = getCategoryResults(cat.id);
              return `<tr>
                <td>${idx + 1}</td>
                <td><strong>${cat.name}</strong></td>
                <td>${getMedalCellHTML(cat, r?.first, r?.club1)}</td>
                <td>${getMedalCellHTML(cat, r?.second, r?.club2)}</td>
                <td>${getMedalCellHTML(cat, r?.third1, r?.club3a)}</td>
                <td>${getMedalCellHTML(cat, r?.third2, r?.club3b)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`;
    } else {
      const tally = getMedalTally();
      htmlContent = `
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
            ${tally.map((club, idx) => `<tr class="${idx < 3 ? "top" : ""}">
              <td style="text-align:center;font-weight:bold">${idx + 1}</td>
              <td><strong>${club.name}</strong></td>
              <td style="text-align:center;color:#b45309">${club.gold || "-"}</td>
              <td style="text-align:center;color:#6b7280">${club.silver || "-"}</td>
              <td style="text-align:center;color:#92400e">${club.bronze || "-"}</td>
              <td style="text-align:center;font-weight:bold">${club.total}</td>
            </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="font-weight:bold">Tổng cộng</td>
              <td style="text-align:center;font-weight:bold">${tally.reduce((s, c) => s + c.gold, 0)}</td>
              <td style="text-align:center;font-weight:bold">${tally.reduce((s, c) => s + c.silver, 0)}</td>
              <td style="text-align:center;font-weight:bold">${tally.reduce((s, c) => s + c.bronze, 0)}</td>
              <td style="text-align:center;font-weight:bold">${tally.reduce((s, c) => s + c.total, 0)}</td>
            </tr>
          </tfoot>
        </table>`;
    }

    printFrame.contentDocument.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>${type === "results" ? "Kết quả thi đấu" : "Bảng tổng sắp"} - ${tournament.name}</title>
      <style>
        @page { size: portrait; margin: 10mm; }
        body { font-family: Arial, sans-serif; color: #1e293b; padding: 20px; }
        h1 { text-align: center; font-size: 20px; margin-bottom: 4px; }
        h2 { text-align: center; font-size: 16px; font-weight: normal; color: #64748b; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #1e3a5f; color: white; padding: 8px 6px; text-align: left; font-size: 11px; }
        td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) { background: #f8fafc; }
        tr.top td { background: #fffbeb; }
        small { color: #64748b; font-size: 10px; }
        tfoot td { background: #f1f5f9; border-top: 2px solid #1e3a5f; }
      </style>
    </head><body>${htmlContent}</body></html>`);
    printFrame.contentDocument.close();
    setTimeout(() => {
      printFrame.contentWindow.print();
      setTimeout(() => document.body.removeChild(printFrame), 1000);
    }, 300);
  };


  const medals = getEstimatedMedals();
  const clubs = getClubs();
  const medalTally = getMedalTally();
  const filteredCategories = getFilteredCategories();
  const categoriesWithResults = tournament.categories.filter(c => getCategoryResults(c.id));


  return (
    <div className="page statistics-page">
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
            <h1 className="page-title">📊 Thống kê & Bảng tổng sắp</h1>
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
        </div>

        {/* ===== TAB: OVERVIEW ===== */}
        {activeTab === "overview" && (
          <div className="stats-content">
            <div className="overview-grid">
              <div className="overview-card">
                <div className="overview-card-icon">📋</div>
                <div className="overview-card-value">{tournament.categories.length}</div>
                <div className="overview-card-label">Hạng mục thi đấu</div>
              </div>
              <div className="overview-card">
                <div className="overview-card-icon">👥</div>
                <div className="overview-card-value">{getAllAthletes().length}</div>
                <div className="overview-card-label">Tổng VĐV</div>
              </div>
              <div className="overview-card">
                <div className="overview-card-icon">🏢</div>
                <div className="overview-card-value">{clubs.length}</div>
                <div className="overview-card-label">Câu lạc bộ</div>
              </div>
              <div className="overview-card male">
                <div className="overview-card-icon">♂️</div>
                <div className="overview-card-value">{getGenderCount("male")}</div>
                <div className="overview-card-label">VĐV Nam</div>
              </div>
              <div className="overview-card female">
                <div className="overview-card-icon">♀️</div>
                <div className="overview-card-value">{getGenderCount("female")}</div>
                <div className="overview-card-label">VĐV Nữ</div>
              </div>
              <div className="overview-card">
                <div className="overview-card-icon">✅</div>
                <div className="overview-card-value">{categoriesWithResults.length}</div>
                <div className="overview-card-label">Đã có kết quả</div>
              </div>
            </div>

            {clubs.length > 0 && (
              <div className="section-card">
                <h3>🏢 Danh sách CLB ({clubs.length})</h3>
                <div className="club-list">
                  {clubs.map((club) => {
                    const athletesInClub = getAllAthletes().filter(a => a.club?.trim() === club);
                    const maleCount = athletesInClub.filter(a => a.gender === "male").length;
                    const femaleCount = athletesInClub.filter(a => a.gender === "female").length;
                    return (
                      <div key={club} className="club-item">
                        <span className="club-name">{club}</span>
                        <div className="club-stats">
                          <span className="club-stat">{athletesInClub.length} VĐV</span>
                          <span className="club-stat male">♂ {maleCount}</span>
                          <span className="club-stat female">♀ {femaleCount}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="section-card">
              <h3>🏅 Dự tính huy chương</h3>
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

        {/* ===== TAB: RESULTS ===== */}
        {activeTab === "results" && (
          <div className="stats-content">
            <div className="filter-bar">
              <div className="filter-group">
                <label>Loại:</label>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="filter-select">
                  <option value="all">Tất cả</option>
                  <option value="kata">Kata</option>
                  <option value="kumite">Kumite</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Giới tính:</label>
                <select value={filterGender} onChange={e => setFilterGender(e.target.value)} className="filter-select">
                  <option value="all">Tất cả</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Buổi:</label>
                <select value={filterSession} onChange={e => setFilterSession(e.target.value)} className="filter-select">
                  <option value="all">Tất cả</option>
                  {scheduleSessions.map(s => (
                    <option key={s} value={s}>{getScheduleSessionLabel(s)}</option>
                  ))}
                </select>
              </div>
              <div className="search-filter">
                <input
                  type="text"
                  placeholder="🔍 Tìm kiếm hạng mục..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              {(filterType !== "all" || filterGender !== "all" || filterSession !== "all" || searchQuery !== "") && (
                <button className="btn btn-sm btn-secondary" onClick={() => { setFilterType("all"); setFilterGender("all"); setFilterSession("all"); setSearchQuery(""); }}>
                  ✕ Xóa lọc
                </button>
              )}
            </div>
            <div className="results-actions">
              <button className="btn btn-secondary" onClick={handleExportResults}>
                📤 Xuất Excel
              </button>
              <button className="btn btn-secondary" style={{background:'#fef3c7',color:'#92400e',border:'1px solid #fde68a'}} onClick={handleExportBySession}>
                📤 Xuất theo bộ lọc ({filteredCategories.length})
              </button>
              {selectedForExport.size > 0 && (
                <div style={{position:'relative',display:'inline-block'}}>
                  <button className="btn btn-sm" style={{background:'#dcfce7',color:'#16a34a',border:'1px solid #86efac',fontWeight:700}}
                    onClick={() => setShowExportMenu(!showExportMenu)}>
                    ✅ Xuất {selectedForExport.size} đã chọn ▾
                  </button>
                  {showExportMenu && (
                    <div style={{position:'absolute',top:'100%',left:0,zIndex:100,marginTop:'4px',background:'#fff',borderRadius:'8px',boxShadow:'0 4px 16px rgba(0,0,0,0.15)',border:'1px solid #e2e8f0',overflow:'hidden',minWidth:'180px'}}>
                      <button style={{display:'block',width:'100%',padding:'10px 16px',border:'none',background:'none',textAlign:'left',cursor:'pointer',fontSize:'13px',fontWeight:600,color:'#16a34a'}} 
                        onMouseOver={(e) => e.currentTarget.style.background='#f0fdf4'}
                        onMouseOut={(e) => e.currentTarget.style.background='none'}
                        onClick={() => {
                          const cats = tournament.categories.filter(c => selectedForExport.has(c.id));
                          const data = cats.map(cat => {
                            const result = getCategoryResults(cat.id);
                            return {
                              "Hạng mục": cat.name,
                              "Loại": cat.type === "kumite" ? "Kumite" : "Kata",
                              "Giới tính": cat.gender === "male" ? "Nam" : cat.gender === "female" ? "Nữ" : "Hỗn hợp",
                              "HCV": result?.first || "", "CLB HCV": result?.club1 || "",
                              "Thành viên HCV": getTeamMemberNames(cat, result?.first) || getTeamMemberNames(cat, result?.club1) || "",
                              "HCB": result?.second || "", "CLB HCB": result?.club2 || "",
                              "Thành viên HCB": getTeamMemberNames(cat, result?.second) || getTeamMemberNames(cat, result?.club2) || "",
                              "HCĐ 1": result?.third1 || "", "CLB HCĐ 1": result?.club3a || "",
                              "Thành viên HCĐ 1": getTeamMemberNames(cat, result?.third1) || getTeamMemberNames(cat, result?.club3a) || "",
                              "HCĐ 2": result?.third2 || "", "CLB HCĐ 2": result?.club3b || "",
                              "Thành viên HCĐ 2": getTeamMemberNames(cat, result?.third2) || getTeamMemberNames(cat, result?.club3b) || "",
                            };
                          });
                          if (!data.length) return;
                          const ws = XLSX.utils.json_to_sheet(data);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "Kết quả chọn");
                          const colWidths = Object.keys(data[0]).map(key => ({ wch: Math.max(key.length, ...data.map(r => (r[key]||"").toString().length)) + 2 }));
                          ws["!cols"] = colWidths;
                          XLSX.writeFile(wb, `KetQua_DaChon_${selectedForExport.size}.xlsx`);
                          toast.success(`Đã xuất ${selectedForExport.size} nội dung ra Excel!`);
                          setShowExportMenu(false);
                        }}>
                        📤 Xuất Excel
                      </button>
                      <div style={{height:'1px',background:'#e2e8f0'}} />
                      <button style={{display:'block',width:'100%',padding:'10px 16px',border:'none',background:'none',textAlign:'left',cursor:'pointer',fontSize:'13px',fontWeight:600,color:'#2563eb'}}
                        onMouseOver={(e) => e.currentTarget.style.background='#eff6ff'}
                        onMouseOut={(e) => e.currentTarget.style.background='none'}
                        onClick={() => {
                          const cats = tournament.categories.filter(c => selectedForExport.has(c.id));
                          const printFrame = document.createElement('iframe');
                          printFrame.style.display = 'none';
                          document.body.appendChild(printFrame);
                          let rows = '';
                          cats.forEach((cat, idx) => {
                            const r = getCategoryResults(cat.id);
                            rows += `<tr>
                              <td>${idx + 1}</td>
                              <td><strong>${cat.name}</strong></td>
                              <td>${getMedalCellHTML(cat, r?.first, r?.club1)}</td>
                              <td>${getMedalCellHTML(cat, r?.second, r?.club2)}</td>
                              <td>${getMedalCellHTML(cat, r?.third1, r?.club3a)}</td>
                              <td>${getMedalCellHTML(cat, r?.third2, r?.club3b)}</td>
                            </tr>`;
                          });
                          printFrame.contentDocument.write(`<!DOCTYPE html><html><head>
                            <meta charset="utf-8"/><title>Kết quả đã chọn</title>
                            <style>
                              @page { size: portrait; margin: 10mm; }
                              body { font-family: Arial, sans-serif; padding: 20px; }
                              h1 { text-align: center; font-size: 20px; margin-bottom: 4px; }
                              h2 { text-align: center; font-size: 14px; color: #64748b; font-weight: normal; margin-bottom: 16px; }
                              table { width: 100%; border-collapse: collapse; font-size: 12px; }
                              th { background: #1e3a5f; color: white; padding: 8px 6px; text-align: left; font-size: 11px; }
                              td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
                              tr:nth-child(even) { background: #f8fafc; }
                              small { color: #64748b; font-size: 10px; }
                            </style>
                          </head><body>
                            <h1>KẾT QUẢ THI ĐẤU</h1>
                            <h2>${tournament.name} — ${selectedForExport.size} nội dung</h2>
                            <table><thead><tr>
                              <th>#</th><th>Hạng mục</th>
                              <th>🥇 HCV</th><th>🥈 HCB</th><th>🥉 HCĐ (1)</th><th>🥉 HCĐ (2)</th>
                            </tr></thead><tbody>${rows}</tbody></table>
                          </body></html>`);
                          printFrame.contentDocument.close();
                          setTimeout(() => {
                            printFrame.contentWindow.print();
                            setTimeout(() => document.body.removeChild(printFrame), 1000);
                          }, 300);
                          setShowExportMenu(false);
                        }}>
                        📄 Xuất PDF
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button className="btn btn-secondary" onClick={() => handleExportPDF("results")}>
                📄 Xuất PDF
              </button>
              <label className="btn btn-primary" style={{ cursor: "pointer" }}>
                📥 Import kết quả từ Excel
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportResults}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            <div className="results-table-wrapper">
              <table className="results-table">
                <thead>
                  <tr>
                    <th style={{width:'30px'}}>
                      <input type="checkbox"
                        checked={filteredCategories.length > 0 && filteredCategories.every(c => selectedForExport.has(c.id))}
                        onChange={(e) => {
                          const newSet = new Set(selectedForExport);
                          filteredCategories.forEach(c => e.target.checked ? newSet.add(c.id) : newSet.delete(c.id));
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
                          <input type="checkbox"
                            checked={selectedForExport.has(cat.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedForExport);
                              e.target.checked ? newSet.add(cat.id) : newSet.delete(cat.id);
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
                        <td>{cat.gender === "male" ? "Nam" : cat.gender === "female" ? "Nữ" : "Hỗn hợp"}</td>
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
                          <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => handleOpenResultModal(cat)}
                            >
                              {result ? "✏️ Sửa" : "➕ Nhập"}
                            </button>
                            {result && (
                              <button
                                className="btn btn-sm"
                                style={{background:'#f0fdf4',color:'#16a34a',border:'1px solid #bbf7d0',fontSize:'11px'}}
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
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="filter-select">
                  <option value="all">Tất cả</option>
                  <option value="kata">Kata</option>
                  <option value="kumite">Kumite</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Giới tính:</label>
                <select value={filterGender} onChange={e => setFilterGender(e.target.value)} className="filter-select">
                  <option value="all">Tất cả</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Buổi:</label>
                <select value={filterSession} onChange={e => setFilterSession(e.target.value)} className="filter-select">
                  <option value="all">Tất cả</option>
                  {scheduleSessions.map(s => (
                    <option key={s} value={s}>{getScheduleSessionLabel(s)}</option>
                  ))}
                </select>
              </div>
              <div className="search-filter">
                <input
                  type="text"
                  placeholder="🔍 Tìm kiếm hạng mục..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              {(filterType !== "all" || filterGender !== "all" || filterSession !== "all" || searchQuery !== "") && (
                <button className="btn btn-sm btn-secondary" onClick={() => { setFilterType("all"); setFilterGender("all"); setFilterSession("all"); setSearchQuery(""); }}>
                  ✕ Xóa lọc
                </button>
              )}
            </div>
            <div className="results-actions">
              <button className="btn btn-secondary" onClick={handleExportMedalTally}>
                📤 Xuất Excel
              </button>
              <button className="btn btn-secondary" onClick={() => handleExportPDF("medals")}>
                📄 Xuất PDF
              </button>
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
                      <th className="rank-col">Hạng</th>
                      <th className="club-col">Đơn vị / CLB</th>
                      <th className="medal-col gold-col">🥇 HCV</th>
                      <th className="medal-col silver-col">🥈 HCB</th>
                      <th className="medal-col bronze-col">🥉 HCĐ</th>
                      <th className="medal-col total-col">Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medalTally.map((club, idx) => (
                      <tr key={club.name} className={idx < 3 ? `top-${idx + 1}` : ""}>
                        <td className="rank-cell">
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                        </td>
                        <td className="club-cell">{club.name}</td>
                        <td className="gold-cell">{club.gold || "-"}</td>
                        <td className="silver-cell">{club.silver || "-"}</td>
                        <td className="bronze-cell">{club.bronze || "-"}</td>
                        <td className="total-cell">{club.total}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2"><strong>Tổng cộng</strong></td>
                      <td className="gold-cell"><strong>{medalTally.reduce((s, c) => s + c.gold, 0)}</strong></td>
                      <td className="silver-cell"><strong>{medalTally.reduce((s, c) => s + c.silver, 0)}</strong></td>
                      <td className="bronze-cell"><strong>{medalTally.reduce((s, c) => s + c.bronze, 0)}</strong></td>
                      <td className="total-cell"><strong>{medalTally.reduce((s, c) => s + c.total, 0)}</strong></td>
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
          title={`Nhập kết quả: ${tournament.categories.find(c => c.id === showResultModal)?.name || ""}`}
        >
          {(() => {
            const cat = tournament.categories.find(c => c.id === showResultModal);
            const athletes = cat?.athletes || [];
            const isTeam = cat?.name?.toLowerCase().includes('đồng đội') || (athletes.length > 0 && cat?.gender === 'mixed');
            // Group athletes by club
            const clubGroups = {};
            athletes.forEach(a => {
              const club = a.club?.trim() || "Không rõ CLB";
              if (!clubGroups[club]) clubGroups[club] = [];
              clubGroups[club].push(a);
            });
            const clubs = Object.keys(clubGroups).sort();

            // For team events: select CLB and show all members
            const handleSelectTeam = (club, position) => {
              if (position === 'first') setResultForm(prev => ({ ...prev, first: club, club1: club }));
              else if (position === 'second') setResultForm(prev => ({ ...prev, second: club, club2: club }));
              else if (position === 'third1') setResultForm(prev => ({ ...prev, third1: club, club3a: club }));
              else if (position === 'third2') setResultForm(prev => ({ ...prev, third2: club, club3b: club }));
            };

            // For individual: select athlete and auto-fill CLB
            const handleSelectAthlete = (name, club, position) => {
              if (position === 'first') setResultForm(prev => ({ ...prev, first: name, club1: club }));
              else if (position === 'second') setResultForm(prev => ({ ...prev, second: name, club2: club }));
              else if (position === 'third1') setResultForm(prev => ({ ...prev, third1: name, club3a: club }));
              else if (position === 'third2') setResultForm(prev => ({ ...prev, third2: name, club3b: club }));
            };

            // Auto-fill CLB when typing name matches an athlete
            const handleNameChange = (value, field, clubField) => {
              const update = { [field]: value };
              const match = athletes.find(a => a.name === value);
              if (match) update[clubField] = match.club?.trim() || "";
              setResultForm(prev => ({ ...prev, ...update }));
            };

            return (
              <div className="result-form" style={{maxHeight:'70vh',overflowY:'auto'}}>
                {/* Athletes / Teams list by CLB */}
                {athletes.length > 0 && (
                  <div style={{marginBottom:'16px',padding:'12px',background:'#f8fafc',borderRadius:'10px',border:'1px solid #e2e8f0'}}>
                    <div style={{fontSize:'13px',fontWeight:700,color:'#334155',marginBottom:'8px'}}>
                      {isTeam ? '👥' : '📝'} {isTeam ? 'Danh sách Đội' : 'Danh sách VĐV'} ({athletes.length}) — Click để điền nhanh
                    </div>
                    <div style={{display:'flex',gap:'4px',marginBottom:'8px',flexWrap:'wrap'}}>
                      <span style={{fontSize:'10px',padding:'2px 6px',background:'#fef3c7',borderRadius:'4px',color:'#92400e',fontWeight:600}}>🥇 Vàng</span>
                      <span style={{fontSize:'10px',padding:'2px 6px',background:'#f1f5f9',borderRadius:'4px',color:'#64748b',fontWeight:600}}>🥈 Bạc</span>
                      <span style={{fontSize:'10px',padding:'2px 6px',background:'#fef2f2',borderRadius:'4px',color:'#dc2626',fontWeight:600}}>🥉 Đồng 1</span>
                      <span style={{fontSize:'10px',padding:'2px 6px',background:'#fff7ed',borderRadius:'4px',color:'#ea580c',fontWeight:600}}>🥉 Đồng 2</span>
                    </div>
                    {clubs.map(club => (
                      <div key={club} style={{marginBottom:'10px',padding:'6px',background:'#fff',borderRadius:'6px',border:'1px solid #e2e8f0'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'4px'}}>
                          <div style={{fontSize:'12px',fontWeight:700,color:'#6366f1',display:'flex',alignItems:'center',gap:'4px'}}>
                            🏢 {club}
                            <span style={{fontSize:'10px',color:'#94a3b8',fontWeight:400}}>({clubGroups[club].length} VĐV)</span>
                          </div>
                          {isTeam && (
                            <div style={{display:'flex',gap:'2px'}}>
                              <button type="button" onClick={() => handleSelectTeam(club, 'first')} style={{fontSize:'9px',padding:'2px 6px',border:'1px solid #fde68a',background:'#fef3c7',borderRadius:'3px',cursor:'pointer',color:'#92400e'}} title="Chọn đội này là HCV">🥇</button>
                              <button type="button" onClick={() => handleSelectTeam(club, 'second')} style={{fontSize:'9px',padding:'2px 6px',border:'1px solid #e2e8f0',background:'#f1f5f9',borderRadius:'3px',cursor:'pointer',color:'#64748b'}} title="HCB">🥈</button>
                              <button type="button" onClick={() => handleSelectTeam(club, 'third1')} style={{fontSize:'9px',padding:'2px 6px',border:'1px solid #fecaca',background:'#fef2f2',borderRadius:'3px',cursor:'pointer',color:'#dc2626'}} title="HCĐ 1">🥉</button>
                              <button type="button" onClick={() => handleSelectTeam(club, 'third2')} style={{fontSize:'9px',padding:'2px 6px',border:'1px solid #fed7aa',background:'#fff7ed',borderRadius:'3px',cursor:'pointer',color:'#ea580c'}} title="HCĐ 2">🥉</button>
                            </div>
                          )}
                        </div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:'4px',paddingLeft:'4px'}}>
                          {clubGroups[club].map(a => (
                            <div key={a.id} style={{display:'inline-flex',gap:'2px',alignItems:'center'}}>
                              <span style={{fontSize:'11px',fontWeight:600,color:'#1e293b',padding:'2px 4px'}}>{a.name}</span>
                              {!isTeam && (
                                <>
                                  <button type="button" onClick={() => handleSelectAthlete(a.name, club, 'first')} style={{fontSize:'9px',padding:'1px 4px',border:'1px solid #fde68a',background:'#fef3c7',borderRadius:'3px',cursor:'pointer',color:'#92400e'}} title="HCV">🥇</button>
                                  <button type="button" onClick={() => handleSelectAthlete(a.name, club, 'second')} style={{fontSize:'9px',padding:'1px 4px',border:'1px solid #e2e8f0',background:'#f1f5f9',borderRadius:'3px',cursor:'pointer',color:'#64748b'}} title="HCB">🥈</button>
                                  <button type="button" onClick={() => handleSelectAthlete(a.name, club, 'third1')} style={{fontSize:'9px',padding:'1px 4px',border:'1px solid #fecaca',background:'#fef2f2',borderRadius:'3px',cursor:'pointer',color:'#dc2626'}} title="HCĐ 1">🥉</button>
                                  <button type="button" onClick={() => handleSelectAthlete(a.name, club, 'third2')} style={{fontSize:'9px',padding:'1px 4px',border:'1px solid #fed7aa',background:'#fff7ed',borderRadius:'3px',cursor:'pointer',color:'#ea580c'}} title="HCĐ 2">🥉</button>
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
                    <input type="text" className="input" value={resultForm.first}
                      onChange={(e) => handleNameChange(e.target.value, 'first', 'club1')}
                      placeholder="Tên VĐV / Đội" list="athletes-list" />
                    <input type="text" className="input" value={resultForm.club1}
                      onChange={(e) => setResultForm(prev => ({ ...prev, club1: e.target.value }))}
                      placeholder="CLB / Đơn vị" style={{ marginTop: "6px" }} list="clubs-list" />
                  </div>
                </div>

                <div className="result-form-row">
                  <div className="result-form-group">
                    <label>🥈 HCB (Huy chương Bạc)</label>
                    <input type="text" className="input" value={resultForm.second}
                      onChange={(e) => handleNameChange(e.target.value, 'second', 'club2')}
                      placeholder="Tên VĐV / Đội" list="athletes-list" />
                    <input type="text" className="input" value={resultForm.club2}
                      onChange={(e) => setResultForm(prev => ({ ...prev, club2: e.target.value }))}
                      placeholder="CLB / Đơn vị" style={{ marginTop: "6px" }} list="clubs-list" />
                  </div>
                </div>

                <div className="result-form-row two-col">
                  <div className="result-form-group">
                    <label>🥉 HCĐ (1)</label>
                    <input type="text" className="input" value={resultForm.third1}
                      onChange={(e) => handleNameChange(e.target.value, 'third1', 'club3a')}
                      placeholder="Tên VĐV / Đội" list="athletes-list" />
                    <input type="text" className="input" value={resultForm.club3a}
                      onChange={(e) => setResultForm(prev => ({ ...prev, club3a: e.target.value }))}
                      placeholder="CLB / Đơn vị" style={{ marginTop: "6px" }} list="clubs-list" />
                  </div>
                  <div className="result-form-group">
                    <label>🥉 HCĐ (2)</label>
                    <input type="text" className="input" value={resultForm.third2}
                      onChange={(e) => handleNameChange(e.target.value, 'third2', 'club3b')}
                      placeholder="Tên VĐV / Đội" list="athletes-list" />
                    <input type="text" className="input" value={resultForm.club3b}
                      onChange={(e) => setResultForm(prev => ({ ...prev, club3b: e.target.value }))}
                      placeholder="CLB / Đơn vị" style={{ marginTop: "6px" }} list="clubs-list" />
                  </div>
                </div>

                {/* Datalists for autocomplete */}
                <datalist id="athletes-list">
                  {athletes.map(a => <option key={a.id} value={a.name} />)}
                </datalist>
                <datalist id="clubs-list">
                  {clubs.map(c => <option key={c} value={c} />)}
                </datalist>

                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowResultModal(null)}>Hủy</button>
                  <button type="button" className="btn btn-primary" onClick={() => handleSaveResult(showResultModal)}>💾 Lưu kết quả</button>
                </div>
              </div>
            );
          })()}
        </Modal>
      </div>
    </div>
  );
}
