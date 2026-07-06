/**
 * License Service - Quản lý bản quyền phần mềm (Online Mode)
 * Kết nối với Server trên VPS để xác thực và quản lý key.
 */

// ĐỊA CHỈ SERVER LICENSE - Cần thay đổi khi deploy lên VPS
export const SERVER_URL = "https://admin.luuquancoder.id.vn";

const SECURE_LICENSE_KEYS = new Set([
  "krt_active_license",
  "krt_machine_id",
  "krt_trial_used",
]);

function getElectronLicenseStore() {
  return window.electronAPI?.licenseStore || null;
}

function readLicenseValue(key) {
  if (!SECURE_LICENSE_KEYS.has(key)) throw new Error("Unsupported license key");
  const secureStore = getElectronLicenseStore();
  if (!secureStore) return localStorage.getItem(key);

  const result = secureStore.get(key);
  if (!result?.success) throw new Error(result?.error || "Secure store read failed");
  if (result.value !== null) return result.value;

  // One-time migration for existing installations.
  const legacyValue = localStorage.getItem(key);
  if (legacyValue !== null) {
    const migrated = secureStore.set(key, legacyValue);
    if (!migrated?.success) {
      throw new Error(migrated?.error || "Secure store migration failed");
    }
    localStorage.removeItem(key);
  }
  return legacyValue;
}

function writeLicenseValue(key, value) {
  if (!SECURE_LICENSE_KEYS.has(key)) throw new Error("Unsupported license key");
  const secureStore = getElectronLicenseStore();
  if (!secureStore) {
    localStorage.setItem(key, value);
    return;
  }

  const result = secureStore.set(key, value);
  if (!result?.success) throw new Error(result?.error || "Secure store write failed");
  localStorage.removeItem(key);
}

function removeLicenseValue(key) {
  if (!SECURE_LICENSE_KEYS.has(key)) throw new Error("Unsupported license key");
  const secureStore = getElectronLicenseStore();
  if (secureStore) {
    const result = secureStore.remove(key);
    if (!result?.success) throw new Error(result?.error || "Secure store remove failed");
  }
  localStorage.removeItem(key);
}

export function normalizeVietnameseMessage(message) {
  if (typeof message !== "string") return message;

  const exact = {
    "Thiáº¿u gÃ³i hoáº·c Machine ID": "Thiếu gói hoặc Machine ID",
    "ThiÃ¡ÂºÂ¿u gÃƒÂ³i hoÃ¡ÂºÂ·c Machine ID": "Thiếu gói hoặc Machine ID",
    "GÃ³i thanh toÃ¡n khÃ´ng tá»“n táº¡i": "Gói thanh toán không tồn tại",
    "GÃƒÂ³i thanh toÃƒÂ¡n khÃƒÂ´ng tÃ¡Â»â€œn tÃ¡ÂºÂ¡i": "Gói thanh toán không tồn tại",
    "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n": "Không tìm thấy đơn",
    "KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y Ã„â€˜Ã†Â¡n": "Không tìm thấy đơn",
    "Machine ID khÃ´ng khá»›p": "Machine ID không khớp",
    "Machine ID khÃƒÂ´ng khÃ¡Â»â€ºp": "Machine ID không khớp",
    "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡": "Dữ liệu không hợp lệ",
    "DÃ¡Â»Â¯ liÃ¡Â»â€¡u khÃƒÂ´ng hÃ¡Â»Â£p lÃ¡Â»â€¡": "Dữ liệu không hợp lệ",
  };

  if (exact[message]) return exact[message];

  return message
    .replaceAll("KhÃ´ng", "Không")
    .replaceAll("khÃ´ng", "không")
    .replaceAll("tÃ¬m", "tìm")
    .replaceAll("tháº¥y", "thấy")
    .replaceAll("Ä‘Æ¡n", "đơn")
    .replaceAll("Ä‘Æ°á»£c", "được")
    .replaceAll("xÃ¡c nháº­n", "xác nhận")
    .replaceAll("thanh toÃ¡n", "thanh toán")
    .replaceAll("kiá»ƒm tra", "kiểm tra")
    .replaceAll("táº£i", "tải")
    .replaceAll("báº£ng giÃ¡", "bảng giá")
    .replaceAll("táº¡o", "tạo")
    .replaceAll("khá»›p", "khớp")
    .replaceAll("há»£p lá»‡", "hợp lệ")
    .replaceAll("gÃ³i", "gói")
    .replaceAll("hoáº·c", "hoặc");
}

async function readJsonWithNormalizedMessage(response) {
  const data = await response.json();
  if (data?.message) {
    return { ...data, message: normalizeVietnameseMessage(data.message) };
  }
  return data;
}

export const LICENSE_TYPES = {
  TRIAL: "trial",
  TOURNAMENT: "tournament",
  YEARLY: "yearly",
};

export const LICENSE_CONFIG = {
  [LICENSE_TYPES.TRIAL]: {
    name: "Trial",
    displayName: "Dùng thử (3 ngày)",
    durationDays: 3,
    maxMachines: 1,
    features: ["basic_bracket", "export_pdf"],
    color: "#f59e0b",
  },
  [LICENSE_TYPES.TOURNAMENT]: {
    name: "Tournament",
    displayName: "Theo giải đấu",
    durationDays: 30,
    maxMachines: 1,
    features: [
      "basic_bracket",
      "export_pdf",
      "kata_scoring",
      "kumite_scoring",
      "lan_sync",
    ],
    color: "#3b82f6",
  },
  [LICENSE_TYPES.YEARLY]: {
    name: "Yearly",
    displayName: "Gói 1 năm",
    durationDays: 365,
    maxMachines: 3,
    features: [
      "basic_bracket",
      "export_pdf",
      "kata_scoring",
      "kumite_scoring",
      "lan_sync",
      "multi_admin",
      "api_access",
    ],
    color: "#10b981",
  },
};

/**
 * Tạo Machine ID duy nhất
 */
export function generateMachineId() {
  let machineId = readLicenseValue("krt_machine_id");
  if (machineId) return machineId;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "top";
  ctx.font = "14px Arial";
  ctx.fillText("KRT-Machine-ID", 0, 0);

  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    new Date().getTimezoneOffset(),
    canvas.toDataURL(),
  ].join("|");

  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  machineId =
    "KRT-" +
    Math.abs(hash).toString(16).toUpperCase().padStart(8, "0") +
    "-" +
    Date.now().toString(36).toUpperCase();
  writeLicenseValue("krt_machine_id", machineId);
  return machineId;
}

/**
 * Validate License Key với Server (Async)
 */
export async function validateLicenseKey(licenseKey, currentMachineId = null) {
  try {
    const machineId = currentMachineId || generateMachineId();

    // Check if empty
    if (!licenseKey || !licenseKey.trim()) {
      return { valid: false, error: "Vui lòng nhập License Key" };
    }

    const response = await fetch(`${SERVER_URL}/api/license/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: licenseKey.trim(), machineId }),
    });

    const result = await readJsonWithNormalizedMessage(response);

    if (result.success && result.valid) {
      return {
        valid: true,
        data: {
          type: result.data.type,
          organizationName: result.data.clientName,
          expiryDate: result.data.expiryDate,
          maxMachines: result.data.maxMachines,
          features: LICENSE_CONFIG[result.data.type]?.features || [],
        },
        keyVersion: 1,
      };
    } else {
      return {
        valid: false,
        error: result.message || "License không hợp lệ hoặc lỗi server",
        // Only an explicit invalid verdict from a reachable server may
        // invalidate an already activated local license.
        serverConfirmedInvalid: response.ok && result.valid === false,
      };
    }
  } catch (e) {
    console.error(e);
    return {
      valid: false,
      error: "Không thể kết nối đến License Server (" + SERVER_URL + ")",
      serverConfirmedInvalid: false,
    };
  }
}

/**
 * Kích hoạt License (Async)
 */
export async function activateLicense(licenseKey, machineId) {
  const validation = await validateLicenseKey(licenseKey, machineId);

  if (!validation.valid) {
    return validation;
  }

  const activationData = {
    ...validation.data,
    licenseKey,
    machineId,
    activatedAt: new Date().toISOString(),
    active: true,
    isTrial: false,
    lastCheck: new Date().toISOString(),
  };

  writeLicenseValue("krt_active_license", JSON.stringify(activationData));

  // Dispatch Custom Event
  window.dispatchEvent(
    new CustomEvent("licenseChanged", {
      detail: { type: "activated", license: activationData },
    })
  );

  return { valid: true, data: activationData };
}

/**
 * Lấy thông tin license hiện tại (Sync - from Cache)
 */
export function getCurrentLicense() {
  try {
    const saved = readLicenseValue("krt_active_license");
    if (!saved) return null;

    const license = JSON.parse(saved);

    const expiryDate = new Date(license.expiryDate);
    const now = new Date();
    if (now > expiryDate) {
      license.active = false;
      license.expired = true;
    }

    return license;
  } catch (e) {
    return null;
  }
}

/**
 * Verify Server in Background (Use on App Start)
 */
export async function revalidateLicenseWithServer() {
  const license = getCurrentLicense();
  if (!license || !license.licenseKey || license.isTrial) return;

  const valid = await validateLicenseKey(
    license.licenseKey,
    generateMachineId()
  );
  if (!valid.valid) {
    console.warn("License invalidated by server:", valid.error);
    if (!valid.serverConfirmedInvalid) return;

    const invalidatedLicense = {
      ...license,
      active: false,
      invalidatedAt: new Date().toISOString(),
      invalidReason: valid.error,
      lastCheck: new Date().toISOString(),
    };

    writeLicenseValue(
      "krt_active_license",
      JSON.stringify(invalidatedLicense)
    );

    window.dispatchEvent(
      new CustomEvent("licenseChanged", {
        detail: {
          type: "invalidated",
          license: invalidatedLicense,
          reason: valid.error,
        },
      })
    );
    return { valid: false, invalidated: true, error: valid.error };
  }

  const refreshedLicense = {
    ...license,
    ...valid.data,
    licenseKey: license.licenseKey,
    machineId: license.machineId || generateMachineId(),
    active: true,
    expired: false,
    isTrial: false,
    lastCheck: new Date().toISOString(),
  };

  writeLicenseValue("krt_active_license", JSON.stringify(refreshedLicense));

  window.dispatchEvent(
    new CustomEvent("licenseChanged", {
      detail: { type: "revalidated", license: refreshedLicense },
    })
  );
}

export function hasFeature(featureName) {
  const license = getCurrentLicense();
  if (!license || !license.active) return false;
  return license.features?.includes(featureName) || false;
}

export function getDaysRemaining() {
  const license = getCurrentLicense();
  if (!license) return 0;
  const expiryDate = new Date(license.expiryDate);
  const now = new Date();
  const diffTime = expiryDate - now;
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

export function deactivateLicense() {
  removeLicenseValue("krt_active_license");
}

export function resetAllLicenseData() {
  removeLicenseValue("krt_active_license");
  removeLicenseValue("krt_trial_used");
  removeLicenseValue("krt_machine_id");
  console.log("All license data has been reset.");
  return true;
}

// --- Legacy / Partial Support ---

export function initializeTrialIfNeeded() {
  const currentLicense = getCurrentLicense();
  if (currentLicense) return currentLicense;

  const trialUsed = readLicenseValue("krt_trial_used");
  if (trialUsed) return null;

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 3);

  const activationData = {
    type: LICENSE_TYPES.TRIAL,
    organizationName: "Trial User",
    createdAt: new Date().toISOString(),
    expiryDate: expiryDate.toISOString(),
    maxMachines: 1,
    features: LICENSE_CONFIG[LICENSE_TYPES.TRIAL].features,
    licenseKey: "TRIAL-LOCAL",
    machineId: generateMachineId(),
    activatedAt: new Date().toISOString(),
    active: true,
    isTrial: true,
  };

  writeLicenseValue("krt_active_license", JSON.stringify(activationData));
  writeLicenseValue("krt_trial_used", "true");
  return activationData;
}

export function isTrialLicense() {
  const license = getCurrentLicense();
  return license?.isTrial === true || license?.type === LICENSE_TYPES.TRIAL;
}

export function isLicenseValid() {
  const license = getCurrentLicense();
  if (!license) return false;
  if (!license.active) return false;
  const expiryDate = new Date(license.expiryDate);
  return new Date() <= expiryDate;
}

export function getLicenseStatus() {
  const license = getCurrentLicense();
  if (!license) {
    return {
      status: "none",
      message: "Chưa kích hoạt license",
      color: "#64748b",
    };
  }
  const daysRemaining = getDaysRemaining();
  const config = LICENSE_CONFIG[license.type];

  if (!isLicenseValid()) {
    return {
      status: "expired",
      message: "License đã hết hạn",
      color: "#ef4444",
      license,
    };
  }
  if (license.isTrial || license.type === LICENSE_TYPES.TRIAL) {
    return {
      status: "trial",
      message: `Dùng thử - Còn ${daysRemaining} ngày`,
      color: "#f59e0b",
      daysRemaining,
      license,
    };
  }
  return {
    status: "active",
    message: `${
      config?.displayName || license.type
    } - Còn ${daysRemaining} ngày`,
    color: "#10b981",
    daysRemaining,
    license,
  };
}

/**
 * Lấy thông tin license từ server (Public - không cần admin secret)
 */
export async function getLicenseInfoFromServer(key) {
  try {
    const response = await fetch(`${SERVER_URL}/api/license/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    return await readJsonWithNormalizedMessage(response);
  } catch (e) {
    return { success: false, message: "Không thể kết nối server" };
  }
}

/**
 * Gửi yêu cầu hỗ trợ license (gia hạn, cấp lại key, v.v.)
 */
export async function submitLicenseRequest({
  key,
  machineId,
  requestType,
  contactInfo,
  message,
}) {
  try {
    const response = await fetch(`${SERVER_URL}/api/license/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        machineId,
        requestType,
        contactInfo,
        message,
      }),
    });
    return await readJsonWithNormalizedMessage(response);
  } catch (e) {
    return { success: false, message: "Không thể kết nối server" };
  }
}

export async function getPublicPricing() {
  try {
    const response = await fetch(`${SERVER_URL}/api/public/pricing`);
    return await readJsonWithNormalizedMessage(response);
  } catch (e) {
    return { success: false, message: "Không thể tải bảng giá" };
  }
}

export async function createPaymentOrder({
  planId,
  machineId,
  customerName,
  customerPhone,
  customerEmail,
  note,
}) {
  try {
    const response = await fetch(`${SERVER_URL}/api/payment/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId,
        machineId,
        customerName,
        customerPhone,
        customerEmail,
        note,
      }),
    });
    return await readJsonWithNormalizedMessage(response);
  } catch (e) {
    return { success: false, message: "Không thể tạo đơn thanh toán" };
  }
}

export async function getPaymentOrderStatus(orderCode, machineId) {
  try {
    const params = new URLSearchParams();
    if (machineId) params.set("machineId", machineId);
    const response = await fetch(
      `${SERVER_URL}/api/payment/orders/${encodeURIComponent(
        orderCode
      )}?${params.toString()}`
    );
    return await readJsonWithNormalizedMessage(response);
  } catch (e) {
    return { success: false, message: "Không thể kiểm tra đơn thanh toán" };
  }
}

// Stubbed legacy function mocks
export function getNextVersionForMachine() {
  return 1;
}
export function getLicenseHistoryByMachine() {
  return [];
}
export function exportLicenseFile(licenseInfo) {
  const content = `LICENSE KEY: ${licenseInfo.key}\nClient: ${licenseInfo.data.o}\nExpires: ${licenseInfo.expiryDate}`;
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `license.lic`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
export function importLicenseFile(existingFile) {
  return new Promise((resolve, reject) => {
    const processFile = (file) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target.result;
          // Extract Key from format "LICENSE KEY: XXXXX..."
          const match = content.match(/LICENSE KEY:\s*([^\r\n]+)/);

          if (match && match[1]) {
            const key = match[1].trim();
            // Validate & Activate
            const result = await activateLicense(key, generateMachineId());
            resolve(result);
          } else {
            resolve({
              valid: false,
              error: "File license không đúng định dạng",
            });
          }
        } catch (err) {
          resolve({ valid: false, error: "Lỗi đọc file: " + err.message });
        }
      };
      reader.readAsText(file);
    };

    // If a file is already provided, use it directly without opening a file dialog
    if (existingFile) {
      processFile(existingFile);
      return;
    }

    // Otherwise, open a file dialog
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".lic,.txt";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      processFile(file);
    };

    input.click();
  });
}
