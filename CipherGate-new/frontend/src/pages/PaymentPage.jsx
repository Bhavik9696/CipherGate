import { useState, useEffect } from "react";
import { Page, Panel, Button, EmptyState } from "../components/Primitives.jsx";
import SecurityPipeline from "../components/SecurityPipeline.jsx";
import { generateTimestamp, generateNonce, signRequest } from "../services/crypto.js";
import { apiPostRaw, apiGet, apiPostJson, BASE_URL } from "../services/api.js";
import "./PaymentPage.css";

const PAYMENT_METHODS = [
  { id: "card", label: "Credit Card", icon: "💳" },
  { id: "bank", label: "Bank Transfer", icon: "🏦" },
  { id: "crypto", label: "Crypto", icon: "₿" },
];

export default function PaymentPage({ credentials }) {
  const [receiver, setReceiver] = useState("CipherGate Pro Subscription");
  const [amount, setAmount] = useState("49.00");
  const [method, setMethod] = useState("card");

  // Card mockup state
  const [cardNumber, setCardNumber] = useState("4532 •••• •••• 8892");
  const [cardHolder, setCardHolder] = useState("ALEXANDER RIVERS");
  const [cardExpiry, setCardExpiry] = useState("08/29");
  const [cardCvv, setCardCvv] = useState("731");

  // Auth / Gateway credentials (managed behind the scenes)
  const [apiKey, setApiKey] = useState(credentials?.api_key || "");
  const [hmacSecret, setHmacSecret] = useState(credentials?.hmac_secret || "");
  const [razorpayKeyId, setRazorpayKeyId] = useState("");

  // Transaction execution state
  const [processing, setProcessing] = useState(false);
  const [lastTxResult, setLastTxResult] = useState(null);
  const [txHistory, setTxHistory] = useState([]);

  // Auto-provision internal credentials for the payment if missing
  useEffect(() => {
    // Fetch Razorpay config
    apiGet("/api/razorpay/config").then((res) => {
      if (res.status === 200 && res.data?.key_id) {
        setRazorpayKeyId(res.data.key_id);
      }
    });

    if (!apiKey || !hmacSecret) {
      fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "CipherGate Billing Service" }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.api_key) {
            setApiKey(data.api_key);
            setHmacSecret(data.hmac_secret);
          }
        })
        .catch(e => console.error("Could not provision billing creds", e));
    }
  }, [apiKey, hmacSecret]);

  const handlePay = async (e) => {
    e?.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setProcessing(true);
    setLastTxResult(null);

    const parsedAmount = Number(amount);

    // 1. Create Razorpay order
    const orderRes = await apiPostJson("/api/razorpay/create_order", {
      product_name: receiver,
      amount: parsedAmount,
      currency: "USD"
    });

    if (!orderRes || orderRes.status !== 200 || !orderRes.data?.order_id) {
      setProcessing(false);
      const errMsg = orderRes?.data?.detail || "Failed to create Razorpay order. Check your Razorpay keys in .env.";
      setLastTxResult({
        res: { status: 500, data: { message: errMsg } },
        record: {
          id: "tx_" + Math.random().toString(36).substring(2, 9),
          time: new Date().toLocaleTimeString(),
          amount: parsedAmount,
          receiver,
          allowed: false,
          reason: "Order Creation Failed",
        }
      });
      return;
    }

    const { order_id } = orderRes.data;

    // 2. Initialize Razorpay Checkout
    const options = {
      key: razorpayKeyId,
      amount: orderRes.data.amount,
      currency: orderRes.data.currency,
      name: receiver,
      description: "CipherGate Pro Subscription",
      order_id: order_id,
      handler: async function (response) {
        // 3. Verify payment signature on backend
        const verifyRes = await apiPostJson("/api/razorpay/verify", {
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });

        if (verifyRes?.status === 200) {
          // 4. Send securely to our Zero-Trust Gateway
          const payloadStr = JSON.stringify({
            amount: parsedAmount,
            receiver,
            method,
            currency: "USD",
            razorpay_payment_id: response.razorpay_payment_id,
            timestamp: new Date().toISOString(),
          });

          const timestamp = generateTimestamp();
          const nonce = generateNonce();
          const signature = await signRequest("POST", "/api/payment", timestamp, nonce, payloadStr, hmacSecret);

          const gatewayRes = await apiPostRaw("/api/payment", payloadStr, {
            "X-API-Key": apiKey,
            "X-Timestamp": timestamp,
            "X-Nonce": nonce,
            "X-Signature": signature,
          });

          const isAllowed = gatewayRes?.status === 200 && gatewayRes?.data?.decision?.allowed;
          const txRecord = {
            id: response.razorpay_payment_id,
            time: new Date().toLocaleTimeString(),
            amount: parsedAmount,
            receiver,
            allowed: isAllowed,
            reason: isAllowed ? "Payment authorized & secured by Gateway" : (gatewayRes?.data?.message || "Gateway Rejected"),
            checks: gatewayRes?.data?.decision?.checks
          };

          setLastTxResult({ res: gatewayRes, record: txRecord });
          setTxHistory((prev) => [txRecord, ...prev]);
        } else {
          const txRecord = {
            id: response.razorpay_payment_id,
            time: new Date().toLocaleTimeString(),
            amount: parsedAmount,
            receiver,
            allowed: false,
            reason: "Signature Verification Failed",
            checks: { signature: "failed" }
          };
          setLastTxResult({ res: verifyRes, record: txRecord });
          setTxHistory((prev) => [txRecord, ...prev]);
        }
        setProcessing(false);
      },
      prefill: {
        name: cardHolder,
        email: "demo@ciphergate.local",
        contact: "9999999999"
      },
      theme: {
        color: "#2FD4E0"
      },
      modal: {
        ondismiss: function () {
          setProcessing(false);
        }
      }
    };

    if (!window.Razorpay) {
      setProcessing(false);
      alert("Razorpay SDK not loaded. Check your internet connection.");
      return;
    }

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response) {
      const txRecord = {
        id: response.error.metadata.payment_id || "failed_" + Math.random().toString(36).substring(2, 9),
        time: new Date().toLocaleTimeString(),
        amount: parsedAmount,
        receiver,
        allowed: false,
        reason: response.error.description || "Payment Failed",
      };
      setLastTxResult({ res: { status: 400, data: { message: response.error.description } }, record: txRecord });
      setTxHistory((prev) => [txRecord, ...prev]);
      setProcessing(false);
    });
    rzp.open();
  };

  const checks = lastTxResult?.res?.data?.decision?.checks;
  const isAllowed = lastTxResult?.res?.data?.decision?.allowed;

  return (
    <Page
      eyebrow="Billing & Subscription"
      title="Upgrade to CipherGate Pro"
      subtitle="Unlock enterprise features and higher rate limits for your security gateway."
    >
      <div className="pay-root">
        {/* Left Column: Form & Payment Flow */}
        <div className="pay-form-col">
          {/* Card Visual Preview */}
          <div className="pay-card-visual">
            <div className="pay-card__chip" />
            <div className="pay-card__network">CIPHERGATE</div>
            <div className="pay-card__number">
              {cardNumber || "•••• •••• •••• ••••"}
            </div>
            <div className="pay-card__footer">
              <div>
                <div className="pay-card__field-label">Card Holder</div>
                <div className="pay-card__field-value">
                  {cardHolder || "YOUR NAME"}
                </div>
              </div>
              <div>
                <div className="pay-card__field-label">Expires</div>
                <div className="pay-card__field-value">
                  {cardExpiry || "MM/YY"}
                </div>
              </div>
            </div>
          </div>

          {/* Payment Method Selector */}
          <Panel title="Select Payment Method">
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

          {/* Payment Details Form */}
          <Panel title="Transaction Details">
            <form onSubmit={handlePay} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="pay-row">
                <div className="pay-field">
                  <label className="pay-label">Recipient / Merchant</label>
                  <div className="pay-input-wrap">
                    <span className="pay-input-icon">🏢</span>
                    <input
                      className="pay-input"
                      value={receiver}
                      onChange={(e) => setReceiver(e.target.value)}
                      placeholder="e.g. Acme Corp"
                      required
                    />
                  </div>
                </div>
                <div className="pay-field">
                  <label className="pay-label">Amount (USD)</label>
                  <div className="pay-input-wrap">
                    <span className="pay-input-icon">$</span>
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

              {method === "card" && (
                <>
                  <div className="pay-field">
                    <label className="pay-label">Cardholder Name</label>
                    <div className="pay-input-wrap">
                      <span className="pay-input-icon">👤</span>
                      <input
                        className="pay-input"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="pay-row-3">
                    <div className="pay-field">
                      <label className="pay-label">Card Number</label>
                      <div className="pay-input-wrap">
                        <span className="pay-input-icon">💳</span>
                        <input
                          className="pay-input pay-input--mono"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="pay-field">
                      <label className="pay-label">Expires</label>
                      <input
                        className="pay-input pay-input--mono"
                        style={{ paddingLeft: 12 }}
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                      />
                    </div>
                    <div className="pay-field">
                      <label className="pay-label">CVC / CVV</label>
                      <input
                        type="password"
                        maxLength={4}
                        className="pay-input pay-input--mono"
                        style={{ paddingLeft: 12 }}
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        placeholder="123"
                      />
                    </div>
                  </div>
                </>
              )}



              <button
                type="submit"
                className="pay-submit"
                disabled={processing || !apiKey}
              >
                {processing ? (
                  <>
                    <span className="pay-submit__spinner" />
                    Authenticating & Signing...
                  </>
                ) : (
                  <>
                    <span>🛡️ Authorize Payment (${Number(amount || 0).toFixed(2)})</span>
                  </>
                )}
              </button>
            </form>
          </Panel>

          {/* Live Pipeline Check Visualizer */}
          {checks && (
            <div className="pay-pipeline-wrap">
              <div className="pay-pipeline-label">CipherGate Gateway Pipeline Verdict</div>
              <SecurityPipeline checks={checks} allowed={isAllowed} />
            </div>
          )}
        </div>

        {/* Right Column: Order Summary & Transaction History */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Order Summary */}
          <div className="pay-summary">
            <div className="pay-summary__header">
              <div className="pay-summary__title">Order Summary</div>
            </div>
            <div className="pay-summary__body">
              <div className="pay-item">
                <span className="pay-item__label">Merchant</span>
                <span className="pay-item__value">{receiver || "CipherGate"}</span>
              </div>
              <div className="pay-item">
                <span className="pay-item__label">Service</span>
                <span className="pay-item__value">Zero-Trust API Pass</span>
              </div>
              <div className="pay-item">
                <span className="pay-item__label">Encryption</span>
                <span className="pay-item__value pay-item__value--accent">HMAC-SHA256</span>
              </div>
              <div className="pay-divider" />
              <div className="pay-total">
                <span className="pay-total__label">Total Due</span>
                <span className="pay-total__amount">
                  ${Number(amount || 0).toFixed(2)}
                </span>
              </div>

              <div className="pay-security-badge">
                <span className="pay-security-badge__icon">🔒</span>
                <div>
                  <strong>Protected by CipherGate</strong>
                  <br />
                  Payload signed on client before transmission.
                </div>
              </div>
            </div>
          </div>

          {/* Result Banner if transaction occurred */}
          {lastTxResult && (
            <div
              className={`pay-result ${isAllowed ? "pay-result--success" : "pay-result--blocked"
                }`}
            >
              <div className="pay-result__icon">
                {isAllowed ? "✅" : "🚨"}
              </div>
              <div className="pay-result__title">
                {isAllowed ? "Payment Authorized" : "Transaction Blocked"}
              </div>
              <div className="pay-result__sub">
                {isAllowed
                  ? "The payment passed all 5 Zero-Trust security checkpoints successfully."
                  : lastTxResult.res?.data?.message || "CipherGate rejected this request."}
              </div>

              <div className="pay-result__details">
                <div className="pay-result__row">
                  <span className="pay-result__row-label">Status Code</span>
                  <span className="pay-result__row-value">
                    HTTP {lastTxResult.res?.status}
                  </span>
                </div>
                <div className="pay-result__row">
                  <span className="pay-result__row-label">Check Failure</span>
                  <span className="pay-result__row-value" style={{ color: isAllowed ? "var(--success)" : "var(--danger)" }}>
                    {lastTxResult.res?.data?.security_check || "None (Passed)"}
                  </span>
                </div>
                <div className="pay-result__row">
                  <span className="pay-result__row-label">Tx ID</span>
                  <span className="pay-result__row-value">
                    {lastTxResult.record.id}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Recent Transaction Log */}
          <div className="pay-history">
            <div className="pay-history__header">
              <span className="pay-history__title">Recent Session Payments</span>
              <span className="pay-history__count">{txHistory.length}</span>
            </div>
            <div className="pay-history__list">
              {txHistory.length === 0 ? (
                <EmptyState
                  title="No payments made"
                  subtitle="Authorized & blocked attempts will appear here."
                />
              ) : (
                txHistory.map((tx) => (
                  <div className="pay-tx" key={tx.id}>
                    <div
                      className={`pay-tx__icon ${tx.allowed ? "pay-tx__icon--success" : "pay-tx__icon--blocked"
                        }`}
                    >
                      {tx.allowed ? "✓" : "✕"}
                    </div>
                    <div className="pay-tx__info">
                      <div className="pay-tx__receiver">{tx.receiver}</div>
                      <div className="pay-tx__time">
                        {tx.time} • {tx.reason}
                      </div>
                    </div>
                    <div
                      className={`pay-tx__amount ${tx.allowed ? "pay-tx__amount--success" : "pay-tx__amount--blocked"
                        }`}
                    >
                      ${tx.amount.toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
