import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { isTrialLicense, getCurrentLicense } from "./licenseService";

/**
 * PDF Export Service - Client-side
 * Theme: SportData Replica (Gradient backgrounds, Header with Logo, Referees Table)
 */

export async function exportBracketToPDF(
  category,
  tournamentName,
  filename = "so_do_thi_dau.pdf",
  options = {}
) {
  try {
    const originalCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";

    const tempContainer = document.createElement("div");
    tempContainer.id = `temp-export-bracket`;
    tempContainer.style.position = "absolute";
    tempContainer.style.left = "-9999px";
    tempContainer.style.background = "white";
    tempContainer.style.padding = "0";

    tempContainer.innerHTML = generateBracketHTML(category, tournamentName);
    document.body.appendChild(tempContainer);

    const canvas = await html2canvas(tempContainer, {
      scale: 4,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: tempContainer.scrollWidth + 40,
      windowHeight: tempContainer.scrollHeight + 40,
    });

    document.body.removeChild(tempContainer);

    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    // Auto-detect orientation based on aspect ratio
    const isPortrait = imgHeight >= imgWidth * 1.2;
    const orientation = isPortrait ? "portrait" : "landscape";

    const A4_WIDTH = orientation === "landscape" ? 297 : 210;
    const A4_HEIGHT = orientation === "landscape" ? 210 : 297;
    const MARGIN = 10;

    const safeWidth = A4_WIDTH - MARGIN * 2;
    const safeHeight = A4_HEIGHT - MARGIN * 2;

    const contentWidth = imgWidth / 4;
    const contentHeight = imgHeight / 4;

    const scaleX = safeWidth / contentWidth;
    const scaleY = safeHeight / contentHeight;
    const scale = Math.min(scaleX, scaleY);

    const finalWidth = contentWidth * scale;
    const finalHeight = contentHeight * scale;

    const offsetX = MARGIN + (safeWidth - finalWidth) / 2;
    const offsetY = MARGIN + (safeHeight - finalHeight) / 2;

    const pdf = new jsPDF({
      orientation: orientation,
      unit: "mm",
      format: "a4",
    });

    const imgData = canvas.toDataURL("image/png", 1.0);
    pdf.addImage(imgData, "PNG", offsetX, offsetY, finalWidth, finalHeight);

    if (isTrialLicense()) {
      addTrialWatermark(pdf, A4_WIDTH, A4_HEIGHT);
    }

    pdf.save(filename);
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
  filename = null
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

    for (let i = 0; i < categoriesWithBracket.length; i++) {
      const category = categoriesWithBracket[i];

      const tempContainer = document.createElement("div");
      tempContainer.id = `temp-bracket-${category.id}`;
      tempContainer.style.position = "absolute";
      tempContainer.style.left = "-9999px";
      tempContainer.style.background = "white";
      tempContainer.style.padding = "0";
      tempContainer.innerHTML = generateBracketHTML(category, tournamentName);
      document.body.appendChild(tempContainer);

      const canvas = await html2canvas(tempContainer, {
        scale: 4,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: tempContainer.scrollWidth + 40,
        windowHeight: tempContainer.scrollHeight + 40,
      });

      document.body.removeChild(tempContainer);

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const orientation = "landscape";

      const A4_WIDTH = 297;
      const A4_HEIGHT = 210;
      const MARGIN = 10;

      const safeWidth = A4_WIDTH - MARGIN * 2;
      const safeHeight = A4_HEIGHT - MARGIN * 2;

      const contentWidth = imgWidth / 4;
      const contentHeight = imgHeight / 4;

      const scaleX = safeWidth / contentWidth;
      const scaleY = safeHeight / contentHeight;
      const scale = Math.min(scaleX, scaleY);

      const finalWidth = contentWidth * scale;
      const finalHeight = contentHeight * scale;

      const offsetX = MARGIN + (safeWidth - finalWidth) / 2;
      const offsetY = MARGIN + (safeHeight - finalHeight) / 2;

      if (isFirstPage) {
        pdf = new jsPDF({
          orientation: orientation,
          unit: "mm",
          format: "a4",
        });
        isFirstPage = false;
      } else {
        pdf.addPage([A4_WIDTH, A4_HEIGHT], orientation);
      }

      const imgData = canvas.toDataURL("image/png", 1.0);
      pdf.addImage(imgData, "PNG", offsetX, offsetY, finalWidth, finalHeight);

      if (isTrial) {
        addTrialWatermark(pdf, A4_WIDTH, A4_HEIGHT);
      }
    }

    if (pdf) {
      pdf.save(finalFilename);
    }

    document.body.style.cursor = originalCursor;
    alert(`Đã xuất ${categoriesWithBracket.length} sơ đồ thành công!`);
  } catch (error) {
    console.error("Lỗi xuất PDF hàng loạt:", error);
    alert("Lỗi xuất PDF: " + error.message);
    document.body.style.cursor = "default";
  }
}

/**
 * Generate HTML cho bracket từ category data
 * Style: SportData gradients, Box Logo, Referees, Footer custom
 */
function generateBracketHTML(category, tournamentName = "") {
  const { bracket, name } = category;
  if (!bracket || !bracket.matches) return "<div>Không có dữ liệu</div>";

  const matchesByRound = {};
  bracket.matches.forEach((m) => {
    if (!matchesByRound[m.round]) matchesByRound[m.round] = [];
    matchesByRound[m.round].push(m);
  });

  Object.keys(matchesByRound).forEach((r) => {
    matchesByRound[r].sort((a, b) => a.position - b.position);
  });
  const roundNames = bracket.roundNames || [];
  const numRounds = bracket.numRounds || Object.keys(matchesByRound).length;
  // Dimensions - ĐỒNG BỘ VỚI Bracket.jsx
  const cellWidth = 220; // Giảm để fit PDF tốt hơn
  const cellHeight = 24; // Đồng bộ với CELL_HEIGHT trong Bracket.jsx
  const cellGap = 50; // Đồng bộ với GAP_BETWEEN_ATHLETES trong Bracket.jsx
  const matchHeight = cellHeight + cellGap + cellHeight; // = 98px như desktop
  const baseGap = 16; // Đồng bộ với BASE_MATCH_GAP trong Bracket.jsx
  const connectorWidth = 40;
  const paddingLeft = 0; // Không cần padding left cho số trận vì đặt bên phải

  // Đồng bộ công thức tính toán với Bracket.jsx
  const BASE_LINE_SPACING = matchHeight + baseGap; // = 114px

  // Match Numbering
  let globalMatchNumber = 0;
  const matchNumbers = {};
  for (let r = 1; r <= numRounds; r++) {
    const roundMatches = matchesByRound[r] || [];
    roundMatches.forEach((match) => {
      // Number ALL matches except Byes, even if empty (for future rounds)
      if (!match.isBye) {
        globalMatchNumber++;
        matchNumbers[match.id] = globalMatchNumber;
      }
    });
  }

  // Footer & License
  const license = getCurrentLicense();
  const year = new Date().getFullYear();
  const licenseText =
    license && license.active && !license.isTrial
      ? `Bản quyền: ${license.owner || "Người dùng"} (hết hạn 2099-12-31)`
      : "Bản quyền: BẢN DÙNG THỬ / CHƯA KÍCH HOẠT";

  // FIXED DATE as requested
  const footerText = `(c)Karate Manager 2000-${year} (2026-01-01) v 1.0.0 ${licenseText}`;

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
      
      /* Header with SportData style: Title left, Logo right */
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

      /* Rounds */
      .pdf-content { display: flex; align-items: flex-start; gap: 0; margin-top: 40px; }
      .pdf-bracket-area { display: flex; flex: 1; }
      .pdf-rounds { display: flex; align-items: flex-start; }
      .pdf-round { display: flex; flex-direction: column; }
      .pdf-round-header { 
        text-align: center; padding: 5px 0; margin-bottom: 10px; min-width: ${cellWidth}px;
      }
      .pdf-round-title { font-size: 12px; font-weight: bold; color: #000; text-transform: uppercase; border-bottom: 2px solid #ccc; display: inline-block; padding-bottom: 2px; }
      .pdf-round-body { display: flex; flex-direction: column; padding-right: ${connectorWidth}px; }
        /* Match Layout */
      .pdf-match-wrapper { 
        display: flex; align-items: flex-start; position: relative; 
      }
      .pdf-match-pair { display: flex; flex-direction: column; width: ${cellWidth}px; position: relative; }
      .pdf-match-pair.bye { opacity: 0.6; }
        /* Cell with Gradients - đồng bộ với Bracket.css */
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
        /* AKA (Red) Gradient - đồng bộ với desktop */
      .pdf-cell.aka {
        background: linear-gradient(to right, #fee2e2 0%, #ffffff 50%);
        border: 1px solid #fca5a5;
        border-left: 4px solid #dc2626;
        border-right: none;
      }
      /* AO (Blue) Gradient - đồng bộ với desktop */
      .pdf-cell.ao {
        background: linear-gradient(to right, #dbeafe 0%, #ffffff 50%);
        border: 1px solid #93c5fd;
        border-left: 4px solid #2563eb;
        border-right: none;
      }
      /* Ô trống - giữ nguyên gradient nhưng không có tên */
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
      }      /* Connectors - Đồng bộ với Desktop Bracket.css */
      .pdf-connector { 
        position: absolute; 
        right: -${connectorWidth}px;
        top: 0; 
        width: ${connectorWidth}px; 
        z-index: 10;
        pointer-events: none;
      }
      /* Đường dọc - đồng bộ với .connector::before */
      .pdf-v-line { 
        position: absolute; 
        left: 0;
        width: 1px; 
        background: #64748b; 
      }
      /* Đường ngang - đồng bộ với .connector::after */
      .pdf-h-mid { 
        position: absolute; 
        left: 0;
        width: 100%; 
        height: 1px; 
        background: #64748b; 
      }      /* Số trận - đồng bộ với desktop Bracket.css */
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

      /* Ô VÔ ĐỊCH (HCV) - CHAMPION SLOT - đồng bộ với desktop */
      .pdf-champion-slot {
        position: absolute;
        right: -200px;
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
      }
      .pdf-champion-icon { font-size: 14px; }
      .pdf-champion-name { 
        flex: 1; font-weight: 600; color: #1f2937;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pdf-champion-club {
        font-size: 10px; color: #64748b; font-weight: 500; white-space: nowrap;
      }

      /* Connector cho trận chung kết - nối đến ô vô địch */
      .pdf-champion-connector {
        position: absolute;
        right: -${connectorWidth}px;
        top: 0;
        width: 160px;
        z-index: 10;
        pointer-events: none;
      }
      .pdf-champion-connector .pdf-v-line {
        position: absolute; left: 0; width: 1px; background: #64748b;
      }
      .pdf-champion-connector .pdf-h-mid {
        position: absolute; left: 0; width: 160px; height: 1px; background: #64748b;
      }

      /* Medal table */
      .pdf-medal-table { 
        margin-left: 40px; min-width: 200px; 
        border: 1px solid #000; background: white;
        align-self: flex-start; margin-top: 0;
      }
      .pdf-medal-header { 
        background: #000; color: white; padding: 8px 10px; 
        font-size: 12px; font-weight: bold; text-align: center;
        text-transform: uppercase;
      }
      .pdf-medal-row { 
        display: flex; align-items: center; gap: 10px; padding: 8px 10px; 
        border-bottom: 1px solid #ccc; font-size: 11px; font-weight: 600;
      }
      .pdf-medal-row:last-child { border-bottom: none; }
      
      /* Referees Box (SportData style) */
      .pdf-referees-box {
        position: absolute; bottom: 40px; right: 20px;
        border: 1px solid #333; width: 300px;
      }
      .pdf-ref-header { background: #ccc; font-size: 10px; font-weight: bold; padding: 2px 5px; border-bottom: 1px solid #333; }
      .pdf-ref-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; }
      .pdf-ref-cell { height: 20px; border-right: 1px solid #333; border-bottom: 1px solid #333; }
      .pdf-ref-cell:last-child { border-right: none; }
      
      /* Footer */
      .pdf-footer {
        position: absolute; bottom: 5px; left: 0; width: 100%;
        text-align: center; font-size: 10px; color: #000;
        font-family: 'Courier New', monospace;
      }
    </style>
  `;

  // Construction
  let html = `${css}<div class="pdf-bracket">`;

  // Header
  html += `<div class="pdf-header">`;
  html += `<div class="pdf-header-left">`;
  html += `<div class="pdf-category-name">${name}</div>`;
  html += `<div class="pdf-tournament-name">${tournamentName}</div>`;
  html += `</div>`;
  // Info bar like SportData
  html += `<div class="pdf-info-bar">`;
  html += `<div class="pdf-info-item">Thảm</div>`;
  html += `<div class="pdf-info-item">Trận</div>`;
  html += `</div>`;
  // Logo Box
  html += `<div class="pdf-header-right">`;
  html += `<div class="pdf-logo-text">Karate</div>`;
  html += `<div class="pdf-logo-sub">QUẢN LÝ GIẢI ĐẤU</div>`;
  html += `</div>`;
  html += `</div>`; // end header
  html += `<div class="pdf-content">`;
  html += `<div class="pdf-bracket-area"><div class="pdf-rounds">`;

  // Render Rounds - ĐỒNG BỘ VỚI Bracket.jsx
  for (let r = 1; r <= numRounds; r++) {
    const roundMatches = matchesByRound[r] || [];
    const roundTitle = roundNames[r - 1] || `Vòng ${r}`;
    const roundIndex = r - 1;

    // Đồng bộ công thức tính toán với Bracket.jsx
    const gapMultiplier = Math.pow(2, roundIndex);
    const CELL_CENTER = cellHeight / 2; // = 12px

    // lineSpacing cho vòng này
    const lineSpacing = (BASE_LINE_SPACING * gapMultiplier) / 2;

    // athleteGap = lineSpacing - cellHeight (đồng bộ với Bracket.jsx)
    const athleteGap = roundIndex === 0 ? cellGap : lineSpacing - cellHeight;

    // Chiều cao thực của match ở vòng này
    const currentMatchHeight = cellHeight + athleteGap + cellHeight;

    // Khoảng cách giữa các trận trong cùng 1 vòng
    const matchGapValue =
      BASE_LINE_SPACING * gapMultiplier - currentMatchHeight;

    // TopOffset: căn VĐV1 với đường ngang từ vòng trước
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
    html += `<div class="pdf-round">`;
    html += `<div class="pdf-round-header"><span class="pdf-round-title">${roundTitle}</span></div>`;
    html += `<div class="pdf-round-body">`;

    roundMatches.forEach((match, idx) => {
      const { athlete1, athlete2, winner, isBye } = match;
      const isWinner1 = winner?.id === athlete1?.id;
      const isWinner2 = winner?.id === athlete2?.id;

      const marginTop = idx === 0 ? topOffset : 0;
      const matchNum = matchNumbers[match.id];
      const isLastRound = r === numRounds;

      // Wrapper style handles spacing - đồng bộ với Bracket.jsx
      html += `<div class="pdf-match-wrapper" style="margin-top: ${marginTop}px; margin-bottom: ${matchGapValue}px;">`;

      // Match Pair with dynamic gap and height - đồng bộ với Bracket.jsx
      html += `<div class="pdf-match-pair ${
        isBye ? "bye" : ""
      }" style="height: ${currentMatchHeight}px;">`;

      // AKA Cell (Top)
      html += `<div class="pdf-cell aka ${isWinner1 ? "winner" : ""} ${
        !athlete1 ? "empty" : ""
      }">`;
      html += `<span class="pdf-name">${athlete1?.name || ""}</span>`;
      if (athlete1?.club)
        html += `<span class="pdf-club">(${athlete1.club})</span>`;
      html += `</div>`;

      // AO Cell (Bottom) - với athleteGap đồng bộ
      html += `<div class="pdf-cell ao ${isWinner2 ? "winner" : ""} ${
        !athlete2 ? "empty" : ""
      }" style="margin-top: ${athleteGap}px;">`;
      html += `<span class="pdf-name">${athlete2?.name || ""}</span>`;
      if (athlete2?.club)
        html += `<span class="pdf-club">(${athlete2.club})</span>`;
      html += `</div>`;      // Connectors (Right side) - đồng bộ với desktop
      const lineTop = cellHeight;
      const lineHeight = athleteGap;
      const lineCenter = cellHeight + athleteGap / 2;

      if (!isLastRound) {
        html += `<div class="pdf-connector" style="height: ${currentMatchHeight}px;">`;
        html += `<div class="pdf-v-line" style="top: ${lineTop}px; height: ${lineHeight}px;"></div>`;
        html += `<div class="pdf-h-mid" style="top: ${lineCenter}px;"></div>`;
        html += `</div>`;
      }

      // Connector và ô vô địch cho trận chung kết
      if (isLastRound) {
        html += `<div class="pdf-champion-connector" style="height: ${currentMatchHeight}px;">`;
        html += `<div class="pdf-v-line" style="top: ${lineTop}px; height: ${lineHeight}px;"></div>`;
        html += `<div class="pdf-h-mid" style="top: ${lineCenter}px;"></div>`;
        html += `</div>`;

        // Ô VÔ ĐỊCH (HCV)
        html += `<div class="pdf-champion-slot" style="top: ${lineCenter - cellHeight / 2}px;">`;
        html += `<span class="pdf-champion-icon">🥇</span>`;
        html += `<span class="pdf-champion-name">${winner?.name || ""}</span>`;
        if (winner?.club)
          html += `<span class="pdf-champion-club">(${winner.club})</span>`;
        html += `</div>`;
      }

      // Match Number - đặt bên phải trong match-box như desktop
      if (matchNum) {
        html += `<div class="pdf-match-number" style="top: ${lineCenter}px;">${matchNum}</div>`;
      }

      html += `</div>`; // end match-pair
      html += `</div>`; // end match-wrapper
    });

    html += `</div></div>`; // end round-body & round
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

export function exportScoreSheetToPDF(
  category,
  matches,
  filename = "bang_diem.pdf"
) {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;
  const isTrial = isTrialLicense();

  pdf.setFontSize(18);
  pdf.setFont("helvetica", "bold");
  pdf.text("BANG DIEM TRONG TAI", pageWidth / 2, yPos, { align: "center" });
  yPos += 5;
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text("(PHIẾU CHẤM ĐIỂM)", pageWidth / 2, yPos, { align: "center" });
  yPos += 12;

  pdf.setFontSize(12);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Hang muc: ${transliterate(category.name)}`, margin, yPos);
  yPos += 7;
  pdf.text(
    `Loai: ${category.type === "kumite" ? "Kumite" : "Kata"}`,
    margin,
    yPos
  );
  yPos += 15;

  matches.forEach((match, index) => {
    if (yPos > 260) {
      pdf.addPage();
      yPos = margin;
      if (isTrial) {
        addTrialWatermark(pdf, pageWidth, pageHeight);
      }
    }

    pdf.setDrawColor(100, 100, 100);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, yPos, pageWidth - 2 * margin, 40);

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text(`Tran ${index + 1}`, margin + 5, yPos + 8);

    pdf.setFont("helvetica", "normal");
    const athlete1Name = transliterate(match.athlete1?.name || "MIỄN");
    const athlete2Name = transliterate(match.athlete2?.name || "MIỄN");

    pdf.setFillColor(254, 202, 202);
    pdf.rect(margin + 5, yPos + 12, 85, 10, "F");
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    pdf.text(`AKA: ${athlete1Name}`, margin + 7, yPos + 19);

    pdf.setFillColor(191, 219, 254);
    pdf.rect(margin + 5, yPos + 25, 85, 10, "F");
    pdf.text(`AO: ${athlete2Name}`, margin + 7, yPos + 32);

    const scoreBoxX = margin + 95;
    pdf.setFillColor(255, 255, 255);

    pdf.setFontSize(9);
    pdf.text("Diem:", scoreBoxX, yPos + 17);
    pdf.rect(scoreBoxX + 12, yPos + 12, 20, 8);

    pdf.text("Diem:", scoreBoxX, yPos + 30);
    pdf.rect(scoreBoxX + 12, yPos + 25, 20, 8);

    const winnerBoxX = scoreBoxX + 40;
    pdf.setDrawColor(0, 0, 0);
    pdf.rect(winnerBoxX, yPos + 10, 45, 28);

    pdf.setFontSize(9);
    pdf.text("Nguoi thang:", winnerBoxX + 5, yPos + 18);

    pdf.rect(winnerBoxX + 5, yPos + 22, 5, 5);
    pdf.text("AKA", winnerBoxX + 12, yPos + 26);

    pdf.rect(winnerBoxX + 25, yPos + 22, 5, 5);
    pdf.text("AO", winnerBoxX + 32, yPos + 26);

    yPos += 47;
  });

  if (isTrial) {
    addTrialWatermark(pdf, pageWidth, pageHeight);
  }

  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  const now = new Date();
  const footer = `Xuat luc: ${now.toLocaleDateString(
    "vi-VN"
  )} ${now.toLocaleTimeString("vi-VN")}`;
  pdf.text(footer, pageWidth / 2, 285, { align: "center" });

  pdf.save(filename);
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
