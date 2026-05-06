import { useEffect, useState } from "react";
import { getLicenseStatus } from "../../services/licenseService";
import LicenseManager from "../LicenseManager/LicenseManager";
import LicenseWarning from "../LicenseWarning/LicenseWarning";
import "./LicenseBadge.css";

export default function LicenseBadge() {
  const [status, setStatus] = useState(null);
  const [showManager, setShowManager] = useState(false);
  const [showPurchase, setShowPurchase] = useState(false);

  useEffect(() => {
    const updateStatus = () => {
      setStatus(getLicenseStatus());
    };

    updateStatus();
    window.addEventListener("licenseChanged", updateStatus);

    return () => {
      window.removeEventListener("licenseChanged", updateStatus);
    };
  }, []);

  const handleLicenseChanged = () => {
    setStatus(getLicenseStatus());
    window.dispatchEvent(new CustomEvent("licenseChanged"));
  };

  const handleBuyLicense = () => {
    setShowManager(false);
    setShowPurchase(true);
  };

  if (!status) return null;

  const isNone = status.status === "none";
  const isTrial = status.status === "trial";
  const isActive = status.status === "active";
  const isExpired = status.status === "expired";

  return (
    <>
      <div
        className={`license-badge ${isNone ? "none" : ""} ${
          isTrial ? "trial" : ""
        } ${isActive ? "active" : ""} ${isExpired ? "expired" : ""}`}
        onClick={() => setShowManager(true)}
        title="Click để quản lý bản quyền"
      >
        <div className="badge-icon">
          {isNone && "🔒"}
          {isTrial && "🔓"}
          {isActive && "✅"}
          {isExpired && "❌"}
        </div>
        <div className="badge-content">
          <div className="badge-label">
            {isNone && "CHƯA BẢN QUYỀN"}
            {isTrial && "BẢN DÙNG THỬ"}
            {isActive && "BẢN QUYỀN"}
            {isExpired && "HẾT HẠN"}
          </div>
          <div className="badge-detail">
            {isNone && <span>Mua bản quyền</span>}
            {status.daysRemaining !== undefined && status.daysRemaining > 0 && (
              <span>Còn {status.daysRemaining} ngày</span>
            )}
            {isExpired && <span>Vui lòng gia hạn</span>}
          </div>
        </div>
      </div>

      {showManager && (
        <LicenseManager
          onClose={() => setShowManager(false)}
          onLicenseChanged={handleLicenseChanged}
          onBuyLicense={handleBuyLicense}
        />
      )}

      {showPurchase && (
        <LicenseWarning
          type={isExpired ? "expired" : "demo"}
          purchaseOnly
          onCancel={() => setShowPurchase(false)}
          onSuccess={() => {
            setShowPurchase(false);
            handleLicenseChanged();
          }}
        />
      )}
    </>
  );
}
