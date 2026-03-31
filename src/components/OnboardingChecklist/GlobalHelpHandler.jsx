import { useEffect } from "react";
import { useOnboarding } from "../../context/OnboardingContext";

/**
 * GlobalHelpHandler
 * Listens for cross-window messages to open the help modal.
 * This is useful for scoreboard windows that need to trigger help in the main app.
 */
const GlobalHelpHandler = () => {
  const { setShowHelpModal } = useOnboarding();

  useEffect(() => {
    const handleMessage = (event) => {
      // Security check: only accept messages from same origin if possible, 
      // but in Electron file:// might be tricky. Using type check for now.
      if (event.data && event.data.type === "OPEN_HELP") {
        setShowHelpModal(true);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [setShowHelpModal]);

  return null; // This component doesn't render anything
};

export default GlobalHelpHandler;
