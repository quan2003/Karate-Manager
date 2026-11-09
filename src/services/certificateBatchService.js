import * as XLSX from "xlsx";
import { getAwardedAthletes } from "./certificateService";

const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();

const getMedalPriority = (achievement) => {
  const medal = normalize(achievement).toLocaleLowerCase("vi");
  if (medal.includes("v\u00e0ng")) return 0;
  if (medal.includes("b\u1ea1c")) return 1;
  if (medal.includes("\u0111\u1ed3ng")) return 2;
  return 3;
};

const safeFilename = (value) =>
  normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Giai_dau";

export function getCertificateCategorySummary(tournament) {
  const awarded = getAwardedAthletes(tournament);
  const counts = awarded.reduce((map, record) => {
    map.set(record.categoryId, (map.get(record.categoryId) || 0) + 1);
    return map;
  }, new Map());

  const schedule = tournament?.schedule || {};
  const resolveSchedule = (categoryId) => {
    if (schedule[categoryId]) return schedule[categoryId];
    return Object.entries(schedule)
      .filter(([key]) => key.startsWith(`${categoryId}_split`))
      .map(([, assignment]) => assignment)
      .sort((left, right) =>
        `${left?.date || ""}|${left?.time || ""}`.localeCompare(`${right?.date || ""}|${right?.time || ""}`),
      )[0] || null;
  };

  return (tournament?.categories || []).map((category) => ({
    id: category.id,
    name: category.name || "Chưa đặt tên",
    type: category.type,
    recipientCount: counts.get(category.id) || 0,
    ready: counts.has(category.id),
    resultReceivedAt: tournament?.categoryResults?.[category.id]?._lanSyncedAt
      || tournament?.categoryResults?.[category.id]?.resultReceivedAt
      || tournament?.categoryResults?.[category.id]?.resultUpdatedAt
      || null,
    schedule: resolveSchedule(category.id),
  }));
}

export function getCertificateSessionGroups(tournament, categorySummary) {
  const afternoonStart = tournament?.scheduleConfig?.sessionConfig?.afternoonStart
    || tournament?.scheduleConfig?.afternoonStart || "13:00";
  const minutes = (time) => {
    const [hour = 0, minute = 0] = String(time || "00:00").split(":").map(Number);
    return hour * 60 + minute;
  };
  const groups = new Map();
  categorySummary.forEach((category) => {
    const assignment = category.schedule;
    if (!assignment?.date) return;
    const period = assignment.session || (minutes(assignment.time) >= minutes(afternoonStart) ? "afternoon" : "morning");
    const key = `${assignment.date}|${period}`;
    if (!groups.has(key)) groups.set(key, {
      key, date: assignment.date, period, categories: [], readyCount: 0, recipientCount: 0,
    });
    const group = groups.get(key);
    group.categories.push(category);
    if (category.ready) {
      group.readyCount += 1;
      group.recipientCount += category.recipientCount;
    }
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      categories: group.categories.sort((left, right) =>
        String(left.schedule?.time || "").localeCompare(String(right.schedule?.time || ""), "vi", { numeric: true }) || left.name.localeCompare(right.name, "vi"),
      ),
    }))
    .sort((left, right) => `${right.date}|${right.period}`.localeCompare(`${left.date}|${left.period}`));
}

export function getCertificateRecipients(tournament, categoryIds = []) {
  const selected = new Set(categoryIds);
  const categoryOrder = new Map(
    (tournament?.categories || []).map((category, index) => [category.id, index])
  );
  return getAwardedAthletes(tournament)
    .filter((record) => selected.size === 0 || selected.has(record.categoryId))
    .sort((left, right) => {
      const byCategory =
        (categoryOrder.get(left.categoryId) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(right.categoryId) ?? Number.MAX_SAFE_INTEGER);
      if (byCategory) return byCategory;

      const byMedal = getMedalPriority(left.achievement) - getMedalPriority(right.achievement);
      if (byMedal) return byMedal;

      return normalize(left.athleteName).localeCompare(normalize(right.athleteName), "vi");
    });
}

export function getCertificateCategoryFingerprint(tournament, categoryId) {
  return JSON.stringify(
    getCertificateRecipients(tournament, [categoryId]).map((record) => ({
      id: record.id,
      athleteId: record.athleteId || "",
      athleteName: normalize(record.athleteName),
      clubName: normalize(record.clubName),
      achievement: normalize(record.achievement),
      categoryName: normalize(record.categoryName),
      weightClass: normalize(record.weightClass),
    })),
  );
}

function buildRows(tournament, categoryIds) {
  return getCertificateRecipients(tournament, categoryIds).map((record, index) => ({
    STT: index + 1,
    HO_TEN: normalize(record.athleteName),
    DON_VI: normalize(record.clubName),
    HUY_CHUONG: normalize(record.achievement),
    HANG_MUC: normalize(record.categoryName),
    HANG_CAN: normalize(record.weightClass),
    GIOI_TINH: record.gender === "male" ? "Nam" : record.gender === "female" ? "Nữ" : "",
    TEN_GIAI: normalize(record.tournamentName || tournament?.name),
    NGAY_CAP: normalize(record.tournamentDate),
    MA_NOI_DUNG: record.categoryId,
    MA_NGUOI_NHAN: record.athleteId || "",
    MA_GIAY: record.id,
  }));
}

/**
 * Export a Mail Merge-ready workbook. Column names intentionally match the
 * {{PLACEHOLDER}} names used in the tournament's Word templates.
 */
export async function exportCertificateMailMergeExcel(tournament, categoryIds = []) {
  const rows = buildRows(tournament, categoryIds);
  if (!rows.length) throw new Error("Chưa có kết quả huy chương để xuất giấy chứng nhận.");

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 7 }, { wch: 30 }, { wch: 28 }, { wch: 20 }, { wch: 38 },
    { wch: 14 }, { wch: 12 }, { wch: 45 }, { wch: 14 }, { wch: 22 },
    { wch: 22 }, { wch: 35 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Du_lieu_tron_GCN");

  const guide = XLSX.utils.aoa_to_sheet([
    ["HƯỚNG DẪN TRỘN WORD"],
    ["1. Mở mẫu Word của giải và vào Mailings → Select Recipients → Use an Existing List."],
    ["2. Chọn sheet Du_lieu_tron_GCN trong tệp này."],
    ["3. Chèn các Merge Field: HO_TEN, DON_VI, HUY_CHUONG, HANG_MUC, TEN_GIAI…"],
    ["4. Xem trước, sau đó Finish & Merge để in hoặc xuất PDF."],
  ]);
  guide["!cols"] = [{ wch: 105 }];
  XLSX.utils.book_append_sheet(workbook, guide, "Huong_dan");

  const filename = `Du_lieu_tron_GCN_${safeFilename(tournament?.name)}.xlsx`;
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  if (window.electronAPI?.saveExportFile) {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("Không thể tạo tệp Excel."));
      reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }));
    });
    await window.electronAPI.saveExportFile(base64, filename, "xlsx");
  } else {
    XLSX.writeFile(workbook, filename);
  }
  return { rowCount: rows.length, filename };
}

export function createCertificateBatchRecord({ categoryIds, recipientCount, outputType, fingerprints = {}, documentKind = null }) {
  return {
    id: crypto.randomUUID?.() || `certificate-batch-${Date.now()}`,
    createdAt: new Date().toISOString(),
    categoryIds: [...categoryIds],
    recipientCount,
    outputType,
    fingerprints,
    documentKind,
  };
}
