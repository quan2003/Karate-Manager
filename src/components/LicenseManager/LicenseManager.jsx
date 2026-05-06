import { useState, useRef, useEffect } from "react";
import {
  getCurrentLicense,
  getLicenseStatus,
  getDaysRemaining,
  generateMachineId,
  activateLicense,
  deactivateLicense,
  getLicenseInfoFromServer,
  submitLicenseRequest,
  LICENSE_CONFIG,
} from "../../services/licenseService";
import ConfirmDialog from "../common/ConfirmDialog";
import "./LicenseManager.css";

const TABS = {
  INFO: "info",
  ACTIVATE: "activate",
  REQUEST: "request",
};

export default function LicenseManager({ onClose, onLicenseChanged, onBuyLicense }) {
  const [activeTab, setActiveTab] = useState(TABS.INFO);
  const [license, setLicense] = useState(null);
  const [status, setStatus] = useState(null);
  const [machineId] = useState(generateMachineId());
  const [copySuccess, setCopySuccess] = useState(false);
  const machineIdRef = useRef(null);

  // Activate tab states
  const [newKey, setNewKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");
  const [activateSuccess, setActivateSuccess] = useState(false);
  const fileInputRef = useRef(null);

  // Request tab states
  const [requestType, setRequestType] = useState("renewal");
  const [contactInfo, setContactInfo] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState("");

  // Confirm dialog state
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  // Server info
  const [serverInfo, setServerInfo] = useState(null);
  const [loadingServerInfo, setLoadingServerInfo] = useState(false);

  useEffect(() => {
    refreshLicense();
  }, []);

  const refreshLicense = () => {
    const currentLicense = getCurrentLicense();
    setLicense(currentLicense);
    setStatus(getLicenseStatus());

    // Fetch from server if has license key
    if (
      currentLicense?.licenseKey &&
      currentLicense.licenseKey !== "TRIAL-LOCAL"
    ) {
      fetchServerInfo(currentLicense.licenseKey);
    }
  };

  const fetchServerInfo = async (key) => {
    setLoadingServerInfo(true);
    try {
      const result = await getLicenseInfoFromServer(key);
      if (result.success) {
        setServerInfo(result.license);
      }
    } catch (e) {
      // ignore
    }
    setLoadingServerInfo(false);
  };

  const handleCopyMachineId = async () => {
    try {
      if (window.electronAPI?.copyToClipboard) {
        await window.electronAPI.copyToClipboard(machineId);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(machineId);
      } else if (machineIdRef.current) {
        machineIdRef.current.select();
        document.execCommand("copy");
      }
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      if (machineIdRef.current) {
        machineIdRef.current.select();
        alert("Vui lòng nhấn Ctrl+C để copy!");
      }
    }
  };

  const handleActivate = async () => {
    if (!newKey.trim()) {
      setActivateError("Vui lòng nhập License Key!");
      return;
    }

    setActivating(true);
    setActivateError("");
    setActivateSuccess(false);

    try {
      const result = await activateLicense(newKey.trim(), machineId);
      if (result.valid) {
        setActivateSuccess(true);
        setNewKey("");
        refreshLicense();
        if (onLicenseChanged) onLicenseChanged();
      } else {
        setActivateError(result.error || "Key không hợp lệ");
      }
    } catch (err) {
      setActivateError(`Lỗi: ${err.message}`);
    }

    setActivating(false);
  };

  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const match = text.match(/LICENSE KEY:\s*([^\r\n]+)/);
      if (match && match[1]) {
        const key = match[1].trim();
        setNewKey(key);
        setActiveTab(TABS.ACTIVATE);

        // Auto-activate
        setActivating(true);
        const result = await activateLicense(key, machineId);
        if (result.valid) {
          setActivateSuccess(true);
          refreshLicense();
          if (onLicenseChanged) onLicenseChanged();
        } else {
          setActivateError(result.error || "Key không hợp lệ");
        }
        setActivating(false);
      } else {
        setActivateError("File license không đúng định dạng");
      }
    } catch (err) {
      setActivateError(`Lỗi đọc file: ${err.message}`);
    }

    e.target.value = null;
  };
  const handleDeactivate = () => {
    setShowDeactivateConfirm(true);
  };

  const handleDeactivateConfirmed = () => {
    deactivateLicense();
    refreshLicense();
    if (onLicenseChanged) onLicenseChanged();
    setShowDeactivateConfirm(false);
  };

  const handleSubmitRequest = async () => {
    if (!requestType) {
      setRequestError("Vui lòng chọn loại yêu cầu");
      return;
    }

    setSubmitting(true);
    setRequestError("");
    setRequestSuccess(false);

    try {
      const result = await submitLicenseRequest({
        key: license?.licenseKey || null,
        machineId,
        requestType,
        contactInfo: contactInfo.trim() || null,
        message: requestMessage.trim() || null,
      });

      if (result.success) {
        setRequestSuccess(true);
        setRequestMessage("");
        setContactInfo("");
      } else {
        setRequestError(result.message || "Lỗi gửi yêu cầu");
      }
    } catch (err) {
      setRequestError("Không thể kết nối server");
    }

    setSubmitting(false);
  };

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const daysRemaining = getDaysRemaining();
  const isTrial = license?.isTrial || license?.type === "trial";
  const isExpired = status?.status === "expired";
  const isActive = status?.status === "active";
  const hasLicense = !!license;

  // Calculate progress percentage for days bar
  const config = license ? LICENSE_CONFIG[license.type] : null;
  const totalDays = config?.durationDays || 30;
  const usedDays = totalDays - daysRemaining;
  const progressPercent = Math.min(
    100,
    Math.max(0, (usedDays / totalDays) * 100)
  );

  const getProgressColor = () => {
    if (isExpired) return "#ef4444";
    if (daysRemaining <= 3) return "#f59e0b";
    return "#10b981";
  };

  return (
    <div className="license-manager-overlay" onClick={onClose}>
      <div
        className="license-manager-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="lm-header">
          <div className="lm-header-left">
            <span className="lm-header-icon">🛡️</span>
            <div>
              <h3>Quản lý Bản quyền</h3>
              <div className="lm-header-sub">K-SPORT</div>
            </div>
          </div>
          <button className="lm-close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        {/* Tabs */}
        <div className="lm-tabs">
          <button
            className={`lm-tab ${activeTab === TABS.INFO ? "active" : ""}`}
            onClick={() => setActiveTab(TABS.INFO)}
          >
            <span className="lm-tab-icon">📋</span>
            Thông tin
          </button>
          <button
            className={`lm-tab ${activeTab === TABS.ACTIVATE ? "active" : ""}`}
            onClick={() => setActiveTab(TABS.ACTIVATE)}
          >
            <span className="lm-tab-icon">🔑</span>
            Kích hoạt
          </button>
          <button
            className={`lm-tab ${activeTab === TABS.REQUEST ? "active" : ""}`}
            onClick={() => setActiveTab(TABS.REQUEST)}
          >
            <span className="lm-tab-icon">📨</span>
            Yêu cầu hỗ trợ
          </button>
        </div>
        {/* Body */}
        <div className="lm-body">
          {/* === TAB: INFO === */}
          {activeTab === TABS.INFO && (
            <>
              {hasLicense ? (
                <>
                  {/* Status Badge */}
                  <div style={{ textAlign: "center", marginBottom: "0.75rem" }}>
                    <span
                      className={`lm-status-badge ${
                        isExpired ? "expired" : isTrial ? "trial" : "active"
                      }`}
                    >
                      {isExpired
                        ? "❌ Hết hạn"
                        : isTrial
                        ? "🔓 Dùng thử"
                        : "✅ Đã kích hoạt"}
                    </span>
                  </div>

                  {/* Info Card */}
                  <div className="lm-info-card">
                    <div className="lm-info-row">
                      <span className="lm-info-label">Loại License</span>
                      <span
                        className={`lm-info-value ${
                          isExpired ? "expired" : isTrial ? "trial" : "active"
                        }`}
                      >
                        {config?.displayName || license.type}
                      </span>
                    </div>
                    {license.organizationName &&
                      license.organizationName !== "Trial User" && (
                        <div className="lm-info-row">
                          <span className="lm-info-label">
                            Tổ chức / Khách hàng
                          </span>
                          <span className="lm-info-value">
                            {license.organizationName}
                          </span>
                        </div>
                      )}
                    <div className="lm-info-row">
                      <span className="lm-info-label">Ngày kích hoạt</span>
                      <span className="lm-info-value">
                        {formatDate(license.activatedAt)}
                      </span>
                    </div>
                    <div className="lm-info-row">
                      <span className="lm-info-label">Ngày hết hạn</span>
                      <span
                        className={`lm-info-value ${
                          isExpired ? "expired" : ""
                        }`}
                      >
                        {formatDate(license.expiryDate)}
                      </span>
                    </div>
                    {serverInfo && (
                      <div className="lm-info-row">
                        <span className="lm-info-label">
                          Số máy đã kích hoạt
                        </span>
                        <span className="lm-info-value">
                          {serverInfo.activatedMachines || 0} /{" "}
                          {serverInfo.maxMachines || 1}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Days Progress */}
                  {!isExpired && (
                    <div className="lm-days-progress">
                      <div className="lm-days-bar">
                        <div
                          className="lm-days-fill"
                          style={{
                            width: `${100 - progressPercent}%`,
                            background: `linear-gradient(90deg, ${getProgressColor()}, ${getProgressColor()}cc)`,
                          }}
                        />
                      </div>
                      <div className="lm-days-text">
                        <span>Còn lại</span>
                        <span
                          style={{ fontWeight: 700, color: getProgressColor() }}
                        >
                          {daysRemaining} ngày
                        </span>
                      </div>
                    </div>
                  )}

                  {isExpired && (
                    <div
                      style={{
                        background: "#fee2e2",
                        border: "1px solid #fca5a5",
                        borderRadius: "8px",
                        padding: "0.75rem",
                        textAlign: "center",
                        color: "#991b1b",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      ⛔ License đã hết hạn! Vui lòng gia hạn hoặc kích hoạt key
                      mới.
                    </div>
                  )}

                  {(isTrial || isExpired) && (
                    <button className="lm-buy-btn" onClick={onBuyLicense}>
                      Mua bản quyền
                    </button>
                  )}

                  {loadingServerInfo && (
                    <div className="lm-loading">
                      <div className="lm-spinner" />
                      Đang kiểm tra với server...
                    </div>
                  )}

                  {/* License Key (masked) */}
                  {license.licenseKey &&
                    license.licenseKey !== "TRIAL-LOCAL" && (
                      <div className="lm-machine-box">
                        <div className="lm-machine-label">
                          License Key hiện tại
                        </div>
                        <div
                          className="lm-machine-id"
                          style={{ fontSize: "0.75rem" }}
                        >
                          {license.licenseKey.substring(0, 20)}...
                        </div>
                      </div>
                    )}

                  {/* Deactivate */}
                  {!isTrial && (
                    <button
                      className="lm-deactivate-btn"
                      onClick={handleDeactivate}
                    >
                      Hủy kích hoạt license hiện tại
                    </button>
                  )}
                </>
              ) : (
                <div className="lm-no-license">
                  <div className="lm-no-license-icon">🔒</div>
                  <h4>Chưa có License</h4>
                  <p>
                    Bạn chưa kích hoạt bản quyền nào.
                    <br />
                    Hãy chuyển sang tab <strong>"Kích hoạt"</strong> để nhập
                    key, hoặc tab <strong>"Yêu cầu hỗ trợ"</strong> để xin cấp
                    key.
                  </p>
                  <button className="lm-buy-btn" onClick={onBuyLicense}>
                    Mua bản quyền
                  </button>
                </div>
              )}

              {/* Machine ID */}
              <div className="lm-machine-box" style={{ marginTop: "1rem" }}>
                <div className="lm-machine-label">🖥️ ID Máy tính của bạn</div>
                <div className="lm-machine-row">
                  <input
                    ref={machineIdRef}
                    type="text"
                    readOnly
                    value={machineId}
                    className="lm-machine-id"
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    className={`lm-copy-btn ${copySuccess ? "copied" : ""}`}
                    onClick={handleCopyMachineId}
                    title="Copy ID"
                  >
                    {copySuccess ? "✓" : "📋"}
                  </button>
                </div>
                <div className="lm-hint">
                  * Cung cấp ID này cho nhà cung cấp để nhận key kích hoạt cho
                  máy này.
                </div>
              </div>
            </>
          )}

          {/* === TAB: ACTIVATE === */}
          {activeTab === TABS.ACTIVATE && (
            <>
              {activateSuccess ? (
                <div className="lm-success-msg">
                  <span className="lm-success-icon">🎉</span>
                  Kích hoạt bản quyền thành công!
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 400,
                      marginTop: "0.5rem",
                    }}
                  >
                    Bạn có thể sử dụng đầy đủ tính năng ngay bây giờ.
                  </div>
                </div>
              ) : (
                <>
                  {/* Manual Key Input */}
                  <div className="lm-key-section">
                    <label>Nhập License Key:</label>
                    <div className="lm-key-input-row">
                      <input
                        type="text"
                        value={newKey}
                        onChange={(e) => {
                          setNewKey(e.target.value);
                          setActivateError("");
                        }}
                        placeholder="Dán mã key vào đây..."
                        disabled={activating}
                      />
                      <button
                        className="lm-activate-btn"
                        onClick={handleActivate}
                        disabled={activating || !newKey.trim()}
                      >
                        {activating ? "..." : "Kích hoạt"}
                      </button>
                    </div>
                    <div className="lm-hint">
                      * Nếu Key có khóa theo ID máy, ID phải trùng khớp với ID
                      máy bên dưới.
                    </div>
                  </div>

                  {activateError && (
                    <div className="lm-error-msg">⚠️ {activateError}</div>
                  )}

                  {/* File Import */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".lic,.txt"
                    style={{ display: "none" }}
                    onChange={handleFileImport}
                  />
                  <button
                    className="lm-file-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📁 Mở file License (.lic)
                  </button>

                  {/* Machine ID */}
                  <div className="lm-machine-box" style={{ marginTop: "1rem" }}>
                    <div className="lm-machine-label">
                      🖥️ ID Máy tính của bạn
                    </div>
                    <div className="lm-machine-row">
                      <input
                        type="text"
                        readOnly
                        value={machineId}
                        className="lm-machine-id"
                        onClick={(e) => e.target.select()}
                      />
                      <button
                        className={`lm-copy-btn ${copySuccess ? "copied" : ""}`}
                        onClick={handleCopyMachineId}
                        title="Copy ID"
                      >
                        {copySuccess ? "✓" : "📋"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* === TAB: REQUEST === */}
          {activeTab === TABS.REQUEST && (
            <>
              {requestSuccess ? (
                <div className="lm-success-msg">
                  <span className="lm-success-icon">✅</span>
                  Yêu cầu đã được gửi thành công!
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 400,
                      marginTop: "0.5rem",
                    }}
                  >
                    Chúng tôi sẽ liên hệ lại trong thời gian sớm nhất.
                  </div>
                  <button
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.5rem 1.5rem",
                      border: "1px solid #10b981",
                      borderRadius: "6px",
                      background: "white",
                      color: "#065f46",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                    onClick={() => setRequestSuccess(false)}
                  >
                    Gửi yêu cầu khác
                  </button>
                </div>
              ) : (
                <div className="lm-request-form">
                  <div className="lm-form-group">
                    <label>Loại yêu cầu *</label>
                    <select
                      value={requestType}
                      onChange={(e) => setRequestType(e.target.value)}
                    >
                      <option value="renewal">🔄 Gia hạn License</option>
                      <option value="new_key">🔑 Cấp Key mới</option>
                      <option value="reset_machine">
                        🖥️ Reset máy (đổi thiết bị)
                      </option>
                      <option value="upgrade">⬆️ Nâng cấp gói License</option>
                      <option value="support">💬 Hỗ trợ kỹ thuật</option>
                      <option value="other">📝 Khác</option>
                    </select>
                  </div>

                  <div className="lm-form-group">
                    <label>Thông tin liên hệ (SĐT / Email / Zalo)</label>
                    <input
                      type="text"
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      placeholder="Ví dụ: 0336.440.523 hoặc email@gmail.com"
                    />
                  </div>

                  <div className="lm-form-group">
                    <label>Nội dung yêu cầu</label>
                    <textarea
                      rows={3}
                      value={requestMessage}
                      onChange={(e) => setRequestMessage(e.target.value)}
                      placeholder="Mô tả chi tiết yêu cầu của bạn..."
                    />
                  </div>

                  {/* Auto-filled info */}
                  <div
                    style={{
                      background: "#f1f5f9",
                      borderRadius: "8px",
                      padding: "0.65rem",
                      fontSize: "0.75rem",
                      color: "#64748b",
                    }}
                  >
                    <div>
                      <strong>Thông tin tự động gửi kèm:</strong>
                    </div>
                    <div>• ID Máy: {machineId}</div>
                    {license?.licenseKey &&
                      license.licenseKey !== "TRIAL-LOCAL" && (
                        <div>
                          • License Key: {license.licenseKey.substring(0, 15)}
                          ...
                        </div>
                      )}
                  </div>

                  {requestError && (
                    <div className="lm-error-msg">⚠️ {requestError}</div>
                  )}

                  <button
                    className="lm-submit-btn"
                    onClick={handleSubmitRequest}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <div
                          className="lm-spinner"
                          style={{ borderTopColor: "white" }}
                        />
                        Đang gửi...
                      </>
                    ) : (
                      <>📨 Gửi yêu cầu</>
                    )}
                  </button>

                  <div className="lm-contact-box">
                    <p>Hoặc liên hệ trực tiếp:</p>
                    <strong>📧 luuquankarate@gmail.com</strong>
                    <strong>📞 0336.440.523</strong>
                  </div>
                </div>
              )}
            </>
          )}
        </div>{" "}
      </div>

      <ConfirmDialog
        isOpen={showDeactivateConfirm}
        title="Hủy kích hoạt License"
        message="Bạn có chắc muốn hủy kích hoạt license hiện tại?"
        onConfirm={handleDeactivateConfirmed}
        onCancel={() => setShowDeactivateConfirm(false)}
        confirmText="Hủy kích hoạt"
        cancelText="Không"
        type="danger"
      />
    </div>
  );
}
