import * as XLSX from "xlsx";

export const REFEREE_TEMPLATE_HEADERS = [
  "Họ và tên",
  "Đơn vị",
  "Cấp bậc",
  "Nội dung phụ trách",
  "Số điện thoại",
  "Ghi chú",
];

const normalizeText = (value = "") =>
  String(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const HEADER_ALIASES = {
  code: ["ma trong tai", "ma", "referee code", "code"],
  name: ["ho va ten", "ho ten", "ten trong tai", "name"],
  unit: ["don vi", "clb", "quoc gia", "tinh thanh", "unit", "country"],
  grade: ["cap bac", "cap", "rank", "grade"],
  specialty: ["noi dung phu trach", "noi dung", "chuyen mon", "specialty"],
  phone: ["so dien thoai", "dien thoai", "sdt", "phone"],
  note: ["ghi chu", "note"],
};

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getCell(row, field) {
  const aliases = HEADER_ALIASES[field];
  const matchedKey = Object.keys(row).find((key) => aliases.includes(normalizeText(key)));
  return matchedKey ? String(row[matchedKey] ?? "").trim() : "";
}

export function downloadRefereeTemplate() {
  const rows = [
    REFEREE_TEMPLATE_HEADERS,
    ["Nguyễn Văn An", "Hà Nội", "Quốc gia", "Kata", "0900000001", ""],
    ["Trần Thị Bình", "Hà Nội", "Quốc gia", "Kumite", "0900000002", ""],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 30 }, { wch: 22 }, { wch: 18 },
    { wch: 24 }, { wch: 18 }, { wch: 32 },
  ];
  worksheet["!autofilter"] = { ref: "A1:F3" };

  const instructions = XLSX.utils.aoa_to_sheet([
    ["HƯỚNG DẪN NHẬP DANH SÁCH TRỌNG TÀI"],
    ["1", "Không đổi tên các cột ở dòng đầu tiên."],
    ["2", "Chỉ cần nhập Họ và tên và Đơn vị; hệ thống sẽ tự cấp Mã trọng tài."],
    ["3", "Nội dung phụ trách: Kata, Kumite hoặc Cả hai."],
    ["4", "Có thể xóa hai dòng ví dụ trước khi nhập dữ liệu thật."],
    ["5", "Khi import lại, người trùng Họ và tên + Đơn vị sẽ được cập nhật, không tạo bản sao."],
  ]);
  instructions["!cols"] = [{ wch: 8 }, { wch: 85 }];
  instructions["!merges"] = [XLSX.utils.decode_range("A1:B1")];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "DanhSachTrongTai");
  XLSX.utils.book_append_sheet(workbook, instructions, "HuongDan");
  XLSX.writeFile(workbook, "Mau_Danh_Sach_Trong_Tai.xlsx");
}

export async function parseRefereeExcelFile(file) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("File Excel không có trang dữ liệu.");

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const referees = [];
  const errors = [];
  const seenCodes = new Set();
  const seenPeople = new Set();

  rawRows.forEach((row, index) => {
    const excelRow = index + 2;
    const name = getCell(row, "name");
    const unit = getCell(row, "unit");
    if (!name && !unit) return;
    if (!name || !unit) {
      errors.push(`Dòng ${excelRow}: thiếu ${!name ? "Họ và tên" : "Đơn vị"}.`);
      return;
    }

    const rawCode = getCell(row, "code");
    const normalizedCode = normalizeText(rawCode);
    const personKey = `${normalizeText(name)}|${normalizeText(unit)}`;
    if (rawCode && seenCodes.has(normalizedCode)) {
      errors.push(`Dòng ${excelRow}: mã trọng tài “${rawCode}” bị trùng trong file.`);
      return;
    }
    if (!rawCode && seenPeople.has(personKey)) {
      errors.push(`Dòng ${excelRow}: ${name} — ${unit} bị trùng trong file.`);
      return;
    }
    if (rawCode) seenCodes.add(normalizedCode);
    seenPeople.add(personKey);

    referees.push({
      id: makeId(),
      code: rawCode,
      name,
      unit,
      grade: getCell(row, "grade"),
      specialty: getCell(row, "specialty") || "Cả hai",
      phone: getCell(row, "phone"),
      note: getCell(row, "note"),
      active: true,
    });
  });

  if (rawRows.length > 0 && referees.length === 0 && errors.length === 0) {
    throw new Error("Không nhận diện được cột Họ và tên/Đơn vị. Hãy dùng đúng file mẫu.");
  }
  return { referees, errors, totalRows: rawRows.length };
}

function shuffle(list, random) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createEmptyFixedAssignments(matCount) {
  return Object.fromEntries(
    Array.from({ length: matCount }, (_, index) => [
      String(index + 1),
      { chiefId: "", deputy1Id: "", deputy2Id: "" },
    ])
  );
}

export function normalizeFixedAssignments(fixedByMat = {}, matCount = 1) {
  const result = createEmptyFixedAssignments(matCount);
  Object.keys(result).forEach((key) => {
    result[key] = { ...result[key], ...(fixedByMat[key] || {}) };
  });
  return result;
}

/**
 * Xáo trộn theo cặp cùng đơn vị rồi phân các cặp sang thảm ít người nhất.
 * Mỗi đơn vị được ưu tiên xuất hiện tối đa một cặp trên một thảm.
 */
export function randomizeRefereeAssignments(referees, fixedByMat, matCount, random = Math.random) {
  const count = Math.max(1, Number(matCount) || 1);
  const fixed = normalizeFixedAssignments(fixedByMat, count);
  const selectedFixedIds = Object.values(fixed).flatMap((item) =>
    [item.chiefId, item.deputy1Id, item.deputy2Id].filter(Boolean)
  );
  const duplicateFixedIds = [...new Set(selectedFixedIds.filter((id, i, all) => all.indexOf(id) !== i))];
  const fixedIds = new Set(selectedFixedIds);
  const available = referees.filter((item) => item.active !== false && !fixedIds.has(item.id));
  const byUnit = new Map();

  available.forEach((item) => {
    const key = item.unit?.trim() || "Chưa có đơn vị";
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key).push(item);
  });

  const chunks = [];
  const oddUnits = [];
  shuffle([...byUnit.entries()], random).forEach(([unit, members]) => {
    const shuffledMembers = shuffle(members, random);
    for (let i = 0; i < shuffledMembers.length; i += 2) {
      const pair = shuffledMembers.slice(i, i + 2);
      if (pair.length === 1) oddUnits.push(unit);
      chunks.push({ unit, members: pair, tie: random() });
    }
  });

  chunks.sort((a, b) => b.members.length - a.members.length || a.tie - b.tie);
  const mats = Array.from({ length: count }, (_, index) => ({
    mat: index + 1,
    randomIds: [],
    unitCounts: {},
    tie: random(),
  }));

  chunks.forEach((chunk) => {
    const target = [...mats].sort((a, b) => {
      const aHasUnit = a.unitCounts[chunk.unit] ? 1 : 0;
      const bHasUnit = b.unitCounts[chunk.unit] ? 1 : 0;
      return aHasUnit - bHasUnit || a.randomIds.length - b.randomIds.length || a.tie - b.tie;
    })[0];
    target.randomIds.push(...chunk.members.map((member) => member.id));
    target.unitCounts[chunk.unit] = (target.unitCounts[chunk.unit] || 0) + chunk.members.length;
  });

  const warnings = [];
  if (duplicateFixedIds.length) warnings.push("Một số trọng tài đang được chọn ở nhiều vị trí cố định.");
  if (oddUnits.length) {
    warnings.push(`Các đơn vị có số người lẻ nên còn người không ghép đủ cặp: ${[...new Set(oddUnits)].join(", ")}.`);
  }
  if (!available.length) warnings.push("Không còn trọng tài trong danh sách random sau khi trừ các vị trí cố định.");

  return {
    assignments: mats.map(({ mat, randomIds }) => ({ mat, randomIds })),
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

export function mergeImportedReferees(current, imported) {
  const next = [...current];
  let added = 0;
  let updated = 0;
  imported.forEach((item) => {
    const normalizedCode = normalizeText(item.code);
    const index = normalizedCode
      ? next.findIndex((existing) => normalizeText(existing.code) === normalizedCode)
      : next.findIndex((existing) =>
          normalizeText(existing.name) === normalizeText(item.name) &&
          normalizeText(existing.unit) === normalizeText(item.unit)
        );
    if (index >= 0) {
      next[index] = {
        ...next[index],
        ...item,
        id: next[index].id,
        code: next[index].code || generateNextRefereeCode(next),
      };
      updated += 1;
    } else {
      next.push({ ...item, code: item.code || generateNextRefereeCode(next) });
      added += 1;
    }
  });
  return { referees: next, added, updated };
}

export function generateNextRefereeCode(referees = []) {
  const used = new Set(referees.map((item) => normalizeText(item.code)).filter(Boolean));
  let number = 1;
  while (used.has(normalizeText(`TT-${String(number).padStart(3, "0")}`))) number += 1;
  return `TT-${String(number).padStart(3, "0")}`;
}
