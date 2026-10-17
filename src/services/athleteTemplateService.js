const TEMPLATE_ROWS = 200;
const TEMPLATE_PROTECTION_PASSWORD = "KSport2026";

function hashExcelPassword(password) {
  let verifier = 0;
  for (let i = password.length - 1; i >= 0; i--) {
    verifier = ((verifier >> 14) & 1) | ((verifier << 1) & 0x7fff);
    verifier ^= password.charCodeAt(i);
  }
  verifier = ((verifier >> 14) & 1) | ((verifier << 1) & 0x7fff);
  verifier ^= password.length;
  return (verifier ^ 0xce4b).toString(16).toUpperCase().padStart(4, "0");
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function col(index) {
  let out = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cell(row, column, value, style = 0) {
  const ref = `${col(column)}${row}`;
  const s = style ? ` s="${style}"` : "";
  if (typeof value === "number") return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t>${esc(value)}</t></is></c>`;
}

function formulaCell(row, column, formula, style = 0) {
  const ref = `${col(column)}${row}`;
  const s = style ? ` s="${style}"` : "";
  return `<c r="${ref}"${s}><f>${esc(formula)}</f></c>`;
}

function rowWithFormulas(index, values, formulas = {}, valueStyle = 0, formulaStyle = 0) {
  return `<row r="${index}">${values
    .map((value, column) => Object.prototype.hasOwnProperty.call(formulas, column)
      ? formulaCell(index, column, formulas[column], formulaStyle)
      : cell(index, column, value, valueStyle))
    .join("")}</row>`;
}

function row(index, values, style = 0) {
  return `<row r="${index}">${values
    .map((value, column) => cell(index, column, value, style))
    .join("")}</row>`;
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

const u16 = (v) => [v & 255, (v >>> 8) & 255];
const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];

function concat(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

function zip(files) {
  const encoder = new TextEncoder();
  const local = [];
  const central = [];
  let offset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const localHeader = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length),
      ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
    ]);
    local.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800),
      ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length),
      ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]);
    central.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  });

  const localData = concat(local);
  const centralData = concat(central);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length),
    ...u16(files.length), ...u32(centralData.length), ...u32(localData.length),
    ...u16(0),
  ]);
  return concat([localData, centralData, end]);
}

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function buildAthleteTemplateWorkbook({ events, clubName }) {
  const protectionHash = hashExcelPassword(TEMPLATE_PROTECTION_PASSWORD);
  const safeEvents = events || [];
  const currentYear = new Date().getFullYear();

  function parseEventAgeRange(name) {
    let minAge = 0;
    let maxAge = 99;
    const lowerName = (name || "").toLowerCase();
    const strForAge = lowerName.replace(/(?:dưới|trên|duoi|tren|hạng\s*cân|hang\s*can)?\s*\d+\s*kg/ig, "");
    
    const rangeMatch = strForAge.match(/(\d+)\s*(?:tuổi\s*)?(?:đến|den|-\u2013|-)\s*(\d+)/i); 
    const plusMatch1 = strForAge.match(/(\d+)\s*(?:tuổi\s*)?(?:trở\s*lên|tro\s*len)/i);
    const plusMatch2 = strForAge.match(/(\d+)\+/i); 
    const plusMatch3 = strForAge.match(/(?:trên|tren)\s*(\d+)/i); 
    const underMatch = strForAge.match(/(?:dưới|duoi)\s*(\d+)/i); 
    
    if (rangeMatch) { minAge = parseInt(rangeMatch[1]); maxAge = parseInt(rangeMatch[2]); }
    else if (plusMatch1) { minAge = parseInt(plusMatch1[1]); maxAge = 99; }
    else if (plusMatch2) { minAge = parseInt(plusMatch2[1]); maxAge = 99; }
    else if (plusMatch3) { minAge = parseInt(plusMatch3[1]) + 1; maxAge = 99; }
    else if (underMatch) { minAge = 0; maxAge = Math.max(0, parseInt(underMatch[1]) - 1); }
    
    return { minAge, maxAge };
  }

  function getEventAgeRange(event) {
    const parsed = parseEventAgeRange(`${event?.ageGroup || ""} ${event?.name || ""}`);
    const hasExplicitMin = event?.minAge !== undefined && event?.minAge !== null && event?.minAge !== "";
    const hasExplicitMax = event?.maxAge !== undefined && event?.maxAge !== null && event?.maxAge !== "";
    const explicitMin = Number(event?.minAge);
    const explicitMax = Number(event?.maxAge);
    return {
      minAge: hasExplicitMin && Number.isFinite(explicitMin) ? explicitMin : parsed.minAge,
      maxAge: hasExplicitMax && Number.isFinite(explicitMax) ? explicitMax : parsed.maxAge,
    };
  }

  function isTeamEvent(event) {
    if (event?.isTeam) return true;
    const normalizedName = (event?.name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase();
    return /dong\s*doi|\bteam\b/.test(normalizedName);
  }

  // Generate All lists
  const maleEventsAll   = safeEvents.filter(e => e.gender === "male"   || e.gender === "mixed");
  const femaleEventsAll = safeEvents.filter(e => e.gender === "female" || e.gender === "mixed");
  
  // Create age-specific columns: minAge = 4, maxAge = 60
  const MIN_AGE_GEN = 4;
  const MAX_AGE_GEN = 60;
  
  const catalogColumns = []; // array of objects: { name, events: [] }
  catalogColumns.push({ name: "Nam_All", events: maleEventsAll });
  catalogColumns.push({ name: "Nu_All", events: femaleEventsAll });
  catalogColumns.push({ name: "All_All", events: safeEvents });
  
  for (let age = MIN_AGE_GEN; age <= MAX_AGE_GEN; age++) {
    const mEvents = maleEventsAll.filter(e => {
       const r = getEventAgeRange(e);
       return age >= r.minAge && age <= r.maxAge;
    });
    const fEvents = femaleEventsAll.filter(e => {
       const r = getEventAgeRange(e);
       return age >= r.minAge && age <= r.maxAge;
    });
    catalogColumns.push({ name: `Nam_${age}`, events: mEvents });
    catalogColumns.push({ name: `Nu_${age}`, events: fEvents });
  }

  catalogColumns.push({ name: "NoiDung_DongDoi", events: safeEvents.filter(isTeamEvent) });
  catalogColumns.push({ name: "Ma_Doi", events: Array.from({ length: 99 }, (_, i) => ({ name: i + 1 })) });
  catalogColumns.push({ name: "Trong", events: [] });

  const catalogEndRows = Math.max(...catalogColumns.map(c => c.events.length), 1) + 1; // +1 for header
  const catalogEndCols = catalogColumns.length;

  const headers = [
    "Họ tên", "Giới tính", "Năm sinh", "Nhóm tuổi (tự động)",
    "Đơn vị/CLB", "Nội dung thi đấu", "Cân nặng (kg)", "Đồng đội", "Mã đội", "Hạt giống",
  ];

  function getAgeGroup(y, cy) {
    if (!y) return "";
    const age = cy - y;
    if (age <= 5) return "Dưới 6 tuổi";
    if (age <= 8) return "6-8 tuổi";
    if (age <= 11) return "9-11 tuổi";
    if (age <= 14) return "12-14 tuổi";
    if (age <= 17) return "15-17 tuổi";
    return "18+ tuổi";
  }

  // Sample rows luôn dùng nội dung phù hợp với giới tính và tuổi mẫu.
  const sampleProfiles = [
    { gender: "male", age: 13, offset: 0 },
    { gender: "female", age: 14, offset: 0 },
    { gender: "male", age: 13, offset: 1 },
  ];
  const sampleSources = sampleProfiles.map((profile) => {
    const genderEvents = profile.gender === "female" ? femaleEventsAll : maleEventsAll;
    const compatibleEvents = genderEvents.filter((event) => {
      const range = getEventAgeRange(event);
      return profile.age >= range.minAge && profile.age <= range.maxAge;
    });
    const event = compatibleEvents[profile.offset] || compatibleEvents[0];
    return event ? { event, ...profile } : null;
  }).filter(Boolean);

  const samples = sampleSources.map(({ event, gender, age }, i) => {
    const sampleYear = currentYear - age;
    return [
      `VĐV mẫu ${i + 1}`,
      gender === "female" ? "Nữ" : "Nam",
      sampleYear,
      getAgeGroup(sampleYear, currentYear),
      clubName || "CLB ...",
      event.name,
      event.type === "kumite" || event.name?.toLowerCase().includes("kumite") ? 60 : "",
      "",
      isTeamEvent(event) ? "1" : "",
      i === 0 ? 1 : "",
    ];
  });

  const teamFlagFormula = (r) => `IF(F${r}="","",IF(COUNTIF(NoiDung_DongDoi,F${r})>0,"Có","Không"))`;
  const ageGroupFormula = (r) =>
    `IF(C${r}="","",IF((${currentYear}-C${r})<=5,"Dưới 6 tuổi",IF((${currentYear}-C${r})<=8,"6-8 tuổi",IF((${currentYear}-C${r})<=11,"9-11 tuổi",IF((${currentYear}-C${r})<=14,"12-14 tuổi",IF((${currentYear}-C${r})<=17,"15-17 tuổi","18+ tuổi"))))))`;

  const headerRowXml = row(1, headers, 1);
  const sampleRowsXml = samples.map((sample, i) => {
    const r = i + 2;
    return rowWithFormulas(r, sample, { 3: ageGroupFormula(r), 7: teamFlagFormula(r) }, 2, 0);
  }).join("");

  // Formula rows
  const formulaRowsXml = (() => {
    const start = samples.length + 2;
    return Array.from({ length: TEMPLATE_ROWS + 1 - start + 1 }, (_, i) => {
      const r = start + i;
      return rowWithFormulas(
        r,
        Array(10).fill(""),
        { 3: ageGroupFormula(r), 7: teamFlagFormula(r) },
        2,
        0,
      );
    }).join("");
  })();

  const eventValidationFormula = `IF(B2="",INDIRECT("All_All"),IF(C2="",INDIRECT(IF(B2="N\u1eef","Nu_All","Nam_All")),INDIRECT(IF(B2="N\u1eef","Nu_","Nam_")&MIN(MAX(${currentYear}-C2,${MIN_AGE_GEN}),${MAX_AGE_GEN}))))`;
  const teamCodeValidationFormula = `INDIRECT(IF(H2="Có","Ma_Doi","Trong"))`;

  const inputSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:J${TEMPLATE_ROWS + 1}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="20" customHeight="1"/>
<cols>
  <col min="1" max="1" width="28" customWidth="1"/>
  <col min="2" max="2" width="13" customWidth="1"/>
  <col min="3" max="3" width="12" customWidth="1"/>
  <col min="4" max="4" width="20" customWidth="1"/>
  <col min="5" max="5" width="24" customWidth="1"/>
  <col min="6" max="6" width="44" customWidth="1"/>
  <col min="7" max="7" width="14" customWidth="1"/>
  <col min="8" max="8" width="13" customWidth="1"/>
  <col min="9" max="9" width="14" customWidth="1"/>
  <col min="10" max="10" width="14" customWidth="1"/>
</cols>
<sheetData>
${headerRowXml}
${sampleRowsXml}
${formulaRowsXml}
</sheetData>
<sheetProtection password="${protectionHash}" sheet="1" objects="1" scenarios="1" formatCells="1" formatColumns="1" formatRows="1" insertColumns="1" insertRows="1" insertHyperlinks="1" deleteColumns="1" deleteRows="1" sort="1" autoFilter="1" pivotTables="1" selectLockedCells="1" selectUnlockedCells="0"/>
<dataValidations count="3">
  <dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1"
    errorTitle="Gioi tinh khong hop le" error="Chi duoc chon Nam hoac Nu"
    sqref="B2:B${TEMPLATE_ROWS + 1}">
    <formula1>"Nam,N\u1eef"</formula1>
  </dataValidation>
  <dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1"
    errorTitle="Noi dung khong hop le" error="Vui long chon tu danh sach co san"
    sqref="F2:F${TEMPLATE_ROWS + 1}">
    <formula1>${esc(eventValidationFormula)}</formula1>
  </dataValidation>
  <dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1"
    errorTitle="Ma doi khong hop le" error="Chi chon Ma doi cho noi dung dong doi"
    sqref="I2:I${TEMPLATE_ROWS + 1}">
    <formula1>${esc(teamCodeValidationFormula)}</formula1>
  </dataValidation>
</dataValidations>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;

  // ── Catalog sheet: Many data columns + header ───────────────────────────
  const catalogHeaderXml = row(1, catalogColumns.map(c => c.name), 1);
  const catalogDataXml = Array.from({ length: catalogEndRows - 1 }, (_, i) =>
    row(i + 2, catalogColumns.map(c => c.events[i]?.name || ""))
  ).join("");

  const catalogSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${col(catalogEndCols - 1)}${catalogEndRows}"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>
  <col min="1" max="${catalogEndCols}" width="40" customWidth="1"/>
</cols>
<sheetData>${catalogHeaderXml}${catalogDataXml}</sheetData>
<sheetProtection password="${protectionHash}" sheet="1" objects="1" scenarios="1" selectLockedCells="1" selectUnlockedCells="1"/>
</worksheet>`;

  const guideRows = [
    row(1,  ["HƯỚNG DẪN NHẬP DANH SÁCH VĐV", ""], 1),
    row(2,  ["", ""]),
    row(3,  ["CỘT", "YÊU CẦU & HƯỚNG DẪN"], 1),
    row(4,  ["A - Họ tên",          "BẮT BUỘC. Nhập đầy đủ họ và tên VĐV. Ví dụ: Nguyễn Văn An"]),
    row(5,  ["B - Giới tính",       "BẮT BUỘC. Bấm vào ô → chọn Nam hoặc Nữ từ danh sách xổ xuống ▼"]),
    row(6,  ["C - Năm sinh",        "BẮT BUỘC. Chỉ nhập NĂM (4 chữ số). Ví dụ: 2010, 2008, 1995"]),
    row(7,  ["D - Nhóm tuổi",       "TỰ ĐỘNG tính từ Năm sinh. KHÔNG cần nhập, Excel tự điền."]),
    row(8,  ["E - Đơn vị/CLB",      "Nhập tên CLB hoặc đơn vị. Có thể để trống nếu đã cài sẵn."]),
    row(9,  ["F - Nội dung thi đấu","BẮT BUỘC. Bấm vào ô → danh sách TỰ LỌC theo Giới tính (B) và Năm sinh (C) ▼"]),
    row(10, ["G - Cân nặng (kg)",   "BẮT BUỘC với nội dung Kumite. Bỏ trống nếu là Kata."]),
    row(11, ["H - Đồng đội",        "TỰ ĐỘNG: nội dung đồng đội hiện Có, nội dung cá nhân hiện Không."]),
    row(12, ["I - Mã đội",          "Chỉ dùng cho nội dung đồng đội. Chọn số 1-99; các VĐV cùng CLB và cùng mã thuộc cùng một đội."]),
    row(13, ["J - Hạt giống",       "Tùy chọn. Chỉ nhập số từ 1 đến 8 nếu VĐV được xếp hạt giống."]),
    row(14, ["", ""]),
    row(15, ["LƯU Ý QUAN TRỌNG", ""], 1),
    row(16, ["1.", "NHẬP NĂM SINH VÀ CHỌN GIỚI TÍNH TRƯỚC, sau đó bấm cột F → danh sách nội dung sẽ TỰ LỌC."]),
    row(17, ["2.", "Nếu không nhập năm sinh, danh sách nội dung sẽ hiện tất cả."]),
    row(18, ["3.", "Một VĐV thi nhiều nội dung → nhập NHIỀU DÒNG, mỗi dòng một nội dung."]),
    row(19, ["4.", "Nội dung đồng đội: nhập cùng Mã đội cho các thành viên cùng đội."]),
    row(20, ["5.", "Sau khi điền xong, lưu file và gửi lại cho BTC hoặc nhập trực tiếp vào phần mềm."]),
    row(21, ["6.", "Không xóa hoặc thay đổi dòng tiêu đề (dòng 1 màu đậm)."]),
    row(22, ["7.", "Chỉ nhập, sửa hoặc xóa dữ liệu trong các ô cho phép. Không xóa dòng/cột để bảo toàn công thức."]),
  ].join("");

  const guideSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:B22"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="20"/>
<cols>
  <col min="1" max="1" width="28" customWidth="1"/>
  <col min="2" max="2" width="92" customWidth="1"/>
</cols>
<sheetData>${guideRows}</sheetData>
<sheetProtection password="${protectionHash}" sheet="1" objects="1" scenarios="1" selectLockedCells="1" selectUnlockedCells="1"/>
</worksheet>`;

  const definedNames = `<definedNames>` + catalogColumns.map((c, i) => {
    const end = c.events.length > 0 ? c.events.length + 1 : 2;
    return `<definedName name="${c.name}">'Danh m\u1ee5c'!$${col(i)}$2:$${col(i)}$${end}</definedName>`;
  }).join("") + `</definedNames>`;

  return zip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection locked="0"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookProtection workbookPassword="${protectionHash}" lockStructure="1"/><sheets><sheet name="M\u1eabu nh\u1eadp V\u0110V" sheetId="1" r:id="rId1"/><sheet name="Danh m\u1ee5c" sheetId="2" state="hidden" r:id="rId2"/><sheet name="H\u01b0\u1edbng d\u1eabn" sheetId="3" r:id="rId3"/></sheets>${definedNames}</workbook>` },
    { name: "xl/worksheets/sheet1.xml", content: inputSheet },
    { name: "xl/worksheets/sheet2.xml", content: catalogSheet },
    { name: "xl/worksheets/sheet3.xml", content: guideSheet },
  ]);
}

export async function downloadAthleteImportTemplate({
  tournamentName,
  events,
  clubName = "",
}) {
  const bytes = buildAthleteTemplateWorkbook({ events, clubName });
  const fileName = `mau_nhap_vdv_${tournamentName || "giai_dau"}.xlsx`;

  if (window.electronAPI?.saveExportFile) {
    return await window.electronAPI.saveExportFile(toBase64(bytes), fileName, "xlsx");
  }

  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { success: true };
}
