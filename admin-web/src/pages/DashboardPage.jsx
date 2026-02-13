import { useEffect, useState } from "react";
import api from "../services/api";
import { Users, Key, AlertTriangle, TrendingUp, LogOut } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get("/stats/dashboard");
      if (res.data.success) {
        setStats(res.data.stats);
      }
    } catch (error) {
      console.error("Failed to fetch stats", error);
      if (!silent) {
        // Dummy data for visual check
        setStats({
          totalLicenses: 0,
          activeLicenses: 0,
          expiredLicenses: 0,
          requestsPending: 0,
          licensesByType: [],
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => fetchStats(true), 30000);
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
          {highlight && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[24px] h-6 bg-red-600 text-white text-xs font-bold rounded-full px-1.5 animate-pulse shadow-lg shadow-red-500/50">
              {value}
            </span>
          )}
        </h3>
      </div>
      <div className={`p-3 rounded-lg ${bg} relative`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
    </div>
  );

  if (loading) return <div className="text-white p-8">Loading stats...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Tổng Quan</h2>

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

      <div className="glass-card">
        <h3 className="text-lg font-semibold text-white mb-6">
          Phân Bổ License
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.licensesByType}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "none",
                  borderRadius: "8px",
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
