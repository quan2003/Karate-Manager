import React, { useEffect, useState, useRef } from "react";
import api from "../services/api";
import {
  Trophy,
  Download,
  Trash2,
  RefreshCw,
  Search,
  HardDrive,
  Calendar,
  MapPin,
  Users,
  Layers,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  X,
  HelpCircle,
  Radio,
  Medal,
  Award,
  Info,
} from "lucide-react";

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'ongoing' | 'upcoming' | 'finished'
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  // Auto Refresh State (30s) - Persisted in localStorage
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    const saved = localStorage.getItem("admin_auto_refresh_tournaments");
    return saved !== null ? saved === "true" : true;
  });
  const [countdown, setCountdown] = useState(30);

  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("admin_auto_refresh_tournaments", String(next));
      if (next) setCountdown(30);
      return next;
    });
  };

  // Custom Modal States
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, type: 'danger'|'warning'|'info', onConfirm }
  const [detailModal, setDetailModal] = useState(null); // tournament object or null
  const [detailTab, setDetailTab] = useState("info"); // 'info' | 'rankings' | 'medalists'
  const [showPurgeHelp, setShowPurgeHelp] = useState(false);

  const fetchTournaments = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await api.get("/cloud-sync/tournaments");
      if (res.data.success) {
        setTournaments(res.data.tournaments || []);
      }
    } catch (err) {
      if (!isSilent) {
        showToast("error", err.response?.data?.message || "Không thể tải danh sách giải đấu từ VPS");
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  // Auto Refresh Engine (Every 30s)
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchTournaments(true);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefreshEnabled]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Status helper: Sắp diễn ra / Đang diễn ra / Đã kết thúc
  const getTournamentTimeStatus = (startDateStr, endDateStr) => {
    if (!startDateStr) return { label: "Chưa rõ ngày", type: "unknown", color: "bg-slate-800 text-slate-400 border-slate-700" };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(startDateStr);
    const end = endDateStr ? new Date(endDateStr) : new Date(startDateStr);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime())) {
      return { label: "Không rõ ngày", type: "unknown", color: "bg-slate-800 text-slate-400 border-slate-700" };
    }

    if (today < start) {
      return { label: "🟡 Sắp diễn ra", type: "upcoming", color: "bg-amber-500/10 text-amber-300 border-amber-500/30" };
    }
    if (today >= start && today <= end) {
      return { label: "🔴 ĐANG DIỄN RA", type: "ongoing", color: "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse font-bold" };
    }
    return { label: "⚪ Đã kết thúc", type: "finished", color: "bg-slate-800/80 text-slate-400 border-slate-700" };
  };

  const handleDownloadKbackup = (tournament) => {
    if (tournament.is_purged) {
      showToast("error", "Giải đấu này đã được dọn dẹp dung lượng DB, không còn file .kbackup trên VPS.");
      return;
    }

    const downloadUrl = `${api.defaults.baseURL}/cloud-sync/download-kbackup/${tournament.id}`;
    window.open(downloadUrl, "_blank");
    showToast("success", `Đang tải file .kbackup giải ${tournament.name}...`);
  };

  const requestPurgeTournament = (tournament) => {
    setConfirmModal({
      title: "Dọn dẹp dung lượng DB",
      message: `Hệ thống sẽ xóa toàn bộ gói dữ liệu chi tiết (.kbackup) của giải "${tournament.name}" trên VPS để tiết kiệm đĩa cứng. Thông tin tổng quan vẫn sẽ được lưu trữ.`,
      type: "warning",
      confirmText: "Xác nhận dọn dẹp",
      onConfirm: async () => {
        setConfirmModal(null);
        setActionLoading(tournament.id);
        try {
          const res = await api.post(`/cloud-sync/purge/${tournament.id}`);
          if (res.data.success) {
            showToast("success", res.data.message);
            fetchTournaments();
          }
        } catch (err) {
          showToast("error", err.response?.data?.message || "Lỗi dọn dẹp giải đấu");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const requestDeleteTournament = (tournament) => {
    setConfirmModal({
      title: "⚠️ Xóa vĩnh viễn khỏi VPS?",
      message: `Giải đấu "${tournament.name}" sẽ bị xóa hoàn toàn khỏi VPS Database và biến mất vĩnh viễn khỏi giao diện Web Admin. (Dữ liệu trên máy thi đấu địa phương của Thư ký vẫn an toàn).`,
      type: "danger",
      confirmText: "Xóa vĩnh viễn",
      onConfirm: async () => {
        setConfirmModal(null);
        setActionLoading(tournament.id);
        try {
          const res = await api.delete(`/cloud-sync/tournament/${tournament.id}`);
          if (res.data.success) {
            showToast("success", res.data.message);
            fetchTournaments();
          }
        } catch (err) {
          showToast("error", err.response?.data?.message || "Lỗi xóa giải đấu");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const requestDeleteAllTournaments = () => {
    if (tournaments.length === 0) {
      showToast("error", "Không có giải đấu nào trên VPS để xóa.");
      return;
    }

    setConfirmModal({
      title: "🚨 XÁC NHẬN XÓA TẤT CẢ GIẢI ĐẤU TRÊN VPS?",
      message: `Bạn đang thực hiện xóa toàn bộ ${tournaments.length} giải đấu khỏi VPS Database. Tất cả dữ liệu lưu trữ trên Cloud VPS sẽ bị làm sạch hoàn toàn. (Dữ liệu trên các máy thi đấu địa phương vẫn an toàn).`,
      type: "danger",
      confirmText: "Xóa tất cả ngay",
      onConfirm: async () => {
        setConfirmModal(null);
        setActionLoading("delete-all");
        try {
          const res = await api.delete("/cloud-sync/tournaments/all");
          if (res.data.success) {
            showToast("success", res.data.message);
            fetchTournaments();
          }
        } catch (err) {
          showToast("error", err.response?.data?.message || "Lỗi xóa tất cả giải đấu");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const requestTriggerAutoPurge = () => {
    setConfirmModal({
      title: "Tự động dọn dẹp giải cũ (> 7 ngày)",
      message: "Hệ thống sẽ quét các giải đấu có lần đồng bộ cuối cùng (last_synced_at) quá 7 ngày so với hiện tại và giải phóng dữ liệu thô .kbackup trên VPS.",
      type: "warning",
      confirmText: "Chạy tự động dọn dẹp",
      onConfirm: async () => {
        setConfirmModal(null);
        setActionLoading("auto-purge");
        try {
          const res = await api.post("/cloud-sync/trigger-auto-purge", { days: 7 });
          if (res.data.success) {
            showToast("success", res.data.message);
            fetchTournaments();
          }
        } catch (err) {
          showToast("error", "Lỗi tự động dọn dẹp");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const formatDataSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 KB";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDateString = (isoStr) => {
    if (!isoStr) return "Chưa rõ";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString("vi-VN");
    } catch (e) {
      return isoStr;
    }
  };

  // Filter & Search Logic
  const filteredTournaments = tournaments.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.machine_id && t.machine_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.location && t.location.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === "all") return true;
    const timeStatus = getTournamentTimeStatus(t.start_date, t.end_date);
    return timeStatus.type === statusFilter;
  });

  // Count stats
  const countOngoing = tournaments.filter((t) => getTournamentTimeStatus(t.start_date, t.end_date).type === "ongoing").length;
  const countUpcoming = tournaments.filter((t) => getTournamentTimeStatus(t.start_date, t.end_date).type === "upcoming").length;
  const countFinished = tournaments.filter((t) => getTournamentTimeStatus(t.start_date, t.end_date).type === "finished").length;

  // Extract or compute Delegation Rankings & Medalists from detailModal
  const getCategoryMedalResults = (cat, categoryResultsMap = {}) => {
    const saved = categoryResultsMap[cat.id] || cat.results || {};
    let computed = null;

    if (cat?.bracket?.matches) {
      const bracket = cat.bracket;
      const finalMatch = (bracket.matches || []).find(
        (m) => m.nextMatchId === null && m.round > 0
      );

      if (finalMatch?.winner) {
        const getLoser = (match) => {
          if (!match?.winner) return null;
          if (match.athlete1?.id === match.winner.id) return match.athlete2;
          if (match.athlete2?.id === match.winner.id) return match.athlete1;
          return null;
        };

        const champion = finalMatch.winner;
        const silver = getLoser(finalMatch);
        const semiFinalRound = bracket.numRounds - 1;
        const semiFinals = (bracket.matches || []).filter(
          (m) => m.round === semiFinalRound && !m.isBye
        );
        const bronzes = semiFinals.map((m) => getLoser(m)).filter(Boolean);

        computed = {
          first: champion?.name || "",
          club1: champion?.club || "",
          second: silver?.name || "",
          club2: silver?.club || "",
          third1: bronzes[0]?.name || "",
          club3a: bronzes[0]?.club || "",
          third2: bronzes[1]?.name || "",
          club3b: bronzes[1]?.club || "",
        };
      }
    }

    if (!saved && !computed) return {};
    if (!saved) return computed || {};
    if (!computed) return saved || {};

    const fields = ["first", "second", "third1", "third2", "club1", "club2", "club3a", "club3b"];
    const merged = {};
    fields.forEach((f) => {
      merged[f] = saved[f] && typeof saved[f] === "string" && saved[f].trim() !== "" ? saved[f] : (computed[f] || "");
    });
    return merged;
  };

  // Extract or compute Delegation Rankings & Medalists from detailModal
  const getDetailMedalData = (tournament) => {
    if (!tournament) return { delegationRankings: [], medalistsList: [] };

    if (tournament.summary?.delegationRankings?.length > 0) {
      return {
        delegationRankings: tournament.summary.delegationRankings,
        medalistsList: tournament.summary.medalists || [],
      };
    }

    const tData =
      tournament.backup_data?.data?.tournaments?.[0] ||
      tournament.backup_data?.tournaments?.[0] ||
      tournament.backup_data;

    if (!tData) return { delegationRankings: [], medalistsList: [] };

    const categoryResults = tData.categoryResults || {};
    const clubMedals = {};
    const medalistsList = [];

    (tData.categories || []).forEach((category) => {
      const results = getCategoryMedalResults(category, categoryResults);
      const catName = category.name || category.eventName || "Hạng mục";

      const first = results.first || "";
      const club1 =
        results.club1 ||
        results.firstClub ||
        category.athletes?.find((a) => a.name === first)?.club ||
        "";
      const second = results.second || "";
      const club2 =
        results.club2 ||
        results.secondClub ||
        category.athletes?.find((a) => a.name === second)?.club ||
        "";
      const third1 = results.third1 || results.third || "";
      const club3a =
        results.club3a ||
        results.third1Club ||
        category.athletes?.find((a) => a.name === third1)?.club ||
        "";
      const third2 = results.third2 || "";
      const club3b =
        results.club3b ||
        results.third2Club ||
        category.athletes?.find((a) => a.name === third2)?.club ||
        "";

      if (first || second || third1) {
        medalistsList.push({
          categoryName: catName,
          gold: first || null,
          goldClub: club1 || null,
          silver: second || null,
          silverClub: club2 || null,
          bronze1: third1 || null,
          bronze1Club: club3a || null,
          bronze2: third2 || null,
          bronze2Club: club3b || null,
        });
      }

      const addMedal = (club, type) => {
        if (!club || typeof club !== "string") return;
        const normalized = club.trim();
        if (!normalized) return;
        if (!clubMedals[normalized]) {
          clubMedals[normalized] = { club: normalized, gold: 0, silver: 0, bronze: 0, total: 0 };
        }
        clubMedals[normalized][type] += 1;
        clubMedals[normalized].total += 1;
      };

      if (club1) addMedal(club1, "gold");
      if (club2) addMedal(club2, "silver");
      if (club3a) addMedal(club3a, "bronze");
      if (club3b) addMedal(club3b, "bronze");
    });

    const delegationRankings = Object.values(clubMedals)
      .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze)
      .map((item, idx) => ({ rank: idx + 1, ...item }));

    return { delegationRankings, medalistsList };
  };

  const { delegationRankings, medalistsList } = getDetailMedalData(detailModal);

  return (
    <>
    <div className="space-y-6 text-slate-100">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 p-4 rounded-xl shadow-2xl border flex items-center gap-3 backdrop-blur-md animate-fade-in ${
            toast.type === "error"
              ? "bg-red-950/95 border-red-500/50 text-red-200"
              : "bg-emerald-950/95 border-emerald-500/50 text-emerald-200"
          }`}
        >
          {toast.type === "error" ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      {/* CUSTOM CONFIRMATION MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  confirmModal.type === "danger"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                }`}
              >
                <AlertCircle size={28} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{confirmModal.title}</h3>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
              >
                Hủy bỏ
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-5 py-2.5 rounded-xl font-bold text-white shadow-lg transition ${
                  confirmModal.type === "danger"
                    ? "bg-red-600 hover:bg-red-500 shadow-red-600/30"
                    : "bg-amber-600 hover:bg-amber-500 shadow-amber-600/30"
                }`}
              >
                {confirmModal.confirmText || "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL PREVIEW MODAL */}
      {detailModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Chi tiết Giải đấu Cloud
                  </span>
                  {detailModal.is_purged ? (
                    <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      🧹 DB đã dọn
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      🟢 Full Backup Data
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white leading-snug">{detailModal.name}</h2>
              </div>
              <button
                onClick={() => setDetailModal(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex rounded-xl bg-slate-950/70 p-1 border border-slate-800 text-sm font-medium">
              <button
                onClick={() => setDetailTab("info")}
                className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-2 ${
                  detailTab === "info" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                <Info size={16} />
                Thông số chung
              </button>
              <button
                onClick={() => setDetailTab("rankings")}
                className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-2 ${
                  detailTab === "rankings" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                <Trophy size={16} className="text-amber-400" />
                Toàn đoàn (Nhất-Nhì-Ba)
              </button>
              <button
                onClick={() => setDetailTab("medalists")}
                className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-2 ${
                  detailTab === "medalists" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"
                }`}
              >
                <Medal size={16} className="text-purple-400" />
                VĐV Đạt thành tích ({medalistsList.length})
              </button>
            </div>

            {/* TAB 1: THÔNG SỐ CHUNG */}
            {detailTab === "info" && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-center">
                    <Users className="mx-auto text-purple-400 mb-1" size={20} />
                    <div className="text-lg font-bold text-white">{detailModal.total_athletes || 0}</div>
                    <div className="text-xs text-slate-400">Vận động viên</div>
                  </div>

                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-center">
                    <Layers className="mx-auto text-amber-400 mb-1" size={20} />
                    <div className="text-lg font-bold text-white">{detailModal.total_categories || 0}</div>
                    <div className="text-xs text-slate-400">Hạng mục thi đấu</div>
                  </div>

                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-center">
                    <HardDrive className="mx-auto text-blue-400 mb-1" size={20} />
                    <div className="text-lg font-bold text-white">{formatDataSize(detailModal.data_size)}</div>
                    <div className="text-xs text-slate-400">Dung lượng DB</div>
                  </div>

                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-center">
                    <Radio className="mx-auto text-emerald-400 mb-1" size={20} />
                    <div className="text-sm font-bold text-white truncate" title={detailModal.authorized_machine_id || detailModal.machine_id}>
                      {detailModal.authorized_machine_id || detailModal.machine_id || "N/A"}
                    </div>
                    <div className="text-xs text-slate-400">
                      {detailModal.authorized_machine_id ? "👑 Authorized Machine ID" : "Machine ID"}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800 text-sm">
                  <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                    <span className="text-slate-400">Thời gian tổ chức:</span>
                    <span className="font-semibold text-slate-200">
                      {detailModal.start_date || "Chưa rõ"}
                      {detailModal.end_date && detailModal.end_date !== detailModal.start_date ? ` đến ${detailModal.end_date}` : ""}
                    </span>
                  </div>

                  <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                    <span className="text-slate-400">Địa điểm:</span>
                    <span className="font-semibold text-slate-200">{detailModal.location || "Chưa cập nhật"}</span>
                  </div>

                  <div className="flex justify-between items-center border-b border-slate-800/60 pb-2">
                    <span className="text-slate-400">Đồng bộ lần cuối lúc:</span>
                    <span className="font-semibold text-emerald-400">{formatDateString(detailModal.last_synced_at)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Trạng thái dữ liệu VPS:</span>
                    <span className="font-semibold text-slate-200">
                      {detailModal.is_purged ? "Đã dọn dẹp dữ liệu thô (.kbackup)" : "Đầy đủ 100% dữ liệu gốc"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: BẢNG XẾP HẠNG TOÀN ĐOÀN */}
            {detailTab === "rankings" && (
              <div className="space-y-4 animate-fade-in">
                {delegationRankings.length === 0 ? (
                  <div className="bg-slate-950/40 border border-slate-800 p-8 rounded-xl text-center text-slate-400">
                    <Trophy className="mx-auto text-slate-600 mb-2" size={36} />
                    <p>Chưa có thông tin cập nhật bảng tổng sắp huy chương toàn đoàn cho giải này.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto bg-slate-950/50 rounded-xl border border-slate-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-xs">
                        <tr>
                          <th className="py-3 px-4 w-16">Hạng</th>
                          <th className="py-3 px-4">Đoàn / Đơn vị</th>
                          <th className="py-3 px-4 text-center text-amber-400">🥇 Vàng</th>
                          <th className="py-3 px-4 text-center text-slate-300">🥈 Bạc</th>
                          <th className="py-3 px-4 text-center text-amber-600">🥉 Đồng</th>
                          <th className="py-3 px-4 text-center">Tổng HC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {delegationRankings.map((row) => (
                          <tr
                            key={row.club}
                            className="hover:bg-slate-800/40 transition"
                          >
                            <td className="py-3 px-4 font-semibold text-slate-300">
                              #{row.rank}
                            </td>
                            <td className="py-3 px-4 font-medium text-white">{row.club}</td>
                            <td className="py-3 px-4 text-center font-bold text-amber-400">{row.gold}</td>
                            <td className="py-3 px-4 text-center font-bold text-slate-300">{row.silver}</td>
                            <td className="py-3 px-4 text-center font-bold text-amber-600">{row.bronze}</td>
                            <td className="py-3 px-4 text-center font-bold text-white">{row.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: DANH SÁCH VĐV ĐẠT THÀNH TÍCH */}
            {detailTab === "medalists" && (
              <div className="space-y-4 animate-fade-in max-h-[50vh] overflow-y-auto pr-1">
                {medalistsList.length === 0 ? (
                  <div className="bg-slate-950/40 border border-slate-800 p-8 rounded-xl text-center text-slate-400">
                    <Award className="mx-auto text-slate-600 mb-2" size={36} />
                    <p>Chưa có danh sách vận động viên đạt huy chương cho giải này.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {medalistsList.map((m, i) => (
                      <div key={i} className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2">
                        <div className="font-bold text-blue-400 text-sm border-b border-slate-800 pb-1.5 flex items-center justify-between">
                          <span>{m.categoryName}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          {m.gold && (
                            <div className="bg-amber-500/10 p-2 rounded border border-amber-500/20">
                              <span className="text-amber-400 font-bold block">🥇 Vàng (Nhất):</span>
                              <div className="text-white font-medium">{m.gold}</div>
                              {m.goldClub && <div className="text-slate-400 text-[11px]">{m.goldClub}</div>}
                            </div>
                          )}
                          {m.silver && (
                            <div className="bg-slate-700/20 p-2 rounded border border-slate-600/30">
                              <span className="text-slate-300 font-bold block">🥈 Bạc (Nhì):</span>
                              <div className="text-white font-medium">{m.silver}</div>
                              {m.silverClub && <div className="text-slate-400 text-[11px]">{m.silverClub}</div>}
                            </div>
                          )}
                          {(m.bronze1 || m.bronze2) && (
                            <div className="bg-amber-900/10 p-2 rounded border border-amber-700/20">
                              <span className="text-amber-600 font-bold block">🥉 Đồng (Ba):</span>
                              {m.bronze1 && <div className="text-white font-medium">{m.bronze1} ({m.bronze1Club || 'N/A'})</div>}
                              {m.bronze2 && <div className="text-white font-medium mt-1">{m.bronze2} ({m.bronze2Club || 'N/A'})</div>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setDetailModal(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  setDetailModal(null);
                  handleDownloadKbackup(detailModal);
                }}
                disabled={detailModal.is_purged}
                className={`px-5 py-2.5 rounded-xl font-bold text-white flex items-center gap-2 transition ${
                  detailModal.is_purged
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800"
                    : "bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30"
                }`}
              >
                <Download size={18} />
                Tải file .kbackup gốc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800 backdrop-blur-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Trophy className="text-amber-400" size={28} />
            Quản lý Giải đấu Cloud & VPS Storage
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Theo dõi dữ liệu giải đấu từ máy trạm thi đấu (`Machine ID`), tải file `.kbackup` & tự động tối ưu VPS.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Auto Refresh Toggle & Countdown */}
          <button
            onClick={toggleAutoRefresh}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition ${
              autoRefreshEnabled
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
            title="Tự động tải lại danh sách từ VPS mỗi 30s"
          >
            <RefreshCw size={14} className={autoRefreshEnabled ? "animate-spin text-emerald-400" : ""} />
            {autoRefreshEnabled ? `Tự động cập nhật (${countdown}s)` : "Tự động cập nhật: TẮT"}
          </button>

          <button
            onClick={() => fetchTournaments(false)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition border border-slate-700 text-sm font-medium"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Làm mới
          </button>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl transition overflow-hidden">
              <button
                onClick={requestTriggerAutoPurge}
                disabled={actionLoading === "auto-purge"}
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium hover:bg-amber-500/10 transition"
                title="Dọn dẹp các giải đấu rác cũ hơn 7 ngày"
              >
                <HardDrive size={16} />
                <span>{actionLoading === "auto-purge" ? "Đang dọn..." : "Dọn VPS (>7 ngày)"}</span>
              </button>
              <div className="h-4 w-[1px] bg-amber-500/30" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPurgeHelp(!showPurgeHelp);
                }}
                className="px-2.5 py-2 hover:bg-amber-500/20 text-amber-300 transition flex items-center justify-center"
                title="Xem chi tiết quy tắc dọn dẹp 7 ngày"
              >
                <HelpCircle size={15} />
              </button>
            </div>

            <button
              onClick={requestDeleteAllTournaments}
              disabled={actionLoading === "delete-all" || tournaments.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded-xl transition text-sm font-medium"
              title="Xóa tất cả các giải đấu trên VPS Database"
            >
              <Trash2 size={16} />
              {actionLoading === "delete-all" ? "Đang xóa..." : "Xóa tất cả"}
            </button>
          </div>

        </div>

        </div>

      {/* Filter & Search Bar */}
      <div className="space-y-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Tìm theo tên giải đấu, Machine ID, địa điểm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div className="text-sm text-slate-400 shrink-0">
            Hiển thị: <span className="font-semibold text-white">{filteredTournaments.length}</span> / {tournaments.length} giải
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/70 text-sm">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition ${
              statusFilter === "all"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700/80"
            }`}
          >
            Tất cả ({tournaments.length})
          </button>

          <button
            onClick={() => setStatusFilter("ongoing")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-medium transition ${
              statusFilter === "ongoing"
                ? "bg-red-600 text-white shadow-md shadow-red-600/30"
                : "bg-slate-800/80 text-red-400 hover:bg-slate-700/80"
            }`}
          >
            <Radio size={14} className="animate-pulse" />
            🔴 Đang diễn ra ({countOngoing})
          </button>

          <button
            onClick={() => setStatusFilter("upcoming")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-medium transition ${
              statusFilter === "upcoming"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                : "bg-slate-800/80 text-amber-300 hover:bg-slate-700/80"
            }`}
          >
            🟡 Sắp diễn ra ({countUpcoming})
          </button>

          <button
            onClick={() => setStatusFilter("finished")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-medium transition ${
              statusFilter === "finished"
                ? "bg-slate-700 text-white shadow-md"
                : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80"
            }`}
          >
            ⚪ Đã kết thúc ({countFinished})
          </button>
        </div>
      </div>

      {/* Tournaments Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-slate-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={24} />
          <span>Đang tải danh sách giải đấu trên Cloud...</span>
        </div>
      ) : filteredTournaments.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center">
          <Trophy size={48} className="mx-auto text-slate-600 mb-3" />
          <h3 className="text-lg font-semibold text-slate-300">Không tìm thấy giải đấu phù hợp</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
            Thử đổi từ khóa tìm kiếm hoặc chọn tab bộ lọc khác.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTournaments.map((tournament) => {
            const timeStatus = getTournamentTimeStatus(tournament.start_date, tournament.end_date);

            return (
              <div
                key={tournament.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-700 transition shadow-xl relative group"
              >
                <div>
                  {/* Status Badges Row */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${timeStatus.color}`}>
                      {timeStatus.label}
                    </span>

                    {tournament.is_purged ? (
                      <span className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        🧹 DB đã dọn
                      </span>
                    ) : (
                      <span className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        🟢 Full Data
                      </span>
                    )}
                  </div>

                  {/* Tournament Title */}
                  <h3 className="font-bold text-lg text-white leading-snug mb-3 group-hover:text-blue-400 transition">
                    {tournament.name}
                  </h3>

                  {/* Info List */}
                  <div className="space-y-2 text-sm text-slate-300 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar size={15} className="text-blue-400 shrink-0" />
                      <span>
                        {tournament.start_date || "Chưa có ngày"}
                        {tournament.end_date && tournament.end_date !== tournament.start_date
                          ? ` - ${tournament.end_date}`
                          : ""}
                      </span>
                    </div>

                    {tournament.location && (
                      <div className="flex items-start gap-2">
                        <MapPin size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                        <span className="break-words">{tournament.location}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Users size={15} className="text-purple-400 shrink-0" />
                      <span>{tournament.total_athletes || 0} Vận động viên</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Layers size={15} className="text-amber-400 shrink-0" />
                      <span>{tournament.total_categories || 0} Hạng mục thi đấu</span>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-400">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono bg-slate-950 px-2 py-1 rounded text-slate-300 break-all" title={tournament.machine_id}>
                          🔑 Machine ID: {tournament.machine_id || "N/A"}
                        </span>
                        <span>Dung lượng: <strong className="text-slate-200">{formatDataSize(tournament.data_size)}</strong></span>
                      </div>
                      {tournament.authorized_machine_id && (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                          <span>👑 Máy nguồn chính:</span>
                          <span className="font-mono bg-emerald-950/80 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
                            {tournament.authorized_machine_id}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-4 border-t border-slate-800 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setDetailModal(tournament);
                      setDetailTab("info");
                    }}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition"
                    title="Xem chi tiết thông số & xếp hạng giải đấu"
                  >
                    <Eye size={16} />
                  </button>

                  <button
                    onClick={() => handleDownloadKbackup(tournament)}
                    disabled={tournament.is_purged}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-medium text-sm transition ${
                      tournament.is_purged
                        ? "bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-800"
                        : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
                    }`}
                  >
                    <Download size={16} />
                    Tải .kbackup
                  </button>

                  {!tournament.is_purged && (
                    <button
                      onClick={() => requestPurgeTournament(tournament)}
                      disabled={actionLoading === tournament.id}
                      className="p-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl transition"
                      title="Dọn dẹp dung lượng DB (Giải phóng ổ cứng VPS)"
                    >
                      <HardDrive size={16} />
                    </button>
                  )}

                  <button
                    onClick={() => requestDeleteTournament(tournament)}
                    disabled={actionLoading === tournament.id}
                    className="p-2.5 bg-slate-800 hover:bg-red-950/80 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/40 rounded-xl transition"
                    title="Xóa vĩnh viễn giải đấu này khỏi VPS Database"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* Help Modal Popup for 7-day purge - nằm ngoài main div, fixed hoạt động đúng */}
    {showPurgeHelp && (
      <div
        className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 text-slate-200"
        onClick={() => setShowPurgeHelp(false)}
      >
        <div
          className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-3 text-sm relative"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
              <Info size={20} /> Quy tắc Dọn VPS (&gt; 7 ngày):
            </div>
            <button
              onClick={() => setShowPurgeHelp(false)}
              className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition"
            >
              <X size={18} />
            </button>
          </div>
          <p className="leading-relaxed text-slate-300">
            Hệ thống so sánh <strong>thời điểm đồng bộ lần cuối (last_synced_at)</strong> với thời điểm hiện tại{" "}
            <code className="bg-slate-950 px-1.5 py-0.5 rounded text-amber-300 border border-slate-800 font-mono">NOW()</code>.
          </p>
          <p className="leading-relaxed text-slate-400">
            Nếu giải đấu đã quá 7 ngày không có bất kỳ đồng bộ mới nào từ máy trạm, hệ thống tự động dọn dẹp dữ liệu thô{" "}
            <code className="text-slate-300 bg-slate-950 px-1 py-0.5 rounded font-mono">.kbackup</code> để giải phóng bộ nhớ ổ cứng VPS, nhưng{" "}
            <strong className="text-slate-200">vẫn giữ lại thẻ thông tin tổng quan</strong> để theo dõi!
          </p>
          <div className="pt-2 text-right">
            <button
              onClick={() => setShowPurgeHelp(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-xs transition"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
