import { useMemo, useState } from "react";
import { HelpTip } from "../onboarding/ContextualHelp";

const EVENT_TYPE_OPTIONS = [
  { name: "Khai mạc", defaultTime: "09:30", defaultDuration: 30 },
  { name: "Nghỉ trưa", defaultTime: "11:30", defaultDuration: 120 },
  { name: "Nghỉ trọng tài", defaultTime: "10:15", defaultDuration: 15 },
  { name: "Trao huy chương", defaultTime: "16:30", defaultDuration: 20 },
  { name: "Bế mạc", defaultTime: "17:00", defaultDuration: 20 },
  { name: "Sự kiện khóa khác", defaultTime: "14:30", defaultDuration: 15 },
];

export function WizardStep1Analysis({ analysis }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
        📊 Bước 1: Tự động phân tích dữ liệu giải đấu hiện tại
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: "8px" }}>
        {[
          ["Nội dung hoạt động", `${analysis.activeCategories}/${analysis.totalRawCategories}`],
          ["Tổng VĐV / Đơn vị", `${analysis.athleteCount} VĐV · ${analysis.clubCount} CLB`],
          ["Kata / Kumite", `${analysis.kataCount} Kata · ${analysis.kumiteCount} Kumite`],
          ["Cá nhân / Đồng đội", `${analysis.individualCount} CN · ${analysis.teamCount} ĐĐ`],
          ["Nam / Nữ", `${analysis.maleCount} Nam · ${analysis.femaleCount} Nữ`],
          [
            analysis.isMatchCountEstimated ? "Tổng trận (ước tính)" : "Tổng trận còn lại",
            `${analysis.totalRemainingMatches} trận`,
          ],
          ["Tổng thời lượng dự kiến", `${analysis.totalEstimatedMinutes} phút`],
          ["Nội dung đã ghim", `${analysis.pinnedCount} nội dung`],
          ["VĐV thi nhiều nội dung", `${analysis.multiCategoryAthleteCount} VĐV`],
          ["Trạng thái bốc thăm", `${analysis.hasBracketCount}/${analysis.activeCategories} đã có sơ đồ`],
        ].map(([label, val]) => (
          <div key={label} style={{ padding: "8px 10px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: 800, marginTop: "2px" }}>{val}</div>
          </div>
        ))}
      </div>

      {analysis.ageGroups.length > 0 && (
        <div style={{ padding: "9px 11px", borderRadius: "8px", background: "#fff", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
            🎂 Nhóm lứa tuổi phát hiện tự động từ dữ liệu giải ({analysis.ageGroups.length} nhóm):
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {analysis.ageGroups.map((ag) => (
              <span key={ag.key} style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "999px", background: "#eff6ff", color: "#1d4ed8", fontWeight: 600 }}>
                {ag.label} ({ag.count} nd)
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis.missingWarnings.length > 0 && (
        <div style={{ padding: "9px 11px", borderRadius: "8px", background: "#fffbeb", border: "1px solid #fcd34d", fontSize: "11.5px", color: "#92400e" }}>
          <strong>⚠️ Lưu ý dữ liệu:</strong>
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            {analysis.missingWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export function WizardStep2Time({
  tournamentDays,
  matCount,
  sessionConfig,
  setSessionConfig,
  daySessionConfigs,
  setDaySessionConfigs,
  targetEndTime,
  setTargetEndTime,
  maximumEndTime,
  setMaximumEndTime,
  strictTargetEndTime,
  setStrictTargetEndTime,
  localCustomEvents,
  setLocalCustomEvents,
  preSolveSummary,
}) {
  const [newEvt, setNewEvt] = useState({
    name: "Khai mạc",
    customName: "",
    date: tournamentDays[0] || "",
    time: "09:30",
    duration: 30,
    mat: 0,
  });

  const handleAddEvent = () => {
    if (!newEvt.time || Number(newEvt.duration) <= 0) return;
    const finalName =
      newEvt.name === "Sự kiện khóa khác"
        ? (newEvt.customName.trim() || "Sự kiện cố định")
        : (newEvt.name || "Sự kiện cố định");
    setLocalCustomEvents((prev) => [
      ...prev,
      {
        id: `evt_${Date.now()}`,
        name: finalName,
        date: newEvt.date || tournamentDays[0] || "",
        time: newEvt.time,
        duration: Number(newEvt.duration) || 30,
        mat: Number(newEvt.mat) || 0,
      },
    ]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <strong style={{ fontSize: "13px", color: "#0f172a" }}>
          🕒 Bước 2: Thời gian tổ chức & Sự kiện cố định ({tournamentDays.length} ngày · {matCount} thảm)
        </strong>
        <span style={{ fontSize: "11.5px", fontWeight: 700, padding: "3px 9px", borderRadius: "999px", background: preSolveSummary.feasibleLikely ? "#dcfce7" : "#fee2e2", color: preSolveSummary.feasibleLikely ? "#166534" : "#991b1b" }}>
          Sức chứa thực: {preSolveSummary.effectiveCapacityMinutes}p / Nhu cầu: {preSolveSummary.totalWorkloadMinutes}p
        </span>
      </div>

      {/* Default Session & Horizon */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", padding: "10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          Sáng bắt đầu
          <input type="time" className="input" value={sessionConfig.morningStart || "08:00"} onChange={(e) => setSessionConfig((p) => ({ ...p, morningStart: e.target.value }))} />
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          Sáng kết thúc
          <input type="time" className="input" value={sessionConfig.morningEnd || "11:30"} onChange={(e) => setSessionConfig((p) => ({ ...p, morningEnd: e.target.value }))} />
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          Chiều bắt đầu
          <input type="time" className="input" value={sessionConfig.afternoonStart || "13:30"} onChange={(e) => setSessionConfig((p) => ({ ...p, afternoonStart: e.target.value }))} />
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          🎯 Giờ kết thúc mục tiêu
          <input type="time" className="input" value={targetEndTime} onChange={(e) => setTargetEndTime(e.target.value)} />
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          🛑 Giờ kết thúc tối đa
          <input type="time" className="input" value={maximumEndTime} onChange={(e) => setMaximumEndTime(e.target.value)} />
        </label>
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 600 }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
            <input type="checkbox" checked={strictTargetEndTime} onChange={(e) => setStrictTargetEndTime(e.target.checked)} />
            Bắt buộc kết thúc đúng hoặc trước giờ mục tiêu (nếu bỏ chọn, cho phép vượt nhẹ đến giờ tối đa)
          </label>
        </div>
      </div>

      {/* Multi-day per-day overrides */}
      {tournamentDays.length > 1 && (
        <div style={{ padding: "10px", background: "#fff", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
          <div style={{ fontSize: "11.5px", fontWeight: 700, marginBottom: "6px", color: "#334155" }}>
            📅 Tùy chỉnh khung giờ riêng cho từng ngày (tùy chọn):
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {tournamentDays.map((day, idx) => {
              const ov = daySessionConfigs[day] || {};
              const dayCap = preSolveSummary.perDayCapacity.find((d) => d.date === day);
              return (
                <div key={day} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", fontSize: "11px", padding: "6px", background: "#f8fafc", borderRadius: "6px" }}>
                  <strong style={{ minWidth: "115px" }}>Ngày {idx + 1} ({day})</strong>
                  <span>Sáng:</span>
                  <input type="time" className="input" style={{ width: "92px", padding: "2px 4px" }} value={ov.morningStart ?? sessionConfig.morningStart ?? "08:00"} onChange={(e) => setDaySessionConfigs((p) => ({ ...p, [day]: { ...(p[day] || {}), morningStart: e.target.value } }))} />
                  <span>–</span>
                  <input type="time" className="input" style={{ width: "92px", padding: "2px 4px" }} value={ov.morningEnd ?? sessionConfig.morningEnd ?? "11:30"} onChange={(e) => setDaySessionConfigs((p) => ({ ...p, [day]: { ...(p[day] || {}), morningEnd: e.target.value } }))} />
                  <span>Chiều:</span>
                  <input type="time" className="input" style={{ width: "92px", padding: "2px 4px" }} value={ov.afternoonStart ?? sessionConfig.afternoonStart ?? "13:30"} onChange={(e) => setDaySessionConfigs((p) => ({ ...p, [day]: { ...(p[day] || {}), afternoonStart: e.target.value } }))} />
                  <span>–</span>
                  <input type="time" className="input" style={{ width: "92px", padding: "2px 4px" }} value={ov.maximumEndTime ?? maximumEndTime} onChange={(e) => setDaySessionConfigs((p) => ({ ...p, [day]: { ...(p[day] || {}), maximumEndTime: e.target.value, afternoonEnd: e.target.value } }))} />
                  <span style={{ color: "#0369a1", fontWeight: 700 }}>({dayCap?.maxCapacityMinutes ?? 0}p)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom Blocked Events */}
      <div style={{ padding: "10px", background: "#fff", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <div style={{ fontSize: "11.5px", fontWeight: 700, marginBottom: "6px", color: "#334155" }}>
          🎗️ Khai mạc, Nghỉ trưa, Nghỉ trọng tài, Trao huy chương, Bế mạc & Sự kiện khóa:
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", marginBottom: "8px", alignItems: "end" }}>
          <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: "3px" }}>
            Loại sự kiện
            <select
              className="input"
              style={{ width: "100%" }}
              value={newEvt.name}
              onChange={(e) => {
                const opt = EVENT_TYPE_OPTIONS.find((x) => x.name === e.target.value);
                setNewEvt((p) => ({
                  ...p,
                  name: e.target.value,
                  time: opt?.defaultTime || p.time,
                  duration: opt?.defaultDuration || p.duration,
                }));
              }}
            >
              {EVENT_TYPE_OPTIONS.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
            </select>
          </label>
          {newEvt.name === "Sự kiện khóa khác" && (
            <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: "3px" }}>
              Tên sự kiện riêng
              <input
                type="text"
                className="input"
                placeholder="Nhập tên sự kiện..."
                style={{ width: "100%" }}
                value={newEvt.customName}
                onChange={(e) => setNewEvt((p) => ({ ...p, customName: e.target.value }))}
              />
            </label>
          )}
          <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: "3px" }}>
            Ngày áp dụng
            <select className="input" style={{ width: "100%" }} value={newEvt.date || tournamentDays[0] || ""} onChange={(e) => setNewEvt((p) => ({ ...p, date: e.target.value }))}>
              {tournamentDays.length > 1 && <option value="">Tất cả các ngày</option>}
              {tournamentDays.map((d, idx) => <option key={d} value={d}>Ngày {idx + 1} ({d})</option>)}
            </select>
          </label>
          <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: "3px" }}>
            Buổi
            <select
              className="input"
              style={{ width: "100%" }}
              value={(newEvt.time || "09:30") < (sessionConfig.afternoonStart || "13:30") ? "morning" : "afternoon"}
              onChange={(e) => {
                const s = e.target.value;
                setNewEvt((p) => ({
                  ...p,
                  time: s === "morning" ? (sessionConfig.morningStart || "09:30") : (sessionConfig.afternoonStart || "13:30"),
                }));
              }}
            >
              <option value="morning">Buổi Sáng</option>
              <option value="afternoon">Buổi Chiều</option>
            </select>
          </label>
          <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: "3px" }}>
            Giờ bắt đầu
            <input type="time" className="input" style={{ width: "100%" }} value={newEvt.time} onChange={(e) => setNewEvt((p) => ({ ...p, time: e.target.value }))} />
          </label>
          <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: "3px" }}>
            Thời lượng (phút)
            <input type="number" min={5} max={240} className="input" style={{ width: "100%" }} value={newEvt.duration} onChange={(e) => setNewEvt((p) => ({ ...p, duration: Number(e.target.value) }))} />
          </label>
          <label style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: "3px" }}>
            Phạm vi thảm
            <select className="input" style={{ width: "100%" }} value={newEvt.mat} onChange={(e) => setNewEvt((p) => ({ ...p, mat: Number(e.target.value) }))}>
              <option value={0}>Toàn bộ thảm</option>
              {Array.from({ length: matCount }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>Chỉ Thảm {m}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-primary btn-sm" style={{ height: "38px" }} onClick={handleAddEvent}>+ Thêm sự kiện</button>
        </div>

        {localCustomEvents.length === 0 ? (
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            Chưa có sự kiện khóa nào (nếu có Khai mạc 09:30–10:00, hãy thêm để hệ thống tự né giờ khai mạc).
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {localCustomEvents.map((ev, idx) => {
              const sessionLabel = (ev.time || "09:30") < (sessionConfig.afternoonStart || "13:30") ? "Sáng" : "Chiều";
              return (
                <span key={ev.id || idx} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", padding: "4px 8px", borderRadius: "6px", background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" }}>
                  <strong>{ev.name}</strong> ({sessionLabel} · {ev.time} · {ev.duration}p · {Number(ev.mat) === 0 ? "Tất cả thảm" : `Thảm ${ev.mat}`}{ev.date ? ` · ${ev.date}` : " · Mọi ngày"})
                  <button type="button" onClick={() => setLocalCustomEvents((prev) => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontWeight: 800 }}>×</button>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function WizardStep3Durations({
  analysis,
  categories,
  durations,
  setDurations,
  categoryDurationOverrides,
  setCategoryDurationOverrides,
  minRestMinutes,
  setMinRestMinutes,
  transitionMinutes,
  setTransitionMinutes,
  preSolveSummary,
}) {
  const [overrideCatId, setOverrideCatId] = useState("");
  const [overrideMins, setOverrideMins] = useState(15);

  const byAge = durations?.byAgeGroup || {};
  const activeCatOptions = useMemo(
    () => categories.filter((c) => (c.athletes || []).length > 0),
    [categories]
  );

  const updateBaseDur = (key, val) => {
    setDurations((prev) => ({ ...(prev || {}), [key]: Math.max(1, Number(val) || 5) }));
  };

  const updateAgeDur = (ageKey, val) => {
    setDurations((prev) => ({
      ...(prev || {}),
      byAgeGroup: {
        ...(prev?.byAgeGroup || {}),
        [ageKey]: Math.max(1, Number(val) || 4),
      },
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <strong style={{ fontSize: "13px", color: "#0f172a" }}>
          ⏱️ Bước 3: Thời lượng thi đấu & Nghỉ VĐV (dùng chung với Setup thủ công)
        </strong>
        <span style={{ fontSize: "11.5px", fontWeight: 700, padding: "3px 9px", borderRadius: "999px", background: "#eff6ff", color: "#1d4ed8" }}>
          Tổng workload hiện tại: {preSolveSummary.totalWorkloadMinutes} phút ({preSolveSummary.totalMatches} trận)
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px", padding: "10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          Kata cá nhân (phút/trận)
          <input type="number" min={1} max={30} step="0.5" className="input" value={durations?.kata_individual ?? 5} onChange={(e) => updateBaseDur("kata_individual", e.target.value)} />
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          Kata đồng đội (phút/trận)
          <input type="number" min={1} max={30} step="0.5" className="input" value={durations?.kata_team ?? 5} onChange={(e) => updateBaseDur("kata_team", e.target.value)} />
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          Kumite cá nhân mặc định (p)
          <input type="number" min={1} max={30} step="0.5" className="input" value={durations?.kumite_individual ?? 5} onChange={(e) => updateBaseDur("kumite_individual", e.target.value)} />
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          Kumite đồng đội mặc định (p)
          <input type="number" min={1} max={30} step="0.5" className="input" value={durations?.kumite_team ?? 10} onChange={(e) => updateBaseDur("kumite_team", e.target.value)} />
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          <span>Nghỉ tối thiểu VĐV (phút) <HelpTip title="Nghỉ tối thiểu VĐV" description="Khoảng thời gian nghỉ tối thiểu giữa 2 nội dung khác nhau của cùng 1 VĐV." example="15–20 phút để VĐV kịp hồi sức và di chuyển." /></span>
          <select className="input" value={minRestMinutes} onChange={(e) => setMinRestMinutes(Number(e.target.value))}>
            <option value={10}>10 phút</option>
            <option value={15}>15 phút</option>
            <option value={20}>20 phút</option>
            <option value={30}>30 phút</option>
            <option value={45}>45 phút</option>
          </select>
        </label>
        <label style={{ fontSize: "11px", fontWeight: 700, display: "flex", flexDirection: "column", gap: "3px" }}>
          <span>Chuyển tiếp giữa nội dung <HelpTip title="Thời gian chuyển tiếp" description="Khoảng nghỉ chuẩn bị sân/bảng điểm giữa 2 nội dung liên tiếp trên cùng 1 thảm." example="0 phút nếu gọi trận liên tục; 2 phút nếu cần dọn thảm." /></span>
          <select className="input" value={transitionMinutes} onChange={(e) => setTransitionMinutes(Number(e.target.value))}>
            <option value={0}>0 phút</option>
            <option value={2}>2 phút</option>
            <option value={5}>5 phút</option>
          </select>
        </label>
      </div>

      {analysis.ageGroups.length > 0 && (
        <div style={{ padding: "10px", background: "#fff", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
          <div style={{ fontSize: "11.5px", fontWeight: 700, marginBottom: "6px", color: "#334155" }}>
            🎂 Thời lượng trận theo từng lứa tuổi trong giải (phút/trận):
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "8px" }}>
            {analysis.ageGroups.map((ag) => (
              <label key={ag.key} style={{ fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", padding: "5px 8px", background: "#f8fafc", borderRadius: "6px" }}>
                <span>{ag.label}</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  step="0.5"
                  className="input"
                  style={{ width: "68px", padding: "3px 6px" }}
                  value={byAge[ag.key] ?? durations?.kumite_individual ?? 5}
                  onChange={(e) => updateAgeDur(ag.key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Per-category duration overrides */}
      <div style={{ padding: "10px", background: "#fff", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <div style={{ fontSize: "11.5px", fontWeight: 700, marginBottom: "6px", color: "#334155" }}>
          🎯 Ngoại lệ tổng thời lượng cho từng nội dung cụ thể (ví dụ Vô địch tuyệt đối):
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
          <select className="input" style={{ flex: 1, minWidth: "200px" }} value={overrideCatId} onChange={(e) => setOverrideCatId(e.target.value)}>
            <option value="">-- Chọn nội dung cần đặt thời lượng riêng --</option>
            {activeCatOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" min={5} max={180} className="input" style={{ width: "80px" }} value={overrideMins} onChange={(e) => setOverrideMins(Number(e.target.value))} />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!overrideCatId}
            onClick={() => {
              if (!overrideCatId) return;
              setCategoryDurationOverrides((p) => ({ ...p, [overrideCatId]: Math.max(5, Number(overrideMins) || 15) }));
              setOverrideCatId("");
            }}
          >
            + Áp dụng
          </button>
        </div>
        {Object.keys(categoryDurationOverrides).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {Object.entries(categoryDurationOverrides).map(([cid, mins]) => {
              const cName = categories.find((x) => x.id === cid)?.name || cid;
              return (
                <span key={cid} style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "6px", background: "#eff6ff", color: "#1e40af", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  {cName}: <strong>{mins}p</strong>
                  <button type="button" onClick={() => setCategoryDurationOverrides((p) => { const n = { ...p }; delete n[cid]; return n; })} style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontWeight: 800 }}>×</button>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

