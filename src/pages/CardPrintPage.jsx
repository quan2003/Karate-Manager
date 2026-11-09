import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTournament, useTournamentDispatch, ACTIONS } from "../context/TournamentContext";
import { useToast } from "../components/common/Toast";
import { KSPORT_CLOUD_API_URL, getCloudAuthHeaders } from "../services/cloudSyncService";
import QRCode from "qrcode";
import appIcon from "../assets/icon.png";
import kSportWhiteLogo from "../assets/Logo_trang.jpg";
import { exportCardsToPdf } from "../services/cardPdfService";
import "./CardPrintPage.css";

const DEFAULT_SETTINGS = { backgroundImage: "", backgroundMode: "watermark", cardWidthCm: 10, cardHeightCm: 14, includeBackSide: true, title: "THẺ K-SPORT", accent: "#e11d48", qrBaseUrl: "https://k-sport.net" };
const normalize = (value) => String(value || "").trim();
const parseMatNumbers = (value) => Array.from(new Set(String(value || "").split(/[;,\s]+/).map((item) => item.trim()).filter(Boolean))).slice(0, 8);

// Mirrors license-server/public-data.js, keeping printed cards aligned with
// the code shown for the same athlete on k-sport-web.
async function derivePublicAthleteCode(profileId, country) {
  if (!profileId || !globalThis.crypto?.subtle) return "";
  const source = new TextEncoder().encode(`athlete\u001f${profileId}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", source);
  const publicId = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 20);
  const countryCode = normalize(country).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "VDV";
  return `${countryCode}-${publicId.slice(0, 8).toUpperCase()}`;
}

async function createQrDataUrl(person, baseUrl, tournamentId) {
  if (!normalize(person.code)) return "";
  let url;
  try { url = new URL(normalize(baseUrl) || "https://k-sport.net"); }
  catch { url = new URL("https://k-sport.net"); }
  if (person.code) url.searchParams.set("code", person.code);
  url.searchParams.set("tournament", tournamentId || "");
  return QRCode.toDataURL(url.toString(), { width: 150, margin: 0, errorCorrectionLevel: "M" });
}

function LegacyCard({ person, tournament, settings, photoUrl, qrDataUrl, compact = false }) {
  const title = settings.title || "THẺ K-SPORT";
  const roleLabel = person.role === "athlete" ? "VẬN ĐỘNG VIÊN" : person.role === "coach" ? "HUẤN LUYỆN VIÊN" : "TRƯỞNG ĐOÀN";
  const accessCode = person.role === "athlete" ? "A" : person.role === "coach" ? "CO" : "M";
  const roleColor = person.role === "athlete" ? "#087fbd" : "#2fac66";
  const initial = normalize(person.name).slice(0, 1).toUpperCase() || "?";
  const widthCm = Number(settings.cardWidthCm) || 10;
  const heightCm = Number(settings.cardHeightCm) || 14;
  const previewWidth = 240;
  const previewHeight = Math.round(previewWidth * heightCm / widthCm);
  return <article className={`credential-card credential-card--event ${compact ? "credential-card--compact" : ""}`} style={{ "--card-accent": settings.accent || "#e11d48", "--role-color": roleColor, width: `${previewWidth}px`, height: `${previewHeight}px` }}>
    {settings.backgroundImage && <img className={`credential-background credential-background--${settings.backgroundMode || "watermark"}`} src={settings.backgroundImage} alt="" />}
    <div className="credential-shade" />
    <div className="credential-content">
      <header className="credential-head"><img className="credential-logo" src={settings.logoImage || appIcon} alt="Logo" /><div><strong>{tournament.name}</strong><small>{title}</small></div></header>
      <div className="credential-main">
        <div className="credential-identity-row"><div className="credential-photo">{photoUrl ? <img src={photoUrl} alt={`Ảnh ${person.name}`} /> : <span>{initial}</span>}</div><div className="credential-access-code"><small>ACCESS</small><strong>{accessCode}</strong></div></div>
        <div className="credential-details"><span className="credential-role">{roleLabel}</span><h2>{person.name || "CHƯA CÓ TÊN"}</h2><p>{person.club || "BAN TỔ CHỨC"}</p>{person.categoryName && <p className="credential-category">{person.categoryName}</p>}</div>
      </div>
      <footer className="credential-foot"><span>{person.code ? `MÃ VĐV: ${person.code}` : "CHƯA CẤP MÃ VĐV"}</span>{qrDataUrl && <img className="credential-qr" src={qrDataUrl} alt="Mã QR VĐV" />}</footer>
    </div>
  </article>;
}

function Card({ person, tournament, settings, photoUrl, qrDataUrl, compact = false }) {
  const roleLabel = person.role === "athlete" ? "VẬN ĐỘNG VIÊN" : person.role === "coach" ? "HUẤN LUYỆN VIÊN" : "TRƯỞNG ĐOÀN";
  const accessCode = person.role === "athlete" ? "A" : person.role === "coach" ? "CO" : "M";
  const roleColor = person.role === "athlete" ? "#087fbd" : "#2fac66";
  const initial = normalize(person.name).slice(0, 1).toUpperCase() || "?";
  const widthCm = Number(settings.cardWidthCm) || 10;
  const heightCm = Number(settings.cardHeightCm) || 14;
  const previewWidth = 240;
  const previewHeight = Math.round((previewWidth * heightCm) / widthCm);
  const sponsorLogos = Array.isArray(settings.sponsorLogos) ? settings.sponsorLogos.filter((logo) => typeof logo === "string" && logo) : [];
  const eventLogos = (settings.eventLogos?.length ? settings.eventLogos : (settings.hideEventLogo ? [] : (settings.logoImage ? [settings.logoImage] : []))).filter((logo) => typeof logo === "string" && logo);
  const headerLogos = [kSportWhiteLogo, ...eventLogos].filter((logo) => typeof logo === "string" && logo);
  const tournamentName = normalize(tournament.name);
  const titleLengthClass = tournamentName.length > 64 ? "credential-card--very-long-title" : tournamentName.length > 38 ? "credential-card--long-title" : "";
  const automaticMats = Array.from({ length: Math.min(8, Number(tournament.scheduleConfig?.matCount) || 0) }, (_, index) => String(index + 1));
  const assignedMats = Array.isArray(person.matNumbers) ? person.matNumbers.map(normalize).filter(Boolean) : [normalize(person.matNumber)].filter(Boolean);
  const staffMats = parseMatNumbers(settings.matNumbers).length ? parseMatNumbers(settings.matNumbers) : automaticMats;
  const matNumbers = person.role === "athlete" ? Array.from(new Set(assignedMats)) : staffMats;
  const matPending = person.role === "athlete" && matNumbers.length === 0;
  const matColors = ["#2563eb", "#16a34a", "#111827", "#eab308", "#dc2626", "#7c3aed", "#0891b2", "#ea580c"];

  return <article className={`credential-card credential-card--event credential-card--labeled ${titleLengthClass} ${compact ? "credential-card--compact" : ""}`} style={{ "--card-accent": settings.accent || "#e11d48", "--role-color": roleColor, width: `${previewWidth}px`, height: `${previewHeight}px` }}>
    {settings.backgroundImage && <img className={`credential-background credential-background--${settings.backgroundMode || "watermark"}`} src={settings.backgroundImage} alt="" />}
    <div className="credential-shade" />
    <div className="credential-lanyard-slot" aria-hidden="true" />
    <div className="credential-content">
      <header className="credential-head credential-head--adaptive"><div className="credential-event-logos">{headerLogos.map((logo, index) => <img className={`credential-logo ${index === 0 ? "credential-logo--ksport" : ""}`} key={`${index}:${logo.slice(-16)}`} src={logo} alt={index === 0 ? "Logo K-SPORT" : `Logo giải ${index}`} />)}</div><div><strong>{tournament.name}</strong><small>{settings.title || "THẺ K-SPORT"}</small></div></header>
      <div className="credential-main">
        <div className="credential-identity-row"><div className="credential-photo">{photoUrl ? <img src={photoUrl} alt={`Ảnh ${person.name}`} /> : <span className="credential-photo-placeholder"><strong>ẢNH 3×4</strong></span>}</div><div className="credential-access-column"><div className="credential-access-code"><small>KHU VỰC</small><strong>{accessCode}</strong></div>{(matNumbers.length > 0 || matPending) && <div className={`credential-mats credential-mats--under-access ${matPending ? "credential-mats--pending" : ""}`}><b>THẢM</b>{matPending ? <em>CHƯA XẾP</em> : <div>{matNumbers.map((mat, index) => <span key={mat} style={{ background: matColors[index % matColors.length] }}>{mat}</span>)}</div>}</div>}</div></div>
        <span className="credential-role">{roleLabel}</span>
        <div className="credential-info"><div><b>Họ và tên:</b><span>{person.name || "Chưa cập nhật"}</span></div><div><b>Đơn vị:</b><span>{person.club || "Chưa cập nhật"}</span></div></div>
      </div>
      <div className={`credential-sponsors ${sponsorLogos.length === 0 ? "credential-sponsors--empty" : ""}`} style={{ "--sponsor-count": Math.max(sponsorLogos.length, 1) }}>{sponsorLogos.length === 0 && <span>VỊ TRÍ LOGO NHÀ TÀI TRỢ</span>}{sponsorLogos.map((logo, index) => <span className="credential-sponsor-slot" key={`${index}:${logo.slice(-16)}`}><img src={logo} alt={`Logo nhà tài trợ ${index + 1}`} /></span>)}</div>
      <footer className="credential-foot"><span>{person.code ? `MÃ VĐV: ${person.code}` : "CHƯA CẤP MÃ VĐV"}</span>{person.code && qrDataUrl && <img className="credential-qr" src={qrDataUrl} alt="Mã QR VĐV" />}</footer>
    </div>
  </article>;
}

const ACCESS_LEGEND = [
  ["OC", "Ban tổ chức", "#dc2626"], ["VIP", "Khách mời", "#dc2626"],
  ["Re", "Trọng tài", "#2fac66"], ["M", "Trưởng đoàn", "#2fac66"],
  ["CO", "Huấn luyện viên", "#2fac66"], ["A", "Vận động viên", "#087fbd"],
  ["S", "Thư ký", "#eab308"], ["D", "Y tế", "#eab308"],
  ["Se", "An ninh", "#eab308"], ["Me", "Truyền thông", "#eab308"],
  ["VM", "Tình nguyện viên", "#eab308"],
];

function CardBack({ tournament, settings }) {
  const widthCm = Number(settings.cardWidthCm) || 10;
  const heightCm = Number(settings.cardHeightCm) || 14;
  const previewWidth = 240;
  const previewHeight = Math.round(previewWidth * heightCm / widthCm);
  const backEventLogos = (settings.eventLogos?.length ? settings.eventLogos : (settings.hideEventLogo ? [] : (settings.logoImage ? [settings.logoImage] : []))).filter((logo) => typeof logo === "string" && logo);
  const backLogos = [kSportWhiteLogo, ...backEventLogos].filter((logo) => typeof logo === "string" && logo);
  return <article className="credential-card credential-card--back" style={{ "--card-accent": settings.accent || "#e11d48", width: `${previewWidth}px`, height: `${previewHeight}px` }}>
    <div className="credential-content"><header className="credential-back-head"><div className="credential-back-logos">{backLogos.map((logo, index) => <img className={`credential-logo ${index === 0 ? "credential-logo--ksport" : ""}`} key={`${index}:${logo.slice(-16)}`} src={logo} alt={index === 0 ? "Logo K-SPORT" : `Logo giải ${index}`} />)}</div><strong>{tournament.name}</strong></header><div className="credential-legend">{ACCESS_LEGEND.map(([code, label, color]) => <div className="credential-legend-row" key={code}><b style={{ background: color }}>{code}</b><span>{label}</span></div>)}</div><footer>K-SPORT · ACCESS AREAS</footer></div>
  </article>;
}

export default function CardPrintPage() {
  const { id } = useParams();
  const { tournaments } = useTournament();
  const dispatch = useTournamentDispatch();
  const { toast } = useToast();
  const templateInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const sponsorLogoInputRef = useRef(null);
  const staffPhotoInputRef = useRef(null);
  const tournament = tournaments.find((item) => item.id === id);
  const stored = tournament?.cardPrinting || {};
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, ...(stored.settings || {}) });
  const [typeFilter, setTypeFilter] = useState("all");
  const [clubFilter, setClubFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [photos, setPhotos] = useState({});
  const [qrCodes, setQrCodes] = useState({});
  const [derivedAthleteCodes, setDerivedAthleteCodes] = useState({});
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [staffTarget, setStaffTarget] = useState(null);
  const initializedSelection = useRef(false);

  const people = useMemo(() => {
    if (!tournament) return [];
    const athleteMap = new Map();
    (tournament.categories || []).filter(Boolean).forEach((category) => {
      (category.athletes || []).filter(Boolean).forEach((athlete) => {
        const athleteCode = normalize(athlete.athleteCode);
        const profileId = normalize(athlete.profileId) || normalize(athlete.athleteId);
        const identity = profileId || athleteCode || `${normalize(athlete.name).toLowerCase()}:${normalize(athlete.club).toLowerCase()}`;
        const key = `athlete:${identity}`;
        const current = athleteMap.get(key) || { key, role: "athlete", name: athlete.name, club: athlete.club, code: athleteCode, profileId, mediaId: normalize(athlete.athleteId), country: athlete.country, categoryNames: [], matNumbers: [], competitions: [] };
        if (category.name && !current.categoryNames.includes(category.name)) current.categoryNames.push(category.name);
        const mat = normalize(tournament.schedule?.[category.id]?.mat);
        if (mat && !current.matNumbers.includes(mat)) current.matNumbers.push(mat);
        if (category.name && !current.competitions.some((item) => item.id === category.id)) current.competitions.push({ id: category.id, name: category.name, mat });
        athleteMap.set(key, current);
      });
    });
    const athletes = Array.from(athleteMap.values()).map((athlete) => ({ ...athlete, categoryName: athlete.categoryNames.join(", ") }));
    const staff = Object.entries(tournament.clubRegistrations || {}).flatMap(([club, registration]) => [
      ...((registration?.coaches || []).filter(Boolean).map((name, index) => ({ key: `coach:${club}:${index}:${name}`, role: "coach", name, club }))),
      ...(registration?.teamLeader ? [{ key: `leader:${club}:${registration.teamLeader}`, role: "leader", name: registration.teamLeader, club }] : []),
    ]);
    return [...athletes, ...staff];
  }, [tournament]);
  useEffect(() => {
    let active = true;
    const missing = people.filter((person) => person.role === "athlete" && !person.code && person.profileId && !derivedAthleteCodes[person.key]);
    if (!missing.length) return undefined;
    Promise.all(missing.map(async (person) => [person.key, await derivePublicAthleteCode(person.profileId, person.country)])).then((entries) => {
      if (active) setDerivedAthleteCodes((current) => ({ ...current, ...Object.fromEntries(entries.filter(([, code]) => code)) }));
    });
    return () => { active = false; };
  }, [people, derivedAthleteCodes]);
  const codedPeople = useMemo(() => people.map((person) => ({ ...person, code: person.code || derivedAthleteCodes[person.key] || "" })), [people, derivedAthleteCodes]);
  const clubs = useMemo(() => Array.from(new Set(codedPeople.map((person) => person.club).filter(Boolean))).sort(), [codedPeople]);
  const visiblePeople = useMemo(() => codedPeople.filter((person) => (typeFilter === "all" || person.role === typeFilter) && (clubFilter === "all" || person.club === clubFilter) && `${person.name} ${person.club}`.toLowerCase().includes(query.toLowerCase())), [codedPeople, typeFilter, clubFilter, query]);
  const selectedPeople = useMemo(() => codedPeople.filter((person) => selected.includes(person.key)), [codedPeople, selected]);

  useEffect(() => {
    const saved = stored.settings || {};
    setSettings({ ...DEFAULT_SETTINGS, ...saved, title: saved.title === "THẺ ĐẠI BIỂU" ? "THẺ K-SPORT" : (saved.title || DEFAULT_SETTINGS.title) });
  }, [stored.settings]);
  useEffect(() => {
    setSelected((current) => {
      const available = current.filter((key) => people.some((person) => person.key === key));
      if (!initializedSelection.current && people.length) {
        initializedSelection.current = true;
        return people.map((person) => person.key);
      }
      return available;
    });
  }, [people]);
  useEffect(() => {
    const preview = { key: "preview", code: "VIE0001", role: "athlete" };
    const targets = [preview, ...selectedPeople];
    Promise.all(targets.map(async (person) => {
      return [person.key, await createQrDataUrl(person, settings.qrBaseUrl, tournament?.id)];
    })).then((entries) => setQrCodes(Object.fromEntries(entries))).catch(() => {});
  }, [selectedPeople, settings.qrBaseUrl, tournament?.id]);

  const saveSettings = (next) => {
    setSettings(next);
    dispatch({ type: ACTIONS.UPDATE_TOURNAMENT, payload: { id: tournament.id, cardPrinting: { ...stored, settings: next } } });
  };
  const saveStaffPhotos = (next) => dispatch({ type: ACTIONS.UPDATE_TOURNAMENT, payload: { id: tournament.id, cardPrinting: { ...stored, settings, staffPhotos: next } } });
  const togglePerson = (key) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const selectVisible = () => setSelected((current) => Array.from(new Set([...current, ...visiblePeople.map((person) => person.key)])));

  const uploadTemplate = (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Mẫu thẻ phải là tệp ảnh JPG, PNG hoặc WebP.");
    const reader = new FileReader();
    reader.onload = () => { saveSettings({ ...settings, backgroundImage: String(reader.result) }); toast.success("Đã lưu mẫu thẻ cho giải này."); };
    reader.readAsDataURL(file);
  };
  const uploadLogo = (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Logo phải là ảnh JPG, PNG hoặc WebP.");
    const reader = new FileReader();
    reader.onload = () => {
      const currentLogos = settings.eventLogos?.length ? settings.eventLogos : (settings.logoImage ? [settings.logoImage] : []);
      const eventLogos = [...currentLogos, String(reader.result)].slice(-3);
      saveSettings({ ...settings, eventLogos, hideEventLogo: false });
      toast.success(`Đã thêm logo giải (${eventLogos.length}/3).`);
    };
    reader.readAsDataURL(file);
  };
  const uploadSponsorLogo = (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Logo phải là ảnh JPG, PNG hoặc WebP.");
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result);
      const sponsorLogos = [...(settings.sponsorLogos || []), image].slice(-6);
      saveSettings({ ...settings, sponsorLogos });
      toast.success(`Đã thêm logo nhà tài trợ (${sponsorLogos.length}/6).`);
    };
    reader.readAsDataURL(file);
  };
  const uploadStaffPhoto = (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !staffTarget) return;
    if (!file.type.startsWith("image/")) return toast.error("Ảnh phải là JPG, PNG hoặc WebP.");
    const reader = new FileReader();
    reader.onload = () => saveStaffPhotos({ ...(stored.staffPhotos || {}), [staffTarget]: String(reader.result) });
    reader.readAsDataURL(file);
  };
  const loadAthletePhotos = async () => {
    const athletes = selectedPeople.filter((person) => person.role === "athlete" && person.code && !photos[person.key]);
    if (!athletes.length) return;
    setLoadingPhotos(true);
    try {
      const headers = await getCloudAuthHeaders();
      const results = await Promise.all(athletes.map(async (person) => {
        try { const response = await fetch(`${KSPORT_CLOUD_API_URL}/api/media/athletes/${encodeURIComponent(person.mediaId)}/view-url`, { headers }); const data = await response.json(); return data?.viewUrl ? [person.key, data.viewUrl] : null; } catch { return null; }
      }));
      setPhotos((current) => ({ ...current, ...Object.fromEntries(results.filter(Boolean)) }));
    } catch { toast.info("Chưa thể tải một số ảnh thẻ từ kho ảnh."); } finally { setLoadingPhotos(false); }
  };
  const printCards = async () => {
    if (!selectedPeople.length) return toast.info("Hãy chọn ít nhất một người để xuất thẻ.");
    setExportingPdf(true);
    try {
      await loadAthletePhotos();
      const missingQrCodes = selectedPeople.filter((person) => !qrCodes[person.key]);
      if (missingQrCodes.length) {
        const entries = await Promise.all(missingQrCodes.map(async (person) => [
          person.key,
          await createQrDataUrl(person, settings.qrBaseUrl, tournament.id),
        ]));
        setQrCodes((current) => ({ ...current, ...Object.fromEntries(entries) }));
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const result = await exportCardsToPdf(document.querySelector(".print-cards"), tournament.name, {
        widthCm: Number(settings.cardWidthCm) || 10,
        heightCm: Number(settings.cardHeightCm) || 14,
        backsContainer: settings.includeBackSide ? document.querySelector(".print-card-backs") : null,
      });
      toast.success(`Đã tạo PDF gồm ${result.cardCount} thẻ / ${result.pageCount} trang A4.`);
    } catch (error) {
      toast.error(error.message || "Không thể xuất PDF thẻ K-SPORT.");
    } finally {
      setExportingPdf(false);
    }
  };

  if (!tournament) return <main className="page"><div className="container"><h2>Không tìm thấy giải đấu</h2><Link to="/admin" className="btn btn-primary">Về trang quản lý</Link></div></main>;
  return <main className="page card-print-page"><div className="container">
    <div className="card-print-heading"><div><Link to={`/athletes/${id}`} className="back-link">← Quản lý VĐV</Link><h1>Xuất thẻ K-SPORT</h1><p>{tournament.name} · Chọn VĐV, HLV hoặc Trưởng đoàn và xuất PDF theo mẫu.</p></div><button className="btn btn-primary card-print-button" onClick={printCards} disabled={loadingPhotos || exportingPdf}>{loadingPhotos ? "Đang tải ảnh..." : exportingPdf ? "Đang tạo PDF..." : `📄 Xuất PDF ${selectedPeople.length} thẻ`}</button></div>
    <section className="card-designer">
      <div className="card-settings">
        <h3>Mẫu thẻ</h3>
        <div className="card-size-fields"><label>Rộng (cm)<input type="number" min="4" max="20" step="0.1" value={settings.cardWidthCm ?? 10} onChange={(event) => saveSettings({ ...settings, cardWidthCm: event.target.value })} /></label><label>Cao (cm)<input type="number" min="6" max="28.7" step="0.1" value={settings.cardHeightCm ?? 14} onChange={(event) => saveSettings({ ...settings, cardHeightCm: event.target.value })} /></label></div>
        <label className="card-back-toggle"><input type="checkbox" checked={settings.includeBackSide !== false} onChange={(event) => saveSettings({ ...settings, includeBackSide: event.target.checked })} /> Xuất mặt sau bảng mã quyền truy cập</label>
        <label>Tiêu đề<input value={settings.title} onChange={(event) => saveSettings({ ...settings, title: event.target.value })} /></label>
        <label>Đường dẫn QR K-SPORT<input type="url" value={settings.qrBaseUrl} onChange={(event) => saveSettings({ ...settings, qrBaseUrl: event.target.value })} /></label>
        <label>Thảm dành cho HLV/Trưởng đoàn<input value={settings.matNumbers ?? ""} placeholder={tournament.scheduleConfig?.matCount ? `Mặc định tất cả: ${Array.from({ length: tournament.scheduleConfig.matCount }, (_, index) => index + 1).join(", ")}` : "Ví dụ: 1, 2, 3, 4"} onChange={(event) => saveSettings({ ...settings, matNumbers: event.target.value })} /></label>
        <label>Kiểu ảnh nền<select value={settings.backgroundMode || "watermark"} onChange={(event) => saveSettings({ ...settings, backgroundMode: event.target.value })}><option value="watermark">Watermark - dành cho logo/huy hiệu</option><option value="cover">Phủ toàn thẻ - dành cho phôi thiết kế</option></select></label>
        <label>Màu nhấn<input type="color" value={settings.accent} onChange={(event) => saveSettings({ ...settings, accent: event.target.value })} /></label>
        <div className="asset-settings">
          <div><b>Logo giải</b><div className="template-actions"><button className="btn btn-secondary" onClick={() => logoInputRef.current?.click()}>＋ Thêm logo giải</button>{(settings.eventLogos?.length || settings.logoImage) && <button className="btn btn-secondary" onClick={() => saveSettings({ ...settings, eventLogos: [], logoImage: "", hideEventLogo: true })}>Xóa logo giải</button>}</div></div>
          <div><b>Logo nhà tài trợ</b><div className="template-actions"><button className="btn btn-secondary" onClick={() => sponsorLogoInputRef.current?.click()}>＋ Thêm logo tài trợ</button>{settings.sponsorLogos?.length > 0 && <button className="btn btn-secondary" onClick={() => saveSettings({ ...settings, sponsorLogos: [] })}>Xóa logo tài trợ</button>}</div></div>
          <div><b>Ảnh nền</b><div className="template-actions"><button className="btn btn-secondary" onClick={() => templateInputRef.current?.click()}>🖼 Tải ảnh nền</button>{settings.backgroundImage && <button className="btn btn-secondary" onClick={() => saveSettings({ ...settings, backgroundImage: "" })}>Xóa ảnh nền</button>}</div></div>
        </div>
        <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={uploadLogo} />
        <input ref={sponsorLogoInputRef} type="file" accept="image/*" hidden onChange={uploadSponsorLogo} />
        <input ref={templateInputRef} type="file" accept="image/*" hidden onChange={uploadTemplate} />
        <small>Logo giải hiển thị ở đầu thẻ (tối đa 3); logo tài trợ hiển thị thành hàng phía dưới (tối đa 6). Mặc định 10 × 14 cm.</small>
      </div>
      <div className="card-preview"><Card person={{ role: "athlete", name: "NGUYỄN VĂN A", club: "ĐƠN VỊ / CÂU LẠC BỘ", code: "VIE0001", matNumber: tournament.schedule?.[tournament.categories?.[0]?.id]?.mat || "", competitions: tournament.categories?.[0] ? [{ id: tournament.categories[0].id, name: tournament.categories[0].name, mat: tournament.schedule?.[tournament.categories[0].id]?.mat || "" }] : [] }} tournament={tournament} settings={settings} qrDataUrl={qrCodes.preview} /></div>
    </section>
    <section className="card-list-panel"><div className="card-filters"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Tất cả đối tượng</option><option value="athlete">Vận động viên</option><option value="coach">Huấn luyện viên</option><option value="leader">Trưởng đoàn</option></select><select value={clubFilter} onChange={(event) => setClubFilter(event.target.value)}><option value="all">Tất cả đơn vị</option>{clubs.map((club) => <option key={club} value={club}>{club}</option>)}</select><input placeholder="Tìm tên hoặc đơn vị..." value={query} onChange={(event) => setQuery(event.target.value)} /><button className="btn btn-secondary" onClick={selectVisible}>Chọn danh sách lọc</button><button className="btn btn-secondary" onClick={() => setSelected([])}>Bỏ chọn</button></div>
      <div className="card-person-list">{visiblePeople.map((person) => <label className="card-person" key={person.key}><input type="checkbox" checked={selected.includes(person.key)} onChange={() => togglePerson(person.key)} /><span><strong>{person.name}</strong><small>{person.role === "athlete" ? "VĐV" : person.role === "coach" ? "HLV" : "Trưởng đoàn"} · {person.club || "Chưa có đơn vị"}{person.categoryName ? ` · ${person.categoryName}` : ""}</small></span>{person.role !== "athlete" && <button type="button" className="text-button" onClick={() => { setStaffTarget(person.key); staffPhotoInputRef.current?.click(); }}>📷 Ảnh</button>}</label>)}{!visiblePeople.length && <p className="empty-state">Không có người phù hợp bộ lọc.</p>}</div><input ref={staffPhotoInputRef} type="file" accept="image/*" hidden onChange={uploadStaffPhoto} /></section>
    <section className="print-cards">{selectedPeople.map((person) => <Card key={person.key} person={person} tournament={tournament} settings={settings} photoUrl={person.role === "athlete" ? photos[person.key] : stored.staffPhotos?.[person.key]} qrDataUrl={qrCodes[person.key]} compact />)}</section>
    <section className="print-card-backs">{selectedPeople.map((person) => <CardBack key={`back:${person.key}`} tournament={tournament} settings={settings} />)}</section>
  </div></main>;
}
