/**
 * Admin Import Service
 * Import file từ HLV (JSON/Excel)
 */
import * as XLSX from 'xlsx';

/**
 * Mở và đọc file từ HLV
 */
export async function importCoachFile() {
  // Kiểm tra Electron API
  if (window.electronAPI?.openImportFile) {
    const result = await window.electronAPI.openImportFile();
    
    if (!result.success) {
      return result;
    }
    
    if (result.fileType === 'json') {
      return parseJsonFile(result.content);
    } else {
      return parseExcelFile(result.content);
    }
  }
  
  // Browser fallback
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.xlsx';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) {
        resolve({ success: false, canceled: true });
        return;
      }
      
      try {
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (ext === 'json') {
          const content = await file.text();
          resolve(parseJsonFile(content));
        } else {
          const buffer = await file.arrayBuffer();
          resolve(parseExcelFile(buffer));
        }
      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    };
    
    input.click();
  });
}

/**
 * Parse file JSON từ HLV
 */
function parseJsonFile(content) {
  try {
    const data = JSON.parse(content);
    
    // Validate required fields
    if (!data.tournamentId) {
      return { success: false, error: 'File không có Tournament ID' };
    }
    
    if (!data.coachName) {
      return { success: false, error: 'File không có tên HLV/CLB' };
    }
    
    if (!Array.isArray(data.athletes)) {
      return { success: false, error: 'File không có danh sách VĐV' };
    }
    
    // Check if late submission
    const exportTime = new Date(data.exportTime);
    const isLate = false; // TODO: Compare with tournament endTime
    
    return {
      success: true,
      data,
      isLate,
      fileType: 'json'
    };
  } catch (error) {
    return { success: false, error: 'File JSON không hợp lệ: ' + error.message };
  }
}

/**
 * Parse file Excel từ HLV
 */
function parseExcelFile(content) {
  try {
    // Decode base64 if from Electron
    let data;
    if (typeof content === 'string') {
      const binary = atob(content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      data = bytes.buffer;
    } else {
      data = content;
    }
    
    const workbook = XLSX.read(data, { type: 'array' });
    
    // Try to find Data sheet with JSON
    if (workbook.SheetNames.includes('Data')) {
      const dataSheet = workbook.Sheets['Data'];
      const jsonData = XLSX.utils.sheet_to_json(dataSheet, { header: 1 });
      
      if (jsonData.length >= 2 && jsonData[0][0] === 'JSON_DATA') {
        try {
          const parsedData = JSON.parse(jsonData[1][0]);
          return parseJsonFile(JSON.stringify(parsedData));
        } catch (e) {
          // Continue to manual parsing
        }
      }
    }
    
    // Manual parsing from athlete sheet
    const athleteSheet = workbook.Sheets['Danh sách VĐV'] || workbook.Sheets[workbook.SheetNames[1]];
    if (!athleteSheet) {
      return { success: false, error: 'Không tìm thấy sheet danh sách VĐV' };
    }
    
    const rows = XLSX.utils.sheet_to_json(athleteSheet, { header: 1 });
    
    // Skip header row
    const athletes = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[1]) continue; // Skip empty rows
      
      athletes.push({
        name: row[1],
        birthYear: parseInt(row[2]) || null,
        gender: row[3] === 'Nam' ? 'male' : 'female',
        club: row[4] || '',
        eventName: row[5] || '',
        weight: row[6] ? parseFloat(row[6]) : undefined
      });
    }
    
    // Try to get info from first sheet
    const infoSheet = workbook.Sheets['Thông tin'] || workbook.Sheets[workbook.SheetNames[0]];
    let tournamentId = '';
    let coachName = '';
    let exportTime = new Date().toISOString();
    
    if (infoSheet) {
      const infoRows = XLSX.utils.sheet_to_json(infoSheet, { header: 1 });
      for (const row of infoRows) {
        if (row[0] === 'Mã giải đấu:') tournamentId = row[1];
        if (row[0] === 'HLV / CLB:') coachName = row[1];
        if (row[0] === 'Thời gian xuất:') {
          // Try to parse Vietnamese date format
          exportTime = row[1];
        }
      }
    }
    
    return {
      success: true,
      data: {
        tournamentId,
        coachName,
        exportTime,
        athletes
      },
      isLate: false,
      fileType: 'xlsx'
    };
  } catch (error) {
    return { success: false, error: 'File Excel không hợp lệ: ' + error.message };
  }
}

/**
 * Validate imported athletes against tournament events
 */
export function validateImportedAthletes(athletes, events) {
  const validAthletes = [];
  const errors = [];
  
  athletes.forEach((athlete, index) => {
    const athleteErrors = [];
    
    if (!athlete.name) {
      athleteErrors.push('Thiếu họ tên');
    }
    
    if (!athlete.birthYear) {
      athleteErrors.push('Thiếu năm sinh');
    }
    
    if (!athlete.eventName) {
      athleteErrors.push('Chưa chọn nội dung');
    } else {
      const event = events.find(e => e.name === athlete.eventName);
      if (!event) {
        athleteErrors.push(`Nội dung "${athlete.eventName}" không tồn tại trong giải đấu`);
      }
    }
    
    if (athleteErrors.length > 0) {
      errors.push({
        row: index + 1,
        name: athlete.name || 'Không tên',
        errors: athleteErrors
      });
    } else {
      validAthletes.push(athlete);
    }
  });
  
  return { validAthletes, errors };
}

export default {
  importCoachFile,
  validateImportedAthletes
};
