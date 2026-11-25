import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEMO_PRACTICE_CATEGORIES,
  WIZARD_STEP_GUIDES,
} from "../../services/onboardingService";
import {
  computePreSolveSummary,
  resolveMatConstraints,
  validateScheduleLocally,
} from "../../services/smartScheduleService";
import { getCategoryAgeGroupInfo, parseKarateCategory } from "../../services/scheduleService";

const SANDBOX_CYCLE = ["auto", "allowed", "required", "preferred", "forbidden"];
const SANDBOX_STYLES = {
  auto: { label: "", bg: "#ffffff", color: "#475569", border: "#cbd5e1", desc: "Tự động: Không ép quy tắc; thảm nhận mọi nội dung để cân tải." },
  allowed: { label: "✓ Cho phép: ", bg: "#f0fdf4", color: "#15803d", border: "#86efac", desc: "Cho phép: Xác nhận rõ nội dung này được thi đấu trên thảm." },
  required: { label: "★ Bắt buộc: ", bg: "#2563eb", color: "#ffffff", border: "#1d4ed8", desc: "Bắt buộc: Thảm này CHỈ nhận loại nội dung này (không cấm các thảm tự động khác)." },
  preferred: { label: "↑ Ưu tiên: ", bg: "#16a34a", color: "#ffffff", border: "#15803d", desc: "Ưu tiên: Đưa vào thảm này trước, đầy mới san sang thảm khác." },
  forbidden: { label: "✕ Cấm: ", bg: "#dc2626", color: "#ffffff", border: "#b91c1c", desc: "Cấm: Tuyệt đối không xếp loại nội dung này lên thảm này." },
};

export function WelcomeOnboardingModal({
  isOpen,
  onStartTour,
  onSkip,
  onDontShowAgain,
}) {
  const [dontShow, setDontShow] = useState(false);
  if (!isOpen) return null;

  return createPortal(
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 10040, background: "rgba(15, 23, 42, 0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ width: "480px", maxWidth: "100%", background: "#fff", borderRadius: "14px", padding: "20px", boxShadow: "0 20px 50px rgba(15,23,42,0.3)", border: "1px solid #cbd5e1" }}>
        <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>
          ⚡ Chào mừng đến với Smart Schedule Pro
        </div>
        <p style={{ fontSize: "12.5px", color: "#475569", lineHeight: 1.5, margin: "0 0 10px" }}>
          Trợ lý xếp lịch thi đấu Karate tự động giúp Ban tổ chức tạo lịch chuẩn xác chỉ trong vài bước:
        </p>
        <ul style={{ margin: "0 0 12px 18px", padding: 0, fontSize: "12.5px", color: "#334155", lineHeight: 1.6 }}>
          <li>⚖️ <strong>Cân bằng thời gian</strong> giữa các thảm thi đấu.</li>
          <li>🛡️ <strong>Hạn chế xung đột VĐV</strong> và giữ đủ thời gian nghỉ giữa các nội dung.</li>
          <li>📋 <strong>Kiểm tra các ràng buộc tổ chức</strong> (Khai mạc, Nghỉ trưa, Kata trước Kumite).</li>
          <li>📊 <strong>So sánh và lựa chọn phương án</strong> tối ưu trước khi áp dụng.</li>
        </ul>

        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#475569", marginBottom: "14px", cursor: "pointer" }}>
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
          Không hiển thị lại lời chào này ở lần mở sau
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => (dontShow ? onDontShowAgain?.() : onSkip?.())}
          >
            Bỏ qua, tôi đã biết sử dụng
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onStartTour?.(dontShow)}
          >
            🎓 Bắt đầu hướng dẫn
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function HelpCenterModal({
  isOpen,
  onClose,
  matCount = 3,
  ageGroupChips = [],
  hasInProgressTour = false,
  onResumeTour,
  onStartQuickTour,
  onStartWizardTour,
  onStartResultTour,
  onResetOnboarding,
  hasResult = false,
}) {
  const [tab, setTab] = useState("tours");
  const [sandboxRules, setSandboxRules] = useState({});
  const [lastChipClicked, setLastChipClicked] = useState(null);

  // Demo Practice state (100% isolated from real tournament)
  const [demoMatCount, setDemoMatCount] = useState(Math.max(2, Math.min(5, matCount)));
  const [demoKataFirst, setDemoKataFirst] = useState(true);
  const [demoStart, setDemoStart] = useState("08:00");
  const [demoEnd, setDemoEnd] = useState("16:00");
  const [demoScheduleResult, setDemoScheduleResult] = useState(null);

  const sampleKata = useMemo(() => ({ id: "sk", name: "Kata cá nhân Nam", type: "kata", athletes: [{ id: "1" }] }), []);
  const sampleKumite = useMemo(() => ({ id: "skm", name: "Kumite cá nhân Nam", type: "kumite", athletes: [{ id: "2" }] }), []);

  const sandboxEffect = useMemo(() => {
    const kRes = resolveMatConstraints({
      cat: sampleKata,
      parsed: parseKarateCategory(sampleKata),
      ageInfo: getCategoryAgeGroupInfo(sampleKata),
      matCount,
      perMatRules: sandboxRules,
      scheduleConfig: {},
      tournamentDays: ["2026-01-01"],
    });
    const kmRes = resolveMatConstraints({
      cat: sampleKumite,
      parsed: parseKarateCategory(sampleKumite),
      ageInfo: getCategoryAgeGroupInfo(sampleKumite),
      matCount,
      perMatRules: sandboxRules,
      scheduleConfig: {},
      tournamentDays: ["2026-01-01"],
    });
    return { kataMats: kRes.allowedMats, kumiteMats: kmRes.allowedMats };
  }, [sandboxRules, matCount, sampleKata, sampleKumite]);

  const runDemoPractice = () => {
    const mCount = Math.max(1, Number(demoMatCount) || 2);
    const ordered = [...DEMO_PRACTICE_CATEGORIES].sort((a, b) => {
      if (demoKataFirst && a.type !== b.type) return a.type === "kata" ? -1 : 1;
      return 0;
    });
    const [sh, sm] = demoStart.split(":").map(Number);
    const startBase = (sh || 8) * 60 + (sm || 0);
    const matEnds = Array.from({ length: mCount }, () => startBase);
    const schedule = {};
    const fmt = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

    ordered.forEach((cat) => {
      let bestMat = 0;
      for (let m = 1; m < mCount; m += 1) {
        if (matEnds[m] < matEnds[bestMat]) bestMat = m;
      }
      const dur = cat.type === "kata" ? 15 : 20;
      const sMin = matEnds[bestMat];
      matEnds[bestMat] = sMin + dur;
      schedule[cat.id] = {
        mat: bestMat + 1,
        date: "2026-12-01",
        time: fmt(sMin),
        endTime: fmt(sMin + dur),
        duration: dur,
      };
    });

    const val = validateScheduleLocally({
      schedule,
      categories: DEMO_PRACTICE_CATEGORIES,
      minRestMinutes: 15,
    });
    const cap = computePreSolveSummary({
      categories: DEMO_PRACTICE_CATEGORIES,
      tournamentDays: ["2026-12-01"],
      matCount: mCount,
      sessionConfig: { morningStart: demoStart, morningEnd: "11:30", afternoonStart: "13:00", afternoonEnd: demoEnd, maximumEndTime: demoEnd, targetEndTime: demoEnd },
    });
    setDemoScheduleResult({ schedule, valid: val.valid, maxEnd: fmt(Math.max(...matEnds)), cap });
  };

  if (!isOpen) return null;

  const firstAge = ageGroupChips[0]?.label || "lứa tuổi nhỏ";
  const lastAge = ageGroupChips[ageGroupChips.length - 1]?.label || "lứa tuổi lớn";

  return createPortal(
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 10045, background: "rgba(15, 23, 42, 0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ width: "760px", maxWidth: "100%", maxHeight: "86vh", background: "#fff", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "12px", boxShadow: "0 20px 50px rgba(15,23,42,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>
          <strong style={{ fontSize: "15px", color: "#0f172a" }}>📖 Trung tâm hướng dẫn Smart Schedule Pro</strong>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Đóng</button>
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            ["tours", "🎓 Hướng dẫn tương tác"],
            ["mats", "🏟️ Thực hành chia thảm"],
            ["wizard", "🧭 Giải thích 7 bước"],
            ["results", "📊 Đọc kết quả & Lỗi"],
            ["practice", "🧪 Chế độ Thực hành"],
            ["faq", "❓ Hỏi đáp nhanh"],
          ].map(([k, label]) => (
            <button key={k} type="button" className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-secondary"}`} style={{ fontSize: "11.5px" }} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ overflowY: "auto", flex: 1, paddingRight: "4px", fontSize: "12.5px", color: "#334155", lineHeight: 1.55 }}>
          {tab === "tours" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {hasInProgressTour && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { onClose(); onResumeTour?.(); }}>
                  ▶️ Tiếp tục hướng dẫn đang xem dở
                </button>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "8px" }}>
                <button type="button" className="btn btn-secondary" style={{ textAlign: "left", padding: "10px" }} onClick={() => { onClose(); onStartQuickTour?.(); }}>
                  <strong>⚡ Hướng dẫn Xếp lịch nhanh</strong>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>Đi từng nút trên màn hình xếp nhanh trong 1 phút.</div>
                </button>
                <button type="button" className="btn btn-secondary" style={{ textAlign: "left", padding: "10px" }} onClick={() => { onClose(); onStartWizardTour?.(); }}>
                  <strong>🧭 Hướng dẫn Xếp lịch nâng cao</strong>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>Hướng dẫn lần lượt từ Bước 1 đến Bước 7.</div>
                </button>
                {hasResult && (
                  <button type="button" className="btn btn-secondary" style={{ textAlign: "left", padding: "10px" }} onClick={() => { onClose(); onStartResultTour?.(); }}>
                    <strong>📊 Hướng dẫn đọc kết quả</strong>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>Cách chọn phương án và kiểm tra timeline.</div>
                  </button>
                )}
              </div>
              <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11.5px", color: "#64748b" }}>Muốn xem lại lời chào như lần đầu sử dụng?</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onResetOnboarding}>
                  🔄 Đặt lại trạng thái hướng dẫn
                </button>
              </div>
            </div>
          )}

          {tab === "mats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ padding: "8px 10px", background: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe", fontSize: "12px" }}>
                <strong>Giải thích 5 trạng thái thẻ (không làm thay đổi cấu hình giải thật):</strong>
                <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  {SANDBOX_CYCLE.map((k) => <li key={k}>{SANDBOX_STYLES[k].desc}</li>)}
                </ul>
              </div>
              <div style={{ fontSize: "11.5px", fontWeight: 700 }}>Thử bấm vào các thẻ bên dưới để xem thảm nào được nhận Kata và Kumite (đang mô phỏng {matCount} thảm của giải hiện tại):</div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, matCount))}, minmax(0, 1fr))`, gap: "8px" }}>
                {Array.from({ length: matCount }, (_, i) => i + 1).map((m) => (
                  <div key={m} style={{ padding: "8px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #cbd5e1" }}>
                    <div style={{ fontWeight: 800, marginBottom: "6px" }}>Thảm {m}</div>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {[{ k: "kata", l: "Kata" }, { k: "kumite", l: "Kumite" }].map((t) => {
                        const mode = sandboxRules[m]?.[t.k] || "auto";
                        const st = SANDBOX_STYLES[mode];
                        return (
                          <button
                            key={t.k}
                            type="button"
                            onClick={() => {
                              const next = SANDBOX_CYCLE[(SANDBOX_CYCLE.indexOf(mode) + 1) % SANDBOX_CYCLE.length];
                              setSandboxRules((p) => {
                                const mObj = { ...(p[m] || {}) };
                                if (next === "auto") delete mObj[t.k];
                                else mObj[t.k] = next;
                                return { ...p, [m]: mObj };
                              });
                              setLastChipClicked({ mat: m, tag: t.l, mode: next });
                            }}
                            style={{ fontSize: "10.5px", padding: "3px 7px", borderRadius: "5px", cursor: "pointer", fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}
                          >
                            {st.label}{t.l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: "8px 10px", borderRadius: "6px", background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: "12px" }}>
                <div>• Kata được phép chạy trên: <strong>{sandboxEffect.kataMats.length ? sandboxEffect.kataMats.map((x) => `Thảm ${x}`).join(", ") : "Không còn thảm nào!"}</strong></div>
                <div>• Kumite được phép chạy trên: <strong>{sandboxEffect.kumiteMats.length ? sandboxEffect.kumiteMats.map((x) => `Thảm ${x}`).join(", ") : "Không còn thảm nào!"}</strong></div>
                {lastChipClicked && <div style={{ marginTop: "4px", color: "#15803d" }}>Vừa chọn Thảm {lastChipClicked.mat} – {lastChipClicked.tag}: {SANDBOX_STYLES[lastChipClicked.mode].desc}</div>}
              </div>
              <div style={{ fontSize: "11.5px", color: "#475569" }}>
                <strong>Ví dụ thực tế với {matCount} thảm:</strong> Tất cả tự động cân bằng · Thảm {matCount} chỉ Kumite (Thảm 1..{Math.max(1, matCount - 1)} vẫn chạy Kata và Kumite) · Thảm 1 chuyên Kata · Chia Nam/Nữ · Chia {firstAge} và {lastAge} · Chia Cá nhân/Đồng đội.
              </div>
            </div>
          )}

          {tab === "wizard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {Object.entries(WIZARD_STEP_GUIDES).map(([stepNum, g]) => (
                <div key={stepNum} style={{ padding: "9px 11px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>{g.title}</div>
                  <div><strong>Mục đích:</strong> {g.purpose}</div>
                  <div><strong>Cách thao tác:</strong> {g.howTo}</div>
                  <div><strong>Ví dụ:</strong> {g.example}</div>
                  <div style={{ color: "#991b1b" }}><strong>Lỗi thường gặp:</strong> {g.commonMistakes}</div>
                </div>
              ))}
            </div>
          )}

          {tab === "results" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ padding: "8px 10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <strong>Ý nghĩa trạng thái:</strong>
                <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  <li><strong>FEASIBLE:</strong> Đã tìm được lịch hợp lệ (0 trùng VĐV, không phạm luật cứng) nhưng chưa chứng minh tối ưu tuyệt đối.</li>
                  <li><strong>OPTIMAL:</strong> Đã chứng minh tối ưu toán học theo mục tiêu và phạm vi mô hình.</li>
                  <li><strong>Phạm vi kiểm định (Category-level):</strong> Đảm bảo không trùng lịch và đủ phút nghỉ giữa <em>các nội dung khác nhau</em> của cùng VĐV.</li>
                </ul>
              </div>
              <div style={{ padding: "8px 10px", background: "#fef2f2", borderRadius: "8px", border: "1px solid #fecaca" }}>
                <strong>Cách xử lý khi xếp lịch thất bại:</strong>
                <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  <li><strong>Bài toán vô nghiệm (INFEASIBLE):</strong> Tổng thời lượng vượt sức chứa hoặc thảm bị cấm hết → Tăng giờ kết thúc tối đa (Bước 2), giảm thời lượng/trận theo đúng thực tế (Bước 3) hoặc bỏ bớt thẻ Cấm/Bắt buộc (Bước 4).</li>
                  <li><strong>Chưa tìm được trong thời gian chạy (UNKNOWN):</strong> Tăng thời gian chạy lên 30s hoặc 45s (Bước 6).</li>
                  <li><strong>Lỗi kết nối (HTTP 502/504):</strong> Kiểm tra mạng hoặc chọn mức 30 giây.</li>
                </ul>
              </div>
            </div>
          )}

          {tab === "practice" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ padding: "7px 10px", borderRadius: "6px", background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e", fontWeight: 700 }}>
                🧪 CHẾ ĐỘ THỰC HÀNH (Dữ liệu minh họa 8 nội dung — hoàn toàn không lưu vào giải thật)
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ fontSize: "11.5px", fontWeight: 700 }}>
                  Số thảm:{" "}
                  <select className="input" value={demoMatCount} onChange={(e) => setDemoMatCount(Number(e.target.value))}>
                    {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} thảm</option>)}
                  </select>
                </label>
                <label style={{ fontSize: "11.5px", fontWeight: 700 }}>
                  Bắt đầu:{" "}
                  <input type="time" className="input" value={demoStart} onChange={(e) => setDemoStart(e.target.value)} />
                </label>
                <label style={{ fontSize: "11.5px", fontWeight: 700 }}>
                  Kết thúc:{" "}
                  <input type="time" className="input" value={demoEnd} onChange={(e) => setDemoEnd(e.target.value)} />
                </label>
                <label style={{ fontSize: "11.5px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <input type="checkbox" checked={demoKataFirst} onChange={(e) => setDemoKataFirst(e.target.checked)} />
                  Kata trước Kumite
                </label>
                <button type="button" className="btn btn-primary btn-sm" onClick={runDemoPractice}>▶️ Chạy thử minh họa</button>
              </div>
              {demoScheduleResult && (
                <div style={{ padding: "9px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #cbd5e1" }}>
                  <div style={{ fontWeight: 700, marginBottom: "6px" }}>
                    Kết quả minh họa: {demoScheduleResult.valid ? "✅ Hợp lệ" : "⚠️ Có trùng"} · Giờ kết thúc: {demoScheduleResult.maxEnd}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${demoMatCount}, minmax(0, 1fr))`, gap: "6px" }}>
                    {Array.from({ length: demoMatCount }, (_, i) => i + 1).map((m) => (
                      <div key={m} style={{ background: "#fff", padding: "6px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "10.5px" }}>
                        <strong>Thảm {m}</strong>
                        {DEMO_PRACTICE_CATEGORIES.filter((c) => demoScheduleResult.schedule[c.id]?.mat === m).map((c) => {
                          const s = demoScheduleResult.schedule[c.id];
                          return <div key={c.id} style={{ marginTop: "4px" }}>{s.time}–{s.endTime}: {c.name}</div>;
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "faq" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div><strong>1. Tôi nên chọn Xếp lịch nhanh hay Nâng cao?</strong><br />Dùng <em>Xếp lịch nhanh</em> nếu giải đã setup sẵn giờ và thời lượng. Dùng <em>Nâng cao (7 bước)</em> nếu giải nhiều ngày, có giờ riêng từng thảm hoặc cần kiểm tra kỹ từng bước.</div>
              <div><strong>2. Tại sao đặt Thảm cuối là ★ Bắt buộc: Kumite thì Thảm 1 & 2 vẫn có Kumite?</strong><br />Vì thẻ trên Thảm cuối chỉ quy định cho riêng Thảm cuối (không nhận Kata). Các thảm còn lại ở chế độ Tự động vẫn chạy Kata trước rồi tiếp tục hỗ trợ Kumite cho đều thảm.</div>
              <div><strong>3. Áp dụng lịch xong có hoàn tác được không?</strong><br />Có — ngay trên trang Lịch thi đấu luôn có nút <strong>Hoàn tác</strong> để khôi phục lịch trước đó.</div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

