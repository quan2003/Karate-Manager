import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function GuidedTourOverlay({
  isOpen,
  steps = [],
  stepIndex = 0,
  onStepChange,
  onSkip,
  onFinish,
  onPrepareStep,
}) {
  const [rect, setRect] = useState(null);
  const currentStep = steps[stepIndex] || null;

  const measureTarget = useCallback(() => {
    if (!isOpen || !currentStep?.targetId) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour-id="${currentStep.targetId}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    setRect({
      top: Math.max(8, r.top - 4),
      left: Math.max(8, r.left - 4),
      width: Math.min(window.innerWidth - 16, r.width + 8),
      height: Math.min(window.innerHeight - 16, r.height + 8),
    });
  }, [isOpen, currentStep]);

  useEffect(() => {
    if (!isOpen || !currentStep) return undefined;
    if (onPrepareStep) onPrepareStep(currentStep);

    const t1 = setTimeout(measureTarget, 80);
    const t2 = setTimeout(measureTarget, 260);
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [isOpen, currentStep, onPrepareStep, measureTarget]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip?.(stepIndex);
      } else if (e.key === "ArrowRight") {
        if (stepIndex < steps.length - 1) onStepChange?.(stepIndex + 1);
      } else if (e.key === "ArrowLeft") {
        if (stepIndex > 0) onStepChange?.(stepIndex - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, stepIndex, steps.length, onSkip, onStepChange]);

  if (!isOpen || !currentStep) return null;

  const isLast = stepIndex >= steps.length - 1;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const cardWidth = Math.min(360, vw - 24);

  let cardTop = Math.max(16, (vh - 220) / 2);
  let cardLeft = Math.max(12, (vw - cardWidth) / 2);
  if (rect) {
    const spaceBelow = vh - (rect.top + rect.height);
    if (spaceBelow >= 210) {
      cardTop = rect.top + rect.height + 12;
    } else if (rect.top >= 210) {
      cardTop = Math.max(12, rect.top - 210);
    } else {
      cardTop = Math.max(12, vh - 230);
    }
    cardLeft = Math.max(12, Math.min(vw - cardWidth - 12, rect.left));
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={currentStep.title}
      style={{ position: "fixed", inset: 0, zIndex: 10050, pointerEvents: "auto" }}
    >
      {/* Dimmed Backdrop or Spotlight */}
      {rect ? (
        <div
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: "10px",
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.62)",
            border: "2.5px solid #38bdf8",
            pointerEvents: "none",
            transition: "all 0.2s ease",
          }}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.62)" }} />
      )}

      {/* Tooltip Card */}
      <div
        style={{
          position: "fixed",
          top: cardTop,
          left: cardLeft,
          width: cardWidth,
          background: "#ffffff",
          borderRadius: "12px",
          padding: "14px 16px",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.35)",
          border: "1px solid #cbd5e1",
          zIndex: 10051,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 800, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "999px" }}>
            Hướng dẫn {stepIndex + 1} / {steps.length}
          </span>
          <button
            type="button"
            onClick={() => onSkip?.(stepIndex)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11.5px", color: "#64748b", fontWeight: 600 }}
          >
            Bỏ qua (ESC)
          </button>
        </div>

        <div style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", marginBottom: "6px" }}>
          {currentStep.title}
        </div>
        <div style={{ fontSize: "12.5px", color: "#334155", lineHeight: 1.5 }}>
          {currentStep.content}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={stepIndex === 0}
            onClick={() => onStepChange?.(Math.max(0, stepIndex - 1))}
          >
            ← Quay lại
          </button>
          <div style={{ display: "flex", gap: "6px" }}>
            {!isLast ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onStepChange?.(stepIndex + 1)}
              >
                Tiếp theo →
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm"
                style={{ background: "#16a34a", color: "#fff", border: "none", fontWeight: 700 }}
                onClick={() => onFinish?.()}
              >
                ✅ Hoàn thành
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

