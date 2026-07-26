import { useMemo, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { isTeamCategory } from "../../utils/teamDraw";
import "./CompetitionMatchReport.css";

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
};

const getSession = (time) => {
  if (!time) return "";
  return Number(String(time).split(":")[0]) < 12 ? "Sáng" : "Chiều";
};

const reportTitle = (category) => {
  const discipline = category?.type === "kata" ? "KATA" : "KUMITE";
  return `BIÊN BẢN THI ĐẤU ${discipline} ${isTeamCategory(category) ? "ĐỒNG ĐỘI" : "CÁ NHÂN"}`;
};

const participantName = (athlete) => athlete?.name || "";
const participantTeam = (athlete) => athlete?.club || athlete?.team || "";

export function MatchRecordPrint({ tournament, category, match, schedule, fillResults }) {
  const aka = match.athlete1; // Scoreboard source: athlete1 = AKA/red
  const ao = match.athlete2;  // Scoreboard source: athlete2 = AO/blue
  const hasResult = fillResults && !!match.winner;
  const decision = String(match.winMethod || "").toLowerCase();
  const checked = (key) => decision.includes(key) ? "☒" : "☐";

  const side = (label, athlete, tone, score) => (
    <section className={`report-side report-side-${tone}`}>
      <div className="report-side-label">{label}</div>
      <div><b>NAME:</b> {participantName(athlete) || "________________________"}</div>
      <div><b>TEAM:</b> {participantTeam(athlete) || "________________________"}</div>
      <div className="report-score-row"><b>Điểm:</b>{Array.from({ length: 9 }, (_, i) => <span key={i} className="write-box" />)}</div>
      <div className="report-penalties"><b>Phạt:</b> C1 <span className="paper-checkbox">□</span> C2 <span className="paper-checkbox">□</span> C3 <span className="paper-checkbox">□</span> HC <span className="paper-checkbox">□</span> H <span className="paper-checkbox">□</span></div>
      <div><b>Senshu:</b> <span className="paper-checkbox">□</span> {hasResult && score != null ? <span className="saved-score">Kết quả: {score}</span> : null}</div>
    </section>
  );

  return (
    <article className="match-record">
      <div className="match-record-number">TRẬN: {String(match.matchNumber || "").padStart(2, "0")}</div>
      <div className="match-record-grid">
        {side("AO", ao, "ao", match.score2)}
        <section className="report-result">
          <b>RESULT</b>
          <div className="result-scores"><span>AO<br />{hasResult ? match.score2 ?? "" : ""}</span><span>AKA<br />{hasResult ? match.score1 ?? "" : ""}</span></div>
          <div>Winner: <strong>{hasResult ? participantName(match.winner) : "________________"}</strong></div>
          <div className="decision-list">
            <span><span className="paper-checkbox">{checked("point")}</span> Points</span><span><span className="paper-checkbox">{checked("hantei")}</span> Hantei</span>
            <span><span className="paper-checkbox">{checked("hansoku")}</span> Hansoku</span><span><span className="paper-checkbox">{checked("kiken")}</span> Kiken</span><span><span className="paper-checkbox">{checked("shikkaku")}</span> Shikkaku</span>
          </div>
        </section>
        {side("AKA", aka, "aka", match.score1)}
      </div>
    </article>
  );
}

export default function CompetitionMatchReport({ tournament, tournaments = [], initialCategory, onClose }) {
  const allTournaments = tournaments.length ? tournaments : [tournament];
  const categories = useMemo(() => allTournaments.flatMap((competition) =>
    (competition.categories || []).filter((category) => category.bracket?.matches?.length).map((category) => ({ competition, category }))), [allTournaments]);
  const [discipline, setDiscipline] = useState(initialCategory?.type || "kumite");
  const [scope, setScope] = useState("category");
  const [categoryId, setCategoryId] = useState(initialCategory?.id || categories[0]?.category.id || "");
  const [matchId, setMatchId] = useState(initialCategory?.bracket?.matches?.find((match) => !match.isBye)?.id || "");
  const [mat, setMat] = useState("all");
  const [date, setDate] = useState("all");
  const [fillResults, setFillResults] = useState(false);
  const [exporting, setExporting] = useState(false);

  const dates = [...new Set(allTournaments.flatMap((item) => Object.values(item.schedule || {}).map((s) => s.date).filter(Boolean)))].sort();
  const mats = [...new Set(allTournaments.flatMap((item) => Object.values(item.schedule || {}).map((s) => String(s.mat)).filter(Boolean)))].sort((a, b) => Number(a) - Number(b));

  const records = useMemo(() => {
    let source = categories.filter(({ category }) => (category.type || "kumite") === discipline);
    if (scope === "category" || scope === "match") source = source.filter(({ category }) => category.id === categoryId);
    if (scope === "mat") source = source.filter(({ competition, category }) => mat === "all" || String(competition.schedule?.[category.id]?.mat) === mat);
    return source.flatMap(({ competition, category }) => {
      const schedule = competition.schedule?.[category.id] || {};
      if (date !== "all" && schedule.date !== date) return [];
      return category.bracket.matches
        .filter((match) => !match.isBye)
        .filter((match) => scope !== "match" || !matchId || match.id === matchId)
        .map((match) => ({ competition, category, match, schedule }));
    }).sort((a, b) => String(a.schedule.date || "").localeCompare(String(b.schedule.date || "")) ||
      String(a.schedule.time || "").localeCompare(String(b.schedule.time || "")) ||
      Number(a.schedule.order || 0) - Number(b.schedule.order || 0) || Number(a.match.matchNumber || 0) - Number(b.match.matchNumber || 0));
  }, [categories, discipline, scope, categoryId, matchId, mat, date]);

  const pages = Array.from({ length: Math.ceil(records.length / 4) }, (_, index) => records.slice(index * 4, index * 4 + 4));
  const selectableCategories = categories.filter(({ category }) => (category.type || "kumite") === discipline);
  const currentMatches = selectableCategories.find(({ category }) => category.id === categoryId)?.category.bracket?.matches?.filter((m) => !m.isBye) || [];

  const exportPdf = async () => {
    setExporting(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const nodes = [...document.querySelectorAll(".report-print-page")];
      const pdf = new jsPDF("p", "mm", "a4");
      for (let index = 0; index < nodes.length; index += 1) {
        const canvas = await html2canvas(nodes[index], { scale: 2, backgroundColor: "#ffffff" });
        if (index) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297);
      }
      pdf.save(`bien-ban-thi-dau-${Date.now()}.pdf`);
    } finally { setExporting(false); }
  };

  return (
    <div className="match-report-overlay">
      <div className="match-report-modal">
        <header className="match-report-toolbar">
          <h2>📄 BIÊN BẢN THI ĐẤU</h2>
          <label>Loại<select value={discipline} onChange={(e) => { const value = e.target.value; setDiscipline(value); const first = categories.find(({ category }) => (category.type || "kumite") === value)?.category; setCategoryId(first?.id || ""); setMatchId(first?.bracket?.matches?.find((match) => !match.isBye)?.id || ""); }}><option value="kumite">Kumite</option><option value="kata">Kata</option></select></label>
          <label>Phạm vi<select value={scope} onChange={(e) => setScope(e.target.value)}><option value="match">1 trận</option><option value="category">Theo nội dung</option><option value="mat">Theo thảm</option><option value="tournament">Toàn bộ giải</option></select></label>
          {(scope === "match" || scope === "category") && <label>Nội dung<select value={categoryId} onChange={(e) => { const value = e.target.value; setCategoryId(value); const selected = selectableCategories.find(({ category }) => category.id === value)?.category; setMatchId(selected?.bracket?.matches?.find((match) => !match.isBye)?.id || ""); }}>{selectableCategories.map(({ competition, category }) => <option key={`${competition.id}-${category.id}`} value={category.id}>{category.name}</option>)}</select></label>}
          {scope === "match" && <label>Trận<select value={matchId} onChange={(e) => setMatchId(e.target.value)}><option value="">Chọn trận</option>{currentMatches.map((m) => <option key={m.id} value={m.id}>Trận {m.matchNumber}</option>)}</select></label>}
          {scope === "mat" && <label>Thảm<select value={mat} onChange={(e) => setMat(e.target.value)}><option value="all">Tất cả</option>{mats.map((m) => <option key={m} value={m}>Thảm {m}</option>)}</select></label>}
          <label>Ngày<select value={date} onChange={(e) => setDate(e.target.value)}><option value="all">Tất cả</option>{dates.map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}</select></label>
          <label className="report-checkbox"><input type="checkbox" checked={fillResults} onChange={(e) => setFillResults(e.target.checked)} /> Điền kết quả đã có</label>
          <div className="report-actions"><button onClick={() => window.print()}>🖨 In</button><button onClick={exportPdf} disabled={!records.length || exporting}>{exporting ? "Đang xuất..." : "Xuất PDF"}</button><button onClick={onClose}>Đóng</button></div>
        </header>
        <main className="match-report-preview">
          {!records.length && <div className="report-empty">Không có trận phù hợp bộ lọc.</div>}
          {pages.map((page, pageIndex) => {
            const first = page[0];
            return <section className="report-print-page" key={pageIndex}>
              <header className="report-document-header">
                <h1>{first.competition.name}</h1>
                {first.competition.subTitle && <div>{first.competition.subTitle}</div>}
                {(first.competition.organizer || first.competition.year) && <div>{first.competition.organizer || ""}{first.competition.organizer && first.competition.year ? " • " : ""}{first.competition.year || ""}</div>}
                <h2>{reportTitle(first.category)}</h2>
                <div className="report-meta"><b>NỘI DUNG:</b> {scope === "category" || scope === "match" ? first.category.name : "Theo danh sách lịch"} &nbsp; <b>THẢM:</b> {scope === "mat" ? mat : first.schedule.mat || ""} &nbsp; <b>NGÀY:</b> {formatDate(first.schedule.date || first.competition.date)} &nbsp; <b>BUỔI:</b> {getSession(first.schedule.time)}</div>
              </header>
              {page.map((record) => <MatchRecordPrint key={`${record.category.id}-${record.match.id}`} tournament={record.competition} category={record.category} match={record.match} schedule={record.schedule} fillResults={fillResults} />)}
              <footer className="report-signatures"><span>THƯ KÝ: __________________</span><span>TRỌNG TÀI: __________________</span><span>TRỌNG TÀI TRƯỞNG: __________________</span></footer>
            </section>;
          })}
        </main>
      </div>
    </div>
  );
}