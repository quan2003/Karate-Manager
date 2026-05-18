const TEMPLATE_ROWS = 200;

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

function buildWorkbook({ events, clubName }) {
  const safeEvents = events || [];
  const eventRangeEnd = Math.max(safeEvents.length + 1, 2);
  const headers = [
    "Họ tên",
    "Giới tính",
    "Ngày sinh (DD/MM/YYYY)",
    "Đơn vị/CLB",
    "Nội dung thi đấu",
    "Cân nặng (kg)",
    "Đồng đội (Có/Không)",
    "Hạt giống (1-8)",
  ];
  const samples = safeEvents.slice(0, 3).map((event, i) => [
    `VĐV mẫu ${i + 1}`,
    event.gender === "female" ? "Nữ" : "Nam",
    "15/03/2008",
    clubName || "CLB ...",
    event.name,
    event.type === "kumite" || event.name?.toLowerCase().includes("kumite") ? 60 : "",
    event.isTeam ? "Có" : "Không",
    i === 0 ? 1 : "",
  ]);

  const inputSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:H${TEMPLATE_ROWS + 1}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="4" width="24" customWidth="1"/><col min="5" max="5" width="44" customWidth="1"/><col min="6" max="6" width="15" customWidth="1"/><col min="7" max="7" width="20" customWidth="1"/><col min="8" max="8" width="16" customWidth="1"/></cols><sheetData>${[
    row(1, headers, 1),
    ...samples.map((sample, i) => row(i + 2, sample)),
  ].join("")}</sheetData><dataValidations count="3"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="B2:B${TEMPLATE_ROWS + 1}"><formula1>"Nam,Nữ"</formula1></dataValidation><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="E2:E${TEMPLATE_ROWS + 1}"><formula1>'Danh mục'!$A$2:$A$${eventRangeEnd}</formula1></dataValidation><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="G2:G${TEMPLATE_ROWS + 1}"><formula1>"Không,Có"</formula1></dataValidation></dataValidations><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;

  const catalogSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D${eventRangeEnd}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="50" customWidth="1"/><col min="2" max="4" width="14" customWidth="1"/></cols><sheetData>${[
    row(1, ["Nội dung thi đấu", "Loại", "Giới tính", "Đồng đội"], 1),
    ...safeEvents.map((event, i) =>
      row(i + 2, [
        event.name,
        event.type === "kata" ? "Kata" : "Kumite",
        event.gender === "male" ? "Nam" : event.gender === "female" ? "Nữ" : "Hỗn hợp",
        event.isTeam ? "Có" : "Không",
      ])
    ),
  ].join("")}</sheetData></worksheet>`;

  const guideSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B9"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="82" customWidth="1"/></cols><sheetData>${[
    row(1, ["Cột", "Yêu cầu"], 1),
    row(2, ["Họ tên", "Bắt buộc. Nhập đúng họ tên VĐV."]),
    row(3, ["Giới tính", "Chọn Nam hoặc Nữ."]),
    row(4, ["Ngày sinh", "Định dạng DD/MM/YYYY, ví dụ 15/03/2008."]),
    row(5, ["Đơn vị/CLB", "Có thể để trống nếu đã nhập tên CLB ở hệ thống HLV."]),
    row(6, ["Nội dung thi đấu", "Chọn từ danh sách hạng mục đã setup của giải. Không tự sửa tên."]),
    row(7, ["Cân nặng", "Bắt buộc cho nội dung Kumite, có thể trống cho Kata."]),
    row(8, ["Đồng đội", "Chọn Có nếu là nội dung đồng đội/hỗn hợp, ngược lại chọn Không."]),
    row(9, ["Hạt giống", "Tùy chọn, chỉ nhập số từ 1 đến 8."]),
  ].join("")}</sheetData></worksheet>`;

  return zip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Mẫu nhập VĐV" sheetId="1" r:id="rId1"/><sheet name="Danh mục" sheetId="2" state="hidden" r:id="rId2"/><sheet name="Hướng dẫn" sheetId="3" r:id="rId3"/></sheets></workbook>` },
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
  const bytes = buildWorkbook({ events, clubName });
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
