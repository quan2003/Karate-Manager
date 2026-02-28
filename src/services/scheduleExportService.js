import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { generateDefaultMats } from "./scheduleService";

/**
 * Schedule Export Service
 * Export lịch thi đấu sang PDF và Excel
 */

// ========== PDF Export ==========

export async function exportScheduleToPDF(
  schedule,
  categories,
  customEvents,
  matCount,
  tournament,
  selectedDate,
  tournamentDays
) {
  const mats = generateDefaultMats(matCount);
  const dayLabel = tournamentDays.length > 1
    ? ` - Ngày ${tournamentDays.indexOf(selectedDate) + 1} (${new Date(selectedDate).toLocaleDateString("vi-VN")})`
    : "";

  // Build HTML
  const html = buildScheduleHTML(schedule, categories, customEvents, mats, tournament, selectedDate, dayLabel);

  // Render to canvas
  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "1200px";
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgWidth = 297; // A4 landscape width mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pdf = new jsPDF({
      orientation: imgHeight > imgWidth ? "portrait" : "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
    const w = imgWidth * ratio;
    const h = imgHeight * ratio;

    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);

    const filename = `lich_thi_dau_${tournament.name.replace(/\s+/g, "_")}${dayLabel ? `_ngay${tournamentDays.indexOf(selectedDate) + 1}` : ""}.pdf`;
    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

function buildScheduleHTML(schedule, categories, customEvents, mats, tournament, selectedDate, dayLabel) {
  const matColors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f43f5e", "#6366f1"];

  let matColumnsHTML = "";
  mats.forEach((mat, idx) => {
    const matItems = Object.entries(schedule)
      .filter(([, s]) => s.mat === mat.id && s.date === selectedDate)
      .map(([catId, s]) => {
        const cat = categories.find(c => c.id === catId);
        return cat ? { ...s, category: cat, itemType: "category" } : null;
      })
      .filter(Boolean);

    const matEvents = customEvents
      .filter(evt => (evt.mat === 0 || evt.mat === mat.id) && (evt.date === selectedDate || !evt.date))
      .map(evt => ({ ...evt, itemType: "event" }));

    const allItems = [...matItems, ...matEvents]
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

    const color = matColors[idx % matColors.length];
    let itemsHTML = "";
    allItems.forEach(item => {
      if (item.itemType === "event") {
        itemsHTML += `
          <div style="padding:6px 8px;margin-bottom:4px;border-left:3px solid #f59e0b;background:#fffbeb;border-radius:4px;font-size:11px;">
            <div style="color:#92400e;font-weight:600;">${item.time} — ${item.icon || ""} ${item.name}</div>
            <div style="color:#d97706;font-size:9px;">Sự kiện</div>
          </div>`;
      } else {
        const typeDot = item.category.type === "kumite" ? "#ef4444" : "#3b82f6";
        itemsHTML += `
          <div style="padding:6px 8px;margin-bottom:4px;border-left:3px solid ${color};background:#f8fafc;border-radius:4px;font-size:11px;">
            <div style="color:#4338ca;font-weight:600;font-size:10px;">${item.time || "--:--"}</div>
            <div style="display:flex;align-items:center;gap:4px;font-weight:600;color:#1e293b;">
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${typeDot};"></span>
              ${item.category.name}
            </div>
            <div style="color:#64748b;font-size:9px;">${item.category.athletes?.length || 0} VĐV</div>
          </div>`;
      }
    });

    if (allItems.length === 0) {
      itemsHTML = `<div style="text-align:center;padding:20px;color:#94a3b8;font-size:11px;">Chưa có nội dung</div>`;
    }

    matColumnsHTML += `
      <div style="flex:1;min-width:180px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff;">
        <div style="padding:8px 12px;border-bottom:2px solid ${color};background:${color}15;display:flex;align-items:center;gap:6px;font-size:12px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};"></span>
          <strong>${mat.name}</strong>
          <span style="margin-left:auto;color:#64748b;font-size:10px;">${matItems.length} nội dung</span>
        </div>
        <div style="padding:8px;">${itemsHTML}</div>
      </div>`;
  });

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;padding:24px;background:#fff;color:#1e293b;">
      <div style="text-align:center;margin-bottom:16px;">
        <h2 style="margin:0;font-size:20px;color:#0f172a;">📋 LỊCH THI ĐẤU${dayLabel}</h2>
        <p style="margin:4px 0 0;color:#64748b;font-size:13px;">🏆 ${tournament.name}</p>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">${matColumnsHTML}</div>
    </div>`;
}

// ========== Excel Export ==========

export function exportScheduleToExcel(
  schedule,
  categories,
  customEvents,
  matCount,
  tournament,
  selectedDate,
  tournamentDays
) {
  const mats = generateDefaultMats(matCount);
  const dayLabel = tournamentDays.length > 1
    ? `Ngày ${tournamentDays.indexOf(selectedDate) + 1}`
    : "";

  // Build table data
  const rows = [];

  // Header
  rows.push(["LỊCH THI ĐẤU" + (dayLabel ? ` - ${dayLabel}` : "")]);
  rows.push([`Giải: ${tournament.name}`]);
  rows.push([]);
  rows.push(["STT", "Giờ", "Thảm", "Loại", "Nội dung", "Số VĐV", "Ghi chú"]);

  // Collect all items for selected date
  const allItems = [];

  Object.entries(schedule).forEach(([catId, s]) => {
    if (s.date !== selectedDate) return;
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    const mat = mats.find(m => m.id === s.mat);
    allItems.push({
      time: s.time || "",
      matName: mat?.name || `Thảm ${s.mat}`,
      matId: s.mat,
      type: cat.type === "kumite" ? "Kumite" : "Kata",
      name: cat.name,
      athletes: cat.athletes?.length || 0,
      note: cat.bracket ? "Đã bốc thăm" : "",
      itemType: "category",
    });
  });

  customEvents
    .filter(evt => evt.date === selectedDate || !evt.date)
    .forEach(evt => {
      const matName = evt.mat === 0 ? "Tất cả" : (mats.find(m => m.id === evt.mat)?.name || "");
      allItems.push({
        time: evt.time || "",
        matName,
        matId: evt.mat,
        type: "Sự kiện",
        name: `${evt.icon || ""} ${evt.name}`,
        athletes: "",
        note: "",
        itemType: "event",
      });
    });

  // Sort by time then mat
  allItems.sort((a, b) => (a.time || "").localeCompare(b.time || "") || (a.matId || 0) - (b.matId || 0));

  allItems.forEach((item, idx) => {
    rows.push([
      idx + 1,
      item.time,
      item.matName,
      item.type,
      item.name,
      item.athletes,
      item.note,
    ]);
  });

  // Summary
  rows.push([]);
  const catCount = allItems.filter(i => i.itemType === "category").length;
  const evtCount = allItems.filter(i => i.itemType === "event").length;
  rows.push([`Tổng: ${catCount} nội dung, ${evtCount} sự kiện`]);

  // Create workbook
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 5 },  // STT
    { wch: 8 },  // Giờ
    { wch: 12 }, // Thảm
    { wch: 10 }, // Loại
    { wch: 35 }, // Nội dung
    { wch: 8 },  // VĐV
    { wch: 15 }, // Ghi chú
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = dayLabel || "Lịch thi đấu";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const filename = `lich_thi_dau_${tournament.name.replace(/\s+/g, "_")}${dayLabel ? `_${dayLabel.replace(/\s+/g, "_")}` : ""}.xlsx`;
  XLSX.writeFile(wb, filename);
}
