/**
 * Coach Export Service
 * Xuất file JSON/Excel cho HLV gửi Admin
 */
import * as XLSX from 'xlsx';

/**
 * Xuất dữ liệu VĐV ra file JSON
 */
export async function exportToJson(data) {
  const jsonContent = JSON.stringify(data, null, 2);
  const suggestedName = `VDV_${data.coachName || 'HLV'}_${formatDate(new Date())}.json`;
  
  // Kiểm tra Electron API
  if (window.electronAPI?.saveExportFile) {
    return await window.electronAPI.saveExportFile(jsonContent, suggestedName, 'json');
  }
  
  // Fallback browser download
  const blob = new Blob([jsonContent], { type: 'application/json' });
  downloadBlob(blob, suggestedName);
  return { success: true };
}

/**
 * Xuất dữ liệu VĐV ra file Excel
 */
export async function exportToExcel(data) {
  // Tạo workbook
  const wb = XLSX.utils.book_new();
  
  // Sheet 1: Thông tin chung
  const infoData = [
    ['DANH SÁCH VĐV'],
    [''],
    ['Mã giải đấu:', data.tournamentId],
    ['Tên giải đấu:', data.tournamentName],
    ['HLV / CLB:', data.coachName],
    ['Thời gian xuất:', new Date(data.exportTime).toLocaleString('vi-VN')],
    ['Số VĐV:', data.athletes.length],
    ['']
  ];
  
  const infoSheet = XLSX.utils.aoa_to_sheet(infoData);
  XLSX.utils.book_append_sheet(wb, infoSheet, 'Thông tin');
  
  // Sheet 2: Danh sách VĐV
  const athleteHeaders = ['STT', 'Họ tên', 'Năm sinh', 'Giới tính', 'CLB', 'Nội dung', 'Cân nặng (kg)'];
  const athleteRows = data.athletes.map((a, i) => [
    i + 1,
    a.name,
    a.birthYear,
    a.gender === 'male' ? 'Nam' : 'Nữ',
    a.club,
    a.eventName,
    a.weight || ''
  ]);
  
  const athleteData = [athleteHeaders, ...athleteRows];
  const athleteSheet = XLSX.utils.aoa_to_sheet(athleteData);
  
  // Set column widths
  athleteSheet['!cols'] = [
    { wch: 5 },   // STT
    { wch: 25 },  // Họ tên
    { wch: 10 },  // Năm sinh
    { wch: 10 },  // Giới tính
    { wch: 25 },  // CLB
    { wch: 20 },  // Nội dung
    { wch: 12 }   // Cân nặng
  ];
  
  XLSX.utils.book_append_sheet(wb, athleteSheet, 'Danh sách VĐV');
  
  // Sheet 3: Dữ liệu JSON (để Admin import)
  const jsonSheet = XLSX.utils.aoa_to_sheet([
    ['JSON_DATA'],
    [JSON.stringify(data)]
  ]);
  XLSX.utils.book_append_sheet(wb, jsonSheet, 'Data');
  
  // Xuất file
  const suggestedName = `VDV_${data.coachName || 'HLV'}_${formatDate(new Date())}.xlsx`;
  
  // Kiểm tra Electron API
  if (window.electronAPI?.saveExportFile) {
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return await window.electronAPI.saveExportFile(
      Array.from(new Uint8Array(buffer)), 
      suggestedName, 
      'xlsx'
    );
  }
  
  // Fallback browser download
  XLSX.writeFile(wb, suggestedName);
  return { success: true };
}

/**
 * Hàm chính để xuất file
 */
export async function exportCoachData(data, format = 'json') {
  if (format === 'json') {
    return await exportToJson(data);
  } else {
    return await exportToExcel(data);
  }
}

/**
 * Định dạng ngày tháng
 */
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}`;
}

/**
 * Tải file trong browser
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default {
  exportToJson,
  exportToExcel,
  exportCoachData
};
