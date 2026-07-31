import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ACTIONS, useTournament, useTournamentDispatch } from "../context/TournamentContext";
import ConfirmDialog from "../components/common/ConfirmDialog";
import { useToast } from "../components/common/Toast";
import appIcon from "../assets/icon.png";
import excelLogo from "../assets/excel-logo.svg";
import pdfLogo from "../assets/pdf-logo.svg";
import {
  downloadRefereeTemplate,
  exportRefereeDeploymentExcel,
  exportRefereeMatListsExcel,
  generateNextRefereeCode,
  mergeImportedReferees,
  normalizeFixedAssignments,
  parseRefereeExcelFile,
  randomizeRefereeAssignments,
} from "../services/refereeService";
import { exportRefereeDeploymentPdf, exportRefereeMatListsPdf } from "../services/refereePdfService";
import "./RefereesPage.css";

const EMPTY_REFEREE = {
  code: "",
  name: "",
  unit: "",
  grade: "",
  specialty: "Cả hai",
  refereeRole: "TTP",
  phone: "",
  note: "",
  active: true,
};

const formatRefereeRole = (value) => {
  const role = String(value || "").trim().toLocaleLowerCase("vi");
  return role === "ttc" || role.includes("chính") ? "TTC" : "TTP";
};

const makeId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function buildManagement(tournament) {
  const saved = tournament?.refereeManagement || {};
  const matCount = Math.max(1, Number(saved.matCount || tournament?.scheduleConfig?.matCount || 4));
  const savedReport = { ...(saved.report || {}) };
  delete savedReport.logo;
  return {
    referees: saved.referees || [],
    matCount,
    fixedByMat: normalizeFixedAssignments(saved.fixedByMat, matCount),
    assignments: saved.assignments || [],
    warnings: saved.warnings || [],
    generatedAt: saved.generatedAt || null,
    report: {
      eventName: tournament?.name || "",
      title: "PHÂN CÔNG TRỌNG TÀI",
      chairman: "",
      deputyChairman: "",
      secretary: "",
      date: tournament?.startDate || tournament?.date || "",
      ...savedReport,
    },
  };
}

export default function RefereesPage() {
  const { id } = useParams();
  const { tournaments } = useTournament();
  const dispatch = useTournamentDispatch();
  const { toast } = useToast();
  const importInputRef = useRef(null);
  const tournament = tournaments.find((item) => item.id === id);

  const [management, setManagement] = useState(() => buildManagement(tournament));
  const [form, setForm] = useState(EMPTY_REFEREE);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false });

  useEffect(() => {
    if (tournament) setManagement(buildManagement(tournament));
  }, [tournament]);

  const refereeMap = useMemo(
    () => new Map(management.referees.map((item) => [item.id, item])),
    [management.referees]
  );
  const units = useMemo(
    () => [...new Set(management.referees.map((item) => item.unit).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")),
    [management.referees]
  );
  const filteredReferees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi");
    return management.referees.filter((item) => {
      if (unitFilter !== "all" && item.unit !== unitFilter) return false;
      if (!query) return true;
      return [item.code, item.name, item.unit, item.grade, item.specialty, item.refereeRole]
        .some((value) => String(value || "").toLocaleLowerCase("vi").includes(query));
    });
  }, [management.referees, search, unitFilter]);

  const selectedFixedIds = useMemo(
    () => Object.values(management.fixedByMat).flatMap((item) =>
      [item.chiefId, item.deputy1Id, item.deputy2Id].filter(Boolean)
    ),
    [management.fixedByMat]
  );
  const duplicateFixedIds = useMemo(
    () => [...new Set(selectedFixedIds.filter((item, index, all) => all.indexOf(item) !== index))],
    [selectedFixedIds]
  );

  if (!tournament) {
    return <div className="page"><div className="container referee-not-found">
      <h2>Không tìm thấy giải đấu</h2>
      <Link to="/admin" className="btn btn-primary">Về quản lý giải đấu</Link>
    </div></div>;
  }

  const persist = (next, message) => {
    setManagement(next);
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: { id: tournament.id, refereeManagement: next },
    });
    if (message) toast.success(message);
  };

  const invalidateRandom = (next) => ({ ...next, assignments: [], warnings: [], generatedAt: null });

  const saveReferee = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) {
      toast.warning("Vui lòng nhập Họ và tên và Đơn vị.");
      return;
    }
    const code = form.code.trim() || generateNextRefereeCode(management.referees);
    const duplicate = management.referees.some(
      (item) => item.id !== editingId && item.code.trim().toLowerCase() === code.toLowerCase()
    );
    if (duplicate) {
      toast.error(`Mã trọng tài ${code} đã tồn tại.`);
      return;
    }
    const referee = { ...form, code, name: form.name.trim(), unit: form.unit.trim(), id: editingId || makeId() };
    const referees = editingId
      ? management.referees.map((item) => item.id === editingId ? referee : item)
      : [...management.referees, referee];
    persist(invalidateRandom({ ...management, referees }), editingId ? "Đã cập nhật trọng tài." : "Đã thêm trọng tài.");
    setForm(EMPTY_REFEREE);
    setEditingId(null);
  };

  const editReferee = (referee) => {
    setEditingId(referee.id);
    setForm({ ...EMPTY_REFEREE, ...referee });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteReferee = (referee) => {
    setConfirmDialog({
      open: true,
      title: "Xóa trọng tài",
      message: `Xóa ${referee.name} khỏi giải đấu? Các vị trí cố định liên quan cũng sẽ được bỏ chọn.`,
      type: "danger",
      onConfirm: () => {
        const fixedByMat = Object.fromEntries(Object.entries(management.fixedByMat).map(([mat, fixed]) => [
          mat,
          Object.fromEntries(Object.entries(fixed).map(([role, refereeId]) => [role, refereeId === referee.id ? "" : refereeId])),
        ]));
        persist(invalidateRandom({
          ...management,
          referees: management.referees.filter((item) => item.id !== referee.id),
          fixedByMat,
        }), "Đã xóa trọng tài.");
        setConfirmDialog({ open: false });
      },
    });
  };

  const importExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = await parseRefereeExcelFile(file);
      const merged = mergeImportedReferees(management.referees, result.referees);
      persist(invalidateRandom({ ...management, referees: merged.referees }));
      const errorText = result.errors.length ? ` Bỏ qua ${result.errors.length} dòng lỗi.` : "";
      toast.success(`Import xong: thêm ${merged.added}, cập nhật ${merged.updated}.${errorText}`, 7000);
      if (result.errors.length) console.warn("Lỗi import trọng tài:", result.errors);
    } catch (error) {
      toast.error(error.message || "Không thể đọc file Excel.");
    }
  };

  const changeMatCount = (value) => {
    const matCount = Math.min(20, Math.max(1, Number(value) || 1));
    setManagement((current) => invalidateRandom({
      ...current,
      matCount,
      fixedByMat: normalizeFixedAssignments(current.fixedByMat, matCount),
    }));
  };

  const updateFixed = (mat, role, refereeId) => {
    const next = invalidateRandom({
      ...management,
      fixedByMat: {
        ...management.fixedByMat,
        [String(mat)]: { ...management.fixedByMat[String(mat)], [role]: refereeId },
      },
    });
    persist(next);
  };

  const saveConfiguration = () => persist(management, "Đã lưu cấu hình trọng tài và mẫu PDF.");

  const doRandom = () => {
    if (duplicateFixedIds.length) {
      toast.error("Một trọng tài đang giữ nhiều vị trí cố định. Hãy sửa trước khi random.");
      return;
    }
    const officialNames = new Set([management.report.chairman, management.report.deputyChairman, management.report.secretary]
      .map((name) => String(name || "").trim().toLocaleLowerCase("vi"))
      .filter(Boolean));
    const eligibleReferees = management.referees.filter((referee) =>
      !officialNames.has(String(referee.name || "").trim().toLocaleLowerCase("vi"))
    );
    const result = randomizeRefereeAssignments(
      eligibleReferees,
      management.fixedByMat,
      management.matCount
    );
    const next = { ...management, ...result };
    persist(next, `Đã random ${result.assignments.reduce((total, item) => total + item.randomIds.length, 0)} trọng tài cho ${management.matCount} thảm.`);
    if (result.warnings.length) toast.warning(result.warnings.join(" "), 9000);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await exportRefereeDeploymentPdf(tournament, management);
      toast.success("Đã xuất PDF phân công trọng tài.");
    } catch (error) {
      console.error(error);
      toast.error("Không thể xuất PDF. Vui lòng thử lại.");
    } finally {
      setExporting(false);
    }
  };

  const exportMatPdf = async () => {
    setExporting(true);
    try {
      await exportRefereeMatListsPdf(tournament, management);
      toast.success("Đã xuất PDF danh sách riêng theo từng sàn.");
    } catch (error) {
      console.error(error);
      toast.error("Không thể xuất PDF từng sàn. Vui lòng thử lại.");
    } finally {
      setExporting(false);
    }
  };

  const exportTotalExcel = () => {
    try {
      exportRefereeDeploymentExcel(tournament, management);
      toast.success("Đã xuất Excel tổng phân công trọng tài.");
    } catch (error) {
      console.error(error);
      toast.warning(error.message || "Không thể xuất Excel tổng. Vui lòng thử lại.", 7000);
    }
  };
  const exportMatExcel = () => {
    try {
      exportRefereeMatListsExcel(tournament, management);
      toast.success("Đã xuất Excel, mỗi sàn là một sheet riêng.");
    } catch (error) {
      console.error(error);
      toast.error("Không thể xuất Excel từng sàn. Vui lòng thử lại.");
    }
  };
  const clearAllReferees = () => {
    if (!management.referees.length) return;
    setConfirmDialog({
      open: true,
      title: "Xóa toàn bộ danh sách trọng tài",
      message: `Bạn có chắc muốn xóa toàn bộ ${management.referees.length} trọng tài? Các vị trí trưởng sàn, phó sàn và kết quả random cũng sẽ bị xóa.`,
      type: "danger",
      onConfirm: () => {
        const next = invalidateRandom({
          ...management,
          referees: [],
          fixedByMat: normalizeFixedAssignments({}, management.matCount),
        });
        persist(next, "Đã xóa toàn bộ danh sách trọng tài.");
        setForm(EMPTY_REFEREE);
        setEditingId(null);
        setSearch("");
        setUnitFilter("all");
        setConfirmDialog({ open: false });
      },
    });
  };

  const scheduleMatCount = tournament.scheduleConfig?.matCount;
  return (
    <div className="page referees-page">
      <div className="container">
        <nav className="breadcrumb">
          <Link to={`/tournament/${tournament.id}`} className="back-link">← Quay lại</Link>
          <span className="breadcrumb-separator">|</span>
          <span>{tournament.name}</span><span>/</span><span>Quản lý trọng tài</span>
        </nav>

        <header className="page-header referee-header">
          <div>
            <h1 className="page-title"><img src={appIcon} alt="" className="page-title-logo" />Quản lý trọng tài</h1>
            <p>Nhập danh sách, cố định ban điều hành từng thảm, random và xuất PDF.</p>
          </div>
          <div className="referee-header-actions">
            <button className="btn btn-secondary" onClick={downloadRefereeTemplate}><img className="referee-action-icon" src={excelLogo} alt="" /> Tải mẫu Excel</button>
            <button className="btn btn-secondary" onClick={() => importInputRef.current?.click()}><img className="referee-action-icon" src={excelLogo} alt="" /> Import Excel</button>
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" hidden onChange={importExcel} />
            <button className="btn btn-secondary" disabled={exporting} onClick={exportTotalExcel}><img className="referee-action-icon" src={excelLogo} alt="" /> Excel tổng</button>
            <button className="btn btn-secondary" disabled={exporting} onClick={exportMatExcel}><img className="referee-action-icon" src={excelLogo} alt="" /> Excel từng sàn</button>
            <button className="btn btn-secondary" disabled={exporting} onClick={exportMatPdf}><img className="referee-action-icon" src={pdfLogo} alt="" /> PDF từng sàn</button>
            <button className="btn btn-primary" disabled={exporting} onClick={exportPdf}>{exporting ? "Đang xuất..." : <><img className="referee-action-icon" src={pdfLogo} alt="" /> PDF tổng</>}</button>
          </div>
        </header>

        <section className="referee-summary-grid">
          <div className="referee-summary-card"><span>Tổng trọng tài</span><strong>{management.referees.length}</strong></div>
          <div className="referee-summary-card"><span>Đang hoạt động</span><strong>{management.referees.filter((item) => item.active !== false).length}</strong></div>
          <div className="referee-summary-card"><span>Số đơn vị</span><strong>{units.length}</strong></div>
          <div className="referee-summary-card accent"><span>Số thảm</span><strong>{management.matCount}</strong></div>
        </section>

        <section className="referee-card referee-config-card">
          <div className="referee-section-heading">
            <div><h2>1. Cấu hình báo cáo</h2><p>Số thảm được lấy từ setup lịch thi đấu và vẫn có thể tùy chỉnh riêng.</p></div>
            <button className="btn btn-primary" onClick={saveConfiguration}>💾 Lưu cấu hình</button>
          </div>
          <div className="referee-config-grid">
            <label><span>Tên giải trên PDF</span><input className="input" value={management.report.eventName} onChange={(e) => setManagement({ ...management, report: { ...management.report, eventName: e.target.value } })} /></label>
            <label><span>Tiêu đề báo cáo</span><input className="input" value={management.report.title} onChange={(e) => setManagement({ ...management, report: { ...management.report, title: e.target.value } })} /></label>
            <label><span>Tổng trọng tài</span><input className="input" value={management.report.chairman} onChange={(e) => setManagement({ ...management, report: { ...management.report, chairman: e.target.value } })} /></label>
            <label><span>Phó tổng trọng tài</span><input className="input" value={management.report.deputyChairman || ""} onChange={(e) => setManagement({ ...management, report: { ...management.report, deputyChairman: e.target.value } })} /></label>
            <label><span>Thư ký ban trọng tài</span><input className="input" value={management.report.secretary} onChange={(e) => setManagement({ ...management, report: { ...management.report, secretary: e.target.value } })} /></label>
            <label><span>Ngày trên báo cáo</span><input className="input" type="date" value={management.report.date} onChange={(e) => setManagement({ ...management, report: { ...management.report, date: e.target.value } })} /></label>
            <label><span>Số thảm</span><div className="mat-count-control"><button type="button" onClick={() => changeMatCount(management.matCount - 1)}>−</button><input type="number" min="1" max="20" value={management.matCount} onChange={(e) => changeMatCount(e.target.value)} /><button type="button" onClick={() => changeMatCount(management.matCount + 1)}>+</button></div></label>
          </div>
          <div className="referee-config-source">
            <span>🏷️ Logo PDF lấy tự động từ cấu hình “Logo hệ thống & Nhà tài trợ” của giải đấu.</span>
            {scheduleMatCount && Number(scheduleMatCount) !== management.matCount && <button className="btn btn-secondary sync-mat-button" onClick={() => changeMatCount(scheduleMatCount)}>🔄 Đồng bộ {scheduleMatCount} thảm từ lịch thi đấu</button>}
          </div>
        </section>

        <section className="referee-card">
          <div className="referee-section-heading">
            <div><h2>2. Danh sách trọng tài</h2><p>Mã TT được cấp tự động. Import Excel sẽ cập nhật người trùng họ tên + đơn vị.</p></div>
            <button type="button" className="btn btn-danger" disabled={!management.referees.length} onClick={clearAllReferees}>🗑️ Xóa toàn bộ danh sách</button>
          </div>
          <form className="referee-form" onSubmit={saveReferee}>
            <input className="input required" placeholder="Họ và tên *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input required" placeholder="Đơn vị *" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            <input className="input" placeholder="Cấp bậc" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
            <select className="input" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })}><option>Cả hai</option><option>Kata</option><option>Kumite</option></select>
            <select className="input" aria-label="Trọng tài chính hoặc phụ" value={formatRefereeRole(form.refereeRole)} onChange={(e) => setForm({ ...form, refereeRole: e.target.value })}><option value="TTC">TTC — Trọng tài chính</option><option value="TTP">TTP — Trọng tài phụ</option></select>
            <input className="input" placeholder="Số điện thoại" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="input referee-note-input" placeholder="Ghi chú" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button className="btn btn-primary" type="submit">{editingId ? "Cập nhật" : "+ Thêm"}</button>
            {editingId && <button className="btn btn-secondary" type="button" onClick={() => { setEditingId(null); setForm(EMPTY_REFEREE); }}>Hủy</button>}
          </form>
          <div className="referee-list-tools">
            <input className="input" placeholder="Tìm theo tên, mã, đơn vị..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}><option value="all">Tất cả đơn vị</option>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
            <span>Hiển thị {filteredReferees.length}/{management.referees.length}</span>
          </div>
          <div className="referee-table-wrap"><table className="referee-table"><thead><tr><th>Mã</th><th>Họ và tên</th><th>Đơn vị</th><th>Cấp bậc</th><th>Nội dung</th><th>TTC/TTP</th><th>Trạng thái</th><th></th></tr></thead><tbody>
            {filteredReferees.map((referee) => <tr key={referee.id} className={referee.active === false ? "inactive" : ""}><td>{referee.code}</td><td><strong>{referee.name}</strong>{referee.note && <small>{referee.note}</small>}</td><td>{referee.unit}</td><td>{referee.grade || "—"}</td><td>{referee.specialty || "Cả hai"}</td><td>{formatRefereeRole(referee.refereeRole)}</td><td><label className="status-toggle"><input type="checkbox" checked={referee.active !== false} onChange={() => persist(invalidateRandom({ ...management, referees: management.referees.map((item) => item.id === referee.id ? { ...item, active: item.active === false } : item) }))} /><span>{referee.active === false ? "Tạm nghỉ" : "Hoạt động"}</span></label></td><td><div className="row-actions"><button onClick={() => editReferee(referee)}>Sửa</button><button className="danger" onClick={() => deleteReferee(referee)}>Xóa</button></div></td></tr>)}
            {!filteredReferees.length && <tr><td colSpan="8" className="empty-state">Chưa có trọng tài. Hãy thêm trực tiếp hoặc import file Excel.</td></tr>}
          </tbody></table></div>
        </section>

        <section className="referee-card">
          <div className="referee-section-heading"><div><h2>3. Ban điều hành cố định theo sàn</h2><p>Mỗi sàn có 1 trưởng sàn và 2 phó sàn; các vị trí này không tham gia random.</p></div></div>
          {duplicateFixedIds.length > 0 && <div className="referee-alert danger">⚠️ Bị trùng vị trí cố định: {duplicateFixedIds.map((refereeId) => refereeMap.get(refereeId)?.name).filter(Boolean).join(", ")}</div>}
          <div className="fixed-grid">{Array.from({ length: management.matCount }, (_, index) => {
            const mat = index + 1; const fixed = management.fixedByMat[String(mat)];
            return <article className="fixed-mat-card" key={mat}><h3>THẢM {mat}</h3>{[["chiefId", "Trưởng sàn"], ["deputy1Id", "Phó sàn 1"], ["deputy2Id", "Phó sàn 2"]].map(([role, label]) => <label key={role}><span>{label}</span><select className="input" value={fixed?.[role] || ""} onChange={(e) => updateFixed(mat, role, e.target.value)}><option value="">— Chưa chọn —</option>{management.referees.filter((item) => item.active !== false).map((referee) => <option key={referee.id} value={referee.id}>{referee.name} — {referee.unit}</option>)}</select></label>)}</article>;
          })}</div>
        </section>

        <section className="referee-card random-section">
          <div className="referee-section-heading"><div><h2>4. Random danh sách</h2><p>Hệ thống ghép cặp 2 trọng tài cùng đơn vị, rải các cặp sang thảm và cân bằng tổng số người.</p></div><button className="btn referee-random-button" onClick={doRandom}>🎲 Random lại danh sách</button></div>
          {management.warnings.map((warning, index) => <div className="referee-alert" key={index}>⚠️ {warning}</div>)}
          <div className="assignment-grid">{Array.from({ length: management.matCount }, (_, index) => {
            const mat = index + 1;
            const assignment = management.assignments.find((item) => item.mat === mat);
            const fixed = management.fixedByMat[String(mat)];
            const randomRefs = (assignment?.randomIds || []).map((refereeId) => refereeMap.get(refereeId)).filter(Boolean);
            return <article className="assignment-card" key={mat}><h3><span>THẢM {mat}</span><small>{randomRefs.length + [fixed?.chiefId, fixed?.deputy1Id, fixed?.deputy2Id].filter(Boolean).length} người</small></h3><div className="fixed-preview"><span><b>Trưởng sàn:</b> {refereeMap.get(fixed?.chiefId)?.name || "Chưa chọn"}</span><span><b>Phó sàn 1:</b> {refereeMap.get(fixed?.deputy1Id)?.name || "Chưa chọn"}</span><span><b>Phó sàn 2:</b> {refereeMap.get(fixed?.deputy2Id)?.name || "Chưa chọn"}</span></div><ol>{randomRefs.map((referee) => <li key={referee.id}><span>{referee.name}</span><em>{referee.unit}</em></li>)}{!randomRefs.length && <li className="empty-assignment">Chưa random</li>}</ol></article>;
          })}</div>
          {management.generatedAt && <p className="generated-time">Lần random gần nhất: {new Date(management.generatedAt).toLocaleString("vi-VN")}</p>}
        </section>
      </div>
      <ConfirmDialog isOpen={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message} type={confirmDialog.type} onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog({ open: false })} />
    </div>
  );
}
