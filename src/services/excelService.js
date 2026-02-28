import * as XLSX from "xlsx";

/**
 * Excel Import/Export Service for Athletes
 * Expected format:
 * Column A: Tên VĐV (Name)
 * Column B: Giới tính (Gender: Nam/Nữ)
 * Column C: Ngày sinh (DD/MM/YYYY)
 * Column D: Đơn vị/CLB (Club)
 * Column E: Nội dung thi đấu (Event - optional)
 * Column F: Cân nặng (Weight - for Kumite)
 * Column G: Quốc gia (Country - optional, default: VN)
 * Column H: Đồng đội (Team: Có/Không)
 * Column I: Hạt giống (Seed - optional, 1-8)
 */

/**
 * Parse date from various formats: DD/MM/YYYY, YYYY-MM-DD, Excel serial number
 */
function parseDateValue(val) {
  if (!val) return null;

  // Excel serial number
  if (typeof val === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    return date.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  const str = String(val).trim();

  // DD/MM/YYYY
  const matchDMY = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (matchDMY) {
    const [, d, m, y] = matchDMY;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY-MM-DD
  const matchYMD = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (matchYMD) {
    const [, y, m, d] = matchYMD;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

function parseGenderValue(val) {
  if (!val) return null;
  const str = String(val).trim().toLowerCase();
  if (str === "nam" || str === "male" || str === "m") return "male";
  if (str === "nữ" || str === "nu" || str === "female" || str === "f")
    return "female";
  return null;
}

function parseBooleanValue(val) {
  if (!val) return false;
  const str = String(val).trim().toLowerCase();
  return (
    str === "có" ||
    str === "co" ||
    str === "yes" ||
    str === "x" ||
    str === "1" ||
    str === "true"
  );
}

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", codepage: 65001 });

        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Skip header row if exists
        const startRow = isHeaderRow(jsonData[0]) ? 1 : 0;

        const athletes = [];
        const errors = [];

        for (let i = startRow; i < jsonData.length; i++) {
          const row = jsonData[i];

          // Skip empty rows
          if (!row || !row[0]) continue;

          // Detect if "Nội dung" column is present (check header)
          let hasEventCol = false;
          if (startRow === 1 && jsonData[0]) {
            const headerStr = jsonData[0].map(h => String(h || "").toLowerCase());
            hasEventCol = headerStr.some(h => h.includes("nội dung"));
          }

          let eventName, weight, country, isTeam, seed;
          const name = String(row[0] || "").trim();
          const gender = parseGenderValue(row[1]);
          const birthDate = parseDateValue(row[2]);
          const club = String(row[3] || "").trim();

          if (hasEventCol) {
            // New format: Name, Gender, BirthDate, Club, Event, Weight, Country, Team, Seed
            eventName = String(row[4] || "").trim();
            weight = row[5] ? parseFloat(row[5]) : null;
            country = String(row[6] || "VN").trim().toUpperCase();
            isTeam = parseBooleanValue(row[7]);
            seed = parseInt(row[8]) || null;
          } else {
            // Old format: Name, Gender, BirthDate, Club, Weight, Country, Team, Seed
            eventName = "";
            weight = row[4] ? parseFloat(row[4]) : null;
            country = String(row[5] || "VN").trim().toUpperCase();
            isTeam = parseBooleanValue(row[6]);
            seed = parseInt(row[7]) || null;
          }

          if (!name) {
            errors.push(`Dòng ${i + 1}: Thiếu tên VĐV`);
            continue;
          }

          if (seed !== null && (seed < 1 || seed > 8)) {
            errors.push(`Dòng ${i + 1}: Hạt giống phải từ 1-8`);
          }

          if (weight !== null && isNaN(weight)) {
            errors.push(`Dòng ${i + 1}: Cân nặng không hợp lệ`);
          }

          athletes.push({
            name,
            gender,
            birthDate,
            club,
            eventName,
            weight: weight && !isNaN(weight) ? weight : null,
            country,
            isTeam,
            seed: seed && seed >= 1 && seed <= 8 ? seed : null,
          });
        }

        resolve({ athletes, errors });
      } catch (error) {
        reject(new Error("Không thể đọc file Excel: " + error.message));
      }
    };

    reader.onerror = () => {
      reject(new Error("Lỗi khi đọc file"));
    };

    reader.readAsArrayBuffer(file);
  });
}

function isHeaderRow(row) {
  if (!row || !row[0]) return false;
  const firstCell = String(row[0]).toLowerCase();
  return (
    firstCell.includes("tên") ||
    firstCell.includes("name") ||
    firstCell.includes("vđv") ||
    firstCell.includes("stt")
  );
}

/**
 * Parse file Excel từ CLB/HLV gửi về cho Admin
 * Format: STT | Họ tên | Ngày sinh | Giới tính | CLB | Nội dung | Cân nặng | Đồng đội
 * (Exported by coachExportService)
 */
export function parseCoachExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", codepage: 65001 });

        let clubName = "";
        let coachName = "";

        // Try to read info from "Thông tin" sheet
        const infoSheet = workbook.Sheets["Thông tin"];
        if (infoSheet) {
          const infoData = XLSX.utils.sheet_to_json(infoSheet, { header: 1 });
          for (const row of infoData) {
            const label = String(row[0] || "").trim();
            if (label.includes("CLB") || label.includes("Câu lạc bộ")) {
              clubName = String(row[1] || "").trim();
            }
            if (label.includes("HLV") || label.includes("Huấn luyện")) {
              coachName = String(row[1] || "").trim();
            }
          }
        }

        // Read athletes from "Danh sách VĐV" sheet or first sheet
        const athleteSheetName = workbook.SheetNames.find(
          (name) => name.includes("VĐV") || name.includes("Danh sách")
        ) || workbook.SheetNames[0];
        const athleteSheet = workbook.Sheets[athleteSheetName];

        if (!athleteSheet) {
          resolve({ athletes: [], errors: ["Không tìm thấy sheet danh sách VĐV"], clubName, coachName });
          return;
        }

        const jsonData = XLSX.utils.sheet_to_json(athleteSheet, { header: 1 });

        // Detect header row
        const startRow = isCoachHeaderRow(jsonData[0]) ? 1 : 0;

        const athletes = [];
        const errors = [];

        for (let i = startRow; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || !row[0]) continue;

          // Skip if first col is just a number (STT) and no name in second col
          let nameCol, genderCol, birthCol, clubCol, eventCol, weightCol, seedCol, teamCol;

          // Detect if col 0 is STT (number) → data starts from col 1
          const firstVal = row[0];
          if (typeof firstVal === "number" || /^\d+$/.test(String(firstVal).trim())) {
            // STT column present: STT(0), Name(1), Birth(2), Gender(3), Club(4), Event(5), Weight(6), Seed(7), Team(8)
            nameCol = 1;
            birthCol = 2;
            genderCol = 3;
            clubCol = 4;
            eventCol = 5;
            weightCol = 6;
            seedCol = 7;
            teamCol = 8;
          } else {
            // No STT, first col is name
            nameCol = 0;
            genderCol = 1;
            birthCol = 2;
            clubCol = 3;
            eventCol = 4;
            weightCol = 5;
            seedCol = 6;
            teamCol = 7;
          }

          const name = String(row[nameCol] || "").trim();
          if (!name) continue;

          const gender = parseGenderValue(row[genderCol]);
          const birthDate = parseDateValue(row[birthCol]);
          const athleteClub = String(row[clubCol] || clubName || "").trim();
          const eventName = String(row[eventCol] || "").trim();
          const weight = row[weightCol] ? parseFloat(row[weightCol]) : null;
          const seed = parseInt(row[seedCol]) || null;
          const isTeam = parseBooleanValue(row[teamCol]);

          athletes.push({
            name,
            gender: gender || "male",
            birthDate,
            club: athleteClub,
            eventName,
            weight: weight && !isNaN(weight) ? weight : null,
            isTeam,
            seed: seed && seed >= 1 && seed <= 8 ? seed : null,
            country: "VN",
          });
        }

        resolve({ athletes, errors, clubName, coachName });
      } catch (error) {
        reject(new Error("Không thể đọc file Excel: " + error.message));
      }
    };

    reader.onerror = () => {
      reject(new Error("Lỗi khi đọc file"));
    };

    reader.readAsArrayBuffer(file);
  });
}

function isCoachHeaderRow(row) {
  if (!row || row.length < 2) return false;
  const values = row.map((v) => String(v || "").toLowerCase());
  return (
    values.some((v) => v.includes("họ tên") || v.includes("tên")) &&
    (values.some((v) => v.includes("nội dung") || v.includes("giới")) || values.some((v) => v.includes("stt")))
  );
}

function formatDateForExcel(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "";
  }
}

export function exportAthletesToExcel(
  athletes,
  filename = "danh_sach_vdv.xlsx",
  category = null
) {
  const isKumite = category?.type === "kumite";

  const headers = [
    "Tên VĐV",
    "Giới tính",
    "Ngày sinh",
    "Đơn vị/CLB",
    "Nội dung thi đấu",
    "Cân nặng (kg)",
    "Quốc gia",
    "Đồng đội",
    "Hạt giống",
  ];

  const data = [
    headers,
    ...athletes.map((a) => [
      a.name,
      a.gender === "female" ? "Nữ" : "Nam",
      formatDateForExcel(a.birthDate),
      a.club || "",
      a.eventName || category?.name || "",
      a.weight || "",
      a.country || "VN",
      a.isTeam ? "Có" : "Không",
      a.seed || "",
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Danh sách VĐV");

  const colWidths = [
    { wch: 25 }, // Name
    { wch: 10 }, // Gender
    { wch: 12 }, // BirthDate
    { wch: 20 }, // Club
    { wch: 25 }, // Event
    { wch: 12 }, // Weight
    { wch: 10 }, // Country
    { wch: 10 }, // Team
    { wch: 10 }, // Seed
  ];
  worksheet["!cols"] = colWidths;

  XLSX.writeFile(workbook, filename);
}

export function generateTemplateExcel(category = null) {
  const isKumite = category?.type === "kumite";
  const sheetName = isKumite ? "Mẫu VĐV Kumite" : "Mẫu nhập VĐV";
  const categoryName = category?.name || "";

  const headers = [
    "Tên VĐV",
    "Giới tính",
    "Ngày sinh (DD/MM/YYYY)",
    "Đơn vị/CLB",
    "Nội dung thi đấu",
    "Cân nặng (kg)",
    "Quốc gia",
    "Đồng đội (Có/Không)",
    "Hạt giống",
  ];

  const sampleData = isKumite
    ? [
        headers,
        [
          "Nguyễn Văn A",
          "Nam",
          "15/03/2008",
          "CLB Hà Nội",
          categoryName,
          59.5,
          "VN",
          "Không",
          1,
        ],
        [
          "Trần Thị B",
          "Nữ",
          "22/07/2009",
          "CLB TP.HCM",
          categoryName,
          55.0,
          "VN",
          "Không",
          2,
        ],
        ["Lê Văn C", "Nam", "10/01/2008", "CLB Đà Nẵng", categoryName, 60.0, "VN", "Có", ""],
        [
          "Phạm Thị D",
          "Nữ",
          "05/11/2009",
          "CLB Hải Phòng",
          categoryName,
          52.3,
          "VN",
          "Không",
          "",
        ],
      ]
    : [
        headers,
        [
          "Nguyễn Văn A",
          "Nam",
          "15/03/2008",
          "CLB Hà Nội",
          categoryName,
          "",
          "VN",
          "Không",
          1,
        ],
        ["Trần Thị B", "Nữ", "22/07/2009", "CLB TP.HCM", categoryName, "", "VN", "Không", 2],
        ["Lê Văn C", "Nam", "10/01/2008", "CLB Đà Nẵng", categoryName, "", "VN", "Có", ""],
        [
          "Phạm Thị D",
          "Nữ",
          "05/11/2009",
          "CLB Hải Phòng",
          categoryName,
          "",
          "VN",
          "Không",
          "",
        ],
      ];

  const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const colWidths = [
    { wch: 25 },
    { wch: 10 },
    { wch: 18 },
    { wch: 20 },
    { wch: 25 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 10 },
  ];
  worksheet["!cols"] = colWidths;

  const fileName = isKumite ? "mau_nhap_vdv_kumite.xlsx" : "mau_nhap_vdv.xlsx";
  XLSX.writeFile(workbook, fileName);
}

/**
 * Parse Categories from Excel file
 * Expected Columns:
 * - Tên hạng mục (Name)
 * - Nội dung: Kata / Kumite
 * - Hình thức: Cá nhân / Đồng đội
 * - Giới tính: Nam / Nữ / Hỗn hợp
 * - Lứa tuổi (Age Group)
 * - Hạng cân (Weight Class - for Kumite only)
 */
export function parseCategoriesExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", codepage: 65001 });

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Skip header row
        const startRow = isCategoryHeaderRow(jsonData[0]) ? 1 : 0;

        const categories = [];
        const errors = [];

        for (let i = startRow; i < jsonData.length; i++) {
          const row = jsonData[i];

          // Skip empty rows
          if (!row || !row[0]) continue;

          const name = String(row[0] || "").trim();
          const typeRaw = String(row[1] || "")
            .trim()
            .toLowerCase();
          const formatRaw = String(row[2] || "")
            .trim()
            .toLowerCase();
          const genderRaw = String(row[3] || "")
            .trim()
            .toLowerCase();
          const ageGroup = String(row[4] || "").trim();
          const weightClass = String(row[5] || "").trim();

          if (!name) {
            errors.push(`Dòng ${i + 1}: Thiếu tên hạng mục`);
            continue;
          }

          // Parse type
          let type = "kumite";
          if (typeRaw.includes("kata") || typeRaw.includes("quy")) {
            type = "kata";
          }

          // Parse format (individual/team)
          let isTeam = false;
          if (
            formatRaw.includes("đội") ||
            formatRaw.includes("team") ||
            formatRaw.includes("dong")
          ) {
            isTeam = true;
          }

          // Parse gender
          let gender = "male";
          if (
            genderRaw.includes("nữ") ||
            genderRaw.includes("nu") ||
            genderRaw.includes("female")
          ) {
            gender = "female";
          } else if (
            genderRaw.includes("hỗn") ||
            genderRaw.includes("hon") ||
            genderRaw.includes("mix")
          ) {
            gender = "mixed";
          }

          categories.push({
            name,
            type,
            isTeam,
            gender,
            ageGroup,
            weightClass: type === "kumite" ? weightClass : "",
            format: "single_elimination",
          });
        }

        resolve({ categories, errors });
      } catch (error) {
        reject(new Error("Không thể đọc file Excel: " + error.message));
      }
    };

    reader.onerror = () => {
      reject(new Error("Lỗi khi đọc file"));
    };

    reader.readAsArrayBuffer(file);
  });
}

function isCategoryHeaderRow(row) {
  if (!row || !row[0]) return false;
  const firstCell = String(row[0]).toLowerCase();
  return (
    firstCell.includes("tên") ||
    firstCell.includes("hạng") ||
    firstCell.includes("name") ||
    firstCell.includes("stt")
  );
}

/**
 * Generate template Excel for Categories import
 */
export function generateCategoriesTemplate() {
  const data = [
    [
      "Tên hạng mục",
      "Nội dung",
      "Hình thức",
      "Giới tính",
      "Lứa tuổi",
      "Hạng cân",
    ],
    // KATA cá nhân
    ["Kata cá nhân Nam (6-8 tuổi)", "Kata", "Cá nhân", "Nam", "6-8 tuổi", ""],
    ["Kata cá nhân Nữ (6-8 tuổi)", "Kata", "Cá nhân", "Nữ", "6-8 tuổi", ""],
    ["Kata cá nhân Nam (9-11 tuổi)", "Kata", "Cá nhân", "Nam", "9-11 tuổi", ""],
    ["Kata cá nhân Nữ (9-11 tuổi)", "Kata", "Cá nhân", "Nữ", "9-11 tuổi", ""],
    [
      "Kata cá nhân Nam (12-14 tuổi)",
      "Kata",
      "Cá nhân",
      "Nam",
      "12-14 tuổi",
      "",
    ],
    ["Kata cá nhân Nữ (12-14 tuổi)", "Kata", "Cá nhân", "Nữ", "12-14 tuổi", ""],
    [
      "Kata cá nhân Nam (15-17 tuổi)",
      "Kata",
      "Cá nhân",
      "Nam",
      "15-17 tuổi",
      "",
    ],
    ["Kata cá nhân Nữ (15-17 tuổi)", "Kata", "Cá nhân", "Nữ", "15-17 tuổi", ""],
    [
      "Kata cá nhân Nam (18 tuổi trở lên)",
      "Kata",
      "Cá nhân",
      "Nam",
      "18+ tuổi",
      "",
    ],
    [
      "Kata cá nhân Nữ (18 tuổi trở lên)",
      "Kata",
      "Cá nhân",
      "Nữ",
      "18+ tuổi",
      "",
    ],
    // KATA đồng đội (có lứa tuổi)
    [
      "Kata đồng đội Nam (12-14 tuổi)",
      "Kata",
      "Đồng đội",
      "Nam",
      "12-14 tuổi",
      "",
    ],
    [
      "Kata đồng đội Nữ (12-14 tuổi)",
      "Kata",
      "Đồng đội",
      "Nữ",
      "12-14 tuổi",
      "",
    ],
    [
      "Kata đồng đội Nam (15-17 tuổi)",
      "Kata",
      "Đồng đội",
      "Nam",
      "15-17 tuổi",
      "",
    ],
    [
      "Kata đồng đội Nữ (15-17 tuổi)",
      "Kata",
      "Đồng đội",
      "Nữ",
      "15-17 tuổi",
      "",
    ],
    ["Kata đồng đội Nam (18+ tuổi)", "Kata", "Đồng đội", "Nam", "18+ tuổi", ""],
    ["Kata đồng đội Nữ (18+ tuổi)", "Kata", "Đồng đội", "Nữ", "18+ tuổi", ""],
    [
      "Kata đồng đội Hỗn hợp (18+ tuổi)",
      "Kata",
      "Đồng đội",
      "Hỗn hợp",
      "18+ tuổi",
      "",
    ],
    // KUMITE cá nhân Nam
    [
      "Kumite Nam (12-14 tuổi) -40kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "12-14 tuổi",
      "-40kg",
    ],
    [
      "Kumite Nam (12-14 tuổi) -45kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "12-14 tuổi",
      "-45kg",
    ],
    [
      "Kumite Nam (12-14 tuổi) +45kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "12-14 tuổi",
      "+45kg",
    ],
    [
      "Kumite Nam (15-17 tuổi) -52kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "15-17 tuổi",
      "-52kg",
    ],
    [
      "Kumite Nam (15-17 tuổi) -57kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "15-17 tuổi",
      "-57kg",
    ],
    [
      "Kumite Nam (15-17 tuổi) -63kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "15-17 tuổi",
      "-63kg",
    ],
    [
      "Kumite Nam (15-17 tuổi) -70kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "15-17 tuổi",
      "-70kg",
    ],
    [
      "Kumite Nam (15-17 tuổi) +70kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "15-17 tuổi",
      "+70kg",
    ],
    [
      "Kumite Nam (18+ tuổi) -60kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "18+ tuổi",
      "-60kg",
    ],
    [
      "Kumite Nam (18+ tuổi) -67kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "18+ tuổi",
      "-67kg",
    ],
    [
      "Kumite Nam (18+ tuổi) -75kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "18+ tuổi",
      "-75kg",
    ],
    [
      "Kumite Nam (18+ tuổi) -84kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "18+ tuổi",
      "-84kg",
    ],
    [
      "Kumite Nam (18+ tuổi) +84kg",
      "Kumite",
      "Cá nhân",
      "Nam",
      "18+ tuổi",
      "+84kg",
    ],
    // KUMITE cá nhân Nữ
    [
      "Kumite Nữ (12-14 tuổi) -40kg",
      "Kumite",
      "Cá nhân",
      "Nữ",
      "12-14 tuổi",
      "-40kg",
    ],
    [
      "Kumite Nữ (15-17 tuổi) -48kg",
      "Kumite",
      "Cá nhân",
      "Nữ",
      "15-17 tuổi",
      "-48kg",
    ],
    [
      "Kumite Nữ (15-17 tuổi) -53kg",
      "Kumite",
      "Cá nhân",
      "Nữ",
      "15-17 tuổi",
      "-53kg",
    ],
    [
      "Kumite Nữ (15-17 tuổi) -59kg",
      "Kumite",
      "Cá nhân",
      "Nữ",
      "15-17 tuổi",
      "-59kg",
    ],
    [
      "Kumite Nữ (15-17 tuổi) +59kg",
      "Kumite",
      "Cá nhân",
      "Nữ",
      "15-17 tuổi",
      "+59kg",
    ],
    [
      "Kumite Nữ (18+ tuổi) -50kg",
      "Kumite",
      "Cá nhân",
      "Nữ",
      "18+ tuổi",
      "-50kg",
    ],
    [
      "Kumite Nữ (18+ tuổi) -55kg",
      "Kumite",
      "Cá nhân",
      "Nữ",
      "18+ tuổi",
      "-55kg",
    ],
    [
      "Kumite Nữ (18+ tuổi) -61kg",
      "Kumite",
      "Cá nhân",
      "Nữ",
      "18+ tuổi",
      "-61kg",
    ],
    [
      "Kumite Nữ (18+ tuổi) -68kg",
      "Kumite",
      "Cá nhân",
      "Nữ",
      "18+ tuổi",
      "-68kg",
    ],
    [
      "Kumite Nữ (18+ tuổi) +68kg",
      "Kumite",
      "Cá nhân",
      "Nữ",
      "18+ tuổi",
      "+68kg",
    ],
    // KUMITE đồng đội (có lứa tuổi)
    [
      "Kumite đồng đội Nam (12-14 tuổi)",
      "Kumite",
      "Đồng đội",
      "Nam",
      "12-14 tuổi",
      "",
    ],
    [
      "Kumite đồng đội Nữ (12-14 tuổi)",
      "Kumite",
      "Đồng đội",
      "Nữ",
      "12-14 tuổi",
      "",
    ],
    [
      "Kumite đồng đội Nam (15-17 tuổi)",
      "Kumite",
      "Đồng đội",
      "Nam",
      "15-17 tuổi",
      "",
    ],
    [
      "Kumite đồng đội Nữ (15-17 tuổi)",
      "Kumite",
      "Đồng đội",
      "Nữ",
      "15-17 tuổi",
      "",
    ],
    [
      "Kumite đồng đội Nam (18+ tuổi)",
      "Kumite",
      "Đồng đội",
      "Nam",
      "18+ tuổi",
      "",
    ],
    [
      "Kumite đồng đội Nữ (18+ tuổi)",
      "Kumite",
      "Đồng đội",
      "Nữ",
      "18+ tuổi",
      "",
    ],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Mẫu hạng mục");

  // Column widths
  worksheet["!cols"] = [
    { wch: 35 }, // Tên
    { wch: 12 }, // Nội dung
    { wch: 12 }, // Hình thức
    { wch: 12 }, // Giới tính
    { wch: 15 }, // Lứa tuổi
    { wch: 12 }, // Hạng cân
  ];

  XLSX.writeFile(workbook, "mau_hang_muc.xlsx");
}
