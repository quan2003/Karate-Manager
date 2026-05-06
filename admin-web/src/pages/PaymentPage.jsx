import { useEffect, useState } from "react";
import {
  BadgeDollarSign,
  CheckCircle,
  CreditCard,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Edit,
  X,
} from "lucide-react";
import api from "../services/api";

const formatVnd = (value) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const emptySettings = {
  bank_id: "",
  account_no: "",
  account_name: "",
  qr_template: "compact2",
  instructions: "",
  contact_phone: "",
  contact_email: "",
};

export default function PaymentPage() {
  const [plans, setPlans] = useState([]);
  const [settings, setSettings] = useState(emptySettings);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  
  // Edit order state
  const [editingOrder, setEditingOrder] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [planRes, settingsRes, orderRes] = await Promise.all([
        api.get("/admin/pricing"),
        api.get("/admin/payment-settings"),
        api.get("/admin/payment-orders"),
      ]);
      setPlans(planRes.data.plans || []);
      setSettings(settingsRes.data.settings || emptySettings);
      setOrders(orderRes.data.orders || []);
    } catch (error) {
      setMessage("Không tải được cấu hình thanh toán");
    } finally {
      setLoading(false);
    }
  };

  const updatePlan = (index, patch) => {
    setPlans((current) =>
      current.map((plan, i) => (i === index ? { ...plan, ...patch } : plan))
    );
  };

  const addPlan = () => {
    setPlans((current) => [
      ...current,
      {
        id: `plan_${Date.now()}`,
        name: "Gói mới",
        description: "",
        price_vnd: 0,
        license_type: "tournament",
        duration_days: 30,
        max_machines: 1,
        sort_order: current.length + 1,
        is_active: true,
        features: [],
      },
    ]);
  };

  const deletePlan = async (index) => {
    const plan = plans[index];
    if (confirm(`Bạn có chắc chắn muốn xóa gói "${plan.name}" không?`)) {
      try {
        if (!plan.id.startsWith("plan_")) {
          // Existed on backend, call API to delete
          await api.delete(`/admin/pricing/${plan.id}`);
        }
        setPlans((current) => current.filter((_, i) => i !== index));
        setMessage(`Đã xóa gói "${plan.name}"`);
      } catch (error) {
        setMessage(error.response?.data?.message || "Xóa gói thất bại");
      }
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.put("/admin/payment-settings", settings);
      await api.put("/admin/pricing", {
        plans: plans.map((plan) => ({
          ...plan,
          duration_days: Number(plan.duration_days || 30),
          max_machines: Number(plan.max_machines || 1),
          price_vnd: Number(plan.price_vnd || 0),
          sort_order: Number(plan.sort_order || 0),
          features: Array.isArray(plan.features)
            ? plan.features
            : String(plan.features || "")
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
        })),
      });
      setMessage("Đã lưu cấu hình thành công");
      fetchAll();
    } catch (error) {
      setMessage(error.response?.data?.message || "Lưu cấu hình thất bại");
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (orderId) => {
    try {
      await api.post(`/admin/payment-orders/${orderId}/mark-paid`, {});
      setMessage("Đã tạo license cho đơn thanh toán");
      fetchAll();
    } catch (error) {
      setMessage(error.response?.data?.message || "Xử lý đơn thất bại");
    }
  };

  const deleteOrder = async (orderId) => {
    if (confirm("Bạn có chắc chắn muốn xóa đơn thanh toán này không? Dữ liệu không thể khôi phục.")) {
      try {
        await api.delete(`/admin/payment-orders/${orderId}`);
        setMessage("Đã xóa đơn thanh toán");
        fetchAll();
      } catch (error) {
        setMessage(error.response?.data?.message || "Xóa đơn thất bại");
      }
    }
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
      setMessage("Đã cập nhật đơn thanh toán");
      setEditingOrder(null);
      fetchAll();
    } catch (error) {
      setMessage(error.response?.data?.message || "Cập nhật đơn thất bại");
    } finally {
      setSavingOrder(false);
    }
  };

  if (loading) {
    return (
      <div className="text-slate-400 flex items-center gap-2">
        <RefreshCw className="animate-spin" size={18} />
        Đang tải cấu hình thanh toán...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Thanh toán & Bảng giá</h2>
          <p className="text-slate-400 text-sm mt-1">
            Cấu hình giá, tài khoản nhận tiền và duyệt đơn mua license.
          </p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60"
        >
          <Save size={18} />
          {saving ? "Đang lưu..." : "Lưu cấu hình"}
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-200 px-4 py-3 text-sm">
          {message}
        </div>
      )}

      <div className="glass-card">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="text-cyan-400" size={20} />
          <h3 className="text-lg font-semibold text-white">Tài khoản VietQR</h3>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-sm text-slate-400">Mã ngân hàng</span>
            <input
              className="input-field mt-1"
              placeholder="VD: TIMO, VCCB, VCB, MB, TCB"
              value={settings.bank_id || ""}
              onChange={(e) =>
                setSettings({ ...settings, bank_id: e.target.value })
              }
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Số tài khoản</span>
            <input
              className="input-field mt-1"
              value={settings.account_no || ""}
              onChange={(e) =>
                setSettings({ ...settings, account_no: e.target.value })
              }
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Tên chủ tài khoản</span>
            <input
              className="input-field mt-1"
              placeholder="Tên không dấu là tốt nhất"
              value={settings.account_name || ""}
              onChange={(e) =>
                setSettings({ ...settings, account_name: e.target.value })
              }
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Mẫu QR</span>
            <input
              className="input-field mt-1"
              value={settings.qr_template || "compact2"}
              onChange={(e) =>
                setSettings({ ...settings, qr_template: e.target.value })
              }
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Ảnh QR Code (Tùy chọn)</span>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm text-slate-400
                file:mr-4 file:py-1 file:px-3
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-emerald-500/10 file:text-emerald-400
                hover:file:bg-emerald-500/20"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  if (file.size > 5 * 1024 * 1024) {
                    alert("Ảnh quá lớn. Vui lòng chọn ảnh dưới 5MB.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    setSettings({ ...settings, qr_image_url: reader.result });
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
            {settings.qr_image_url && (
              <div className="mt-2 relative inline-block">
                <img src={settings.qr_image_url} alt="QR Preview" className="h-20 rounded border border-slate-700 object-contain bg-white" />
                <button
                  onClick={() => setSettings({ ...settings, qr_image_url: null })}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-lg"
                  title="Xóa ảnh"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Điện thoại/Zalo</span>
            <input
              className="input-field mt-1"
              value={settings.contact_phone || ""}
              onChange={(e) =>
                setSettings({ ...settings, contact_phone: e.target.value })
              }
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Email liên hệ</span>
            <input
              className="input-field mt-1"
              value={settings.contact_email || ""}
              onChange={(e) =>
                setSettings({ ...settings, contact_email: e.target.value })
              }
            />
          </label>
        </div>
        <label className="block mt-4">
          <span className="text-sm text-slate-400">Hướng dẫn thanh toán</span>
          <textarea
            className="input-field mt-1 min-h-[80px]"
            value={settings.instructions || ""}
            onChange={(e) =>
              setSettings({ ...settings, instructions: e.target.value })
            }
          />
        </label>
      </div>

      <div className="flex items-center justify-between mb-4 mt-8">
        <div className="flex items-center gap-2">
          <BadgeDollarSign className="text-emerald-400" size={20} />
          <h3 className="text-lg font-semibold text-white">Gói License</h3>
        </div>
        <button
          onClick={addPlan}
          className="text-emerald-400 hover:text-emerald-300 flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/10"
        >
          <Plus size={16} />
          Thêm gói mới
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {plans.map((plan, index) => (
          <div key={plan.id} className="glass-card relative">
            <div className="absolute top-4 right-4 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={plan.is_active !== false}
                  onChange={(e) =>
                    updatePlan(index, { is_active: e.target.checked })
                  }
                />
                Hiện
              </label>
              <button
                onClick={() => deletePlan(index)}
                className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10"
                title="Xóa gói này"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold text-white pr-20">{plan.name || "Gói chưa đặt tên"}</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="text-sm text-slate-400">Tên gói</span>
                <input
                  className="input-field mt-1"
                  value={plan.name || ""}
                  onChange={(e) => updatePlan(index, { name: e.target.value })}
                />
              </label>
              <label>
                <span className="text-sm text-slate-400">Giá VNĐ</span>
                <input
                  type="number"
                  className="input-field mt-1"
                  value={plan.price_vnd || 0}
                  onChange={(e) =>
                    updatePlan(index, { price_vnd: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                <span className="text-sm text-slate-400">Loại license</span>
                <select
                  className="input-field mt-1"
                  value={plan.license_type}
                  onChange={(e) =>
                    updatePlan(index, { license_type: e.target.value })
                  }
                >
                  <option value="trial">trial</option>
                  <option value="tournament">tournament</option>
                  <option value="yearly">yearly</option>
                </select>
              </label>
              <label>
                <span className="text-sm text-slate-400">Thời hạn (ngày)</span>
                <input
                  type="number"
                  className="input-field mt-1"
                  value={plan.duration_days || 30}
                  onChange={(e) =>
                    updatePlan(index, { duration_days: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                <span className="text-sm text-slate-400">Số máy</span>
                <input
                  type="number"
                  className="input-field mt-1"
                  value={plan.max_machines || 1}
                  onChange={(e) =>
                    updatePlan(index, { max_machines: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                <span className="text-sm text-slate-400">Thứ tự</span>
                <input
                  type="number"
                  className="input-field mt-1"
                  value={plan.sort_order || 0}
                  onChange={(e) =>
                    updatePlan(index, { sort_order: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label className="block mt-3">
              <span className="text-sm text-slate-400">Mô tả</span>
              <input
                className="input-field mt-1"
                value={plan.description || ""}
                onChange={(e) =>
                  updatePlan(index, { description: e.target.value })
                }
              />
            </label>
            <label className="block mt-3">
              <span className="text-sm text-slate-400">Tính năng (mỗi dòng 1 mục)</span>
              <textarea
                className="input-field mt-1 min-h-[120px]"
                value={(plan.features || []).join("\n")}
                onChange={(e) =>
                  updatePlan(index, { features: e.target.value.split("\n") })
                }
              />
            </label>
          </div>
        ))}
        {plans.length === 0 && (
          <div className="glass-card col-span-full py-8 text-center text-slate-400">
            Chưa có gói nào. Vui lòng thêm gói mới.
          </div>
        )}
      </div>

      <div className="glass-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Đơn thanh toán</h3>
          <button
            onClick={fetchAll}
            className="text-slate-300 hover:text-white flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Tải lại
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 border-b border-slate-700">
              <tr>
                <th className="py-3">Mã đơn</th>
                <th>Khách hàng</th>
                <th>Gói</th>
                <th>Số tiền</th>
                <th>Trạng thái</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-slate-800">
                  <td className="py-3 font-mono text-slate-200">
                    {order.order_code}
                  </td>
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
                      <div className="text-xs text-slate-500 mt-1 truncate max-w-[180px]" title={order.license_key}>
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
                        onClick={() => deleteOrder(order.id)}
                        className="inline-flex items-center gap-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded"
                        title="Xóa đơn"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500">
                    Chưa có đơn thanh toán nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Order Modal */}
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
                  onChange={(e) => setEditingOrder({ ...editingOrder, customer_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Điện thoại</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingOrder.customer_phone || ""}
                    onChange={(e) => setEditingOrder({ ...editingOrder, customer_phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingOrder.customer_email || ""}
                    onChange={(e) => setEditingOrder({ ...editingOrder, customer_email: e.target.value })}
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
                    onChange={(e) => setEditingOrder({ ...editingOrder, plan_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Số tiền (VNĐ)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editingOrder.amount_vnd || 0}
                    onChange={(e) => setEditingOrder({ ...editingOrder, amount_vnd: e.target.value })}
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
