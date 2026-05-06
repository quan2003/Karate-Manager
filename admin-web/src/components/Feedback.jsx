import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, X, XCircle } from "lucide-react";

export function Toast({ notification, onClose }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!notification) return;
    setProgress(100);
    const duration = 3000;
    const interval = 30;
    const step = (interval / duration) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - step;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  const isError = notification.type === "error";
  return (
    <div className="fixed top-5 right-5 z-[100] animate-slide-in max-w-sm w-full">
      <div
        className={`relative overflow-hidden rounded-xl shadow-2xl border ${
          isError
            ? "bg-red-950/90 border-red-500/30"
            : "bg-emerald-950/90 border-emerald-500/30"
        } backdrop-blur-lg`}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <div
            className={`flex-shrink-0 mt-0.5 ${
              isError ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {isError ? <XCircle size={20} /> : <CheckCircle size={20} />}
          </div>
          <p className="text-sm text-white font-medium flex-1">
            {notification.message}
          </p>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
        <div
          className={`h-0.5 transition-all ease-linear ${
            isError ? "bg-red-500" : "bg-emerald-500"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  icon: Icon = AlertTriangle,
  iconColor = "bg-amber-500/20",
  confirmText = "Xác nhận",
  confirmColor = "bg-amber-600 hover:bg-amber-700",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const iconTextColor = iconColor.includes("red")
    ? "text-red-400"
    : iconColor.includes("blue")
    ? "text-blue-400"
    : "text-amber-400";

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[90] p-4"
      onClick={onCancel}
    >
      <div
        className="glass-card w-full max-w-sm animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${iconColor}`}
          >
            <Icon size={28} className={iconTextColor} />
          </div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-sm text-slate-400 mt-2">{message}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 btn hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg border border-slate-600"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 btn text-white px-4 py-2.5 rounded-lg font-medium ${confirmColor}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
