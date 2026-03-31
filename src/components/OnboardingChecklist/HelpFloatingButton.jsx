import { useOnboarding } from "../../context/OnboardingContext";
import "./HelpFloatingButton.css";

const HelpFloatingButton = () => {
  const { setShowHelpModal } = useOnboarding();

  return (
    <button 
      className="help-floating-btn" 
      onClick={() => setShowHelpModal(true)}
      title="Hướng dẫn sử dụng & Tái hiện chức năng"
    >
      <span className="help-icon">❓</span>
      <span className="help-label">Hỏi đáp & Hướng dẫn</span>
    </button>
  );
};

export default HelpFloatingButton;
