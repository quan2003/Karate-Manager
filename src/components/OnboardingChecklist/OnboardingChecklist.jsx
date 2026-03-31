/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-refresh/only-export-components */
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  useOnboarding,
  CHECKLIST_STEPS,
  NAVIGATION_HINTS,
} from "../../context/OnboardingContext";
import { useTournament, useTournamentDispatch } from "../../context/TournamentContext";
import { useRole, ROLES } from "../../context/RoleContext";
import { loadDemoData } from "../../services/demoDataService";
import "./OnboardingChecklist.css";

// ── Group meta ───────────────────────────────────────────────
const GROUP_META = {
  1: { name: "Thiết lập", color: "#2563eb", bg: "rgba(37,99,235,0.08)", icon: "⚙️" },
  2: { name: "Đăng ký",   color: "#d97706", bg: "rgba(217,119,6,0.08)", icon: "📝" },
  3: { name: "Sắp xếp",   color: "#ea580c", bg: "rgba(234,88,12,0.08)", icon: "🎯" },
  4: { name: "Thi đấu",   color: "#16a34a", bg: "rgba(22,163,74,0.08)", icon: "🥋" },
  5: { name: "Nâng cao",  color: "#7c3aed", bg: "rgba(124,58,237,0.08)", icon: "🚀" },
};

function groupSteps() {
  const groups = {};
  CHECKLIST_STEPS.forEach((s) => {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  });
  return groups;
}

// ── Step Row ─────────────────────────────────────────────────
function StepRow({ step, done, groupColor, onNavigate, onToggle, isNext }) {
  return (
    <div
      className={`oc-step${done ? " oc-step--done" : ""}${isNext ? " oc-step--next" : ""}`}
      onClick={() => onNavigate(step)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onNavigate(step)}
      title={step.actionLabel}
    >
      {/* Pulse dot on next step */}
      {isNext && !done && <span className="oc-step__pulse" />}

      {/* Status indicator */}
      <span
        className="oc-step__status"
        onClick={(e) => { e.stopPropagation(); onToggle(step.id, done); }}
        title={done ? "Bấm để bỏ tích" : "Bấm để tích thủ công"}
      >
        {done ? (
          <svg className="oc-check" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="10" className="oc-check__circle" />
            <path
              d="M6 10.5l3 3 5-6"
              stroke="white" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" fill="none"
            />
          </svg>
        ) : (
          <span className="oc-circle" style={{ borderColor: groupColor }} />
        )}
      </span>

      {/* Icon + content */}
      <span className="oc-step__icon">{step.icon}</span>
      <span className="oc-step__content">
        <span className="oc-step__label">{step.label}</span>
        <span className="oc-step__desc">{step.description}</span>
        {isNext && !done && (
          <span className="oc-step__action" style={{ color: groupColor }}>
            {step.actionLabel}
          </span>
        )}
      </span>

      {/* Arrow */}
      {!done && (
        <span className="oc-step__arrow" style={{ color: groupColor }}>›</span>
      )}
    </div>
  );
}

// ── Group Section ────────────────────────────────────────────
function GroupSection({ groupNum, steps, completedSteps, onNavigate, onToggle, collapsed, onToggleCollapse, nextStepId }) {
  const meta = GROUP_META[groupNum];
  const doneCount = steps.filter((s) => completedSteps[s.id]).length;
  const allDone = doneCount === steps.length;

  return (
    <div
      className={`oc-group oc-group--${groupNum}`}
      style={{ "--group-color": meta.color, "--group-bg": meta.bg }}
    >
      <button
        className={`oc-group__header${allDone ? " oc-group__header--done" : ""}`}
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
      >
        <span className="oc-group__icon">{meta.icon}</span>
        <span className="oc-group__name">{meta.name}</span>
        <span className="oc-group__count" style={{ background: allDone ? "#10b981" : meta.color }}>
          {doneCount}/{steps.length}
        </span>
        <svg
          className={`oc-group__chevron${collapsed ? "" : " oc-group__chevron--open"}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {!collapsed && (
        <div className="oc-group__steps">
          {steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              done={!!completedSteps[step.id]}
              groupColor={meta.color}
              onNavigate={onNavigate}
              onToggle={onToggle}
              isNext={step.id === nextStepId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Navigation Hint Banner ───────────────────────────────────
export function NavHintBanner() {
  const { activeHint, clearHint } = useOnboarding();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (activeHint) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [activeHint]);

  if (!activeHint) return null;
  const hintText = NAVIGATION_HINTS[activeHint] || "";

  return (
    <div className={`nav-hint-banner${visible ? " nav-hint-banner--visible" : ""}`}>
      <pre className="nav-hint-banner__text" style={{ whiteSpace: 'pre-wrap', fontStyle: 'italic', margin: 0 }}>{hintText}</pre>
      <button
        className="nav-hint-banner__close"
        onClick={() => { setVisible(false); setTimeout(clearHint, 350); }}
        aria-label="Đóng gợi ý"
      >✕</button>
    </div>
  );
}

// ── Main Checklist Sidebar ────────────────────────────────────
export default function OnboardingChecklist() {
  const navigate = useNavigate();
  const dispatch = useTournamentDispatch();
  const { tournaments } = useTournament();
  const { setRole } = useRole();
  const {
    completedSteps,
    markStepDone,
    markStepUndone,
    sidebarOpen,
    setSidebarOpen,
    completionPercent,
    demoDone,
    markDemoDone,
    resolveStepRoute,
    setActiveHint,
  } = useOnboarding();

  const groups = groupSteps();
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoMsg, setDemoMsg] = useState("");

  // ── Find the next undone step ID ──────────────────────────
  const nextStepId = CHECKLIST_STEPS.find(s => !completedSteps[s.id])?.id ?? null;

  // ── Navigate with smart hint ──────────────────────────────
  const handleNavigate = useCallback(
    (step) => {
      const result = resolveStepRoute(step);
      if (!result) return;
      const { path, hint } = result;

      // Ensure user is in Admin role if they clicked this from Home
      setRole(ROLES.ADMIN);

      // Set hint to be shown on landing page
      if (hint) {
        setActiveHint(hint);
        sessionStorage.setItem("krt_nav_hint", hint);
      }

      navigate(path);
    },
    [resolveStepRoute, navigate, setActiveHint, setRole]
  );

  const handleToggle = useCallback(
    (stepId, currentlyDone) => {
      if (currentlyDone) markStepUndone(stepId);
      else markStepDone(stepId);
    },
    [markStepDone, markStepUndone]
  );

  const toggleGroupCollapse = (groupNum) => {
    setCollapsedGroups(prev => ({ ...prev, [groupNum]: !prev[groupNum] }));
  };

  const handleLoadDemo = async () => {
    if (demoLoading || demoDone) return;
    setDemoLoading(true);
    setDemoMsg("");
    try {
      await loadDemoData(dispatch, tournaments);
      markDemoDone();
      setDemoMsg("✅ Đã tải dữ liệu mẫu! Thử bốc thăm & in PDF ngay.");
    } catch (e) {
      setDemoMsg("❌ " + e.message);
    } finally {
      setDemoLoading(false);
    }
  };

  const doneCount = Object.values(completedSteps).filter(Boolean).length;

  // ── COLLAPSED ─────────────────────────────────────────────
  if (!sidebarOpen) {
    return (
      <button
        className="oc-toggle-btn"
        onClick={() => setSidebarOpen(true)}
        title="Mở bảng hướng dẫn giải đấu"
        aria-label="Mở bảng hướng dẫn"
      >
        <span className="oc-toggle-btn__icon">📋</span>
        <span className="oc-toggle-btn__pct">{completionPercent}%</span>
        {nextStepId && <span className="oc-toggle-btn__dot" />}
      </button>
    );
  }

  // ── EXPANDED ──────────────────────────────────────────────
  return (
    <aside className="oc-sidebar" role="complementary" aria-label="Lộ trình giải đấu">
      {/* ── Header ── */}
      <div className="oc-header">
        <div className="oc-header__top">
          <span className="oc-header__icon">🗺️</span>
          <div className="oc-header__titles">
            <h2 className="oc-title">Hướng dẫn từng bước</h2>
            <p className="oc-subtitle">
              {doneCount}/{CHECKLIST_STEPS.length} bước hoàn thành
            </p>
          </div>
          <button className="oc-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Thu gọn">✕</button>
        </div>

        {/* Progress */}
        <div className="oc-progress-wrap">
          <div className="oc-progress-bar" role="progressbar" aria-valuenow={completionPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className="oc-progress-fill" style={{ width: `${completionPercent}%` }} />
          </div>
          <span className="oc-progress-label">{completionPercent}%</span>
        </div>

        {completionPercent === 100 && (
          <div className="oc-congrats">🎉 Tuyệt vời! Hoàn tất cả 12 bước!</div>
        )}
        {completionPercent > 0 && completionPercent < 100 && (
          <p className="oc-hint">Bạn đã hoàn thành <strong>{completionPercent}%</strong> công tác chuẩn bị</p>
        )}
        {completionPercent === 0 && (
          <p className="oc-hint">Bấm vào từng bước để được dẫn đến đúng trang cần làm.</p>
        )}
      </div>

      {/* ── Steps ── */}
      <div className="oc-body">
        {Object.keys(groups).map((gn) => (
          <GroupSection
            key={gn}
            groupNum={parseInt(gn)}
            steps={groups[gn]}
            completedSteps={completedSteps}
            onNavigate={handleNavigate}
            onToggle={handleToggle}
            collapsed={!!collapsedGroups[gn]}
            onToggleCollapse={() => toggleGroupCollapse(parseInt(gn))}
            nextStepId={nextStepId}
          />
        ))}
      </div>

      {/* ── Demo Data ── */}
      {!demoDone ? (
        <div className="oc-demo-section">
          <p className="oc-demo-desc">
            <strong>🎮 Dùng thử lần đầu?</strong><br />
            Nạp dữ liệu mẫu để trải nghiệm toàn bộ tính năng ngay.
          </p>
          <button className="oc-demo-btn" onClick={handleLoadDemo} disabled={demoLoading}>
            {demoLoading ? "Đang tải..." : "📦 Tải dữ liệu mẫu"}
          </button>
          {demoMsg && <p className="oc-demo-msg">{demoMsg}</p>}
        </div>
      ) : (
        <div className="oc-demo-section oc-demo-section--done">
          <p className="oc-demo-desc">✅ Đã nạp dữ liệu mẫu</p>
        </div>
      )}
    </aside>
  );
}
