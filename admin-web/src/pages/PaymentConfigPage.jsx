import { useEffect, useState } from "react";
import { BadgeDollarSign, CreditCard, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import api from "../services/api";
import { ConfirmModal, Toast } from "../components/Feedback";

const emptySettings = {
  bank_id: "",
  account_no: "",
  account_name: "",
  qr_template: "compact2",
  qr_image_url: "",
  instructions: "",
  contact_phone: "",
  contact_email: "",
};

export default function PaymentConfigPage() {
  const [plans, setPlans] = useState([]);
  const [settings, setSettings] = useState(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false });

  useEffect(() => {
    fetchConfig();
  }, []);

  const showNotify = (message, type = "success") => {
    setNotification({ message, type, key: Date.now() });
  };

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const [planRes, settingsRes] = await Promise.all([
        api.get("/admin/pricing"),
        api.get("/admin/payment-settings"),
      ]);
      setPlans(planRes.data.plans || []);
      setSettings(settingsRes.data.settings || emptySettings);
    } catch (error) {
      showNotify("Không tải được cấu hình thanh toán", "error");
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
    setConfirmModal({
      open: true,
      title: "Xóa gói license",
      message: `Bạn chắc chắn muốn xóa gói "${plan.name}"?`,
      icon: Trash2,
      iconColor: "bg-red-500/20",
      confirmText: "Xóa gói",
      confirmColor: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmModal({ open: false });
        try {
          if (!String(plan.id).startsWith("plan_")) {
            await api.delete(`/admin/pricing/${plan.id}`);
          }
          setPlans((current) => current.filter((_, i) => i !== index));
          showNotify(`Đã xóa gói "${plan.name}"`);
        } catch (error) {
          showNotify(error.response?.data?.message || "Xóa gói thất bại", "error");
        }
      },
    });
  };

  const saveConfig = async () => {
    setSaving(true);
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
      showNotify("Đã lưu cấu hình thành công");
      fetchConfig();
    } catch (error) {
      showNotify(error.response?.data?.message || "Lưu cấu hình thất bại", "error");
    } finally {
      setSaving(false);
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
          <h2 className="text-2xl font-bold text-white">Cấu hình thanh toán</h2>
          <p className="text-slate-400 text-sm mt-1">
            Tài khoản VietQR và các gói license hiển thị cho khách mua.
          </p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60"
        >
          <Save size={18} />
          {saving ? "Đang lưu..." : "Lưu cấu hình"}
        </button>
      </div>

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
              onChange={(e) => setSettings({ ...settings, bank_id: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Số tài khoản</span>
            <input
              className="input-field mt-1"
              value={settings.account_no || ""}
              onChange={(e) => setSettings({ ...settings, account_no: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Tên chủ tài khoản</span>
            <input
              className="input-field mt-1"
              placeholder="Tên không dấu là tốt nhất"
              value={settings.account_name || ""}
              onChange={(e) => setSettings({ ...settings, account_name: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Mẫu QR</span>
            <input
              className="input-field mt-1"
              value={settings.qr_template || "compact2"}
              onChange={(e) => setSettings({ ...settings, qr_template: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Ảnh QR dự phòng</span>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm text-slate-400 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20"
              onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  showNotify("Ảnh quá lớn. Vui lòng chọn ảnh dưới 5MB.", "error");
                  return;
                }
                const reader = new FileReader();
                reader.onloadend = () => {
                  setSettings({ ...settings, qr_image_url: reader.result });
                };
                reader.readAsDataURL(file);
              }}
            />
            {settings.qr_image_url && (
              <div className="mt-2 relative inline-block">
                <img
                  src={settings.qr_image_url}
                  alt="QR Preview"
                  className="h-20 rounded border border-slate-700 object-contain bg-white"
                />
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
              onChange={(e) => setSettings({ ...settings, contact_phone: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Email liên hệ</span>
            <input
              className="input-field mt-1"
              value={settings.contact_email || ""}
              onChange={(e) => setSettings({ ...settings, contact_email: e.target.value })}
            />
          </label>
        </div>
        <label className="block mt-4">
          <span className="text-sm text-slate-400">Hướng dẫn thanh toán</span>
          <textarea
            className="input-field mt-1 min-h-[80px]"
            value={settings.instructions || ""}
            onChange={(e) => setSettings({ ...settings, instructions: e.target.value })}
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
                  onChange={(e) => updatePlan(index, { is_active: e.target.checked })}
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
            <h3 className="text-lg font-semibold text-white pr-20 mb-4">
              {plan.name || "Gói chưa đặt tên"}
            </h3>
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
                  onChange={(e) => updatePlan(index, { price_vnd: Number(e.target.value) })}
                />
              </label>
              <label>
                <span className="text-sm text-slate-400">Loại license</span>
                <select
                  className="input-field mt-1"
                  value={plan.license_type}
                  onChange={(e) => updatePlan(index, { license_type: e.target.value })}
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
                  onChange={(e) => updatePlan(index, { duration_days: Number(e.target.value) })}
                />
              </label>
              <label>
                <span className="text-sm text-slate-400">Số máy</span>
                <input
                  type="number"
                  className="input-field mt-1"
                  value={plan.max_machines || 1}
                  onChange={(e) => updatePlan(index, { max_machines: Number(e.target.value) })}
                />
              </label>
              <label>
                <span className="text-sm text-slate-400">Thứ tự</span>
                <input
                  type="number"
                  className="input-field mt-1"
                  value={plan.sort_order || 0}
                  onChange={(e) => updatePlan(index, { sort_order: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="block mt-3">
              <span className="text-sm text-slate-400">Mô tả</span>
              <input
                className="input-field mt-1"
                value={plan.description || ""}
                onChange={(e) => updatePlan(index, { description: e.target.value })}
              />
            </label>
            <label className="block mt-3">
              <span className="text-sm text-slate-400">Tính năng (mỗi dòng 1 mục)</span>
              <textarea
                className="input-field mt-1 min-h-[120px]"
                value={(plan.features || []).join("\n")}
                onChange={(e) => updatePlan(index, { features: e.target.value.split("\n") })}
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
    </div>
  );
}
