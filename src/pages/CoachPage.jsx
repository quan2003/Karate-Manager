import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRole, TIME_STATUS, ROLES } from "../context/RoleContext";
import { openKrtFile, validateAthlete } from "../services/krtService";
import { exportCoachData } from "../services/coachExportService";
import { parseExcelFile } from "../services/excelService";
import { submitAthletes } from "../services/supabaseService";
import * as XLSX from "xlsx";
import ConfirmDialog from "../components/common/ConfirmDialog";
import DateInput from "../components/common/DateInput";
import SearchableSelect from "../components/common/SearchableSelect";
import { useToast } from "../components/common/Toast";
import appIcon from "../assets/icon.png";
import "./CoachPage.css";

const TEMPLATE_ROWS = 200;

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function inlineCell(rowIndex, colIndex, value, style = 0) {
  const ref = `${columnName(colIndex)}${rowIndex}`;
  const styleAttr = style ? ` s="${style}"` : "";
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t>${xmlEscape(value)}</t></is></c>`;
}

function numberCell(rowIndex, colIndex, value, style = 0) {
  const ref = `${columnName(colIndex)}${rowIndex}`;
  const styleAttr = style ? ` s="${style}"` : "";
  return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
}

function makeRow(rowIndex, values, style = 0) {
  const cells = values
    .map((value, colIndex) =>
      typeof value === "number"
        ? numberCell(rowIndex, colIndex, value, style)
        : inlineCell(rowIndex, colIndex, value, style)
    )
    .join("");
  return `<row r="${rowIndex}">${cells}</row>`;
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

function uint16(value) {
  return [value & 255, (value >>> 8) & 255];
}

function uint32(value) {
  return [
    value & 255,
    (value >>> 8) & 255,
    (value >>> 16) & 255,
    (value >>> 24) & 255,
  ];
}

function concatBytes(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const contentBytes = encoder.encode(content);
    const checksum = crc32(contentBytes);
    const localHeader = new Uint8Array([
      ...uint32(0x04034b50), ...uint16(20), ...uint16(0x0800), ...uint16(0),
      ...uint16(0), ...uint16(0), ...uint32(checksum),
      ...uint32(contentBytes.length), ...uint32(contentBytes.length),
      ...uint16(nameBytes.length), ...uint16(0),
    ]);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = new Uint8Array([
      ...uint32(0x02014b50), ...uint16(20), ...uint16(20), ...uint16(0x0800),
      ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(checksum),
      ...uint32(contentBytes.length), ...uint32(contentBytes.length),
      ...uint16(nameBytes.length), ...uint16(0), ...uint16(0), ...uint16(0),
      ...uint16(0), ...uint32(0), ...uint32(offset),
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + contentBytes.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const localData = concatBytes(localParts);
  const endRecord = new Uint8Array([
    ...uint32(0x06054b50), ...uint16(0), ...uint16(0), ...uint16(files.length),
    ...uint16(files.length), ...uint32(centralDirectory.length),
    ...uint32(localData.length), ...uint16(0),
  ]);
  return concatBytes([localData, centralDirectory, endRecord]);
}

function getAgeGroup(birthYear, currentYear) {
  if (!birthYear || !currentYear) return "";
  const age = currentYear - birthYear;
  if (age <= 5) return "Dưới 6 tuổi";
  if (age <= 8) return "6-8 tuổi";
  if (age <= 11) return "9-11 tuổi";
  if (age <= 14) return "12-14 tuổi";
  if (age <= 17) return "15-17 tuổi";
  return "18+ tuổi";
}

function buildAthleteTemplateWorkbook({ tournamentData, clubName }) {
  const events = tournamentData.events || [];
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
    else if (plusMatch3) { minAge = parseInt(plusMatch3[1]); maxAge = 99; }
    else if (underMatch) { minAge = 0; maxAge = parseInt(underMatch[1]); }
    
    return { minAge, maxAge };
  }

  // Generate All lists
  const maleEventsAll   = events.filter(e => e.gender === "male"   || e.gender === "mixed");
  const femaleEventsAll = events.filter(e => e.gender === "female" || e.gender === "mixed");
  
  // Create age-specific columns: minAge = 4, maxAge = 60
  const MIN_AGE_GEN = 4;
  const MAX_AGE_GEN = 60;
  
  const catalogColumns = []; 
  catalogColumns.push({ name: "Nam_All", events: maleEventsAll });
  catalogColumns.push({ name: "Nu_All", events: femaleEventsAll });
  catalogColumns.push({ name: "All_All", events: events });
  
  for (let age = MIN_AGE_GEN; age <= MAX_AGE_GEN; age++) {
    const mEvents = maleEventsAll.filter(e => {
       const r = parseEventAgeRange(e.name);
       return age >= r.minAge && age <= r.maxAge;
    });
    const fEvents = femaleEventsAll.filter(e => {
       const r = parseEventAgeRange(e.name);
       return age >= r.minAge && age <= r.maxAge;
    });
    catalogColumns.push({ name: `Nam_${age}`, events: mEvents });
    catalogColumns.push({ name: `Nu_${age}`, events: fEvents });
  }

  const catalogEndRows = Math.max(...catalogColumns.map(c => c.events.length), 1) + 1; // +1 for header
  const catalogEndCols = catalogColumns.length;

  const headers = [
    "Họ tên", "Giới tính", "Năm sinh", "Nhóm tuổi (tự động)",
    "Đơn vị/CLB", "Nội dung thi đấu", "Cân nặng (kg)", "Đồng đội", "Hạt giống",
  ];

  const sampleSources = [
    maleEventsAll[0], femaleEventsAll[0], maleEventsAll[1] || femaleEventsAll[1],
  ].filter(Boolean).slice(0, 3);

  const sampleRows = sampleSources.map((event, index) => {
    const isFemale = event.gender === "female";
    const sampleYear = isFemale ? currentYear - 14 : currentYear - 13;
    return [
      `VĐV mẫu ${index + 1}`,
      isFemale ? "Nữ" : "Nam",
      sampleYear,
      getAgeGroup(sampleYear, currentYear),
      clubName || "CLB ...",
      event.name,
      event.type === "kumite" || event.name?.toLowerCase().includes("kumite") ? 60 : "",
      event.isTeam ? "Có" : "Không",
      index === 0 ? 1 : "",
    ];
  });

  const headerRowXml  = makeRow(1, headers, 1);
  const sampleRowsXml = sampleRows.map((row, idx) => makeRow(idx + 2, row)).join("");

  const formulaRowsXml = (() => {
    const start = sampleRows.length + 2;
    const yr = currentYear;
    return Array.from({ length: TEMPLATE_ROWS + 1 - start + 1 }, (_, i) => {
      const r = start + i;
      const formula =
        `IF(C${r}="","",` +
        `IF((${yr}-C${r})<=5,"D\u01b0\u1edbi 6 tu\u1ed5i",` +
        `IF((${yr}-C${r})<=8,"6-8 tu\u1ed5i",` +
        `IF((${yr}-C${r})<=11,"9-11 tu\u1ed5i",` +
        `IF((${yr}-C${r})<=14,"12-14 tu\u1ed5i",` +
        `IF((${yr}-C${r})<=17,"15-17 tu\u1ed5i","18+ tu\u1ed5i"))))))`;
      return `<row r="${r}"><c r="D${r}"><f>${xmlEscape(formula)}</f></c></row>`;
    }).join("");
  })();

  const eventValidationFormula = `IF(C2="", INDIRECT(IF(B2="N\u1eef","Nu_All",IF(B2="Nam","Nam_All","All_All"))), INDIRECT(IF(B2="N\u1eef","Nu_","Nam_") & MIN(MAX(${currentYear}-C2, ${MIN_AGE_GEN}), ${MAX_AGE_GEN})))`;

  const inputSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:I${TEMPLATE_ROWS + 1}"/>
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
</cols>
<sheetData>
${headerRowXml}
${sampleRowsXml}
${formulaRowsXml}
</sheetData>
<dataValidations count="3">
  <dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1"
    errorTitle="Gioi tinh khong hop le" error="Chi duoc chon Nam hoac Nu"
    sqref="B2:B${TEMPLATE_ROWS + 1}">
    <formula1>"Nam,N&#432;"</formula1>
  </dataValidation>
  <dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1"
    errorTitle="Noi dung khong hop le" error="Vui long chon tu danh sach co san"
    sqref="F2:F${TEMPLATE_ROWS + 1}">
    <formula1>${xmlEscape(eventValidationFormula)}</formula1>
  </dataValidation>
  <dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1"
    sqref="H2:H${TEMPLATE_ROWS + 1}">
    <formula1>"Kh&#244;ng,C&#243;"</formula1>
  </dataValidation>
</dataValidations>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;

  const catalogHeaderXml = makeRow(1, catalogColumns.map(c => c.name), 1);
  const catalogDataXml = Array.from({ length: catalogEndRows - 1 }, (_, i) =>
    makeRow(i + 2, catalogColumns.map(c => c.events[i]?.name || ""))
  ).join("");

  const catalogSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${columnName(catalogEndCols - 1)}${catalogEndRows}"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>
  <col min="1" max="${catalogEndCols}" width="40" customWidth="1"/>
</cols>
<sheetData>${catalogHeaderXml}${catalogDataXml}</sheetData>
</worksheet>`;

  const guideRows = [
    makeRow(1,  ["HƯỚNG DẪN NHẬP DANH SÁCH VĐV", ""], 1),
    makeRow(2,  ["", ""]),
    makeRow(3,  ["CỘT", "YÊU CẦU & HƯỚNG DẪN"], 1),
    makeRow(4,  ["A - Họ tên",          "BẮT BUỘC. Nhập đầy đủ họ và tên VĐV. Ví dụ: Nguyễn Văn An"]),
    makeRow(5,  ["B - Giới tính",       "BẮT BUỘC. Bấm vào ô → chọn Nam hoặc Nữ từ danh sách xổ xuống ▼"]),
    makeRow(6,  ["C - Năm sinh",        "BẮT BUỘC. Chỉ nhập NĂM (4 chữ số). Ví dụ: 2010, 2008, 1995"]),
    makeRow(7,  ["D - Nhóm tuổi",       "TỰ ĐỘNG tính từ Năm sinh. KHÔNG cần nhập, Excel tự điền."]),
    makeRow(8,  ["E - Đơn vị/CLB",      "Nhập tên CLB hoặc đơn vị. Có thể để trống nếu đã cài sẵn."]),
    makeRow(9,  ["F - Nội dung thi đấu","BẮT BUỘC. Bấm vào ô → danh sách TỰ LỌC theo Giới tính (B) và Năm sinh (C) ▼"]),
    makeRow(10, ["G - Cân nặng (kg)",   "BẮT BUỘC với nội dung Kumite. Bỏ trống nếu là Kata."]),
    makeRow(11, ["H - Đồng đội",        "Bấm chọn: Có (nội dung đồng đội) hoặc Không (cá nhân)."]),
    makeRow(12, ["I - Hạt giống",       "Tùy chọn. Chỉ nhập số từ 1 đến 8 nếu VĐV được xếp hạt giống."]),
    makeRow(13, ["", ""]),
    makeRow(14, ["LƯU Ý QUAN TRỌNG", ""], 1),
    makeRow(15, ["1.", "NHẬP NĂM SINH VÀ CHỌN GIỚI TÍNH TRƯỚC, sau đó bấm cột F → danh sách nội dung sẽ TỰ LỌC."]),
    makeRow(16, ["2.", "Nếu không nhập năm sinh, danh sách nội dung sẽ hiện tất cả."]),
    makeRow(17, ["3.", "Một VĐV thi nhiều nội dung → nhập NHIỀU DÒNG, mỗi dòng một nội dung."]),
    makeRow(18, ["4.", "Sau khi điền xong, lưu file và gửi lại cho BTC hoặc nhập trực tiếp vào phần mềm."]),
    makeRow(19, ["5.", "Không xóa hoặc thay đổi dòng tiêu đề (dòng 1 màu đậm)."]),
  ].join("");

  const guideSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:B19"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="20"/>
<cols>
  <col min="1" max="1" width="28" customWidth="1"/>
  <col min="2" max="2" width="92" customWidth="1"/>
</cols>
<sheetData>${guideRows}</sheetData>
</worksheet>`;

  const definedNames = `<definedNames>` + catalogColumns.map((c, i) => {
    const end = c.events.length > 0 ? c.events.length + 1 : 2;
    return `<definedName name="${c.name}">'Danh m&#7909;c'!$${columnName(i)}$2:$${columnName(i)}$${end}</definedName>`;
  }).join("") + `</definedNames>`;

  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="M&#7851;u nh&#7853;p V&#272;V" sheetId="1" r:id="rId1"/><sheet name="Danh m&#7909;c" sheetId="2" state="hidden" r:id="rId2"/><sheet name="H&#432;&#7899;ng d&#7851;n" sheetId="3" r:id="rId3"/></sheets>${definedNames}</workbook>` },
    { name: "xl/worksheets/sheet1.xml", content: inputSheet },
    { name: "xl/worksheets/sheet2.xml", content: catalogSheet },
    { name: "xl/worksheets/sheet3.xml", content: guideSheet },
  ];
  return createZip(files);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Trang HLV - Mở file .krt và nhập danh sách VĐV
 */
function CoachPage() {
  const navigate = useNavigate();
  const {
    role,
    tournamentData,
    timeStatus,
    coachAthletes,
    coachName,
    clubName,
    teamLeaderName,
    additionalCoaches,
    canEdit,
    loadKrtData,
    refreshTimeStatus,
    addAthlete,
    updateAthlete,
    deleteAthlete,
    updateCoachName,
    updateClubName,
    updateTeamLeaderName,
    updateAdditionalCoaches,
    clearAthletes,
    getExportData,
    resetRole,
  } = useRole();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    birthDate: "",
    gender: "male",
    eventId: "",
    weight: "",
    isTeam: false,
    seed: "",
  });
  const [lastSubmitted, setLastSubmitted] = useState(null);
  const [formErrors, setFormErrors] = useState([]);
  const [ageWarning, setAgeWarning] = useState("");
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    message: "",
    onConfirm: null,
  });
  const [countdown, setCountdown] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const excelFileInputRef = useRef(null);

  // Redirect nếu không phải Coach
  useEffect(() => {
    if (role !== ROLES.COACH) {
      navigate("/");
    }
  }, [role, navigate]);

  // Refresh time status mỗi phút
  useEffect(() => {
    const interval = setInterval(() => {
      refreshTimeStatus();
    }, 60000);
    return () => clearInterval(interval);
  }, [refreshTimeStatus]);

  // Countdown timer
  useEffect(() => {
    if (!tournamentData) return;

    const updateCountdown = () => {
      const now = new Date();
      const start = new Date(tournamentData.startTime);
      const end = new Date(tournamentData.endTime);

      let diff;
      let prefix;

      if (now < start) {
        diff = start - now;
        prefix = "Bắt đầu sau: ";
      } else if (now < end) {
        diff = end - now;
        prefix = "Còn lại: ";
      } else {
        setCountdown("Đã hết hạn");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let timeStr = "";
      if (days > 0) timeStr += `${days} ngày `;
      if (hours > 0) timeStr += `${hours} giờ `;
      if (minutes > 0) timeStr += `${minutes} phút `;
      timeStr += `${seconds} giây`;

      setCountdown(prefix + timeStr);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [tournamentData]);

  // Mở file .krt
  const handleOpenFile = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await openKrtFile();

      if (result.success) {
        loadKrtData(result.data);
      } else if (!result.canceled) {
        setError(result.error || "Không thể mở file");
      }
    } catch (err) {
      setError("Lỗi khi mở file: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset form
  const resetForm = useCallback(() => {
    setFormData({
      name: "",
      birthDate: "",
      gender: "male",
      eventId: "",
      weight: "",
      isTeam: false,
      seed: "",
    });
    setFormErrors([]);
    setAgeWarning("");
    setEditingAthlete(null);
    setShowForm(false);
  }, []);

  // Mở form thêm mới
  const handleAddNew = () => {
    resetForm();
    setShowForm(true);
  };

  // Mở form chỉnh sửa
  const handleEdit = (athlete) => {
    setFormData({
      name: athlete.name,
      birthDate: athlete.birthDate || "",
      gender: athlete.gender || "male",
      eventId: athlete.eventId,
      weight: athlete.weight || "",
      isTeam: athlete.isTeam || false,
      seed: athlete.seed || "",
    });
    setEditingAthlete(athlete);
    setShowForm(true);
  };

  // Check age warning when birthDate or eventId changes
  const checkAgeWarning = (birthDate, eventId) => {
    if (!birthDate || !eventId || !tournamentData) {
      setAgeWarning("");
      return;
    }
    const event = tournamentData.events.find((ev) => ev.id === eventId);
    if (!event) {
      setAgeWarning("");
      return;
    }

    // Parse age from event name (e.g., "6-8 tuổi", "15-17 tuổi", "18+ tuổi")
    const eventName = event.name || "";
    const rangeMatch = eventName.match(/(\d+)\s*[-–]\s*(\d+)\s*tuổi/i);
    const plusMatch = eventName.match(/(\d+)\+\s*tuổi/i);

    let minAge = null,
      maxAge = null;
    if (rangeMatch) {
      minAge = parseInt(rangeMatch[1]);
      maxAge = parseInt(rangeMatch[2]);
    } else if (plusMatch) {
      minAge = parseInt(plusMatch[1]);
      maxAge = 99;
    } else if (event.minAge || event.maxAge) {
      minAge = event.minAge || 0;
      maxAge = event.maxAge || 99;
    }

    if (minAge === null) {
      setAgeWarning("");
      return;
    }

    const birth = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;

    if (age < minAge || age > maxAge) {
      setAgeWarning(
        `⚠️ VĐV ${age} tuổi không phù hợp lứa tuổi "${minAge}-${maxAge} tuổi" của nội dung ${eventName}`
      );
    } else {
      setAgeWarning("");
    }
  };

  // Check if selected event is kumite
  const getSelectedEvent = () => {
    return tournamentData?.events.find((ev) => ev.id === formData.eventId);
  };
  const isKumiteEvent = () => {
    const event = getSelectedEvent();
    if (!event) return false;
    return (
      event.type === "kumite" || event.name?.toLowerCase().includes("kumite")
    );
  };

  // Excel template download
  const handleDownloadTemplate = async () => {
    if (!tournamentData) return;
    const bytes = buildAthleteTemplateWorkbook({ tournamentData, clubName });
    const fileName = `mau_nhap_vdv_${tournamentData.tournamentName || "hlv"}.xlsx`;

    if (window.electronAPI?.saveExportFile) {
      await window.electronAPI.saveExportFile(bytesToBase64(bytes), fileName, "xlsx");
      return;
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
    return;
  };

  // Excel import
  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', codepage: 65001 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      let startRow = 0;
      if (rows[0] && rows[0].some(h => {
        const s = String(h || '').toLowerCase();
        return s.includes('ten') || s.includes('tên') || s.includes('name');
      })) startRow = 1;

      let imported = 0;
      const importErrors = [];

      for (let i = startRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;

        let nameCol=0, genderCol=1, birthCol=2, clubCol=3, eventCol=4, weightCol=5, teamCol=6, seedCol=7;

        if (startRow === 1 && rows[0]) {
          const norm = v => String(v||'').toLowerCase().normalize('NFD')
            .replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
          const hdr = rows[0].map(norm);
          const fc = (terms) => hdr.findIndex(h => terms.some(t => h.includes(t)));
          const n=fc(['ten','name']);              if(n>=0) nameCol=n;
          const g=fc(['gioi','gender']);           if(g>=0) genderCol=g;
          const b=fc(['sinh','birth']);            if(b>=0) birthCol=b;
          const c=fc(['clb','don vi','club']);     if(c>=0) clubCol=c;
          const ev=fc(['noi dung','event','hang muc']); if(ev>=0) eventCol=ev;
          const w=fc(['can','weight','kg']);       if(w>=0) weightCol=w;
          const t=fc(['dong doi','team']);         if(t>=0) teamCol=t;
          const s=fc(['hat giong','seed']);        if(s>=0) seedCol=s;
        } else {
          const isNum = typeof row[0]==='number' || (!isNaN(row[0]) && String(row[0]).trim()!=='');
          if (isNum && row[1]) { nameCol=1;birthCol=2;genderCol=3;clubCol=4;eventCol=5;weightCol=6;teamCol=7;seedCol=8; }
        }

        const name = String(row[nameCol]||'').trim();
        if (!name) continue;

        const genderRaw = String(row[genderCol]||'').trim().toLowerCase();
        const gender = (genderRaw.includes('nữ')||genderRaw.includes('nu')||genderRaw==='female'||genderRaw==='f') ? 'female' : 'male';

        let birthDate='', birthYearOnly=null;
        const dateVal = row[birthCol];
        if (dateVal !== undefined && dateVal !== null && dateVal !== '') {
          if (typeof dateVal === 'number') {
            if (Number.isInteger(dateVal) && dateVal>=1900 && dateVal<=2050) {
              birthYearOnly = dateVal;
            } else {
              const d = new Date(1899, 11, 30 + Math.round(dateVal));
              birthDate = d.toISOString().split('T')[0];
            }
          } else {
            const str = String(dateVal).trim();
            if (/^\d{4}$/.test(str)) {
              const yr = parseInt(str);
              if (yr>=1900 && yr<=2050) birthYearOnly = yr;
            } else {
              const parts = str.split(/[-/.]/);
              if (parts.length===3) {
                const [a,b2,c2] = parts.map(Number);
                if (c2>1900) birthDate=c2+'-'+String(b2).padStart(2,'0')+'-'+String(a).padStart(2,'0');
                else if (a>1900) birthDate=a+'-'+String(b2).padStart(2,'0')+'-'+String(c2).padStart(2,'0');
              }
            }
          }
        }

        const club = String(row[clubCol]||clubName||'').trim();
        const eventName = String(row[eventCol]||'').trim();
        const weight = row[weightCol] ? parseFloat(row[weightCol]) : null;
        const teamRaw = String(row[teamCol]||'').trim().toLowerCase();
        const isTeam = teamRaw==='ó'||teamRaw==='co'||teamRaw==='yes'||teamRaw==='x'||teamRaw.startsWith('có')||teamRaw==='có';
        const seed = parseInt(row[seedCol]) || null;

        if (!eventName) {
          importErrors.push('Đòng '+(i+1)+' ('+name+'): Thiếu nội dung thi đấu');
          continue;
        }

        const matchedEvent = tournamentData.events.find(ev => {
          const a=ev.name.toLowerCase(), b3=eventName.toLowerCase();
          return a===b3 || a.includes(b3) || b3.includes(a);
        });
        if (!matchedEvent) {
          importErrors.push('Đòng '+(i+1)+' ('+name+'): Không tìm thấy nội dung "'+eventName+'"');
          continue;
        }

        const birthYear = birthDate ? new Date(birthDate).getFullYear() : birthYearOnly;
        const evName = matchedEvent.name || '';
        const rangeMatch = evName.match(/(d+)s*[-–]s*(d+)s*tu/i);
        const plusMatch  = evName.match(/(d+)+s*tu/i);
        let minAge=null, maxAge=null;
        if (rangeMatch) { minAge=+rangeMatch[1]; maxAge=+rangeMatch[2]; }
        else if (plusMatch) { minAge=+plusMatch[1]; maxAge=99; }
        if (birthYear && minAge !== null) {
          const age = new Date().getFullYear() - birthYear;
          if (age<minAge||age>maxAge)
            importErrors.push('⚠️ Đòng '+(i+1)+' ('+name+'): '+age+' tuổi — không phù hợp "'+minAge+'-'+maxAge+'" của "'+evName+'"');
        }
        const isKumiteEv = matchedEvent.type==='kumite' || evName.toLowerCase().includes('kumite');
        if (isKumiteEv && (!weight||isNaN(weight)))
          importErrors.push('⚠️ Đòng '+(i+1)+' ('+name+'): Thiếu cân nặng cho Kumite "'+evName+'"');

        const result = await addAthlete({
          name, birthDate, birthYear, gender, club,
          eventId: matchedEvent.id, eventName: matchedEvent.name,
          weight: weight && !isNaN(weight) ? weight : undefined,
          isTeam, seed: seed && seed>=1 && seed<=8 ? seed : null,
        });
        if (result.success) imported++;
        else importErrors.push('❌ Đòng '+(i+1)+' ('+name+'): '+result.error);
      }

      if (importErrors.length > 0)
        toast.warning('Đã import '+imported+' VĐV.\n\nCảnh báo ('+importErrors.length+'):\n'+importErrors.join('\n')+'\n\nVui lòng kiểm tra và sửa lại.');
      else
        toast.success('Đã import thành công '+imported+' VĐV! Tất cả hợp lệ.');
    } catch (err) {
      toast.error('Lỗi đọc file: '+err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };
  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();

    const event = tournamentData.events.find(
      (ev) => ev.id === formData.eventId
    );
    const errors = [];

    // Derive birthYear from birthDate for validation
    let birthYear = null;
    if (formData.birthDate) {
      birthYear = new Date(formData.birthDate).getFullYear();
    }

    // Custom validation: weight required for kumite
    const isKumite =
      event &&
      (event.type === "kumite" || event.name?.toLowerCase().includes("kumite"));
    if (isKumite && !formData.weight) {
      errors.push("Cân nặng (kg) là bắt buộc cho nội dung Kumite");
    }

    // Age validation: compute directly instead of relying on state
    if (formData.birthDate && event) {
      const eventName = event.name || "";
      const rangeMatch = eventName.match(
        /(\d+)\s*[-\u2013]\s*(\d+)\s*tu\u1ed5i/i
      );
      const plusMatch = eventName.match(/(\d+)\+\s*tu\u1ed5i/i);
      let minAge = null,
        maxAge = null;
      if (rangeMatch) {
        minAge = parseInt(rangeMatch[1]);
        maxAge = parseInt(rangeMatch[2]);
      } else if (plusMatch) {
        minAge = parseInt(plusMatch[1]);
        maxAge = 99;
      } else if (event.minAge || event.maxAge) {
        minAge = event.minAge || 0;
        maxAge = event.maxAge || 99;
      }
      if (minAge !== null) {
        const birth = new Date(formData.birthDate);
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
        if (age < minAge || age > maxAge) {
          errors.push(
            `VĐV ${age} tuổi không phù hợp lứa tuổi "${minAge}-${maxAge} tuổi" của nội dung ${eventName}`
          );
        }
      }
    }

    const validation = validateAthlete(
      {
        ...formData,
        birthYear,
        club: clubName,
        weight: formData.weight ? parseFloat(formData.weight) : undefined,
      },
      event || {}
    );

    if (!validation.valid) {
      errors.push(...validation.errors);
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    const athleteData = {
      name: formData.name.trim(),
      birthDate: formData.birthDate,
      birthYear,
      gender: formData.gender,
      club: clubName.trim(),
      eventId: formData.eventId,
      eventName: event?.name || "",
      weight: formData.weight ? parseFloat(formData.weight) : undefined,
      isTeam: formData.isTeam || false,
      seed: formData.seed ? parseInt(formData.seed) : null,
    };

    if (editingAthlete) {
      const result = await updateAthlete(editingAthlete.id, athleteData);
      if (!result.success) {
        setFormErrors([result.error]);
        return;
      }
    } else {
      const result = await addAthlete(athleteData);
      if (!result.success) {
        setFormErrors([result.error]);
        return;
      }
    }

    resetForm();
  };
  // Xóa VĐV
  const handleDelete = (athlete) => {
    setConfirmDialog({
      open: true,
      message: `Bạn có chắc muốn xóa VĐV "${athlete.name}"?`,
      onConfirm: () => {
        const result = deleteAthlete(athlete.id);
        if (!result.success) {
          toast.error(result.error);
        }
        setConfirmDialog({ open: false, message: "", onConfirm: null });
      },
    });
  };

  // Xuất file
  const handleExport = async () => {
    if (!coachName.trim() && !clubName.trim()) {
      toast.warning("Vui lòng nhập tên HLV hoặc tên CLB trước khi xuất file");
      return;
    }

    // Validate tất cả VĐV trước khi xuất
    const warnings = [];
    coachAthletes.forEach((a, idx) => {
      const event = tournamentData.events.find((ev) => ev.id === a.eventId);
      if (!event) return;
      const evName = event.name || "";

      // Check age
      if (a.birthDate) {
        const rangeMatch = evName.match(
          /(\d+)\s*[-\u2013]\s*(\d+)\s*tu\u1ed5i/i
        );
        const plusMatch = evName.match(/(\d+)\+\s*tu\u1ed5i/i);
        let minAge = null,
          maxAge = null;
        if (rangeMatch) {
          minAge = parseInt(rangeMatch[1]);
          maxAge = parseInt(rangeMatch[2]);
        } else if (plusMatch) {
          minAge = parseInt(plusMatch[1]);
          maxAge = 99;
        }
        if (minAge !== null) {
          const birth = new Date(a.birthDate);
          const now = new Date();
          let age = now.getFullYear() - birth.getFullYear();
          const m = now.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
          if (age < minAge || age > maxAge) {
            warnings.push(
              `#${idx + 1} ${
                a.name
              }: ${age} tu\u1ed5i - kh\u00f4ng ph\u00f9 h\u1ee3p "${minAge}-${maxAge} tu\u1ed5i" (${evName})`
            );
          }
        }
      }

      // Check weight for kumite
      const isKumite =
        event.type === "kumite" || evName.toLowerCase().includes("kumite");
      if (isKumite && !a.weight) {
        warnings.push(
          `#${idx + 1} ${
            a.name
          }: Thi\u1ebfu c\u00e2n n\u1eb7ng cho Kumite (${evName})`
        );
      }
    });

    if (warnings.length > 0) {
      toast.error(
        `\u274c Kh\u00f4ng th\u1ec3 xu\u1ea5t file! C\u00f2n ${
          warnings.length
        } v\u1ea5n \u0111\u1ec1 c\u1ea7n s\u1eeda:\n\n${warnings.join(
          "\n"
        )}\n\nVui l\u00f2ng s\u1eeda l\u1ea1i r\u1ed3i xu\u1ea5t l\u1ea1i.`
      );
      return;
    }

    try {
      const data = getExportData();
      const result = await exportCoachData(data, "excel");

      if (result.success) {
        toast.success("Xu\u1ea5t file Excel th\u00e0nh c\u00f4ng!");
      } else if (!result.canceled) {
        toast.error("L\u1ed7i xu\u1ea5t file: " + result.error);
      }
    } catch (err) {
      toast.error("L\u1ed7i xu\u1ea5t file: " + err.message);
    }
  };
 
  // Nộp danh sách trực tuyến
  const handleOnlineSubmit = async () => {
    if (!clubName.trim()) {
      toast.warning("Vui lòng nhập tên Đoàn / Câu lạc bộ trước khi nộp trực tuyến");
      return;
    }
 
    if (coachAthletes.length === 0) {
      toast.warning("Danh sách VĐV trống. Vui lòng thêm VĐV trước khi nộp");
      return;
    }
 
    // Validate tất cả VĐV trước khi nộp (tương tự export)
    const warnings = [];
    coachAthletes.forEach((a, idx) => {
      const event = tournamentData.events.find((ev) => ev.id === a.eventId);
      if (!event) return;
      const evName = event.name || "";
 
      // Check age
      if (a.birthDate) {
        const rangeMatch = evName.match(/(\d+)\s*[-\u2013]\s*(\d+)\s*tu\u1ed5i/i);
        const plusMatch = evName.match(/(\d+)\+\s*tu\u1ed5i/i);
        let minAge = null, maxAge = null;
        if (rangeMatch) {
          minAge = parseInt(rangeMatch[1]);
          maxAge = parseInt(rangeMatch[2]);
        } else if (plusMatch) {
          minAge = parseInt(plusMatch[1]);
          maxAge = 99;
        }
        if (minAge !== null) {
          const birth = new Date(a.birthDate);
          const now = new Date();
          let age = now.getFullYear() - birth.getFullYear();
          const m = now.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
          if (age < minAge || age > maxAge) {
            warnings.push(`#${idx + 1} ${a.name}: ${age} tuổi - không phù hợp "${minAge}-${maxAge} tuổi" (${evName})`);
          }
        }
      }
 
      // Check weight for kumite
      const isKumite = event.type === "kumite" || evName.toLowerCase().includes("kumite");
      if (isKumite && !a.weight) {
        warnings.push(`#${idx + 1} ${a.name}: Thiếu cân nặng cho Kumite (${evName})`);
      }
    });
 
    if (warnings.length > 0) {
      toast.error(`❌ Không thể nộp trực tuyến! Còn ${warnings.length} vấn đề cần sửa:\n\n${warnings.join("\n")}\n\nVui lòng sửa lại rồi nộp lại.`);
      return;
    }
 
    if (!tournamentData || !tournamentData.tournamentId) {
      toast.error("❌ Lỗi: Mã giải đấu (Tournament ID) bị thiếu. Vui lòng liên hệ BTC để lấy file .krt mới nhất.");
      console.error("Missing tournamentId in tournamentData:", tournamentData);
      return;
    }
 
    setSubmitting(true);
    try {
      const exportData = getExportData();
      
      // Normalize club names for all athletes to match the current clubName input
      if (exportData.athletes && exportData.athletes.length > 0) {
        exportData.athletes = exportData.athletes.map(a => ({
          ...a,
          club: clubName.trim()
        }));
      }

      console.log("Submitting to Supabase with ID:", tournamentData.tournamentId);
      const result = await submitAthletes(tournamentData.tournamentId, clubName.trim(), exportData);
 
      if (result.success) {
        setLastSubmitted(result.submitted_at_local);
        toast.success(`✅ Đã nộp danh sách thành công lúc ${result.submitted_at_local}`);
      } else {
        toast.error(`❌ Mạng có vấn đề. Lỗi: ${result.message || "Không xác định"}. Vui lòng bấm nút [Xuất Excel] và gửi qua Zalo cho BTC`);
      }
    } catch (err) {
      toast.error(`❌ Lỗi hệ thống: ${err.message}. Vui lòng bấm nút [Xuất Excel] và gửi qua Zalo cho BTC`);
    } finally {
      setSubmitting(false);
    }
  };
 
  // Xóa tất cả VĐV
  const handleDeleteAll = () => {
    setConfirmDialog({
      open: true,
      message: "Bạn có chắc chắn muốn XÓA TẤT CẢ vận động viên trong danh sách hiện tại không? Thao tác này không thể hoàn tác.",
      onConfirm: async () => {
        const result = await clearAthletes();
        if (result.success) {
          toast.success("✅ Đã xóa toàn bộ danh sách vận động viên.");
        } else {
          toast.error("❌ Lỗi: " + result.error);
        }
        setConfirmDialog({ open: false, message: "", onConfirm: null });
      }
    });
  };
 
  // Quay lại trang chọn role
  const handleBack = () => {
    resetRole();
    navigate("/");
  };

  // Lấy tên trạng thái thời gian
  const getTimeStatusLabel = () => {
    switch (timeStatus) {
      case TIME_STATUS.BEFORE:
        return { text: "Chưa đến thời gian nhập", class: "status-before" };
      case TIME_STATUS.DURING:
        return { text: "Đang trong thời gian nhập", class: "status-during" };
      case TIME_STATUS.AFTER:
        return { text: "Đã hết thời gian nhập", class: "status-after" };
      default:
        return { text: "", class: "" };
    }
  };

  // Render khi chưa mở file
  if (!tournamentData) {
    return (
      <div className="coach-page">
        <div className="coach-container">
          <div className="coach-header">
            <button className="back-btn" onClick={handleBack}>
              ← Quay lại
            </button>
            <h1>🏆 Huấn luyện viên</h1>
          </div>

          <div className="no-file-section">
            <div className="no-file-icon">📂</div>
            <h2>Chưa có file giải đấu</h2>
            <p>
              Vui lòng mở file .krt do Admin cung cấp để bắt đầu nhập danh sách
              VĐV
            </p>

            <button
              className="open-file-btn"
              onClick={handleOpenFile}
              disabled={loading}
            >
              {loading ? "Đang mở..." : "📁 Mở file .krt"}
            </button>

            {error && <div className="error-message">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  const statusInfo = getTimeStatusLabel();

  return (
    <div className="coach-page">
      <div className="coach-container">
        {/* Header */}
        <div className="coach-header">
          <button className="back-btn" onClick={handleBack}>
            ← Quay lại
          </button>
          <h1 className="page-title">
            <img src={appIcon} alt="" className="page-title-logo" />
            {tournamentData.tournamentName}
          </h1>
          <button className="open-file-btn small" onClick={handleOpenFile}>
            📁 Đổi file
          </button>
        </div>
        {/* Time Status Banner */}
        <div className={`time-status-banner ${statusInfo.class}`}>
          <div className="status-info">
            <span className="status-label">{statusInfo.text}</span>
            <span className="countdown">{countdown}</span>
          </div>
          <div className="time-range">
            <span>
              Từ: {new Date(tournamentData.startTime).toLocaleString("vi-VN")}
            </span>
            <span>
              Đến: {new Date(tournamentData.endTime).toLocaleString("vi-VN")}
            </span>
          </div>
        </div>{" "}
        {/* Coach Name + Club Name */}
        <div className="coach-name-section">
          <div className="coach-name-field">
            <label>Tên HLV:</label>
            <input
              type="text"
              value={coachName}
              onChange={(e) => updateCoachName(e.target.value)}
              placeholder="Nguyễn Văn B"
              disabled={!canEdit && timeStatus === TIME_STATUS.BEFORE}
            />
          </div>
          <div className="coach-name-field">
            <label>Tên CLB:</label>
            <input
              type="text"
              value={clubName}
              onChange={(e) => updateClubName(e.target.value)}
              placeholder="CLB Karate Hà Nội"
              disabled={!canEdit && timeStatus === TIME_STATUS.BEFORE}
            />
          </div>
        </div>

        {/* Team Leader + Additional Coaches */}
        <div className="coach-name-section">
          <div className="coach-name-field">
            <label>Trưởng đoàn:</label>
            <input
              type="text"
              value={teamLeaderName}
              onChange={(e) => updateTeamLeaderName(e.target.value)}
              placeholder="Nguyễn Văn C"
              disabled={!canEdit && timeStatus === TIME_STATUS.BEFORE}
            />
            <small style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>Mỗi CLB chỉ có 1 trưởng đoàn</small>
          </div>
          <div className="coach-name-field">
            <label>HLV phụ:</label>
            {additionalCoaches.map((name, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    const updated = [...additionalCoaches];
                    updated[idx] = e.target.value;
                    updateAdditionalCoaches(updated);
                  }}
                  placeholder={`HLV phụ ${idx + 1}`}
                  disabled={!canEdit && timeStatus === TIME_STATUS.BEFORE}
                />
                <button
                  type="button"
                  className="delete-btn"
                  onClick={() => {
                    const updated = additionalCoaches.filter((_, i) => i !== idx);
                    updateAdditionalCoaches(updated);
                  }}
                  disabled={!canEdit && timeStatus === TIME_STATUS.BEFORE}
                  style={{ padding: '4px 8px', fontSize: '12px' }}
                >✕</button>
              </div>
            ))}
            {additionalCoaches.length < 2 && (
              <button
                type="button"
                className="add-btn"
                onClick={() => updateAdditionalCoaches([...additionalCoaches, ''])}
                disabled={!canEdit && timeStatus === TIME_STATUS.BEFORE}
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >+ Thêm HLV phụ</button>
            )}
            <small style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>Tối đa 3 HLV (gồm HLV chính)</small>
          </div>
        </div>
        {/* Events List */}
        <div className="events-section">
          <h3>📋 Nội dung thi đấu</h3>
          <div className="events-list">
            {tournamentData.events.map((event) => (
              <span key={event.id} className="event-tag">
                {event.name}
              </span>
            ))}
          </div>
        </div>
        {/* Athletes Section */}
        <div className="athletes-section">
          <div className="section-header">
            <h3>👥 Danh sách VĐV ({coachAthletes.length})</h3>
            <div className="section-header-actions">
              <button className="template-btn" onClick={handleDownloadTemplate}>
                📥 Tải mẫu Excel
              </button>
              <label className="import-btn" style={{ cursor: "pointer" }}>
                {importing ? "⏳ Đang nhập..." : "📤 Import Excel"}
                <input
                  ref={excelFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  style={{ display: "none" }}
                  disabled={importing || !canEdit}
                />
              </label>
               {canEdit && (
                <>
                  <button
                    className="btn-delete-all"
                    onClick={handleDeleteAll}
                    disabled={coachAthletes.length === 0}
                    style={{ 
                      backgroundColor: '#fee2e2', 
                      color: '#ef4444', 
                      border: '1px solid #fecaca',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🗑️ Xóa tất cả
                  </button>
                  <button className="add-btn" onClick={handleAddNew}>
                    + Thêm VĐV
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="athlete-filter-bar" style={{ marginBottom: '16px', display: 'flex', gap: '10px' }}>
             <input 
               type="text" 
               placeholder="🔍 Tìm kiếm tên VĐV hoặc nội dung thi đấu..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               style={{ 
                 flex: 1, 
                 padding: '10px 15px', 
                 borderRadius: '8px', 
                 border: '1px solid #e2e8f0',
                 fontSize: '14px'
               }}
             />
          </div>
          {/* Add/Edit Form */}
          {showForm && (
            <div className="athlete-form-overlay">
              <form
                className="athlete-form coach-athlete-form"
                onSubmit={handleSubmit}
              >
                <h4>{editingAthlete ? "Sửa VĐV" : "Thêm VĐV mới"}</h4>

                {formErrors.length > 0 && (
                  <div className="form-errors">
                    {formErrors.map((err, i) => (
                      <div key={i} className="error-item">
                        ❌ {err}
                      </div>
                    ))}
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>
                      Họ tên <span className="required-star">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Nguyễn Văn A"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>
                      Giới tính <span className="required-star">*</span>
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) =>
                        setFormData({ ...formData, gender: e.target.value })
                      }
                    >
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Ngày sinh</label>
                    <DateInput
                      value={formData.birthDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, birthDate: val });
                        checkAgeWarning(val, formData.eventId);
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Cân nặng</label>
                    <input
                      type="number"
                      value={formData.weight}
                      onChange={(e) =>
                        setFormData({ ...formData, weight: e.target.value })
                      }
                      placeholder="60"
                      step="0.1"
                      min="0"
                    />
                  </div>
                </div>

                {/* Age warning */}
                {ageWarning && (
                  <div
                    className="form-errors"
                    style={{
                      background: "rgba(255, 200, 0, 0.15)",
                      borderColor: "#f59e0b",
                    }}
                  >
                    <div className="error-item" style={{ color: "#d97706" }}>
                      {ageWarning}
                    </div>
                  </div>
                )}

                {/* Weight required warning for kumite */}
                {isKumiteEvent() && !formData.weight && (
                  <div
                    className="form-errors"
                    style={{
                      background: "rgba(255, 200, 0, 0.15)",
                      borderColor: "#f59e0b",
                    }}
                  >
                    <div className="error-item" style={{ color: "#d97706" }}>
                      ⚠️ Nội dung Kumite yêu cầu phải nhập cân nặng
                    </div>
                  </div>
                )}

                <div className="form-row form-row-single">
                  <div className="form-group">
                    <label>
                      Nội dung thi đấu <span className="required-star">*</span>
                    </label>
                    <SearchableSelect
                      options={tournamentData.events.map((ev) => ({
                        value: ev.id,
                        label: ev.name,
                      }))}
                      value={formData.eventId}
                      onChange={(val) => {
                        setFormData({ ...formData, eventId: val });
                        checkAgeWarning(formData.birthDate, val);
                      }}
                      placeholder="-- Chọn nội dung --"
                    />
                  </div>
                </div>

                {/* Đồng đội + Hạt giống */}
                <div className="form-row">
                  <div className="form-group">
                    <label
                      className="checkbox-label"
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        marginTop: "1.5rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.isTeam}
                        onChange={(e) =>
                          setFormData({ ...formData, isTeam: e.target.checked })
                        }
                      />
                      Thi đấu đồng đội
                    </label>
                  </div>
                  <div className="form-group">
                    <label>Hạt giống (1-8)</label>
                    <input
                      type="number"
                      value={formData.seed}
                      onChange={(e) =>
                        setFormData({ ...formData, seed: e.target.value })
                      }
                      placeholder=""
                      min="1"
                      max="8"
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={resetForm}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="submit-btn">
                    {editingAthlete ? "Cập nhật" : "Thêm"}
                  </button>
                </div>
              </form>
            </div>
          )}
          {/* Athletes Table */}{" "}
          {coachAthletes.length > 0 ? (
            <div className="athletes-table-wrapper">
              <table className="athletes-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Họ tên</th>
                    <th>Ngày sinh</th>
                    <th>Giới tính</th>
                    <th>Nội dung</th>
                    <th>Cân nặng</th>
                    <th>Hạt giống</th>
                    <th>Đồng đội</th>
                    {canEdit && <th>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {coachAthletes.filter(a => 
                    (a.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                    (a.eventName || "").toLowerCase().includes(searchTerm.toLowerCase())
                  ).map((athlete, index) => (
                    <tr key={athlete.id}>
                      <td>{index + 1}</td>
                      <td>{athlete.name}</td>
                      <td>
                        {athlete.birthDate
                          ? (() => {
                              const [y, m, d] = athlete.birthDate.split("-");
                              return `${d}/${m}/${y}`;
                            })()
                          : athlete.birthYear || "-"}
                      </td>
                      <td className="text-center">{athlete.gender === "male" ? "Nam" : (athlete.gender === "female" ? "Nữ" : "—")}</td>
                      <td>{athlete.eventName}</td>
                      <td>{athlete.weight || "-"}</td>
                      <td>{athlete.seed || "-"}</td>
                      <td>{athlete.isTeam ? "✅" : "-"}</td>
                      {canEdit && (
                        <td className="actions-cell">
                          <button
                            className="edit-btn"
                            onClick={() => handleEdit(athlete)}
                          >
                            ✏️
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => handleDelete(athlete)}
                          >
                            🗑️
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>{" "}
              </table>
            </div>
          ) : (
            <div className="no-athletes">
              <p>Chưa có VĐV nào</p>
              {canEdit && <p className="hint">Nhấn "Thêm VĐV" để bắt đầu</p>}
            </div>
          )}
        </div>
        {/* Stats bar */}
        {coachAthletes.length > 0 && (
          <div className="coach-stats-bar">
            <div className="coach-stat-item">
              <span className="coach-stat-value">{coachAthletes.length}</span>
              <span className="coach-stat-label">Lượt VĐV</span>
            </div>
            <div className="coach-stat-item">
              <span className="coach-stat-value">
                {new Set(coachAthletes.map(a => `${(a.name || "").trim().toLowerCase()}_${a.birthDate || a.birthYear || ""}_${a.gender}`)).size}
              </span>
              <span className="coach-stat-label">VĐV Thực Tế</span>
            </div>
            <div className="coach-stat-item">
              <span className="coach-stat-value" style={{ color: "#3b82f6" }}>
                {coachAthletes.filter((a) => a.gender === "male").length}
              </span>
              <span className="coach-stat-label">Nam</span>
            </div>
            <div className="coach-stat-item">
              <span className="coach-stat-value" style={{ color: "#ec4899" }}>
                {coachAthletes.filter((a) => a.gender === "female").length}
              </span>
              <span className="coach-stat-label">Nữ</span>
            </div>
            <div className="coach-stat-item">
              <span className="coach-stat-value">
                {new Set(coachAthletes.map((a) => a.eventId)).size}
              </span>
              <span className="coach-stat-label">Nội dung</span>
            </div>
          </div>
        )}
        {/* Export Section */}
        <div className="export-section">
          <h3>📤 Xuất file gửi Admin</h3>
          <p className="export-note">
            Xuất danh sách VĐV để gửi cho Admin import vào hệ thống
          </p>
          <div className="export-buttons">
            <button
              className="export-btn excel"
              onClick={handleExport}
              disabled={coachAthletes.length === 0}
            >
              Xuất file Excel
            </button>
            <button
              className="export-btn online"
              style={{ 
                background: 'linear-gradient(135deg, #059669, #10b981)', 
                color: '#fff',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                fontWeight: '800',
                fontSize: '15px',
                letterSpacing: '0.3px',
                boxShadow: '0 4px 12px -2px rgba(16, 185, 129, 0.4)',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '10px',
                transition: 'all 0.2s ease'
              }}
              onClick={handleOnlineSubmit}
              disabled={coachAthletes.length === 0 || submitting}
            >
              🚀 {submitting ? "Đang nộp..." : "Nộp danh sách trực tuyến"}
            </button>
            {lastSubmitted && (
              <p className="last-submitted-info" style={{ 
                fontSize: '13px', 
                color: '#059669', 
                marginTop: '8px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                ✅ Đã nộp lên Cloud lúc: {lastSubmitted}
              </p>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title="Xác nhận xóa"
        message={confirmDialog.message}
        onConfirm={() => confirmDialog.onConfirm?.()}
        onCancel={() =>
          setConfirmDialog({ open: false, message: "", onConfirm: null })
        }
        confirmText="Xóa"
        cancelText="Hủy"
        type="danger"
      />
    </div>
  );
}

export default CoachPage;
