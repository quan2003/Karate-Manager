import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { generateDefaultMats } from "./scheduleService";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString("vi-VN") : "";

function buildDaySection(schedule, categories, customEvents, mats, date, dayIndex) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const matItems = new Map(mats.map((mat) => [mat.id, []]));

  Object.entries(schedule).forEach(([categoryId, assignment]) => {
    if (assignment.date !== date || !matItems.has(assignment.mat)) return;
    const category = categoryMap.get(categoryId);
    if (!category) return;
    matItems.get(assignment.mat).push({
      time: assignment.time || "",
      name: category.name || "",
    });
  });

  const dayEvents = customEvents
    .filter((event) => event.date === date || !event.date)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const activeMats = mats.filter(
    (mat) =>
      matItems.get(mat.id).length > 0 ||
      dayEvents.some((event) => event.mat === 0 || event.mat === mat.id)
  );
  const visibleMats = activeMats.length ? activeMats : mats;

  const times = new Set();
  visibleMats.forEach((mat) => {
    matItems.get(mat.id)
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((item) => times.add(item.time));
  });
  dayEvents.forEach((event) => times.add(event.time || ""));

  const rows = [...times].sort().map((time) => {
    const globalEvents = dayEvents.filter(
      (event) => event.mat === 0 && (event.time || "") === time
    );
    const eventRows = globalEvents
      .map(
        (event) => `
          <tr class="event-row">
            <td colspan="${visibleMats.length * 2}">
              ${escapeHtml(`${event.icon || ""} ${event.name}`)}
            </td>
          </tr>`
      )
      .join("");

    const cells = visibleMats
      .map((mat) => {
        const categoriesAtTime = matItems
          .get(mat.id)
          .filter((item) => item.time === time);
        const matEvents = dayEvents.filter(
          (event) => event.mat === mat.id && (event.time || "") === time
        );
        const names = [
          ...categoriesAtTime.map((item) => item.name),
          ...matEvents.map((event) => `${event.icon || ""} ${event.name}`),
        ];
        return `
          <td class="time">${escapeHtml(names.length ? time : "")}</td>
          <td class="content">${names.map(escapeHtml).join("<br>")}</td>`;
      })
      .join("");

    return `${eventRows}<tr>${cells}</tr>`;
  });

  const headers = visibleMats
    .map(
      (mat) => `
        <th class="time-head">Thời<br>gian</th>
        <th class="mat-head">${escapeHtml(mat.name)}</th>`
    )
    .join("");

  return `
    <section class="day-section">
      <div class="day-title">
        CHƯƠNG TRÌNH THI ĐẤU NGÀY ${dayIndex + 1} (${escapeHtml(
          formatDate(date)
        )}) VỚI ${visibleMats.length} THẢM THI ĐẤU
      </div>
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>
          ${rows.join("") || `<tr><td colspan="${visibleMats.length * 2}" class="empty">Chưa có nội dung</td></tr>`}
        </tbody>
      </table>
    </section>`;
}

function buildHorizontalScheduleHtml(
  schedule,
  categories,
  customEvents,
  matCount,
  tournament,
  date,
  dayIndex,
  showFooter
) {
  const mats = generateDefaultMats(matCount);
  const section = buildDaySection(
    schedule,
    categories,
    customEvents,
    mats,
    date,
    dayIndex
  );

  return `
    <div class="horizontal-schedule">
      <style>
        * { box-sizing: border-box; }
        .horizontal-schedule {
          width: 1600px;
          padding: 18px;
          background: #fff;
          color: #111;
          font-family: "Times New Roman", serif;
        }
        .main-title {
          margin: 0 0 10px;
          text-align: center;
          font-size: 22px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .day-section { margin: 0; }
        .day-title {
          border: 1px solid #111;
          background: #cfe2f3;
          padding: 5px;
          text-align: center;
          font-size: 15px;
          font-weight: 800;
          text-transform: uppercase;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 12px;
        }
        th, td { border: 1px solid #111; padding: 3px 5px; }
        .time-head, .time { width: 48px; text-align: center; font-weight: 700; }
        .mat-head { height: 34px; font-size: 17px; text-transform: uppercase; }
        .content { height: 23px; font-weight: 600; text-transform: uppercase; }
        .event-row td {
          background: #fff600;
          text-align: center;
          font-size: 14px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .empty { padding: 14px; text-align: center; color: #64748b; }
        .footer {
          border: 1px solid #111;
          background: #00a651;
          padding: 6px;
          text-align: center;
          font-size: 16px;
          font-weight: 800;
          text-transform: uppercase;
        }
      </style>
      <h1 class="main-title">${escapeHtml(tournament.name)}</h1>
      ${section}
      ${showFooter ? '<div class="footer">KẾT THÚC CHƯƠNG TRÌNH THI ĐẤU</div>' : ""}
    </div>`;
}

export async function exportScheduleHorizontalToPDF(
  schedule,
  categories,
  customEvents,
  matCount,
  tournament,
  tournamentDays
) {
  const days = tournamentDays.length
    ? tournamentDays
    : [...new Set(Object.values(schedule).map((item) => item.date).filter(Boolean))];
  if (!days.length) {
    throw new Error("Chưa có ngày thi đấu để xuất.");
  }

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const container = document.createElement("div");
    container.innerHTML = buildHorizontalScheduleHtml(
      schedule,
      categories,
      customEvents,
      matCount,
      tournament,
      days[dayIndex],
      dayIndex,
      dayIndex === days.length - 1
    );
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "0";
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const image = canvas.toDataURL("image/png");
      const scale = Math.min(pdfWidth / canvas.width, pdfHeight / canvas.height);
      const imageWidth = canvas.width * scale;
      const imageHeight = canvas.height * scale;

      if (dayIndex > 0) {
        pdf.addPage("a4", "landscape");
      }
      pdf.addImage(image, "PNG", 0, 0, imageWidth, imageHeight);
    } finally {
      container.remove();
    }
  }

  pdf.save(
    `LichThiDau_Ngang_${String(tournament.name || "Giai_dau").replace(
      /[^a-zA-Z0-9\u00C0-\u1EF9]+/g,
      "_"
    )}.pdf`
  );
}