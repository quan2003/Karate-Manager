import { useMemo, useState } from "react";
import { HelpTip } from "../onboarding/ContextualHelp";

const RULE_CYCLE_5 = ["auto", "allowed", "required", "preferred", "forbidden"];
const RULE_BADGES_5 = {
  auto: { label: "", bg: "#ffffff", color: "#475569", border: "#cbd5e1" },
  allowed: { label: "✓ Cho phép: ", bg: "#f0fdf4", color: "#15803d", border: "#86efac" },
  required: { label: "★ Bắt buộc: ", bg: "#2563eb", color: "#ffffff", border: "#1d4ed8" },
  preferred: { label: "↑ Ưu tiên: ", bg: "#16a34a", color: "#ffffff", border: "#15803d" },
  forbidden: { label: "✕ Cấm: ", bg: "#dc2626", color: "#ffffff", border: "#b91c1c" },
};

export function WizardStep4Mats({
  matCount,
  perMatRules,
  setPerMatRules,
  ageGroupChips,
  applyQuickMatPreset,
  preflightCheck,
  matOperatingWindows,
  setMatOperatingWindows,
}) {
  const cycleMatTag = (matNum, tag) => {
    setPerMatRules((prev) => {
      const mObj = { ...(prev[matNum] || {}) };
      const curr = mObj[tag] || "auto";
      const next = RULE_CYCLE_5[(RULE_CYCLE_5.indexOf(curr) + 1) % RULE_CYCLE_5.length];
      if (next === "auto") delete mObj[tag];
      else mObj[tag] = next;
      return { ...prev, [matNum]: mObj };
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <strong style={{ fontSize: "13px", color: "#0f172a" }}>
          🏟️ Bước 4: Phân bổ Thảm (Click chip: Tự động → Cho phép → ★ Bắt buộc → ↑ Ưu tiên → ✕ Cấm)
        </strong>
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "11px" }} onClick={() => applyQuickMatPreset("auto")}>⚖️ Tự động cân bằng</button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "11px" }} onClick={() => applyQuickMatPreset("kata_kumite_split")}>🥋 Thảm cuối chỉ Kumite</button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "11px" }} onClick={() => applyQuickMatPreset("separate_kata_kumite")}>🔀 Tách Kata / Kumite</button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "11px" }} onClick={() => applyQuickMatPreset("by_age")}>🎂 Theo lứa tuổi</button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "11px" }} onClick={() => applyQuickMatPreset("by_gender")}>👥 Nam / Nữ</button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: "11px" }} onClick={() => applyQuickMatPreset("by_event_type")}>🥇 Cá nhân / ĐĐ</button>
        </div>
      </div>

      <div style={{ fontSize: "11px", color: "#475569", padding: "6px 10px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
        💡 <strong>Giải thích quy tắc:</strong> Đặt <em>★ Bắt buộc: Kumite</em> (hoặc <em>✕ Cấm: Kata</em>) trên Thảm 3 nghĩa là <strong>Thảm 3 chỉ nhận Kumite</strong>; các thảm khác ở chế độ <em>Tự động</em> vẫn nhận được cả Kata và Kumite.
      </div>

      {!preflightCheck.valid && (
        <div style={{ padding: "8px 10px", borderRadius: "6px", background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", fontSize: "12px" }}>
          ⚠️ <strong>Phát hiện mâu thuẫn:</strong> {preflightCheck.errors[0]}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, matCount))}, minmax(0, 1fr))`, gap: "8px" }}>
        {Array.from({ length: matCount }, (_, idx) => idx + 1).map((m) => {
          const mRules = perMatRules[m] || {};
          const mOp = matOperatingWindows[m] || {};
          const baseTags = [
            { key: "kata", label: "Kata" },
            { key: "kumite", label: "Kumite" },
            { key: "male", label: "Nam" },
            { key: "female", label: "Nữ" },
            { key: "individual", label: "Cá nhân" },
            { key: "team", label: "Đồng đội" },
            { key: "absolute", label: "Tuyệt đối" },
            ...ageGroupChips.map((ag) => ({
              key: `age:${ag.key}`,
              label: ag.label.replace(/lứa tuổi\s*/i, "").replace(/tuổi trở lên/i, "+"),
            })),
          ];
          return (
            <div key={m} style={{ padding: "8px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #cbd5e1", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a" }}>Thảm {m}</div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {baseTags.map((t) => {
                  const mode = mRules[t.key] || "auto";
                  const st = RULE_BADGES_5[mode] || RULE_BADGES_5.auto;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => cycleMatTag(m, t.key)}
                      style={{
                        fontSize: "10px", padding: "2px 6px", borderRadius: "5px", cursor: "pointer", fontWeight: 700,
                        background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                      }}
                    >
                      {st.label}{t.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "5px", fontSize: "10px", color: "#475569" }}>
                Giờ hoạt động riêng (tùy chọn):
                <div style={{ display: "flex", gap: "4px", marginTop: "3px" }}>
                  <input type="time" className="input" style={{ padding: "2px 4px", fontSize: "10px" }} value={mOp.start || ""} onChange={(e) => setMatOperatingWindows((p) => ({ ...p, [m]: { ...(p[m] || {}), start: e.target.value } }))} />
                  <input type="time" className="input" style={{ padding: "2px 4px", fontSize: "10px" }} value={mOp.end || ""} onChange={(e) => setMatOperatingWindows((p) => ({ ...p, [m]: { ...(p[m] || {}), end: e.target.value } }))} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WizardStep5KarateRules({
  kataMode,
  setKataMode,
  karateOrderMode,
  setKarateOrderMode,
  intraAgeMode,
  setIntraAgeMode,
  absoluteLast,
  setAbsoluteLast,
  keepPinned,
  setKeepPinned,
  tournamentDays,
  categories,
  categoryDaySessionRules,
  setCategoryDaySessionRules,
}) {
  const [ruleCatId, setRuleCatId] = useState("");
  const [ruleDay, setRuleDay] = useState("");
  const [ruleSession, setRuleSession] = useState("");

  const activeCategories = useMemo(
    () => categories.filter((c) => (c.athletes || []).length > 0),
    [categories]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <strong style={{ fontSize: "13px", color: "#0f172a" }}>
        🥋 Bước 5: Yêu cầu chuyên môn Karate (Phân biệt Bắt buộc & Ưu tiên)
      </strong>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "8px", padding: "10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          <span>Trình tự Kata & Kumite <HelpTip title="Trình tự Kata / Kumite" description="Quy định thảm phải thi xong Kata trước khi chuyển sang Kumite hay linh hoạt." /></span>
          <select className="input" value={kataMode} onChange={(e) => setKataMode(e.target.value)}>
            <option value="per_mat_kata_first">Bắt buộc: Từng thảm xong Kata → Kumite</option>
            <option value="global_kata_first">Bắt buộc: Toàn giải xong Kata → Kumite</option>
            <option value="flexible">Linh hoạt (không ép)</option>
          </select>
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          <span>Thứ tự lứa tuổi <HelpTip title="Thứ tự lứa tuổi" description="Ưu tiên lứa tuổi nhỏ đấu sớm hoặc sắp xếp theo nhóm tuổi." /></span>
          <select className="input" value={karateOrderMode} onChange={(e) => setKarateOrderMode(e.target.value)}>
            <option value="kata_then_kumite">Ưu tiên: Nhỏ → Lớn (Kata trước)</option>
            <option value="age_young_first">Ưu tiên: Xong từng lứa tuổi (Nhỏ → Lớn)</option>
            <option value="age_old_first">Ưu tiên: Xong từng lứa tuổi (Lớn → Nhỏ)</option>
          </select>
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          <span>CN Nam → CN Nữ → ĐĐ Nam → ĐĐ Nữ <HelpTip title="Trình tự Nam/Nữ cùng tuổi" description="Quy định thứ tự thi đấu bên trong cùng 1 lứa tuổi." /></span>
          <select className="input" value={intraAgeMode} onChange={(e) => setIntraAgeMode(e.target.value)}>
            <option value="preferred">Ưu tiên mềm</option>
            <option value="required">Bắt buộc nghiêm ngặt</option>
            <option value="none">Không áp dụng</option>
          </select>
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          Vô địch tuyệt đối vào cuối chương trình
          <select className="input" value={absoluteLast} onChange={(e) => setAbsoluteLast(e.target.value)}>
            <option value="preferred">Ưu tiên vào cuối</option>
            <option value="none">Không ép thứ tự</option>
          </select>
        </label>
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", fontWeight: 600 }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
            <input type="checkbox" checked={keepPinned} onChange={(e) => setKeepPinned(e.target.checked)} />
            Bắt buộc giữ nguyên các nội dung đã ghim cố định
          </label>
        </div>
      </div>

      {/* Category Day / Session pinning */}
      <div style={{ padding: "10px", background: "#fff", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <div style={{ fontSize: "11.5px", fontWeight: 700, marginBottom: "6px", color: "#334155" }}>
          📅 Gán nội dung bắt buộc thi đấu theo Ngày hoặc Buổi (tùy chọn):
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
          <select className="input" style={{ flex: 1, minWidth: "180px" }} value={ruleCatId} onChange={(e) => setRuleCatId(e.target.value)}>
            <option value="">-- Chọn nội dung --</option>
            {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {tournamentDays.length > 1 && (
            <select className="input" style={{ width: "125px" }} value={ruleDay} onChange={(e) => setRuleDay(e.target.value)}>
              <option value="">Mọi ngày</option>
              {tournamentDays.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <select className="input" style={{ width: "130px" }} value={ruleSession} onChange={(e) => setRuleSession(e.target.value)}>
            <option value="">Sáng / Chiều</option>
            <option value="morning">Chỉ buổi Sáng</option>
            <option value="afternoon">Chỉ buổi Chiều</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!ruleCatId || (!ruleDay && !ruleSession)}
            onClick={() => {
              setCategoryDaySessionRules((p) => ({
                ...p,
                [ruleCatId]: {
                  allowedDays: ruleDay ? [ruleDay] : [],
                  allowedSessions: ruleSession ? [ruleSession] : [],
                },
              }));
              setRuleCatId("");
            }}
          >
            + Gán
          </button>
        </div>
        {Object.keys(categoryDaySessionRules).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {Object.entries(categoryDaySessionRules).map(([cid, r]) => (
              <span key={cid} style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "6px", background: "#eff6ff", color: "#1e40af", display: "inline-flex", gap: "6px" }}>
                {categories.find((x) => x.id === cid)?.name || cid}:{" "}
                <strong>{[...(r.allowedDays || []), ...(r.allowedSessions || []).map((s) => (s === "morning" ? "Sáng" : "Chiều"))].join(" · ")}</strong>
                <button type="button" onClick={() => setCategoryDaySessionRules((p) => { const n = { ...p }; delete n[cid]; return n; })} style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontWeight: 800 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "8px 10px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "11px", color: "#475569" }}>
        ℹ️ <strong>Phạm vi kiểm định hiện tại (Cấp độ Nội dung):</strong> Các yêu cầu như <em>nghỉ giữa từng trận đấu bên trong cùng 1 nhánh</em> hoặc <em>tách riêng trận Chung kết ra cuối buổi</em> thuộc cấp độ từng trận (Match-level) — <strong>chưa hỗ trợ</strong> trong phiên bản hiện tại, do trọng tài thảm điều phối theo thứ tự sơ đồ bốc thăm.
      </div>
    </div>
  );
}

const STRATEGY_OPTIONS = [
  { id: "balanced_time", title: "Cân bằng thời gian", desc: "Giờ kết thúc sớm & các thảm xong đều nhau" },
  { id: "earliest_finish", title: "Kết thúc sớm nhất", desc: "Ưu tiên hoàn thành toàn giải sớm nhất" },
  { id: "organization_priority", title: "Thuận tiện công tác tổ chức", desc: "Giữ trình tự lứa tuổi, Kata/Kumite & gom cụm nội dung" },
  { id: "athlete_experience", title: "Ưu tiên trải nghiệm VĐV", desc: "Hạn chế tối đa VĐV phải chuyển thảm giữa các nội dung" },
  { id: "minimal_disruption", title: "Giữ lịch hiện tại (ít xáo trộn)", desc: "Tối ưu nhưng hạn chế đổi vị trí lịch đang có" },
];

export function WizardStep6Strategy({
  selectedStrategies,
  setSelectedStrategies,
  maxTimeSeconds,
  setMaxTimeSeconds,
  preSolveSummary,
  preflightCheck,
  strictTargetEndTime,
}) {
  const toggleStrat = (id) => {
    setSelectedStrategies((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      }
      return [...prev, id];
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <strong style={{ fontSize: "13px", color: "#0f172a" }}>
        ⚡ Bước 6: Chọn chiến lược tối ưu & Kiểm tra trước khi chạy
      </strong>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
        {STRATEGY_OPTIONS.map((st) => {
          const checked = selectedStrategies.includes(st.id);
          return (
            <label
              key={st.id}
              style={{
                padding: "9px 11px",
                borderRadius: "8px",
                cursor: "pointer",
                border: `2px solid ${checked ? "#2563eb" : "#e2e8f0"}`,
                background: checked ? "#eff6ff" : "#fff",
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
              }}
            >
              <input type="checkbox" checked={checked} onChange={() => toggleStrat(st.id)} style={{ marginTop: "3px" }} />
              <div>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a" }}>{st.title}</div>
                <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>{st.desc}</div>
              </div>
            </label>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "9px 11px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <label style={{ fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          ⏱️ Ngân sách thời gian tối ưu:
          <select className="input" value={maxTimeSeconds} onChange={(e) => setMaxTimeSeconds(Number(e.target.value))}>
            <option value={10}>Nhanh (10 giây)</option>
            <option value={30}>Tiêu chuẩn (30 giây)</option>
            <option value={45}>Chuyên sâu (45 giây)</option>
          </select>
        </label>
        <span style={{ fontSize: "11px", color: "#475569" }}>
          ({strictTargetEndTime ? "Chế độ Bắt buộc đúng giờ mục tiêu" : "Mục tiêu mềm — cho phép tối đa đến giờ kết thúc tối đa"})
        </span>
      </div>

      <div style={{ padding: "10px 12px", borderRadius: "8px", background: "#fff", border: "1px solid #cbd5e1", fontSize: "11.5px" }}>
        <div style={{ fontWeight: 700, marginBottom: "6px", color: "#0f172a" }}>📋 Kiểm tra tổng hợp trước khi chạy:</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "6px" }}>
          <div>Nội dung: <strong>{preSolveSummary.totalCategories}</strong></div>
          <div>Tổng số trận: <strong>{preSolveSummary.totalMatches}</strong></div>
          <div>Tổng thời lượng: <strong>{preSolveSummary.totalWorkloadMinutes} phút</strong></div>
          <div>Sức chứa khả dụng: <strong>{preSolveSummary.effectiveCapacityMinutes} phút</strong></div>
          <div>Tỷ lệ sử dụng: <strong>{preSolveSummary.utilizationPercent}%</strong></div>
          <div>Trạng thái sơ bộ: <strong style={{ color: preSolveSummary.feasibleLikely && preflightCheck.valid ? "#15803d" : "#b91c1c" }}>{preSolveSummary.feasibleLikely && preflightCheck.valid ? "Khả thi" : "Cần điều chỉnh"}</strong></div>
        </div>
        {(!preflightCheck.valid || preSolveSummary.warnings.length > 0) && (
          <div style={{ marginTop: "8px", padding: "7px 9px", borderRadius: "6px", background: "#fef2f2", color: "#991b1b" }}>
            {!preflightCheck.valid && <div>• {preflightCheck.errors[0]}</div>}
            {preSolveSummary.warnings.map((w, i) => <div key={i}>• {w}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

