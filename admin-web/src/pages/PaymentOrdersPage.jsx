import { useEffect, useState } from "react";
import {
  CheckCircle,
  Clock,
  DollarSign,
  Edit,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import api from "../services/api";
import { ConfirmModal, Toast } from "../components/Feedback";

const formatVnd = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function PaymentOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false });
  const [editingOrder, setEditingOrder] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    fetchOrders();
  }, []);

  const showNotify = (message, type = "success") => {
    setNotification({ message, type, key: Date.now() });
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/payment-orders");
      setOrders(res.data.orders || []);
    } catch (error) {
      showNotify("Không tải được danh sách đơn hàng", "error");
    } finally {
      setLoading(false);
    }
  };

  const markPaid = async (orderId) => {
    try {
      await api.post(`/admin/payment-orders/${orderId}/mark-paid`, {});
      showNotify("Đã tạo license cho đơn thanh toán");
      fetchOrders();
    } catch (error) {
      showNotify(error.response?.data?.message || "Xử lý đơn thất bại", "error");
    }
  };

  const deleteOrder = (order) => {
    setConfirmModal({
      open: true,
      title: "Xóa đơn thanh toán",
      message: `Bạn chắc chắn muốn xóa đơn ${order.order_code}? Dữ liệu không thể khôi phục.`,
      icon: Trash2,
      iconColor: "bg-red-500/20",
      confirmText: "Xóa đơn",
      confirmColor: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmModal({ open: false });
        try {
          await api.delete(`/admin/payment-orders/${order.id}`);
          showNotify("Đã xóa đơn thanh toán");
          fetchOrders();
        } catch (error) {
          showNotify(error.response?.data?.message || "Xóa đơn thất bại", "error");
        }
      },
    });
  };

  const saveOrderEdit = async () => {
    if (!editingOrder) return;
    setSavingOrder(true);
    try {
      await api.put(`/admin/payment-orders/${editingOrder.id}`, {
        customer_name: editingOrder.customer_name,
        customer_phone: editingOrder.customer_phone,
        customer_email: editingOrder.customer_email,
        amount_vnd: Number(editingOrder.amount_vnd),
        plan_name: editingOrder.plan_name,
        note: editingOrder.note,
      });
      showNotify("Đã cập nhật đơn thanh toán");
      setEditingOrder(null);
      fetchOrders();
    } catch (error) {
      showNotify(error.response?.data?.message || "Cập nhật đơn thất bại", "error");
    } finally {
      setSavingOrder(false);
    }
  };

  const formatDateTime = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredOrders = orders.filter((order) => {
    const keyword = search.trim().toLowerCase();
    const matchesSearch =
      !keyword ||
      order.order_code?.toLowerCase().includes(keyword) ||
      order.customer_name?.toLowerCase().includes(keyword) ||
      order.customer_phone?.toLowerCase().includes(keyword) ||
      order.customer_email?.toLowerCase().includes(keyword) ||
      order.plan_name?.toLowerCase().includes(keyword);

    const matchesStatus =
      statusFilter === "all" || order.status === statusFilter;

    const createdAt = order.created_at ? new Date(order.created_at) : null;
    const fromOk =
      !dateFrom || (createdAt && createdAt >= new Date(`${dateFrom}T00:00:00`));
    const toOk =
      !dateTo || (createdAt && createdAt <= new Date(`${dateTo}T23:59:59`));

    return matchesSearch && matchesStatus && fromOk && toOk;
  });

  const buildStats = (items) => {
    const paidOrders = items.filter((order) => order.status === "paid");
    const pendingOrders = items.filter((order) => order.status !== "paid");
    return {
      total: items.length,
      paid: paidOrders.length,
      pending: pendingOrders.length,
      revenue: paidOrders.reduce(
        (sum, order) => sum + Number(order.amount_vnd || 0),
        0
      ),
    };
  };

  const allStats = buildStats(orders);
  const filteredStats = buildStats(filteredOrders);

  const statCards = [
    {
      label: "Tổng đơn",
      value: allStats.total,
      sub: `${filteredStats.total} đang hiển thị`,
      icon: ReceiptText,
      color: "text-blue-300",
      bg: "bg-blue-500/10",
    },
    {
      label: "Đã thanh toán",
      value: allStats.paid,
      sub: `${filteredStats.paid} trong bộ lọc`,
      icon: CheckCircle,
      color: "text-emerald-300",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Chờ xử lý",
      value: allStats.pending,
      sub: `${filteredStats.pending} trong bộ lọc`,
      icon: Clock,
      color: "text-amber-300",
      bg: "bg-amber-500/10",
    },
    {
      label: "Doanh thu",
      value: formatVnd(allStats.revenue),
      sub: `Bộ lọc: ${formatVnd(filteredStats.revenue)}`,
      icon: DollarSign,
      color: "text-cyan-300",
      bg: "bg-cyan-500/10",
    },
  ];

  if (loading) {
    return (
      <div className="text-slate-400 flex items-center gap-2">
        <RefreshCw className="animate-spin" size={18} />
        Đang tải đơn hàng...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toast
        notification={notification}
        onClose={() => setNotification(null)}
      />
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

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Quản lý đơn hàng</h2>
          <p className="text-slate-400 text-sm mt-1">
            Duyệt thanh toán, tạo license và chỉnh sửa đơn mua.
          </p>
        </div>
        <button
          onClick={fetchOrders}
          className="text-slate-300 hover:text-white flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800"
        >
          <RefreshCw size={16} />
          Tải lại
        </button>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="glass-card flex items-center gap-4">
            <div
              className={`w-11 h-11 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color}`}
            >
              <stat.icon size={22} />
            </div>
            <div>
              <div className="text-sm text-slate-400">{stat.label}</div>
              <div className="text-xl font-bold text-white mt-0.5">
                {stat.value}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{stat.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card">
        <div className="grid lg:grid-cols-[1fr_180px_170px_170px_auto] gap-3 items-end">
          <label className="block">
            <span className="text-sm text-slate-400">Tìm kiếm</span>
            <div className="relative mt-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={16}
              />
              <input
                className="input-field mb-0 pl-10"
                placeholder="Mã đơn, khách hàng, SĐT, email, gói..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Trạng thái</span>
            <select
              className="input-field mt-1 mb-0"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Tất cả</option>
              <option value="pending">Chờ thanh toán</option>
              <option value="paid">Đã nhận tiền</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Từ ngày</span>
            <input
              type="date"
              className="input-field mt-1 mb-0"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Đến ngày</span>
            <input
              type="date"
              className="input-field mt-1 mb-0"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setDateFrom("");
              setDateTo("");
            }}
            className="px-3 py-3 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Xóa lọc
          </button>
        </div>
      </div>

      <div className="glass-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 border-b border-slate-700">
              <tr>
                <th className="py-3">Mã đơn</th>
                <th>Khách hàng</th>
                <th>Gói</th>
                <th>Số tiền</th>
                <th>Ngày mua</th>
                <th>Trạng thái</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-slate-800">
                  <td className="py-3 font-mono text-slate-200">{order.order_code}</td>
                  <td className="text-slate-300">
                    <div>{order.customer_name || "Khách lẻ"}</div>
                    <div className="text-xs text-slate-500">
                      {order.customer_phone || order.customer_email}
                    </div>
                  </td>
                  <td className="text-slate-300">{order.plan_name}</td>
                  <td className="text-emerald-300 font-semibold">
                    {formatVnd(order.amount_vnd)}
                  </td>
                  <td className="text-slate-400 text-xs">
                    {formatDateTime(order.created_at)}
                  </td>
                  <td>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        order.status === "paid"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {order.status === "paid" ? "Đã nhận tiền" : order.status}
                    </span>
                    {order.license_key && (
                      <div
                        className="text-xs text-slate-500 mt-1 truncate max-w-[180px]"
                        title={order.license_key}
                      >
                        {order.license_key}
                      </div>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      {order.status !== "paid" && (
                        <button
                          onClick={() => markPaid(order.id)}
                          className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded"
                          title="Đã nhận tiền"
                        >
                          <CheckCircle size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => setEditingOrder(order)}
                        className="inline-flex items-center gap-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2 py-1 rounded"
                        title="Sửa đơn"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => deleteOrder(order)}
                        className="inline-flex items-center gap-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded"
                        title="Xóa đơn"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500">
                    Chưa có đơn thanh toán nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingOrder && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800/50">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Edit size={18} className="text-blue-400" />
                Sửa đơn thanh toán: {editingOrder.order_code}
              </h3>
              <button
                onClick={() => setEditingOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Khách hàng</label>
                <input
                  type="text"
                  className="input-field"
                  value={editingOrder.customer_name || ""}
                  onChange={(e) =>
                    setEditingOrder({ ...editingOrder, customer_name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Điện thoại</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingOrder.customer_phone || ""}
                    onChange={(e) =>
                      setEditingOrder({ ...editingOrder, customer_phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingOrder.customer_email || ""}
                    onChange={(e) =>
                      setEditingOrder({ ...editingOrder, customer_email: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Tên gói</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingOrder.plan_name || ""}
                    onChange={(e) =>
                      setEditingOrder({ ...editingOrder, plan_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Số tiền (VNĐ)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editingOrder.amount_vnd || 0}
                    onChange={(e) =>
                      setEditingOrder({ ...editingOrder, amount_vnd: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Ghi chú</label>
                <textarea
                  className="input-field min-h-[80px]"
                  value={editingOrder.note || ""}
                  onChange={(e) => setEditingOrder({ ...editingOrder, note: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700 bg-slate-800/50">
              <button
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 text-slate-300 hover:text-white"
              >
                Hủy
              </button>
              <button
                onClick={saveOrderEdit}
                disabled={savingOrder}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60"
              >
                <Save size={16} />
                {savingOrder ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
