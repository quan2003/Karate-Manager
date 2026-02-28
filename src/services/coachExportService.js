/**
 * Coach Export Service
 * Xuất file Excel cho HLV gửi Admin
 */
import * as XLSX from "xlsx";

/**
 * Xuất dữ liệu VĐV ra file Excel
 */
export async function exportToExcel(data) {
  // Tạo workbook
  const wb = XLSX.utils.book_new();

  // Sheet 1: Thông tin chung
  const infoData = [
    ["DANH SÁCH VĐV"],
    [""],
    ["Mã giải đấu:", data.tournamentId],
    ["Tên giải đấu:", data.tournamentName],
    ["Tên HLV:", data.coachName],
    ["Tên CLB:", data.clubName || ""],
    ["Thời gian xuất:", new Date(data.exportTime).toLocaleString("vi-VN")],
    ["Số VĐV:", data.athletes.length],
    [""],
  ];

  const infoSheet = XLSX.utils.aoa_to_sheet(infoData);
  XLSX.utils.book_append_sheet(wb, infoSheet, "Thông tin");

  // Sheet 2: Danh sách VĐV
  const athleteHeaders = [
    "STT",
    "Họ tên",
    "Ngày sinh",
    "Giới tính",
    "CLB",
    "Nội dung",
    "Cân nặng (kg)",
    "Hạt giống",
    "Đồng đội",
  ];
  const athleteRows = data.athletes.map((a, i) => {
    let birthDisplay = "";
    if (a.birthDate) {
      const [y, m, d] = a.birthDate.split("-");
      birthDisplay = `${d}/${m}/${y}`;
    } else if (a.birthYear) {
      birthDisplay = String(a.birthYear);
    }
    return [
      i + 1,
      a.name,
      birthDisplay,
      a.gender === "male" ? "Nam" : "Nữ",
      a.club || data.clubName || "",
      a.eventName,
      a.weight || "",
      a.seed || "",
      a.isTeam ? "Có" : "Không",
    ];
  });

  const athleteData = [athleteHeaders, ...athleteRows];
  const athleteSheet = XLSX.utils.aoa_to_sheet(athleteData);

  // Set column widths
  athleteSheet["!cols"] = [
    { wch: 5 }, // STT
    { wch: 25 }, // Họ tên
    { wch: 12 }, // Ngày sinh
    { wch: 10 }, // Giới tính
    { wch: 25 }, // CLB
    { wch: 30 }, // Nội dung
    { wch: 12 }, // Cân nặng
    { wch: 10 }, // Hạt giống
    { wch: 10 }, // Đồng đội
  ];

  XLSX.utils.book_append_sheet(wb, athleteSheet, "Danh sách VĐV");

  // Sheet 3: Dữ liệu JSON (để Admin import)
  const jsonSheet = XLSX.utils.aoa_to_sheet([
    ["JSON_DATA"],
    [JSON.stringify(data)],
  ]);
  XLSX.utils.book_append_sheet(wb, jsonSheet, "Data");

  // Xuất file
  const suggestedName = `VDV_${
    data.clubName || data.coachName || "HLV"
  }_${formatDate(new Date())}.xlsx`;

  // Kiểm tra Electron API
  if (window.electronAPI?.saveExportFile) {
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return await window.electronAPI.saveExportFile(
      Array.from(new Uint8Array(buffer)),
      suggestedName,
      "xlsx"
    );
  }

  // Fallback browser download
  XLSX.writeFile(wb, suggestedName);
  return { success: true };
}

/**
 * Hàm chính để xuất file
 */
export async function exportCoachData(data, format = "excel") {
  return await exportToExcel(data);
}

/**
 * Định dạng ngày tháng
 */
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}`;
}

export default {
  exportToExcel,
  exportCoachData,
};
