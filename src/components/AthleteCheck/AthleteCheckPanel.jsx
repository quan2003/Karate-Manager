import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ACTIONS } from "../../context/TournamentContext";
import "./AthleteCheckPanel.css";

const DEFAULT_SETTINGS = { weightToleranceKg: 0.5 };
const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const sanitizeDecimalInput = (value) => {
  const cleaned = String(value ?? "").replace(/[^\d,.]/g, "");
  const separatorIndex = cleaned.search(/[,.]/);
  if (separatorIndex < 0) return cleaned;
  return `${cleaned.slice(0, separatorIndex)}${cleaned[separatorIndex]}${cleaned
    .slice(separatorIndex + 1)
    .replace(/[,.]/g, "")}`;
};
const getAthleteIdentityKey = (athlete) =>
  [
    athlete.name,
    athlete.club,
    athlete.birthDate || athlete.birthYear,
    athlete.gender,
  ]
    .map(normalizeText)
    .join("|");
const getRegistrationKey = (entry) =>
  `${entry.categoryId}|${entry.athlete.id || getAthleteIdentityKey(entry.athlete)}`;
const isKumiteCategory = (category) =>
  normalizeText(category.type) === "kumite" ||
  normalizeText(category.name).includes("kumite");
const getBirthYear = (athlete) => {
  if (athlete.birthYear) return athlete.birthYear;
  if (!athlete.birthDate) return "";
  const match = String(athlete.birthDate).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : athlete.birthDate;
};
const getCategoryWeightLimits = (category) => {
  const configuredMin = toNumber(category.weightMin);
  const configuredMax = toNumber(category.weightMax);
  if (configuredMin !== null || configuredMax !== null) {
    return { min: configuredMin, max: configuredMax };
  }

  const weightText = normalizeText(
    category.weightClass || category.name,
  ).replace(/,/g, ".");
  const rangeMatch = weightText.match(
    /(\d+(?:\.\d+)?)\s*(?:-|–|den|toi)\s*(\d+(?:\.\d+)?)\s*kg/,
  );
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  }
  const singleMatch = weightText.match(/(\d+(?:\.\d+)?)\s*kg/);
  if (!singleMatch) return { min: null, max: null };
  const weight = Number(singleMatch[1]);
  return { min: weight, max: weight };
};
const formatKgNumber = (value) =>
  Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const formatWeightLimits = (entry, tolerance = 0) => {
  const { min, max } = entry.weightLimits || {};
  const hasMin = min !== null && min !== undefined;
  const hasMax = max !== null && max !== undefined;
  if (!hasMin && !hasMax) return "Chưa cấu hình";
  const baseLabel =
    entry.weightClass ||
    (hasMin && hasMax
      ? min === max
        ? `${formatKgNumber(min)} kg`
        : `${formatKgNumber(min)}–${formatKgNumber(max)} kg`
      : hasMin
        ? `Từ ${formatKgNumber(min)} kg`
        : `Đến ${formatKgNumber(max)} kg`);
  const allowedLabel =
    hasMin && hasMax
      ? `${formatKgNumber(min - tolerance)}–${formatKgNumber(max + tolerance)} kg`
      : hasMin
        ? `từ ${formatKgNumber(min - tolerance)} kg`
        : `đến ${formatKgNumber(max + tolerance)} kg`;
  return `${baseLabel} (cho phép ${allowedLabel})`;
};
const getEvaluation = (entry, cardRecord, weighRecord, tolerance) => {
  if (!entry.isKumite)
    return cardRecord?.checked
      ? { code: "pass", label: "Đạt", difference: null }
      : { code: "missing-card", label: "Chưa check thẻ", difference: null };
  const actual = toNumber(weighRecord?.actualWeight);
  const min = entry.weightLimits?.min ?? null;
  const max = entry.weightLimits?.max ?? null;
  let difference = null;
  if (actual !== null) {
    if (min !== null && actual < min) difference = actual - min;
    if (max !== null && actual > max) difference = actual - max;
    const belowAllowed = min !== null && actual < min - tolerance;
    const aboveAllowed = max !== null && actual > max + tolerance;
    if (belowAllowed || aboveAllowed) {
      return {
        code: "fail",
        label: "Không đạt hạng cân",
        difference,
      };
    }
  }
  if (!cardRecord?.checked)
    return { code: "missing-card", label: "Chưa check thẻ", difference: null };
  if (actual === null)
    return { code: "missing-weight", label: "Chưa cân", difference: null };
  if (min === null && max === null)
    return {
      code: "missing-limit",
      label: "Chưa cấu hình hạng cân",
      difference: null,
    };
  if (difference !== null) {
    return {
      code: "pass",
      label: "Đạt trong dung sai",
      difference,
    };
  }
  return { code: "pass", label: "Đạt", difference };
};

export default function AthleteCheckPanel({ tournament, dispatch, toast }) {
  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [checkInPin, setCheckInPin] = useState(() =>
    String(Math.floor(100000 + Math.random() * 900000)),
  );
  const [lanStatus, setLanStatus] = useState({
    running: false,
    ip: "",
    port: 3000,
    checkIn: { enabled: false },
  });
  const [checkInBusy, setCheckInBusy] = useState(false);
  const hasLanApi = Boolean(window.electronAPI?.lan);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(tournament.athleteCheckSettings || {}),
  };
  const cards = tournament.athleteChecks?.cards || {};
  const weighIns = tournament.athleteChecks?.weighIns || {};
  const tolerance = Math.max(0, toNumber(settings.weightToleranceKg) ?? 0);
  const checkInUrl =
    lanStatus.checkIn?.url ||
    (lanStatus.ip
      ? `http://${lanStatus.ip}:${lanStatus.port || 3000}/check-in`
      : "");
  const isThisTournamentShared = Boolean(
    lanStatus.running &&
    lanStatus.checkIn?.enabled &&
    String(lanStatus.checkIn?.tournamentId) === String(tournament.id),
  );

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      if (!window.electronAPI?.lan) return;
      const status = await window.electronAPI.lan.getServerStatus();
      if (!active || !status) return;
      setLanStatus(status);
      if (
        status.checkIn?.enabled &&
        String(status.checkIn?.tournamentId) === String(tournament.id) &&
        status.checkIn?.pin
      ) {
        setCheckInPin(status.checkIn.pin);
      }
    };
    loadStatus();
    return () => {
      active = false;
    };
  }, [tournament.id]);

  const toggleSecretaryCheckIn = async () => {
    if (!window.electronAPI?.lan || checkInBusy) return;
    setCheckInBusy(true);
    try {
      if (isThisTournamentShared) {
        const result = await window.electronAPI.lan.configureCheckIn({
          enabled: false,
        });
        if (!result.success)
          throw new Error(result.error || "Không thể tắt bàn Check-in");
        const status = await window.electronAPI.lan.getServerStatus();
        setLanStatus(status);
        toast.success("Đã tắt quyền truy cập bàn Check-in");
        return;
      }
      if (!/^\d{6}$/.test(checkInPin))
        throw new Error("Mã PIN phải có đúng 6 chữ số");
      let status = await window.electronAPI.lan.getServerStatus();
      if (!status?.running) {
        const started = await window.electronAPI.lan.startServer();
        if (!started.success)
          throw new Error(started.error || "Không thể bật máy chủ LAN");
      }
      const result = await window.electronAPI.lan.configureCheckIn({
        enabled: true,
        tournamentId: tournament.id,
        pin: checkInPin,
      });
      if (!result.success)
        throw new Error(result.error || "Không thể bật bàn Check-in");
      status = await window.electronAPI.lan.getServerStatus();
      setLanStatus(status);
      toast.success("Đã bật bàn Check-in cho thư ký");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCheckInBusy(false);
    }
  };

  const copyCheckInUrl = async () => {
    try {
      await navigator.clipboard.writeText(checkInUrl);
      toast.success("Đã sao chép địa chỉ Check-in");
    } catch {
      toast.error("Không thể sao chép tự động, hãy chép địa chỉ đang hiển thị");
    }
  };

  const entries = useMemo(() => {
    const result = [];
    (tournament.categories || []).forEach((category, categoryOrder) =>
      (category.athletes || []).forEach((athlete) =>
        result.push({
          categoryId: category.id,
          categoryName: category.name,
          categoryOrder,
          weightClass: category.weightClass || "",
          isKumite: isKumiteCategory(category),
          weightLimits: getCategoryWeightLimits(category),
          athlete,
        }),
      ),
    );
    return result.sort(
      (a, b) =>
        a.categoryOrder - b.categoryOrder ||
        String(a.athlete.name).localeCompare(String(b.athlete.name), "vi"),
    );
  }, [tournament.categories]);
  const clubs = useMemo(
    () =>
      [
        ...new Set(entries.map((entry) => entry.athlete.club).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b, "vi")),
    [entries],
  );
  const categoryOptions = useMemo(
    () =>
      (tournament.categories || [])
        .filter((category) => (category.athletes || []).length > 0)
        .map((category, displayIndex) => ({
          id: String(category.id),
          name: category.name,
          athleteCount: category.athletes.length,
          displayIndex,
        })),
    [tournament.categories],
  );
  const rows = entries.map((entry) => {
    const identityKey = getAthleteIdentityKey(entry.athlete);
    const registrationKey = getRegistrationKey(entry);
    const cardRecord = cards[identityKey] || {};
    const weighRecord = weighIns[registrationKey] || {};
    return {
      ...entry,
      identityKey,
      registrationKey,
      cardRecord,
      weighRecord,
      evaluation: getEvaluation(entry, cardRecord, weighRecord, tolerance),
    };
  });
  const filteredRows = rows.filter((row) => {
    const term = normalizeText(search);
    if (clubFilter !== "all" && row.athlete.club !== clubFilter) return false;
    if (categoryFilter !== "all" && String(row.categoryId) !== categoryFilter)
      return false;
    if (typeFilter === "kumite" && !row.isKumite) return false;
    if (typeFilter === "kata" && row.isKumite) return false;
    if (statusFilter === "pass" && row.evaluation.code !== "pass") return false;
    if (statusFilter === "fail" && row.evaluation.code !== "fail") return false;
    if (
      statusFilter === "pending" &&
      ["pass", "fail"].includes(row.evaluation.code)
    )
      return false;
    return (
      !term ||
      normalizeText(
        [
          row.athlete.name,
          row.athlete.club,
          row.categoryName,
          row.weightClass,
        ].join(" "),
      ).includes(term)
    );
  });
  const hasKumiteRows = filteredRows.some((row) => row.isKumite);
  const summary = {
    total: rows.length,
    cards: new Set(
      rows
        .filter((row) => row.cardRecord.checked)
        .map((row) => row.identityKey),
    ).size,
    weighed: rows.filter(
      (row) => row.isKumite && toNumber(row.weighRecord.actualWeight) !== null,
    ).length,
    failed: rows.filter((row) => row.evaluation.code === "fail").length,
  };

  const persistChecks = (nextCards, nextWeighIns) =>
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: {
        id: tournament.id,
        athleteChecks: { cards: nextCards, weighIns: nextWeighIns },
      },
    });
  const updateCard = (identityKey, checked) =>
    persistChecks(
      {
        ...cards,
        [identityKey]: {
          ...(cards[identityKey] || {}),
          checked,
          checkedAt: checked ? new Date().toISOString() : "",
        },
      },
      weighIns,
    );
  const updateWeighIn = (registrationKey, field, value) =>
    persistChecks(cards, {
      ...weighIns,
      [registrationKey]: {
        ...(weighIns[registrationKey] || {}),
        [field]: value,
        ...(field === "actualWeight"
          ? { weighedAt: value !== "" ? new Date().toISOString() : "" }
          : {}),
      },
    });
  const updateTolerance = (value) =>
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: {
        id: tournament.id,
        athleteCheckSettings: {
          ...settings,
          weightToleranceKg: sanitizeDecimalInput(value),
        },
      },
    });
  const buildExportRows = () =>
    filteredRows.map((row, index) => {
      const exportRow = {
        STT: index + 1,
        "Họ tên VĐV": row.athlete.name || "",
        "Năm sinh": getBirthYear(row.athlete),
        "Đơn vị/CLB": row.athlete.club || "",
        "Hạng mục": row.categoryName || "",
        "Đã check thẻ": row.cardRecord.checked ? "Có" : "Chưa",
      };
      if (row.isKumite) {
        exportRow["Giới hạn hạng cân"] = formatWeightLimits(row, tolerance);
        exportRow["Cân thực tế (kg)"] = row.weighRecord.actualWeight ?? "";
        exportRow["Chênh lệch (kg)"] =
          row.evaluation.difference === null
            ? ""
            : Number(row.evaluation.difference.toFixed(2));
      }
      exportRow["Kết luận"] = row.evaluation.label;
      exportRow["Ghi chú"] = row.weighRecord.note || "";
      return exportRow;
    });
  const exportExcel = () => {
    const data = buildExportRows();
    if (!data.length)
      return toast.warning("Không có VĐV phù hợp với bộ lọc để xuất");
    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet["!cols"] = hasKumiteRows
      ? [
          { wch: 6 },
          { wch: 25 },
          { wch: 11 },
          { wch: 22 },
          { wch: 30 },
          { wch: 14 },
          { wch: 12 },
          { wch: 16 },
          { wch: 17 },
          { wch: 18 },
          { wch: 28 },
        ]
      : [
          { wch: 6 },
          { wch: 25 },
          { wch: 11 },
          { wch: 22 },
          { wch: 30 },
          { wch: 14 },
          { wch: 18 },
          { wch: 28 },
        ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Check VĐV");
    XLSX.writeFile(
      workbook,
      `Check_VDV_${String(tournament.name || "Giai_dau").replace(/[^a-zA-Z0-9\u00C0-\u024F]+/g, "_")}.xlsx`,
    );
    toast.success("Đã xuất danh sách check VĐV ra Excel");
  };
  const printChecklist = () => {
    if (!filteredRows.length)
      return toast.warning("Không có VĐV phù hợp với bộ lọc để in");
    const bodyRows = filteredRows
      .map((row, index) => {
        const difference =
          row.evaluation.difference === null
            ? ""
            : `${row.evaluation.difference > 0 ? "+" : ""}${row.evaluation.difference.toFixed(2)}`;
        const weightCells = hasKumiteRows
          ? `<td>${row.isKumite ? escapeHtml(formatWeightLimits(row, tolerance)) : "—"}</td><td>${row.isKumite ? escapeHtml(row.weighRecord.actualWeight ?? "") : "—"}</td><td>${row.isKumite ? escapeHtml(difference) : "—"}</td>`
          : "";
        return `<tr class="${row.evaluation.code === "fail" ? "failed" : ""}"><td>${index + 1}</td><td class="left"><strong>${escapeHtml(row.athlete.name)}</strong><br><small>${escapeHtml(row.athlete.club)}</small></td><td class="left">${escapeHtml(row.categoryName)}</td>${weightCells}<td>${row.cardRecord.checked ? "☑" : "☐"}</td><td><strong>${escapeHtml(row.evaluation.label)}</strong></td><td class="left">${escapeHtml(row.weighRecord.note || "")}</td></tr>`;
      })
      .join("");
    const weightHeaders = hasKumiteRows
      ? "<th>Hạng cân</th><th>Cân TT</th><th>Sai lệch</th>"
      : "";
    const printTitle = hasKumiteRows
      ? "DANH SÁCH CHECK THẺ VÀ CÂN VĐV"
      : "DANH SÁCH CHECK THẺ VĐV KATA";
    const printMeta = hasKumiteRows
      ? `Dung sai theo giới hạn hạng cân: ±${escapeHtml(tolerance)} kg`
      : "Chỉ kiểm tra thẻ VĐV";
    const weighSignature = hasKumiteRows
      ? "<div>NGƯỜI CÂN<br><br><br>(Ký, ghi rõ họ tên)</div>"
      : "";
    const frame = document.createElement("iframe");
    frame.style.cssText =
      "position:fixed;left:-9999px;width:297mm;height:210mm;border:0";
    document.body.appendChild(frame);
    frame.contentDocument.open();
    frame.contentDocument.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Check VĐV</title><style>@page{size:A4 landscape;margin:9mm}body{font-family:Arial,sans-serif;color:#111;margin:0}h1{text-align:center;font-size:20px;margin:0 0 4px}h2{text-align:center;font-size:14px;margin:0 0 6px}.meta{text-align:center;font-size:11px;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #111;padding:5px 4px;text-align:center}th{background:#e5e7eb}td.left{text-align:left}tr.failed td{background:#fecaca!important;color:#991b1b}small{font-size:9px}.signatures{display:flex;justify-content:space-around;margin-top:18px;text-align:center;font-size:11px}</style></head><body><h1>${printTitle}</h1><h2>${escapeHtml(tournament.name)}</h2><div class="meta">${printMeta} • Ngày in: ${new Date().toLocaleString("vi-VN")}</div><table><thead><tr><th>STT</th><th>VĐV / Đơn vị</th><th>Hạng mục</th>${weightHeaders}<th>Thẻ</th><th>Kết luận</th><th>Ghi chú</th></tr></thead><tbody>${bodyRows}</tbody></table><div class="signatures"><div>NGƯỜI KIỂM TRA THẺ<br><br><br>(Ký, ghi rõ họ tên)</div>${weighSignature}<div>BAN TỔ CHỨC<br><br><br>(Ký, ghi rõ họ tên)</div></div></body></html>`,
    );
    frame.contentDocument.close();
    frame.onload = () =>
      setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => frame.remove(), 1000);
      }, 250);
  };

  return (
    <div className="athlete-check-panel">
      <div className="athlete-check-header">
        <div>
          <h2>🪪 Check thẻ & cân VĐV</h2>
          <p>
            Check thẻ dùng chung cho một VĐV; cân thực tế lưu riêng theo từng
            hạng mục Kumite.
          </p>
        </div>
        <div className="athlete-check-actions">
          <button className="btn" onClick={printChecklist}>
            🖨️ In / PDF
          </button>
          <button className="btn btn-success" onClick={exportExcel}>
            📊 Xuất Excel
          </button>
        </div>
      </div>
      <div
        className={`athlete-check-lan ${isThisTournamentShared ? "online" : ""}`}
      >
        <div className="athlete-check-lan-info">
          <strong>📡 Bàn Check-in cho thư ký qua mạng LAN</strong>
          {hasLanApi ? (
            isThisTournamentShared ? (
              <span>
                Đang mở tại <b>{checkInUrl}</b> • PIN <b>{checkInPin}</b>
              </span>
            ) : lanStatus.checkIn?.enabled ? (
              <span>
                Một giải khác đang được chia sẻ. Bật tại đây để chuyển sang giải
                hiện tại.
              </span>
            ) : (
              <span>
                Bật để thư ký dùng điện thoại/laptop cùng Wi-Fi, không cần key
                bản quyền.
              </span>
            )
          ) : (
            <span>
              Chức năng này chỉ hoạt động trong ứng dụng K-SPORT Desktop.
            </span>
          )}
        </div>
        {hasLanApi && (
          <div className="athlete-check-lan-actions">
            {!isThisTournamentShared && (
              <label>
                <span>PIN</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={checkInPin}
                  onChange={(event) =>
                    setCheckInPin(event.target.value.replace(/\D/g, ""))
                  }
                />
              </label>
            )}
            {isThisTournamentShared && checkInUrl && (
              <button className="btn" onClick={copyCheckInUrl}>
                📋 Sao chép địa chỉ
              </button>
            )}
            <button
              className={`btn ${isThisTournamentShared ? "btn-danger" : "btn-primary"}`}
              onClick={toggleSecretaryCheckIn}
              disabled={checkInBusy}
            >
              {checkInBusy
                ? "Đang xử lý…"
                : isThisTournamentShared
                  ? "Tắt bàn Check-in"
                  : "Bật bàn Check-in"}
            </button>
          </div>
        )}
      </div>
      <div className="athlete-check-summary">
        <div>
          <span>Lượt đăng ký</span>
          <strong>{summary.total}</strong>
        </div>
        <div>
          <span>Đã check thẻ</span>
          <strong>{summary.cards}</strong>
        </div>
        <div>
          <span>Đã cân Kumite</span>
          <strong>{summary.weighed}</strong>
        </div>
        <div className={summary.failed ? "danger" : ""}>
          <span>Vượt dung sai</span>
          <strong>{summary.failed}</strong>
        </div>
      </div>
      {hasKumiteRows && (
        <div className="athlete-check-config">
          <label>
            <span>Dung sai theo hạng cân</span>
            <div className="tolerance-input">
              <span>±</span>
              <input
                type="text"
                inputMode="decimal"
                value={settings.weightToleranceKg}
                onChange={(event) => updateTolerance(event.target.value)}
              />
              <span>kg</span>
            </div>
          </label>
          <p>
            Hệ thống so cân thực tế với giới hạn của nội dung (ví dụ −60 kg, +60
            kg hoặc 55–60 kg), vượt dung sai sẽ tô đỏ.
          </p>
        </div>
      )}
      <div className="athlete-check-filters">
        <input
          className="input"
          placeholder="Tìm tên VĐV, đơn vị, hạng mục..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="input"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="all">Tất cả hạng mục</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.displayIndex + 1}. {category.name} (
              {category.athleteCount} VĐV)
            </option>
          ))}
        </select>
        <select
          className="input"
          value={clubFilter}
          onChange={(event) => setClubFilter(event.target.value)}
        >
          <option value="all">Tất cả đơn vị</option>
          {clubs.map((club) => (
            <option key={club} value={club}>
              {club}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          <option value="all">Kata & Kumite</option>
          <option value="kumite">Chỉ Kumite</option>
          <option value="kata">Chỉ Kata</option>
        </select>
        <select
          className="input"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chưa hoàn tất</option>
          <option value="pass">Đạt</option>
          <option value="fail">Không đạt hạng cân</option>
        </select>
      </div>
      <div className="athlete-check-count">
        Hiển thị {filteredRows.length}/{rows.length} lượt đăng ký • File xuất tự
        động theo danh sách đang chọn
      </div>
      <div className="table-responsive athlete-check-table-wrap">
        <table className="stats-table athlete-check-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>VĐV</th>
              <th>Đơn vị</th>
              <th>Hạng mục</th>
              {hasKumiteRows && <th>Giới hạn hạng cân</th>}
              <th>Check thẻ</th>
              {hasKumiteRows && (
                <>
                  <th>Cân thực tế</th>
                  <th>Chênh lệch</th>
                </>
              )}
              <th>Kết luận</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, index) => {
              const difference = row.evaluation.difference;
              return (
                <tr
                  key={row.registrationKey}
                  className={
                    row.evaluation.code === "fail" ? "athlete-check-failed" : ""
                  }
                >
                  <td>{index + 1}</td>
                  <td className="athlete-check-name">
                    <strong>{row.athlete.name}</strong>
                    {getBirthYear(row.athlete) && (
                      <small>{getBirthYear(row.athlete)}</small>
                    )}
                  </td>
                  <td>{row.athlete.club || "—"}</td>
                  <td>
                    <strong>{row.categoryName}</strong>
                  </td>
                  {hasKumiteRows && (
                    <td>
                      {row.isKumite ? formatWeightLimits(row, tolerance) : "—"}
                    </td>
                  )}
                  <td>
                    <label className="athlete-card-check">
                      <input
                        type="checkbox"
                        checked={Boolean(row.cardRecord.checked)}
                        onChange={(event) =>
                          updateCard(row.identityKey, event.target.checked)
                        }
                      />
                      <span>
                        {row.cardRecord.checked ? "Đã check" : "Chưa"}
                      </span>
                    </label>
                  </td>
                  {hasKumiteRows && (
                    <>
                      <td>
                        {row.isKumite ? (
                          <div className="actual-weight-input">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Nhập cân"
                              value={row.weighRecord.actualWeight ?? ""}
                              onChange={(event) =>
                                updateWeighIn(
                                  row.registrationKey,
                                  "actualWeight",
                                  sanitizeDecimalInput(event.target.value),
                                )
                              }
                            />
                            <span>kg</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className={
                          row.evaluation.code === "fail"
                            ? "difference-fail"
                            : ""
                        }
                      >
                        {row.isKumite && difference !== null
                          ? `${difference > 0 ? "+" : ""}${difference.toFixed(2)} kg`
                          : "—"}
                      </td>
                    </>
                  )}
                  <td>
                    <span className={`check-status ${row.evaluation.code}`}>
                      {row.evaluation.label}
                    </span>
                  </td>
                  <td>
                    <input
                      className="athlete-check-note"
                      placeholder="Ghi chú..."
                      value={row.weighRecord.note || ""}
                      onChange={(event) =>
                        updateWeighIn(
                          row.registrationKey,
                          "note",
                          event.target.value,
                        )
                      }
                    />
                  </td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={hasKumiteRows ? 10 : 7}
                  className="athlete-check-empty"
                >
                  Không có VĐV phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
