import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRole, ROLES } from "../context/RoleContext";
import { useOnboarding, CHECKLIST_STEPS } from "../context/OnboardingContext";
import {
  getLicenseStatus,
  getDaysRemaining,
  isTrialLicense,
} from "../services/licenseService";
import LicenseSplash from "../components/LicenseSplash/LicenseSplash";
import LicenseWarning from "../components/LicenseWarning/LicenseWarning";
import appIcon from "../assets/icon.png";
import "./RoleSelectPage.css";
import packageJson from "../../package.json";

/**
 * Trang chọn vai trò khi khởi động ứng dụng
 */
function RoleSelectPage() {
  const navigate = useNavigate();
  const { setRole } = useRole();
  const { 
    resolveStepRoute, 
    setActiveHint, 
    setShowHelpModal,
    handleReproduceFunction 
  } = useOnboarding();
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
    // Block access when license is expired (ONLY for Admin)
    const status = getLicenseStatus();
    if (role === ROLES.ADMIN && status.status === "expired") {
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

  // handleReproduceFunction moved to context

  return (
    <div className="role-select-page">
      {/* License Status Bar removed as per user request */}

      <div className="role-select-container">
        <div className="role-select-header">
          {" "}
          <div className="logo-icon">
            <img
              src={appIcon}
              alt="K-SPORT"
              className="logo-img"
            />
          </div>
          <h1>K-SPORT</h1>
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
          <div className="help-trigger" onClick={() => setShowHelpModal(true)}>
            <span className="help-icon">❓</span>
            <span>Hướng dẫn sử dụng</span>
          </div>
        </div>

        <div className="role-cards">
          {/* Admin Card */}
          <div
            className="role-card admin-card"
            onClick={() => handleSelectRole(ROLES.ADMIN)}
          >
            <div className="role-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="56" height="56" fill="none">
                <rect x="8" y="6" width="48" height="52" rx="6" fill="#1a5f7a" opacity="0.12"/>
                <path d="M32 8L14 16v14c0 11.05 7.7 21.38 18 24 10.3-2.62 18-12.95 18-24V16L32 8z" fill="#1a5f7a" opacity="0.18"/>
                <path d="M32 6L12 15v16c0 12.15 8.47 23.52 20 26.31C43.53 54.52 52 43.15 52 31V15L32 6z" fill="#1a5f7a" opacity="0.9"/>
                <circle cx="32" cy="29" r="9" fill="white" opacity="0.95"/>
                <path d="M28.5 29a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" fill="#1a5f7a"/>
                <path d="M32 20v3M32 35v3M41 29h-3M24 29h-3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
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
            <div className="role-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="56" height="56" fill="none">
                <rect x="14" y="10" width="36" height="46" rx="5" fill="#7c3aed" opacity="0.15"/>
                <rect x="14" y="10" width="36" height="46" rx="5" fill="#7c3aed" opacity="0.85"/>
                <rect x="24" y="6" width="16" height="10" rx="4" fill="#5b21b6"/>
                <rect x="26" y="4" width="12" height="7" rx="3" fill="#ddd6fe"/>
                <line x1="22" y1="26" x2="42" y2="26" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
                <line x1="22" y1="34" x2="42" y2="34" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
                <line x1="22" y1="42" x2="34" y2="42" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
                <circle cx="20" cy="26" r="2" fill="#ddd6fe"/>
                <circle cx="20" cy="34" r="2" fill="#ddd6fe"/>
                <circle cx="20" cy="42" r="2" fill="#ddd6fe"/>
              </svg>
            </div>
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
            <div className="role-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="56" height="56" fill="none">
                <circle cx="32" cy="16" r="9" fill="#059669" opacity="0.9"/>
                <circle cx="32" cy="16" r="6" fill="#d1fae5"/>
                <circle cx="32" cy="16" r="3" fill="#059669"/>
                <path d="M18 52c0-7.73 6.27-14 14-14s14 6.27 14 14" fill="#059669" opacity="0.85"/>
                <rect x="14" y="50" width="36" height="6" rx="3" fill="#059669" opacity="0.9"/>
                <rect x="30" y="30" width="4" height="10" rx="2" fill="#059669" opacity="0.7"/>
                <path d="M34 30 L42 24" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"/>
                <rect x="42" y="20" width="3" height="8" rx="1" fill="#10b981"/>
                <path d="M42 20 L48 22 L42 24Z" fill="#10b981"/>
              </svg>
            </div>
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
          <p>
            Phiên bản {packageJson.version}{" "}
            {packageJson.buildDate ? `(${packageJson.buildDate})` : ""} •
            Offline 100%
          </p>
        </div>
      </div>

      {/* License Startup Splash */}
      {showLicenseSplash && <LicenseSplash onDismiss={handleSplashDismiss} />}

      {/* License Warning Dialog */}
      {showLicenseWarning && (
        <LicenseWarning
          type={warningType}
          onCancel={() => setShowLicenseWarning(false)}
          onSuccess={handleLicenseSuccess}
        />
      )}

      {/* Help Modal moved to App.jsx */}
    </div>
  );
}

export default RoleSelectPage;
