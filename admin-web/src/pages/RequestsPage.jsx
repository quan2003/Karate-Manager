import { useEffect, useState, useCallback } from "react";
import api from "../services/api";
import {
  MessageSquare,
  Check,
  Clock,
  User,
  X,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";

// Toast Component
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
        className={`relative overflow-hidden rounded-xl shadow-2xl border backdrop-blur-lg ${
          isError
            ? "bg-red-950/90 border-red-500/30"
            : "bg-emerald-950/90 border-emerald-500/30"
        }`}
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

// Resolve Modal
function ResolveModal({ open, onConfirm, onCancel }) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open]);
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
          <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Check size={28} className="text-emerald-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Xử lý yêu cầu</h3>
          <p className="text-sm text-slate-400 mt-1">
            Thêm ghi chú xử lý (tuỳ chọn)
          </p>
        </div>
        <textarea
          className="input-field resize-none mb-4"
          rows="3"
          placeholder="Ghi chú: đã gia hạn, đã reset máy..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 btn hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg border border-slate-600"
          >
            Huỷ
          </button>
          <button
            onClick={() => onConfirm(note)}
            className="flex-1 btn bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium"
          >
            Hoàn tất
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [resolveModal, setResolveModal] = useState({
    open: false,
    requestId: null,
  });
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(() => fetchRequests(true), 30000);
    return () => clearInterval(interval);
  }, []);

  const showNotify = useCallback((message, type = "success") => {
    setNotification({ message, type, key: Date.now() });
  }, []);

  const fetchRequests = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get("/license/requests");
      if (res.data.success) {
        setRequests(res.data.requests);
      }
    } catch (error) {
      console.error("Error fetching requests:", error);
      if (!silent) showNotify("Lỗi tải danh sách yêu cầu", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleResolve = (requestId) => {
    setResolveModal({ open: true, requestId });
  };

  const confirmResolve = async (note) => {
    const { requestId } = resolveModal;
    setResolveModal({ open: false, requestId: null });
    try {
      const res = await api.post("/license/request/resolve", {
        requestId,
        note,
      });
      if (res.data.success) {
        fetchRequests();
        showNotify("Đã xử lý yêu cầu thành công");
      }
    } catch (error) {
      showNotify("Lỗi xử lý yêu cầu", "error");
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const filteredRequests =
    filter === "all" ? requests : requests.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <Toast
        notification={notification}
        onClose={() => setNotification(null)}
      />
      <ResolveModal
        open={resolveModal.open}
        onConfirm={confirmResolve}
        onCancel={() => setResolveModal({ open: false, requestId: null })}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Yêu Cầu Hỗ Trợ</h2>
          <p className="text-slate-400 text-sm mt-1">
            {pendingCount > 0 ? (
              <span className="text-amber-400 font-medium">
                {pendingCount} yêu cầu đang chờ xử lý
              </span>
            ) : (
              "Không có yêu cầu nào đang chờ"
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {["all", "pending", "resolved"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {f === "all"
                ? `Tất cả (${requests.length})`
                : f === "pending"
                ? `Chờ xử lý (${pendingCount})`
                : `Đã xử lý (${requests.length - pendingCount})`}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card">
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-slate-500">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Đang tải...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Không có yêu cầu nào
            </div>
          ) : (
            filteredRequests.map((req) => (
              <div
                key={req.id}
                className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                        req.status === "pending"
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-emerald-500/10 text-emerald-500"
                      }`}
                    >
                      {req.status === "pending" ? "Chờ xử lý" : "Đã xử lý"}
                    </span>
                    <span className="text-slate-400 text-xs flex items-center gap-1">
                      <Clock size={12} />{" "}
                      {format(new Date(req.created_at), "dd/MM/yyyy HH:mm")}
                    </span>
                  </div>
                  <h4 className="text-white font-semibold text-lg">
                    {req.request_type}
                  </h4>
                  <p className="text-slate-300 mt-1">{req.message}</p>

                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                    <div className="flex items-center gap-1">
                      <User size={14} />
                      <span>{req.client_name || "Unknown Client"}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageSquare size={14} />
                      <span>{req.contact_info || "No contact info"}</span>
                    </div>
                    <div className="font-mono bg-slate-900 px-2 py-0.5 rounded text-xs">
                      ID: {req.machine_id}
                    </div>
                  </div>

                  {req.admin_note && (
                    <div className="mt-2 text-sm text-emerald-400 bg-emerald-500/5 p-2 rounded border border-emerald-500/20">
                      <strong>Ghi chú xử lý:</strong> {req.admin_note}
                    </div>
                  )}
                </div>

                {req.status === "pending" && (
                  <button
                    onClick={() => handleResolve(req.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap self-end md:self-center transition-colors"
                  >
                    <Check size={18} />
                    <span>Xử lý</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
