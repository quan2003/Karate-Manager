import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useTheme } from "../services/theme";
import {
  AlertTriangle,
  Clock,
  Key,
  LogOut,
  ReceiptText,
  TrendingUp,
  Wallet,
  Trophy,
  Users,
  HardDrive,
  Layers,
  ArrowRight,
  Database,
  RefreshCw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

const formatVnd = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const toNumber = (value) => Number(value || 0);

const isPaidOrder = (order) => {
  const status = String(order?.status || "").toLowerCase();
  return ["paid", "completed", "success", "received"].includes(status);
};

const getOrderDate = (order) => {
  const value = order?.paid_at || order?.created_at;
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const buildPaymentStatsFromOrders = (orders = []) => {
  const paidOrders = orders.filter(isPaidOrder);
  const pendingOrders = orders.filter((order) => !isPaidOrder(order));
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyRevenue = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (13 - index));
    const key = day.toISOString().slice(0, 10);
    return {
      key,
      day: day.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      }),
      revenue_vnd: 0,
      paid_orders: 0,
    };
  });
  const dayMap = new Map(dailyRevenue.map((item) => [item.key, item]));
  const planMap = new Map();

  let revenueVnd = 0;
  let revenue30dVnd = 0;

  paidOrders.forEach((order) => {
    const amount = Number(order.amount_vnd || 0);
    const paidAt = getOrderDate(order);
    const dayKey = paidAt.toISOString().slice(0, 10);
    const planName = order.plan_name || "Không rõ";

    revenueVnd += amount;
    if (paidAt >= thirtyDaysAgo) revenue30dVnd += amount;

    if (dayMap.has(dayKey)) {
      const day = dayMap.get(dayKey);
      day.revenue_vnd += amount;
      day.paid_orders += 1;
    }

    const current = planMap.get(planName) || {
      name: planName,
      count: 0,
      revenue_vnd: 0,
    };
    current.count += 1;
    current.revenue_vnd += amount;
    planMap.set(planName, current);
  });

  return {
    payments: {
      total_orders: orders.length,
      paid_orders: paidOrders.length,
      pending_orders: pendingOrders.length,
      revenue_vnd: revenueVnd,
      revenue_30d_vnd: revenue30dVnd,
    },
    dailyRevenue,
    revenueByPlan: Array.from(planMap.values()).sort(
      (a, b) => b.revenue_vnd - a.revenue_vnd
    ),
  };
};

export default function DashboardPage() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [stats, setStats] = useState(null);
  const [cloudTournaments, setCloudTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Auto Refresh State (30s) - Persisted in localStorage
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    const saved = localStorage.getItem("admin_auto_refresh_dashboard");
    return saved !== null ? saved === "true" : true;
  });
  const [countdown, setCountdown] = useState(30);

  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("admin_auto_refresh_dashboard", String(next));
      if (next) setCountdown(30);
      return next;
    });
  };

  const fetchStats = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const [statsResult, ordersResult, tournamentsResult] = await Promise.allSettled([
        api.get("/stats/dashboard"),
        api.get("/admin/payment-orders"),
        api.get("/cloud-sync/tournaments"),
      ]);

      const fallbackStats = {
        totalLicenses: 0,
        activeLicenses: 0,
        expiredLicenses: 0,
        requestsPending: 0,
        licensesByType: [],
        payments: {
          total_orders: 0,
          paid_orders: 0,
          pending_orders: 0,
          revenue_vnd: 0,
          revenue_30d_vnd: 0,
        },
        dailyRevenue: [],
        revenueByPlan: [],
      };

      const baseStats =
        statsResult.status === "fulfilled" && statsResult.value.data.success
          ? statsResult.value.data.stats
          : fallbackStats;

      const orderStats =
        ordersResult.status === "fulfilled" && ordersResult.value.data.success
          ? buildPaymentStatsFromOrders(ordersResult.value.data.orders || [])
          : {};

      const listCloud =
        tournamentsResult.status === "fulfilled" && tournamentsResult.value.data.success
          ? tournamentsResult.value.data.tournaments || []
          : [];

      setCloudTournaments(listCloud);

      setStats({
        ...baseStats,
        ...orderStats,
      });
    } catch (error) {
      if (!silent) {
        console.error("Failed to fetch stats", error);
      }
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchStats(true);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefreshEnabled]);

  const handleManualRefresh = () => {
    setCountdown(30);
    fetchStats(true);
  };

  const StatCard = ({ title, value, icon: Icon, color, bg, highlight }) => (
    <div
      className={`glass-card flex items-center justify-between relative overflow-hidden ${
        highlight ? "ring-2 ring-red-500/50" : ""
      }`}
    >
      {highlight && (
        <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />
      )}
      <div className="relative">
        <p className="text-slate-400 text-sm mb-1">{title}</p>
        <h3
          className={`text-2xl font-bold ${
            highlight ? "text-red-400" : "text-white"
          }`}
        >
          {value}
        </h3>
      </div>
      <div className={`p-3 rounded-lg ${bg} relative`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
    </div>
  );

  if (loading) return <div className="text-white p-8">Đang tải thống kê...</div>;

  const payments = stats?.payments || {};
  const paidOrders = toNumber(payments.paid_orders);
  const totalOrders = toNumber(payments.total_orders);
  const pendingOrders = toNumber(payments.pending_orders);
  const paymentRate =
    totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 100) : 0;

  const dailyRevenue = (stats?.dailyRevenue || []).map((item) => ({
    ...item,
    revenue_vnd: toNumber(item.revenue_vnd),
    paid_orders: toNumber(item.paid_orders),
  }));

  const revenueByPlan = (stats?.revenueByPlan || []).map((item) => ({
    ...item,
    revenue_vnd: toNumber(item.revenue_vnd),
    count: toNumber(item.count),
  }));

  const totalCloudAthletes = cloudTournaments.reduce(
    (sum, t) => sum + (Number(t.total_athletes) || 0),
    0
  );
  const totalCloudCategories = cloudTournaments.reduce(
    (sum, t) => sum + (Number(t.total_categories) || 0),
    0
  );
  const totalCloudSizeBytes = cloudTournaments.reduce(
    (sum, t) => sum + (Number(t.data_size) || 0),
    0
  );
  const totalCloudStorageMB = (totalCloudSizeBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Tổng Quan</h2>
          <p className="text-slate-400 text-sm mt-1">
            Theo dõi license, đơn hàng, giải đấu Cloud và doanh thu hệ thống.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleAutoRefresh}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition ${
              autoRefreshEnabled
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
            title="Tự động cập nhật số liệu từ VPS mỗi 30 giây"
          >
            <RefreshCw size={14} className={autoRefreshEnabled && refreshing ? "animate-spin text-emerald-400" : ""} />
            {autoRefreshEnabled ? `Tự động (${countdown}s)` : "Tự động: TẮT"}
          </button>

          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition text-xs sm:text-sm font-semibold shadow-lg shadow-blue-600/20"
            title="Cập nhật ngay dữ liệu từ VPS lập tức mà không cần đợi"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Làm mới ngay
          </button>
        </div>
      </div>

      {/* THỐNG KÊ GIẢI ĐẤU CLOUD & VPS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Thống kê Giải đấu Cloud & VPS Storage
            </h3>
            <p className="text-slate-400 text-xs sm:text-sm">
              Dữ liệu lưu trữ các giải đấu Karate từ các máy trạm thi đấu
            </p>
          </div>
          <Link
            to="/tournaments"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-blue-400 hover:text-blue-300 transition"
          >
            Quản lý giải đấu <ArrowRight size={16} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Giải đấu trên Cloud"
            value={cloudTournaments.length}
            icon={Trophy}
            color="text-amber-400"
            bg="bg-amber-500/10"
          />
          <StatCard
            title="Tổng Lượt VĐV"
            value={totalCloudAthletes}
            icon={Users}
            color="text-indigo-400"
            bg="bg-indigo-500/10"
          />
          <StatCard
            title="Hạng mục Thi đấu"
            value={totalCloudCategories}
            icon={Layers}
            color="text-purple-400"
            bg="bg-purple-500/10"
          />
          <StatCard
            title="Dung lượng Storage"
            value={`${totalCloudStorageMB} MB`}
            icon={HardDrive}
            color="text-cyan-400"
            bg="bg-cyan-500/10"
          />
        </div>

        {/* Danh sách & Biểu đồ Giải đấu */}
        {cloudTournaments.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Biểu đồ Quy mô VĐV và Hạng mục */}
              <div className="glass-card p-4 sm:p-5">
                <h4 className="text-base font-semibold text-white mb-4 flex items-center justify-between">
                  <span>Quy mô VĐV & Hạng mục theo Giải</span>
                  <span className="text-xs font-normal text-slate-400">Đơn vị: Người / Hạng mục</span>
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cloudTournaments.map((t) => ({
                      name: t.name.length > 15 ? t.name.slice(0, 13) + "..." : t.name,
                      "Vận động viên": Number(t.total_athletes) || 0,
                      "Hạng mục": Number(t.total_categories) || 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "#e2e8f0" : "#334155"} />
                      <XAxis dataKey="name" stroke={isLight ? "#64748b" : "#94a3b8"} tick={{ fontSize: 12, fill: isLight ? "#475569" : "#94a3b8" }} />
                      <YAxis stroke={isLight ? "#64748b" : "#94a3b8"} tick={{ fill: isLight ? "#475569" : "#94a3b8" }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isLight ? "#ffffff" : "#1e293b",
                          border: isLight ? "1px solid #e2e8f0" : "none",
                          borderRadius: "8px",
                          color: isLight ? "#0f172a" : "#fff",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Legend wrapperStyle={{ paddingTop: "10px" }} />
                      <Bar dataKey="Vận động viên" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Hạng mục" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Biểu đồ Dung lượng VPS Storage */}
              <div className="glass-card p-4 sm:p-5">
                <h4 className="text-base font-semibold text-white mb-4 flex items-center justify-between">
                  <span>Dung lượng VPS Storage theo Giải</span>
                  <span className="text-xs font-normal text-slate-400">Đơn vị: KB</span>
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cloudTournaments.map((t) => ({
                      name: t.name.length > 15 ? t.name.slice(0, 13) + "..." : t.name,
                      "Dung lượng (KB)": Math.round((Number(t.data_size) || 0) / 1024),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "#e2e8f0" : "#334155"} />
                      <XAxis dataKey="name" stroke={isLight ? "#64748b" : "#94a3b8"} tick={{ fontSize: 12, fill: isLight ? "#475569" : "#94a3b8" }} />
                      <YAxis stroke={isLight ? "#64748b" : "#94a3b8"} tick={{ fill: isLight ? "#475569" : "#94a3b8" }} />
                      <Tooltip
                        formatter={(val) => [`${val} KB`, "Dung lượng"]}
                        contentStyle={{
                          backgroundColor: isLight ? "#ffffff" : "#1e293b",
                          border: isLight ? "1px solid #e2e8f0" : "none",
                          borderRadius: "8px",
                          color: isLight ? "#0f172a" : "#fff",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Bar dataKey="Dung lượng (KB)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Danh sách Giải đấu Mới nhất */}
            <div className="glass-card p-4 sm:p-5">
              <h4 className="text-base font-semibold text-white mb-4 flex items-center justify-between">
                <span>Giải đấu vừa đồng bộ mới nhất</span>
                <span className="text-xs font-normal text-slate-400">Hiển thị {Math.min(3, cloudTournaments.length)} giải</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {cloudTournaments.slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2 hover:border-slate-600 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                        Cloud Synced
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {(Number(t.data_size || 0) / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <h5 className="font-semibold text-white text-sm line-clamp-1" title={t.name}>
                      {t.name}
                    </h5>
                    <div className="text-xs text-slate-400 space-y-1">
                      <div className="flex justify-between">
                        <span>VĐV: <strong className="text-slate-200">{t.total_athletes || 0}</strong></span>
                        <span>Hạng mục: <strong className="text-slate-200">{t.total_categories || 0}</strong></span>
                      </div>
                      {t.last_synced_at && (
                        <div className="text-[11px] text-slate-500">
                          Cập nhật: {new Date(t.last_synced_at).toLocaleString('vi-VN')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tổng License"
          value={stats?.totalLicenses}
          icon={Key}
          color="text-blue-500"
          bg="bg-blue-500/10"
        />
        <StatCard
          title="Đang Hoạt Động"
          value={stats?.activeLicenses}
          icon={TrendingUp}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
        />
        <StatCard
          title="Hết Hạn"
          value={stats?.expiredLicenses}
          icon={LogOut}
          color="text-red-500"
          bg="bg-red-500/10"
        />
        <StatCard
          title="Yêu Cầu Chờ Xử Lý"
          value={stats?.requestsPending}
          icon={AlertTriangle}
          color="text-amber-500"
          bg="bg-amber-500/10"
          highlight={stats?.requestsPending > 0}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Tổng Đơn Hàng"
          value={totalOrders}
          icon={ReceiptText}
          color="text-cyan-500"
          bg="bg-cyan-500/10"
        />
        <StatCard
          title="Đơn Đã Thanh Toán"
          value={paidOrders}
          icon={Wallet}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
        />
        <StatCard
          title="Đơn Chờ Xử Lý"
          value={pendingOrders}
          icon={Clock}
          color="text-amber-500"
          bg="bg-amber-500/10"
          highlight={pendingOrders > 0}
        />
        <StatCard
          title="Tỷ Lệ Thanh Toán"
          value={`${paymentRate}%`}
          icon={TrendingUp}
          color="text-violet-500"
          bg="bg-violet-500/10"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="glass-card xl:col-span-2">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Doanh thu 14 ngày
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Tổng doanh thu: {formatVnd(payments.revenue_vnd)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">30 ngày gần đây</div>
              <div className="text-xl font-bold text-emerald-300">
                {formatVnd(payments.revenue_30d_vnd)}
              </div>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyRevenue}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.42} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "#e2e8f0" : "#334155"} />
                <XAxis dataKey="day" stroke={isLight ? "#64748b" : "#94a3b8"} tick={{ fill: isLight ? "#475569" : "#94a3b8" }} />
                <YAxis
                  stroke={isLight ? "#64748b" : "#94a3b8"}
                  tick={{ fill: isLight ? "#475569" : "#94a3b8" }}
                  tickFormatter={(value) => `${Number(value) / 1000}k`}
                />
                <Tooltip
                  formatter={(value, name) =>
                    name === "revenue_vnd"
                      ? [formatVnd(value), "Doanh thu"]
                      : [value, "Đơn đã thanh toán"]
                  }
                  contentStyle={{
                    backgroundColor: isLight ? "#ffffff" : "#1e293b",
                    border: isLight ? "1px solid #e2e8f0" : "none",
                    borderRadius: "8px",
                    color: isLight ? "#0f172a" : "#fff",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue_vnd"
                  stroke="#10b981"
                  strokeWidth={3}
                  fill="url(#revenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card">
          <h3 className="text-lg font-semibold text-white mb-5">
            Doanh thu theo gói
          </h3>
          <div className="space-y-3">
            {revenueByPlan.length === 0 ? (
              <div className="text-slate-500 text-sm text-center py-10">
                Chưa có doanh thu
              </div>
            ) : (
              revenueByPlan.map((plan) => (
                <div
                  key={plan.name}
                  className="rounded-lg border border-slate-700/70 bg-slate-800/40 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-200 truncate">
                      {plan.name}
                    </div>
                    <div className="text-xs text-slate-400">{plan.count} đơn</div>
                  </div>
                  <div className="text-emerald-300 font-bold mt-1">
                    {formatVnd(plan.revenue_vnd)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="glass-card">
        <h3 className="text-lg font-semibold text-white mb-6">
          Phân Bổ License
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.licensesByType || []}>
              <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "#e2e8f0" : "#334155"} />
              <XAxis dataKey="name" stroke={isLight ? "#64748b" : "#94a3b8"} tick={{ fill: isLight ? "#475569" : "#94a3b8" }} />
              <YAxis stroke={isLight ? "#64748b" : "#94a3b8"} tick={{ fill: isLight ? "#475569" : "#94a3b8" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isLight ? "#ffffff" : "#1e293b",
                  border: isLight ? "1px solid #e2e8f0" : "none",
                  borderRadius: "8px",
                  color: isLight ? "#0f172a" : "#fff",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
