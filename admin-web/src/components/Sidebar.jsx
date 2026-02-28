import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Key,
  Users,
  MessageSquare,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../services/auth";
import api from "../services/api";

export default function Sidebar() {
  const { logout, user } = useAuth();
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
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, []);
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Key, label: "Licenses", path: "/licenses" },
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
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span>🥋</span> Karate Admin
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

          <div className="pt-6 border-t border-slate-800">
            <div className="flex items-center gap-3 mb-4 px-2">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt="User"
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                  {(user?.name || user?.username || 'A').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || user?.username}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {user?.email || (user?.loginType === 'account' ? `@${user?.username}` : '')}
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
