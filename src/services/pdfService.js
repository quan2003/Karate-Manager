import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { isTrialLicense, getCurrentLicense } from "./licenseService";

/**
 * PDF Export Service - Client-side
 * 
 * PRIMARY: Electron printToPDF (vector, custom page size, no shrinking)
 * FALLBACK: jsPDF + html2canvas (raster, for browser-only mode)
 * 
 * Theme: SportData Replica (Gradient backgrounds, Header with Logo, Referees Table)
 */

const DEFAULT_SPLIT_THRESHOLD = 20; // Mặc định chia nhánh khi > 20 VĐV
const RENDER_SCALE = 4; // Render siêu nét (dùng cho fallback)

// 1px ≈ 0.2646mm (at 96 DPI)
const PX_TO_MM = 25.4 / 96;
// Minimum page dimensions (mm) - at least A4 landscape
const MIN_PAGE_WIDTH_MM = 297;
const MIN_PAGE_HEIGHT_MM = 210;
// Padding added around content (mm)
const PAGE_PADDING_MM = 10;

/**
 * Check if Electron's printToPDF API is available
 */
function isElectronPdfAvailable() {
  return !!(window.electronAPI && window.electronAPI.pdf && window.electronAPI.pdf.printBracket);
}

/**
 * Convert an image URL to a base64 data URL.
 * This is needed because the hidden BrowserWindow (loaded via data: URL)
 * cannot resolve relative or file:// image URLs.
 */
function imageToBase64(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        resolve(url); // fallback: keep original
      }
    };
    img.onerror = () => resolve(''); // return empty on error
    img.src = url;
  });
}

/**
 * Process all <img> tags in HTML string:
 * Convert their src attributes from file:///... or relative URLs to inline base64 data URLs.
 * This ensures images render correctly in the hidden BrowserWindow.
 */
async function processHtmlImages(htmlContent) {
  // Extract all img src values
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  const matches = [...htmlContent.matchAll(imgRegex)];
  
  // Collect unique URLs
  const uniqueUrls = [...new Set(matches.map(m => m[1]))];
  
  // Convert each unique URL to base64 (skip ones already base64)
  const urlMap = {};
  for (const url of uniqueUrls) {
    if (url.startsWith('data:')) {
      urlMap[url] = url; // already base64
    } else {
      urlMap[url] = await imageToBase64(url);
    }
  }
  
  // Replace all src values in HTML
  let result = htmlContent;
  for (const [originalUrl, base64Url] of Object.entries(urlMap)) {
    if (base64Url && base64Url !== originalUrl) {
      // Escape special regex characters in URL
      const escaped = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), base64Url);
    }
  }
  
  return result;
}

/**
 * Measure the natural dimensions (in px) of bracket HTML by rendering in a hidden container.
 * The container is unstyled (no max-width constraints) so the bracket renders at its natural size.
 */
function measureBracketSize(htmlContent) {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-99999px";
    container.style.top = "0";
    container.style.background = "white";
    container.style.padding = "0";
    container.style.display = "inline-block"; // shrink-wrap to content
    container.style.whiteSpace = "nowrap";
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    // Use requestAnimationFrame to ensure layout is computed
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const width = container.scrollWidth;
        const height = container.scrollHeight;
        document.body.removeChild(container);
        resolve({ width, height });
      });
    });
  });
}

/**
 * Wrap bracket HTML fragment into a full standalone HTML document.
 * Includes @page CSS to remove print margins and set page size.
 */
function wrapAsFullDocument(htmlContent) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    margin: 0;
    size: landscape;
  }
  * {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }
  ::-webkit-scrollbar { 
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: white;
    overflow: hidden !important;
  }
  body {
    padding: 0;
    display: inline-block; 
    vertical-align: top;
  }
  @media print {
    html, body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;
}

/**
 * Calculate the custom page size (in mm) from the content's natural pixel dimensions.
 * The page grows to fit the content; never shrinks below A4 landscape.
 */
function calculatePageSize(contentWidthPx, contentHeightPx) {
  // Thêm buffer 5% để đảm bảo content không bị tràn viền gây co nhỏ
  const bufferFactor = 1.05;
  const contentWidthMM = contentWidthPx * PX_TO_MM * bufferFactor + PAGE_PADDING_MM * 2;
  const contentHeightMM = contentHeightPx * PX_TO_MM * bufferFactor + PAGE_PADDING_MM * 2;

  return {
    widthMM: Math.max(MIN_PAGE_WIDTH_MM, Math.ceil(contentWidthMM)),
    heightMM: Math.max(MIN_PAGE_HEIGHT_MM, Math.ceil(contentHeightMM)),
  };
}

// ====================================================================
// FALLBACK: old jsPDF + html2canvas pipeline (raster, for non-Electron)
// ====================================================================

/**
 * Render one bracket HTML to a canvas image (fallback)
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
 * Add a canvas image as a page to a jsPDF (fallback)
 */
function addCanvasPage(pdf, canvas, isFirstPage) {
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  
  const orientation = 'landscape';
  const A4_WIDTH = 297;
  const A4_HEIGHT = 210;
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
    pdf.addPage("a4", orientation);
  }
  
  pdf.addImage(canvas.toDataURL("image/png", 1.0), "PNG", offsetX, offsetY, finalWidth, finalHeight, undefined, 'FAST');
  
  if (isTrialLicense()) addTrialWatermark(pdf, A4_WIDTH, A4_HEIGHT);
  return pdf;
}

/**
 * Gets the base absolute URL, handling Electron file:// protocol correctly
 */
export function getAppBaseUrl() {
  if (typeof window === 'undefined') return '/';
  let url = window.location.href.split('#')[0].split('?')[0];
  if (url.endsWith('.html')) url = url.substring(0, url.lastIndexOf('/'));
  return url.endsWith('/') ? url : url + '/';
}

/**
 * Get tournament logos array (backward compatible: supports tournamentLogos (new) or systemLogo (old))
 * @param {Object} sponsorLogos
 * @returns {string[]} array of logo data URLs
 */
export function getTournamentLogos(sponsorLogos) {
  if (!sponsorLogos) return [];
  if (sponsorLogos.tournamentLogos && sponsorLogos.tournamentLogos.length > 0) {
    return sponsorLogos.tournamentLogos;
  }
  if (sponsorLogos.systemLogo) return [sponsorLogos.systemLogo];
  return [];
}

/**
 * Get tournament signatures array (backward compatible: supports signatures (new) or signature (old))
 * @param {Object} sponsorLogos
 * @returns {string[]} array of signature data URLs
 */
export function getTournamentSignatures(sponsorLogos) {
  if (!sponsorLogos) return [];
  if (sponsorLogos.signatures && sponsorLogos.signatures.length > 0) {
    return sponsorLogos.signatures;
  }
  if (sponsorLogos.signature) return [sponsorLogos.signature];
  return [];
}

/**
 * Determine how many splits a category needs based on tournament settings
 * @param {Object} category
 * @param {Object} splitSettings - { enabled: bool, threshold: number }
 */
function getSplitCount(category, splitSettings) {
  const athleteCount = category.athletes?.length || 0;
  const threshold = splitSettings?.threshold || DEFAULT_SPLIT_THRESHOLD;

  // Ưu tiên cài đặt riêng của hạng mục nếu có
  if (category.sigmaSplitEnabled === false) return 1;
  if (category.sigmaSplitEnabled === true) {
    if (athleteCount <= 1) return 1;
    return Math.max(2, Math.floor(athleteCount / threshold));
  }

  // Nếu không có cài đặt riêng, dùng cài đặt chung của giải
  if (!splitSettings?.enabled) return 1;
  if (athleteCount <= threshold) return 1;
  
  // Ưu tiên chia đôi thay vì chia 3 (Dùng floor để chỉ tạo nhánh mới khi đủ số VĐV cho các nhánh cũ)
  return Math.max(2, Math.floor(athleteCount / threshold));
}

// ====================================================================
// MAIN EXPORT: exportBracketToPDF
// Uses Electron printToPDF (vector) if available, else fallback to raster
// ====================================================================

export async function exportBracketToPDF(
  category,
  tournamentName,
  filename = "so_do_thi_dau.pdf",
  options = {}
) {
  const scheduleInfo = options.scheduleInfo || null;
  const splitSettings = options.splitSettings || null;
  const sponsorLogos = options.sponsorLogos || null;

  try {
    const originalCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";
    const numSplits = getSplitCount(category, splitSettings);

    // ─── Electron printToPDF path (VECTOR, custom page size) ───
    if (isElectronPdfAvailable()) {
      if (numSplits <= 1) {
        // Single page
        const html = generateBracketHTML(category, tournamentName, scheduleInfo, null, 1, 1, sponsorLogos);
        const processedHtml = await processHtmlImages(html);
        const fullDoc = wrapAsFullDocument(processedHtml);

        const result = await window.electronAPI.pdf.printBracket({
          htmlContent: fullDoc,
          filename,
        });

        document.body.style.cursor = originalCursor;
        if (result.success) {
          alert("Đã xuất PDF thành công!");
        } else if (!result.canceled) {
          alert("Lỗi xuất PDF: " + result.error);
        }
      } else {
        // Multiple splits → merge into one PDF
        const pages = [];
        for (let half = 0; half < numSplits; half++) {
          const splitSchedule = { ...scheduleInfo, splitLabel: `Trận ${half + 1}/${numSplits}` };
          const html = generateBracketHTML(category, tournamentName, splitSchedule, half, half + 1, numSplits, sponsorLogos);
          const processedHtml = await processHtmlImages(html);
          pages.push({
            htmlContent: wrapAsFullDocument(processedHtml),
          });
        }

        const result = await window.electronAPI.pdf.printBracketMulti({
          pages,
          filename,
        });

        document.body.style.cursor = originalCursor;
        if (result.success) {
          alert(`Đã xuất ${result.pageCount} trang PDF thành công!`);
        } else if (!result.canceled) {
          alert("Lỗi xuất PDF: " + result.error);
        }
      }
      return;
    }

    // ─── Fallback: jsPDF + html2canvas (raster) ───
    let pdf = null;

    if (numSplits <= 1) {
      const html = generateBracketHTML(category, tournamentName, scheduleInfo, null, 1, 1, sponsorLogos);
      const canvas = await renderBracketToCanvas(html);
      pdf = addCanvasPage(null, canvas, true);
    } else {
      for (let half = 0; half < numSplits; half++) {
        const splitSchedule = { ...scheduleInfo, splitLabel: `Trận ${half + 1}/${numSplits}` };
        const html = generateBracketHTML(category, tournamentName, splitSchedule, half, half + 1, numSplits, sponsorLogos);
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

// ====================================================================
// MAIN EXPORT: exportAllBracketsToPDF
// Uses Electron printToPDF (vector) if available, else fallback to raster
// ====================================================================

export async function exportAllBracketsToPDF(
  categories,
  tournamentName = "Giai_dau",
  filename = null,
  schedule = null,
  splitSettings = null,
  sponsorLogos = null,
  onProgress = null
) {
  const categoriesWithBracket = categories.filter((c) => c.bracket);

  if (categoriesWithBracket.length === 0) {
    alert("Không có hạng mục nào đã bốc thăm để xuất!");
    return;
  }

  const finalFilename = filename || `${tournamentName.replace(/\\s+/g, "_")}_tat_ca_so_do.pdf`;
  const totalPages = categoriesWithBracket.reduce(
    (total, category) => total + getSplitCount(category, splitSettings),
    0
  );
  const totalSteps = Math.max(totalPages + 1, 1);
  let completedSteps = 0;
  const reportProgress = (label = "", percentOverride = null) => {
    if (!onProgress) return;
    const percent = percentOverride ?? Math.min(100, Math.round((completedSteps / totalSteps) * 100));
    onProgress({ percent, completed: Math.min(completedSteps, totalSteps), total: totalSteps, label });
  };

  try {
    const originalCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";
    reportProgress("Đang chuẩn bị PDF...", 0);

    // ─── Electron printToPDF path (VECTOR, custom page size) ───
    if (isElectronPdfAvailable()) {
      const pages = [];

      for (let i = 0; i < categoriesWithBracket.length; i++) {
        const category = categoriesWithBracket[i];
        const numSplits = getSplitCount(category, splitSettings);

        for (let half = 0; half < numSplits; half++) {
          let scheduleInfo = schedule ? schedule[category.id] : null;
          
          // Ưu tiên lịch thi đấu riêng của nhánh Sigma nếu có (Dùng cho trang Lịch)
          if (numSplits > 1 && schedule) {
            const splitKey = `${category.id}_split${half}`;
            if (schedule[splitKey]) {
              scheduleInfo = schedule[splitKey];
            }
          }

          const splitSchedule = numSplits > 1
            ? { ...scheduleInfo, splitLabel: `Trận ${half + 1}/${numSplits}` }
            : scheduleInfo;
          const splitHalf = numSplits > 1 ? half : null;
          const html = generateBracketHTML(category, tournamentName, splitSchedule, splitHalf, half + 1, numSplits, sponsorLogos);
          const processedHtml = await processHtmlImages(html);
          pages.push({
            htmlContent: wrapAsFullDocument(processedHtml),
          });
          completedSteps++;
          const preparePercent = Math.round((completedSteps / Math.max(totalPages, 1)) * 20);
          reportProgress(`Đang chuẩn bị sơ đồ ${completedSteps}/${totalPages}`, preparePercent);
        }
      }

      reportProgress("Chọn nơi lưu file PDF...", 20);
      const stopElectronProgress = window.electronAPI?.pdf?.onProgress?.((progress) => {
        const current = progress?.current || 0;
        const total = progress?.total || pages.length || 1;
        const renderPercent = 20 + Math.round((current / total) * 75);
        reportProgress(`Đang render PDF ${current}/${total}`, Math.min(renderPercent, 95));
      });

      let result;
      try {
        result = await window.electronAPI.pdf.printBracketMulti({
          pages,
          filename: finalFilename,
        });
      } finally {
        if (stopElectronProgress) stopElectronProgress();
      }
      completedSteps = totalSteps;
      reportProgress("Hoàn tất");

      document.body.style.cursor = originalCursor;
      if (result.success) {
        alert(`Đã xuất ${result.pageCount} sơ đồ thành công!`);
      } else if (!result.canceled) {
        alert("Lỗi xuất PDF: " + result.error);
      }
      return;
    }

    // ─── Fallback: jsPDF + html2canvas (raster) ───
    let pdf = null;
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
        const html = generateBracketHTML(category, tournamentName, splitSchedule, splitHalf, half + 1, numSplits, sponsorLogos);
        const canvas = await renderBracketToCanvas(html);
        if (pageCount === 0) {
          pdf = addCanvasPage(null, canvas, true);
        } else {
          pdf = addCanvasPage(pdf, canvas, false);
        }
        pageCount++;
        completedSteps++;
        reportProgress(`Đang tạo sơ đồ ${completedSteps}/${totalPages}`);
      }
    }

    if (pdf) {
      reportProgress("Đang lưu file PDF...");
      pdf.save(finalFilename);
    }
    completedSteps = totalSteps;
    reportProgress("Hoàn tất");
    document.body.style.cursor = originalCursor;
    alert(`Đã xuất ${pageCount} sơ đồ thành công!`);
  } catch (error) {
    console.error("Lỗi xuất PDF hàng loạt:", error);
    alert("Lỗi xuất PDF: " + error.message);
    document.body.style.cursor = "default";
  }
}

/**
 * Helper to load image for jsPDF
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

/**
 * Export Score Sheet to PDF
 * Generates a printable score sheet for all real matches in a category
 */
export async function exportScoreSheetToPDF(
  category,
  matches,
  filename = "bang_diem.pdf",
  sponsorLogos = null
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

    // Logo header area
    let logoY = margin;
    const tournamentLogos = getTournamentLogos(sponsorLogos);
    const sponsors = sponsorLogos?.sponsors || [];
    
    // Always load the app icon
    let appIcon = null;
    try {
      appIcon = await loadImage(`${getAppBaseUrl()}icon.png`);
    } catch (e) {
      console.warn("Could not load default icon.png", e);
    }
    
    // Left: tournament logos (multiple)
    let lx = margin;
    for (const tLogo of tournamentLogos) {
      try {
        pdf.addImage(tLogo, 'PNG', lx, logoY, 25, 25);
        lx += 28;
      } catch(e) { /* ignore logo errors */ }
    }
    // Center: app icon (always shown)
    if (appIcon) {
      try {
        const centerX = (pageWidth - 20) / 2;
        pdf.addImage(appIcon, 'PNG', centerX, logoY, 20, 20);
      } catch(e) { /* ignore */ }
    }
    // Right: sponsor logos
    if (sponsors.length > 0) {
      const sponsorWidth = 22;
      const sponsorGap = 3;
      let sx = pageWidth - margin;
      for (let i = sponsors.length - 1; i >= 0; i--) {
        sx -= sponsorWidth;
        try {
          pdf.addImage(sponsors[i], 'PNG', sx, logoY, sponsorWidth, 20);
        } catch(e) { /* ignore */ }
        sx -= sponsorGap;
      }
    }
    logoY += 28;

    // Title
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("BANG DIEM THI DAU", pageWidth / 2, logoY + 5, {
      align: "center",
    });

    // Category name
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    const categoryName = transliterate(category.name || "");
    pdf.text(categoryName, pageWidth / 2, logoY + 12, { align: "center" });

    // Table header
    const tableTop = logoY + 20;
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

    // Add signature if available
    const signatures = getTournamentSignatures(sponsorLogos);
    if (signatures.length > 0) {
      const sigWidth = 40;
      const sigHeight = 20;
      const sigGap = 5; // Gap between signatures
      const totalWidth = signatures.length * sigWidth + (signatures.length - 1) * sigGap;
      const sigY = currentY + 10;
      
      // Check if signatures fit on current page
      if (sigY + sigHeight > pageHeight - margin) {
        pdf.addPage();
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.text("BAN TO CHUC", pageWidth - margin - (totalWidth / 2), margin + 5, { align: "center" });
        signatures.forEach((sig, idx) => {
          const currentX = pageWidth - margin - totalWidth + idx * (sigWidth + sigGap);
          try {
            pdf.addImage(sig, 'PNG', currentX, margin + 8, sigWidth, sigHeight);
          } catch(e) { console.error("Error adding signature to PDF", e); }
        });
      } else {
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.text("BAN TO CHUC", pageWidth - margin - (totalWidth / 2), sigY, { align: "center" });
        signatures.forEach((sig, idx) => {
          const currentX = pageWidth - margin - totalWidth + idx * (sigWidth + sigGap);
          try {
            pdf.addImage(sig, 'PNG', currentX, sigY + 3, sigWidth, sigHeight);
          } catch(e) { console.error("Error adding signature to PDF", e); }
        });
      }
    }

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
function generateBracketHTML(category, tournamentName = "", scheduleInfo = null, splitHalf = null, splitIndex = 1, totalSplits = 1, sponsorLogos = null) {
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

  // === SPLIT LOGIC: xác định số vòng hiển thị và lọc matches ===
  let displayRounds = numRounds;
  const matchesByRound = {};

  if (splitHalf !== null && totalSplits > 1) {
    // Thu hẹp số vòng hiển thị khi chia nhánh Sigma
    displayRounds = numRounds - Math.ceil(Math.log2(totalSplits));
    
    const round1 = fullMatchesByRound[1] || [];
    const totalR1 = round1.length;
    const perHalf = Math.ceil(totalR1 / totalSplits);
    const startPos = splitHalf * perHalf;
    const endPos = Math.min((splitHalf + 1) * perHalf, totalR1);

    for (let r = 1; r <= displayRounds; r++) {
      const allMatches = fullMatchesByRound[r] || [];
      const divisor = Math.pow(2, r - 1);
      const rStart = Math.floor(startPos / divisor);
      const rEnd = Math.ceil(endPos / divisor);
      matchesByRound[r] = allMatches.slice(rStart, rEnd);
    }
  } else {
    Object.assign(matchesByRound, fullMatchesByRound);
  }

  // ── Sizing: Tỉ lệ HTML cố định để lấp đầy Aspect Ratio chuẩn (A4/A3 Landscape) ──
  const HTML_TARGET_H = 1100; // Chiều cao chuẩn để tính toán giãn cách
  const HTML_TARGET_W = Math.round(1.414 * HTML_TARGET_H); // ~1556px

  // Tăng vùng trống chân trang để tránh đè lên trận cuối
  const OVERHEAD_H = 325; 
  const availableRoundsH = HTML_TARGET_H - OVERHEAD_H;

  const numMatchesR1 = Math.pow(2, displayRounds - 1);
  const numSlotsR1 = numMatchesR1 * 2;

  // Bước 1: Tính cellHeight cơ bản
  const MIN_CELL_GAP = 4;
  const MIN_MATCH_GAP = 2;
  const minGapsH = (numMatchesR1 * MIN_CELL_GAP) + ((numMatchesR1 - 1) * MIN_MATCH_GAP);
  
  let cellHeight = Math.floor((availableRoundsH - minGapsH) / numSlotsR1);
  cellHeight = Math.max(26, Math.min(cellHeight, 35)); // Giảm chiều cao ô để gọn hơn

  // Bước 2: Phân bổ phần dư vào cellGap và matchGap để FILL TRANG (SportData style)
  const totalCellH = numSlotsR1 * cellHeight;
  const remainingH = availableRoundsH - totalCellH;
  
  let cellGap = MIN_CELL_GAP;
  let matchGap = MIN_MATCH_GAP;
  
  if (remainingH > 0 && numMatchesR1 > 1) {
    // Phân bổ phần dư: 70% cho cellGap (giữa 2 VĐV), 30% cho matchGap (giữa các trận)
    const factor = numMatchesR1 + 0.3 * (numMatchesR1 - 1);
    cellGap = Math.floor(remainingH / factor);
    matchGap = Math.max(MIN_MATCH_GAP, Math.round(cellGap * 0.3));
  } else if (remainingH > 0 && numMatchesR1 === 1) {
    cellGap = remainingH;
    matchGap = 0;
  }

  // Bước 3: Chiều ngang (Tối ưu khoảng cách Sigma)
  const RIGHT_PANEL_W = 280; // Dành khoảng trống rộng rãi cho Champion và Kết quả
  const numCellCols = displayRounds;
  let cellWidth = displayRounds <= 2 ? 380 : displayRounds <= 3 ? 320 : displayRounds <= 4 ? 260 : 190;
  let connectorWidth = Math.floor((HTML_TARGET_W - RIGHT_PANEL_W - (numCellCols * cellWidth)) / displayRounds);
  connectorWidth = Math.max(50, Math.min(connectorWidth, 120));

  const matchHeight = cellHeight + cellGap + cellHeight; 
  const BASE_LINE_SPACING = matchHeight + matchGap; 

  // Helper: Adaptive Font Size for names
  const getFontSize = (text, type = "name") => {
    if (!text) return type === "name" ? "15px" : "13px";
    const len = text.length;
    if (type === "name") {
      if (len > 35) return "11px";
      if (len > 28) return "12px";
      if (len > 22) return "13.5px";
      return "15px";
    } else {
      // Club/Members - Dễ đọc hơn cho tên dài
      if (len > 45) return "10px";
      if (len > 35) return "11px";
      if (len > 25) return "12px";
      return "13px";
    }
  };

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
        width: ${HTML_TARGET_W}px;
        height: ${HTML_TARGET_H}px;
        font-family: 'Arial', sans-serif; 
        background: white; 
        padding: 10px 15px; 
        position: relative; 
        overflow: hidden;
      }
      
      /* Header */
      .pdf-header { 
        display: flex; justify-content: space-between; align-items: flex-start;
        padding: 8px 14px; 
        background: #e2e8f0; 
        border: 1px solid #94a3b8;
        margin-bottom: 5px;
        position: relative;
        min-height: 50px;
      }
      .pdf-header-left { display: flex; flex-direction: column; }
      .pdf-category-name { font-size: 32px; font-weight: bold; color: #000; }
      .pdf-tournament-name { font-size: 16px; color: #333; margin-top: 4px; font-weight: 600; }
      
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
        display: flex; gap: 0; font-size: 14px; border: 1px solid #000;
      }
      .pdf-info-item { padding: 5px 12px; border-right: 1px solid #000; background: #ddd; font-weight: 600; }
      .pdf-info-item:last-child { border-right: none; background: #fff; }

      /* Rounds Layout */
      .pdf-content { display: flex; align-items: flex-start; gap: 0; margin-top: 5px; position: relative; }
      .pdf-bracket-area { 
        display: flex; 
        flex: 1; 
        padding-right: ${connectorWidth + 150}px; /* Chỗ chứa Champion & Kết quả linh động */
      }
      .pdf-rounds { display: flex; align-items: flex-start; }
      .pdf-round { display: flex; flex-direction: column; }
      .pdf-round-header { 
        text-align: center; padding: 5px 0; margin-bottom: 10px; min-width: ${cellWidth}px;
      }
      .pdf-round-title { font-size: 24px; font-weight: bold; color: #000; text-transform: uppercase; border-bottom: 4px solid #ccc; display: inline-block; padding-bottom: 6px; }
      .pdf-round-body { display: flex; flex-direction: column; padding-right: ${connectorWidth}px; }
      
      /* Match Wrapper - ABSOLUTE LAYOUT */
      .pdf-match-wrapper { 
        display: flex; 
        flex-direction: column; 
        width: ${cellWidth}px; 
        position: relative; 
      }
      .pdf-match-pair { display: contents; } 
      .pdf-match-wrapper.is-bye .pdf-cell,
      .pdf-match-wrapper.is-bye .pdf-connector,
      .pdf-match-wrapper.is-bye .pdf-match-number {
        visibility: hidden !important;
      }

      /* Cells - Gradient */
      .pdf-cell { 
        display: flex; align-items: center; justify-content: flex-start; gap: 6px;
        width: 100%; 
        height: ${cellHeight}px; min-height: ${cellHeight}px; max-height: ${cellHeight}px; 
        padding: 0 6px 0 10px; 
        box-sizing: border-box;
        background: #fff;
        position: relative;
        overflow: visible;
        border: none; /* Xóa viền đen */
      }
      .pdf-cell.aka {
        background: linear-gradient(to right, #fee2e2 0%, #ffffff 80%);
        border-left: 5px solid #dc2626;
        border-bottom: 1.5px solid #dc2626;
        border-top: 1.5px solid #dc2626;
      }
      .pdf-cell.ao {
        background: linear-gradient(to right, #dbeafe 0%, #ffffff 80%);
        border-left: 5px solid #2563eb;
        border-bottom: 1.5px solid #2563eb;
        border-top: 1.5px solid #2563eb;
      }
      .pdf-cell.aka.empty {
        background: linear-gradient(to right, #fee2e2 0%, #ffffff 80%);
        border-left: 5px solid #dc2626;
        border-bottom: 1.5px solid #dc2626;
        border-top: 1.5px solid #dc2626;
      }
      .pdf-cell.ao.empty {
        background: linear-gradient(to right, #dbeafe 0%, #ffffff 80%);
        border-left: 5px solid #2563eb;
        border-bottom: 1.5px solid #2563eb;
        border-top: 1.5px solid #2563eb;
      }
      
      .pdf-name { 
        font-size: inherit; font-weight: 700; color: #000; 
        flex-shrink: 1;
        white-space: nowrap; 
        line-height: 1.2;
      }
      .pdf-club { 
        font-size: inherit; color: #000; font-weight: 700;
        flex-shrink: 1;
        white-space: nowrap;
        opacity: 0.85;
      }

      /* Connectors - In đậm để rõ khi print */
      .pdf-connector { 
        position: absolute; 
        right: -${connectorWidth}px;
        top: 0; 
        width: ${connectorWidth}px; 
        z-index: 10;
        pointer-events: none;
      }
      .pdf-v-line { position: absolute; left: 0; width: 1.5px; background: #1e293b; }
      .pdf-h-mid { position: absolute; left: 0; width: 100%; height: 1.5px; background: #1e293b; }

      /* Match Number */
      .pdf-match-number { 
        position: absolute; 
        right: 8px;
        transform: translateY(-50%);
        font-size: 16px; font-weight: 700; color: #000; 
        background: #fff; border-radius: 50%;
        width: 22px; height: 22px;
        display: flex; align-items: center; justify-content: center;
        z-index: 60;
        border: 1.5px solid #ef4444;
        box-shadow: none;
      }

      /* Champion Slot - ABSOLUTE positioning */
      .pdf-champion-slot {
        position: absolute;
        /* Dynamic right position set in JS */
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        height: ${cellHeight}px;
        padding: 0 6px 0 10px;
        background: linear-gradient(to right, #fff7ed 0%, #ffffff 80%); 
        border: none;
        border-left: 5px solid #f59e0b;
        border-bottom: 1.5px solid #f59e0b;
        border-top: 1.5px solid #f59e0b;
        width: ${cellWidth}px;
        z-index: 100;
      }
      .pdf-champion-icon { display: none; }
      .pdf-champion-name { 
        font-size: 15px; font-weight: 700; color: #000; 
        flex-shrink: 0;
        white-space: nowrap; 
        line-height: ${cellHeight}px; 
      }
      .pdf-champion-club {
        font-size: inherit; color: #000; font-weight: 700;
        flex-shrink: 1;
        white-space: nowrap;
        opacity: 0.85;
      }

      /* Champion Connector */
      .pdf-champion-connector {
        position: absolute;
        width: ${connectorWidth}px; 
        height: 1.5px; 
        background: #1e293b;
        z-index: 9;
      }
      
      /* Medal Table - FIXED RIGHT */
      .pdf-medal-table { 
        position: absolute;
        top: 130px; 
        right: 10px;
        width: 180px; 
        border: 1px solid #000; background: white;
        z-index: 200;
        box-shadow: -2px 2px 5px rgba(0,0,0,0.1);
      }
      .pdf-medal-header { background: #000; color: white; padding: 6px 10px; font-size: 11px; font-weight: bold; text-align: center; text-transform: uppercase; }
      .pdf-medal-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid #ccc; font-size: 10px; font-weight: 600; }
      .pdf-medal-row:last-child { border-bottom: none; }
      .pdf-medal-label { width: 14px; font-weight: bold; }
      
      /* Referees Box - FIXED BOTTOM RIGHT */
      .pdf-referees-box { 
        position: absolute;
        bottom: 25px;
        right: 15px; 
        border: 1px solid #333; 
        width: 320px; 
        background: white;
        z-index: 50;
      }
      .pdf-ref-header { background: #ccc; font-size: 10px; font-weight: bold; padding: 2px 5px; border-bottom: 1px solid #333; text-align: center; }
      .pdf-ref-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; }
      .pdf-ref-cell { height: 22px; border-right: 1px solid #333; border-bottom: 1px solid #333; }
      .pdf-ref-cell:last-child { border-right: none; }
      
      /* Footer */
      .pdf-footer { 
        position: absolute; 
        bottom: 5px; 
        left: 0; 
        width: 100%; 
        text-align: center; 
        font-size: 10px; 
        color: #999; 
        font-family: 'Courier New', monospace; 
      }

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
  
  // Sponsor logos bar above header
  const appIconUrl = `${getAppBaseUrl()}icon.png`;
  const sponsorsList = sponsorLogos?.sponsors || [];
  const tournamentLogosList = getTournamentLogos(sponsorLogos);
  
  // Always show logo bar with app icon in center
  html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding:4px 10px;">`;
  // Left: tournament logos (multiple) if available
  if (tournamentLogosList.length > 0) {
    html += `<div style="display:flex;align-items:center;gap:8px;">`;
    tournamentLogosList.forEach(logo => {
      html += `<img src="${logo}" style="height:50px;max-width:140px;object-fit:contain;" />`;
    });
    html += `</div>`;
  } else {
    html += `<div></div>`;
  }
  // Center: app icon (always shown)
  html += `<img src="${appIconUrl}" style="height:55px;width:55px;object-fit:contain;" />`;
  // Right: sponsor logos if available
  if (sponsorsList.length > 0) {
    html += `<div style="display:flex;align-items:center;gap:10px;">`;
    sponsorsList.forEach(logo => {
      html += `<img src="${logo}" style="height:45px;max-width:120px;object-fit:contain;" />`;
    });
    html += `</div>`;
  } else {
    html += `<div></div>`;
  }
  html += `</div>`;
  
  html += `<div class="pdf-header">`;
  html += `<div class="pdf-header-left"><div class="pdf-category-name">${name}${totalSplits > 1 ? ' - ' + splitLabel : ''}</div><div class="pdf-tournament-name">${tournamentName}</div></div>`;
  html += `<div class="pdf-info-bar">`;
  if (dateLabel) html += `<div class="pdf-info-item">${dateLabel}</div>`;
  html += `<div class="pdf-info-item">${matLabel}</div>`;
  if (timeLabel) html += `<div class="pdf-info-item">${timeLabel}</div>`;
  html += `<div class="pdf-info-item" style="background:#fff;">${splitLabel}</div>`;
  html += `</div>`;
  // Header right: first tournament logo or app icon
  if (tournamentLogosList.length > 0) {
    html += `<div class="pdf-header-right" style="padding:4px;"><img src="${tournamentLogosList[0]}" style="max-height:60px;max-width:210px;object-fit:contain;" /></div>`;
  } else {
    html += `<div class="pdf-header-right" style="padding:4px;"><img src="${appIconUrl}" style="max-height:60px;max-width:60px;object-fit:contain;" /></div>`;
  }
  html += `</div>`; 
  html += `<div class="pdf-content"><div class="pdf-bracket-area"><div class="pdf-rounds">`;

  // Render Rounds
  for (let r = 1; r <= displayRounds; r++) {
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

    html += `<div class="pdf-round"><div class="pdf-round-body">`;

    roundMatches.forEach((match, idx) => {
      const { athlete1, athlete2, winner } = match;
      const isWinner1 = winner?.id === athlete1?.id;
      const isWinner2 = winner?.id === athlete2?.id;
      const marginTop = idx === 0 ? topOffset : 0;
      const isLastRound = r === displayRounds;
      const matchNum = matchNumbers[match.id];
      const isByeMatch = match.isBye || !matchNum;
      
      html += `<div class="pdf-match-wrapper ${isByeMatch ? "is-bye" : ""}" style="margin-top: ${marginTop}px; margin-bottom: ${matchGapValue}px;">`;
      
      // Cell 1
      const name1 = athlete1?.name || "";
      const club1 = !isTeamBracket ? (athlete1?.club || "") : (athlete1?.members?.map(m => m.name.trim().split(/\s+/).pop()).join(', ') || "");
      html += `<div class="pdf-cell aka ${isWinner1 ? "winner" : ""} ${!athlete1 ? "empty" : ""}" style="font-size: ${getFontSize(name1, "name")};">`;
      html += `<span class="pdf-name">${name1}</span>`;
      if (club1) html += `<span class="pdf-club" style="font-size: ${getFontSize(club1, "club")};">(${club1})</span>`;
      html += `</div>`;

      // Cell 2
      const name2 = athlete2?.name || "";
      const club2 = !isTeamBracket ? (athlete2?.club || "") : (athlete2?.members?.map(m => m.name.trim().split(/\s+/).pop()).join(', ') || "");
      html += `<div class="pdf-cell ao ${isWinner2 ? "winner" : ""} ${!athlete2 ? "empty" : ""}" style="margin-top: ${athleteGap}px; font-size: ${getFontSize(name2, "name")};">`;
      html += `<span class="pdf-name">${name2}</span>`;
      if (club2) html += `<span class="pdf-club" style="font-size: ${getFontSize(club2, "club")};">(${club2})</span>`;
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

      // Champion Slot (Dynamic Positioning)
      if (isLastRound) {
        const champOffset = -(connectorWidth + 5);
        const champName = winner?.name || "";
        const champClub = !isTeamBracket ? (winner?.club || "") : (winner?.members?.map(m => m.name.trim().split(/\s+/).pop()).join(', ') || "");
        
        html += `<div class="pdf-champion-connector" style="top: ${lineCenter}px; right: ${champOffset}px;"></div>`;
        html += `<div class="pdf-champion-slot" style="top: ${lineCenter - cellHeight / 2}px; right: ${champOffset}px; font-size: ${getFontSize(champName, "name")};">`;
        html += `<span class="pdf-champion-name">${champName}</span>`;
        if (champClub) html += `<span class="pdf-champion-club" style="font-size: ${getFontSize(champClub, "club")};">(${champClub})</span>`;
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
