/**
 * LAN Service - Handles communication between Secretary and Admin
 */

/**
 * Gửi kết quả trận đấu từ Thư ký sang Admin qua mạng LAN
 * @param {string} adminIp - IP của máy Admin
 * @param {number} port - Port của máy Admin (mặc định 3000)
 * @param {Object} matchData - Dữ liệu trận đấu { matchId, winnerId, score1, score2, categoryName, etc. }
 * @returns {Promise<Object>} - { success: boolean, message: string }
 */
async function postLanPayload(adminIp, port, endpoint, payload) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

    // Xử lý nếu user nhập IP kèm port (ví dụ: 192.168.1.10:3000)
    let finalIp = adminIp;
    let finalPort = port;
    if (adminIp.includes(':')) {
      const parts = adminIp.split(':');
      finalIp = parts[0];
      finalPort = parts[1];
    }

    const response = await fetch(`http://${finalIp}:${finalPort}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Lỗi khi gửi kết quả qua LAN:', error);
    if (error.name === 'AbortError') {
      return { success: false, error: 'timeout', message: 'Không tìm thấy máy Admin (hết thời gian chờ 3s)' };
    }
    return { success: false, error: 'connection_error', message: error.message };
  }
}

export async function sendMatchResult(adminIp, port = 3000, matchData) {
  return postLanPayload(adminIp, port, "/api/match-result", matchData);
}

/**
 * Gửi trọn bộ huy chương của một nội dung về máy Admin.
 */
export async function sendCategoryMedals(adminIp, port = 3000, medalData) {
  return postLanPayload(adminIp, port, "/api/category-medals", {
    ...medalData,
    syncType: "category-medals",
  });
}
/**
 * Kiểm tra xem máy Admin có đang online không
 * @param {string} adminIp 
 * @param {number} port 
 * @returns {Promise<boolean>}
 */
export async function checkAdminAvailability(adminIp, port = 3000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    // Xử lý nếu user nhập IP kèm port
    let finalIp = adminIp;
    let finalPort = port;
    if (adminIp.includes(':')) {
      const parts = adminIp.split(':');
      finalIp = parts[0];
      finalPort = parts[1];
    }

    // Sử dụng OPTIONS để kiểm tra nhanh mà không cần endpoint cụ thể
    await fetch(`http://${finalIp}:${finalPort}/api/match-result`, {
      method: 'OPTIONS',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lấy IP của máy hiện tại (tối ưu khi chạy trong Electron)
 */
export async function getMyIp() {
  if (window.electronAPI && window.electronAPI.lan) {
    const status = await window.electronAPI.lan.getServerStatus();
    return status.ip;
  }
  return '127.0.0.1';
}
