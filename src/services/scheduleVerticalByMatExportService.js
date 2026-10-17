import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  addMinutesToTime,
  estimateCategoryDuration,
  generateDefaultMats,
} from "./scheduleService";

const ROWS_PER_PAGE = 13;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const safeFilenamePart = (value) =>
  String(value || "Giai_dau")
    .replace(/[^a-zA-Z0-9\u00C0-\u1EF9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString("vi-VN") : "—";

function collectMatRows(
  schedule,
  categories,
  customEvents,
  mats,
  tournament,
  tournamentDays
) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const dayOrder = new Map(tournamentDays.map((date, index) => [date, index]));
  const durationSettings =
    tournament.scheduleConfig?.durations || tournament.setup?.durations;

  return mats.map((mat) => {
    const rows = [];

    Object.entries(schedule).forEach(([categoryId, assignment]) => {
      if (Number(assignment.mat) !== Number(mat.id)) return;
      const category = categoryMap.get(categoryId);
      if (!category) return;
      const duration = estimateCategoryDuration(category, durationSettings);
      rows.push({
        kind: "category",
        date: assignment.date || "",
        time: assignment.time || "",
        order: Number(assignment.order) || 0,
        name: category.name || "",
        type: category.type === "kumite" ? "KUMITE" : "KATA",
        athletes: category.athletes?.length || 0,
        endTime:
          assignment.endTime ||
          (assignment.time ? addMinutesToTime(assignment.time, duration) : ""),
      });
    });

    customEvents
      .filter((event) => Number(event.mat) === 0 || Number(event.mat) === Number(mat.id))
      .forEach((event) => {
        const duration = Math.max(5, Number(event.duration) || 15);
        const eventDates = event.date
          ? [event.date]
          : (tournamentDays.length ? tournamentDays : [""]);
        eventDates.forEach((date) => {
          rows.push({
            kind: "event",
            date,
            time: event.time || "",
            order: Number(event.order) || 0,
            name: `${event.icon || ""} ${event.name || "Sự kiện"}`.trim(),
            type: "SỰ KIỆN",
            athletes: "—",
            endTime: event.time ? addMinutesToTime(event.time, duration) : "",
          });
        });
      });

    rows.sort((a, b) => {
      const dayA = dayOrder.has(a.date) ? dayOrder.get(a.date) : Number.MAX_SAFE_INTEGER;
      const dayB = dayOrder.has(b.date) ? dayOrder.get(b.date) : Number.MAX_SAFE_INTEGER;
      return dayA - dayB ||
        String(a.date).localeCompare(String(b.date)) ||
        String(a.time).localeCompare(String(b.time)) ||
        a.order - b.order ||
        a.name.localeCompare(b.name, "vi");
    });

    return { mat, rows };
  }).filter((group) => group.rows.length > 0);
}

function buildPageHtml({ group, rows, tournament, tournamentDays, page, totalPages, startIndex }) {
  const matColor = group.mat.color || "#3b82f6";
  const bodyRows = rows.map((row, index) => {
    const isEvent = row.kind === "event";
    const typeColor = isEvent ? "#b45309" : row.type === "KUMITE" ? "#ef4444" : "#2563eb";
    const typeBackground = isEvent ? "#fef3c7" : row.type === "KUMITE" ? "#fef2f2" : "#eff6ff";
    const dayIndex = tournamentDays.indexOf(row.date);
    const dayLabel = dayIndex >= 0
      ? `Ngày ${dayIndex + 1}<br><span>${escapeHtml(formatDate(row.date))}</span>`
      : escapeHtml(formatDate(row.date));
    const timeRange = row.time
      ? `${escapeHtml(row.time)}${row.endTime ? ` - ${escapeHtml(row.endTime)}` : ""}`
      : "—";

    return `
      <tr class="${isEvent ? "event-row" : ""}">
        <td class="center index">${startIndex + index + 1}</td>
        <td class="content-cell">
          <span class="type-dot" style="background:${typeColor}"></span>
          <span>${escapeHtml(row.name)}</span>
        </td>
        <td class="center"><span class="type-badge" style="color:${typeColor};background:${typeBackground}">${escapeHtml(row.type)}</span></td>
        <td class="center athlete-count">${escapeHtml(row.athletes)}</td>
        <td class="center"><span class="mat-badge" style="background:${matColor}">${escapeHtml(group.mat.name)}</span></td>
        <td class="center day-cell">${dayLabel}</td>
        <td class="center time-cell">${timeRange}</td>
      </tr>`;
  }).join("");

  return `
    <div class="schedule-page">
      <style>
        * { box-sizing: border-box; }
        .schedule-page {
          width: 1000px;
          padding: 34px 34px 26px;
          background: #fff;
          color: #1e293b;
          font-family: "Segoe UI", Arial, sans-serif;
        }
        .title { text-align: center; margin-bottom: 7px; font-size: 25px; font-weight: 900; text-transform: uppercase; color: #0f172a; }
        .tournament { text-align: center; margin-bottom: 17px; color: #475569; font-size: 16px; font-weight: 700; }
        .mat-title {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px; padding: 10px 14px; border-left: 7px solid ${matColor};
          background: #f8fafc; font-size: 18px; font-weight: 900;
        }
        .page-number { color: #64748b; font-size: 12px; font-weight: 700; }
        table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; border: 1px solid #cbd5e1; border-radius: 9px; overflow: hidden; }
        th { padding: 11px 8px; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; color: #334155; font-size: 12px; font-weight: 900; text-transform: uppercase; }
        td { height: 52px; padding: 9px 8px; border-bottom: 1px solid #e2e8f0; background: #fff; font-size: 13px; vertical-align: middle; }
        tbody tr:nth-child(even) td { background: #f8fafc; }
        tbody tr:last-child td { border-bottom: 0; }
        .event-row td { background: #fffbeb !important; }
        .center { text-align: center; }
        .index { color: #475569; }
        .content-cell { display: table-cell; font-size: 14px; font-weight: 700; line-height: 1.28; }
        .type-dot { display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; vertical-align: 1px; }
        .type-badge { display: inline-block; padding: 4px 7px; border-radius: 5px; font-size: 11px; font-weight: 900; }
        .athlete-count { font-weight: 700; }
        .mat-badge { display: inline-block; padding: 5px 8px; border-radius: 5px; color: #fff; font-size: 11px; font-weight: 900; white-space: nowrap; }
        .day-cell { color: #475569; font-size: 11px; font-weight: 700; line-height: 1.3; }
        .day-cell span { font-weight: 500; }
        .time-cell { color: #4338ca; font-size: 12px; font-weight: 800; white-space: nowrap; }
        .footer { margin-top: 10px; text-align: right; color: #94a3b8; font-size: 10px; }
      </style>
      <div class="title">Lịch thi đấu theo thảm</div>
      <div class="tournament">🏆 ${escapeHtml(tournament.name)}</div>
      <div class="mat-title">
        <span>🥋 ${escapeHtml(group.mat.name)} — ${group.rows.length} nội dung/sự kiện</span>
        <span class="page-number">Trang ${page}/${totalPages}</span>
      </div>
      <table>
        <colgroup>
          <col style="width:6%"><col style="width:37%"><col style="width:10%"><col style="width:7%">
          <col style="width:10%"><col style="width:14%"><col style="width:16%">
        </colgroup>
        <thead><tr><th>STT</th><th style="text-align:left">Nội dung</th><th>Loại</th><th>VĐV</th><th>Thảm</th><th>Ngày</th><th>Giờ</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div class="footer">Karate Manager · Xuất lịch A4 dọc theo thảm</div>
    </div>`;
}

async function renderHtmlToCanvas(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  document.body.appendChild(container);
  try {
    return await html2canvas(container.firstElementChild, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
  } finally {
    container.remove();
  }
}

export async function exportScheduleVerticalByMatToPDF(
  schedule,
  categories,
  customEvents,
  matCount,
  tournament,
  tournamentDays,
  options = {}
) {
  const mats = generateDefaultMats(matCount);
  const days = tournamentDays.length
    ? tournamentDays
    : [...new Set(Object.values(schedule).map((item) => item.date).filter(Boolean))].sort();
  const groups = collectMatRows(
    schedule,
    categories,
    customEvents,
    mats,
    tournament,
    days
  );

  if (groups.length === 0) {
    throw new Error("Chưa có nội dung nào được xếp thảm để xuất.");
  }

  const renderGroupsToPdf = async (groupsToRender) => {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 7;
    let hasPage = false;

    for (const group of groupsToRender) {
    const chunks = [];
    for (let index = 0; index < group.rows.length; index += ROWS_PER_PAGE) {
      chunks.push({ rows: group.rows.slice(index, index + ROWS_PER_PAGE), startIndex: index });
    }

    for (let pageIndex = 0; pageIndex < chunks.length; pageIndex += 1) {
      const chunk = chunks[pageIndex];
      const canvas = await renderHtmlToCanvas(buildPageHtml({
        group,
        rows: chunk.rows,
        tournament,
        tournamentDays: days,
        page: pageIndex + 1,
        totalPages: chunks.length,
        startIndex: chunk.startIndex,
      }));
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const scale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
      const imageWidth = canvas.width * scale;
      const imageHeight = canvas.height * scale;

      if (hasPage) pdf.addPage("a4", "portrait");
      hasPage = true;
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        (pageWidth - imageWidth) / 2,
        margin,
        imageWidth,
        imageHeight
      );
    }
    }
    return pdf;
  };

  if (options.separateFiles) {
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      options.onProgress?.({
        current: index + 1,
        total: groups.length,
        matName: group.mat.name,
        percent: Math.round((index / groups.length) * 100),
      });
      const pdf = await renderGroupsToPdf([group]);
      pdf.save(
        `LichThiDau_Doc_${safeFilenamePart(group.mat.name)}_${safeFilenamePart(tournament.name)}.pdf`
      );
    }
    options.onProgress?.({
      current: groups.length,
      total: groups.length,
      matName: "Hoàn tất",
      percent: 100,
    });
    return { fileCount: groups.length, separateFiles: true };
  }

  const pdf = await renderGroupsToPdf(groups);
  pdf.save(`LichThiDau_Doc_TheoTham_${safeFilenamePart(tournament.name)}.pdf`);
  options.onProgress?.({ current: 1, total: 1, matName: "Hoàn tất", percent: 100 });
  return { fileCount: 1, separateFiles: false };
}
