import { useState, useEffect, useCallback } from "react";
import { Page, Panel, EmptyState } from "../components/Primitives.jsx";
import { apiGet, apiPostJson } from "../services/api.js";
import "./PaymentPage.css";

const PLANS = [
  {
    id: "starter",
    name: "CipherGate Starter",
    amount: "999.00",
    currency: "INR",
    period: "/mo",
    features: "10k req/min • 1 Application • Standard Rate Limiting",
    icon: "⚡",
  },
  {
    id: "pro",
    name: "CipherGate Pro",
    amount: "3999.00",
    currency: "INR",
    period: "/mo",
    features: "50k req/min • Unlimited Apps • Zero-Trust HMAC & Replay Defense",
    icon: "🛡️",
    popular: true,
  },
  {
    id: "enterprise",
    name: "CipherGate Enterprise",
    amount: "9999.00",
    currency: "INR",
    period: "/mo",
    features: "Unlimited req • Dedicated Gateway • Custom Security Decision Rules",
    icon: "👑",
  },
];

const PAYMENT_METHODS = [
  { id: "card", label: "Card / UPI / Netbanking", icon: "💳" },
  { id: "bank", label: "Bank Transfer", icon: "🏦" },
  { id: "crypto", label: "Corporate Billing", icon: "🏢" },
];

export default function PaymentPage() {
  const [selectedPlan, setSelectedPlan] = useState(PLANS[1]);
  const [receiver, setReceiver] = useState("CipherGate Pro Subscription");
  const [amount, setAmount] = useState("3999.00");
  const [currency, setCurrency] = useState("INR");
  const [method, setMethod] = useState("card");

  // User details for prefill
  const [customerName, setCustomerName] = useState(() => localStorage.getItem("cg_user_name") || "CipherGate User");
  const [customerEmail, setCustomerEmail] = useState(() => localStorage.getItem("cg_user_email") || "user@ciphergate.local");
  const [customerPhone, setCustomerPhone] = useState("9999999999");

  // Razorpay config
  const [razorpayKeyId, setRazorpayKeyId] = useState("");

  // Transaction & Subscription state
  const [processing, setProcessing] = useState(false);
  const [lastTxResult, setLastTxResult] = useState(null);
  const [txHistory, setTxHistory] = useState([]);
  const [subscription, setSubscription] = useState({ active: false, plan: null });

  // Load Razorpay config, active subscription, and order history
  const loadData = useCallback(async () => {
    try {
      const [configRes, subRes, ordersRes] = await Promise.all([
        apiGet("/api/razorpay/config"),
        apiGet("/api/razorpay/subscription"),
        apiGet("/api/razorpay/orders"),
      ]);

      if (configRes.status === 200 && configRes.data?.key_id) {
        setRazorpayKeyId(configRes.data.key_id);
      }

      if (subRes.status === 200 && subRes.data?.active) {
        setSubscription(subRes.data);
      }

      if (ordersRes.status === 200 && Array.isArray(ordersRes.data)) {
        setTxHistory(ordersRes.data);
      }
    } catch (e) {
      console.error("Failed to load payment info:", e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
    setReceiver(plan.name);
    setAmount(plan.amount);
    setCurrency(plan.currency);
  };

  const handlePay = async (e) => {
    e?.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setProcessing(true);
    setLastTxResult(null);

    const parsedAmount = Number(amount);

    // 1. Create Razorpay order via backend
    const orderRes = await apiPostJson("/api/razorpay/create_order", {
      product_name: receiver,
      amount: parsedAmount,
      currency: currency || "INR",
    });

    if (!orderRes || orderRes.status !== 200 || !orderRes.data?.order_id) {
      setProcessing(false);
      const errMsg = orderRes?.data?.detail || "Failed to create Razorpay order. Check Razorpay keys in backend/.env.";
      const txRecord = {
        id: "tx_err_" + Math.random().toString(36).substring(2, 9),
        created_at: new Date().toISOString(),
        amount: parsedAmount,
        currency: currency || "INR",
        product_name: receiver,
        status: "FAILED",
        reason: errMsg,
      };
      setLastTxResult({
        success: false,
        status: 500,
        message: errMsg,
        record: txRecord,
      });
      return;
    }

    const { order_id, amount: orderAmountPaise, currency: orderCurrency } = orderRes.data;

    // Check if Razorpay Checkout script is loaded
    if (!window.Razorpay) {
      setProcessing(false);
      alert("Razorpay SDK not loaded. Please check your internet connection.");
      return;
    }

    // 2. Initialize Razorpay Checkout
    const options = {
      key: razorpayKeyId,
      amount: orderAmountPaise,
      currency: orderCurrency || "INR",
      name: "CipherGate Security",
      description: receiver,
      order_id: order_id,
      prefill: {
        name: customerName,
        email: customerEmail,
        contact: customerPhone,
      },
      theme: {
        color: "#2FD4E0",
      },
      handler: async function (response) {
        // 3. Verify payment signature on backend
        try {
          const verifyRes = await apiPostJson("/api/razorpay/verify", {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });

          if (verifyRes?.status === 200 && verifyRes.data?.success) {
            // Payment verified & subscription activated
            const txRecord = {
              id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              created_at: new Date().toISOString(),
              amount: parsedAmount,
              currency: orderCurrency || "INR",
              product_name: receiver,
              status: "PAID",
              reason: "Payment verified by Razorpay & subscription activated",
            };

            setLastTxResult({
              success: true,
              status: 200,
              message: "Payment successfully verified! Your CipherGate Pro subscription is now active.",
              record: txRecord,
            });

            setSubscription({
              active: true,
              plan: receiver,
              amount: parsedAmount,
              currency: orderCurrency || "INR",
              payment_id: response.razorpay_payment_id,
              order_id: response.razorpay_order_id,
            });

            // Reload database orders to keep UI synced
            loadData();
          } else {
            const txRecord = {
              id: response.razorpay_payment_id || "unverified",
              razorpay_order_id: response.razorpay_order_id,
              created_at: new Date().toISOString(),
              amount: parsedAmount,
              currency: orderCurrency || "INR",
              product_name: receiver,
              status: "FAILED",
              reason: verifyRes?.data?.detail || "Payment signature verification failed.",
            };
            setLastTxResult({
              success: false,
              status: verifyRes?.status || 400,
              message: verifyRes?.data?.detail || "Payment signature verification failed.",
              record: txRecord,
            });
            loadData();
          }
        } catch (err) {
          setLastTxResult({
            success: false,
            status: 500,
            message: "Error during payment verification: " + (err.message || String(err)),
            record: {
              id: response.razorpay_payment_id || "err",
              created_at: new Date().toISOString(),
              amount: parsedAmount,
              currency: orderCurrency || "INR",
              product_name: receiver,
              status: "FAILED",
            },
          });
        } finally {
          setProcessing(false);
        }
      },
      modal: {
        ondismiss: function () {
          setProcessing(false);
        },
      },
    };

    const rzp = new window.Razorpay(options);

    rzp.on("payment.failed", function (response) {
      const errorDesc = response.error?.description || "Payment failed or was declined.";
      const txRecord = {
        id: response.error?.metadata?.payment_id || "failed_" + Math.random().toString(36).substring(2, 9),
        razorpay_order_id: response.error?.metadata?.order_id || order_id,
        created_at: new Date().toISOString(),
        amount: parsedAmount,
        currency: orderCurrency || "INR",
        product_name: receiver,
        status: "FAILED",
        reason: errorDesc,
      };

      setLastTxResult({
        success: false,
        status: 400,
        message: errorDesc,
        record: txRecord,
      });

      setTxHistory((prev) => [txRecord, ...prev]);
      setProcessing(false);
    });

    rzp.open();
  };

  const isSuccess = lastTxResult?.success;

  return (
    <Page
      eyebrow="Billing & Subscription"
      title="CipherGate Plans & Subscription Checkout"
      subtitle="Upgrade CipherGate to unlock higher rate limits, multi-app routing, and enterprise Zero-Trust API protection."
    >
      {/* Active Subscription Banner */}
      {subscription.active && (
        <div style={{
          background: "rgba(51, 224, 138, 0.12)",
          border: "1px solid rgba(51, 224, 138, 0.35)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "24px" }}>✨</span>
            <div>
              <div style={{ fontWeight: "700", color: "var(--success)", fontSize: "15px" }}>
                Active Subscription: {subscription.plan || "CipherGate Pro"}
              </div>
              <div style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>
                Verified via Razorpay Payment ID: <code className="mono">{subscription.payment_id}</code>
              </div>
            </div>
          </div>
          <span style={{
            background: "var(--success)",
            color: "#04151a",
            fontWeight: "700",
            fontSize: "12px",
            padding: "4px 12px",
            borderRadius: "20px",
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}>
            Active
          </span>
        </div>
      )}

      <div className="pay-root">
        {/* Left Column: Plan Picker & Payment Form */}
        <div className="pay-form-col">
          {/* Plan Selection Cards */}
          <Panel title="Choose Subscription Tier">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
              {PLANS.map((plan) => {
                const isSelected = selectedPlan?.id === plan.id;
                return (
                  <div
                    key={plan.id}
                    onClick={() => handleSelectPlan(plan)}
                    style={{
                      background: isSelected ? "var(--accent-dim)" : "var(--bg-raised)",
                      border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      padding: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {plan.popular && (
                      <span
                        style={{
                          position: "absolute",
                          top: "-10px",
                          right: "12px",
                          background: "var(--accent)",
                          color: "#04151a",
                          fontSize: "10px",
                          fontWeight: "800",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Recommended
                      </span>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "20px" }}>{plan.icon}</span>
                      <div style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: isSelected ? "5px solid var(--accent)" : "2px solid var(--border)",
                        background: isSelected ? "#fff" : "transparent"
                      }} />
                    </div>
                    <div style={{ fontWeight: "700", color: "var(--text)", fontSize: "14px" }}>
                      {plan.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "2px" }}>
                      <span style={{ fontSize: "18px", fontWeight: "800", color: "var(--text)" }}>
                        ₹{Number(plan.amount).toLocaleString("en-IN")}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{plan.period}</span>
                    </div>
                    <div style={{ fontSize: "11.5px", color: "var(--text-dim)", lineHeight: "1.4", marginTop: "4px" }}>
                      {plan.features}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Payment Method Selector */}
          <Panel title="Select Payment Gateway Mode">
            <div className="pay-methods">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`pay-method-btn ${method === m.id ? "pay-method-btn--active" : ""}`}
                  onClick={() => setMethod(m.id)}
                >
                  <span className="pay-method-btn__icon">{m.icon}</span>
                  <span className="pay-method-btn__label">{m.label}</span>
                </button>
              ))}
            </div>
          </Panel>

          {/* Customer & Checkout Form */}
          <Panel title="Billing Information">
            <form onSubmit={handlePay} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="pay-row">
                <div className="pay-field">
                  <label className="pay-label">Subscription Tier</label>
                  <div className="pay-input-wrap">
                    <span className="pay-input-icon">🛡️</span>
                    <input
                      className="pay-input"
                      value={receiver}
                      onChange={(e) => setReceiver(e.target.value)}
                      placeholder="e.g. CipherGate Pro Subscription"
                      required
                    />
                  </div>
                </div>
                <div className="pay-field">
                  <label className="pay-label">Amount (INR ₹)</label>
                  <div className="pay-input-wrap">
                    <span className="pay-input-icon">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      className="pay-input pay-input--mono"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="pay-row">
                <div className="pay-field">
                  <label className="pay-label">Customer Name</label>
                  <div className="pay-input-wrap">
                    <span className="pay-input-icon">👤</span>
                    <input
                      className="pay-input"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Your full name"
                      required
                    />
                  </div>
                </div>
                <div className="pay-field">
                  <label className="pay-label">Billing Email</label>
                  <div className="pay-input-wrap">
                    <span className="pay-input-icon">✉️</span>
                    <input
                      type="email"
                      className="pay-input"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="name@example.com"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="pay-submit"
                disabled={processing || !razorpayKeyId}
              >
                {processing ? (
                  <>
                    <span className="pay-submit__spinner" />
                    Connecting to Razorpay Checkout...
                  </>
                ) : (
                  <>
                    <span>💳 Pay ₹{Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} with Razorpay</span>
                  </>
                )}
              </button>
            </form>
          </Panel>
        </div>

        {/* Right Column: Order Summary & Transaction History */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Order Summary */}
          <div className="pay-summary">
            <div className="pay-summary__header">
              <div className="pay-summary__title">Subscription Checkout Summary</div>
            </div>
            <div className="pay-summary__body">
              <div className="pay-item">
                <span className="pay-item__label">Product</span>
                <span className="pay-item__value">{receiver || "CipherGate Subscription"}</span>
              </div>
              <div className="pay-item">
                <span className="pay-item__label">Payment Gateway</span>
                <span className="pay-item__value pay-item__value--accent">Razorpay Standard</span>
              </div>
              <div className="pay-item">
                <span className="pay-item__label">Verification</span>
                <span className="pay-item__value">HMAC-SHA256 Sig</span>
              </div>
              <div className="pay-divider" />
              <div className="pay-total">
                <span className="pay-total__label">Total Due</span>
                <span className="pay-total__amount">
                  ₹{Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="pay-security-badge">
                <span className="pay-security-badge__icon">🔒</span>
                <div>
                  <strong>Server-Side Verified</strong>
                  <br />
                  Razorpay cryptographic signature verified on backend before activation.
                </div>
              </div>
            </div>
          </div>

          {/* Result Banner if transaction occurred */}
          {lastTxResult && (
            <div
              className={`pay-result ${isSuccess ? "pay-result--success" : "pay-result--blocked"}`}
            >
              <div className="pay-result__icon">
                {isSuccess ? "✅" : "🚨"}
              </div>
              <div className="pay-result__title">
                {isSuccess ? "Payment Verified & Activated" : "Payment Failed / Cancelled"}
              </div>
              <div className="pay-result__sub">
                {lastTxResult.message}
              </div>

              <div className="pay-result__details">
                <div className="pay-result__row">
                  <span className="pay-result__row-label">Status</span>
                  <span className="pay-result__row-value" style={{ color: isSuccess ? "var(--success)" : "var(--danger)" }}>
                    {isSuccess ? "PAID (Verified)" : "FAILED"}
                  </span>
                </div>
                {lastTxResult.record?.id && (
                  <div className="pay-result__row">
                    <span className="pay-result__row-label">Payment ID</span>
                    <span className="pay-result__row-value">
                      {lastTxResult.record.id}
                    </span>
                  </div>
                )}
                {lastTxResult.record?.razorpay_order_id && (
                  <div className="pay-result__row">
                    <span className="pay-result__row-label">Order ID</span>
                    <span className="pay-result__row-value">
                      {lastTxResult.record.razorpay_order_id}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment & Order History */}
          <div className="pay-history">
            <div className="pay-history__header">
              <span className="pay-history__title">Order History & Subscriptions</span>
              <span className="pay-history__count">{txHistory.length}</span>
            </div>
            <div className="pay-history__list">
              {txHistory.length === 0 ? (
                <EmptyState
                  title="No payments yet"
                  subtitle="Completed Razorpay payments will appear here."
                />
              ) : (
                txHistory.map((tx) => {
                  const isPaid = tx.status === "PAID";
                  return (
                    <div className="pay-tx" key={tx.id || tx.razorpay_order_id}>
                      <div
                        className={`pay-tx__icon ${isPaid ? "pay-tx__icon--success" : "pay-tx__icon--blocked"}`}
                      >
                        {isPaid ? "✓" : "✕"}
                      </div>
                      <div className="pay-tx__info">
                        <div className="pay-tx__receiver">{tx.product_name || "CipherGate Subscription"}</div>
                        <div className="pay-tx__time">
                          {tx.created_at ? new Date(tx.created_at.includes("Z") ? tx.created_at : tx.created_at + "Z").toLocaleDateString() : "Recent"} • {tx.status} {tx.razorpay_payment_id ? `(${tx.razorpay_payment_id})` : ""}
                        </div>
                      </div>
                      <div
                        className={`pay-tx__amount ${isPaid ? "pay-tx__amount--success" : "pay-tx__amount--blocked"}`}
                      >
                        ₹{(Number(tx.amount) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

