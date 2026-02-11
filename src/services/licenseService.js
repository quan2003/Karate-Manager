/**
 * License Service - Quản lý bản quyền phần mềm
 * Chỉ Owner mới có thể tạo license, Admin cần nhập license key để sử dụng
 *
 * Version 2.0 - Hỗ trợ:
 * - Version Control (reset/gia hạn license)
 * - Multi-machine support (nhiều máy tính)
 * - Bỏ giới hạn số giải đấu
 */

// Các loại license
export const LICENSE_TYPES = {
  TRIAL: "trial", // 3 ngày dùng thử
  TOURNAMENT: "tournament", // Theo giải đấu (30 ngày)
  YEARLY: "yearly", // Gói 1 năm (365 ngày)
};

// Cấu hình chi tiết từng loại license
export const LICENSE_CONFIG = {
  [LICENSE_TYPES.TRIAL]: {
    name: "Trial",
    displayName: "Dùng thử (3 ngày)",
    durationDays: 3,
    maxMachines: 1,
    features: ["basic_bracket", "export_pdf"],
    color: "#f59e0b", // amber
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
    color: "#3b82f6", // blue
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
    color: "#10b981", // emerald
  },
};

/**
 * Encode UTF-8 string to base64 (hỗ trợ tiếng Việt)
 */
function utf8ToBase64(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

/**
 * Decode base64 to UTF-8 string
 */
function base64ToUtf8(base64) {
  return decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}

/**
 * Tạo Machine ID duy nhất cho mỗi máy tính
 */
export function generateMachineId() {
  // Kiểm tra xem đã có machine ID chưa
  let machineId = localStorage.getItem("krt_machine_id");
  if (machineId) return machineId;

  // Tạo machine ID mới dựa trên thông tin browser
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

  // Simple hash function
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
 * Tạo license key với thông tin được mã hóa
 * Hỗ trợ Version Control để reset/gia hạn license
 *
 * @param {Object} options
 * @param {string} options.type - Loại license (trial, tournament, yearly)
 * @param {string} options.organizationName - Tên tổ chức/khách hàng
 * @param {number} options.customDuration - Số ngày tùy chỉnh
 * @param {number} options.customMachines - Số máy tùy chỉnh
 * @param {string[]} options.targetMachineIds - Mảng ID máy tính được phép sử dụng
 * @param {number} options.version - Số phiên bản key (tăng khi reset/gia hạn)
 */
export function generateLicenseKey(options) {
  const {
    type = LICENSE_TYPES.TRIAL,
    organizationName = "",
    createdAt = new Date().toISOString(),
    customDuration = null,
    customMachines = null,
    targetMachineIds = [], // Array of Machine IDs (multiple machines support)
    version = 1, // Version number for reset/renewal
  } = options;

  const config = LICENSE_CONFIG[type];
  const expiryDate = new Date();
  expiryDate.setDate(
    expiryDate.getDate() + (customDuration || config.durationDays)
  );

  // Ensure targetMachineIds is an array and filter empty values
  const machineIds = Array.isArray(targetMachineIds)
    ? targetMachineIds.filter((id) => id && id.trim())
    : [targetMachineIds].filter(Boolean);

  const licenseData = {
    v: 2, // License format version (updated to 2 for version control)
    t: type,
    o: organizationName,
    c: createdAt,
    e: expiryDate.toISOString(),
    mm: customMachines || config.maxMachines,
    tmids: machineIds, // Array of Target Machine IDs
    kv: version, // Key Version (for reset/renewal)
    f: config.features,
    id: crypto.randomUUID(),
  };

  // Encode to base64 (hỗ trợ Unicode)
  const encoded = utf8ToBase64(JSON.stringify(licenseData));

  // Format as readable key with prefix
  const prefix = type.charAt(0).toUpperCase();
  const chunks = encoded.match(/.{1,5}/g) || [];
  const key = `KRT-${prefix}-${chunks.slice(0, 5).join("-")}`;

  return {
    key,
    raw: encoded,
    data: licenseData,
    expiryDate: expiryDate.toISOString(),
    version,
    machineIds,
  };
}

/**
 * Giải mã và xác thực license key
 * Hỗ trợ Version Control - chỉ chấp nhận key có version cao hơn hoặc bằng
 */
export function validateLicenseKey(licenseKey, currentMachineId = null) {
  try {
    // Xóa prefix và dấu gạch ngang
    let encoded = licenseKey;
    if (licenseKey.startsWith("KRT-")) {
      const parts = licenseKey.split("-");
      parts.shift(); // Remove 'KRT'
      parts.shift(); // Remove type prefix (T, B, P, E)
      encoded = parts.join("");
    }

    // Decode base64 (hỗ trợ Unicode)
    const decoded = JSON.parse(base64ToUtf8(encoded));

    // Validate structure
    if (!decoded.t || !decoded.e || !decoded.id) {
      return { valid: false, error: "License key không hợp lệ" };
    }

    // Check expiry
    const expiryDate = new Date(decoded.e);
    const now = new Date();
    if (now > expiryDate) {
      return {
        valid: false,
        error: "License đã hết hạn",
        data: decoded,
        expired: true,
      };
    }

    // Get local machine ID
    const localMachineId = currentMachineId || generateMachineId();

    // Check Machine Lock (support both old format tmid and new format tmids)
    const targetMachineIds =
      decoded.tmids || (decoded.tmid ? [decoded.tmid] : []);

    if (targetMachineIds.length > 0) {
      const isAuthorized = targetMachineIds.some((id) => id === localMachineId);
      if (!isAuthorized) {
        return {
          valid: false,
          error: "License này không được phép sử dụng trên máy tính này.",
          data: decoded,
          machineMismatch: true,
          expectedMachines: targetMachineIds,
          currentMachine: localMachineId,
        };
      }
    }

    // Get key version (default to 1 for old keys)
    const keyVersion = decoded.kv || 1;

    // Valid license
    return {
      valid: true,
      data: {
        type: decoded.t,
        organizationName: decoded.o,
        createdAt: decoded.c,
        expiryDate: decoded.e,
        maxMachines: decoded.mm,
        targetMachineIds: targetMachineIds,
        keyVersion: keyVersion,
        features: decoded.f,
        licenseId: decoded.id,
      },
      keyVersion,
    };
  } catch (e) {
    return { valid: false, error: "Không thể giải mã license key" };
  }
}

/**
 * Lưu license đã kích hoạt vào localStorage
 * Hỗ trợ Version Control - chỉ chấp nhận key có version cao hơn
 */
export function activateLicense(licenseKey, machineId) {
  const validation = validateLicenseKey(licenseKey, machineId);
  if (!validation.valid) {
    return validation;
  }

  // Check version control - chỉ chấp nhận key có version cao hơn hoặc bằng
  const currentLicense = getCurrentLicense();
  const newKeyVersion = validation.keyVersion || 1;
  const currentKeyVersion = currentLicense?.keyVersion || 0;

  if (currentLicense && newKeyVersion < currentKeyVersion) {
    return {
      valid: false,
      error: `Key này đã cũ (version ${newKeyVersion}). Bạn đã kích hoạt key version ${currentKeyVersion}. Vui lòng sử dụng key mới hơn.`,
    };
  }

  const activationData = {
    ...validation.data,
    licenseKey,
    machineId,
    keyVersion: newKeyVersion,
    activatedAt: new Date().toISOString(),
    active: true,
    isTrial: false,
  };

  localStorage.setItem("krt_active_license", JSON.stringify(activationData));

  // Dispatch event to notify all components about license change
  window.dispatchEvent(
    new CustomEvent("licenseChanged", {
      detail: { type: "activated", license: activationData },
    })
  );

  return { valid: true, data: activationData };
}

/**
 * Lấy thông tin license hiện tại
 */
export function getCurrentLicense() {
  try {
    const saved = localStorage.getItem("krt_active_license");
    if (!saved) return null;

    const license = JSON.parse(saved);

    // Re-validate expiry
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
 * Kiểm tra license có cho phép tính năng không
 */
export function hasFeature(featureName) {
  const license = getCurrentLicense();
  if (!license || !license.active) return false;
  return license.features?.includes(featureName) || false;
}

/**
 * Lấy số ngày còn lại của license
 */
export function getDaysRemaining() {
  const license = getCurrentLicense();
  if (!license) return 0;

  const expiryDate = new Date(license.expiryDate);
  const now = new Date();
  const diffTime = expiryDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Hủy license hiện tại
 */
export function deactivateLicense() {
  localStorage.removeItem("krt_active_license");
}

/**
 * Reset toàn bộ license (Owner only) - Xóa tất cả dữ liệu license
 */
export function resetAllLicenseData() {
  localStorage.removeItem("krt_active_license");
  localStorage.removeItem("krt_trial_used");
  localStorage.removeItem("krt_machine_id");
  localStorage.removeItem("krt_generated_licenses");
  console.log("All license data has been reset.");
  return true;
}

/**
 * Tự động kích hoạt Trial cho người dùng mới
 * Gọi khi ứng dụng khởi động lần đầu
 */
export function initializeTrialIfNeeded() {
  // Kiểm tra xem đã có license chưa
  const currentLicense = getCurrentLicense();

  // Nếu đã có license (dù hết hạn hay còn) thì không tạo trial mới
  if (currentLicense) {
    return currentLicense;
  }

  // Kiểm tra xem đã từng dùng trial chưa
  const trialUsed = localStorage.getItem("krt_trial_used");
  if (trialUsed) {
    return null; // Đã dùng trial rồi, không cho dùng lại
  }

  // Tạo trial license tự động
  const trialLicense = generateLicenseKey({
    type: LICENSE_TYPES.TRIAL,
    organizationName: "Trial User",
  });

  const machineId = generateMachineId();

  const activationData = {
    type: LICENSE_TYPES.TRIAL,
    organizationName: "Trial User",
    createdAt: new Date().toISOString(),
    expiryDate: trialLicense.data.e,
    maxMachines: trialLicense.data.mm,
    features: trialLicense.data.f,
    licenseId: trialLicense.data.id,
    licenseKey: trialLicense.raw,
    machineId,
    keyVersion: 1,
    activatedAt: new Date().toISOString(),
    active: true,
    isTrial: true,
  };

  localStorage.setItem("krt_active_license", JSON.stringify(activationData));
  localStorage.setItem("krt_trial_used", "true");

  return activationData;
}

/**
 * Kiểm tra xem hiện tại có đang dùng Trial không
 */
export function isTrialLicense() {
  const license = getCurrentLicense();
  return license?.isTrial === true || license?.type === LICENSE_TYPES.TRIAL;
}

/**
 * Kiểm tra xem license còn hoạt động không
 */
export function isLicenseValid() {
  const license = getCurrentLicense();
  if (!license) return false;
  if (!license.active) return false;

  const expiryDate = new Date(license.expiryDate);
  const now = new Date();
  return now <= expiryDate;
}

/**
 * Lấy thông tin hiển thị trạng thái license
 */
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
 * Lấy danh sách license đã tạo (Owner only)
 */
export function getGeneratedLicenses() {
  try {
    const saved = localStorage.getItem("krt_generated_licenses");
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Lưu license vừa tạo vào lịch sử (Owner only)
 */
export function saveGeneratedLicense(licenseInfo) {
  const licenses = getGeneratedLicenses();
  licenses.unshift({
    ...licenseInfo,
    generatedAt: new Date().toISOString(),
  });

  // Chỉ giữ 100 license gần nhất
  if (licenses.length > 100) {
    licenses.length = 100;
  }

  localStorage.setItem("krt_generated_licenses", JSON.stringify(licenses));
}

/**
 * Lấy version tiếp theo cho một Machine ID
 * Dùng khi tạo key mới cho khách hàng đã có key
 */
export function getNextVersionForMachine(machineId) {
  const licenses = getGeneratedLicenses();

  // Tìm tất cả licenses có chứa machineId này
  const matchingLicenses = licenses.filter((lic) => {
    const machineIds = lic.machineIds || [];
    return machineIds.includes(machineId);
  });

  if (matchingLicenses.length === 0) {
    return 1; // Chưa có key nào cho máy này
  }

  // Tìm version cao nhất
  const maxVersion = Math.max(
    ...matchingLicenses.map((lic) => lic.version || 1)
  );
  return maxVersion + 1;
}

/**
 * Lấy lịch sử key theo Machine ID
 */
export function getLicenseHistoryByMachine(machineId) {
  const licenses = getGeneratedLicenses();

  return licenses
    .filter((lic) => {
      const machineIds = lic.machineIds || [];
      return machineIds.includes(machineId);
    })
    .sort((a, b) => (b.version || 1) - (a.version || 1));
}

/**
 * Xuất license ra file .lic
 */
export function exportLicenseFile(licenseInfo) {
  const content = JSON.stringify(
    {
      type: "KRT_LICENSE",
      version: 2,
      key: licenseInfo.key,
      raw: licenseInfo.raw,
      keyVersion: licenseInfo.version || 1,
      machineIds: licenseInfo.machineIds || [],
      createdAt: new Date().toISOString(),
    },
    null,
    2
  );

  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `license_${licenseInfo.data.t}_v${
    licenseInfo.version || 1
  }_${Date.now()}.lic`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import license từ file .lic
 */
export async function importLicenseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target.result);
        if (content.type !== "KRT_LICENSE") {
          reject(new Error("File không phải license KRT"));
          return;
        }

        const validation = validateLicenseKey(content.raw);
        if (!validation.valid) {
          reject(new Error(validation.error));
          return;
        }

        resolve({
          key: content.key,
          raw: content.raw,
          data: validation.data,
          keyVersion: content.keyVersion || validation.keyVersion || 1,
        });
      } catch (err) {
        reject(new Error("Không thể đọc file license"));
      }
    };
    reader.onerror = () => reject(new Error("Lỗi đọc file"));
    reader.readAsText(file);
  });
}
