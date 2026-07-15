import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import appIcon from "../assets/icon.png";

const escapeHtml = (value = "") =>
  String(value)
    .normalize("NFC")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
};

function officialRow(label, referee, className) {
  return `<tr class="${className}">
    <td>${escapeHtml(label)}</td>
    <td>${escapeHtml(referee?.name || "Chưa chọn")}</td>
    <td>${escapeHtml(referee?.code || "")}</td>
    <td>${escapeHtml(referee?.unit || "")}</td>
    <td>${escapeHtml(referee?.grade || "")}</td>
  </tr>`;
}

function buildMatTable(mat, fixed, randomReferees, refereeMap, continuation) {
  const fixedRows = [
    officialRow("Trưởng sàn", refereeMap.get(fixed?.chiefId), "fixed chief"),
    officialRow("Phó sàn 1", refereeMap.get(fixed?.deputy1Id), "fixed deputy"),
    officialRow("Phó sàn 2", refereeMap.get(fixed?.deputy2Id), "fixed deputy"),
  ].join("");
  const randomRows = randomReferees.length
    ? randomReferees.map((referee, index) => `<tr>
        <td>${mat}-${continuation * 26 + index + 1}</td>
        <td>${escapeHtml(referee.name)}</td>
        <td>${escapeHtml(referee.code)}</td>
        <td>${escapeHtml(referee.unit)}</td>
        <td>${escapeHtml(referee.specialty || referee.grade || "")}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" class="empty">Chưa có danh sách random</td></tr>`;

  return `<section class="mat-panel">
    <div class="mat-title">THẢM ${mat}${continuation ? ` — TIẾP ${continuation + 1}` : ""}</div>
    <table>
      <thead><tr><th>STT</th><th>HỌ VÀ TÊN</th><th>MÃ TT</th><th>ĐƠN VỊ</th><th>NỘI DUNG/CẤP</th></tr></thead>
      <tbody>${fixedRows}<tr class="separator"><td colspan="5"></td></tr>${randomRows}</tbody>
    </table>
  </section>`;
}

function buildPageHtml({ tournament, management, matEntries, continuation }) {
  const report = management.report || {};
  const refereeMap = new Map((management.referees || []).map((item) => [item.id, item]));
  const logoConfig = tournament.sponsorLogos || {};
  const tournamentLogos = logoConfig.tournamentLogos?.length
    ? logoConfig.tournamentLogos
    : logoConfig.systemLogo ? [logoConfig.systemLogo] : [];
  const leftLogos = tournamentLogos.length ? tournamentLogos : [appIcon];
  const sponsors = logoConfig.sponsors || [];
  const leftLogosHtml = leftLogos.map((logo) => `<img class="logo" src="${escapeHtml(logo)}" />`).join("");
  const sponsorLogosHtml = sponsors.map((logo) => `<img class="sponsor-logo" src="${escapeHtml(logo)}" />`).join("");
  const tableFontSize = matEntries.length >= 4 ? 9 : matEntries.length === 3 ? 10 : 12;
  return `<div class="report">
    <style>
      *{box-sizing:border-box} body{margin:0}.report{width:1400px;min-height:930px;padding:24px 28px;background:#fff;color:#000;font-family:'Segoe UI',Arial,sans-serif;font-variant-ligatures:none;text-rendering:geometricPrecision}
      .top{display:grid;grid-template-columns:230px 1fr 230px;align-items:start;min-height:120px}.logo-group{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.logo{height:82px;max-width:105px;object-fit:contain}.top-right{display:flex;flex-direction:column;align-items:flex-end;gap:12px}.date{text-align:right;font-size:14px;padding-top:4px}.sponsor-group{display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap}.sponsor-logo{height:46px;max-width:95px;object-fit:contain}
      h1{margin:8px 0 2px;text-align:center;font-family:'Segoe UI',Arial,sans-serif;font-size:32px;color:#0566b5;font-weight:700}.subtitle{text-align:center;font-size:29px;margin:2px 0 12px;color:#000;font-weight:400}.meta{width:760px;margin:0 auto 15px;font-size:16px;color:#000}.meta-row{display:flex;gap:8px;margin:6px 0}.meta-label{font-weight:700;min-width:165px}.meta-value{font-weight:700;border-bottom:3px solid #000;flex:1;padding:0 4px 3px}
      .mats{display:grid;grid-template-columns:repeat(${matEntries.length},minmax(0,1fr));gap:0;align-items:start}.mat-panel{border:2.5px solid #000}.mat-panel+.mat-panel{border-left:0}.mat-title{text-align:center;background:#fff200;color:#000;border-bottom:2.5px solid #000;font-size:20px;font-weight:700;padding:3px;font-family:'Segoe UI',Arial,sans-serif}
      table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${tableFontSize}px;color:#000;background:#fff}th,td{border:1.5px solid #000;padding:3px 4px;height:23px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#fff;color:#000}th{font-size:${Math.max(8, tableFontSize - 1)}px;text-align:center;background:#fff;font-weight:700}th:nth-child(1),td:nth-child(1){width:${matEntries.length >= 3 ? 76 : 82}px;text-align:center}th:nth-child(2),td:nth-child(2){width:38%}th:nth-child(3),td:nth-child(3){width:${matEntries.length >= 3 ? 70 : 88}px;text-align:center}th:nth-child(4),td:nth-child(4){width:22%}th:nth-child(5),td:nth-child(5){width:${matEntries.length >= 3 ? 82 : 95}px;text-align:center}
      .fixed td{background:#fff;font-weight:400}.fixed td:first-child{background:#dbeafe;font-weight:700}.separator td{height:10px;background:#fff}.empty{text-align:center!important;color:#000;font-style:italic}
    </style>
    <div class="top">
      <div class="logo-group">${leftLogosHtml}</div>
      <div><h1>${escapeHtml(report.eventName || tournament.name)}</h1><div class="subtitle">${escapeHtml(report.title || "PHÂN CÔNG TRỌNG TÀI")}</div></div>
      <div class="top-right"><div class="date">${escapeHtml(formatDate(report.date || tournament.startDate || tournament.date))}</div><div class="sponsor-group">${sponsorLogosHtml}</div></div>
    </div>
    <div class="meta">
      <div class="meta-row"><span class="meta-label">Trưởng ban trọng tài:</span><span class="meta-value">${escapeHtml(report.chairman || "")}</span></div>
      <div class="meta-row"><span class="meta-label">Thư ký ban trọng tài:</span><span class="meta-value">${escapeHtml(report.secretary || "")}</span></div>
    </div>
    <div class="mats">${matEntries.map(({ mat, randomIds }) => {
      const refs = randomIds.slice(continuation * 26, continuation * 26 + 26).map((id) => refereeMap.get(id)).filter(Boolean);
      return buildMatTable(mat, management.fixedByMat?.[String(mat)], refs, refereeMap, continuation);
    }).join("")}</div>
  </div>`;
}

async function renderHtml(html) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    return await html2canvas(container.firstElementChild, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportRefereeDeploymentPdf(tournament, management) {
  const assignments = management.assignments || [];
  const fallback = Array.from({ length: management.matCount || 1 }, (_, index) => ({ mat: index + 1, randomIds: [] }));
  const mats = assignments.length ? assignments : fallback;
  const pages = [];
  const maxRandom = Math.max(...mats.map((item) => item.randomIds.length), 0);
  const continuationCount = Math.max(1, Math.ceil(maxRandom / 26));
  for (let continuation = 0; continuation < continuationCount; continuation += 1) {
    pages.push({ matEntries: mats, continuation });
  }

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) pdf.addPage("a4", "landscape");
    const canvas = await renderHtml(buildPageHtml({ tournament, management, ...pages[index] }));
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
  }
  const safeName = (tournament.name || "Giai_dau").replace(/[^a-zA-Z0-9À-ỹ]+/g, "_");
  pdf.save(`Phan_Cong_Trong_Tai_${safeName}.pdf`);
}
