import { useEffect, useState } from "react";
import api from "../services/api";
import {
  AlertTriangle,
  Clock,
  Key,
  LogOut,
  ReceiptText,
  TrendingUp,
  Wallet,
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
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [statsResult, ordersResult] = await Promise.allSettled([
        api.get("/stats/dashboard"),
        api.get("/admin/payment-orders"),
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

      setStats({
        ...baseStats,
        ...orderStats,
      });
    } catch (error) {
      if (!silent) {
        console.error("Failed to fetch stats", error);
        setStats({
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
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Tổng Quan</h2>
        <p className="text-slate-400 text-sm mt-1">
          Theo dõi license, đơn hàng và doanh thu thanh toán.
        </p>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis
                  stroke="#94a3b8"
                  tickFormatter={(value) => `${Number(value) / 1000}k`}
                />
                <Tooltip
                  formatter={(value, name) =>
                    name === "revenue_vnd"
                      ? [formatVnd(value), "Doanh thu"]
                      : [value, "Đơn đã thanh toán"]
                  }
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
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
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
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
