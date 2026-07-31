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

const formatRefereeRole = (value) => {
  const role = String(value || "").trim().toLocaleLowerCase("vi");
  if (role === "ttc" || role.includes("chính")) return "TTC";
  return "TTP";
};

function officialRow(label, referee, className) {
  return `<tr class="${className}">
    <td>${escapeHtml(label)}</td>
    <td>${escapeHtml(referee?.name || "Chưa chọn")}</td>
    <td>${escapeHtml(referee?.code || "")}</td>
    <td>${escapeHtml(referee?.unit || "")}</td>
    <td>${escapeHtml(referee?.grade || "")}</td>
    <td>${referee ? formatRefereeRole(referee.refereeRole) : ""}</td>
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
        <td>${formatRefereeRole(referee.refereeRole)}</td>
      </tr>`).join("")
    : `<tr><td colspan="6" class="empty">Chưa có danh sách random</td></tr>`;

  return `<section class="mat-panel">
    <div class="mat-title">THẢM ${mat}${continuation ? ` — TIẾP ${continuation + 1}` : ""}</div>
    <table>
      <thead><tr><th>STT</th><th>HỌ VÀ TÊN</th><th>MÃ TT</th><th>ĐƠN VỊ</th><th>NỘI DUNG/CẤP</th><th>TTC/TTP</th></tr></thead>
      <tbody>${fixedRows}<tr class="separator"><td colspan="6"></td></tr>${randomRows}</tbody>
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
      table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${tableFontSize}px;color:#000;background:#fff}th,td{border:1.5px solid #000;padding:3px 2px;height:23px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#fff;color:#000}th{font-size:${Math.max(7, tableFontSize - 2)}px;text-align:center;background:#fff;font-weight:700}th:nth-child(1),td:nth-child(1){width:15%;text-align:center}th:nth-child(2),td:nth-child(2){width:27%}th:nth-child(3),td:nth-child(3){width:14%;text-align:center}th:nth-child(4),td:nth-child(4){width:18%}th:nth-child(5),td:nth-child(5){width:16%;text-align:center}th:nth-child(6),td:nth-child(6){width:10%;text-align:center;font-weight:700}
      .fixed td{background:#fff;font-weight:400}.fixed td:first-child{background:#dbeafe;font-weight:700}.separator td{height:10px;background:#fff}.empty{text-align:center!important;color:#000;font-style:italic}
    </style>
    <div class="top">
      <div class="logo-group">${leftLogosHtml}</div>
      <div><h1>${escapeHtml(report.eventName || tournament.name)}</h1><div class="subtitle">${escapeHtml(report.title || "PHÂN CÔNG TRỌNG TÀI")}</div></div>
      <div class="top-right"><div class="date">${escapeHtml(formatDate(report.date || tournament.startDate || tournament.date))}</div><div class="sponsor-group">${sponsorLogosHtml}</div></div>
    </div>
    <div class="meta">
      <div class="meta-row"><span class="meta-label">Tổng trọng tài:</span><span class="meta-value">${escapeHtml(report.chairman || "")}</span></div>
      <div class="meta-row"><span class="meta-label">Phó tổng trọng tài:</span><span class="meta-value">${escapeHtml(report.deputyChairman || "")}</span></div>
      <div class="meta-row"><span class="meta-label">Thư ký ban trọng tài:</span><span class="meta-value">${escapeHtml(report.secretary || "")}</span></div>
    </div>
    <div class="mats">${matEntries.map(({ mat, randomIds }) => {
      const officialNames = new Set([report.chairman, report.deputyChairman, report.secretary]
        .map((name) => String(name || "").trim().toLocaleLowerCase("vi"))
        .filter(Boolean));
      const refs = randomIds
        .map((id) => refereeMap.get(id))
        .filter((referee) => referee && !officialNames.has(String(referee.name || "").trim().toLocaleLowerCase("vi")))
        .slice(continuation * 26, continuation * 26 + 26);
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

function buildSingleMatPageHtml(tournament, management, mat) {
  const report = management.report || {};
  const refereeMap = new Map((management.referees || []).map((item) => [item.id, item]));
  const fixed = management.fixedByMat?.[String(mat)] || {};
  const assignment = (management.assignments || []).find((item) => Number(item.mat) === mat);
  const fixedRows = [
    ["Trưởng sàn", refereeMap.get(fixed.chiefId)],
    ["Phó sàn 1", refereeMap.get(fixed.deputy1Id)],
    ["Phó sàn 2", refereeMap.get(fixed.deputy2Id)],
  ];
  const officialNames = new Set([report.chairman, report.deputyChairman, report.secretary].map((name) => String(name || "").trim().toLocaleLowerCase("vi")).filter(Boolean));
  const randomRows = (assignment?.randomIds || []).map((id) => refereeMap.get(id)).filter((referee) => referee && !officialNames.has(String(referee.name || "").trim().toLocaleLowerCase("vi")));
  const allRows = [
    ...fixedRows.map(([duty, referee], index) => ({ referee, note: [duty, referee?.note].filter(Boolean).join(" - "), number: index + 1, fixed: true })),
    ...randomRows.map((referee, index) => ({ referee, note: referee.note || "", number: fixedRows.length + index + 1 })),
  ];
  const rowFontSize = allRows.length > 28 ? 9 : allRows.length > 22 ? 10 : 11;
  const logoConfig = tournament.sponsorLogos || {};
  const logo = logoConfig.tournamentLogos?.[0] || logoConfig.systemLogo || appIcon;
  const matchCells = Array.from({ length: 6 }, () => "<td></td>").join("");
  const rowsHtml = allRows.map(({ referee, note, number, fixed: isFixed }) => `<tr class="${isFixed ? "fixed-row" : ""}">
    <td>${number}</td><td>${escapeHtml(referee?.name || "Chưa chọn")}</td>
    <td>${escapeHtml(referee?.unit || "")}</td><td>${referee ? formatRefereeRole(referee.refereeRole) : ""}</td>
    ${matchCells}<td>${escapeHtml(note)}</td>
  </tr>`).join("");

  return `<div class="mat-list-report">
    <style>
      *{box-sizing:border-box}body{margin:0}.mat-list-report{width:1400px;min-height:930px;padding:22px 28px;background:#fff;color:#000;font-family:'Segoe UI',Arial,sans-serif}
      .header{display:grid;grid-template-columns:150px 1fr 150px;align-items:start}.header img{width:115px;height:78px;object-fit:contain}.date{text-align:right;font-size:13px;padding-top:6px}
      h1{margin:4px 0 2px;text-align:center;font-size:25px;color:#0566b5;line-height:1.2}.subtitle{text-align:center;font-size:21px}.mat-name{text-align:center;font-size:23px;font-weight:800;margin:3px 0 8px}
      .meta{width:800px;margin:0 auto 10px;font-size:13px}.meta-row{display:flex;margin:3px 0}.meta-label{width:180px;font-weight:700}.meta-value{flex:1;border-bottom:2px solid #000;font-weight:700;padding:0 5px 2px}
      table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${rowFontSize}px}th,td{border:1.3px solid #000;padding:2px 3px;height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}th{text-align:center;font-size:${Math.max(8, rowFontSize - 1)}px;background:#fff200}td:first-child{text-align:center}.fixed-row td{font-weight:700;background:#eef6ff}
      
      .signatures{display:grid;grid-template-columns:1fr 1fr;text-align:center;margin-top:10px;font-size:13px;font-weight:700}.signature-title{margin-top:3px;font-size:15px}
    </style>
    <div class="header"><img src="${escapeHtml(logo)}"/><div><h1>${escapeHtml(report.eventName || tournament.name || "GIẢI ĐẤU")}</h1><div class="subtitle">DANH SÁCH TRỌNG TÀI</div><div class="mat-name">SÀN ${mat}</div></div><div class="date">${escapeHtml(formatDate(report.date || tournament.startDate || tournament.date))}</div></div>
    <div class="meta">
      <div class="meta-row"><span class="meta-label">Tổng trọng tài:</span><span class="meta-value">${escapeHtml(report.chairman || "")}</span></div>
      <div class="meta-row"><span class="meta-label">Phó tổng trọng tài:</span><span class="meta-value">${escapeHtml(report.deputyChairman || "")}</span></div>
      <div class="meta-row"><span class="meta-label">Thư ký ban trọng tài:</span><span class="meta-value">${escapeHtml(report.secretary || "")}</span></div>
    </div>
    <table><colgroup><col style="width:4%"><col style="width:20%"><col style="width:17%"><col style="width:13%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:10%"></colgroup><thead><tr><th style="height:62px;vertical-align:middle">STT</th><th style="height:62px;vertical-align:middle">HỌ VÀ TÊN</th><th style="height:62px;vertical-align:middle">ĐƠN VỊ</th><th style="height:62px;vertical-align:middle">TRÌNH ĐỘ</th><th style="padding:0;height:62px"><div style="height:20px;line-height:20px;text-align:center;border-bottom:1.3px solid #000">AK</div><div style="height:20px;line-height:20px;text-align:center;border-bottom:1.3px solid #000">AO</div><div style="height:22px;line-height:22px;text-align:center">TRẬN 1</div></th><th style="padding:0;height:62px"><div style="height:20px;border-bottom:1.3px solid #000"></div><div style="height:20px;border-bottom:1.3px solid #000"></div><div style="height:22px;line-height:22px;text-align:center">TRẬN 2</div></th><th style="padding:0;height:62px"><div style="height:20px;border-bottom:1.3px solid #000"></div><div style="height:20px;border-bottom:1.3px solid #000"></div><div style="height:22px;line-height:22px;text-align:center">TRẬN 3</div></th><th style="padding:0;height:62px"><div style="height:20px;border-bottom:1.3px solid #000"></div><div style="height:20px;border-bottom:1.3px solid #000"></div><div style="height:22px;line-height:22px;text-align:center">TRẬN 4</div></th><th style="padding:0;height:62px"><div style="height:20px;border-bottom:1.3px solid #000"></div><div style="height:20px;border-bottom:1.3px solid #000"></div><div style="height:22px;line-height:22px;text-align:center">TRẬN 5</div></th><th style="padding:0;height:62px"><div style="height:20px;border-bottom:1.3px solid #000"></div><div style="height:20px;border-bottom:1.3px solid #000"></div><div style="height:22px;line-height:22px;text-align:center">TRẬN 6</div></th><th style="height:62px;vertical-align:middle">GHI CHÚ</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <div class="signatures"><div><div>TM. HỘI ĐỒNG TRỌNG TÀI</div><div class="signature-title">TỔNG TRỌNG TÀI</div></div><div>NGƯỜI LẬP BẢNG</div></div>
  </div>`;
}
export async function exportRefereeMatListsPdf(tournament, management) {
  const matCount = Math.max(1, Number(management.matCount || 1));
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  for (let mat = 1; mat <= matCount; mat += 1) {
    if (mat > 1) pdf.addPage("a4", "landscape");
    const canvas = await renderHtml(buildSingleMatPageHtml(tournament, management, mat));
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const width = canvas.width * ratio;
    const height = canvas.height * ratio;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageWidth - width) / 2, 0, width, height);
  }
  const safeName = (tournament.name || "Giai_dau").replace(/[^a-zA-Z0-9À-ỹ]+/g, "_");
  pdf.save(`Danh_Sach_Trong_Tai_Theo_San_${safeName}.pdf`);
}