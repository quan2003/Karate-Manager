import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import {
  useTournament,
  useTournamentDispatch,
  ACTIONS,
} from "../context/TournamentContext";
import {
  getAwardedAthletes,
  getClubsList,
  getCanvasDimensions,
  renderCertificateHTML,
  printCertificates,
  exportCertificatePDF,
} from "../services/certificateService";
import { useToast } from "../components/common/Toast";
import "./CertificatePage.css";

// ─── Constants ──────────────────────────────────────────────
const VARIABLE_TOKENS = [
  { label: "[Tên VĐV]", token: "[Tên VĐV]", desc: "Tên vận động viên" },
  { label: "[Câu lạc bộ]", token: "[Câu lạc bộ]", desc: "Tên câu lạc bộ" },
  { label: "[Nội dung thi đấu]", token: "[Nội dung thi đấu]", desc: "Hạng mục thi đấu" },
  { label: "[Hạng cân]", token: "[Hạng cân]", desc: "Hạng cân" },
  { label: "[Thành tích]", token: "[Thành tích]", desc: "Huy chương / Thành tích" },
  { label: "[Giải đấu]", token: "[Giải đấu]", desc: "Tên giải đấu" },
  { label: "[Ngày]", token: "[Ngày]", desc: "Ngày thi đấu" },
];

const FONTS = [
  "Times New Roman",
  "Arial",
  "Georgia",
  "Verdana",
  "Trebuchet MS",
  "Palatino Linotype",
  "Courier New",
];

const DEFAULT_FIELD = {
  type: "variable",
  token: "[Tên VĐV]",
  text: "",
  x: 50,
  y: 50,
  fontSize: 28,
  fontFamily: "Times New Roman",
  bold: true,
  italic: false,
  color: "#1a1a1a",
  align: "center",
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.4;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 0.55;

// ─── Preview Sample Data ─────────────────────────────────────
const SAMPLE_DATA = {
  athleteName: "Nguyễn Văn Mẫu",
  clubName: "CLB Karate Thành phố",
  categoryName: "Kumite Nam -60kg",
  achievement: "Huy chương Vàng",
  gender: "male",
  weightClass: "-60kg",
  tournamentName: "[Tên Giải đấu]",
  tournamentDate: new Date().toLocaleDateString("vi-VN"),
};

export default function CertificatePage() {
  const { id } = useParams();
  const { tournaments } = useTournament();
  const dispatch = useTournamentDispatch();
  const { toast } = useToast();

  const tournament = tournaments.find((t) => t.id === id);
  const canvasRef = useRef(null);

  // ─── Tabs ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("builder");

  // ─── Templates ───────────────────────────────────────────
  const templates = tournament?.certificateTemplates || [];
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates[0]?.id || null
  );
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null;

  // ─── Template Form ────────────────────────────────────────
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateOrientation, setNewTemplateOrientation] =
    useState("landscape");

  // ─── Canvas / Fields ──────────────────────────────────────
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const editingTemplate =
    templates.find((t) => t.id === editingTemplateId) || null;

  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const selectedField = editingTemplate?.fields?.find(
    (f) => f.id === selectedFieldId
  ) || null;

  const [dragging, setDragging] = useState(null); // { fieldId, startMouseX, startMouseY, startFieldX, startFieldY }
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_ZOOM);

  const handleZoomIn = () => setCanvasZoom((z) => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))));
  const handleZoomOut = () => setCanvasZoom((z) => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2))));
  const handleZoomReset = () => setCanvasZoom(DEFAULT_ZOOM);

  // ─── Filtering ────────────────────────────────────────────
  const [filterText, setFilterText] = useState("");
  const [filterClub, setFilterClub] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterAchievement, setFilterAchievement] = useState("all");
  const [filterPrintStatus, setFilterPrintStatus] = useState("all"); // "all", "printed", "unprinted"
  const [selectedRecords, setSelectedRecords] = useState(new Set());

  const printedIds = tournament?.printedCertificateIds || [];

  // ─── Print/Export ─────────────────────────────────────────
  const [isPrinting, setIsPrinting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null); // { current, total }

  // ─── Preview ──────────────────────────────────────────────
  const [previewRecords, setPreviewRecords] = useState([]);

  // Sync template selection when templates change
  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  if (!tournament) {
    return (
      <div className="page">
        <div className="container">
          <div className="not-found">
            <h2>Không tìm thấy giải đấu</h2>
            <Link to="/admin" className="btn btn-primary">
              Về quản lý giải đấu
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Template CRUD ────────────────────────────────────────
  const saveTemplatesToTournament = (updatedTemplates) => {
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: {
        id: tournament.id,
        certificateTemplates: updatedTemplates,
      },
    });
  };

  const handleCreateTemplate = () => {
    if (!newTemplateName.trim()) {
      toast.error("Vui lòng nhập tên mẫu!");
      return;
    }
    const newTemplate = {
      id: uuidv4(),
      name: newTemplateName.trim(),
      orientation: newTemplateOrientation,
      backgroundImage: null,
      fields: [],
    };
    const updated = [...templates, newTemplate];
    saveTemplatesToTournament(updated);
    setSelectedTemplateId(newTemplate.id);
    setEditingTemplateId(newTemplate.id);
    setNewTemplateName("");
    toast.success("Đã tạo mẫu chứng nhận mới!");
  };

  const handleDeleteTemplate = (templateId) => {
    if (!window.confirm("Bạn có chắc muốn xóa mẫu này?")) return;
    const updated = templates.filter((t) => t.id !== templateId);
    saveTemplatesToTournament(updated);
    if (selectedTemplateId === templateId) {
      setSelectedTemplateId(updated[0]?.id || null);
    }
    if (editingTemplateId === templateId) {
      setEditingTemplateId(null);
    }
  };

  const handleEditTemplate = (templateId) => {
    setEditingTemplateId(templateId);
    setSelectedFieldId(null);
    setSelectedTemplateId(templateId);
  };

  const updateEditingTemplate = (updater) => {
    const updated = templates.map((t) =>
      t.id === editingTemplateId ? updater(t) : t
    );
    saveTemplatesToTournament(updated);
  };

  // ─── Print Status Management ─────────────────────────────
  const markAsPrinted = (ids) => {
    const currentPrinted = tournament.printedCertificateIds || [];
    const nextPrinted = [...new Set([...currentPrinted, ...ids])];
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: { id: tournament.id, printedCertificateIds: nextPrinted },
    });
  };

  const unmarkAsPrinted = (ids) => {
    const currentPrinted = tournament.printedCertificateIds || [];
    const nextPrinted = currentPrinted.filter((id) => !ids.includes(id));
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: { id: tournament.id, printedCertificateIds: nextPrinted },
    });
  };

  const resetAllPrintStatus = () => {
    if (!window.confirm("Bạn có chắc muốn xóa tất cả trạng thái 'Đã in'?")) return;
    dispatch({
      type: ACTIONS.UPDATE_TOURNAMENT,
      payload: { id: tournament.id, printedCertificateIds: [] },
    });
    toast.success("Đã reset trạng thái in!");
  };

  // ─── Background Image ─────────────────────────────────────
  const handleUploadBackground = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      updateEditingTemplate((t) => ({ ...t, backgroundImage: ev.target.result }));
      toast.success("Đã tải ảnh nền!");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveBackground = () => {
    updateEditingTemplate((t) => ({ ...t, backgroundImage: null }));
  };

  // ─── Field Management ─────────────────────────────────────
  const addField = (type, token = null, text = "") => {
    const newField = {
      ...DEFAULT_FIELD,
      id: uuidv4(),
      type,
      token: token || DEFAULT_FIELD.token,
      text,
    };
    updateEditingTemplate((t) => ({
      ...t,
      fields: [...(t.fields || []), newField],
    }));
    setSelectedFieldId(newField.id);
    return newField.id;
  };

  const updateField = (fieldId, updates) => {
    updateEditingTemplate((t) => ({
      ...t,
      fields: t.fields.map((f) =>
        f.id === fieldId ? { ...f, ...updates } : f
      ),
    }));
  };

  const deleteField = (fieldId) => {
    updateEditingTemplate((t) => ({
      ...t,
      fields: t.fields.filter((f) => f.id !== fieldId),
    }));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  };

  // ─── Drag & Drop on Canvas ────────────────────────────────
  const handleCanvasMouseDown = (e, fieldId) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedFieldId(fieldId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const field = editingTemplate?.fields?.find((f) => f.id === fieldId);
    if (!field) return;
    setDragging({
      fieldId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startFieldX: field.x,
      startFieldY: field.y,
    });
  };

  const handleCanvasMouseMove = useCallback(
    (e) => {
      if (!dragging || !canvasRef.current || !editingTemplate) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const canvasW = rect.width;
      const canvasH = rect.height;
      const dx = ((e.clientX - dragging.startMouseX) / canvasW) * 100;
      const dy = ((e.clientY - dragging.startMouseY) / canvasH) * 100;
      const newX = Math.max(0, Math.min(100, dragging.startFieldX + dx));
      const newY = Math.max(0, Math.min(100, dragging.startFieldY + dy));
      updateField(dragging.fieldId, { x: newX, y: newY });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragging, editingTemplate]
  );

  const handleCanvasMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Token palette drag-to-canvas
  const handleTokenDragStart = (e, token) => {
    e.dataTransfer.setData("token", token);
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    const token = e.dataTransfer.getData("token");
    if (!token || !editingTemplate) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newField = {
      ...DEFAULT_FIELD,
      id: uuidv4(),
      type: "variable",
      token,
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
    updateEditingTemplate((t) => ({
      ...t,
      fields: [...(t.fields || []), newField],
    }));
    setSelectedFieldId(newField.id);
  };

  // ─── Filtering Logic ──────────────────────────────────────
  const allRecords = getAwardedAthletes(tournament);
  const clubsList = getClubsList(tournament);
  const categoriesList = [
    ...new Set(tournament.categories.map((c) => c.name)),
  ];

  const filteredRecords = allRecords.filter((r) => {
    if (
      filterText &&
      !r.athleteName.toLowerCase().includes(filterText.toLowerCase())
    )
      return false;
    if (filterClub !== "all" && r.clubName !== filterClub) return false;
    if (filterCategory !== "all" && r.categoryName !== filterCategory)
      return false;
    if (
      filterAchievement !== "all" &&
      r.achievement !== filterAchievement
    )
      return false;

    const isPrinted = printedIds.includes(r.id);
    if (filterPrintStatus === "printed" && !isPrinted) return false;
    if (filterPrintStatus === "unprinted" && isPrinted) return false;

    return true;
  });

  const toggleRecord = (id) => {
    const next = new Set(selectedRecords);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRecords(next);
  };

  const toggleAll = () => {
    if (selectedRecords.size === filteredRecords.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  // ─── Preview ──────────────────────────────────────────────
  const handlePreview = () => {
    const chosen = filteredRecords.filter((r) => selectedRecords.has(r.id));
    const sample =
      chosen.length > 0
        ? chosen.slice(0, 2)
        : filteredRecords.slice(0, 2);
    if (!sample.length) {
      // Use fake sample data
      setPreviewRecords([SAMPLE_DATA]);
    } else {
      setPreviewRecords(sample);
    }
    setActiveTab("preview");
  };

  // ─── Print ────────────────────────────────────────────────
  const handlePrint = () => {
    if (!selectedTemplate) {
      toast.error("Vui lòng chọn một mẫu chứng nhận!");
      return;
    }
    const toPrint = filteredRecords.filter((r) => selectedRecords.has(r.id));
    if (!toPrint.length) {
      toast.error("Vui lòng chọn ít nhất một vận động viên để in!");
      return;
    }
    printCertificates(
      selectedTemplate,
      toPrint,
      () => setIsPrinting(true),
      () => {
        setIsPrinting(false);
        markAsPrinted(toPrint.map((r) => r.id));
        toast.success(`Đã đánh dấu ${toPrint.length} bản ghi là 'Đã in'`);
      }
    );
  };

  const handleExportPDF = async () => {
    if (!selectedTemplate) {
      toast.error("Vui lòng chọn một mẫu chứng nhận!");
      return;
    }
    const toExport = filteredRecords.filter((r) => selectedRecords.has(r.id));
    if (!toExport.length) {
      toast.error("Vui lòng chọn ít nhất một vận động viên để xuất PDF!");
      return;
    }
    setExportProgress({ current: 0, total: toExport.length });
    try {
      const filename = `ChungNhan_${tournament.name.replace(/\s+/g, "_")}.pdf`;
      await exportCertificatePDF(
        selectedTemplate,
        toExport,
        filename,
        (cur, total) => setExportProgress({ current: cur, total })
      );
      markAsPrinted(toExport.map((r) => r.id));
      toast.success(`Đã xuất PDF ${toExport.length} giấy chứng nhận và đánh dấu là 'Đã in'!`);
    } catch (e) {
      toast.error("Lỗi xuất PDF: " + e.message);
    } finally {
      setExportProgress(null);
    }
  };

  // ─── Canvas dimensions for editor (scaled) ────────────────
  const { w: realW, h: realH } = editingTemplate
    ? getCanvasDimensions(editingTemplate)
    : { w: 1123, h: 794 };
  const canvasW = realW * canvasZoom;
  const canvasH = realH * canvasZoom;

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="page cert-page">
      <div className="container">
        {/* Breadcrumb */}
        <nav className="breadcrumb">
          <Link to="/admin" className="back-link">← Quay lại</Link>
          <span className="breadcrumb-separator">|</span>
          <Link to={`/tournament/${tournament.id}`}>{tournament.name}</Link>
          <span>/</span>
          <span>In Giấy Chứng Nhận</span>
        </nav>

        <header className="page-header">
          <h1 className="page-title">🏅 In Giấy Chứng Nhận</h1>
          <p className="page-subtitle">{tournament.name}</p>
        </header>

        {/* Tab Bar */}
        <div className="cert-tabs">
          {[
            { id: "builder", icon: "🎨", label: "Thiết kế mẫu" },
            { id: "filter", icon: "🔍", label: "Lọc dữ liệu" },
            { id: "preview", icon: "👁️", label: "Xem trước" },
            { id: "print", icon: "🖨️", label: "In & Xuất" },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`cert-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="cert-tab-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ╔══════════════════════════════════════╗
            ║  TAB 1: Template Builder              ║
            ╚══════════════════════════════════════╝ */}
        {activeTab === "builder" && (
          <div className="cert-builder">
            {/* Left: Template list + create form */}
            <div className="cert-template-panel">
              <h3 className="cert-panel-title">📋 Danh sách mẫu</h3>
              <div className="cert-template-list">
                {templates.length === 0 && (
                  <div className="cert-empty">Chưa có mẫu nào. Tạo mẫu mới bên dưới.</div>
                )}
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className={`cert-template-item ${
                      editingTemplateId === t.id ? "editing" : ""
                    } ${selectedTemplateId === t.id ? "selected" : ""}`}
                    onClick={() => setSelectedTemplateId(t.id)}
                  >
                    <div className="cert-template-info">
                      <span className="cert-template-name">{t.name}</span>
                      <span className="cert-template-meta">
                        {t.orientation === "landscape" ? "Ngang" : "Dọc"} · A4 ·{" "}
                        {t.fields?.length || 0} trường
                      </span>
                    </div>
                    <div className="cert-template-actions">
                      <button
                        className="cert-btn-icon"
                        title="Chỉnh sửa"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTemplate(t.id);
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        className="cert-btn-icon danger"
                        title="Xóa"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(t.id);
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Create new template */}
              <div className="cert-create-form">
                <h4>➕ Tạo mẫu mới</h4>
                <div className="cert-form-row">
                  <input
                    type="text"
                    className="cert-input"
                    placeholder="Tên mẫu (vd: HCV, HCB...)"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                  />
                </div>
                <div className="cert-form-row">
                  <label className="cert-label">Hướng giấy:</label>
                  <div className="cert-orientation-group">
                    <button
                      className={`cert-orientation-btn ${
                        newTemplateOrientation === "landscape" ? "active" : ""
                      }`}
                      onClick={() => setNewTemplateOrientation("landscape")}
                    >
                      ↔ Ngang (A4)
                    </button>
                    <button
                      className={`cert-orientation-btn ${
                        newTemplateOrientation === "portrait" ? "active" : ""
                      }`}
                      onClick={() => setNewTemplateOrientation("portrait")}
                    >
                      ↕ Dọc (A4)
                    </button>
                  </div>
                </div>
                <button
                  className="cert-btn cert-btn-primary"
                  onClick={handleCreateTemplate}
                >
                  Tạo mẫu
                </button>
              </div>
            </div>

            {/* Right: Canvas Editor */}
            {editingTemplate ? (
              <div className="cert-editor">
                {/* Editor toolbar */}
                <div className="cert-editor-toolbar">
                  <span className="cert-editor-title">
                    ✏️ Đang sửa: <strong>{editingTemplate.name}</strong>
                    <span className="cert-orientation-badge">
                      {editingTemplate.orientation === "landscape" ? "Ngang" : "Dọc"}
                    </span>
                  </span>
                  <div className="cert-editor-toolbar-actions">
                    {/* Zoom controls */}
                    <div className="cert-zoom-controls">
                      <button
                        className="cert-zoom-btn"
                        onClick={handleZoomOut}
                        disabled={canvasZoom <= MIN_ZOOM}
                        title="Thu nhỏ"
                      >−</button>
                      <span
                        className="cert-zoom-value"
                        onClick={handleZoomReset}
                        title="Nhấn để reset về mặc định"
                      >
                        {Math.round(canvasZoom * 100)}%
                      </span>
                      <button
                        className="cert-zoom-btn"
                        onClick={handleZoomIn}
                        disabled={canvasZoom >= MAX_ZOOM}
                        title="Phóng to"
                      >+</button>
                    </div>

                    <label className="cert-btn cert-btn-secondary" style={{ cursor: "pointer" }}>
                      🖼 Tải ảnh nền
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleUploadBackground}
                      />
                    </label>
                    {editingTemplate.backgroundImage && (
                      <button
                        className="cert-btn cert-btn-danger"
                        onClick={handleRemoveBackground}
                      >
                        ✕ Xóa nền
                      </button>
                    )}
                  </div>
                </div>

                {/* Token palette */}
                <div className="cert-token-palette">
                  <span className="cert-palette-label">Kéo thả biến vào mẫu:</span>
                  {VARIABLE_TOKENS.map((vt) => (
                    <div
                      key={vt.token}
                      className="cert-token-chip"
                      draggable
                      onDragStart={(e) => handleTokenDragStart(e, vt.token)}
                      title={vt.desc}
                    >
                      {vt.label}
                    </div>
                  ))}
                  <button
                    className="cert-token-chip text-chip"
                    onClick={() => addField("text", null, "Văn bản")}
                    title="Thêm văn bản tự do"
                  >
                    + Văn bản
                  </button>
                </div>

                <div className="cert-editor-body">
                  {/* Canvas */}
                  <div
                    className="cert-canvas-wrapper"
                    style={{ width: canvasW, height: canvasH }}
                  >
                    <div
                      ref={canvasRef}
                      className="cert-canvas"
                      style={{
                        width: canvasW,
                        height: canvasH,
                        backgroundImage: editingTemplate.backgroundImage
                          ? `url('${editingTemplate.backgroundImage}')`
                          : "none",
                        backgroundSize: "100% 100%",
                        backgroundRepeat: "no-repeat",
                        backgroundColor: editingTemplate.backgroundImage
                          ? "transparent"
                          : "#f8f5f0",
                      }}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseUp}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleCanvasDrop}
                      onClick={() => setSelectedFieldId(null)}
                    >
                      {!editingTemplate.backgroundImage && (
                        <div className="cert-canvas-placeholder">
                          <p>📄 Kéo thả biến từ bảng phía trên vào đây</p>
                          <p style={{ fontSize: 12, marginTop: 4 }}>
                            Hoặc tải ảnh nền phôi giấy khen
                          </p>
                        </div>
                      )}
                      {/* Render fields on canvas */}
                      {(editingTemplate.fields || []).map((field) => {
                        const text =
                          field.type === "variable"
                            ? field.token
                            : field.text || "Văn bản";
                        const x = (field.x / 100) * canvasW;
                        const y = (field.y / 100) * canvasH;
                        const scaledFontSize =
                          (field.fontSize || 24) * canvasZoom;

                        let translateX = "0";
                        if (field.align === "center") translateX = "-50%";
                        else if (field.align === "right") translateX = "-100%";

                        return (
                          <div
                            key={field.id}
                            className={`cert-field-chip ${
                              selectedFieldId === field.id ? "selected" : ""
                            }`}
                            style={{
                              position: "absolute",
                              left: x,
                              top: y,
                              transform: `translateX(${translateX})`,
                              fontSize: scaledFontSize,
                              color: field.color || "#1a1a1a",
                              fontFamily: field.fontFamily || "Times New Roman",
                              fontWeight: field.bold ? "bold" : "normal",
                              fontStyle: field.italic ? "italic" : "normal",
                              textAlign: field.align || "center",
                              cursor: "move",
                              userSelect: "none",
                              whiteSpace: "nowrap",
                            }}
                            onMouseDown={(e) =>
                              handleCanvasMouseDown(e, field.id)
                            }
                          >
                            {text}
                            {selectedFieldId === field.id && (
                              <span
                                className="cert-field-delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteField(field.id);
                                }}
                                title="Xóa trường này"
                              >
                                ×
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Field properties panel */}
                  {selectedField ? (
                    <div className="cert-field-props">
                      <h4 className="cert-props-title">⚙️ Thuộc tính trường</h4>
                      {selectedField.type === "variable" ? (
                        <div className="cert-prop-group">
                          <label className="cert-prop-label">Biến số:</label>
                          <select
                            className="cert-select"
                            value={selectedField.token}
                            onChange={(e) =>
                              updateField(selectedField.id, {
                                token: e.target.value,
                              })
                            }
                          >
                            {VARIABLE_TOKENS.map((vt) => (
                              <option key={vt.token} value={vt.token}>
                                {vt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="cert-prop-group">
                          <label className="cert-prop-label">Nội dung:</label>
                          <input
                            type="text"
                            className="cert-input"
                            value={selectedField.text || ""}
                            onChange={(e) =>
                              updateField(selectedField.id, {
                                text: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}

                      <div className="cert-prop-group">
                        <label className="cert-prop-label">Font chữ:</label>
                        <select
                          className="cert-select"
                          value={selectedField.fontFamily || "Times New Roman"}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              fontFamily: e.target.value,
                            })
                          }
                        >
                          {FONTS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="cert-prop-group">
                        <label className="cert-prop-label">Cỡ chữ:</label>
                        <input
                          type="number"
                          className="cert-input"
                          min="8"
                          max="120"
                          value={selectedField.fontSize || 24}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              fontSize: parseInt(e.target.value) || 24,
                            })
                          }
                        />
                      </div>

                      <div className="cert-prop-group">
                        <label className="cert-prop-label">Màu chữ:</label>
                        <input
                          type="color"
                          className="cert-color-picker"
                          value={selectedField.color || "#1a1a1a"}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              color: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="cert-prop-group">
                        <label className="cert-prop-label">Căn chỉnh:</label>
                        <div className="cert-align-group">
                          {["left", "center", "right"].map((a) => (
                            <button
                              key={a}
                              className={`cert-align-btn ${
                                (selectedField.align || "center") === a
                                  ? "active"
                                  : ""
                              }`}
                              onClick={() =>
                                updateField(selectedField.id, { align: a })
                              }
                              title={
                                a === "left"
                                  ? "Căn trái"
                                  : a === "center"
                                  ? "Căn giữa"
                                  : "Căn phải"
                              }
                            >
                              {a === "left" ? "⬅" : a === "center" ? "☰" : "➡"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="cert-prop-group cert-prop-row">
                        <label className="cert-prop-label">Kiểu chữ:</label>
                        <div className="cert-style-btns">
                          <button
                            className={`cert-style-btn ${
                              selectedField.bold ? "active" : ""
                            }`}
                            onClick={() =>
                              updateField(selectedField.id, {
                                bold: !selectedField.bold,
                              })
                            }
                          >
                            <strong>B</strong>
                          </button>
                          <button
                            className={`cert-style-btn ${
                              selectedField.italic ? "active" : ""
                            }`}
                            onClick={() =>
                              updateField(selectedField.id, {
                                italic: !selectedField.italic,
                              })
                            }
                          >
                            <em>I</em>
                          </button>
                        </div>
                      </div>

                      <div className="cert-prop-group">
                        <label className="cert-prop-label">Vị trí X (%):</label>
                        <input
                          type="number"
                          className="cert-input"
                          min="0"
                          max="100"
                          value={Math.round(selectedField.x)}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              x: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="cert-prop-group">
                        <label className="cert-prop-label">Vị trí Y (%):</label>
                        <input
                          type="number"
                          className="cert-input"
                          min="0"
                          max="100"
                          value={Math.round(selectedField.y)}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              y: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>

                      <button
                        className="cert-btn cert-btn-danger mt-8"
                        onClick={() => deleteField(selectedField.id)}
                      >
                        🗑 Xóa trường này
                      </button>
                    </div>
                  ) : (
                    <div className="cert-field-props cert-field-hint">
                      <div className="cert-hint-icon">👆</div>
                      <p>Kéo biến số từ bảng phía trên vào canvas</p>
                      <p>Nhấn vào một trường để chỉnh sửa thuộc tính</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="cert-editor cert-editor-empty">
                <div className="cert-empty-center">
                  <div style={{ fontSize: 56 }}>🎨</div>
                  <h3>Chọn mẫu để chỉnh sửa</h3>
                  <p>Nhấn ✏️ bên cạnh tên mẫu, hoặc tạo mẫu mới bên trái</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ╔══════════════════════════════════════╗
            ║  TAB 2: Data Filtering                ║
            ╚══════════════════════════════════════╝ */}
        {activeTab === "filter" && (
          <div className="cert-filter-tab">
            {/* Filter controls */}
            <div className="cert-filter-bar">
              <input
                type="text"
                className="cert-input cert-search"
                placeholder="🔍 Tìm theo tên VĐV..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
              <select
                className="cert-select"
                value={filterClub}
                onChange={(e) => setFilterClub(e.target.value)}
              >
                <option value="all">Tất cả CLB</option>
                {clubsList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="cert-select"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="all">Tất cả nội dung</option>
                {categoriesList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="cert-select"
                value={filterAchievement}
                onChange={(e) => setFilterAchievement(e.target.value)}
              >
                <option value="all">Tất cả thành tích</option>
                <option value="Huy chương Vàng">🥇 Huy chương Vàng</option>
                <option value="Huy chương Bạc">🥈 Huy chương Bạc</option>
                <option value="Huy chương Đồng">🥉 Huy chương Đồng</option>
              </select>
              <select
                className="cert-select"
                value={filterPrintStatus}
                onChange={(e) => setFilterPrintStatus(e.target.value)}
              >
                <option value="all">Tất cả trạng thái in</option>
                <option value="unprinted">Chưa in</option>
                <option value="printed">Đã in</option>
              </select>
              <button
                className="cert-btn cert-btn-secondary"
                onClick={() => {
                  setFilterText("");
                  setFilterClub("all");
                  setFilterCategory("all");
                  setFilterAchievement("all");
                  setFilterPrintStatus("all");
                }}
              >
                ✕ Xóa lọc
              </button>
            </div>

            {/* Summary */}
            <div className="cert-filter-summary">
              <span>
                Tìm thấy <strong>{filteredRecords.length}</strong> bản ghi
              </span>
              <span>
                Đã chọn:{" "}
                <strong style={{ color: "#3b82f6" }}>
                  {selectedRecords.size}
                </strong>
              </span>
              <div style={{ flex: 1 }}></div>
              <button
                className="cert-btn cert-btn-secondary cert-btn-sm"
                onClick={resetAllPrintStatus}
                title="Xóa trạng thái 'Đã in' của toàn bộ bản ghi trong giải đấu này"
              >
                🔄 Reset trạng thái in
              </button>
              <button
                className="cert-btn cert-btn-secondary cert-btn-sm"
                onClick={toggleAll}
              >
                {selectedRecords.size === filteredRecords.length && filteredRecords.length > 0
                  ? "Bỏ chọn tất cả"
                  : "Chọn tất cả"}
              </button>
            </div>

            {/* Table */}
            <div className="cert-table-wrapper">
              {filteredRecords.length === 0 ? (
                <div className="cert-empty cert-empty-lg">
                  <div style={{ fontSize: 48 }}>🏅</div>
                  <p>
                    {allRecords.length === 0
                      ? "Chưa có kết quả thi đấu nào. Hãy nhập kết quả trong trang Thống kê."
                      : "Không có bản ghi nào khớp với bộ lọc."}
                  </p>
                </div>
              ) : (
                <table className="cert-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          checked={
                            selectedRecords.size === filteredRecords.length &&
                            filteredRecords.length > 0
                          }
                          onChange={toggleAll}
                        />
                      </th>
                      <th>Tên VĐV</th>
                      <th>Câu lạc bộ</th>
                      <th>Nội dung thi đấu</th>
                      <th>Thành tích</th>
                      <th style={{ width: 100 }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((r) => {
                      const isPrinted = printedIds.includes(r.id);
                      return (
                        <tr
                          key={r.id}
                          className={`${selectedRecords.has(r.id) ? "selected" : ""} ${isPrinted ? "printed-row" : ""}`}
                          onClick={() => toggleRecord(r.id)}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedRecords.has(r.id)}
                              onChange={() => toggleRecord(r.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="cert-athlete-name">{r.athleteName}</td>
                          <td>{r.clubName || "—"}</td>
                          <td>{r.categoryName}</td>
                          <td>
                            <span
                              className={`cert-achievement-badge cert-badge-${
                                r.achievement.includes("Vàng")
                                  ? "gold"
                                  : r.achievement.includes("Bạc")
                                  ? "silver"
                                  : "bronze"
                              }`}
                            >
                              {r.achievement.includes("Vàng")
                                ? "🥇"
                                : r.achievement.includes("Bạc")
                                ? "🥈"
                                : "🥉"}{" "}
                              {r.achievement}
                            </span>
                          </td>
                          <td className="cert-status-cell">
                            {isPrinted ? (
                              <span 
                                className="cert-status-badge printed"
                                title="Nhấn để đánh dấu là chưa in"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  unmarkAsPrinted([r.id]);
                                }}
                              >
                                ✓ Đã in
                              </span>
                            ) : (
                              <span 
                                className="cert-status-badge unprinted"
                                title="Nhấn để đánh dấu là đã in"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsPrinted([r.id]);
                                }}
                              >
                                ○ Chưa in
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Bottom actions */}
            {selectedRecords.size > 0 && (
              <div className="cert-filter-actions">
                <span className="cert-action-hint">
                  Đã chọn {selectedRecords.size} bản ghi
                </span>
                <button
                  className="cert-btn cert-btn-secondary"
                  onClick={handlePreview}
                >
                  👁️ Xem trước
                </button>
                <button
                  className="cert-btn cert-btn-primary"
                  onClick={() => setActiveTab("print")}
                >
                  🖨️ Tiếp tục In & Xuất →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ╔══════════════════════════════════════╗
            ║  TAB 3: Preview                       ║
            ╚══════════════════════════════════════╝ */}
        {activeTab === "preview" && (
          <div className="cert-preview-tab">
            <div className="cert-preview-header">
              <div>
                <h3>👁️ Xem trước giấy chứng nhận</h3>
                <p className="cert-preview-hint">
                  {previewRecords.length > 0
                    ? `Đang hiển thị ${previewRecords.length} mẫu với dữ liệu thật`
                    : "Sử dụng dữ liệu mẫu vì chưa chọn VĐV"}
                </p>
              </div>
              <div className="cert-preview-actions">
                <button
                  className="cert-btn cert-btn-secondary"
                  onClick={() => {
                    setPreviewRecords([SAMPLE_DATA]);
                    setActiveTab("preview");
                  }}
                >
                  🔄 Dữ liệu mẫu
                </button>
                <button
                  className="cert-btn cert-btn-primary"
                  onClick={() => setActiveTab("print")}
                >
                  🖨️ Tiến hành in →
                </button>
              </div>
            </div>

            {/* Template selector for preview */}
            {templates.length > 0 ? (
              <div className="cert-preview-template-select">
                <label className="cert-label">Mẫu chứng nhận:</label>
                <select
                  className="cert-select"
                  value={selectedTemplateId || ""}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  <option value="">— Chọn mẫu —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="cert-empty cert-empty-lg">
                <p>Chưa có mẫu nào. Hãy tạo mẫu trong tab <strong>Thiết kế mẫu</strong>.</p>
              </div>
            )}

            {selectedTemplate && (
              <div className="cert-preview-list">
                {(previewRecords.length > 0
                  ? previewRecords
                  : [SAMPLE_DATA]
                ).map((record, idx) => {
                  const { w, h } = getCanvasDimensions(selectedTemplate);
                  const previewScale = Math.min(
                    (window.innerWidth * 0.8) / w,
                    0.7
                  );
                  const pw = w * previewScale;
                  const ph = h * previewScale;
                  const html = renderCertificateHTML(selectedTemplate, record);
                  return (
                    <div key={idx} className="cert-preview-item">
                      <div className="cert-preview-label">
                        {record.athleteName || "Mẫu"} —{" "}
                        {record.achievement || "Xem trước"}
                      </div>
                      <div
                        className="cert-preview-frame"
                        style={{
                          width: pw,
                          height: ph,
                          transform: `scale(1)`,
                          transformOrigin: "top left",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: w,
                            height: h,
                            transform: `scale(${previewScale})`,
                            transformOrigin: "top left",
                          }}
                          dangerouslySetInnerHTML={{ __html: html }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ╔══════════════════════════════════════╗
            ║  TAB 4: Print & Export                ║
            ╚══════════════════════════════════════╝ */}
        {activeTab === "print" && (
          <div className="cert-print-tab">
            {/* Summary */}
            <div className="cert-print-summary">
              <div className="cert-print-stat">
                <span className="cert-print-stat-val">
                  {selectedRecords.size}
                </span>
                <span className="cert-print-stat-label">VĐV đã chọn</span>
              </div>
              <div className="cert-print-stat">
                <span className="cert-print-stat-val">
                  {templates.length}
                </span>
                <span className="cert-print-stat-label">Mẫu có sẵn</span>
              </div>
              <div className="cert-print-stat">
                <span
                  className="cert-print-stat-val"
                  style={{
                    color: selectedTemplate ? "#10b981" : "#ef4444",
                  }}
                >
                  {selectedTemplate ? "✓" : "✗"}
                </span>
                <span className="cert-print-stat-label">Mẫu đã chọn</span>
              </div>
            </div>

            {/* Template selector */}
            <div className="cert-print-section">
              <h3 className="cert-section-title">1️⃣ Chọn mẫu chứng nhận</h3>
              {templates.length === 0 ? (
                <div className="cert-empty cert-empty-inline">
                  Chưa có mẫu. Hãy tạo mẫu trong tab{" "}
                  <button
                    className="cert-link-btn"
                    onClick={() => setActiveTab("builder")}
                  >
                    Thiết kế mẫu
                  </button>
                  .
                </div>
              ) : (
                <div className="cert-template-grid">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className={`cert-template-card ${
                        selectedTemplateId === t.id ? "selected" : ""
                      }`}
                      onClick={() => setSelectedTemplateId(t.id)}
                    >
                      {t.backgroundImage ? (
                        <div
                          className="cert-template-thumb"
                          style={{
                            backgroundImage: `url('${t.backgroundImage}')`,
                          }}
                        />
                      ) : (
                        <div className="cert-template-thumb cert-template-thumb-blank">
                          📄
                        </div>
                      )}
                      <div className="cert-template-card-name">{t.name}</div>
                      <div className="cert-template-card-meta">
                        {t.orientation === "landscape" ? "Ngang" : "Dọc"} ·{" "}
                        {t.fields?.length || 0} trường
                      </div>
                      {selectedTemplateId === t.id && (
                        <div className="cert-template-card-check">✓</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Athletes list */}
            <div className="cert-print-section">
              <h3 className="cert-section-title">
                2️⃣ Danh sách sẽ in (
                {
                  filteredRecords.filter((r) => selectedRecords.has(r.id))
                    .length
                }{" "}
                người)
              </h3>
              {selectedRecords.size === 0 ? (
                <div className="cert-empty cert-empty-inline">
                  Chưa chọn VĐV nào.{" "}
                  <button
                    className="cert-link-btn"
                    onClick={() => setActiveTab("filter")}
                  >
                    Chọn VĐV trong tab Lọc dữ liệu
                  </button>
                </div>
              ) : (
                <div className="cert-print-list">
                  {filteredRecords
                    .filter((r) => selectedRecords.has(r.id))
                    .map((r) => (
                      <div key={r.id} className="cert-print-list-item">
                        <span className="cert-print-athlete">
                          {r.achievement.includes("Vàng")
                            ? "🥇"
                            : r.achievement.includes("Bạc")
                            ? "🥈"
                            : "🥉"}{" "}
                          {r.athleteName}
                        </span>
                        <span className="cert-print-club">{r.clubName}</span>
                        <span className="cert-print-cat">{r.categoryName}</span>
                        <button
                          className="cert-btn-icon danger"
                          onClick={() => toggleRecord(r.id)}
                          title="Bỏ chọn"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="cert-print-actions">
              {exportProgress && (
                <div className="cert-export-progress">
                  <div className="cert-progress-bar">
                    <div
                      className="cert-progress-fill"
                      style={{
                        width: `${
                          (exportProgress.current / exportProgress.total) * 100
                        }%`,
                      }}
                    />
                  </div>
                  <span>
                    Đang xuất {exportProgress.current}/{exportProgress.total}...
                  </span>
                </div>
              )}
              {isPrinting && (
                <div className="cert-printing-indicator">
                  ⏳ Đang chuẩn bị in...
                </div>
              )}

              <div className="cert-action-btns">
                <button
                  className="cert-btn cert-btn-secondary"
                  onClick={handlePreview}
                  disabled={isPrinting || !!exportProgress}
                >
                  👁️ Xem trước nhanh
                </button>
                <button
                  className="cert-btn cert-btn-print"
                  onClick={handlePrint}
                  disabled={
                    isPrinting ||
                    !!exportProgress ||
                    !selectedTemplate ||
                    selectedRecords.size === 0
                  }
                >
                  🖨️ In ngay (trực tiếp)
                </button>
                <button
                  className="cert-btn cert-btn-pdf"
                  onClick={handleExportPDF}
                  disabled={
                    isPrinting ||
                    !!exportProgress ||
                    !selectedTemplate ||
                    selectedRecords.size === 0
                  }
                >
                  📄 Xuất PDF
                </button>
              </div>

              <p className="cert-print-note">
                💡 <strong>In ngay</strong>: Gửi thẳng tới máy in vật lý đang
                kết nối.{" "}
                <strong>Xuất PDF</strong>: Tạo file PDF nhiều trang để lưu trữ
                hoặc gửi qua mạng.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
