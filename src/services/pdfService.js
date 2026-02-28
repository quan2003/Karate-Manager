import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { isTrialLicense, getCurrentLicense } from "./licenseService";

/**
 * PDF Export Service - Client-side
 * Theme: SportData Replica (Gradient backgrounds, Header with Logo, Referees Table)
 */

const DEFAULT_SPLIT_THRESHOLD = 20; // Mặc định chia nhánh khi > 20 VĐV
const RENDER_SCALE = 2;

/**
 * Render one bracket HTML to a canvas image
 */
async function renderBracketToCanvas(htmlContent) {
  const tempContainer = document.createElement("div");
  tempContainer.style.position = "absolute";
  tempContainer.style.left = "-9999px";
  tempContainer.style.background = "white";
  tempContainer.style.padding = "0";
  tempContainer.innerHTML = htmlContent;
  document.body.appendChild(tempContainer);
  const canvas = await html2canvas(tempContainer, {
    scale: RENDER_SCALE, useCORS: true, allowTaint: true,
    backgroundColor: "#ffffff", logging: false,
    windowWidth: tempContainer.scrollWidth + 40,
    windowHeight: tempContainer.scrollHeight + 40,
  });
  document.body.removeChild(tempContainer);
  return canvas;
}

/**
 * Add a canvas image as a page to a jsPDF, returns {pdf, width, height}
 */
function addCanvasPage(pdf, canvas, isFirstPage) {
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const isPortrait = imgHeight >= imgWidth * 1.2;
  const orientation = isPortrait ? "portrait" : "landscape";
  const A4_WIDTH = orientation === "landscape" ? 297 : 210;
  const A4_HEIGHT = orientation === "landscape" ? 210 : 297;
  const MARGIN = 10;
  const safeWidth = A4_WIDTH - MARGIN * 2;
  const safeHeight = A4_HEIGHT - MARGIN * 2;
  const scaleX = safeWidth / (imgWidth / RENDER_SCALE);
  const scaleY = safeHeight / (imgHeight / RENDER_SCALE);
  const scale = Math.min(scaleX, scaleY);
  const finalWidth = (imgWidth / RENDER_SCALE) * scale;
  const finalHeight = (imgHeight / RENDER_SCALE) * scale;
  const offsetX = MARGIN + (safeWidth - finalWidth) / 2;
  const offsetY = MARGIN + (safeHeight - finalHeight) / 2;
  if (isFirstPage) {
    pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  } else {
    pdf.addPage([A4_WIDTH, A4_HEIGHT], orientation);
  }
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", offsetX, offsetY, finalWidth, finalHeight);
  if (isTrialLicense()) addTrialWatermark(pdf, A4_WIDTH, A4_HEIGHT);
  return pdf;
}

/**
 * Determine how many splits a category needs based on tournament settings
 * @param {Object} category
 * @param {Object} splitSettings - { enabled: bool, threshold: number }
 */
function getSplitCount(category, splitSettings) {
  if (!splitSettings?.enabled) return 1;
  const threshold = splitSettings.threshold || DEFAULT_SPLIT_THRESHOLD;
  const athleteCount = category.athletes?.length || 0;
  if (athleteCount <= threshold) return 1;
  return Math.ceil(athleteCount / Math.ceil(threshold / 2));
}

export async function exportBracketToPDF(
  category,
  tournamentName,
  filename = "so_do_thi_dau.pdf",
  options = {}
) {
  const scheduleInfo = options.scheduleInfo || null;
  const splitSettings = options.splitSettings || null;
  try {
    const originalCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";
    const numSplits = getSplitCount(category, splitSettings);
    let pdf = null;

    if (numSplits <= 1) {
      const html = generateBracketHTML(category, tournamentName, scheduleInfo, null, 1, 1);
      const canvas = await renderBracketToCanvas(html);
      pdf = addCanvasPage(null, canvas, true);
    } else {
      for (let half = 0; half < numSplits; half++) {
        const splitSchedule = { ...scheduleInfo, splitLabel: `Trận ${half + 1}/${numSplits}` };
        const html = generateBracketHTML(category, tournamentName, splitSchedule, half, half + 1, numSplits);
        const canvas = await renderBracketToCanvas(html);
        pdf = half === 0 ? addCanvasPage(null, canvas, true) : addCanvasPage(pdf, canvas, false);
      }
    }

    if (pdf) pdf.save(filename);
    document.body.style.cursor = originalCursor;
  } catch (error) {
    console.error("Lỗi xuất PDF:", error);
    alert("Lỗi xuất PDF: " + error.message);
    document.body.style.cursor = "default";
  }
}

function addTrialWatermark(pdf, pageWidth, pageHeight) {
  pdf.setFontSize(9);
  pdf.setTextColor(150, 150, 150);
  pdf.setFont("helvetica", "italic");
  pdf.text("TRIAL VERSION - PLEASE REGISTER", pageWidth - 5, pageHeight - 5, {
    align: "right",
  });
}

export async function exportAllBracketsToPDF(
  categories,
  tournamentName = "Giai_dau",
  filename = null,
  schedule = null,
  splitSettings = null
) {
  const categoriesWithBracket = categories.filter((c) => c.bracket);

  if (categoriesWithBracket.length === 0) {
    alert("Không có hạng mục nào đã bốc thăm để xuất!");
    return;
  }

  const finalFilename =
    filename || `${tournamentName.replace(/\s+/g, "_")}_tat_ca_so_do.pdf`;
  const isTrial = isTrialLicense();

  try {
    const originalCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";

    let pdf = null;
    let isFirstPage = true;

    let pageCount = 0;
    for (let i = 0; i < categoriesWithBracket.length; i++) {
      const category = categoriesWithBracket[i];
      const scheduleInfo = schedule ? schedule[category.id] : null;
      const numSplits = getSplitCount(category, splitSettings);

      for (let half = 0; half < numSplits; half++) {
        const splitSchedule = numSplits > 1
          ? { ...scheduleInfo, splitLabel: `Trận ${half + 1}/${numSplits}` }
          : scheduleInfo;
        const splitHalf = numSplits > 1 ? half : null;
        const html = generateBracketHTML(category, tournamentName, splitSchedule, splitHalf, half + 1, numSplits);
        const canvas = await renderBracketToCanvas(html);
        if (pageCount === 0) {
          pdf = addCanvasPage(null, canvas, true);
        } else {
          pdf = addCanvasPage(pdf, canvas, false);
        }
        pageCount++;
      }
    }

    if (pdf) {
      pdf.save(finalFilename);
    }

    document.body.style.cursor = originalCursor;
    alert(`Đã xuất ${pageCount} sơ đồ thành công!`);
  } catch (error) {
    console.error("Lỗi xuất PDF hàng loạt:", error);
    alert("Lỗi xuất PDF: " + error.message);
    document.body.style.cursor = "default";
  }
}

/**
 * Export Score Sheet to PDF
 * Generates a printable score sheet for all real matches in a category
 */
export function exportScoreSheetToPDF(
  category,
  matches,
  filename = "bang_diem.pdf"
) {
  if (!matches || matches.length === 0) {
    alert("Không có trận đấu nào để xuất bảng điểm!");
    return;
  }

  try {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    // Title
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("BANG DIEM THI DAU", pageWidth / 2, margin + 5, {
      align: "center",
    });

    // Category name
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    const categoryName = transliterate(category.name || "");
    pdf.text(categoryName, pageWidth / 2, margin + 12, { align: "center" });

    // Table header
    const tableTop = margin + 20;
    const colWidths = {
      stt: 12,
      round: 30,
      athlete1: 50,
      vs: 10,
      athlete2: 50,
      score: 28,
    };

    let currentY = tableTop;
    const rowHeight = 8;

    // Draw header row
    pdf.setFillColor(0, 0, 0);
    pdf.rect(margin, currentY, contentWidth, rowHeight, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");

    let x = margin;
    pdf.text("STT", x + colWidths.stt / 2, currentY + 5.5, {
      align: "center",
    });
    x += colWidths.stt;
    pdf.text("VONG", x + colWidths.round / 2, currentY + 5.5, {
      align: "center",
    });
    x += colWidths.round;
    pdf.text("VDV AKA", x + colWidths.athlete1 / 2, currentY + 5.5, {
      align: "center",
    });
    x += colWidths.athlete1;
    pdf.text("VS", x + colWidths.vs / 2, currentY + 5.5, {
      align: "center",
    });
    x += colWidths.vs;
    pdf.text("VDV AO", x + colWidths.athlete2 / 2, currentY + 5.5, {
      align: "center",
    });
    x += colWidths.athlete2;
    pdf.text("KET QUA", x + colWidths.score / 2, currentY + 5.5, {
      align: "center",
    });

    currentY += rowHeight;
    pdf.setTextColor(0, 0, 0);

    // Draw match rows
    const roundNames = category.bracket?.roundNames || [];
    matches.forEach((match, idx) => {
      if (currentY + rowHeight > pageHeight - margin - 10) {
        pdf.addPage();
        currentY = margin;
      }

      const bgColor = idx % 2 === 0 ? [255, 255, 255] : [240, 240, 240];
      pdf.setFillColor(...bgColor);
      pdf.rect(margin, currentY, contentWidth, rowHeight, "F");
      pdf.rect(margin, currentY, contentWidth, rowHeight, "S");

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");

      let cx = margin;

      // STT
      pdf.text(String(idx + 1), cx + colWidths.stt / 2, currentY + 5.5, {
        align: "center",
      });
      cx += colWidths.stt;

      // Round name
      const roundName =
        roundNames[match.round - 1] || `Vong ${match.round}`;
      pdf.text(
        transliterate(roundName).substring(0, 15),
        cx + 2,
        currentY + 5.5
      );
      cx += colWidths.round;

      // Athlete 1
      const name1 = transliterate(match.athlete1?.name || "---");
      const club1 = match.athlete1?.club
        ? ` (${transliterate(match.athlete1.club)})`
        : "";
      pdf.setFont("helvetica", "bold");
      pdf.text(
        (name1 + club1).substring(0, 28),
        cx + 2,
        currentY + 5.5
      );
      cx += colWidths.athlete1;

      // VS
      pdf.setFont("helvetica", "normal");
      pdf.text("-", cx + colWidths.vs / 2, currentY + 5.5, {
        align: "center",
      });
      cx += colWidths.vs;

      // Athlete 2
      const name2 = transliterate(match.athlete2?.name || "---");
      const club2 = match.athlete2?.club
        ? ` (${transliterate(match.athlete2.club)})`
        : "";
      pdf.setFont("helvetica", "bold");
      pdf.text(
        (name2 + club2).substring(0, 28),
        cx + 2,
        currentY + 5.5
      );
      cx += colWidths.athlete2;

      // Score (empty for filling in)
      pdf.setFont("helvetica", "normal");
      pdf.text("___:___", cx + colWidths.score / 2, currentY + 5.5, {
        align: "center",
      });

      currentY += rowHeight;
    });

    // Draw table border
    pdf.rect(margin, tableTop, contentWidth, currentY - tableTop, "S");

    if (isTrialLicense()) {
      addTrialWatermark(pdf, pageWidth, pageHeight);
    }

    pdf.save(filename);
  } catch (error) {
    console.error("Lỗi xuất bảng điểm PDF:", error);
    alert("Lỗi xuất bảng điểm: " + error.message);
  }
}

/**
 * Generate HTML cho bracket từ category data
 * Style: SportData gradients, Box Logo, Referees, Footer custom
 */
function generateBracketHTML(category, tournamentName = "", scheduleInfo = null, splitHalf = null, splitIndex = 1, totalSplits = 1) {
  const { bracket, name } = category;
  if (!bracket || !bracket.matches) return "<div>Không có dữ liệu</div>";
  const isTeamBracket = bracket.isTeamBracket || false;

  // Organize matches by round
  const fullMatchesByRound = {};
  bracket.matches.forEach((m) => {
    if (!fullMatchesByRound[m.round]) fullMatchesByRound[m.round] = [];
    fullMatchesByRound[m.round].push(m);
  });
  Object.keys(fullMatchesByRound).forEach((r) => {
    fullMatchesByRound[r].sort((a, b) => a.position - b.position);
  });

  const roundNames = bracket.roundNames || [];
  const numRounds = bracket.numRounds || Object.keys(fullMatchesByRound).length;

  // === SPLIT LOGIC: filter matches for upper/lower half ===
  const matchesByRound = {};
  if (splitHalf !== null && totalSplits > 1) {
    // Split by filtering first-round positions, then trace forward
    const round1 = fullMatchesByRound[1] || [];
    const totalR1 = round1.length;
    const perHalf = Math.ceil(totalR1 / totalSplits);
    const startPos = splitHalf * perHalf;
    const endPos = Math.min((splitHalf + 1) * perHalf, totalR1);
    // Get allowed positions for each round
    for (let r = 1; r <= numRounds; r++) {
      const allMatches = fullMatchesByRound[r] || [];
      const totalInRound = allMatches.length;
      const divisor = Math.pow(2, r - 1);
      const rStart = Math.floor(startPos / divisor);
      const rEnd = Math.ceil(endPos / divisor);
      matchesByRound[r] = allMatches.slice(rStart, rEnd);
    }
  } else {
    Object.assign(matchesByRound, fullMatchesByRound);
  }

  // Dimensions
  const cellWidth = 220;
  const cellHeight = 24;
  const cellGap = 50;
  const matchHeight = cellHeight + cellGap + cellHeight; 
  const baseGap = 16;
  const connectorWidth = 60; 

  const BASE_LINE_SPACING = matchHeight + baseGap; 

  // Match Numbering
  let globalMatchNumber = 0;
  const matchNumbers = {};
  for (let r = 1; r <= numRounds; r++) {
    const roundMatches = matchesByRound[r] || [];
    roundMatches.forEach((match) => {
      if (!match.isBye) {
        globalMatchNumber++;
        matchNumbers[match.id] = globalMatchNumber;
      }
    });
  }

  // Footer & License
  const license = getCurrentLicense();
  const year = new Date().getFullYear();
  let licenseText = "Bản quyền: BẢN DÙNG THỬ / CHƯA KÍCH HOẠT";
  
  if (license && license.active && !license.isTrial) {
      const expiry = license.expiryDate ? new Date(license.expiryDate).toLocaleDateString("vi-VN") : "Vĩnh viễn";
      licenseText = `Bản quyền: ${license.organizationName || license.owner || "Khách hàng"} (Hết hạn: ${expiry})`;
  }

  const footerText = `(c) Karate Manager 2000-${year} v1.0.0. ${licenseText}`;

  const css = `
    <style>
      .pdf-bracket * { box-sizing: border-box; margin: 0; padding: 0; }
      .pdf-bracket { 
        font-family: 'Arial', sans-serif; 
        background: white; 
        padding: 10px; 
        position: relative; 
        padding-bottom: 40px;
        min-height: 500px;
      }
      
      /* Header */
      .pdf-header { 
        display: flex; justify-content: space-between; align-items: flex-start;
        padding: 5px 10px; 
        background: #e2e8f0; 
        border: 1px solid #94a3b8;
        margin-bottom: 20px;
        position: relative;
      }
      .pdf-header-left { display: flex; flex-direction: column; }
      .pdf-category-name { font-size: 16px; font-weight: bold; color: #000; }
      .pdf-tournament-name { font-size: 11px; color: #333; margin-top: 2px; }
      
      .pdf-header-right { 
        position: absolute; right: 0; top: 0;
        background: white; border: 1px solid #000;
        padding: 10px; width: 220px; height: 70px;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
      }
      .pdf-logo-text { font-size: 18px; font-weight: 800; font-style: italic; color: #333; }
      .pdf-logo-sub { font-size: 10px; color: #666; }
      
      .pdf-info-bar { 
        position: absolute; right: 230px; top: 5px;
        display: flex; gap: 0; font-size: 11px; border: 1px solid #000;
      }
      .pdf-info-item { padding: 4px 10px; border-right: 1px solid #000; background: #ddd; }
      .pdf-info-item:last-child { border-right: none; background: #fff; }

      /* Rounds Layout */
      .pdf-content { display: flex; align-items: flex-start; gap: 0; margin-top: 40px; }
      .pdf-bracket-area { 
        display: flex; 
        flex: 1; 
        padding-right: 280px; 
      }
      .pdf-rounds { display: flex; align-items: flex-start; }
      .pdf-round { display: flex; flex-direction: column; }
      .pdf-round-header { 
        text-align: center; padding: 5px 0; margin-bottom: 10px; min-width: ${cellWidth}px;
      }
      .pdf-round-title { font-size: 12px; font-weight: bold; color: #000; text-transform: uppercase; border-bottom: 2px solid #ccc; display: inline-block; padding-bottom: 2px; }
      .pdf-round-body { display: flex; flex-direction: column; padding-right: ${connectorWidth}px; }
      
      /* Match Wrapper - ABSOLUTE LAYOUT */
      .pdf-match-wrapper { 
        display: flex; 
        flex-direction: column; 
        width: ${cellWidth}px; 
        position: relative; 
      }
      .pdf-match-pair { display: contents; } 
      .pdf-match-wrapper.bye { opacity: 0.6; }

      /* Cells */
      .pdf-cell { 
        display: flex; align-items: center; gap: 4px;
        width: 100%; height: ${cellHeight}px; 
        padding: 0 8px 0 12px; 
        border: 1px solid #64748b;
        background: #fff;
        position: relative;
        border-right: none;
        font-size: 12px;
      }
      .pdf-cell.aka {
        background: linear-gradient(to right, #fee2e2 0%, #ffffff 50%);
        border: 1px solid #fca5a5;
        border-left: 4px solid #dc2626;
        border-right: none;
      }
      .pdf-cell.ao {
        background: linear-gradient(to right, #dbeafe 0%, #ffffff 50%);
        border: 1px solid #93c5fd;
        border-left: 4px solid #2563eb;
        border-right: none;
      }
      .pdf-cell.aka.empty {
        background: linear-gradient(to right, #fee2e2 0%, #ffffff 50%);
        border: 1px solid #fca5a5;
        border-left: 4px solid #dc2626;
        border-right: none;
      }
      .pdf-cell.ao.empty {
        background: linear-gradient(to right, #dbeafe 0%, #ffffff 50%);
        border: 1px solid #93c5fd;
        border-left: 4px solid #2563eb;
        border-right: none;
      }
      
      .pdf-name { 
        flex: 1; font-size: 12px; font-weight: 600; color: #1f2937; 
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
      }
      .pdf-club { 
        font-size: 10px; color: #64748b; font-weight: 500;
        white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; 
      }

      /* Connectors */
      .pdf-connector { 
        position: absolute; 
        right: -${connectorWidth}px;
        top: 0; 
        width: ${connectorWidth}px; 
        z-index: 10;
        pointer-events: none;
      }
      .pdf-v-line { position: absolute; left: 0; width: 1px; background: #64748b; }
      .pdf-h-mid { position: absolute; left: 0; width: 100%; height: 1px; background: #64748b; }

      /* Match Number */
      .pdf-match-number { 
        position: absolute; 
        right: 5px;
        transform: translateY(-50%);
        font-size: 15px; font-weight: 700; color: #000; 
        background: #fff; border-radius: 50%;
        width: 20px; height: 20px;
        display: flex; align-items: center; justify-content: center;
        z-index: 60;
        border: 2px solid #ef4444;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
      }

      /* Champion Slot - ABSOLUTE positioning */
      .pdf-champion-slot {
        position: absolute;
        right: -310px; 
        display: flex;
        align-items: center;
        gap: 4px;
        height: ${cellHeight}px;
        padding: 0 8px 0 12px;
        background: linear-gradient(to right, #fef3c7 0%, #ffffff 50%);
        border: 1px solid #fcd34d;
        border-left: 4px solid #f59e0b;
        border-right: none;
        font-size: 12px;
        min-width: 150px;
        max-width: 250px;
        z-index: 100;
      }
      .pdf-champion-icon { font-size: 14px; }
      .pdf-champion-name { 
        flex: 1; font-weight: 600; color: #1f2937;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pdf-champion-club {
        font-size: 10px; color: #64748b; font-weight: 500; white-space: nowrap;
      }

      /* Champion Connector */
      .pdf-champion-connector {
        position: absolute;
        right: -310px; 
        width: 250px; 
        height: 1px; 
        background: #64748b;
        z-index: 9;
      }
      
      /* Medal Table */
      .pdf-medal-table { 
        margin-left: 20px; 
        min-width: 200px; 
        border: 1px solid #000; background: white;
        align-self: flex-start; margin-top: 0;
        z-index: 200;
      }
      .pdf-medal-header { background: #000; color: white; padding: 8px 10px; font-size: 12px; font-weight: bold; text-align: center; text-transform: uppercase; }
      .pdf-medal-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid #ccc; font-size: 11px; font-weight: 600; }
      .pdf-medal-row:last-child { border-bottom: none; }
      
      /* Referees Box */
      .pdf-referees-box { position: absolute; bottom: 40px; right: 20px; border: 1px solid #333; width: 300px; }
      .pdf-ref-header { background: #ccc; font-size: 10px; font-weight: bold; padding: 2px 5px; border-bottom: 1px solid #333; }
      .pdf-ref-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; }
      .pdf-ref-cell { height: 20px; border-right: 1px solid #333; border-bottom: 1px solid #333; }
      .pdf-ref-cell:last-child { border-right: none; }
      
      /* Footer */
      .pdf-footer { position: absolute; bottom: 5px; left: 0; width: 100%; text-align: center; font-size: 10px; color: #000; font-family: 'Courier New', monospace; }
    </style>
  `;

  // Construction
  let html = `${css}<div class="pdf-bracket">`;
  // Schedule info for header
  const matLabel = scheduleInfo?.mat ? `Thảm ${scheduleInfo.mat}` : 'Thảm';
  const timeLabel = scheduleInfo?.time || '';
  const dateLabel = scheduleInfo?.date 
    ? new Date(scheduleInfo.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const splitLabel = totalSplits > 1 
    ? (scheduleInfo?.splitLabel || `Trận ${splitIndex}/${totalSplits}`)
    : 'Trận';
  
  html += `<div class="pdf-header">`;
  html += `<div class="pdf-header-left"><div class="pdf-category-name">${name}${totalSplits > 1 ? ' - ' + splitLabel : ''}</div><div class="pdf-tournament-name">${tournamentName}</div></div>`;
  html += `<div class="pdf-info-bar">`;
  if (dateLabel) html += `<div class="pdf-info-item">${dateLabel}</div>`;
  html += `<div class="pdf-info-item">${matLabel}</div>`;
  if (timeLabel) html += `<div class="pdf-info-item">${timeLabel}</div>`;
  html += `<div class="pdf-info-item" style="background:#fff;">${splitLabel}</div>`;
  html += `</div>`;
  html += `<div class="pdf-header-right"><div class="pdf-logo-text">Karate</div><div class="pdf-logo-sub">QUẢN LÝ GIẢI ĐẤU</div></div>`;
  html += `</div>`; 
  html += `<div class="pdf-content"><div class="pdf-bracket-area"><div class="pdf-rounds">`;

  // Render Rounds
  for (let r = 1; r <= numRounds; r++) {
    const roundMatches = matchesByRound[r] || [];
    const roundTitle = roundNames[r - 1] || `Vòng ${r}`;
    const roundIndex = r - 1;
    const gapMultiplier = Math.pow(2, roundIndex);
    const CELL_CENTER = cellHeight / 2;
    const lineSpacing = (BASE_LINE_SPACING * gapMultiplier) / 2;
    const athleteGap = roundIndex === 0 ? cellGap : lineSpacing - cellHeight;
    const currentMatchHeight = cellHeight + athleteGap + cellHeight;
    const matchGapValue = BASE_LINE_SPACING * gapMultiplier - currentMatchHeight;

    let topOffset = 0;
    if (roundIndex > 0) {
      let prevTopOffset = 0;
      let prevAthleteGap = cellGap;
      for (let i = 1; i < roundIndex; i++) {
        const iGapMultiplier = Math.pow(2, i);
        const iLineSpacing = (BASE_LINE_SPACING * iGapMultiplier) / 2;
        const iAthleteGap = iLineSpacing - cellHeight;
        const prevLineY = prevTopOffset + cellHeight + prevAthleteGap / 2;
        prevTopOffset = prevLineY - CELL_CENTER;
        prevAthleteGap = iAthleteGap;
      }
      const prevLineY = prevTopOffset + cellHeight + prevAthleteGap / 2;
      topOffset = prevLineY - CELL_CENTER;
    }

    html += `<div class="pdf-round"><div class="pdf-round-header"><span class="pdf-round-title">${roundTitle}</span></div><div class="pdf-round-body">`;

    roundMatches.forEach((match, idx) => {
      const { athlete1, athlete2, winner, isBye } = match;
      const isWinner1 = winner?.id === athlete1?.id;
      const isWinner2 = winner?.id === athlete2?.id;
      const marginTop = idx === 0 ? topOffset : 0;
      const matchNum = matchNumbers[match.id];
      const isLastRound = r === numRounds;

      // Wrapper
      html += `<div class="pdf-match-wrapper ${isBye ? "bye" : ""}" style="margin-top: ${marginTop}px; margin-bottom: ${matchGapValue}px;">`;
      
      // Cell 1
      html += `<div class="pdf-cell aka ${isWinner1 ? "winner" : ""} ${!athlete1 ? "empty" : ""}"><span class="pdf-name">${athlete1?.name || ""}</span>`;
      if (!isTeamBracket && athlete1?.club) html += `<span class="pdf-club">(${athlete1.club})</span>`;
      if (isTeamBracket && athlete1?.members) html += `<span class="pdf-club">(${athlete1.members.map(m => m.name.trim().split(/\s+/).pop()).join(', ')})</span>`;
      html += `</div>`;

      // Cell 2
      html += `<div class="pdf-cell ao ${isWinner2 ? "winner" : ""} ${!athlete2 ? "empty" : ""}" style="margin-top: ${athleteGap}px;"><span class="pdf-name">${athlete2?.name || ""}</span>`;
      if (!isTeamBracket && athlete2?.club) html += `<span class="pdf-club">(${athlete2.club})</span>`;
      if (isTeamBracket && athlete2?.members) html += `<span class="pdf-club">(${athlete2.members.map(m => m.name.trim().split(/\s+/).pop()).join(', ')})</span>`;
      html += `</div>`;

      // Connectors
      const lineTop = cellHeight;
      const lineHeight = athleteGap;
      const lineCenter = cellHeight + athleteGap / 2;

      // Vertical line always rendered
      html += `<div class="pdf-connector" style="height: ${currentMatchHeight}px;">`;
      html += `<div class="pdf-v-line" style="top: ${lineTop}px; height: ${lineHeight}px;"></div>`;
      html += `<div class="pdf-h-mid" style="top: ${lineCenter}px;"></div>`;
      html += `</div>`;

      // Match Number
      if (matchNum) {
        html += `<div class="pdf-match-number" style="top: ${lineCenter}px;">${matchNum}</div>`;
      }

      // Champion Slot (Absolute)
      if (isLastRound) {
        html += `<div class="pdf-champion-connector" style="top: ${lineCenter}px; right: -310px;"></div>`;
        html += `<div class="pdf-champion-slot" style="top: ${lineCenter - cellHeight / 2}px; right: -310px;">`;
        html += `<span class="pdf-champion-icon">🥇</span>`;
        html += `<span class="pdf-champion-name">${winner?.name || ""}</span>`;
        if (!isTeamBracket && winner?.club) html += `<span class="pdf-champion-club">(${winner.club})</span>`;
        if (isTeamBracket && winner?.members) html += `<span class="pdf-champion-club">(${winner.members.map(m => m.name.trim().split(/\s+/).pop()).join(', ')})</span>`;
        html += `</div>`;
      }

      html += `</div>`; // end match-wrapper
    });
    html += `</div></div>`; // end round
  }
  html += `</div></div>`; // end rounds & bracket-area

  // Medal Table
  html += `<div class="pdf-medal-table">`;
  html += `<div class="pdf-medal-header">KẾT QUẢ</div>`;
  html += `<div class="pdf-medal-row"><span class="pdf-medal-label">1.</span><span class="pdf-medal-name">...................................</span></div>`;
  html += `<div class="pdf-medal-row"><span class="pdf-medal-label">2.</span><span class="pdf-medal-name">...................................</span></div>`;
  html += `<div class="pdf-medal-row"><span class="pdf-medal-label">3.</span><span class="pdf-medal-name">...................................</span></div>`;
  html += `<div class="pdf-medal-row"><span class="pdf-medal-label">3.</span><span class="pdf-medal-name">...................................</span></div>`;
  html += `</div>`;

  html += `</div>`; // end content

  // Referees Box
  html += `<div class="pdf-referees-box">`;
  html += `<div class="pdf-ref-header">TRỌNG TÀI</div>`;
  html += `<div class="pdf-ref-grid">`;
  html += `<div class="pdf-ref-cell"></div><div class="pdf-ref-cell"></div><div class="pdf-ref-cell"></div>`;
  html += `<div class="pdf-ref-cell"></div><div class="pdf-ref-cell"></div><div class="pdf-ref-cell"></div>`;
  html += `</div></div>`;

  // Footer
  html += `<div class="pdf-footer">${footerText}</div>`;

  html += `</div>`; // end pdf-bracket
  return html;
}

function transliterate(str) {
  if (!str) return "";
  const map = {
    à: "a",
    á: "a",
    ả: "a",
    ã: "a",
    ạ: "a",
    ă: "a",
    ằ: "a",
    ắ: "a",
    ẳ: "a",
    ẵ: "a",
    ặ: "a",
    â: "a",
    ầ: "a",
    ấ: "a",
    ẩ: "a",
    ẫ: "a",
    ậ: "a",
    đ: "d",
    è: "e",
    é: "e",
    ẻ: "e",
    ẽ: "e",
    ẹ: "e",
    ê: "e",
    ề: "e",
    ế: "e",
    ể: "e",
    ễ: "e",
    ệ: "e",
    ì: "i",
    í: "i",
    ỉ: "i",
    ĩ: "i",
    ị: "i",
    ò: "o",
    ó: "o",
    ỏ: "o",
    õ: "o",
    ọ: "o",
    ô: "o",
    ồ: "o",
    ố: "o",
    ổ: "o",
    ỗ: "o",
    ộ: "o",
    ơ: "o",
    ờ: "o",
    ớ: "o",
    ở: "o",
    ỡ: "o",
    ợ: "o",
    ù: "u",
    ú: "u",
    ủ: "u",
    ũ: "u",
    ụ: "u",
    ư: "u",
    ừ: "u",
    ứ: "u",
    ử: "u",
    ữ: "u",
    ự: "u",
    ỳ: "y",
    ý: "y",
    ỷ: "y",
    ỹ: "y",
    ỵ: "y",
    À: "A",
    Á: "A",
    Ả: "A",
    Ã: "A",
    Ạ: "A",
    Ă: "A",
    Ằ: "A",
    Ắ: "A",
    Ẳ: "A",
    Ẵ: "A",
    Ặ: "A",
    Â: "A",
    Ầ: "A",
    Ấ: "A",
    Ẩ: "A",
    Ẫ: "A",
    Ậ: "A",
    Đ: "D",
    È: "E",
    É: "E",
    Ẻ: "E",
    Ẽ: "E",
    Ẹ: "E",
    Ê: "E",
    Ề: "E",
    Ế: "E",
    Ể: "E",
    Ễ: "E",
    Ệ: "E",
    Ì: "I",
    Í: "I",
    Ỉ: "I",
    Ĩ: "I",
    Ị: "I",
    Ò: "O",
    Ó: "O",
    Ỏ: "O",
    Õ: "O",
    Ọ: "O",
    Ô: "O",
    Ồ: "O",
    Ố: "O",
    Ổ: "O",
    Ỗ: "O",
    Ộ: "O",
    Ơ: "O",
    Ờ: "O",
    Ớ: "O",
    Ở: "O",
    Ỡ: "O",
    Ợ: "O",
    Ù: "U",
    Ú: "U",
    Ủ: "U",
    Ũ: "U",
    Ụ: "U",
    Ư: "U",
    Ừ: "U",
    Ứ: "U",
    Ử: "U",
    Ữ: "U",
    Ự: "U",
    Ỳ: "Y",
    Ý: "Y",
    Ỷ: "Y",
    Ỹ: "Y",
    Ỵ: "Y",
  };
  return str
    .split("")
    .map((char) => map[char] || char)
    .join("");
}

function removeVietnameseTones(str) {
  if (!str) return "";
  const map = {
    à: "a",
    á: "a",
    ả: "a",
    ã: "a",
    ạ: "a",
    ă: "a",
    ằ: "a",
    ắ: "a",
    ẳ: "a",
    ẵ: "a",
    ặ: "a",
    â: "a",
    ầ: "a",
    ấ: "a",
    ẩ: "a",
    ẫ: "a",
    ậ: "a",
    đ: "d",
    è: "e",
    é: "e",
    ẻ: "e",
    ẽ: "e",
    ẹ: "e",
    ê: "e",
    ề: "e",
    ế: "e",
    ể: "e",
    ễ: "e",
    ệ: "e",
    ì: "i",
    í: "i",
    ỉ: "i",
    ĩ: "i",
    ị: "i",
    ò: "o",
    ó: "o",
    ỏ: "o",
    õ: "o",
    ọ: "o",
    ô: "o",
    ồ: "o",
    ố: "o",
    ổ: "o",
    ỗ: "o",
    ộ: "o",
    ơ: "o",
    ờ: "o",
    ớ: "o",
    ở: "o",
    ỡ: "o",
    ợ: "o",
    ù: "u",
    ú: "u",
    ủ: "u",
    ũ: "u",
    ụ: "u",
    ư: "u",
    ừ: "u",
    ứ: "u",
    ử: "u",
    ữ: "u",
    ự: "u",
    ỳ: "y",
    ý: "y",
    ỷ: "y",
    ỹ: "y",
    ỵ: "y",
    À: "A",
    Á: "A",
    Ả: "A",
    Ã: "A",
    Ạ: "A",
    Ă: "A",
    Ằ: "A",
    Ắ: "A",
    Ẳ: "A",
    Ẵ: "A",
    Ặ: "A",
    Â: "A",
    Ầ: "A",
    Ấ: "A",
    Ẩ: "A",
    Ẫ: "A",
    Ậ: "A",
    Đ: "D",
    È: "E",
    É: "E",
    Ẻ: "E",
    Ẽ: "E",
    Ẹ: "E",
    Ê: "E",
    Ề: "E",
    Ế: "E",
    Ể: "E",
    Ễ: "E",
    Ệ: "E",
    Ì: "I",
    Í: "I",
    Ỉ: "I",
    Ĩ: "I",
    Ị: "I",
    Ò: "O",
    Ó: "O",
    Ỏ: "O",
    Õ: "O",
    Ọ: "O",
    Ô: "O",
    Ồ: "O",
    Ố: "O",
    Ổ: "O",
    Ỗ: "O",
    Ộ: "O",
    Ơ: "O",
    Ờ: "O",
    Ớ: "O",
    Ở: "O",
    Ỡ: "O",
    Ợ: "O",
    Ù: "U",
    Ú: "U",
    Ủ: "U",
    Ũ: "U",
    Ụ: "U",
    Ư: "U",
    Ừ: "U",
    Ứ: "U",
    Ử: "U",
    Ữ: "U",
    Ự: "U",
    Ỳ: "Y",
    Ý: "Y",
    Ỷ: "Y",
    Ỹ: "Y",
    Ỵ: "Y",
  };
  return str
    .split("")
    .map((char) => map[char] || char)
    .join("");
}
