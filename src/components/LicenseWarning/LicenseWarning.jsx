import { useState, useRef } from "react";
import {
  activateLicense,
  importLicenseFile,
  generateMachineId,
} from "../../services/licenseService";
import "./LicenseWarning.css";

export default function LicenseWarning({ type, onCancel, onSuccess }) {
  const fileInputRef = useRef(null);
  const machineId = generateMachineId();
  const [manualKey, setManualKey] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const machineIdInputRef = useRef(null);

  // Copy to clipboard function - works in both Electron and browser
  const handleCopyMachineId = async () => {
    try {
      // Try Electron API first
      if (window.electronAPI?.copyToClipboard) {
        await window.electronAPI.copyToClipboard(machineId);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        return;
      }

      // Try navigator.clipboard (may fail in some contexts)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(machineId);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        return;
      }

      // Fallback: Select text for manual copy
      if (machineIdInputRef.current) {
        machineIdInputRef.current.select();
        document.execCommand("copy");
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        return;
      }

      throw new Error("No copy method available");
    } catch (err) {
      console.error("Copy failed:", err);
      // Select text so user can Ctrl+C
      if (machineIdInputRef.current) {
        machineIdInputRef.current.select();
        alert("Vui lòng nhấn Ctrl+C để copy!");
      } else {
        alert("Không thể copy. Vui lòng copy thủ công.");
      }
    }
  };

  const handleManualActivate = async () => {
    if (!manualKey.trim()) {
      alert("Vui lòng nhập License Key!");
      return;
    }

    try {
      const result = await activateLicense(manualKey.trim(), machineId);

      if (result.valid) {
        alert("Kích hoạt bản quyền thành công!");
        if (onSuccess) onSuccess();
      } else {
        alert(`Lỗi kích hoạt: ${result.error || "Key không hợp lệ"}`);
      }
    } catch (err) {
      alert(`Lỗi hệ thống: ${err.message}`);
    }
  };

  const handleInstallClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await importLicenseFile(file);
      if (imported.valid) {
          // importLicenseFile already calls activateLicense internally in new version? 
          // Check licenseService implementation. 
          // Based on previous view, importLicenseFile calls activateLicense internally and returns result.
          // let's double check importLicenseFile implementation in licenseService.js
          // Yes, importLicenseFile calls activateLicense. So imported IS the result.
           alert("Cài đặt bản quyền thành công!");
           if (onSuccess) onSuccess();
      } else {
           alert(`Lỗi kích hoạt: ${imported.error}`);
      }
    } catch (err) {
      alert(`Lỗi đọc file: ${err.message}`);
    }

    // Reset input
    e.target.value = null;
  };

  const handleBuyClick = () => {
    alert("Vui lòng liên hệ luuquankarate@gmail.com để mua bản quyền.");
  };

  const handleRequestClick = () => {
    // Generate mailto link
    const subject = encodeURIComponent("Yêu cầu bản quyền sự kiện Online");
    const body = encodeURIComponent(
      `Xin chào,\n\nTôi muốn yêu cầu bản quyền cho sự kiện của mình.\nMachine ID của tôi là: ${machineId}`
    );
    window.open(
      `mailto:luuquankarate@gmail.com?subject=${subject}&body=${body}`,
      "_blank"
    );
  };

  return (
    <div className="license-warning-overlay">
      <div className="license-warning-container">
        {/* Header */}
        <div className="license-warning-header">
          <h3 className="license-warning-title">Chú ý!</h3>
          <button className="license-warning-close" onClick={onCancel}>
            ×
          </button>
        </div>

        {/* Body */}
        <div className="license-warning-body">
          <div className="license-warning-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z"
                fill="#3b82f6"
              />
            </svg>
          </div>
          <div className="license-warning-content" style={{ flex: 1 }}>
            <div className="license-warning-message">
              {type === "expired" ? (
                <p>
                  <strong>License của bạn đã hết hạn.</strong>
                  <br />
                  Vui lòng cài đặt license mới để tiếp tục sử dụng đầy đủ tính
                  năng.
                  <br />
                </p>
              ) : (
                <p>
                  Chưa có bản quyền hợp lệ được cài đặt. <br />
                  Nếu không cài đặt, phần mềm sẽ chạy ở chế độ{" "}
                  <strong>DEMO (Dùng thử 3 ngày)</strong>.
                </p>
              )}
            </div>
            <div
              className="machine-id-box"
              style={{
                marginTop: "1rem",
                background: "#e2e8f0",
                padding: "0.75rem",
                borderRadius: "4px",
              }}
            >
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "#64748b",
                  marginBottom: "0.25rem",
                }}
              >
                ID Máy tính của bạn:
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  ref={machineIdInputRef}
                  type="text"
                  readOnly
                  value={machineId}
                  onClick={(e) => e.target.select()}
                  style={{
                    flex: 1,
                    background: "#fff",
                    padding: "0.25rem 0.5rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    fontWeight: "bold",
                    fontSize: "0.9rem",
                    cursor: "text",
                  }}
                />
                <button
                  onClick={handleCopyMachineId}
                  style={{
                    cursor: "pointer",
                    padding: "0 0.75rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    background: copySuccess ? "#10b981" : "#fff",
                    color: copySuccess ? "#fff" : "inherit",
                    transition: "all 0.2s",
                    fontSize: "1rem",
                  }}
                  title="Copy ID"
                >
                  {copySuccess ? "✓" : "📋"}
                </button>
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginTop: "0.25rem",
                  fontStyle: "italic",
                }}
              >
                * Cung cấp ID này cho nhà cung cấp để nhận Key kích hoạt riêng
                cho máy này.
              </div>
            </div>

            {/* Manual Key Input */}
            <div style={{ marginTop: "1rem" }}>
              <div
                style={{
                  fontSize: "0.9rem",
                  fontWeight: "500",
                  marginBottom: "0.5rem",
                }}
              >
                Nhập mã License Key:
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  placeholder="Dán mã key vào đây..."
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                />
                <button
                  onClick={handleManualActivate}
                  style={{
                    padding: "0 1rem",
                    background: "#10b981",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Kích hoạt
                </button>
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginTop: "0.25rem",
                  fontStyle: "italic",
                }}
              >
                * Nếu Key có khóa theo ID máy, ID phải trùng khớp với ID máy bên
                trên.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="license-warning-footer">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".lic"
            onChange={handleFileChange}
          />

          <button
            className="license-btn btn-primary-install"
            onClick={handleInstallClick}
          >
            Mở file License (.lic)
          </button>

          <div style={{ flex: 1 }}></div>

          <button className="license-btn" onClick={handleBuyClick}>
            Mua License mới
          </button>
          <button className="license-btn btn-cancel" onClick={onCancel}>
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
