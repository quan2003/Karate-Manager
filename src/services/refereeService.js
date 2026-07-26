import XLSX from "xlsx-js-style";

export const REFEREE_TEMPLATE_HEADERS = [
  "Họ và tên",
  "Đơn vị",
  "Cấp bậc",
  "Nội dung phụ trách",
  "Trọng tài chính/phụ",
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

const formatRefereeRole = (value) => {
  const role = String(value || "").trim().toLocaleLowerCase("vi");
  return role === "ttc" || role.includes("chính") ? "TTC" : "TTP";
};

const HEADER_ALIASES = {
  code: ["ma trong tai", "ma", "referee code", "code"],
  name: ["ho va ten", "ho ten", "ten trong tai", "name"],
  unit: ["don vi", "clb", "quoc gia", "tinh thanh", "unit", "country"],
  grade: ["cap bac", "cap", "rank", "grade"],
  specialty: ["noi dung phu trach", "noi dung", "chuyen mon", "specialty"],
  refereeRole: ["trong tai chinh/phu", "trong tai chinh phu", "vai tro trong tai", "vai tro", "referee role", "role"],
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
    ["Nguyễn Văn An", "Hà Nội", "Quốc gia", "Kata", "TTC", "0900000001", ""],
    ["Trần Thị Bình", "Hà Nội", "Quốc gia", "Kumite", "TTP", "0900000002", ""],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 30 }, { wch: 22 }, { wch: 18 },
    { wch: 24 }, { wch: 22 }, { wch: 18 }, { wch: 32 },
  ];
  worksheet["!autofilter"] = { ref: "A1:G3" };

  const instructions = XLSX.utils.aoa_to_sheet([
    ["HƯỚNG DẪN NHẬP DANH SÁCH TRỌNG TÀI"],
    ["1", "Không đổi tên các cột ở dòng đầu tiên."],
    ["2", "Chỉ cần nhập Họ và tên và Đơn vị; hệ thống sẽ tự cấp Mã trọng tài."],
    ["3", "Nội dung phụ trách: Kata, Kumite hoặc Cả hai."],
    ["4", "Trọng tài chính/phụ: nhập TTC (trọng tài chính) hoặc TTP (trọng tài phụ)."],
    ["5", "Có thể xóa hai dòng ví dụ trước khi nhập dữ liệu thật."],
    ["6", "Khi import lại, người trùng Họ và tên + Đơn vị sẽ được cập nhật, không tạo bản sao."],
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
      refereeRole: getCell(row, "refereeRole") || "TTP",
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

const safeFileName = (value = "Giai_dau") =>
  String(value).normalize("NFC").replace(/[^a-zA-Z0-9À-ỹ]+/g, "_").replace(/^_+|_+$/g, "");

const displayRefereeRole = (value) => {
  const role = String(value || "").trim().toLocaleLowerCase("vi");
  return role === "ttc" || role.includes("chính") ? "TTC" : "TTP";
};

export function exportRefereeMatListsExcel(tournament, management) {
  const workbook = XLSX.utils.book_new();
  const report = management.report || {};
  const refereeMap = new Map((management.referees || []).map((item) => [item.id, item]));
  const assignments = management.assignments || [];
  const officialNames = new Set([report.chairman, report.deputyChairman, report.secretary].map(normalizeText).filter(Boolean));
  const matCount = Math.max(1, Number(management.matCount || assignments.length || 1));
  const blankMatches = ["", "", "", "", "", ""];
  const defaultFont = { name: "Times New Roman", sz: 12, color: { rgb: "000000" } };
  const thinBorder = { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } };

  for (let mat = 1; mat <= matCount; mat += 1) {
    const fixed = management.fixedByMat?.[String(mat)] || {};
    const assignment = assignments.find((item) => Number(item.mat) === mat);
    const fixedRows = [
      ["Trưởng sàn", refereeMap.get(fixed.chiefId)],
      ["Phó sàn 1", refereeMap.get(fixed.deputy1Id)],
      ["Phó sàn 2", refereeMap.get(fixed.deputy2Id)],
    ];
    const randomRows = (assignment?.randomIds || []).map((id) => refereeMap.get(id)).filter((referee) => referee && !officialNames.has(normalizeText(referee.name)));
    const empty = () => Array(11).fill("");
    const rows = [
      ["BAN TỔ CHỨC", "", "", "", "", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", "", "", "", "", ""],
      ["", "", "", "", "", "Độc lập - Tự do - Hạnh phúc", "", "", "", "", ""],
      ["DANH SÁCH TRỌNG TÀI", ...Array(10).fill("")],
      [String(report.eventName || tournament.name || "").toUpperCase(), ...Array(10).fill("")],
      [`SÀN ${mat}`, ...Array(10).fill("")],
      [`1. Tổng trọng tài: ${report.chairman || ""}`, ...Array(10).fill("")],
      [`2. Phó tổng trọng tài: ${report.deputyChairman || ""}`, ...Array(10).fill("")],
      [`3. Thư ký ban trọng tài: ${report.secretary || ""}`, ...Array(10).fill("")],
      empty(),
      ["STT", "HỌ VÀ TÊN", "ĐƠN VỊ", "TRÌNH ĐỘ", "AK", "", "", "", "", "", "GHI CHÚ"],
      ["", "", "", "", "AO", "", "", "", "", "", ""],
      ["", "", "", "", "TRẬN 1", "TRẬN 2", "TRẬN 3", "TRẬN 4", "TRẬN 5", "TRẬN 6", ""],
    ];
    fixedRows.forEach(([duty, referee], index) => rows.push([
      index + 1, referee?.name || "Chưa chọn", referee?.unit || "", referee ? formatRefereeRole(referee.refereeRole) : "",
      ...blankMatches, [duty, referee?.note].filter(Boolean).join(" - "),
    ]));
    randomRows.forEach((referee, index) => rows.push([
      fixedRows.length + index + 1, referee.name || "", referee.unit || "", formatRefereeRole(referee.refereeRole),
      ...blankMatches, referee.note || "",
    ]));
    rows.push(empty(), ["TM. HỘI ĐỒNG TRỌNG TÀI", ...Array(7).fill(""), "NGƯỜI LẬP BẢNG", "", ""]);
    rows.push(["TỔNG TRỌNG TÀI", ...Array(10).fill("")]);

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const lastDataRow = 12 + fixedRows.length + randomRows.length;
    sheet["!merges"] = [
      XLSX.utils.decode_range("A1:E1"), XLSX.utils.decode_range("F1:K1"), XLSX.utils.decode_range("F2:K2"),
      XLSX.utils.decode_range("A3:K3"), XLSX.utils.decode_range("A4:K4"), XLSX.utils.decode_range("A5:K5"),
      XLSX.utils.decode_range("A6:K6"), XLSX.utils.decode_range("A7:K7"), XLSX.utils.decode_range("A8:K8"),
      XLSX.utils.decode_range("A10:A12"), XLSX.utils.decode_range("B10:B12"), XLSX.utils.decode_range("C10:C12"),
      XLSX.utils.decode_range("D10:D12"), XLSX.utils.decode_range("K10:K12"),
      XLSX.utils.decode_range(`A${lastDataRow + 2}:E${lastDataRow + 2}`),
      XLSX.utils.decode_range(`I${lastDataRow + 2}:K${lastDataRow + 2}`),
      XLSX.utils.decode_range(`A${lastDataRow + 3}:E${lastDataRow + 3}`),
    ];
    sheet["!cols"] = [
      { wch: 6 }, { wch: 28 }, { wch: 24 }, { wch: 20 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 24 },
    ];
    sheet["!rows"] = [{ hpt: 22 }, { hpt: 20 }, { hpt: 24 }, { hpt: 34 }, { hpt: 24 }, null, null, null, null, { hpt: 19 }, { hpt: 19 }, { hpt: 22 }];
    Object.keys(sheet).filter((address) => !address.startsWith("!")).forEach((address) => {
      sheet[address].s = { ...(sheet[address].s || {}), font: defaultFont, alignment: { vertical: "center" } };
    });
    ["A1", "F1", "F2", "A3", "A4", "A5"].forEach((address) => {
      if (sheet[address]) sheet[address].s = { font: { ...defaultFont, bold: true, sz: address === "A4" ? 14 : 12 }, alignment: { horizontal: "center", vertical: "center", wrapText: true } };
    });
    for (let row = 9; row <= 11; row += 1) {
      for (let column = 0; column < 11; column += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        if (!sheet[address]) sheet[address] = { t: "s", v: "" };
        sheet[address].s = { font: { ...defaultFont, bold: true }, fill: { fgColor: { rgb: "FFF200" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: thinBorder };
      }
    }
    for (let row = 12; row < lastDataRow; row += 1) {
      for (let column = 0; column < 11; column += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        if (!sheet[address]) sheet[address] = { t: "s", v: "" };
        sheet[address].s = { font: defaultFont, alignment: { horizontal: column === 0 || (column >= 4 && column <= 9) ? "center" : "left", vertical: "center" }, border: thinBorder };
      }
    }
    sheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    sheet["!margins"] = { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 };
    XLSX.utils.book_append_sheet(workbook, sheet, `Sàn ${mat}`);
  }

  XLSX.writeFile(workbook, `Danh_Sach_Trong_Tai_Theo_San_${safeFileName(tournament.name)}.xlsx`);
}