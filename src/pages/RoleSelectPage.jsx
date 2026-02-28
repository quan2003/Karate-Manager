import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRole, ROLES } from "../context/RoleContext";
import {
  getLicenseStatus,
  getDaysRemaining,
  isTrialLicense,
} from "../services/licenseService";
import LicenseSplash from "../components/LicenseSplash/LicenseSplash";
import LicenseWarning from "../components/LicenseWarning/LicenseWarning";
import "./RoleSelectPage.css";

/**
 * Trang chọn vai trò khi khởi động ứng dụng
 */
function RoleSelectPage() {
  const navigate = useNavigate();
  const { setRole } = useRole();
  const [showLicenseSplash, setShowLicenseSplash] = useState(true); // Default show splash
  const [showLicenseWarning, setShowLicenseWarning] = useState(false);
  const [warningType, setWarningType] = useState("demo"); // 'demo' or 'expired'

  const [licenseStatus, setLicenseStatus] = useState(null);

  // Load license status on mount
  useEffect(() => {
    refreshLicenseStatus();
  }, []);

  const refreshLicenseStatus = () => {
    const status = getLicenseStatus();
    setLicenseStatus(status);
  };

  const handleSplashDismiss = () => {
    setShowLicenseSplash(false);

    // Check license to show warning
    const status = getLicenseStatus();
    if (status.status === "expired") {
      setWarningType("expired");
      setShowLicenseWarning(true);
    } else if (status.status === "none" || status.status === "trial") {
      setWarningType("demo");
      setShowLicenseWarning(true);
    }
  };

  const handleLicenseSuccess = () => {
    setShowLicenseWarning(false);
    refreshLicenseStatus();
  };

  const handleSelectRole = (role) => {
    // Block all access when license is expired
    const status = getLicenseStatus();
    if (status.status === "expired") {
      setWarningType("expired");
      setShowLicenseWarning(true);
      return;
    }

    setRole(role);
    if (role === ROLES.ADMIN) {
      navigate("/admin");
    } else if (role === ROLES.SECRETARY) {
      navigate("/secretary");
    } else {
      navigate("/coach");
    }
  };

  return (
    <div className="role-select-page">
      {/* License Status Bar removed as per user request */}

      <div className="role-select-container">
        <div className="role-select-header">
          <div className="logo-icon">🥋</div>
          <h1>Karate Tournament Manager</h1>
          <p className="subtitle">Hệ thống quản lý giải đấu Karate</p>
          {licenseStatus?.status === "expired" && (
            <div
              style={{
                background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                color: "white",
                padding: "0.75rem 1.5rem",
                borderRadius: "8px",
                marginTop: "1rem",
                fontSize: "0.95rem",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(220, 38, 38, 0.3)",
              }}
              onClick={() => {
                setWarningType("expired");
                setShowLicenseWarning(true);
              }}
            >
              ⛔ License đã hết hạn — Nhấn để kích hoạt bản quyền
            </div>
          )}
        </div>

        <div className="role-cards">
          {/* Admin Card */}
          <div
            className="role-card admin-card"
            onClick={() => handleSelectRole(ROLES.ADMIN)}
          >
            <div className="role-icon">👨‍💼</div>
            <h2>Admin</h2>
            <p className="role-description">
              Quản lý giải đấu, tạo file .krt, import danh sách VĐV từ HLV
            </p>
            <ul className="role-features">
              <li>✅ Tạo và quản lý giải đấu</li>
              <li>✅ Xuất file .krt cho HLV</li>
              <li>✅ Import danh sách VĐV</li>
              <li>✅ Chốt danh sách chính thức</li>
            </ul>
            <button className="role-btn admin-btn">
              Vào với vai trò Admin
            </button>
          </div>

          {/* Secretary Card */}
          <div
            className="role-card secretary-card"
            onClick={() => handleSelectRole(ROLES.SECRETARY)}
          >
            <div className="role-icon">🎯</div>
            <h2>Thư ký</h2>
            <p className="role-description">
              Bấm điểm các trận đấu, quản lý sigma và xuất kết quả
            </p>
            <ul className="role-features">
              <li>✅ Mở file chấm điểm .kmatch</li>
              <li>✅ Bấm điểm trận đấu</li>
              <li>✅ Quản lý Sigma</li>
              <li>✅ Xuất kết quả cho Admin</li>
            </ul>
            <button className="role-btn secretary-btn">
              Vào với vai trò Thư ký
            </button>
          </div>

          {/* Coach Card */}
          <div
            className="role-card coach-card"
            onClick={() => handleSelectRole(ROLES.COACH)}
          >
            <div className="role-icon">🏆</div>
            <h2>Huấn luyện viên</h2>
            <p className="role-description">
              Mở file .krt, nhập danh sách VĐV trong thời hạn cho phép
            </p>
            <ul className="role-features">
              <li>✅ Mở file .krt từ Admin</li>
              <li>✅ Nhập danh sách VĐV</li>
              <li>✅ Chỉnh sửa thông tin VĐV</li>
              <li>✅ Xuất file gửi Admin</li>
              <li>⏰ Theo thời hạn quy định</li>
            </ul>
            <button className="role-btn coach-btn">Vào với vai trò HLV</button>
          </div>
        </div>

        <div className="role-select-footer">
          <p>Phiên bản 1.0.1 (28/02/2026) • Offline 100%</p>
        </div>
      </div>

      {/* License Startup Splash */}
      {showLicenseSplash && <LicenseSplash onDismiss={handleSplashDismiss} />}

      {/* License Warning Dialog */}
      {showLicenseWarning && (
        <LicenseWarning
          type={warningType}
          onCancel={
            warningType === "expired"
              ? () => {}
              : () => setShowLicenseWarning(false)
          }
          onSuccess={handleLicenseSuccess}
        />
      )}
    </div>
  );
}

export default RoleSelectPage;
