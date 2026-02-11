/**
 * KRT File Service
 * Xử lý đọc/ghi file .krt (định dạng JSON encoded Base64)
 */

const KRT_VERSION = '1.0.0';
const APP_VERSION = '1.0.0';

/**
 * Schema mẫu cho file .krt
 */
const KRT_SCHEMA = {
  version: KRT_VERSION,
  tournamentId: '',
  tournamentName: '',
  events: [],
  startTime: '',
  endTime: '',
  timezone: 'Asia/Ho_Chi_Minh',
  appVersion: APP_VERSION,
  createdAt: ''
};

/**
 * Encode dữ liệu thành Base64 (ngăn chặn chỉnh sửa trực tiếp)
 */
function encodeKrt(data) {
  const jsonString = JSON.stringify(data, null, 2);
  // Thêm signature để verify file hợp lệ
  const withSignature = {
    _signature: 'KRT_KARATE_TOURNAMENT',
    _version: KRT_VERSION,
    data
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(withSignature))));
}

/**
 * Decode dữ liệu từ Base64
 */
function decodeKrt(encodedString) {
  try {
    const decoded = JSON.parse(decodeURIComponent(escape(atob(encodedString))));
    
    // Verify signature
    if (decoded._signature !== 'KRT_KARATE_TOURNAMENT') {
      throw new Error('Invalid KRT file signature');
    }
    
    return {
      success: true,
      data: decoded.data,
      version: decoded._version
    };
  } catch (error) {
    return {
      success: false,
      error: 'File .krt không hợp lệ hoặc đã bị sửa đổi'
    };
  }
}

/**
 * Tạo dữ liệu file .krt mới
 */
export function createKrtData(tournament) {
  const data = {
    version: KRT_VERSION,
    tournamentId: tournament.id || crypto.randomUUID(),
    tournamentName: tournament.name,
    events: tournament.events || [],
    startTime: tournament.startTime,
    endTime: tournament.endTime,
    timezone: tournament.timezone || 'Asia/Ho_Chi_Minh',
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString()
  };
  
  return data;
}

/**
 * Encode dữ liệu tournament thành nội dung file .krt
 */
export function encodeKrtFile(tournamentData) {
  return encodeKrt(tournamentData);
}

/**
 * Decode nội dung file .krt thành dữ liệu tournament
 */
export function decodeKrtFile(fileContent) {
  return decodeKrt(fileContent);
}

/**
 * Validate dữ liệu tournament
 */
export function validateKrtData(data) {
  const errors = [];
  
  if (!data.tournamentId) {
    errors.push('Thiếu Tournament ID');
  }
  
  if (!data.tournamentName) {
    errors.push('Thiếu tên giải đấu');
  }
  
  if (!data.startTime) {
    errors.push('Thiếu thời gian bắt đầu');
  }
  
  if (!data.endTime) {
    errors.push('Thiếu thời gian kết thúc');
  }
  
  if (data.startTime && data.endTime) {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    if (start >= end) {
      errors.push('Thời gian kết thúc phải sau thời gian bắt đầu');
    }
  }
  
  if (!data.events || data.events.length === 0) {
    errors.push('Cần ít nhất một nội dung thi đấu');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate dữ liệu VĐV theo nội dung thi đấu
 */
export function validateAthlete(athlete, event) {
  const errors = [];
  
  if (!athlete.name || athlete.name.trim() === '') {
    errors.push('Họ tên không được để trống');
  }
  
  if (!athlete.birthYear) {
    errors.push('Năm sinh không được để trống');
  } else {
    const currentYear = new Date().getFullYear();
    const age = currentYear - athlete.birthYear;
    
    if (athlete.birthYear < 1900 || athlete.birthYear > currentYear) {
      errors.push('Năm sinh không hợp lệ');
    }
    
    // Kiểm tra tuổi nếu event có quy định
    if (event.minAge && age < event.minAge) {
      errors.push(`VĐV phải từ ${event.minAge} tuổi trở lên`);
    }
    if (event.maxAge && age > event.maxAge) {
      errors.push(`VĐV phải dưới ${event.maxAge} tuổi`);
    }
  }
  
  if (!athlete.gender) {
    errors.push('Giới tính không được để trống');
  } else if (event.gender && event.gender !== 'any' && athlete.gender !== event.gender) {
    errors.push(`Nội dung này chỉ dành cho ${event.gender === 'male' ? 'Nam' : 'Nữ'}`);
  }
  
  if (!athlete.club || athlete.club.trim() === '') {
    errors.push('Tên CLB không được để trống');
  }
  
  if (!athlete.eventId) {
    errors.push('Chưa chọn nội dung thi đấu');
  }
  
  // Kiểm tra cân nặng nếu event có quy định
  if (event.weightMin !== undefined || event.weightMax !== undefined) {
    if (!athlete.weight) {
      errors.push('Cân nặng không được để trống cho nội dung này');
    } else {
      if (event.weightMin !== undefined && athlete.weight < event.weightMin) {
        errors.push(`Cân nặng phải từ ${event.weightMin}kg trở lên`);
      }
      if (event.weightMax !== undefined && athlete.weight > event.weightMax) {
        errors.push(`Cân nặng phải dưới ${event.weightMax}kg`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Lưu file .krt bằng Electron dialog
 */
export async function saveKrtFile(tournamentData, suggestedName) {
  const content = encodeKrtFile(tournamentData);
  
  // Kiểm tra có đang chạy trong Electron không
  if (window.electronAPI?.saveKrtFile) {
    return await window.electronAPI.saveKrtFile(content, suggestedName);
  }
  
  // Fallback: Download qua browser
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName || 'tournament.krt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  return { success: true };
}

/**
 * Mở file .krt bằng Electron dialog
 */
export async function openKrtFile() {
  // Kiểm tra có đang chạy trong Electron không
  if (window.electronAPI?.openKrtFile) {
    const result = await window.electronAPI.openKrtFile();
    if (result.success && result.content) {
      return decodeKrtFile(result.content);
    }
    return result;
  }
  
  // Fallback: Input file trong browser
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.krt';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) {
        resolve({ success: false, error: 'Không có file được chọn' });
        return;
      }
      
      try {
        const content = await file.text();
        resolve(decodeKrtFile(content));
      } catch (error) {
        resolve({ success: false, error: 'Không thể đọc file' });
      }
    };
    
    input.click();
  });
}

export default {
  createKrtData,
  encodeKrtFile,
  decodeKrtFile,
  validateKrtData,
  validateAthlete,
  saveKrtFile,
  openKrtFile
};
