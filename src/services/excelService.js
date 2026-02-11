import * as XLSX from 'xlsx';

/**
 * Excel Import/Export Service for Athletes
 * Expected format:
 * Column A: Tên VĐV (Name)
 * Column B: Đơn vị/CLB (Club)
 * Column C: Quốc gia (Country - optional, default: VN)
 * Column D: Hạt giống (Seed - optional, 1-8)
 */

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', codepage: 65001 });
        
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
          
          const name = String(row[0] || '').trim();
          const club = String(row[1] || '').trim();
          const country = String(row[2] || 'VN').trim().toUpperCase();
          const seed = parseInt(row[3]) || null;
          
          if (!name) {
            errors.push(`Dòng ${i + 1}: Thiếu tên VĐV`);
            continue;
          }
          
          if (seed !== null && (seed < 1 || seed > 8)) {
            errors.push(`Dòng ${i + 1}: Hạt giống phải từ 1-8`);
          }
          
          athletes.push({
            name,
            club,
            country,
            seed: seed && seed >= 1 && seed <= 8 ? seed : null,
          });
        }
        
        resolve({ athletes, errors });
      } catch (error) {
        reject(new Error('Không thể đọc file Excel: ' + error.message));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Lỗi khi đọc file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

function isHeaderRow(row) {
  if (!row || !row[0]) return false;
  const firstCell = String(row[0]).toLowerCase();
  return firstCell.includes('tên') || 
         firstCell.includes('name') || 
         firstCell.includes('vđv') ||
         firstCell.includes('stt');
}

export function exportAthletesToExcel(athletes, filename = 'danh_sach_vdv.xlsx') {
  const data = [
    ['Tên VĐV', 'Đơn vị/CLB', 'Quốc gia', 'Hạt giống'],
    ...athletes.map(a => [a.name, a.club, a.country || 'VN', a.seed || ''])
  ];
  
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách VĐV');
  
  // Auto-size columns
  const colWidths = [
    { wch: 25 }, // Name
    { wch: 20 }, // Club
    { wch: 10 }, // Country
    { wch: 10 }, // Seed
  ];
  worksheet['!cols'] = colWidths;
  
  XLSX.writeFile(workbook, filename);
}

export function generateTemplateExcel() {
  const data = [
    ['Tên VĐV', 'Đơn vị/CLB', 'Quốc gia', 'Hạt giống'],
    ['Nguyễn Văn A', 'CLB Hà Nội', 'VN', 1],
    ['Trần Thị B', 'CLB TP.HCM', 'VN', 2],
    ['Lê Văn C', 'CLB Đà Nẵng', 'VN', ''],
    ['Phạm Thị D', 'CLB Hải Phòng', 'VN', ''],
  ];
  
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Mẫu nhập VĐV');
  
  const colWidths = [
    { wch: 25 },
    { wch: 20 },
    { wch: 10 },
    { wch: 10 },
  ];
  worksheet['!cols'] = colWidths;
  
  XLSX.writeFile(workbook, 'mau_nhap_vdv.xlsx');
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
        const workbook = XLSX.read(data, { type: 'array', codepage: 65001 });
        
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
          
          const name = String(row[0] || '').trim();
          const typeRaw = String(row[1] || '').trim().toLowerCase();
          const formatRaw = String(row[2] || '').trim().toLowerCase();
          const genderRaw = String(row[3] || '').trim().toLowerCase();
          const ageGroup = String(row[4] || '').trim();
          const weightClass = String(row[5] || '').trim();
          
          if (!name) {
            errors.push(`Dòng ${i + 1}: Thiếu tên hạng mục`);
            continue;
          }
          
          // Parse type
          let type = 'kumite';
          if (typeRaw.includes('kata') || typeRaw.includes('quy')) {
            type = 'kata';
          }
          
          // Parse format (individual/team)
          let isTeam = false;
          if (formatRaw.includes('đội') || formatRaw.includes('team') || formatRaw.includes('dong')) {
            isTeam = true;
          }
          
          // Parse gender
          let gender = 'male';
          if (genderRaw.includes('nữ') || genderRaw.includes('nu') || genderRaw.includes('female')) {
            gender = 'female';
          } else if (genderRaw.includes('hỗn') || genderRaw.includes('hon') || genderRaw.includes('mix')) {
            gender = 'mixed';
          }
          
          categories.push({
            name,
            type,
            isTeam,
            gender,
            ageGroup,
            weightClass: type === 'kumite' ? weightClass : '',
            format: 'single_elimination'
          });
        }
        
        resolve({ categories, errors });
      } catch (error) {
        reject(new Error('Không thể đọc file Excel: ' + error.message));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Lỗi khi đọc file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

function isCategoryHeaderRow(row) {
  if (!row || !row[0]) return false;
  const firstCell = String(row[0]).toLowerCase();
  return firstCell.includes('tên') || 
         firstCell.includes('hạng') || 
         firstCell.includes('name') ||
         firstCell.includes('stt');
}

/**
 * Generate template Excel for Categories import
 */
export function generateCategoriesTemplate() {
  const data = [
    ['Tên hạng mục', 'Nội dung', 'Hình thức', 'Giới tính', 'Lứa tuổi', 'Hạng cân'],
    // KATA cá nhân
    ['Kata cá nhân Nam (6-8 tuổi)', 'Kata', 'Cá nhân', 'Nam', '6-8 tuổi', ''],
    ['Kata cá nhân Nữ (6-8 tuổi)', 'Kata', 'Cá nhân', 'Nữ', '6-8 tuổi', ''],
    ['Kata cá nhân Nam (9-11 tuổi)', 'Kata', 'Cá nhân', 'Nam', '9-11 tuổi', ''],
    ['Kata cá nhân Nữ (9-11 tuổi)', 'Kata', 'Cá nhân', 'Nữ', '9-11 tuổi', ''],
    ['Kata cá nhân Nam (12-14 tuổi)', 'Kata', 'Cá nhân', 'Nam', '12-14 tuổi', ''],
    ['Kata cá nhân Nữ (12-14 tuổi)', 'Kata', 'Cá nhân', 'Nữ', '12-14 tuổi', ''],
    ['Kata cá nhân Nam (15-17 tuổi)', 'Kata', 'Cá nhân', 'Nam', '15-17 tuổi', ''],
    ['Kata cá nhân Nữ (15-17 tuổi)', 'Kata', 'Cá nhân', 'Nữ', '15-17 tuổi', ''],
    ['Kata cá nhân Nam (18 tuổi trở lên)', 'Kata', 'Cá nhân', 'Nam', '18+ tuổi', ''],
    ['Kata cá nhân Nữ (18 tuổi trở lên)', 'Kata', 'Cá nhân', 'Nữ', '18+ tuổi', ''],
    // KATA đồng đội (có lứa tuổi)
    ['Kata đồng đội Nam (12-14 tuổi)', 'Kata', 'Đồng đội', 'Nam', '12-14 tuổi', ''],
    ['Kata đồng đội Nữ (12-14 tuổi)', 'Kata', 'Đồng đội', 'Nữ', '12-14 tuổi', ''],
    ['Kata đồng đội Nam (15-17 tuổi)', 'Kata', 'Đồng đội', 'Nam', '15-17 tuổi', ''],
    ['Kata đồng đội Nữ (15-17 tuổi)', 'Kata', 'Đồng đội', 'Nữ', '15-17 tuổi', ''],
    ['Kata đồng đội Nam (18+ tuổi)', 'Kata', 'Đồng đội', 'Nam', '18+ tuổi', ''],
    ['Kata đồng đội Nữ (18+ tuổi)', 'Kata', 'Đồng đội', 'Nữ', '18+ tuổi', ''],
    ['Kata đồng đội Hỗn hợp (18+ tuổi)', 'Kata', 'Đồng đội', 'Hỗn hợp', '18+ tuổi', ''],
    // KUMITE cá nhân Nam
    ['Kumite Nam (12-14 tuổi) -40kg', 'Kumite', 'Cá nhân', 'Nam', '12-14 tuổi', '-40kg'],
    ['Kumite Nam (12-14 tuổi) -45kg', 'Kumite', 'Cá nhân', 'Nam', '12-14 tuổi', '-45kg'],
    ['Kumite Nam (12-14 tuổi) +45kg', 'Kumite', 'Cá nhân', 'Nam', '12-14 tuổi', '+45kg'],
    ['Kumite Nam (15-17 tuổi) -52kg', 'Kumite', 'Cá nhân', 'Nam', '15-17 tuổi', '-52kg'],
    ['Kumite Nam (15-17 tuổi) -57kg', 'Kumite', 'Cá nhân', 'Nam', '15-17 tuổi', '-57kg'],
    ['Kumite Nam (15-17 tuổi) -63kg', 'Kumite', 'Cá nhân', 'Nam', '15-17 tuổi', '-63kg'],
    ['Kumite Nam (15-17 tuổi) -70kg', 'Kumite', 'Cá nhân', 'Nam', '15-17 tuổi', '-70kg'],
    ['Kumite Nam (15-17 tuổi) +70kg', 'Kumite', 'Cá nhân', 'Nam', '15-17 tuổi', '+70kg'],
    ['Kumite Nam (18+ tuổi) -60kg', 'Kumite', 'Cá nhân', 'Nam', '18+ tuổi', '-60kg'],
    ['Kumite Nam (18+ tuổi) -67kg', 'Kumite', 'Cá nhân', 'Nam', '18+ tuổi', '-67kg'],
    ['Kumite Nam (18+ tuổi) -75kg', 'Kumite', 'Cá nhân', 'Nam', '18+ tuổi', '-75kg'],
    ['Kumite Nam (18+ tuổi) -84kg', 'Kumite', 'Cá nhân', 'Nam', '18+ tuổi', '-84kg'],
    ['Kumite Nam (18+ tuổi) +84kg', 'Kumite', 'Cá nhân', 'Nam', '18+ tuổi', '+84kg'],
    // KUMITE cá nhân Nữ
    ['Kumite Nữ (12-14 tuổi) -40kg', 'Kumite', 'Cá nhân', 'Nữ', '12-14 tuổi', '-40kg'],
    ['Kumite Nữ (15-17 tuổi) -48kg', 'Kumite', 'Cá nhân', 'Nữ', '15-17 tuổi', '-48kg'],
    ['Kumite Nữ (15-17 tuổi) -53kg', 'Kumite', 'Cá nhân', 'Nữ', '15-17 tuổi', '-53kg'],
    ['Kumite Nữ (15-17 tuổi) -59kg', 'Kumite', 'Cá nhân', 'Nữ', '15-17 tuổi', '-59kg'],
    ['Kumite Nữ (15-17 tuổi) +59kg', 'Kumite', 'Cá nhân', 'Nữ', '15-17 tuổi', '+59kg'],
    ['Kumite Nữ (18+ tuổi) -50kg', 'Kumite', 'Cá nhân', 'Nữ', '18+ tuổi', '-50kg'],
    ['Kumite Nữ (18+ tuổi) -55kg', 'Kumite', 'Cá nhân', 'Nữ', '18+ tuổi', '-55kg'],
    ['Kumite Nữ (18+ tuổi) -61kg', 'Kumite', 'Cá nhân', 'Nữ', '18+ tuổi', '-61kg'],
    ['Kumite Nữ (18+ tuổi) -68kg', 'Kumite', 'Cá nhân', 'Nữ', '18+ tuổi', '-68kg'],
    ['Kumite Nữ (18+ tuổi) +68kg', 'Kumite', 'Cá nhân', 'Nữ', '18+ tuổi', '+68kg'],
    // KUMITE đồng đội (có lứa tuổi)
    ['Kumite đồng đội Nam (12-14 tuổi)', 'Kumite', 'Đồng đội', 'Nam', '12-14 tuổi', ''],
    ['Kumite đồng đội Nữ (12-14 tuổi)', 'Kumite', 'Đồng đội', 'Nữ', '12-14 tuổi', ''],
    ['Kumite đồng đội Nam (15-17 tuổi)', 'Kumite', 'Đồng đội', 'Nam', '15-17 tuổi', ''],
    ['Kumite đồng đội Nữ (15-17 tuổi)', 'Kumite', 'Đồng đội', 'Nữ', '15-17 tuổi', ''],
    ['Kumite đồng đội Nam (18+ tuổi)', 'Kumite', 'Đồng đội', 'Nam', '18+ tuổi', ''],
    ['Kumite đồng đội Nữ (18+ tuổi)', 'Kumite', 'Đồng đội', 'Nữ', '18+ tuổi', ''],
  ];
  
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Mẫu hạng mục');
  
  // Column widths
  worksheet['!cols'] = [
    { wch: 35 }, // Tên
    { wch: 12 }, // Nội dung
    { wch: 12 }, // Hình thức
    { wch: 12 }, // Giới tính
    { wch: 15 }, // Lứa tuổi
    { wch: 12 }, // Hạng cân
  ];
  
  XLSX.writeFile(workbook, 'mau_hang_muc.xlsx');
}

