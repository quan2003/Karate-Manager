import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 5;
const CARD_GAP_MM = 7;
const BLEED_MM = 1;
const CROP_MARK_MM = 1.8;

function waitForImages(element) {
  return Promise.all(
    [...element.querySelectorAll("img")].map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
      });
    }),
  );
}

function safeFilename(value) {
  return String(value || "Giai_dau")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Giai_dau";
}

export async function exportCardsToPdf(cardsContainer, tournamentName, size = {}) {
  const sourceCards = [...(cardsContainer?.querySelectorAll(":scope > .credential-card") || [])];
  const sourceBackCards = [...(size.backsContainer?.querySelectorAll(":scope > .credential-card") || [])];
  if (!sourceCards.length) throw new Error("Không có thẻ nào để xuất PDF.");

  const cardWidthMm = Number(size.widthCm) * 10;
  const cardHeightMm = Number(size.heightCm) * 10;
  const usableWidth = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2;
  const usableHeight = PAGE_HEIGHT_MM - PAGE_MARGIN_MM * 2;
  if (!Number.isFinite(cardWidthMm) || !Number.isFinite(cardHeightMm) || cardWidthMm < 40 || cardHeightMm < 60) {
    throw new Error("Kích thước thẻ không hợp lệ.");
  }
  if (cardWidthMm > usableWidth || cardHeightMm > usableHeight) {
    throw new Error("Kích thước thẻ lớn hơn vùng in A4 (tối đa 20 × 28,7 cm).");
  }
  const columnCount = Math.max(1, Math.floor((usableWidth + CARD_GAP_MM) / (cardWidthMm + CARD_GAP_MM)));
  const rowCount = Math.max(1, Math.floor((usableHeight + CARD_GAP_MM) / (cardHeightMm + CARD_GAP_MM)));
  const cardsPerPage = columnCount * rowCount;
  const gridWidth = columnCount * cardWidthMm + (columnCount - 1) * CARD_GAP_MM;
  const gridHeight = rowCount * cardHeightMm + (rowCount - 1) * CARD_GAP_MM;
  const startX = (PAGE_WIDTH_MM - gridWidth) / 2;
  const startY = (PAGE_HEIGHT_MM - gridHeight) / 2;
  const renderWidth = 240;
  const renderHeight = Math.round(renderWidth * cardHeightMm / cardWidthMm);

  const staging = document.createElement("div");
  staging.setAttribute("aria-hidden", "true");
  Object.assign(staging.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${renderWidth}px`,
    background: "transparent",
    pointerEvents: "none",
    zIndex: "-1",
  });

  const cloneForRender = (source) => {
    const clone = source.cloneNode(true);
    Object.assign(clone.style, {
      display: "block",
      width: `${renderWidth}px`,
      height: `${renderHeight}px`,
      minWidth: `${renderWidth}px`,
      minHeight: `${renderHeight}px`,
      transform: "none",
      margin: "0",
      boxShadow: "none",
    });
    staging.appendChild(clone);
    return clone;
  };
  const renderedCards = sourceCards.map(cloneForRender);
  const renderedBackCards = sourceBackCards.map(cloneForRender);

  document.body.appendChild(staging);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await waitForImages(staging);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const drawCropMarks = (x, y) => {
      const right = x + cardWidthMm;
      const bottom = y + cardHeightMm;
      const offset = 0.6;
      pdf.setDrawColor(71, 85, 105);
      pdf.setLineWidth(0.15);
      pdf.line(x - offset - CROP_MARK_MM, y, x - offset, y);
      pdf.line(x, y - offset - CROP_MARK_MM, x, y - offset);
      pdf.line(right + offset, y, right + offset + CROP_MARK_MM, y);
      pdf.line(right, y - offset - CROP_MARK_MM, right, y - offset);
      pdf.line(x - offset - CROP_MARK_MM, bottom, x - offset, bottom);
      pdf.line(x, bottom + offset, x, bottom + offset + CROP_MARK_MM);
      pdf.line(right + offset, bottom, right + offset + CROP_MARK_MM, bottom);
      pdf.line(right, bottom + offset, right, bottom + offset + CROP_MARK_MM);
    };
    const renderCard = async (card, position, mirrorColumns = false) => {
      const column = position % columnCount;
      const row = Math.floor(position / columnCount);
      const outputColumn = mirrorColumns ? columnCount - 1 - column : column;
      const x = startX + outputColumn * (cardWidthMm + CARD_GAP_MM);
      const y = startY + row * (cardHeightMm + CARD_GAP_MM);
      const canvas = await html2canvas(card, {
        scale: 4,
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        logging: false,
        width: renderWidth,
        height: renderHeight,
      });
      const bleedScale = Math.max((cardWidthMm + BLEED_MM * 2) / cardWidthMm, (cardHeightMm + BLEED_MM * 2) / cardHeightMm);
      const outputWidth = cardWidthMm * bleedScale;
      const outputHeight = cardHeightMm * bleedScale;
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        x - (outputWidth - cardWidthMm) / 2,
        y - (outputHeight - cardHeightMm) / 2,
        outputWidth,
        outputHeight,
        undefined,
        "FAST",
      );
      drawCropMarks(x, y);
    };

    const frontPageCount = Math.ceil(renderedCards.length / cardsPerPage);
    let outputPageCount = 0;
    for (let pageIndex = 0; pageIndex < frontPageCount; pageIndex += 1) {
      if (outputPageCount > 0) pdf.addPage("a4", "portrait");
      outputPageCount += 1;
      const pageStart = pageIndex * cardsPerPage;
      const frontBatch = renderedCards.slice(pageStart, pageStart + cardsPerPage);
      for (let position = 0; position < frontBatch.length; position += 1) {
        await renderCard(frontBatch[position], position, false);
      }
      if (renderedBackCards.length) {
        pdf.addPage("a4", "portrait");
        outputPageCount += 1;
        const backBatch = renderedBackCards.slice(pageStart, pageStart + cardsPerPage);
        for (let position = 0; position < backBatch.length; position += 1) {
          await renderCard(backBatch[position], position, true);
        }
      }
    }

    pdf.save(`The_KSPORT_${safeFilename(tournamentName)}.pdf`);
    return { success: true, cardCount: renderedCards.length, pageCount: outputPageCount };
  } finally {
    staging.remove();
  }
}
