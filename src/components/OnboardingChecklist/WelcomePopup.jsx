import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useOnboarding } from "../../context/OnboardingContext";
import "./WelcomePopup.css";

export default function WelcomePopup() {
  const { showWelcomePopup, dismissWelcomePopup } = useOnboarding();
  const navigate = useNavigate();

  const handleStart = useCallback(() => {
    dismissWelcomePopup(true);
    // Navigate to admin to begin
    navigate("/admin");
  }, [dismissWelcomePopup, navigate]);

  const handleSkip = useCallback(() => {
    dismissWelcomePopup(false);
  }, [dismissWelcomePopup]);

  if (!showWelcomePopup) return null;

  return (
    <div className="wp-overlay" role="dialog" aria-modal="true" aria-labelledby="wp-title">
      <div className="wp-modal">
        {/* Hero illustration */}
        <div className="wp-hero">
          <div className="wp-hero__orb wp-hero__orb--1" />
          <div className="wp-hero__orb wp-hero__orb--2" />
          <div className="wp-hero__orb wp-hero__orb--3" />
          <span className="wp-hero__emoji">🥋</span>
        </div>

        {/* Content */}
        <div className="wp-content">
          <h1 id="wp-title" className="wp-title">
            Chào mừng đến với<br />
            <span className="wp-title--accent">K-SPORT</span>
          </h1>
          <p className="wp-desc">
            Hệ thống sẽ hướng dẫn bạn qua <strong>12 bước</strong> từ khi tạo giải
            đến ngày bế mạc. Mỗi bước hoàn thành sẽ tự động được đánh dấu ✅.
          </p>

          {/* 4 steps preview */}
          <div className="wp-phases">
            {[
              { icon: "⚙️", label: "Thiết lập", color: "#2563eb", steps: "3 bước" },
              { icon: "📝", label: "Đăng ký",   color: "#d97706", steps: "3 bước" },
              { icon: "🎯", label: "Sắp xếp",   color: "#ea580c", steps: "3 bước" },
              { icon: "🥋", label: "Thi đấu",   color: "#16a34a", steps: "3 bước" },
            ].map((phase) => (
              <div
                key={phase.label}
                className="wp-phase"
                style={{ borderColor: phase.color, background: `${phase.color}12` }}
              >
                <span className="wp-phase__icon">{phase.icon}</span>
                <span className="wp-phase__label" style={{ color: phase.color }}>{phase.label}</span>
                <span className="wp-phase__steps">{phase.steps}</span>
              </div>
            ))}
          </div>

          <p className="wp-tip">
            💡 Thanh hướng dẫn xổ ra ở <strong>góc phải màn hình</strong> — bạn có thể thu gọn bất cứ lúc nào.
          </p>
        </div>

        {/* Actions */}
        <div className="wp-actions">
          <button id="wp-start-btn" className="wp-btn wp-btn--primary" onClick={handleStart}>
            🚀 Bắt đầu từ Bước 1
          </button>
          <button className="wp-btn wp-btn--secondary" onClick={handleSkip}>
            Bỏ qua, tôi đã biết
          </button>
        </div>
      </div>
    </div>
  );
}
