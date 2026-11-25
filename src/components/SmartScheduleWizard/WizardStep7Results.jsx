import { useMemo, useState } from "react";
import { filterMeaningfulPlans } from "../../services/smartScheduleService";

const SOLVER_STATUS_INFO = {
  OPTIMAL: { label: "OPTIMAL · Đã chứng minh tối ưu", bg: "#dcfce7", color: "#166534" },
  FEASIBLE: { label: "FEASIBLE · Lịch hợp lệ", bg: "#dbeafe", color: "#1e40af" },
  INFEASIBLE: { label: "INFEASIBLE · Không có lịch hợp lệ", bg: "#fee2e2", color: "#991b1b" },
  UNKNOWN: { label: "UNKNOWN · Chưa xác định trong thời gian chạy", bg: "#fef3c7", color: "#92400e" },
  MODEL_INVALID: { label: "MODEL_INVALID · Cấu hình chưa hợp lệ", bg: "#fee2e2", color: "#991b1b" },
};

export function WizardStep7Results({
  solveResult,
  selectedPlanId,
  setSelectedPlanId,
  matCount,
  categoryMap,
  minRestMinutes,
  tournamentDays,
  customEvents,
}) {
  const [activeDay, setActiveDay] = useState(tournamentDays[0] || "");
  const distinctPlans = useMemo(() => filterMeaningfulPlans(solveResult?.plans || []), [solveResult]);
  const selectedPlan = useMemo(
    () => distinctPlans.find((p) => p.id === selectedPlanId) || distinctPlans[0] || null,
    [distinctPlans, selectedPlanId]
  );

  const statusMeta = SOLVER_STATUS_INFO[selectedPlan?.status || solveResult?.solverStatus] || null;
  const manualVal = solveResult?.manualBaseline?.validation;
  const greedyVal = solveResult?.greedyBaseline?.validation;
  const cpsatVal = selectedPlan?.validation;

  const solvedByMat = useMemo(() => {
    if (!selectedPlan?.schedule) return null;
    const mats = {};
    for (let m = 1; m <= matCount; m += 1) mats[m] = [];
    Object.entries(selectedPlan.schedule).forEach(([catId, slot]) => {
      if (activeDay && slot.date && slot.date !== activeDay && tournamentDays.length > 1) return;
      const cat = categoryMap.get(catId);
      if (!cat) return;
      mats[slot.mat] = mats[slot.mat] || [];
      mats[slot.mat].push({ ...cat, slot });
    });
    Object.values(mats).forEach((list) =>
      list.sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.time.localeCompare(b.slot.time))
    );
    return mats;
  }, [selectedPlan, matCount, categoryMap, activeDay, tournamentDays]);

  if (!solveResult || distinctPlans.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <strong style={{ fontSize: "13px", color: "#0f172a" }}>
          📊 Kết quả xếp lịch & Đánh giá ({distinctPlans.length} phương án khác biệt · {(solveResult.elapsedMs / 1000).toFixed(1)}s)
        </strong>
        {statusMeta && (
          <span data-tour-id="tour-result-status" style={{ fontSize: "11px", fontWeight: 700, padding: "3px 9px", borderRadius: "999px", background: statusMeta.bg, color: statusMeta.color }}>
            {statusMeta.label}
          </span>
        )}
      </div>

      {solveResult.usedFallback && solveResult.fallbackNotice && (
        <div style={{ padding: "7px 10px", borderRadius: "6px", background: "#fef3c7", color: "#92400e", fontSize: "11.5px", fontWeight: 600 }}>
          ⚠️ {solveResult.fallbackNotice}
        </div>
      )}

      <div style={{ padding: "7px 10px", borderRadius: "6px", background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", fontSize: "11px" }}>
        ℹ️ <strong>Phạm vi kiểm định (Cấp độ Nội dung):</strong> Đảm bảo không trùng lịch và đủ {minRestMinutes} phút nghỉ giữa các nội dung khác nhau của cùng VĐV.
      </div>

      {/* Distinct Plan Tabs */}
      <div data-tour-id="tour-result-tabs" style={{ display: "grid", gridTemplateColumns: `repeat(${distinctPlans.length}, minmax(0, 1fr))`, gap: "8px" }}>
        {distinctPlans.map((p) => {
          const active = p.id === selectedPlan?.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPlanId(p.id)}
              style={{
                textAlign: "left", padding: "9px 11px", borderRadius: "8px", cursor: "pointer",
                border: `2px solid ${active ? "#2563eb" : "#e2e8f0"}`,
                background: active ? "#eff6ff" : "#f8fafc",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 800, color: active ? "#1d4ed8" : "#0f172a" }}>{p.title}</div>
              <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>{p.description}</div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a", marginTop: "5px" }}>
                Xong: {p.validation.makespanTime} · Lệch thảm: {p.validation.completionSpreadMinutes}p · Trùng: {p.validation.athleteOverlaps}
              </div>
            </button>
          );
        })}
      </div>

      {/* Comparison Table */}
      <div data-tour-id="tour-result-table" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
          <thead>
            <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
              <th style={{ padding: "6px 8px", borderBottom: "1px solid #cbd5e1" }}>Chỉ số đánh giá</th>
              {manualVal && <th style={{ padding: "6px 8px", borderBottom: "1px solid #cbd5e1" }}>Lịch hiện tại</th>}
              {greedyVal && <th style={{ padding: "6px 8px", borderBottom: "1px solid #cbd5e1" }}>Xếp nhanh ban đầu</th>}
              <th style={{ padding: "6px 8px", borderBottom: "1px solid #cbd5e1", color: "#1d4ed8" }}>Phương án đề xuất</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Nội dung đã xếp", (v) => `${v.scheduledCount}/${v.totalCategories} (Chưa: ${v.unscheduledCount})`],
              ["Tổng số trận", (v) => `${v.totalMatches} trận`],
              ["Xung đột VĐV / Vi phạm bắt buộc", (v) => `${v.athleteOverlaps} trùng · ${v.hardViolations} lỗi`],
              ["Số lần VĐV phải chuyển thảm", (v) => `${v.athleteMatSwitches ?? 0} lần`],
              ["Giờ kết thúc toàn giải", (v) => v.makespanTime],
              ["Vượt giờ mục tiêu", (v) => `${v.overtimeMinutes} phút`],
              ["Chênh lệch giờ kết thúc thảm", (v) => `${v.completionSpreadMinutes} phút`],
              ["Độ lệch tải giữa các thảm", (v) => `${v.workloadStdDevMinutes} phút`],
              ["Tổng thời gian trống", (v) => `${v.totalIdleMinutes} phút`],
            ].map(([label, fmt]) => (
              <tr key={label} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "5px 8px", fontWeight: 600 }}>{label}</td>
                {manualVal && <td style={{ padding: "5px 8px" }}>{fmt(manualVal)}</td>}
                {greedyVal && <td style={{ padding: "5px 8px" }}>{fmt(greedyVal)}</td>}
                <td style={{ padding: "5px 8px", fontWeight: 700, color: "#1e40af" }}>{cpsatVal ? fmt(cpsatVal) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expandable Technical Details (Section 9) */}
      <details style={{ padding: "7px 10px", borderRadius: "6px", background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "11px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, color: "#334155" }}>
          🔧 Chi tiết kỹ thuật (trạng thái toán học, cận dưới, từng giai đoạn tối ưu)
        </summary>
        <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px", color: "#475569" }}>
          <div>
            <strong>Trạng thái:</strong> {selectedPlan?.status} ({selectedPlan?.status === "OPTIMAL" ? "Đã chứng minh tối ưu toán học" : "Đã tìm thấy lịch hợp lệ trong giới hạn thời gian"}) · <strong>Runtime:</strong> {solveResult.elapsedMs}ms
          </div>
          {solveResult.lowerBounds && (
            <div>
              <strong>Lower Bound:</strong> {solveResult.lowerBounds.makespanLowerBoundTime} · Tổng thời lượng: {solveResult.lowerBounds.totalDurationMinutes}p / Sức chứa mục tiêu: {solveResult.lowerBounds.totalCapacityToTargetMinutes}p
            </div>
          )}
          {selectedPlan?.objectiveValue !== null && selectedPlan?.objectiveValue !== undefined && (
            <div>
              <strong>Objective:</strong> {selectedPlan.objectiveValue} · <strong>Best Bound:</strong> {selectedPlan.bestBound} · <strong>Optimality Gap:</strong> {selectedPlan.gapPercent}%
            </div>
          )}
          {Array.isArray(selectedPlan?.stages) && selectedPlan.stages.length > 0 && (
            <div>
              <strong>Lexicographic Stages:</strong>{" "}
              {selectedPlan.stages.map((st) => `${st.stageName}: ${st.status} (Obj ${st.objectiveValue}, Gap ${st.gapPercent}%, ${st.runtimeMs}ms, optimal=${st.provenOptimal})`).join(" | ")}
            </div>
          )}
        </div>
      </details>

      {/* Day filter for multi-day preview */}
      {tournamentDays.length > 1 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: 700 }}>Xem lịch ngày:</span>
          {tournamentDays.map((d, idx) => (
            <button
              key={d}
              type="button"
              className={`btn btn-sm ${activeDay === d ? "btn-primary" : "btn-secondary"}`}
              style={{ fontSize: "11px", padding: "3px 9px" }}
              onClick={() => setActiveDay(d)}
            >
              Ngày {idx + 1} ({d})
            </button>
          ))}
        </div>
      )}

      {/* Per-Mat Timeline Preview */}
      {solvedByMat && (
        <div data-tour-id="tour-result-timeline" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, matCount))}, minmax(0, 1fr))`, gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
          {Array.from({ length: matCount }, (_, idx) => idx + 1).map((m) => {
            const items = solvedByMat[m] || [];
            const loadInfo = (cpsatVal?.matLoads || []).find((x) => x.mat === m);
            const dayEvts = (customEvents || []).filter((e) => (!e.date || !activeDay || e.date === activeDay) && (Number(e.mat) === 0 || Number(e.mat) === m));
            return (
              <div key={m} style={{ background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", padding: "7px" }}>
                <div style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: "5px", marginBottom: "5px", fontSize: "11px" }}>
                  <strong>Thảm {m}</strong> ({items.length} nd · {loadInfo?.totalMinutes ?? 0}p · {loadInfo?.utilizationPercent ?? 0}%)
                  <div style={{ color: "#475569", fontSize: "10px" }}>Xong lúc: {loadInfo?.lastEndTime || "—"} · Trống: {loadInfo?.idleMinutes ?? 0}p</div>
                </div>
                {dayEvts.length > 0 && (
                  <div style={{ fontSize: "9.5px", color: "#92400e", background: "#fef3c7", padding: "3px 5px", borderRadius: "4px", marginBottom: "4px" }}>
                    {dayEvts.map((e) => `${e.time} ${e.name} (${e.duration}p)`).join(" · ")}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {items.map((item) => {
                    const isKata = item.parsed?.discipline === "kata";
                    return (
                      <div key={item.id} style={{ padding: "4px 6px", borderRadius: "5px", background: "#fff", borderLeft: `3px solid ${isKata ? "#2563eb" : "#dc2626"}` }}>
                        <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#64748b" }}>
                          {item.slot.time}–{item.slot.endTime} · <span style={{ color: isKata ? "#2563eb" : "#dc2626" }}>{isKata ? "Kata" : "Kumite"}</span>
                        </div>
                        <div style={{ fontSize: "10.5px", fontWeight: 600, color: "#0f172a", lineHeight: 1.2 }}>{item.name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
