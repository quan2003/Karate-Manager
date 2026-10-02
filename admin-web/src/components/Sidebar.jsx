import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Key,
  Trophy,
  Users,
  MessageSquare,
  ReceiptText,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../services/auth";
import { useTheme } from "../services/theme";
import api from "../services/api";

export default function Sidebar() {
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);

  const toggleSidebar = () => setIsOpen(!isOpen);

  // Poll pending request count every 30 seconds
  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const res = await api.get("/license/requests/pending-count");
        if (res.data.success) {
          setPendingRequests(res.data.count);
        }
      } catch (e) {
        // silently fail
      }
    };
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, []);
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Key, label: "Licenses", path: "/licenses" },
    { icon: Trophy, label: "Giải đấu & Storage", path: "/tournaments" },
    { icon: ReceiptText, label: "Đơn hàng", path: "/payment-orders" },
    { icon: Settings, label: "VietQR & Gói", path: "/payment-config" },
    { icon: Users, label: "Admin Users", path: "/users" },
    {
      icon: MessageSquare,
      label: "Support Requests",
      path: "/requests",
      badge: pendingRequests,
    },
  ];

  return (
    <>
      {/* Mobile Toggle */}
      <div className="md:hidden fixed top-4 right-4 z-50">
        <button
          onClick={toggleSidebar}
          className="p-2 bg-slate-800 rounded-lg text-white"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-slate-900 border-r border-slate-800 transform transition-transform duration-300 z-40 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full p-6">
          <div className="mb-8">
            {" "}
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <img
                src="/icon.png"
                alt=""
                style={{
                  width: 28,
                  height: 28,
                  objectFit: "contain",
                  filter: "brightness(0) invert(1)",
                }}
              />
              Karate Admin
            </h1>
            <p className="text-xs text-slate-500 mt-1">v1.1.0</p>
          </div>

          <nav className="flex-1 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors relative ${
                    isActive
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`
                }
              >
                {" "}
                <item.icon size={20} />
                <span className="font-medium flex-1">{item.label}</span>
                {item.badge > 0 && (
                  <span className="min-w-[22px] h-[22px] flex items-center justify-center bg-red-600 text-white text-xs font-bold rounded-full px-1.5 shadow-lg shadow-red-500/50 ring-2 ring-red-400/30 animate-pulse">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="pt-4 border-t border-slate-800">
            {/* Theme Switcher Toggle */}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between px-3.5 py-2.5 mb-4 rounded-xl text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 transition border border-slate-700/60 text-xs font-semibold"
              title="Chuyển đổi giao diện Sáng / Tối"
            >
              <div className="flex items-center gap-2.5">
                {theme === "dark" ? (
                  <Moon size={16} className="text-blue-400" />
                ) : (
                  <Sun size={16} className="text-amber-400" />
                )}
                <span>{theme === "dark" ? "Giao diện Tối" : "Giao diện Sáng"}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${
                theme === "dark" ? "bg-slate-700 text-slate-300" : "bg-amber-500/20 text-amber-600"
              }`}>
                {theme === "dark" ? "DARK" : "LIGHT"}
              </span>
            </button>

            <div className="flex items-center gap-3 mb-4 px-2">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt="User"
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                  {(user?.name || user?.username || "A")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || user?.username}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {user?.email ||
                    (user?.loginType === "account" ? `@${user?.username}` : "")}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <LogOut size={20} />
              <span className="font-medium">Đăng xuất</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
