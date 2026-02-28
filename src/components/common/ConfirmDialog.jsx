import { useEffect, useRef } from "react";
import "./ConfirmDialog.css";

/**
 * Custom confirm dialog to replace native confirm()
 * Native confirm() in Electron causes focus issues - inputs in subsequent modals can't be clicked.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Xác nhận",
  cancelText = "Hủy",
  type = "warning",
}) {
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // Focus confirm button when dialog opens
      setTimeout(() => confirmBtnRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Enter") {
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  const iconMap = {
    warning: "⚠️",
    danger: "🗑️",
    info: "ℹ️",
  };

  return (
    <div className="confirm-dialog-overlay" onMouseDown={onCancel}>
      <div className="confirm-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-icon">{iconMap[type] || "⚠️"}</div>
        {title && <h3 className="confirm-dialog-title">{title}</h3>}
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            className={`confirm-dialog-btn confirm ${type}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
