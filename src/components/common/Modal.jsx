import { useState, useEffect, useCallback, useRef } from "react";
import "./Modal.css";

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "medium",
}) {
  const [isClosing, setIsClosing] = useState(false);
  const closingTimerRef = useRef(null);

  // Reset isClosing whenever isOpen changes
  useEffect(() => {
    if (isOpen) {
      // Clear any pending close timer & reset closing state
      if (closingTimerRef.current) {
        clearTimeout(closingTimerRef.current);
        closingTimerRef.current = null;
      }
      setIsClosing(false);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
      if (closingTimerRef.current) {
        clearTimeout(closingTimerRef.current);
        closingTimerRef.current = null;
      }
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isClosing) return; // Prevent double-close
    setIsClosing(true);
    closingTimerRef.current = setTimeout(() => {
      setIsClosing(false);
      closingTimerRef.current = null;
      onClose();
    }, 200);
  }, [isClosing, onClose]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen && !isClosing) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, isClosing, handleClose]);

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={`modal-overlay ${isClosing ? "closing" : ""}`}
      onMouseDown={handleClose}
    >
      <div
        className={`modal modal-${size} ${isClosing ? "closing" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={handleClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
