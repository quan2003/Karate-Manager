/**
 * License Service - Quản lý bản quyền phần mềm (Online Mode)
 * Kết nối với Server trên VPS để xác thực và quản lý key.
 */

// ĐỊA CHỈ SERVER LICENSE - Cần thay đổi khi deploy lên VPS
export const SERVER_URL = "http://103.82.194.186:2000"; 

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
  let machineId = localStorage.getItem("krt_machine_id");
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
  localStorage.setItem("krt_machine_id", machineId);
  return machineId;
}

/**
 * Gọi API Server để tạo License (Admin Only)
 */
export async function generateLicenseKey(options) {
  try {
    const response = await fetch(`${SERVER_URL}/api/license/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: "b3f9a2c7e8d1f6a4b9c2e7d5f8a1c3e6b4d9a7f2c1e8b6d3a5f7c9e1b2d4f6a", // Đã khớp với VPS
        type: options.type,
        days: options.customDuration,
        maxMachines: options.customMachines,
        clientName: options.organizationName
      }),
    });

    const data = await response.json();
    if (data.success) {
      return {
        key: data.license.key,
        raw: data.license.key,
        data: {
            t: data.license.type,
            o: data.license.clientName,
            e: data.license.expiryDate,
            mm: data.license.maxMachines
        },
        expiryDate: data.license.expiryDate,
        version: 1,
        machineIds: [] // Server manages this now
      };
    } else {
      throw new Error(data.message);
    }
  } catch (error) {
    console.error("Generate error:", error);
    throw error;
  }
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

    const result = await response.json();
    
    if (result.success && result.valid) {
      return {
        valid: true,
        data: {
          type: result.data.type,
          organizationName: result.data.clientName,
          expiryDate: result.data.expiryDate,
          maxMachines: result.data.maxMachines,
          features: LICENSE_CONFIG[result.data.type]?.features || []
        },
        keyVersion: 1
      };
    } else {
      return { 
        valid: false, 
        error: result.message || "License không hợp lệ hoặc lỗi server" 
      };
    }
  } catch (e) {
    console.error(e);
    return { valid: false, error: "Không thể kết nối đến License Server (" + SERVER_URL + ")" };
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
    lastCheck: new Date().toISOString()
  };

  localStorage.setItem("krt_active_license", JSON.stringify(activationData));

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
    const saved = localStorage.getItem("krt_active_license");
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

  const valid = await validateLicenseKey(license.licenseKey, generateMachineId());
  if (!valid.valid) {
      console.warn("License invalidated by server:", valid.error);
      // Optional: deactive locally if server says invalid
  }
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
  localStorage.removeItem("krt_active_license");
}

export function resetAllLicenseData() {
  localStorage.removeItem("krt_active_license");
  localStorage.removeItem("krt_trial_used");
  localStorage.removeItem("krt_machine_id");
  localStorage.removeItem("krt_generated_licenses");
  console.log("All license data has been reset.");
  return true;
}

// --- Legacy / Partial Support ---

export function initializeTrialIfNeeded() {
  const currentLicense = getCurrentLicense();
  if (currentLicense) return currentLicense;

  const trialUsed = localStorage.getItem("krt_trial_used");
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

  localStorage.setItem("krt_active_license", JSON.stringify(activationData));
  localStorage.setItem("krt_trial_used", "true");
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
    return { status: "none", message: "Chưa kích hoạt license", color: "#64748b" };
  }
  const daysRemaining = getDaysRemaining();
  const config = LICENSE_CONFIG[license.type];

  if (!isLicenseValid()) {
    return { status: "expired", message: "License đã hết hạn", color: "#ef4444", license };
  }
  if (license.isTrial || license.type === LICENSE_TYPES.TRIAL) {
    return { status: "trial", message: `Dùng thử - Còn ${daysRemaining} ngày`, color: "#f59e0b", daysRemaining, license };
  }
  return { status: "active", message: `${config?.displayName || license.type} - Còn ${daysRemaining} ngày`, color: "#10b981", daysRemaining, license };
}

export function getGeneratedLicenses() {
  try {
    const saved = localStorage.getItem("krt_generated_licenses");
    return saved ? JSON.parse(saved) : [];
  } catch (e) { return []; }
}

export async function getAllLicensesFromServer() {
  try {
    const secret = "b3f9a2c7e8d1f6a4b9c2e7d5f8a1c3e6b4d9a7f2c1e8b6d3a5f7c9e1b2d4f6a";
    const response = await fetch(`${SERVER_URL}/api/license/list?secret=${secret}`);
    const data = await response.json();
    if (data.success) {
      return data.licenses || [];
    }
    return [];
  } catch (e) {
    console.error("Fetch license error:", e);
    return [];
  }
}

export async function revokeLicense(key) {
  try {
    const secret = "b3f9a2c7e8d1f6a4b9c2e7d5f8a1c3e6b4d9a7f2c1e8b6d3a5f7c9e1b2d4f6a";
    const response = await fetch(`${SERVER_URL}/api/license/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, key }),
    });
    return await response.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function resetLicenseMachines(key) {
  try {
    const secret = "b3f9a2c7e8d1f6a4b9c2e7d5f8a1c3e6b4d9a7f2c1e8b6d3a5f7c9e1b2d4f6a";
    const response = await fetch(`${SERVER_URL}/api/license/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, key }),
    });
    return await response.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function extendLicense(key, days) {
  try {
    const secret = "b3f9a2c7e8d1f6a4b9c2e7d5f8a1c3e6b4d9a7f2c1e8b6d3a5f7c9e1b2d4f6a";
    const response = await fetch(`${SERVER_URL}/api/license/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, key, days }),
    });
    return await response.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export function saveGeneratedLicense(licenseInfo) {
  const licenses = getGeneratedLicenses();
  licenses.unshift({ ...licenseInfo, generatedAt: new Date().toISOString() });
  if (licenses.length > 100) licenses.length = 100;
  localStorage.setItem("krt_generated_licenses", JSON.stringify(licenses));
}

// Stubbed legacy function mocks
export function getNextVersionForMachine() { return 1; }
export function getLicenseHistoryByMachine() { return []; }
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
export function importLicenseFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".lic,.txt";
        
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

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
             resolve({ valid: false, error: "File license không đúng định dạng" });
          }
        } catch (err) {
          resolve({ valid: false, error: "Lỗi đọc file: " + err.message });
        }
      };
      reader.readAsText(file);
    };

    input.click();
  });
}
