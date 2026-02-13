import { useEffect, useState, useRef, useCallback } from "react";
import api from "../services/api";
import {
  Search,
  Plus,
  RotateCcw,
  Ban,
  RefreshCw,
  Copy,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  X,
  Monitor,
  Phone,
  User,
  Mail,
  ChevronDown,
  ChevronUp,
  Download,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

// === Custom Toast Component ===
function Toast({ notification, onClose }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!notification) return;
    setProgress(100);
    const duration = 3000;
    const interval = 30;
    const step = (interval / duration) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - step;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  const isError = notification.type === "error";
  return (
    <div className="fixed top-5 right-5 z-[100] animate-slide-in max-w-sm w-full">
      <div
        className={`relative overflow-hidden rounded-xl shadow-2xl border ${
          isError
            ? "bg-red-950/90 border-red-500/30"
            : "bg-emerald-950/90 border-emerald-500/30"
        } backdrop-blur-lg`}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <div
            className={`flex-shrink-0 mt-0.5 ${
              isError ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {isError ? <XCircle size={20} /> : <CheckCircle size={20} />}
          </div>
          <p className="text-sm text-white font-medium flex-1">
            {notification.message}
          </p>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
        <div
          className={`h-0.5 transition-all ease-linear ${
            isError ? "bg-red-500" : "bg-emerald-500"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// === Custom Confirm Modal ===
function ConfirmModal({
  open,
  title,
  message,
  icon: Icon,
  iconColor,
  confirmText,
  confirmColor,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[90] p-4"
      onClick={onCancel}
    >
      <div
        className="glass-card w-full max-w-sm animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          {Icon && (
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${
                iconColor || "bg-amber-500/20"
              }`}
            >
              <Icon
                size={28}
                className={
                  iconColor?.includes("red")
                    ? "text-red-400"
                    : iconColor?.includes("blue")
                    ? "text-blue-400"
                    : "text-amber-400"
                }
              />
            </div>
          )}
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-sm text-slate-400 mt-2">{message}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 btn hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg border border-slate-600"
          >
            Huỷ
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 btn text-white px-4 py-2.5 rounded-lg font-medium ${
              confirmColor || "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {confirmText || "Xác nhận"}
          </button>
        </div>
      </div>
    </div>
  );
}

// === Custom Prompt Modal ===
function PromptModal({
  open,
  title,
  message,
  placeholder,
  defaultValue,
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue || "");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, defaultValue]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[90] p-4"
      onClick={onCancel}
    >
      <div
        className="glass-card w-full max-w-sm animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-slate-400 mb-4">{message}</p>
        <input
          ref={inputRef}
          type="number"
          min="1"
          className="input-field mb-4"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value && onConfirm(value)}
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 btn hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg border border-slate-600"
          >
            Huỷ
          </button>
          <button
            onClick={() => value && onConfirm(value)}
            disabled={!value}
            className="flex-1 btn bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium disabled:opacity-50"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LicensePage() {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [copySuccess, setCopySuccess] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [newlyCreatedLicense, setNewlyCreatedLicense] = useState(null);
  const [formData, setFormData] = useState({
    clientName: "",
    clientPhone: "",
    clientEmail: "",
    type: "trial",
    days: 30,
    maxMachines: 1,
    notes: "",
  });

  // Custom modal states (replace native confirm/prompt)
  const [confirmModal, setConfirmModal] = useState({ open: false });
  const [promptModal, setPromptModal] = useState({ open: false });

  useEffect(() => {
    fetchLicenses();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchLicenses(true);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const showNotify = useCallback((message, type = "success") => {
    setNotification({ message, type, key: Date.now() });
  }, []);

  const fetchLicenses = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get("/license/list");
      if (res.data.success) {
        setLicenses(res.data.licenses);
      }
    } catch (error) {
      console.error("Error fetching licenses:", error);
      if (!silent) showNotify("Lỗi tải danh sách license", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const res = await api.post("/license/create", formData);
      if (res.data.success) {
        setShowModal(false);
        fetchLicenses();
        showNotify(`License đã tạo thành công: ${res.data.license.key}`);
        // Store newly created license info for download prompt
        setNewlyCreatedLicense({
          key: res.data.license.key,
          raw_key: res.data.license.raw,
          client_name: formData.clientName,
          client_phone: formData.clientPhone,
          client_email: formData.clientEmail,
          type: formData.type,
          expiry_date: res.data.license.expiryDate,
          max_machines: formData.maxMachines,
          created_at: new Date().toISOString(),
        });
        setFormData({
          clientName: "",
          clientPhone: "",
          clientEmail: "",
          type: "trial",
          days: 30,
          maxMachines: 1,
          notes: "",
        });
      } else {
        showNotify(res.data.message || "Lỗi tạo license", "error");
      }
    } catch (error) {
      showNotify(
        "Lỗi tạo license: " + (error.response?.data?.message || error.message),
        "error"
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRevoke = async (key) => {
    setConfirmModal({
      open: true,
      title: "Thu hồi License",
      message:
        "Bạn chắc chắn muốn thu hồi license này? Khách hàng sẽ không thể sử dụng phần mềm.",
      icon: Ban,
      iconColor: "bg-red-500/20",
      confirmText: "Thu hồi",
      confirmColor: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmModal({ open: false });
        try {
          await api.post("/license/revoke", { key });
          fetchLicenses();
          showNotify("Đã thu hồi license");
        } catch (e) {
          showNotify("Lỗi thu hồi license", "error");
        }
      },
    });
  };

  const handleReset = async (key) => {
    setConfirmModal({
      open: true,
      title: "Reset máy",
      message:
        "Reset toàn bộ máy đã kích hoạt? Khách hàng sẽ cần kích hoạt lại.",
      icon: RotateCcw,
      iconColor: "bg-blue-500/20",
      confirmText: "Reset",
      confirmColor: "bg-blue-600 hover:bg-blue-700",
      onConfirm: async () => {
        setConfirmModal({ open: false });
        try {
          await api.post("/license/reset", { key });
          fetchLicenses();
          showNotify("Đã reset máy thành công");
        } catch (e) {
          showNotify("Lỗi reset máy", "error");
        }
      },
    });
  };

  const handleExtend = async (key) => {
    setPromptModal({
      open: true,
      title: "Gia hạn License",
      message: "Nhập số ngày muốn gia hạn thêm:",
      placeholder: "Số ngày",
      defaultValue: "30",
      onConfirm: async (days) => {
        setPromptModal({ open: false });
        try {
          await api.post("/license/extend", { key, days: parseInt(days) });
          fetchLicenses();
          showNotify(`Đã gia hạn thêm ${days} ngày`);
        } catch (e) {
          showNotify("Lỗi gia hạn license", "error");
        }
      },
    });
  };

  const copyToClipboard = (text, label = "Key") => {
    if (!text) {
      showNotify("Không có dữ liệu để copy", "error");
      return;
    }
    const textToCopy = String(text).trim();
    // Try modern API first
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          setCopySuccess(textToCopy);
          showNotify(`Đã copy ${label}`);
          setTimeout(() => setCopySuccess(""), 2000);
        })
        .catch(() => {
          fallbackCopy(textToCopy, label);
        });
    } else {
      fallbackCopy(textToCopy, label);
    }
  };

  const fallbackCopy = (text, label) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand("copy");
      if (successful) {
        setCopySuccess(text);
        showNotify(`Đã copy ${label}`);
        setTimeout(() => setCopySuccess(""), 2000);
      } else {
        showNotify("Không thể copy, hãy copy thủ công", "error");
      }
    } catch (err) {
      showNotify("Không thể copy key", "error");
    }
    document.body.removeChild(textArea);
  };

  const handleDownloadLicense = (license) => {
    // Use raw_key (base64 full key) for activation, fallback to formatted key
    const licenseKey = license.raw_key || license.key;
    const expiryFormatted = license.expiry_date
      ? format(new Date(license.expiry_date), "dd/MM/yyyy")
      : "N/A";

    // Format matches what importLicenseFile() in client expects: "LICENSE KEY: XXXXX..."
    const content = [
      `LICENSE KEY: ${licenseKey}`,
      `Client: ${license.client_name || "N/A"}`,
      `Phone: ${license.client_phone || "N/A"}`,
      `Email: ${license.client_email || "N/A"}`,
      `Type: ${license.type || "N/A"}`,
      `Expires: ${expiryFormatted}`,
      `Max Machines: ${license.max_machines || 1}`,
      `Created: ${
        license.created_at
          ? format(new Date(license.created_at), "dd/MM/yyyy HH:mm")
          : "N/A"
      }`,
      "",
      "--- Hướng dẫn ---",
      "Mở phần mềm Karate Tournament Manager > Nhập License > Chọn file .lic này để kích hoạt.",
    ].join("\n");

    const blob = new Blob([content], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeClientName = (license.client_name || "license")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    a.download = `License_${safeClientName}.lic`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotify("Đã tải xuống file .lic");
  };

  const getCopyKey = (license) => {
    return license.raw_key || license.key || "";
  };

  const getStatus = (license) => {
    const isRevoked = license.status === "revoked";
    const isExpired = new Date(license.expiry_date) < new Date();
    if (isRevoked) return { label: "Thu hồi", color: "red", icon: XCircle };
    if (isExpired) return { label: "Hết hạn", color: "amber", icon: Clock };
    return { label: "Hoạt động", color: "emerald", icon: CheckCircle };
  };

  const getDaysLeft = (expiryDate) => {
    const diff = new Date(expiryDate) - new Date();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const filteredLicenses = licenses.filter(
    (l) =>
      l.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.key?.toLowerCase().includes(search.toLowerCase()) ||
      l.client_email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      <Toast
        notification={notification}
        onClose={() => setNotification(null)}
      />

      {/* Custom Confirm Modal */}
      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        icon={confirmModal.icon}
        iconColor={confirmModal.iconColor}
        confirmText={confirmModal.confirmText}
        confirmColor={confirmModal.confirmColor}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ open: false })}
      />

      {/* Custom Prompt Modal */}
      <PromptModal
        open={promptModal.open}
        title={promptModal.title}
        message={promptModal.message}
        placeholder={promptModal.placeholder}
        defaultValue={promptModal.defaultValue}
        onConfirm={promptModal.onConfirm}
        onCancel={() => setPromptModal({ open: false })}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Quản Lý License</h2>
          <p className="text-slate-400 text-sm mt-1">
            Tổng: {licenses.length} license
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              size={16}
            />
            <input
              type="text"
              placeholder="Tìm tên, key, email..."
              className="input-field mb-0 pl-10 pr-3 w-full text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap transition-all hover:shadow-lg hover:shadow-blue-500/20"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Tạo License</span>
          </button>
        </div>
      </div>

      {/* === DESKTOP TABLE (hidden on mobile) === */}
      <div className="glass-card overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-4">Trạng thái</th>
                <th className="p-4">Khách hàng</th>
                <th className="p-4">License Key</th>
                <th className="p-4">Loại</th>
                <th className="p-4">Máy</th>
                <th className="p-4">Hết hạn</th>
                <th className="p-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Đang tải...
                    </div>
                  </td>
                </tr>
              ) : filteredLicenses.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-500">
                    Không tìm thấy license nào
                  </td>
                </tr>
              ) : (
                filteredLicenses.map((license) => {
                  const status = getStatus(license);
                  const daysLeft = getDaysLeft(license.expiry_date);
                  const machines = license.activated_machines || [];
                  return (
                    <tr
                      key={license.id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-${status.color}-400 bg-${status.color}-500/10 px-2.5 py-1 rounded-full text-xs font-semibold`}
                        >
                          <status.icon size={12} /> {status.label}
                        </span>
                      </td>{" "}
                      <td className="p-4">
                        <div className="flex items-center gap-2 group">
                          <div>
                            <div className="font-medium text-white">
                              {license.client_name}
                            </div>
                            {license.client_email && (
                              <div className="text-xs text-slate-500">
                                {license.client_email}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(license.client_name, "Tên KH");
                            }}
                            className="p-1 rounded transition-colors opacity-0 group-hover:opacity-100 text-slate-500 hover:text-blue-400 flex-shrink-0"
                            title="Copy tên khách hàng"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-slate-300 text-xs bg-slate-800 px-2 py-1 rounded select-text cursor-text">
                            {license.key?.substring(0, 20)}...
                          </code>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(getCopyKey(license));
                            }}
                            className={`p-1 rounded transition-colors flex-shrink-0 ${
                              copySuccess === getCopyKey(license)
                                ? "text-emerald-400"
                                : "text-slate-500 hover:text-blue-400"
                            }`}
                            title="Copy full License Key"
                          >
                            {copySuccess === getCopyKey(license) ? (
                              <CheckCircle size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => handleDownloadLicense(license)}
                            className="p-1 text-slate-500 hover:text-emerald-400 rounded transition-colors"
                            title="Tải file .lic"
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`capitalize text-xs font-medium px-2 py-1 rounded ${
                            license.type === "yearly"
                              ? "bg-purple-500/10 text-purple-400"
                              : license.type === "tournament"
                              ? "bg-blue-500/10 text-blue-400"
                              : "bg-slate-500/10 text-slate-400"
                          }`}
                        >
                          {license.type === "trial"
                            ? "Dùng thử"
                            : license.type === "tournament"
                            ? "Giải đấu"
                            : license.type === "yearly"
                            ? "Năm"
                            : license.type}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => setShowDetail(license)}
                          className="flex items-center gap-1.5 text-slate-300 hover:text-blue-400 transition-colors"
                        >
                          <Monitor size={14} />
                          <span>
                            {machines.length}/{license.max_machines}
                          </span>
                          {machines.length > 0 && (
                            <Eye size={12} className="text-slate-500" />
                          )}
                        </button>
                      </td>
                      <td className="p-4">
                        <div className="text-slate-300 text-sm">
                          {format(new Date(license.expiry_date), "dd/MM/yyyy")}
                        </div>
                        <div
                          className={`text-xs ${
                            daysLeft <= 7
                              ? "text-red-400"
                              : daysLeft <= 30
                              ? "text-amber-400"
                              : "text-slate-500"
                          }`}
                        >
                          {daysLeft > 0 ? `Còn ${daysLeft} ngày` : "Đã hết hạn"}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleReset(license.key)}
                            title="Reset máy"
                            className="p-2 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                          >
                            <RotateCcw size={16} />
                          </button>
                          <button
                            onClick={() => handleExtend(license.key)}
                            title="Gia hạn"
                            className="p-2 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors"
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button
                            onClick={() => handleRevoke(license.key)}
                            title="Thu hồi"
                            className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                          >
                            <Ban size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* === MOBILE CARDS (hidden on desktop) === */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="glass-card text-center p-8 text-slate-500">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Đang tải...
          </div>
        ) : filteredLicenses.length === 0 ? (
          <div className="glass-card text-center p-8 text-slate-500">
            Không tìm thấy license nào
          </div>
        ) : (
          filteredLicenses.map((license) => {
            const status = getStatus(license);
            const daysLeft = getDaysLeft(license.expiry_date);
            const machines = license.activated_machines || [];
            const isExpanded = expandedCard === license.id;
            return (
              <div key={license.id} className="glass-card">
                {" "}
                {/* Card Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="font-semibold text-white text-base select-text">
                        {license.client_name}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(license.client_name, "Tên KH");
                        }}
                        className="p-1 text-slate-500 hover:text-blue-400 rounded transition-colors flex-shrink-0"
                        title="Copy tên khách hàng"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                    {license.client_email && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {license.client_email}
                      </div>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-${status.color}-400 bg-${status.color}-500/10 px-2.5 py-1 rounded-full text-xs font-semibold`}
                  >
                    <status.icon size={12} /> {status.label}
                  </span>
                </div>{" "}
                {/* Key Row */}
                <div className="flex items-center gap-2 mb-3 bg-slate-800/50 rounded-lg p-2.5">
                  <code className="font-mono text-slate-300 text-xs flex-1 truncate select-text cursor-text">
                    {license.key}
                  </code>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(getCopyKey(license));
                      }}
                      className={`p-1.5 rounded transition-colors flex-shrink-0 ${
                        copySuccess === getCopyKey(license)
                          ? "text-emerald-400"
                          : "text-blue-400 hover:bg-blue-500/20"
                      }`}
                      title="Copy full License Key"
                    >
                      {copySuccess === getCopyKey(license) ? (
                        <CheckCircle size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDownloadLicense(license)}
                      className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors flex-shrink-0"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
                {/* Info Row */}
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="bg-slate-800/30 rounded-lg p-2">
                    <div className="text-xs text-slate-500">Loại</div>
                    <div className="text-sm text-white capitalize mt-0.5">
                      {license.type === "trial"
                        ? "Thử"
                        : license.type === "tournament"
                        ? "Giải"
                        : "Năm"}
                    </div>
                  </div>
                  <div className="bg-slate-800/30 rounded-lg p-2">
                    <div className="text-xs text-slate-500">Máy</div>
                    <div className="text-sm text-white mt-0.5">
                      {machines.length}/{license.max_machines}
                    </div>
                  </div>
                  <div className="bg-slate-800/30 rounded-lg p-2">
                    <div className="text-xs text-slate-500">Còn lại</div>
                    <div
                      className={`text-sm mt-0.5 ${
                        daysLeft <= 7
                          ? "text-red-400"
                          : daysLeft <= 30
                          ? "text-amber-400"
                          : "text-white"
                      }`}
                    >
                      {daysLeft > 0 ? `${daysLeft}d` : "Hết"}
                    </div>
                  </div>
                </div>
                {/* Expand Toggle */}
                <button
                  onClick={() =>
                    setExpandedCard(isExpanded ? null : license.id)
                  }
                  className="w-full flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300 py-1 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  {isExpanded ? "Thu gọn" : "Xem thêm"}
                </button>
                {/* Expanded Actions */}
                {isExpanded && (
                  <div className="border-t border-slate-700 mt-2 pt-3 space-y-2">
                    {/* Machine IDs */}
                    {machines.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                          <Monitor size={12} /> Máy đã kích hoạt:
                        </div>
                        {machines.map((mid, i) => (
                          <div
                            key={i}
                            className="text-xs bg-slate-800 rounded px-2 py-1.5 mb-1 font-mono text-slate-300 flex items-center justify-between"
                          >
                            <span className="truncate">{mid}</span>
                            <button
                              onClick={() => copyToClipboard(mid, "Machine ID")}
                              className="p-1 text-slate-500 hover:text-blue-400"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleReset(license.key)}
                        className="flex items-center justify-center gap-1.5 p-2.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/20 transition-colors"
                      >
                        <RotateCcw size={14} /> Reset
                      </button>
                      <button
                        onClick={() => handleExtend(license.key)}
                        className="flex items-center justify-center gap-1.5 p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                      >
                        <RefreshCw size={14} /> Gia hạn
                      </button>
                      <button
                        onClick={() => handleRevoke(license.key)}
                        className="flex items-center justify-center gap-1.5 p-2.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors"
                      >
                        <Ban size={14} /> Thu hồi
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* === DETAIL MODAL (Machine IDs) === */}
      {showDetail && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDetail(null)}
        >
          <div
            className="glass-card w-full max-w-lg animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Chi tiết License</h3>
              <button
                onClick={() => setShowDetail(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <User size={12} /> Khách hàng
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="text-white font-medium select-text">
                      {showDetail.client_name}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(showDetail.client_name, "Tên KH");
                      }}
                      className="p-1 text-slate-500 hover:text-blue-400 rounded transition-colors flex-shrink-0"
                      title="Copy tên khách hàng"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Loại</div>
                  <div className="text-white capitalize">{showDetail.type}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1">License Key</div>
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-3">
                  <code className="text-xs text-slate-300 font-mono flex-1 break-all select-text cursor-text">
                    {showDetail.raw_key || showDetail.key}
                  </code>
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(getCopyKey(showDetail));
                      }}
                      className={`p-1.5 rounded flex-shrink-0 transition-colors ${
                        copySuccess === getCopyKey(showDetail)
                          ? "text-emerald-400"
                          : "text-blue-400 hover:bg-blue-500/20"
                      }`}
                      title="Copy Key"
                    >
                      {copySuccess === getCopyKey(showDetail) ? (
                        <CheckCircle size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadLicense(showDetail);
                      }}
                      className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded flex-shrink-0"
                      title="Tải .lic"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                  <Monitor size={12} /> Máy đã kích hoạt (
                  {(showDetail.activated_machines || []).length}/
                  {showDetail.max_machines})
                </div>
                {(showDetail.activated_machines || []).length === 0 ? (
                  <div className="text-sm text-slate-600 italic">
                    Chưa có máy nào kích hoạt
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(showDetail.activated_machines || []).map((mid, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Monitor size={14} className="text-slate-500" />
                          <code className="text-xs text-slate-300 font-mono">
                            {mid}
                          </code>
                        </div>
                        <button
                          onClick={() =>
                            copyToClipboard(mid, `Machine #${i + 1}`)
                          }
                          className="p-1 text-slate-500 hover:text-blue-400"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm border-t border-slate-700 pt-3">
                <div>
                  <div className="text-xs text-slate-500">Ngày tạo</div>
                  <div className="text-slate-300">
                    {showDetail.created_at
                      ? format(
                          new Date(showDetail.created_at),
                          "dd/MM/yyyy HH:mm"
                        )
                      : "N/A"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Hết hạn</div>
                  <div className="text-slate-300">
                    {format(new Date(showDetail.expiry_date), "dd/MM/yyyy")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === CREATE MODAL === */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="glass-card w-full max-w-md animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Tạo License Mới</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="border-b border-slate-700 pb-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <User size={14} /> Thông tin khách hàng
                </h4>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Tên khách hàng <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    required
                    placeholder="Ví dụ: CLB Karate Quận 1"
                    value={formData.clientName}
                    onChange={(e) =>
                      setFormData({ ...formData, clientName: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">
                      Số điện thoại
                    </label>
                    <input
                      type="tel"
                      className="input-field"
                      placeholder="0912 345 678"
                      value={formData.clientPhone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          clientPhone: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      className="input-field"
                      placeholder="email@..."
                      value={formData.clientEmail}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          clientEmail: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Monitor size={14} /> Cấu hình License
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">
                      Loại
                    </label>
                    <select
                      className="input-field"
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                    >
                      <option value="trial">Dùng thử (Trial)</option>
                      <option value="tournament">Giải đấu (Tournament)</option>
                      <option value="yearly">Trọn năm (Yearly)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">
                      Thời hạn (ngày)
                    </label>
                    <input
                      type="number"
                      className="input-field"
                      min="1"
                      value={formData.days}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          days: parseInt(e.target.value) || 30,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Số máy tối đa
                  </label>
                  <input
                    type="number"
                    className="input-field"
                    min="1"
                    max="100"
                    value={formData.maxMachines}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxMachines: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                  <p className="text-xs text-slate-600 mt-1">
                    Số máy tính có thể dùng cùng 1 key
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Ghi chú
                  </label>
                  <textarea
                    className="input-field resize-none"
                    rows="2"
                    placeholder="Ghi chú thêm (tuỳ chọn)"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn hover:bg-slate-700 text-slate-300 px-4 py-2.5"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="btn btn-primary px-5 py-2.5 flex items-center gap-2 disabled:opacity-50"
                >
                  {createLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang tạo...
                    </>
                  ) : (
                    <>
                      <Plus size={16} /> Tạo License
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === DOWNLOAD AFTER CREATE MODAL === */}
      {newlyCreatedLicense && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setNewlyCreatedLicense(null)}
        >
          <div
            className="glass-card w-full max-w-md animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={32} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white">
                Tạo License Thành Công!
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Tải file .lic để gửi cho khách hàng import vào phần mềm
              </p>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
              <div className="text-xs text-slate-500 mb-1">License Key</div>
              <div className="flex items-center gap-2">
                <code className="text-xs text-slate-300 font-mono flex-1 break-all select-text cursor-text">
                  {newlyCreatedLicense.raw_key || newlyCreatedLicense.key}
                </code>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(getCopyKey(newlyCreatedLicense));
                  }}
                  className={`p-1.5 rounded flex-shrink-0 transition-colors ${
                    copySuccess === getCopyKey(newlyCreatedLicense)
                      ? "text-emerald-400"
                      : "text-blue-400 hover:bg-blue-500/20"
                  }`}
                  title="Copy Key"
                >
                  {copySuccess === getCopyKey(newlyCreatedLicense) ? (
                    <CheckCircle size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Khách hàng:{" "}
                <span className="text-slate-300">
                  {newlyCreatedLicense.client_name}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setNewlyCreatedLicense(null)}
                className="flex-1 btn hover:bg-slate-700 text-slate-300 px-4 py-2.5"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  handleDownloadLicense(newlyCreatedLicense);
                  setNewlyCreatedLicense(null);
                }}
                className="flex-1 btn bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 flex items-center justify-center gap-2"
              >
                <Download size={16} /> Tải file .lic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
