import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { generateDefaultMats, estimateCategoryDuration, addMinutesToTime } from "./scheduleService";

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
  selectedDate, // if 'all', exports all days
  tournamentDays,
  viewMode = 'timeline'
) {
  const mats = generateDefaultMats(matCount);
  const orientation = viewMode === 'table' ? "portrait" : "landscape";
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  let firstPage = true;

  const daysToExport = selectedDate === 'all' && tournamentDays.length > 0 
    ? tournamentDays 
    : [selectedDate];

  for (const date of daysToExport) {
    const dayLabel = tournamentDays.length > 1 && date
      ? ` - Ngày ${tournamentDays.indexOf(date) + 1} (${new Date(date).toLocaleDateString("vi-VN")})`
      : "";

    // Build HTML for the specific day
    const html = viewMode === 'table'
      ? buildScheduleTableHTML(schedule, categories, customEvents, mats, tournament, date, dayLabel)
      : buildScheduleHTML(schedule, categories, customEvents, mats, tournament, date, dayLabel);

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

      const imgData = canvas.toDataURL("image/png");
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      if (!firstPage) {
        pdf.addPage("a4", orientation);
      }

      const ratio = pdfWidth / canvas.width;
      const imgHeightInPdf = canvas.height * ratio;
      
      let heightLeft = imgHeightInPdf;
      let position = 0;
      
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeightInPdf);
      heightLeft -= pdfHeight;
      
      while (heightLeft > 0) {
        position = position - pdfHeight;
        pdf.addPage("a4", orientation);
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeightInPdf);
        heightLeft -= pdfHeight;
      }
      
    } catch (err) {
      console.error("PDF generation error for day", date, err);
    } finally {
      document.body.removeChild(container);
    }
    firstPage = false;
  }

  const prefix = viewMode === 'table' ? 'Bang' : 'Timeline';
  pdf.save(`LichThiDau_${prefix}_${tournament.name.replace(/\s+/g, "_")}${selectedDate === 'all' ? '_All' : ''}.pdf`);
}

function buildScheduleHTML(schedule, categories, customEvents, mats, tournament, selectedDate, dayLabel) {
  const matColors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f43f5e", "#6366f1"];

  // Chỉ lấy những thảm có sự kiện hoặc có nội dung thi đấu trong ngày
  let activeMats = mats.filter(mat => {
    const hasItems = Object.values(schedule).some(s => s.mat === mat.id && s.date === selectedDate);
    const hasEvents = customEvents.some(evt => (evt.mat === 0 || evt.mat === mat.id) && (evt.date === selectedDate || !evt.date));
    return hasItems || hasEvents;
  });
  if (activeMats.length === 0) activeMats = mats;

  let matColumnsHTML = "";
  activeMats.forEach((mat, idx) => {
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
    allItems.forEach((item, itemIdx) => {
      const rowBg = itemIdx % 2 === 0 ? "#f0f4ff" : "#ffffff";
      if (item.itemType === "event") {
        itemsHTML += `
          <div style="padding:12px 14px;margin-bottom:8px;border:2px solid #f59e0b;background:#fffbeb;border-radius:8px;">
            <div style="color:#b45309;font-weight:800;font-size:16px;margin-bottom:3px;">${item.time} — ${item.icon || ""} ${item.name}</div>
            <div style="color:#d97706;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Sự kiện đặc biệt</div>
          </div>`;
      } else {
        const typeDot = item.category.type === "kumite" ? "#ef4444" : "#3b82f6";
        const typeLabel = item.category.type === "kumite" ? "Kumite" : "Kata";
        const typeBg = item.category.type === "kumite" ? "#fef2f2" : "#eff6ff";
        const typeColor = item.category.type === "kumite" ? "#dc2626" : "#2563eb";
        
        const dur = estimateCategoryDuration(item.category, tournament.setup?.durations);
        const endTime = addMinutesToTime(item.time, dur);
        const timeRange = `${item.time} - ${endTime}`;

        itemsHTML += `
          <div style="padding:12px 14px;margin-bottom:8px;border:2px solid ${color};border-left:6px solid ${color};background:${rowBg};border-radius:8px;">
            <div style="color:#4338ca;font-weight:700;font-size:15px;margin-bottom:5px;">🕐 ${timeRange}</div>
            <div style="display:flex;align-items:center;gap:7px;font-weight:800;font-size:17px;color:#0f172a;margin-bottom:6px;line-height:1.3;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${typeDot};flex-shrink:0;"></span>
              ${item.category.name}
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:13px;font-weight:700;padding:3px 9px;border-radius:5px;background:${typeBg};color:${typeColor};border:1px solid ${typeColor}40;">${typeLabel}</span>
              <span style="font-size:14px;color:#475569;font-weight:600;">${item.category.athletes?.length || 0} VĐV</span>
            </div>
          </div>`;
      }
    });

    if (allItems.length === 0) {
      itemsHTML = `<div style="text-align:center;padding:30px;color:#94a3b8;font-size:15px;">Chưa có nội dung</div>`;
    }

    matColumnsHTML += `
      <div style="width:calc(${100 / activeMats.length}% - 16px);border:3px solid ${color};border-radius:12px;overflow:hidden;background:#fff;">
        <div style="padding:14px 18px;border-bottom:3px solid ${color};background:${color}25;display:flex;align-items:center;gap:10px;">
          <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};"></span>
          <strong style="font-size:18px;color:#0f172a;font-weight:800;">${mat.name}</strong>
          <span style="margin-left:auto;color:#64748b;font-size:13px;font-weight:700;background:#fff;padding:3px 10px;border-radius:6px;border:1.5px solid #e2e8f0;">${matItems.length} nội dung</span>
        </div>
        <div style="padding:10px;">${itemsHTML}</div>
      </div>`;
  });

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;padding:32px;background:#fff;color:#1e293b;width:1200px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid #e2e8f0;">
        <h2 style="margin:0;font-size:28px;font-weight:800;color:#0f172a;">📋 LỊCH THI ĐẤU${dayLabel}</h2>
        <p style="margin:8px 0 0;color:#64748b;font-size:16px;font-weight:600;">🏆 ${tournament.name}</p>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;width:100%;">
        ${matColumnsHTML}
      </div>
    </div>`;
}

function buildScheduleTableHTML(schedule, categories, customEvents, mats, tournament, selectedDate, dayLabel) {
  const allItems = [];
  Object.entries(schedule).forEach(([catId, s]) => {
    if (s.date !== selectedDate) return;
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    const mat = mats.find(m => m.id === s.mat);
    
    const dur = estimateCategoryDuration(cat, tournament.setup?.durations);
    const endTime = addMinutesToTime(s.time, dur);
    const timeRange = `${s.time} - ${endTime}`;

    allItems.push({
      time: s.time,
      timeRange: timeRange,
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
        timeRange: evt.time || "",
        matName,
        matId: evt.mat,
        type: "Sự kiện",
        name: `${evt.icon || ""} ${evt.name}`,
        athletes: "-",
        note: "",
        itemType: "event",
      });
    });

  // sort by time then mat
  allItems.sort((a, b) => (a.time || "").localeCompare(b.time || "") || (a.matId || 0) - (b.matId || 0));

  let rowsHTML = "";
  allItems.forEach((item, idx) => {
    const isEvent = item.itemType === "event";
    const bg = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
    const typeLabel = item.type;
    const typeColor = item.type === "Kumite" ? "#ef4444" : (item.type === "Kata" ? "#3b82f6" : "#d97706");
    const typeBg = item.type === "Kumite" ? "#fef2f2" : (item.type === "Kata" ? "#eff6ff" : "#fffbeb");

    if (isEvent) {
      rowsHTML += `
        <tr style="background:#fffbeb; font-weight:bold;">
          <td style="padding:10px; border:1px solid #000000; text-align:center;">${idx + 1}</td>
          <td style="padding:10px; border:1px solid #000000; text-align:center; color:#b45309;">${item.timeRange}</td>
          <td style="padding:10px; border:1px solid #000000; text-align:center;">${item.matName}</td>
          <td style="padding:10px; border:1px solid #000000; text-align:center;">
             <span style="padding:4px 8px; border-radius:4px; background:#fef3c7; color:#d97706; font-size:12px;">Sự kiện</span>
          </td>
          <td style="padding:10px; border:1px solid #000000; color:#b45309;">${item.name}</td>
          <td style="padding:10px; border:1px solid #000000; text-align:center;">-</td>
          <td style="padding:10px; border:1px solid #000000;">${item.note}</td>
        </tr>
      `;
    } else {
      rowsHTML += `
        <tr style="background:${bg}">
          <td style="padding:10px; border:1px solid #000000; text-align:center;">${idx + 1}</td>
          <td style="padding:10px; border:1px solid #000000; text-align:center; font-weight:600;">${item.timeRange}</td>
          <td style="padding:10px; border:1px solid #000000; text-align:center; font-weight:bold; color:#111827;">${item.matName}</td>
          <td style="padding:10px; border:1px solid #000000; text-align:center;">
            <span style="padding:4px 8px; border-radius:4px; background:${typeBg}; color:${typeColor}; font-weight:bold; font-size:12px;">${typeLabel}</span>
          </td>
          <td style="padding:10px; border:1px solid #000000; font-weight:600; color:#000000;">${item.name}</td>
          <td style="padding:10px; border:1px solid #000000; text-align:center; font-weight:bold; color:#000000;">${item.athletes}</td>
          <td style="padding:10px; border:1px solid #000000; color:#000000;">${item.note}</td>
        </tr>
      `;
    }
  });

  if (allItems.length === 0) {
    rowsHTML = `<tr><td colspan="7" style="padding:20px; text-align:center; color:#94a3b8;">Chưa có nội dung</td></tr>`;
  }

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;padding:32px;background:#fff;color:#1e293b;width:1200px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:24px;padding-bottom:18px;border-bottom:3px solid #e2e8f0;">
        <h2 style="margin:0;font-size:28px;font-weight:800;color:#0f172a;">📋 LỊCH THI ĐẤU (DANH SÁCH)${dayLabel}</h2>
        <p style="margin:8px 0 0;color:#64748b;font-size:16px;font-weight:600;">🏆 ${tournament.name}</p>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:14px; border:2px solid #000000; color:#000000;">
        <thead>
          <tr style="background:#e2e8f0; color:#000000; text-transform:uppercase; font-size:13px; border-bottom:2px solid #000000;">
            <th style="padding:12px 10px; border:1px solid #000000; width:50px;">STT</th>
            <th style="padding:12px 10px; border:1px solid #000000; width:120px;">Giờ</th>
            <th style="padding:12px 10px; border:1px solid #000000; width:90px;">Thảm</th>
            <th style="padding:12px 10px; border:1px solid #000000; width:90px;">Loại</th>
            <th style="padding:12px 10px; border:1px solid #000000; text-align:left;">Nội dung</th>
            <th style="padding:12px 10px; border:1px solid #000000; width:70px;">Số VĐV</th>
            <th style="padding:12px 10px; border:1px solid #000000; width:120px;">Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    </div>
  `;
}

// ========== Excel Export ==========

export function exportScheduleToExcel(
  schedule,
  categories,
  customEvents,
  matCount,
  tournament,
  selectedDate, // if 'all', exports all days
  tournamentDays
) {
  const mats = generateDefaultMats(matCount);
  const daysToExport = selectedDate === 'all' && tournamentDays.length > 0 
    ? tournamentDays 
    : [selectedDate];

  const rows = [];
  for (const date of daysToExport) {
    const dayLabel = tournamentDays.length > 1 && date
      ? `Ngày ${tournamentDays.indexOf(date) + 1} (${new Date(date).toLocaleDateString("vi-VN")})`
      : "";

    rows.push(["LỊCH THI ĐẤU" + (dayLabel ? ` - ${dayLabel}` : "")]);
    rows.push([`Giải: ${tournament.name}`]);
    rows.push([]);
    rows.push(["STT", "Giờ", "Thảm", "Loại", "Nội dung", "Số VĐV", "Ghi chú"]);

    const allItems = [];
    Object.entries(schedule).forEach(([catId, s]) => {
      if (s.date !== date) return;
      const cat = categories.find(c => c.id === catId);
      if (!cat) return;
      const mat = mats.find(m => m.id === s.mat);
      
      const dur = estimateCategoryDuration(cat, tournament.setup?.durations);
      const endTime = addMinutesToTime(s.time, dur);
      const timeRange = `${s.time} - ${endTime}`;

      allItems.push({
        time: timeRange,
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
      .filter(evt => evt.date === date || !evt.date)
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

    allItems.sort((a, b) => (a.time || "").localeCompare(b.time || "") || (a.matId || 0) - (b.matId || 0));

    allItems.forEach((item, idx) => {
      rows.push([idx + 1, item.time, item.matName, item.type, item.name, item.athletes, item.note]);
    });

    rows.push([]);
    const catCount = allItems.filter(i => i.itemType === "category").length;
    const evtCount = allItems.filter(i => i.itemType === "event").length;
    rows.push([`Tổng: ${catCount} nội dung, ${evtCount} sự kiện`]);
    rows.push([]);
    rows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 5 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "LichThiDau");
  const filename = `LichThiDau_${tournament.name.replace(/\s+/g, "_")}${selectedDate === 'all' ? '_All' : ''}.xlsx`;
  XLSX.writeFile(wb, filename);
}
