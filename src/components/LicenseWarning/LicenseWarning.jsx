import { useEffect, useState, useRef } from "react";
import {
  activateLicense,
  createPaymentOrder,
  getPaymentOrderStatus,
  getPublicPricing,
  importLicenseFile,
  generateMachineId,
} from "../../services/licenseService";
import "./LicenseWarning.css";

function LicenseToast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 3200);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className={`license-toast license-toast-${toast.type || "success"}`}>
      <div className="license-toast-icon">
        {toast.type === "error" ? "!" : "✓"}
      </div>
      <div className="license-toast-message">{toast.message}</div>
      <button className="license-toast-close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

function PurchaseDialog({
  plans,
  selectedPlanId,
  setSelectedPlanId,
  purchaseLoading,
  buyerInfo,
  setBuyerInfo,
  paymentError,
  handleCreateOrder,
  paymentOrder,
  paidLicenseKey,
  machineId,
  checkingOrder,
  handleCheckPayment,
  handleManualActivate,
  formatVnd,
  onClose,
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10001,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(860px, 100%)",
          maxHeight: "88vh",
          overflow: "auto",
          background: "#ffffff",
          color: "#0f172a",
          borderRadius: 12,
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
          padding: "1.25rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "1.2rem" }}>
              Mua License K-SPORT
            </h3>
            <p style={{ margin: "0.25rem 0 0", color: "#64748b" }}>
              Chọn gói, tạo mã QR và chuyển khoản đúng nội dung đơn hàng.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#fff",
              cursor: "pointer",
              fontSize: 20,
            }}
          >
            ×
          </button>
        </div>

        {!paymentOrder ? (
          <>
            {purchaseLoading && plans.length === 0 ? (
              <div style={{ color: "#64748b" }}>Đang tải bảng giá...</div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    style={{
                      textAlign: "left",
                      border:
                        selectedPlanId === plan.id
                          ? "2px solid #2563eb"
                          : "1px solid #dbe3ef",
                      background:
                        selectedPlanId === plan.id ? "#eff6ff" : "#fff",
                      borderRadius: 10,
                      padding: "1rem",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      {plan.name}
                    </div>
                    <div
                      style={{
                        color: "#0d5bd7",
                        fontWeight: 800,
                        fontSize: "1.4rem",
                        marginBottom: 8,
                      }}
                    >
                      {formatVnd(plan.price_vnd)}
                    </div>
                    <div style={{ color: "#64748b", fontSize: "0.85rem" }}>
                      {plan.duration_days} ngày • {plan.max_machines} máy
                    </div>
                    <ul
                      style={{
                        margin: "0.75rem 0 0",
                        paddingLeft: "1.1rem",
                        color: "#334155",
                        fontSize: "0.85rem",
                      }}
                    >
                      {(plan.features || []).slice(0, 5).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.75rem",
                marginTop: "1rem",
              }}
            >
              <input
                placeholder="Tên khách hàng / CLB"
                value={buyerInfo.customerName}
                onChange={(e) =>
                  setBuyerInfo({ ...buyerInfo, customerName: e.target.value })
                }
                style={{
                  padding: "0.7rem",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                }}
              />
              <input
                placeholder="SĐT / Zalo"
                value={buyerInfo.customerPhone}
                onChange={(e) =>
                  setBuyerInfo({ ...buyerInfo, customerPhone: e.target.value })
                }
                style={{
                  padding: "0.7rem",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                }}
              />
              <input
                placeholder="Email"
                value={buyerInfo.customerEmail}
                onChange={(e) =>
                  setBuyerInfo({ ...buyerInfo, customerEmail: e.target.value })
                }
                style={{
                  padding: "0.7rem",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                }}
              />
            </div>

            <div style={{ marginTop: "0.75rem" }}>
              <label
                style={{
                  display: "block",
                  color: "#64748b",
                  fontSize: "0.85rem",
                  marginBottom: "0.35rem",
                }}
              >
                ID Máy tính
              </label>
              <input
                readOnly
                value={machineId}
                onClick={(e) => e.target.select()}
                style={{
                  width: "100%",
                  padding: "0.7rem",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  color: "#334155",
                  fontFamily: "monospace",
                  fontWeight: 700,
                  cursor: "text",
                }}
              />
            </div>

            {paymentError && (
              <div
                style={{
                  marginTop: "0.75rem",
                  color: "#b91c1c",
                  background: "#fee2e2",
                  borderRadius: 8,
                  padding: "0.65rem",
                }}
              >
                {paymentError}
              </div>
            )}

            <button
              onClick={handleCreateOrder}
              disabled={purchaseLoading || !selectedPlanId}
              style={{
                width: "100%",
                marginTop: "1rem",
                padding: "0.85rem 1rem",
                background: "#2563eb",
                color: "#fff",
                border: 0,
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                opacity: purchaseLoading ? 0.7 : 1,
              }}
            >
              {purchaseLoading ? "Đang tạo đơn..." : "Tiếp tục"}
            </button>
          </>
        ) : paidLicenseKey ? (
          <div
            style={{
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              borderRadius: 12,
              padding: "1rem",
            }}
          >
            <div style={{ fontWeight: 800, color: "#166534" }}>
              Đơn hàng đã được xác nhận
            </div>
            <div style={{ color: "#64748b", fontSize: "0.9rem" }}>
              Mã đơn {paymentOrder.order.order_code} đã có license.
            </div>
            <code
              style={{
                display: "block",
                margin: "0.75rem 0",
                padding: "0.75rem",
                background: "#fff",
                border: "1px solid #dcfce7",
                borderRadius: 10,
                wordBreak: "break-all",
              }}
            >
              {paidLicenseKey}
            </code>
            <button
              onClick={handleManualActivate}
              style={{
                width: "100%",
                padding: "0.85rem 1rem",
                background: "#10b981",
                color: "#fff",
                border: 0,
                borderRadius: 10,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Kích hoạt license
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 320px) 1fr",
              gap: "1rem",
              alignItems: "start",
            }}
          >
            <div
              style={{
                border: "1px solid #dbe3ef",
                borderRadius: 12,
                padding: "0.75rem",
                textAlign: "center",
              }}
            >
              {paymentOrder.qrUrl ? (
                <img
                  src={paymentOrder.qrUrl}
                  alt="VietQR"
                  style={{ width: "100%", borderRadius: 8 }}
                />
              ) : (
                <div style={{ color: "#b91c1c", padding: "2rem 0" }}>
                  Admin chưa cấu hình tài khoản VietQR.
                </div>
              )}
            </div>
            <div>
              <div style={{ color: "#64748b", fontSize: "0.9rem" }}>
                Mã đơn hàng
              </div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "1.5rem",
                  letterSpacing: 1,
                  marginBottom: "0.75rem",
                }}
              >
                {paymentOrder.order.order_code}
              </div>
              <div style={{ color: "#64748b", fontSize: "0.9rem" }}>
                Số tiền
              </div>
              <div
                style={{
                  fontWeight: 800,
                  color: "#0d5bd7",
                  fontSize: "1.5rem",
                  marginBottom: "0.75rem",
                }}
              >
                {formatVnd(paymentOrder.order.amount_vnd)}
              </div>
              <div
                style={{
                  background: "#f1f5f9",
                  borderRadius: 10,
                  padding: "0.75rem",
                  color: "#334155",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                }}
              >
                Chuyển khoản đúng số tiền và nội dung{" "}
                <strong>{paymentOrder.order.order_code}</strong>. Sau khi admin
                xác nhận, license sẽ được cấp và gửi lại cho bạn.
              </div>
              {paymentError && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    color: "#b91c1c",
                    background: "#fee2e2",
                    borderRadius: 8,
                    padding: "0.65rem",
                  }}
                >
                  {paymentError}
                </div>
              )}
              <button
                onClick={handleCheckPayment}
                disabled={checkingOrder}
                style={{
                  width: "100%",
                  marginTop: "0.75rem",
                  padding: "0.85rem 1rem",
                  background: "#10b981",
                  color: "#fff",
                  border: 0,
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: checkingOrder ? 0.7 : 1,
                }}
              >
                {checkingOrder ? "Đang kiểm tra..." : "Kiểm tra thanh toán"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LicenseWarning({
  type,
  onCancel,
  onSuccess,
  purchaseOnly = false,
}) {
  const fileInputRef = useRef(null);
  const machineId = generateMachineId();
  const [manualKey, setManualKey] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const machineIdInputRef = useRef(null);
  const [showPurchase, setShowPurchase] = useState(purchaseOnly);
  const [plans, setPlans] = useState([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [buyerInfo, setBuyerInfo] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
  });
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [checkingOrder, setCheckingOrder] = useState(false);
  const [paidLicenseKey, setPaidLicenseKey] = useState("");
  const [toast, setToast] = useState(null);
  const pendingPaymentKey = `krt_pending_payment_order_${machineId}`;

  const showToast = (message, toastType = "success") => {
    setToast({ message, type: toastType, key: Date.now() });
  };

  const savePendingPayment = (payload) => {
    localStorage.setItem(
      pendingPaymentKey,
      JSON.stringify({ ...payload, savedAt: new Date().toISOString() })
    );
  };

  const loadPendingPayment = () => {
    try {
      const saved = localStorage.getItem(pendingPaymentKey);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      localStorage.removeItem(pendingPaymentKey);
      return null;
    }
  };

  const clearPendingPayment = () => {
    localStorage.removeItem(pendingPaymentKey);
  };

  useEffect(() => {
    if (!showPurchase) return;
    let mounted = true;
    setPurchaseLoading(true);
    getPublicPricing().then((result) => {
      if (!mounted) return;
      if (result.success) {
        const loadedPlans = result.plans || [];
        setPlans(loadedPlans);
        setSelectedPlanId(loadedPlans[0]?.id || "");
      } else {
        const message = result.message || "Không tải được bảng giá";
        setPaymentError(message);
        showToast(message, "error");
      }
      setPurchaseLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [showPurchase]);

  // Copy to clipboard function - works in both Electron and browser
  const handleCopyMachineId = async () => {
    try {
      // Try Electron API first
      if (window.electronAPI?.copyToClipboard) {
        await window.electronAPI.copyToClipboard(machineId);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        return;
      }

      // Try navigator.clipboard (may fail in some contexts)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(machineId);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        return;
      }

      // Fallback: Select text for manual copy
      if (machineIdInputRef.current) {
        machineIdInputRef.current.select();
        document.execCommand("copy");
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        return;
      }

      throw new Error("No copy method available");
    } catch (err) {
      console.error("Copy failed:", err);
      // Select text so user can Ctrl+C
      if (machineIdInputRef.current) {
        machineIdInputRef.current.select();
        showToast("Vui lòng nhấn Ctrl+C để copy!", "error");
      } else {
        showToast("Không thể copy. Vui lòng copy thủ công.", "error");
      }
    }
  };

  const handleManualActivate = async () => {
    if (!manualKey.trim()) {
      showToast("Vui lòng nhập License Key!", "error");
      return;
    }

    try {
      const result = await activateLicense(manualKey.trim(), machineId);

      if (result.valid) {
        showToast("Kích hoạt bản quyền thành công!");
        clearPendingPayment();
        if (onSuccess) setTimeout(onSuccess, 700);
      } else {
        showToast(`Lỗi kích hoạt: ${result.error || "Key không hợp lệ"}`, "error");
      }
    } catch (err) {
      showToast(`Lỗi hệ thống: ${err.message}`, "error");
    }
  };

  const handleInstallClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await importLicenseFile(file);
      if (imported.valid) {
          // importLicenseFile already calls activateLicense internally in new version? 
          // Check licenseService implementation. 
          // Based on previous view, importLicenseFile calls activateLicense internally and returns result.
          // let's double check importLicenseFile implementation in licenseService.js
          // Yes, importLicenseFile calls activateLicense. So imported IS the result.
           showToast("Cài đặt bản quyền thành công!");
           if (onSuccess) setTimeout(onSuccess, 700);
      } else {
           showToast(`Lỗi kích hoạt: ${imported.error}`, "error");
      }
    } catch (err) {
      showToast(`Lỗi đọc file: ${err.message}`, "error");
    }

    // Reset input
    e.target.value = null;
  };

  const handleBuyClick = () => {
    setShowPurchase(true);
    setPaymentError("");
    const saved = loadPendingPayment();
    if (saved?.paymentOrder) {
      setPaymentOrder(saved.paymentOrder);
      if (saved.licenseKey) {
        setPaidLicenseKey(saved.licenseKey);
        setManualKey(saved.licenseKey);
        showToast("Đã có license. Bấm Kích hoạt để hoàn tất.");
      } else {
        checkPaymentStatus(saved.paymentOrder, { restored: true });
      }
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedPlanId) {
      setPaymentError("Vui lòng chọn gói");
      showToast("Vui lòng chọn gói", "error");
      return;
    }
    setPaymentError("");
    setPurchaseLoading(true);
    const result = await createPaymentOrder({
      planId: selectedPlanId,
      machineId,
      ...buyerInfo,
    });
    if (result.success) {
      setPaymentOrder(result);
      setPaidLicenseKey("");
      savePendingPayment({ paymentOrder: result });
      showToast("Đã tạo mã QR thanh toán");
    } else {
      const message = result.message || "Không thể tạo đơn thanh toán";
      setPaymentError(message);
      showToast(message, "error");
    }
    setPurchaseLoading(false);
  };

  const formatVnd = (value) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const checkPaymentStatus = async (orderPayload, options = {}) => {
    if (!orderPayload?.order?.order_code) return;
    setCheckingOrder(true);
    setPaymentError("");
    const result = await getPaymentOrderStatus(
      orderPayload.order.order_code,
      machineId
    );
    if (result.success && result.order?.status === "paid") {
      const paidKey = result.order.license_key;
      if (paidKey) {
        setManualKey(paidKey);
        setPaidLicenseKey(paidKey);
        savePendingPayment({ paymentOrder: orderPayload, licenseKey: paidKey });
        showToast("Đã nhận license. Bấm Kích hoạt để hoàn tất.");
      } else {
        const message = "Đơn đã thanh toán nhưng chưa có license key.";
        setPaymentError(message);
        showToast(message, "error");
      }
    } else if (result.success) {
      const message = "Đơn chưa được admin xác nhận thanh toán.";
      setPaymentError(message);
      if (!options.restored) showToast(message, "error");
    } else {
      const message = result.message || "Không kiểm tra được thanh toán";
      setPaymentError(message);
      showToast(message, "error");
    }
    setCheckingOrder(false);
  };

  const handleCheckPayment = async () => {
    await checkPaymentStatus(paymentOrder);
  };

  const handleRequestClick = () => {
    // Generate mailto link
    const subject = encodeURIComponent("Yêu cầu bản quyền sự kiện Online");
    const body = encodeURIComponent(
      `Xin chào,\n\nTôi muốn yêu cầu bản quyền cho sự kiện của mình.\nMachine ID của tôi là: ${machineId}`
    );
    window.open(
      `mailto:luuquankarate@gmail.com?subject=${subject}&body=${body}`,
      "_blank"
    );
  };

  return (
    <div className="license-warning-overlay">
      <LicenseToast toast={toast} onClose={() => setToast(null)} />
      {!purchaseOnly && (
      <div className="license-warning-container">
        {/* Header */}
        <div className="license-warning-header">
          <h3 className="license-warning-title">Chú ý!</h3>
          <button className="license-warning-close" onClick={onCancel}>
            ×
          </button>
        </div>

        {/* Body */}
        <div className="license-warning-body">
          <div className="license-warning-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z"
                fill="#3b82f6"
              />
            </svg>
          </div>
          <div className="license-warning-content" style={{ flex: 1 }}>
            <div className="license-warning-message">
              {type === "expired" ? (
                <p>
                  <strong>License của bạn đã hết hạn.</strong>
                  <br />
                  Vui lòng cài đặt license mới để tiếp tục sử dụng đầy đủ tính
                  năng.
                  <br />
                </p>
              ) : (
                <p>
                  Chưa có bản quyền hợp lệ được cài đặt. <br />
                  Nếu không cài đặt, phần mềm sẽ chạy ở chế độ{" "}
                  <strong>DEMO (Dùng thử 3 ngày)</strong>.
                </p>
              )}
            </div>
            <div
              className="machine-id-box"
              style={{
                marginTop: "1rem",
                background: "#e2e8f0",
                padding: "0.75rem",
                borderRadius: "4px",
              }}
            >
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "#64748b",
                  marginBottom: "0.25rem",
                }}
              >
                ID Máy tính của bạn:
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  ref={machineIdInputRef}
                  type="text"
                  readOnly
                  value={machineId}
                  onClick={(e) => e.target.select()}
                  style={{
                    flex: 1,
                    background: "#fff",
                    padding: "0.25rem 0.5rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    fontWeight: "bold",
                    fontSize: "0.9rem",
                    cursor: "text",
                  }}
                />
                <button
                  onClick={handleCopyMachineId}
                  style={{
                    cursor: "pointer",
                    padding: "0 0.75rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    background: copySuccess ? "#10b981" : "#fff",
                    color: copySuccess ? "#fff" : "inherit",
                    transition: "all 0.2s",
                    fontSize: "1rem",
                  }}
                  title="Copy ID"
                >
                  {copySuccess ? "✓" : "📋"}
                </button>
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginTop: "0.25rem",
                  fontStyle: "italic",
                }}
              >
                * Cung cấp ID này cho nhà cung cấp để nhận Key kích hoạt riêng
                cho máy này.
              </div>
            </div>

            {/* Manual Key Input */}
            <div style={{ marginTop: "1rem" }}>
              <div
                style={{
                  fontSize: "0.9rem",
                  fontWeight: "500",
                  marginBottom: "0.5rem",
                }}
              >
                Nhập mã License Key:
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  placeholder="Dán mã key vào đây..."
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                />
                <button
                  onClick={handleManualActivate}
                  style={{
                    padding: "0 1rem",
                    background: "#10b981",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Kích hoạt
                </button>
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginTop: "0.25rem",
                  fontStyle: "italic",
                }}
              >
                * Nếu Key có khóa theo ID máy, ID phải trùng khớp với ID máy bên
                trên.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="license-warning-footer">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".lic"
            onChange={handleFileChange}
          />

          <button
            className="license-btn btn-primary-install"
            onClick={handleInstallClick}
          >
            Mở file License (.lic)
          </button>

          <div style={{ flex: 1 }}></div>

          <button className="license-btn" onClick={handleBuyClick}>
            Mua License mới
          </button>
          <button className="license-btn btn-cancel" onClick={onCancel}>
            Để sau
          </button>
        </div>

        {showPurchase && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.72)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10001,
              padding: "1rem",
            }}
            onClick={() => setShowPurchase(false)}
          >
            <div
              style={{
                width: "min(720px, 100%)",
                maxHeight: "88vh",
                overflow: "auto",
                background: "#ffffff",
                color: "#0f172a",
                borderRadius: 12,
                boxShadow: "0 24px 80px rgba(15, 23, 42, 0.35)",
                padding: "1.25rem",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.2rem" }}>
                    Mua License K-SPORT
                  </h3>
                  <p style={{ margin: "0.25rem 0 0", color: "#64748b" }}>
                    Chọn gói, tạo mã QR và chuyển khoản đúng nội dung đơn hàng.
                  </p>
                </div>
                <button
                  onClick={() => setShowPurchase(false)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 20,
                  }}
                >
                  ×
                </button>
              </div>

              {!paymentOrder ? (
                <>
                  {purchaseLoading && plans.length === 0 ? (
                    <div style={{ color: "#64748b" }}>Đang tải bảng giá...</div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "0.75rem",
                      }}
                    >
                      {plans.map((plan) => (
                        <button
                          key={plan.id}
                          onClick={() => setSelectedPlanId(plan.id)}
                          style={{
                            textAlign: "left",
                            border:
                              selectedPlanId === plan.id
                                ? "2px solid #2563eb"
                                : "1px solid #dbe3ef",
                            background:
                              selectedPlanId === plan.id ? "#eff6ff" : "#fff",
                            borderRadius: 10,
                            padding: "1rem",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>
                            {plan.name}
                          </div>
                          <div
                            style={{
                              color: "#0d5bd7",
                              fontWeight: 800,
                              fontSize: "1.4rem",
                              marginBottom: 8,
                            }}
                          >
                            {formatVnd(plan.price_vnd)}
                          </div>
                          <div style={{ color: "#64748b", fontSize: "0.85rem" }}>
                            {plan.duration_days} ngày • {plan.max_machines} máy
                          </div>
                          <ul
                            style={{
                              margin: "0.75rem 0 0",
                              paddingLeft: "1.1rem",
                              color: "#334155",
                              fontSize: "0.85rem",
                            }}
                          >
                            {(plan.features || []).slice(0, 5).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </button>
                      ))}
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "0.75rem",
                      marginTop: "1rem",
                    }}
                  >
                    <input
                      placeholder="Tên khách hàng / CLB"
                      value={buyerInfo.customerName}
                      onChange={(e) =>
                        setBuyerInfo({
                          ...buyerInfo,
                          customerName: e.target.value,
                        })
                      }
                      style={{
                        padding: "0.7rem",
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                    <input
                      placeholder="SĐT / Zalo"
                      value={buyerInfo.customerPhone}
                      onChange={(e) =>
                        setBuyerInfo({
                          ...buyerInfo,
                          customerPhone: e.target.value,
                        })
                      }
                      style={{
                        padding: "0.7rem",
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                    <input
                      placeholder="Email"
                      value={buyerInfo.customerEmail}
                      onChange={(e) =>
                        setBuyerInfo({
                          ...buyerInfo,
                          customerEmail: e.target.value,
                        })
                      }
                      style={{
                        padding: "0.7rem",
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>

                  <div style={{ marginTop: "0.75rem" }}>
                    <label
                      style={{
                        display: "block",
                        color: "#64748b",
                        fontSize: "0.85rem",
                        marginBottom: "0.35rem",
                      }}
                    >
                      ID Máy tính
                    </label>
                    <input
                      readOnly
                      value={machineId}
                      onClick={(e) => e.target.select()}
                      style={{
                        width: "100%",
                        padding: "0.7rem",
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        background: "#f8fafc",
                        color: "#334155",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        cursor: "text",
                      }}
                    />
                  </div>

                  {paymentError && (
                    <div
                      style={{
                        marginTop: "0.75rem",
                        color: "#b91c1c",
                        background: "#fee2e2",
                        borderRadius: 8,
                        padding: "0.65rem",
                      }}
                    >
                      {paymentError}
                    </div>
                  )}

                  <button
                    onClick={handleCreateOrder}
                    disabled={purchaseLoading || !selectedPlanId}
                    style={{
                      width: "100%",
                      marginTop: "1rem",
                      padding: "0.85rem 1rem",
                      background: "#2563eb",
                      color: "#fff",
                      border: 0,
                      borderRadius: 10,
                      fontWeight: 700,
                      cursor: "pointer",
                      opacity: purchaseLoading ? 0.7 : 1,
                    }}
                  >
                    {purchaseLoading ? "Đang tạo đơn..." : "Tiếp tục"}
                  </button>
                </>
              ) : paidLicenseKey ? (
                <div
                  style={{
                    border: "1px solid #bbf7d0",
                    background: "#f0fdf4",
                    borderRadius: 12,
                    padding: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 999,
                        background: "#16a34a",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                      }}
                    >
                      ✓
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: "#166534" }}>
                        Đơn hàng đã được xác nhận
                      </div>
                      <div style={{ color: "#64748b", fontSize: "0.9rem" }}>
                        Mã đơn {paymentOrder.order.order_code} đã có license.
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #dcfce7",
                      borderRadius: 10,
                      padding: "0.75rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div style={{ color: "#64748b", fontSize: "0.85rem" }}>
                      License Key
                    </div>
                    <code
                      style={{
                        display: "block",
                        marginTop: "0.35rem",
                        color: "#0f172a",
                        fontSize: "0.82rem",
                        wordBreak: "break-all",
                      }}
                    >
                      {paidLicenseKey}
                    </code>
                  </div>

                  <button
                    onClick={handleManualActivate}
                    style={{
                      width: "100%",
                      padding: "0.85rem 1rem",
                      background: "#10b981",
                      color: "#fff",
                      border: 0,
                      borderRadius: 10,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Kích hoạt license
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 320px) 1fr",
                    gap: "1rem",
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      border: "1px solid #dbe3ef",
                      borderRadius: 12,
                      padding: "0.75rem",
                      textAlign: "center",
                    }}
                  >
                    {paymentOrder.qrUrl ? (
                      <img
                        src={paymentOrder.qrUrl}
                        alt="VietQR"
                        style={{ width: "100%", borderRadius: 8 }}
                      />
                    ) : (
                      <div style={{ color: "#b91c1c", padding: "2rem 0" }}>
                        Admin chưa cấu hình tài khoản VietQR.
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ color: "#64748b", fontSize: "0.9rem" }}>
                      Mã đơn hàng
                    </div>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "1.5rem",
                        letterSpacing: 1,
                        marginBottom: "0.75rem",
                      }}
                    >
                      {paymentOrder.order.order_code}
                    </div>
                    <div style={{ color: "#64748b", fontSize: "0.9rem" }}>
                      Số tiền
                    </div>
                    <div
                      style={{
                        fontWeight: 800,
                        color: "#0d5bd7",
                        fontSize: "1.5rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      {formatVnd(paymentOrder.order.amount_vnd)}
                    </div>
                    <div
                      style={{
                        background: "#f1f5f9",
                        borderRadius: 10,
                        padding: "0.75rem",
                        color: "#334155",
                        fontSize: "0.9rem",
                        lineHeight: 1.5,
                      }}
                    >
                      Chuyển khoản đúng số tiền và nội dung{" "}
                      <strong>{paymentOrder.order.order_code}</strong>. Sau khi
                      admin xác nhận, license sẽ được cấp và gửi lại cho bạn.
                    </div>
                    {paymentError && (
                      <div
                        style={{
                          marginTop: "0.75rem",
                          color: "#b91c1c",
                          background: "#fee2e2",
                          borderRadius: 8,
                          padding: "0.65rem",
                        }}
                      >
                        {paymentError}
                      </div>
                    )}
                    <button
                      onClick={handleCheckPayment}
                      disabled={checkingOrder}
                      style={{
                        width: "100%",
                        marginTop: "0.75rem",
                        padding: "0.85rem 1rem",
                        background: "#10b981",
                        color: "#fff",
                        border: 0,
                        borderRadius: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: checkingOrder ? 0.7 : 1,
                      }}
                    >
                      {checkingOrder ? "Đang kiểm tra..." : "Kiểm tra thanh toán"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {purchaseOnly && showPurchase && (
        <PurchaseDialog
          plans={plans}
          selectedPlanId={selectedPlanId}
          setSelectedPlanId={setSelectedPlanId}
          purchaseLoading={purchaseLoading}
          buyerInfo={buyerInfo}
          setBuyerInfo={setBuyerInfo}
          paymentError={paymentError}
          handleCreateOrder={handleCreateOrder}
          paymentOrder={paymentOrder}
          paidLicenseKey={paidLicenseKey}
          manualKey={manualKey}
          machineId={machineId}
          checkingOrder={checkingOrder}
          handleCheckPayment={handleCheckPayment}
          handleManualActivate={handleManualActivate}
          formatVnd={formatVnd}
          onClose={onCancel}
        />
      )}
    </div>
  );
}
