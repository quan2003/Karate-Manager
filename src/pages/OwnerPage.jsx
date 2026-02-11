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
  exportLicenseFile,
  resetAllLicenseData,
  getCurrentLicense,
  getNextVersionForMachine,
  getLicenseHistoryByMachine,
} from "../services/licenseService";
import "./OwnerPage.css";

const TABS = {
  LICENSE: "license",
  LICENSE_HISTORY: "license_history",
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

  // Security check: If not OWNER, kick out
  useEffect(() => {
    if (role !== ROLES.OWNER) {
      navigate("/");
    }
  }, [role, navigate]);

  // Load license history
  useEffect(() => {
    setLicenseHistory(getGeneratedLicenses());
  }, [activeTab]);
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
  const handleGenerateLicense = () => {
    // Validate at least one Machine ID is required
    const validMachineIds = formData.machineIds.filter(id => id && id.trim());
    if (validMachineIds.length === 0) {
      alert("⚠️ Bạn phải nhập ít nhất 1 ID máy tính của khách hàng để tạo license!");
      return;
    }

    const license = generateLicenseKey({
      type: formData.licenseType,
      organizationName: formData.organizationName,
      customDuration: formData.customDuration
        ? parseInt(formData.customDuration)
        : null,
      customMachines: formData.customMachines
        ? parseInt(formData.customMachines)
        : null,
      targetMachineIds: validMachineIds,
      version: formData.keyVersion,
    });

    setGeneratedLicense(license);
    saveGeneratedLicense(license);
    setLicenseHistory(getGeneratedLicenses());
    
    // Auto increment version for next key
    setFormData(prev => ({
      ...prev,
      keyVersion: prev.keyVersion + 1,
    }));
  };

  // Copy license key to clipboard
  const handleCopyKey = () => {
    if (generatedLicense) {
      navigator.clipboard.writeText(generatedLicense.raw);
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
  const handleValidateKey = () => {
    const result = validateLicenseKey(validateInput);
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
      alert("Đã reset mật khẩu Admin.");
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
              </div>              {/* License Type Cards */}
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
                  <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
                    * Tăng version khi reset/gia hạn
                  </small>
                </div>
              </div>

              {/* Machine IDs Input - Dynamic based on machine count */}
              <div className="form-group">
                <label>
                  ID MÁY TÍNH KHÁCH HÀNG <span style={{ color: '#ef4444' }}>*</span>
                  <span style={{ color: '#64748b', fontWeight: 'normal', marginLeft: '8px' }}>
                    ({formData.machineIds.filter(id => id.trim()).length}/{formData.customMachines} máy)
                  </span>
                </label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {formData.machineIds.map((machineId, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: '#64748b', minWidth: '80px', fontSize: '0.85rem' }}>
                        Máy {index + 1}:
                      </span>
                      <input
                        type="text"
                        className="input-dark"
                        placeholder={`VD: KRT-7F... (ID máy ${index + 1})`}
                        value={machineId}
                        onChange={(e) => handleMachineIdChange(index, e.target.value)}
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
                  ⚠️ Bắt buộc nhập ít nhất 1 ID máy. Key tạo ra sẽ <strong>CHỈ</strong> hoạt động trên các máy có ID này.
                </small>
              </div>

              <button
                className="action-btn btn-generate"
                onClick={handleGenerateLicense}
                disabled={!formData.machineIds.some(id => id.trim())}
                style={{
                  opacity: formData.machineIds.some(id => id.trim()) ? 1 : 0.5,
                  cursor: formData.machineIds.some(id => id.trim()) ? 'pointer' : 'not-allowed'
                }}
              >
                ⚡ TẠO LICENSE KEY (Version {formData.keyVersion})
              </button>              {/* Generated License Display */}
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
                      Version:{" "}
                      <strong>v{generatedLicense.version || 1}</strong>
                    </span>
                    <span>
                      Số máy:{" "}
                      <strong>{generatedLicense.machineIds?.length || 1}</strong>
                    </span>
                  </div>
                  {generatedLicense.machineIds && generatedLicense.machineIds.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#64748b' }}>
                      <strong>Máy được phép:</strong>{" "}
                      {generatedLicense.machineIds.map((id, i) => (
                        <span key={i} style={{ 
                          background: '#1e293b', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          marginLeft: '4px',
                          fontFamily: 'monospace'
                        }}>
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

          {/* LICENSE HISTORY TAB */}
          {activeTab === TABS.LICENSE_HISTORY && (
            <div className="panel history-panel">
              <div className="panel-header">
                <h2>📜 LỊCH SỬ LICENSE ĐÃ TẠO</h2>
                <p>Danh sách các license key đã phát hành</p>
              </div>

              {licenseHistory.length === 0 ? (
                <div className="empty-state">
                  <p>Chưa có license nào được tạo</p>
                </div>
              ) : (
                <div className="license-history-list">
                  {licenseHistory.map((license, index) => (
                    <div key={index} className="history-item">
                      <div className="history-item-header">
                        <span
                          className="license-type-badge"
                          style={{
                            backgroundColor:
                              LICENSE_CONFIG[license.data.t]?.color,
                          }}
                        >
                          {LICENSE_CONFIG[license.data.t]?.name}
                        </span>
                        <span className="history-date">
                          {formatDate(license.generatedAt)}
                        </span>
                      </div>
                      <div className="history-item-body">
                        <div className="history-org">
                          {license.data.o || "Không có tên tổ chức"}
                        </div>
                        <div className="history-key">
                          <code title={license.raw}>
                            {license.raw.substring(0, 30)}...
                          </code>
                          <button
                            className="btn-copy-small"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (navigator.clipboard) {
                                navigator.clipboard
                                  .writeText(license.raw)
                                  .then(() =>
                                    alert("Đã copy Key vào bộ nhớ tạm!")
                                  )
                                  .catch((err) => alert("Lỗi copy: " + err));
                              } else {
                                // Fallback
                                const textArea =
                                  document.createElement("textarea");
                                textArea.value = license.raw;
                                document.body.appendChild(textArea);
                                textArea.select();
                                document.execCommand("Copy");
                                textArea.remove();
                                alert("Đã copy Key!");
                              }
                            }}
                            title="Copy License Key"
                          >
                            📋
                          </button>
                        </div>
                        <div className="history-details">
                          <span>Hết hạn: {formatDate(license.expiryDate)}</span>
                          <span>
                            {license.data.mt} giải • {license.data.mm} máy
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}{" "}
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
                      alert(
                        "✅ Đã reset toàn bộ license. Reload trang để áp dụng."
                      );
                      window.location.reload();
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
    </div>
  );
}
