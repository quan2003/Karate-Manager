import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ACTIONS, useTournament, useTournamentDispatch } from "../context/TournamentContext";
import { useToast } from "../components/common/Toast";
import { exportCertificateWordFromTemplate } from "../services/certificateWordTemplateService";
import {
  createCertificateBatchRecord,
  exportCertificateMailMergeExcel,
  getCertificateCategoryFingerprint,
  getCertificateCategorySummary,
  getCertificateRecipients,
  getCertificateSessionGroups,
} from "../services/certificateBatchService";
import "./CertificateBatchPage.css";

const formatDateTime = (value) => new Date(value).toLocaleString("vi-VN");
const formatDay = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN");
const periodLabel = (period) => (period === "afternoon" ? "Buổi chiều" : "Buổi sáng");
const formatReceivedTime = (value) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
  : "Chưa có giờ nhận";
const STATUS_META = {
  not_exported: { label: "Chưa xuất", icon: "○" },
  exported: { label: "Đã xuất · Chờ in", icon: "◷" },
  printed: { label: "Đã in", icon: "✓" },
  needs_reexport: { label: "Cần xuất lại", icon: "↻" },
  pending: { label: "Chưa có kết quả", icon: "–" },
};

export default function CertificateBatchPage() {
  const { id } = useParams();
  const { tournaments } = useTournament();
  const dispatch = useTournamentDispatch();
  const { toast } = useToast();
  const tournament = tournaments.find((item) => item.id === id);
  const templateInputRef = useRef(null);
  const summary = useMemo(() => getCertificateCategorySummary(tournament), [tournament]);
  const sessionGroups = useMemo(() => getCertificateSessionGroups(tournament, summary), [tournament, summary]);
  const [activeSessionKey, setActiveSessionKey] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [exporting, setExporting] = useState("");

  useEffect(() => {
    if (!sessionGroups.length) {
      setActiveSessionKey(null);
      setSelectedIds(new Set());
      return;
    }
    if (sessionGroups.some((group) => group.key === activeSessionKey)) return;
    const firstCompleted = sessionGroups.find((group) => group.readyCount > 0) || sessionGroups[0];
    setActiveSessionKey(firstCompleted.key);
    setSelectedIds(new Set(firstCompleted.categories.filter((category) => category.ready).map((category) => category.id)));
  }, [activeSessionKey, sessionGroups]);

  if (!tournament) return <div className="page"><div className="container"><h2>Không tìm thấy giải đấu</h2><Link to="/admin" className="btn btn-primary">Về quản lý giải</Link></div></div>;

  const templates = tournament.certificateWordTemplates || [];
  const activeTemplate = templates.find((template) => template.active) || templates[0] || null;
  const batches = tournament.certificatePrintBatches || [];
  const printedRecords = tournament.certificatePrintedCategories || {};
  const activeSession = sessionGroups.find((group) => group.key === activeSessionKey) || null;
  const visibleCategories = activeSession?.categories || [];

  const getStatus = (category) => {
    if (!category.ready) return "pending";
    const fingerprint = getCertificateCategoryFingerprint(tournament, category.id);
    const lastBatch = batches.find((batch) =>
      batch.outputType === "word"
      && batch.documentKind === "individual_certificate_v1"
      && batch.categoryIds?.includes(category.id)
    );
    if (!lastBatch) return "not_exported";
    const exportedFingerprint = lastBatch.fingerprints?.[category.id];
    if (exportedFingerprint && exportedFingerprint !== fingerprint) return "needs_reexport";
    const printed = printedRecords[category.id];
    if (printed?.fingerprint === fingerprint && new Date(printed.printedAt) >= new Date(lastBatch.createdAt)) return "printed";
    return "exported";
  };

  const rows = visibleCategories.map((category) => ({ ...category, status: getStatus(category) }));
  const counts = rows.reduce((result, row) => ({ ...result, [row.status]: (result[row.status] || 0) + 1 }), {});
  const filteredRows = statusFilter === "all" ? rows : rows.filter((row) => row.status === statusFilter);
  const readyIds = rows.filter((item) => item.ready).map((item) => item.id);
  const selected = readyIds.filter((categoryId) => selectedIds.has(categoryId));
  const recipientCount = selected.length ? getCertificateRecipients(tournament, selected).length : 0;
  const printableSelected = rows.filter((row) => selectedIds.has(row.id) && ["exported", "printed"].includes(row.status));

  const updateTournament = (payload) => dispatch({ type: ACTIONS.UPDATE_TOURNAMENT, payload: { id: tournament.id, ...payload } });
  const toggle = (categoryId) => setSelectedIds((current) => {
    const next = new Set(current);
    next.has(categoryId) ? next.delete(categoryId) : next.add(categoryId);
    return next;
  });
  const changeSession = (sessionKey) => {
    const group = sessionGroups.find((item) => item.key === sessionKey);
    setActiveSessionKey(sessionKey);
    setStatusFilter("all");
    setSelectedIds(new Set(group?.categories.filter((category) => category.ready).map((category) => category.id) || []));
  };
  const selectFiltered = () => setSelectedIds(new Set(filteredRows.filter((row) => row.ready).map((row) => row.id)));
  const saveTemplates = (nextTemplates) => updateTournament({ certificateWordTemplates: nextTemplates });
  const uploadTemplate = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) return toast.error("Chỉ nhận file mẫu Word định dạng .docx.");
    const reader = new FileReader();
    reader.onerror = () => toast.error("Không thể đọc file mẫu Word.");
    reader.onload = () => {
      const template = { id: crypto.randomUUID?.() || `word-template-${Date.now()}`, name: file.name, fileData: String(reader.result), uploadedAt: new Date().toISOString(), active: true };
      saveTemplates([...templates.map((item) => ({ ...item, active: false })), template]);
      toast.success(`Đã tải mẫu Word: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };
  const changeActiveTemplate = (templateId) => saveTemplates(templates.map((template) => ({ ...template, active: template.id === templateId })));
  const saveBatch = (outputType, count) => {
    const fingerprints = Object.fromEntries(selected.map((categoryId) => [categoryId, getCertificateCategoryFingerprint(tournament, categoryId)]));
    const batch = createCertificateBatchRecord({
      categoryIds: selected,
      recipientCount: count,
      outputType,
      fingerprints,
      documentKind: outputType === "word" ? "individual_certificate_v1" : null,
    });
    updateTournament({ certificatePrintBatches: [batch, ...batches] });
  };
  const runExport = async (type) => {
    if (!selected.length) return toast.error("Hãy chọn ít nhất một nội dung đã có kết quả.");
    if (type === "word" && !activeTemplate) return toast.error("Hãy tải và chọn mẫu Word trước khi xuất.");
    setExporting(type);
    try {
      const result = type === "excel"
        ? await exportCertificateMailMergeExcel(tournament, selected)
        : await exportCertificateWordFromTemplate(tournament, activeTemplate, selected);
      if (result?.canceled) return;
      saveBatch(type, result.rowCount);
      toast.success(`Đã xuất ${result.rowCount} giấy. Các nội dung vừa chọn đã chuyển sang trạng thái chờ in.`);
    } catch (error) {
      toast.error(error?.message || "Không thể xuất giấy chứng nhận.");
    } finally {
      setExporting("");
    }
  };
  const markAsPrinted = () => {
    if (!printableSelected.length) return toast.error("Chỉ có thể xác nhận các nội dung đã xuất file.");
    const printedAt = new Date().toISOString();
    const next = { ...printedRecords };
    printableSelected.forEach((row) => {
      next[row.id] = { printedAt, fingerprint: getCertificateCategoryFingerprint(tournament, row.id) };
    });
    updateTournament({ certificatePrintedCategories: next });
    toast.success(`Đã xác nhận in thực tế ${printableSelected.length} nội dung.`);
  };

  return <div className="page cert-batch-page"><div className="container">
    <header className="cert-head"><div><Link to={`/tournament/${tournament.id}`} className="cert-back">← Quay lại giải đấu</Link><h1>In giấy chứng nhận</h1><p>{tournament.name}</p></div><div className="cert-head-count"><strong>{recipientCount}</strong><span>giấy đang chọn</span></div></header>

    <div className="cert-toolbar">
      <div className="cert-control cert-template-control"><label>Mẫu Word</label><div>{activeTemplate ? <select value={activeTemplate.id} onChange={(event) => changeActiveTemplate(event.target.value)}>{templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select> : <span className="cert-no-template">Chưa có mẫu</span>}<input ref={templateInputRef} type="file" accept=".docx" hidden onChange={uploadTemplate} /><button onClick={() => templateInputRef.current?.click()}>＋ Tải mẫu</button></div></div>
      <div className="cert-control"><label>Buổi thi</label><select value={activeSessionKey || ""} onChange={(event) => changeSession(event.target.value)}>{sessionGroups.map((group) => <option value={group.key} key={group.key}>{formatDay(group.date)} · {periodLabel(group.period)} · {group.recipientCount} giấy</option>)}</select></div>
    </div>

    <div className="cert-status-filters">
      <button className={statusFilter === "all" ? "active all" : ""} onClick={() => setStatusFilter("all")}><strong>{rows.filter((row) => row.ready).length}</strong><span>Tất cả có kết quả</span></button>
      {[["not_exported", "Chưa xuất"], ["exported", "Chờ in"], ["printed", "Đã in"], ["needs_reexport", "Cần xuất lại"]].map(([status, label]) => <button key={status} className={`${statusFilter === status ? "active " : ""}${status}`} onClick={() => setStatusFilter(status)}><strong>{counts[status] || 0}</strong><span>{label}</span></button>)}
    </div>

    <main className="cert-worklist">
      <div className="cert-list-head"><div><h2>Nội dung {activeSession ? periodLabel(activeSession.period).toLowerCase() : "thi đấu"}</h2><p>{filteredRows.length} nội dung đang hiển thị</p></div><div><button onClick={selectFiltered}>Chọn danh sách này</button><button onClick={() => setSelectedIds(new Set())}>Bỏ chọn</button></div></div>
      <div className="cert-table-head"><span></span><span>Giờ / Nội dung</span><span>Số giấy</span><span>Trạng thái</span></div>
      <div className="cert-rows">{filteredRows.map((row) => <label key={row.id} className={`cert-row status-${row.status}`}><input type="checkbox" disabled={!row.ready} checked={selectedIds.has(row.id)} onChange={() => toggle(row.id)} /><span className="cert-row-name"><small className={!row.resultReceivedAt ? "missing-time" : ""}>{formatReceivedTime(row.resultReceivedAt)}</small><strong>{row.name}</strong><em>{row.type === "kata" ? "Kata" : "Kumite"}</em></span><span className="cert-recipient-count">{row.ready ? `${row.recipientCount} giấy` : "—"}</span><span className={`cert-status ${row.status}`}>{STATUS_META[row.status].icon} {STATUS_META[row.status].label}</span></label>)}</div>
      {!filteredRows.length && <div className="cert-empty">Không có nội dung phù hợp với bộ lọc này.</div>}
    </main>

    <div className="cert-actionbar"><div><strong>{selected.length} nội dung · {recipientCount} giấy</strong><span>{activeTemplate ? `Mẫu: ${activeTemplate.name} · mỗi VĐV một trang` : "Hãy tải mẫu Word trước khi xuất"}</span></div><div className="cert-action-buttons"><button className="secondary" disabled={!recipientCount || exporting} onClick={() => runExport("excel")}>Excel dự phòng</button><button className="print-confirm" disabled={!printableSelected.length || exporting} onClick={markAsPrinted}>✓ Đã in thực tế</button><button className="primary" disabled={!activeTemplate || !recipientCount || exporting} onClick={() => runExport("word")}>{exporting === "word" ? "Đang tạo file…" : `Xuất Word (${recipientCount})`}</button></div></div>

    <details className="cert-history"><summary>Lịch sử xuất file ({batches.length})</summary>{batches.length ? batches.slice(0, 20).map((batch) => <div key={batch.id}><strong>{batch.outputType === "excel" ? "Excel dự phòng" : "File Word"}</strong><span>{batch.recipientCount} giấy · {formatDateTime(batch.createdAt)}</span></div>) : <p>Chưa có lần xuất nào.</p>}</details>
  </div></div>;
}
