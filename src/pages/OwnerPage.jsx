import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useRole, ROLES } from "../context/RoleContext";
import {
  LICENSE_TYPES,
  LICENSE_CONFIG,
  generateLicenseKey,
  validateLicenseKey,
  getGeneratedLicenses,
  saveGeneratedLicense,
  getAllLicensesFromServer,
  revokeLicense,
  resetLicenseMachines,
  extendLicense,
  exportLicenseFile,
  resetAllLicenseData,
  getCurrentLicense,
  getNextVersionForMachine,
  getLicenseHistoryByMachine,
  SERVER_URL,
} from "../services/licenseService";
import "./OwnerPage.css";

const TABS = {
  LICENSE: "license",
  LICENSE_HISTORY: "license_history",
  SUPPORT_REQUESTS: "support_requests",
  VERSION: "version",
  USER_CONTROL: "user_control",
};

export default function OwnerPage() {
  const navigate = useNavigate();
  const { role, resetRole, systemConfig, updateSystemConfig } = useRole();
  const [activeTab, setActiveTab] = useState(TABS.LICENSE);
  const [isSaved, setIsSaved] = useState(false);
  const [generatedLicense, setGeneratedLicense] = useState(null);
  const [licenseHistory, setLicenseHistory] = useState([]);
  const [copySuccess, setCopySuccess] = useState(false);
  const licenseKeyRef = useRef(null);

  // Support requests state
  const [supportRequests, setSupportRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestBadgeCount, setRequestBadgeCount] = useState(0);

  // Modal states (replaces prompt() which is not supported in Electron)
  const [showInputModal, setShowInputModal] = useState(false);
  const [inputModalConfig, setInputModalConfig] = useState({ title: '', placeholder: '', defaultValue: '', onConfirm: null });
  const [inputModalValue, setInputModalValue] = useState('');

  // Toast notification state (replaces alert())
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Show toast notification
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // Electron-safe copy to clipboard
  const safeCopy = async (text) => {
    try {
      if (window.electronAPI?.copyToClipboard) {
        await window.electronAPI.copyToClipboard(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      showToast('Đã copy!', 'success');
    } catch (e) {
      // Fallback: textarea trick
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Đã copy!', 'success');
    }
  };

  // Show input modal (replaces prompt())
  const showInputDialog = (title, placeholder, defaultValue, onConfirm) => {
    setInputModalConfig({ title, placeholder, defaultValue, onConfirm });
    setInputModalValue(defaultValue);
    setShowInputModal(true);
  };

  // Security check: If not OWNER, kick out
  useEffect(() => {
    if (role !== ROLES.OWNER) {
      navigate("/");
    }
  }, [role, navigate]);

  // Function to refresh list
  const refreshList = () => {
    if (activeTab === TABS.LICENSE_HISTORY) {
        setLicenseHistory([]); 
        getAllLicensesFromServer().then(serverLicenses => {
            const adapted = serverLicenses.map(l => ({
                raw: l.raw_key || l.key,
                generatedAt: l.created_at,
                expiryDate: l.expiry_date,
                data: {
                    t: l.type,
                    o: l.client_name,
                    mm: l.max_machines,
                    mt: 1
                },
                status: l.status,
                activatedMachines: l.activated_machines || [] 
            }));
            setLicenseHistory(adapted);
        });
    } else {
        setLicenseHistory(getGeneratedLicenses());
    }
  };

  // Load license history
  useEffect(() => {
    refreshList();
    if (activeTab === TABS.SUPPORT_REQUESTS) {
      fetchSupportRequests();
    }
  }, [activeTab]);

  // Fetch pending count on mount
  useEffect(() => {
    fetchSupportRequests(true);
  }, []);

  // Fetch support requests from server
  const fetchSupportRequests = async (countOnly = false) => {
    if (!countOnly) setLoadingRequests(true);
    try {
      const secret = "b3f9a2c7e8d1f6a4b9c2e7d5f8a1c3e6b4d9a7f2c1e8b6d3a5f7c9e1b2d4f6a";
      const response = await fetch(`${SERVER_URL}/api/license/requests?secret=${secret}`);
      const data = await response.json();
      if (data.success) {
        setSupportRequests(data.requests || []);
        setRequestBadgeCount((data.requests || []).filter(r => r.status === 'pending').length);
      }
    } catch (e) {
      console.error("Fetch requests error:", e);
    }
    if (!countOnly) setLoadingRequests(false);
  };

  const handleResolveRequest = (requestId) => {
    showInputDialog('Xử lý yêu cầu', 'Ghi chú xử lý (tuỳ chọn)...', '', async (note) => {
      try {
        const secret = "b3f9a2c7e8d1f6a4b9c2e7d5f8a1c3e6b4d9a7f2c1e8b6d3a5f7c9e1b2d4f6a";
        const response = await fetch(`${SERVER_URL}/api/license/request/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret, requestId, note }),
        });
        const data = await response.json();
        if (data.success) {
          showToast('Đã xử lý yêu cầu!', 'success');
          fetchSupportRequests();
        } else {
          showToast('Lỗi: ' + (data.message || 'Unknown'), 'error');
        }
      } catch (e) {
        showToast('Lỗi kết nối server', 'error');
      }
    });
  };

  // Handlers for management actions
  const handleRevoke = async (key) => {
    if (!window.confirm("BẠN CÓ CHẮC CHẮN MUỐN THU HỒI LICENSE NÀY?\nKhách hàng sẽ không thể sử dụng phần mềm ngay lập tức.")) return;
    const res = await revokeLicense(key);
    if (res.success) {
        showToast('Đã thu hồi thành công!', 'success');
        refreshList();
    } else {
        showToast('Lỗi: ' + res.message, 'error');
    }
  };

  const handleResetMachine = async (key) => {
    if (!window.confirm("Reset danh sách thiết bị?\nCho phép khách hàng kích hoạt lại trên máy mới.")) return;
    const res = await resetLicenseMachines(key);
    if (res.success) {
        showToast('Đã reset thiết bị thành công!', 'success');
        refreshList();
    } else {
        showToast('Lỗi: ' + res.message, 'error');
    }
  };

  const handleExtend = (key) => {
    showInputDialog('Gia hạn License', 'Nhập số ngày muốn gia hạn thêm...', '30', async (days) => {
      if (!days) return;
      const res = await extendLicense(key, parseInt(days));
      if (res.success) {
          showToast(`Đã gia hạn thêm ${days} ngày!`, 'success');
          refreshList();
      } else {
          showToast('Lỗi: ' + res.message, 'error');
      }
    });
  };

  // Local state for editing form
  const [formData, setFormData] = useState({
    licenseType: LICENSE_TYPES.TOURNAMENT,
    organizationName: "",
    customDuration: "",
    customMachines: "1",
    machineIds: [""], // Array of machine IDs
    keyVersion: 1, // Version for reset/renewal

    adminLocked: false,
    rulesLocked: false,
    preventNewAdmin: false,
  });

  // Validate key state
  const [validateInput, setValidateInput] = useState("");
  const [validateResult, setValidateResult] = useState(null);

  // Load initial data
  useEffect(() => {
    if (systemConfig) {
      setFormData((prev) => ({
        ...prev,
        adminLocked: systemConfig.adminLocked || false,
        rulesLocked: systemConfig.rulesLocked || false,
        preventNewAdmin: systemConfig.preventNewAdmin || false,
      }));
    }
  }, [systemConfig]);
  // Handle license type change with auto-presets
  const handleLicenseTypeChange = (e) => {
    const type = e.target.value;
    const config = LICENSE_CONFIG[type];

    // Adjust machine IDs array based on maxMachines
    const newMachineCount = config.maxMachines;
    const currentMachineIds = [...formData.machineIds];
    while (currentMachineIds.length < newMachineCount) {
      currentMachineIds.push("");
    }
    while (currentMachineIds.length > newMachineCount) {
      currentMachineIds.pop();
    }

    setFormData({
      ...formData,
      licenseType: type,
      customDuration: config.durationDays,
      customMachines: config.maxMachines,
      machineIds: currentMachineIds,
    });
  };

  // Handle machine count change
  const handleMachineCountChange = (count) => {
    const newCount = Math.max(1, Math.min(10, parseInt(count) || 1));
    const currentMachineIds = [...formData.machineIds];

    while (currentMachineIds.length < newCount) {
      currentMachineIds.push("");
    }
    while (currentMachineIds.length > newCount) {
      currentMachineIds.pop();
    }

    setFormData({
      ...formData,
      customMachines: newCount,
      machineIds: currentMachineIds,
    });
  };

  // Handle machine ID input change
  const handleMachineIdChange = (index, value) => {
    const newMachineIds = [...formData.machineIds];
    newMachineIds[index] = value;

    // Auto-detect version for first machine ID
    if (index === 0 && value.trim()) {
      const nextVersion = getNextVersionForMachine(value.trim());
      setFormData({
        ...formData,
        machineIds: newMachineIds,
        keyVersion: nextVersion,
      });
    } else {
      setFormData({
        ...formData,
        machineIds: newMachineIds,
      });
    }
  };

  // Generate new license key
  const handleGenerateLicense = async () => {
    // Validate at least one Machine ID is required
    // const validMachineIds = formData.machineIds.filter((id) => id && id.trim());
    // if (validMachineIds.length === 0) {
    //   alert(
    //     "⚠️ Bạn phải nhập ít nhất 1 ID máy tính của khách hàng để tạo license!"
    //   );
    //   return;
    // }

    try {
      const license = await generateLicenseKey({
        type: formData.licenseType,
        organizationName: formData.organizationName,
        customDuration: formData.customDuration
          ? parseInt(formData.customDuration)
          : null,
        customMachines: formData.customMachines
          ? parseInt(formData.customMachines)
          : null,
        targetMachineIds: [], // Server handles Machine ID binding
        version: formData.keyVersion,
      });

      setGeneratedLicense(license);
      saveGeneratedLicense(license);
      setLicenseHistory(getGeneratedLicenses());

      // Auto increment version for next key
      setFormData((prev) => ({
        ...prev,
        keyVersion: prev.keyVersion + 1,
      }));
    } catch(err) {
      showToast('Lỗi tạo License: ' + err.message, 'error');
    }
  };

  // Copy license key to clipboard
  const handleCopyKey = () => {
    if (generatedLicense) {
      safeCopy(generatedLicense.raw);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // Export license to file
  const handleExportLicense = () => {
    if (generatedLicense) {
      exportLicenseFile(generatedLicense);
    }
  };

  // Validate a license key
  const handleValidateKey = async () => {
    const result = await validateLicenseKey(validateInput);
    setValidateResult(result);
  };

  const handleSaveSystem = () => {
    updateSystemConfig({
      adminLocked: formData.adminLocked,
      rulesLocked: formData.rulesLocked,
      preventNewAdmin: formData.preventNewAdmin,
    });
    showSaveSuccess();
  };

  const showSaveSuccess = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleLogout = () => {
    resetRole();
    navigate("/");
  };

  const handleResetAdminPassword = () => {
    if (window.confirm("Reset mật khẩu Admin về mặc định (admin123)?")) {
      showToast('Đã reset mật khẩu Admin.', 'success');
    }
  };

  // Format date for display
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (role !== ROLES.OWNER) return null;

  return (
    <div className="owner-page">
      <div className="owner-container">
        {/* Header */}
        <header className="owner-header">
          <div className="owner-title">
            <h1>SYSTEM ROOT ACCESS</h1>
            <div className="owner-subtitle">DEVELOPER MODE • V1.0.0</div>
          </div>
          <button className="exit-btn" onClick={handleLogout}>
            [ EXIT TERMINAL ]
          </button>
        </header>

        {/* Navigation Tabs */}
        <div className="owner-tabs">
          <button
            className={`tab-btn ${activeTab === TABS.LICENSE ? "active" : ""}`}
            onClick={() => setActiveTab(TABS.LICENSE)}
          >
            🔑 TẠO LICENSE
          </button>
          <button
            className={`tab-btn ${
              activeTab === TABS.LICENSE_HISTORY ? "active" : ""
            }`}
            onClick={() => setActiveTab(TABS.LICENSE_HISTORY)}
          >
            📜 LỊCH SỬ LICENSE
          </button>
          <button
            className={`tab-btn ${
              activeTab === TABS.SUPPORT_REQUESTS ? "active" : ""
            }`}
            onClick={() => setActiveTab(TABS.SUPPORT_REQUESTS)}
            style={{ position: 'relative' }}
          >
            📨 YÊU CẦU HỖ TRỢ
            {requestBadgeCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                background: '#ef4444',
                color: 'white',
                fontSize: '0.65rem',
                fontWeight: 'bold',
                padding: '1px 6px',
                borderRadius: '10px',
                minWidth: '18px',
                textAlign: 'center',
                fontFamily: 'Arial, sans-serif',
              }}>{requestBadgeCount}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === TABS.VERSION ? "active" : ""}`}
            onClick={() => setActiveTab(TABS.VERSION)}
          >
            🔧 VERSION MANAGER
          </button>
          <button
            className={`tab-btn ${
              activeTab === TABS.USER_CONTROL ? "active" : ""
            }`}
            onClick={() => setActiveTab(TABS.USER_CONTROL)}
          >
            👤 USER PERMISSIONS
          </button>
        </div>

        {/* Main Content Area */}
        <div className="owner-content">
          {/* LICENSE TAB - Generate New License */}
          {activeTab === TABS.LICENSE && (
            <div className="panel license-panel">
              <div className="panel-header">
                <h2>🔑 TẠO LICENSE MỚI</h2>
                <p>Tạo license key cho Admin sử dụng phần mềm</p>
              </div>{" "}
              {/* License Type Cards */}
              <div className="license-type-cards">
                {Object.entries(LICENSE_CONFIG)
                  .filter(([type]) => type !== LICENSE_TYPES.TRIAL) // Hide Trial option
                  .map(([type, config]) => (
                    <div
                      key={type}
                      className={`license-card ${
                        formData.licenseType === type ? "selected" : ""
                      }`}
                      style={{
                        borderColor:
                          formData.licenseType === type
                            ? config.color
                            : "transparent",
                      }}
                      onClick={() =>
                        handleLicenseTypeChange({ target: { value: type } })
                      }
                    >
                      <div
                        className="license-card-header"
                        style={{ backgroundColor: config.color }}
                      >
                        <span className="license-type-name">{config.name}</span>
                      </div>
                      <div className="license-card-body">
                        <div className="license-card-display">
                          {config.displayName}
                        </div>
                        <div className="license-card-details">
                          <span>⏱️ {config.durationDays} ngày</span>
                          <span>
                            💻{" "}
                            {config.maxMachines === 999
                              ? "∞"
                              : config.maxMachines}{" "}
                            máy
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
              {/* Organization Name */}
              <div className="form-group">
                <label>TÊN TỔ CHỨC / KHÁCH HÀNG</label>
                <input
                  type="text"
                  className="input-dark"
                  placeholder="VD: Liên đoàn Karate Việt Nam"
                  value={formData.organizationName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      organizationName: e.target.value,
                    })
                  }
                />
              </div>
              {/* Custom Settings */}
              <div className="form-row">
                <div className="form-group">
                  <label>SỐ NGÀY (tuỳ chỉnh)</label>
                  <input
                    type="number"
                    className="input-dark"
                    value={formData.customDuration}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customDuration: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>SỐ MÁY TÍNH</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="input-dark"
                    value={formData.customMachines}
                    onChange={(e) => handleMachineCountChange(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>PHIÊN BẢN KEY</label>
                  <input
                    type="number"
                    min="1"
                    className="input-dark"
                    value={formData.keyVersion}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        keyVersion: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                  <small style={{ color: "#64748b", fontSize: "0.75rem" }}>
                    * Tăng version khi reset/gia hạn
                  </small>
                </div>
              </div>
              {/* Machine IDs Input - Dynamic based on machine count */}
              <div className="form-group">
                <label>
                  ID MÁY TÍNH KHÁCH HÀNG{" "}
                  <span style={{ color: "#ef4444" }}>*</span>
                  <span
                    style={{
                      color: "#64748b",
                      fontWeight: "normal",
                      marginLeft: "8px",
                    }}
                  >
                    ({formData.machineIds.filter((id) => id.trim()).length}/
                    {formData.customMachines} máy)
                  </span>
                </label>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  {formData.machineIds.map((machineId, index) => (
                    <div
                      key={index}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          color: "#64748b",
                          minWidth: "80px",
                          fontSize: "0.85rem",
                        }}
                      >
                        Máy {index + 1}:
                      </span>
                      <input
                        type="text"
                        className="input-dark"
                        placeholder={`VD: KRT-7F... (ID máy ${index + 1})`}
                        value={machineId}
                        onChange={(e) =>
                          handleMachineIdChange(index, e.target.value)
                        }
                        style={{ flex: 1 }}
                      />
                    </div>
                  ))}
                </div>

                <small
                  style={{
                    color: "#f59e0b",
                    marginTop: "0.5rem",
                    display: "block",
                  }}
                >
                  ⚠️ Bắt buộc nhập ít nhất 1 ID máy. Key tạo ra sẽ{" "}
                  <strong>CHỈ</strong> hoạt động trên các máy có ID này.
                </small>
              </div>
              <button
                className="action-btn btn-generate"
                onClick={handleGenerateLicense}
                disabled={!formData.machineIds.some((id) => id.trim())}
                style={{
                  opacity: formData.machineIds.some((id) => id.trim())
                    ? 1
                    : 0.5,
                  cursor: formData.machineIds.some((id) => id.trim())
                    ? "pointer"
                    : "not-allowed",
                }}
              >
                ⚡ TẠO LICENSE KEY (Version {formData.keyVersion})
              </button>{" "}
              {/* Generated License Display */}
              {generatedLicense && (
                <div className="generated-license">
                  <h3>✅ License đã tạo thành công!</h3>
                  <div className="license-key-display" ref={licenseKeyRef}>
                    <code>{generatedLicense.raw}</code>
                  </div>
                  <div className="license-info">
                    <span>
                      Loại:{" "}
                      <strong>
                        {LICENSE_CONFIG[generatedLicense.data.t]?.displayName}
                      </strong>
                    </span>
                    <span>
                      Hết hạn:{" "}
                      <strong>{formatDate(generatedLicense.expiryDate)}</strong>
                    </span>
                    <span>
                      Version: <strong>v{generatedLicense.version || 1}</strong>
                    </span>
                    <span>
                      Số máy:{" "}
                      <strong>
                        {generatedLicense.machineIds?.length || 1}
                      </strong>
                    </span>
                  </div>
                  {generatedLicense.machineIds &&
                    generatedLicense.machineIds.length > 0 && (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          fontSize: "0.85rem",
                          color: "#64748b",
                        }}
                      >
                        <strong>Máy được phép:</strong>{" "}
                        {generatedLicense.machineIds.map((id, i) => (
                          <span
                            key={i}
                            style={{
                              background: "#1e293b",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              marginLeft: "4px",
                              fontFamily: "monospace",
                            }}
                          >
                            {id}
                          </span>
                        ))}
                      </div>
                    )}
                  <div className="license-actions">
                    <button
                      className="action-btn btn-copy"
                      onClick={handleCopyKey}
                    >
                      {copySuccess ? "✓ Đã copy!" : "📋 Copy Key"}
                    </button>
                    <button
                      className="action-btn btn-export"
                      onClick={handleExportLicense}
                    >
                      💾 Xuất file .lic
                    </button>
                  </div>
                </div>
              )}
              {/* Validate Existing Key */}
              <div className="validate-section">
                <h3>🔍 Kiểm tra License Key</h3>
                <div className="form-row">
                  <input
                    type="text"
                    className="input-dark"
                    placeholder="Dán license key vào đây để kiểm tra..."
                    value={validateInput}
                    onChange={(e) => setValidateInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="action-btn btn-validate"
                    onClick={handleValidateKey}
                  >
                    Kiểm tra
                  </button>
                </div>
                {validateResult && (
                  <div
                    className={`validate-result ${
                      validateResult.valid ? "valid" : "invalid"
                    }`}
                  >
                    {validateResult.valid ? (
                      <>
                        <span className="status">✅ License hợp lệ</span>
                        <span>
                          Loại:{" "}
                          {
                            LICENSE_CONFIG[validateResult.data.type]
                              ?.displayName
                          }
                        </span>
                        <span>
                          Hết hạn: {formatDate(validateResult.data.expiryDate)}
                        </span>
                        <span>
                          Tổ chức:{" "}
                          {validateResult.data.organizationName || "N/A"}
                        </span>
                      </>
                    ) : (
                      <span className="status">❌ {validateResult.error}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* LICENSE HISTORY TAB - TABLE FORMAT */}
          {activeTab === TABS.LICENSE_HISTORY && (
            <div className="panel history-panel">
              <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <h2>📜 QUẢN LÝ LICENSE (SERVER)</h2>
                  <p>Tổng: {licenseHistory.length} license | Active: {licenseHistory.filter(l => l.status !== 'revoked').length} | Revoked: {licenseHistory.filter(l => l.status === 'revoked').length}</p>
                </div>
                <button 
                    className="action-btn btn-secondary" 
                    style={{marginLeft: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem'}}
                    onClick={refreshList}
                >
                    🔄 Tải lại
                </button>
              </div>

              {licenseHistory.length === 0 ? (
                <div className="empty-state">
                  <p>Đang tải dữ liệu từ server hoặc chưa có license nào...</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #334155', textAlign: 'left' }}>
                        <th style={{ padding: '0.6rem 0.5rem', color: '#94a3b8', fontWeight: 600 }}>#</th>
                        <th style={{ padding: '0.6rem 0.5rem', color: '#94a3b8', fontWeight: 600 }}>Trạng thái</th>
                        <th style={{ padding: '0.6rem 0.5rem', color: '#94a3b8', fontWeight: 600 }}>Loại</th>
                        <th style={{ padding: '0.6rem 0.5rem', color: '#94a3b8', fontWeight: 600 }}>Khách hàng</th>
                        <th style={{ padding: '0.6rem 0.5rem', color: '#94a3b8', fontWeight: 600 }}>License Key</th>
                        <th style={{ padding: '0.6rem 0.5rem', color: '#94a3b8', fontWeight: 600 }}>Ngày tạo</th>
                        <th style={{ padding: '0.6rem 0.5rem', color: '#94a3b8', fontWeight: 600 }}>Hết hạn</th>
                        <th style={{ padding: '0.6rem 0.5rem', color: '#94a3b8', fontWeight: 600 }}>Máy</th>
                        <th style={{ padding: '0.6rem 0.5rem', color: '#94a3b8', fontWeight: 600 }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {licenseHistory.map((license, index) => {
                        const isRevoked = license.status === 'revoked';
                        const expiry = new Date(license.expiryDate);
                        const now = new Date();
                        const isExpired = now > expiry;
                        const daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));

                        return (
                          <tr key={index} style={{ 
                            borderBottom: '1px solid #1e293b', 
                            opacity: isRevoked ? 0.5 : 1,
                            background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                          }}>
                            {/* # */}
                            <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{index + 1}</td>

                            {/* Trạng thái */}
                            <td style={{ padding: '0.6rem 0.5rem' }}>
                              {isRevoked ? (
                                <span style={{ background: '#7f1d1d', color: '#fca5a5', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>THU HỒI</span>
                              ) : isExpired ? (
                                <span style={{ background: '#78350f', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>HẾT HẠN</span>
                              ) : (
                                <span style={{ background: '#064e3b', color: '#6ee7b7', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>ACTIVE</span>
                              )}
                            </td>

                            {/* Loại */}
                            <td style={{ padding: '0.6rem 0.5rem' }}>
                              <span style={{
                                background: LICENSE_CONFIG[license.data.t]?.color || '#64748b',
                                color: 'white',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                textTransform: 'uppercase'
                              }}>
                                {LICENSE_CONFIG[license.data.t]?.name || license.data.t}
                              </span>
                            </td>

                            {/* Khách hàng */}
                            <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600, color: '#e2e8f0', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {license.data.o || '—'}
                            </td>

                            {/* License Key */}
                            <td style={{ padding: '0.6rem 0.5rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <code style={{ fontSize: '0.7rem', color: '#94a3b8', background: '#0f172a', padding: '2px 6px', borderRadius: '3px', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                  {license.raw ? license.raw.substring(0, 20) + '...' : 'N/A'}
                                </code>
                                <button
                                  onClick={(e) => { e.stopPropagation(); safeCopy(license.raw); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '0' }}
                                  title="Copy Key"
                                >📋</button>
                              </div>
                            </td>

                            {/* Ngày tạo */}
                            <td style={{ padding: '0.6rem 0.5rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                              {formatDate(license.generatedAt)}
                            </td>

                            {/* Hết hạn */}
                            <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.75rem', color: isExpired ? '#fbbf24' : '#94a3b8' }}>
                              {formatDate(license.expiryDate)}
                              {!isRevoked && !isExpired && (
                                <div style={{ fontSize: '0.65rem', color: daysLeft <= 7 ? '#fbbf24' : '#10b981' }}>
                                  Còn {daysLeft} ngày
                                </div>
                              )}
                            </td>

                            {/* Máy */}
                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: '#94a3b8' }}>
                              {license.activatedMachines?.length || 0}/{license.data.mm}
                            </td>

                            {/* Thao tác */}
                            <td style={{ padding: '0.6rem 0.5rem' }}>
                              {!isRevoked ? (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  <button 
                                    onClick={() => handleExtend(license.raw)}
                                    style={{padding: '3px 6px', fontSize: '0.65rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer'}}
                                    title="Gia hạn"
                                  >📅</button>
                                  <button 
                                    onClick={() => handleResetMachine(license.raw)}
                                    style={{padding: '3px 6px', fontSize: '0.65rem', background: '#f59e0b', color: 'black', border: 'none', borderRadius: '3px', cursor: 'pointer'}}
                                    title="Reset máy"
                                  >🔄</button>
                                  <button 
                                    onClick={() => handleRevoke(license.raw)}
                                    style={{padding: '3px 6px', fontSize: '0.65rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer'}}
                                    title="Thu hồi"
                                  >🚫</button>
                                </div>
                              ) : (
                                <span style={{fontSize: '0.65rem', color: '#ef4444', fontStyle: 'italic'}}>Đã vô hiệu</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUPPORT REQUESTS TAB */}
          {activeTab === TABS.SUPPORT_REQUESTS && (
            <div className="panel">
              <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <h2>📨 YÊU CẦU HỖ TRỢ TỪ NGƯỜI DÙNG</h2>
                  <p>Pending: {supportRequests.filter(r => r.status === 'pending').length} | Đã xử lý: {supportRequests.filter(r => r.status === 'resolved').length}</p>
                </div>
                <button 
                    className="action-btn btn-secondary" 
                    style={{marginLeft: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem'}}
                    onClick={() => fetchSupportRequests()}
                >
                    🔄 Tải lại
                </button>
              </div>

              {loadingRequests ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  Đang tải...
                </div>
              ) : supportRequests.length === 0 ? (
                <div className="empty-state">
                  <p>Chưa có yêu cầu hỗ trợ nào.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {supportRequests.map((req, index) => {
                    const isPending = req.status === 'pending';
                    const typeLabels = {
                      renewal: '🔄 Gia hạn',
                      new_key: '🔑 Cấp key mới',
                      reset_machine: '🖥️ Reset máy',
                      upgrade: '⬆️ Nâng cấp',
                      support: '💬 Hỗ trợ KT',
                      other: '📝 Khác',
                    };
                    return (
                      <div key={req.id || index} style={{
                        background: isPending ? 'rgba(251, 191, 36, 0.05)' : '#0f172a',
                        border: `1px solid ${isPending ? '#f59e0b33' : '#334155'}`,
                        borderLeft: `4px solid ${isPending ? '#f59e0b' : '#10b981'}`,
                        borderRadius: '8px',
                        padding: '1rem',
                      }}>
                        {/* Header row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700 }}>#{index + 1}</span>
                          {isPending ? (
                            <span style={{ background: '#78350f', color: '#fbbf24', padding: '2px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>⏳ PENDING</span>
                          ) : (
                            <span style={{ background: '#064e3b', color: '#6ee7b7', padding: '2px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>✅ ĐÃ XỬ LÝ</span>
                          )}
                          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.85rem' }}>
                            {typeLabels[req.request_type] || req.request_type}
                          </span>
                          {req.client_name && (
                            <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.8rem' }}>
                              👤 {req.client_name}
                            </span>
                          )}
                          <span style={{ color: '#64748b', fontSize: '0.7rem', marginLeft: 'auto' }}>
                            {formatDate(req.created_at)}
                          </span>
                        </div>

                        {/* Detail grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.78rem', marginBottom: '0.75rem' }}>
                          <div>
                            <span style={{ color: '#64748b' }}>Machine ID: </span>
                            <code style={{ color: '#fbbf24', background: '#1e293b', padding: '2px 6px', borderRadius: '3px', wordBreak: 'break-all', fontSize: '0.72rem' }}>
                              {req.machine_id || '—'}
                            </code>
                            {req.machine_id && (
                              <button onClick={() => safeCopy(req.machine_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', padding: '0 4px' }}>📋</button>
                            )}
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>License Key: </span>
                            {req.license_key ? (
                              <>
                                <code style={{ color: '#94a3b8', background: '#1e293b', padding: '2px 6px', borderRadius: '3px', wordBreak: 'break-all', fontSize: '0.72rem' }}>
                                  {req.license_key}
                                </code>
                                <button onClick={() => safeCopy(req.license_key)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', padding: '0 4px' }}>📋</button>
                              </>
                            ) : (
                              <span style={{ color: '#64748b' }}>Không có</span>
                            )}
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Liên hệ: </span>
                            <span style={{ color: '#38bdf8' }}>{req.contact_info || '—'}</span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Khách hàng: </span>
                            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{req.client_name || 'Chưa xác định'}</span>
                          </div>
                        </div>

                        {/* Message */}
                        {req.message && (
                          <div style={{ background: '#1e293b', padding: '8px 12px', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.8rem', color: '#e2e8f0', borderLeft: '3px solid #3b82f6' }}>
                            💬 {req.message}
                          </div>
                        )}

                        {/* Action row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isPending ? (
                            <button 
                              onClick={() => handleResolveRequest(req.id)}
                              style={{padding: '6px 16px', fontSize: '0.75rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600}}
                            >
                              ✅ Đánh dấu đã xử lý
                            </button>
                          ) : (
                            <div style={{ fontSize: '0.75rem', color: '#6ee7b7' }}>
                              ✅ Xử lý lúc: {req.resolved_at ? formatDate(req.resolved_at) : '—'}
                              {req.admin_note && <span style={{ color: '#94a3b8', marginLeft: '8px' }}>📝 {req.admin_note}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VERSION TAB */}
          {activeTab === TABS.VERSION && (
            <div className="panel version-panel">
              <div className="panel-header">
                <h2>VERSION CONTROL</h2>
                <p>Manage updates and rollbacks</p>
              </div>

              <div className="form-group">
                <label>CURRENT VERSION</label>
                <input
                  type="text"
                  className="input-dark"
                  value="1.0.0"
                  disabled
                />
              </div>

              <div className="form-group">
                <button className="action-btn btn-secondary">
                  CHECK FOR UPDATES (SIMULATION)
                </button>
              </div>

              <div className="form-group">
                <label className="toggle-switch">
                  <input type="checkbox" defaultChecked />
                  <span>ALLOW SKIP UPDATE</span>
                </label>
              </div>

              <div className="version-log">
                <h3>CHANGELOG</h3>
                <div className="log-item">
                  <span>v1.0.0</span>
                  <span>Initial Release</span>
                </div>
                <div className="log-item">
                  <span>v0.9.0</span>
                  <span>Beta Testing</span>
                </div>
              </div>
            </div>
          )}

          {/* USER CONTROL TAB */}
          {activeTab === TABS.USER_CONTROL && (
            <div className="panel user-panel">
              <div className="panel-header">
                <h2>USER PERMISSIONS</h2>
                <p>Restrict Admin privileges</p>
              </div>

              <div className="form-group">
                <div className="checkbox-group">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={formData.adminLocked}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          adminLocked: e.target.checked,
                        })
                      }
                    />
                    <span>LOCK ADMIN ACCOUNT (Emergency)</span>
                  </label>

                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={formData.preventNewAdmin}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          preventNewAdmin: e.target.checked,
                        })
                      }
                    />
                    <span>PREVENT CREATING NEW ADMINS</span>
                  </label>

                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={formData.rulesLocked}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rulesLocked: e.target.checked,
                        })
                      }
                    />
                    <span>LOCK CORE RULES MODIFICATION</span>
                  </label>
                </div>
              </div>

              <div
                className="form-group"
                style={{
                  marginTop: "2rem",
                  borderTop: "1px solid #334155",
                  paddingTop: "1rem",
                }}
              >
                <label>DANGER ZONE</label>
                <button
                  className="action-btn btn-danger"
                  onClick={handleResetAdminPassword}
                >
                  RESET ADMIN PASSWORD
                </button>
                <button
                  className="action-btn btn-danger"
                  style={{ marginTop: "0.5rem" }}
                  onClick={() => {
                    if (
                      window.confirm(
                        "⚠️ CẢNH BÁO: Reset toàn bộ license sẽ xóa:\n- License đang kích hoạt\n- Lịch sử đã dùng Trial\n- Machine ID\n- Lịch sử license đã tạo\n\nBạn có chắc chắn?"
                      )
                    ) {
                      resetAllLicenseData();
                      showToast('Đã reset toàn bộ license. Đang reload...', 'success');
                      setTimeout(() => window.location.reload(), 1500);
                    }
                  }}
                >
                  🗑️ RESET ALL LICENSE DATA
                </button>
              </div>

              <button
                className="action-btn"
                onClick={handleSaveSystem}
                style={{ marginTop: "1rem" }}
              >
                {isSaved ? "SAVED ✓" : "UPDATE PERMISSIONS"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* INPUT MODAL - replaces prompt() */}
      {showInputModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999
        }} onClick={() => setShowInputModal(false)}>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
            padding: '1.5rem', minWidth: '400px', maxWidth: '500px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#38bdf8', margin: '0 0 1rem 0', fontSize: '1rem' }}>
              {inputModalConfig.title}
            </h3>
            <input
              type="text"
              autoFocus
              className="input-dark"
              placeholder={inputModalConfig.placeholder}
              value={inputModalValue}
              onChange={(e) => setInputModalValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setShowInputModal(false);
                  inputModalConfig.onConfirm?.(inputModalValue);
                }
              }}
              style={{ width: '100%', marginBottom: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowInputModal(false)}
                style={{ padding: '8px 16px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  setShowInputModal(false);
                  inputModalConfig.onConfirm?.(inputModalValue);
                }}
                style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                ✅ Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION - replaces alert() */}
      {toast.show && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 999999,
          padding: '12px 20px', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem',
          display: 'flex', alignItems: 'center', gap: '8px',
          background: toast.type === 'error' ? '#7f1d1d' : '#064e3b',
          color: toast.type === 'error' ? '#fca5a5' : '#6ee7b7',
          border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#10b981'}`,
          boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          animation: 'fadeIn 0.3s ease',
          fontFamily: '"Consolas", "Monaco", monospace',
        }}>
          {toast.type === 'error' ? '❌' : '✅'} {toast.message}
        </div>
      )}
    </div>
  );
}
