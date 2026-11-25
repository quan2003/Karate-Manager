import { useEffect, useRef, useState } from "react";

export function HelpTip({ title, description, example }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: "4px" }}>
      <button
        type="button"
        aria-label={`Giải thích: ${title}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          border: "1px solid #94a3b8",
          background: open ? "#2563eb" : "#f1f5f9",
          color: open ? "#ffffff" : "#475569",
          fontSize: "10px",
          fontWeight: 800,
          lineHeight: 1,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        ?
      </button>
      {open && (
        <div
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "22px",
            left: 0,
            zIndex: 9999,
            width: "260px",
            maxWidth: "80vw",
            padding: "10px 12px",
            borderRadius: "8px",
            background: "#0f172a",
            color: "#f8fafc",
            boxShadow: "0 10px 25px rgba(15, 23, 42, 0.35)",
            fontSize: "11.5px",
            fontWeight: 400,
            lineHeight: 1.45,
            textAlign: "left",
          }}
        >
          <div style={{ fontWeight: 700, color: "#93c5fd", marginBottom: "4px" }}>{title}</div>
          <div>{description}</div>
          {example && (
            <div style={{ marginTop: "5px", paddingTop: "5px", borderTop: "1px solid #334155", color: "#cbd5e1", fontSize: "11px" }}>
              <strong>Ví dụ:</strong> {example}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

