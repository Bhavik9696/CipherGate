import { useState, useEffect, useCallback } from "react";
import SecurityPipeline from "../components/SecurityPipeline.jsx";
import { generateTimestamp, generateNonce, signRequest } from "../services/crypto.js";
import { apiPostRaw, apiPostJson, BASE_URL } from "../services/api.js";
import "./CipherShop.css";

// ---------------------------------------------------------------------------
// Product catalogue (mock data — the security demo is what matters)
// ---------------------------------------------------------------------------
const PRODUCTS = [
  {
    id: "P001",
    name: "Wireless Headphones",
    emoji: "🎧",
    price: 5000,
    desc: "Premium noise-cancelling, 30h battery life",
  },
  {
    id: "P002",
    name: "Smart Watch",
    emoji: "⌚",
    price: 8000,
    desc: "Health tracking, GPS, 5-day battery",
  },
  {
    id: "P003",
    name: "Laptop",
    emoji: "💻",
    price: 50000,
    desc: "16GB RAM, 512GB SSD, 14-inch display",
  },
  {
    id: "P004",
    name: "Mechanical Keyboard",
    emoji: "⌨️",
    price: 4000,
    desc: "TKL layout, Cherry MX Blue switches",
  },
];

const CHECK_LABELS = {
  authentication: "API Key",
  hmac: "HMAC Verification",
  timestamp: "Timestamp",
  nonce: "Nonce / Replay",
  rate_limit: "Rate Limit",
};

function formatINR(n) {
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

// ---------------------------------------------------------------------------
// Auto-provision CipherShop credentials using the existing /auth/register
// ---------------------------------------------------------------------------
async function ensureCredentials() {
  const stored = {
    api_key: localStorage.getItem("cs_api_key"),
    hmac_secret: localStorage.getItem("cs_hmac_secret"),
    app_id: localStorage.getItem("cs_app_id"),
  };
  if (stored.api_key && stored.hmac_secret) return { ok: true, creds: stored };

  try {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CipherShop Demo" }),
    });
    if (!res.ok) throw new Error("Registration failed");
    const data = await res.json();
    localStorage.setItem("cs_api_key", data.api_key);
    localStorage.setItem("cs_hmac_secret", data.hmac_secret);
    localStorage.setItem("cs_app_id", data.application_id);
    return { ok: true, creds: { api_key: data.api_key, hmac_secret: data.hmac_secret, app_id: data.application_id }, fresh: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// CheckRow helper
// ---------------------------------------------------------------------------
function CheckRow({ label, state }) {
  const icon = state === "passed" ? "✓" : state === "failed" ? "✕" : "–";
  return (
    <div className="cs-check-row">
      <span className={`cs-check-row__icon cs-check-row__icon--${state || "skipped"}`}>{icon}</span>
      <span className="cs-check-row__label">{label}</span>
      <span className={`cs-check-row__status--${state || "skipped"}`}>{(state || "–").toUpperCase()}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RequestDetailsPanel
// ---------------------------------------------------------------------------
function RequestDetailsPanel({ timestamp, nonce, hmac, apiKey }) {
  const [open, setOpen] = useState(false);
  if (!timestamp) return null;
  const maskedHmac = hmac ? hmac.slice(0, 8) + "••••••••••••••••••••••••••••••••••••••••••••••••" + hmac.slice(-4) : "–";
  const maskedKey = apiKey ? apiKey.slice(0, 10) + "••••••••••••••••••" : "–";

  return (
    <div className="cs-req-details" style={{ marginTop: 14 }}>
      <button className="cs-req-details__toggle" onClick={() => setOpen(v => !v)}>
        <span>🔐 Request Security Details</span>
        <span className={`cs-req-details__chevron ${open ? "cs-req-details__chevron--open" : ""}`}>▼</span>
      </button>
      {open && (
        <div className="cs-req-details__body" style={{ paddingTop: 12 }}>
          <div className="cs-req-details__row"><span className="cs-req-details__key">Method</span><span className="cs-req-details__val">POST</span></div>
          <div className="cs-req-details__row"><span className="cs-req-details__key">Endpoint</span><span className="cs-req-details__val">/api/payment</span></div>
          <div className="cs-req-details__row"><span className="cs-req-details__key">Timestamp</span><span className="cs-req-details__val">{timestamp}</span></div>
          <div className="cs-req-details__row"><span className="cs-req-details__key">Nonce</span><span className="cs-req-details__val">{nonce}</span></div>
          <div className="cs-req-details__row"><span className="cs-req-details__key">HMAC</span><span className="cs-req-details__val">{maskedHmac}</span></div>
          <div className="cs-req-details__row"><span className="cs-req-details__key">API Key</span><span className="cs-req-details__val">{maskedKey}</span></div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------
function ProductCard({ product, onSelect, inCart, onAddToCart }) {
  return (
    <div className="cs-card" onClick={() => onSelect(product)}>
      <div className="cs-card__image">{product.emoji}</div>
      <div className="cs-card__body">
        <div className="cs-card__name">{product.name}</div>
        <div className="cs-card__desc">{product.desc}</div>
        <div className="cs-card__footer">
          <span className="cs-card__price">{formatINR(product.price)}</span>
          <button
            className="cs-card__buy-btn"
            onClick={e => { e.stopPropagation(); onSelect(product); }}
          >
            {inCart ? "✓ In Cart" : "Buy Now"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CheckoutPanel
// ---------------------------------------------------------------------------
function CheckoutPanel({ product, creds, onBack, onNavigateToSecurityDemo }) {
  const orderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [lastReqMeta, setLastReqMeta] = useState(null);

  const handlePay = async () => {
    if (!creds?.api_key || !creds?.hmac_secret) return;
    setProcessing(true);
    setResult(null);

    const bodyObj = { amount: product.price, receiver: `${product.name} - CipherShop` };
    const bodyRaw = JSON.stringify(bodyObj);
    const ts = generateTimestamp();
    const n = generateNonce();
    const sig = await signRequest({
      secret: creds.hmac_secret,
      method: "POST",
      path: "/api/payment",
      timestamp: ts,
      nonce: n,
      bodyRaw,
    });

    setLastReqMeta({ ts, n, sig, apiKey: creds.api_key });

    const res = await apiPostRaw("/api/payment", bodyRaw, {
      "X-API-Key": creds.api_key,
      "X-Timestamp": ts,
      "X-Nonce": n,
      "X-Signature": sig,
    });

    setProcessing(false);
    setResult(res);
  };

  const decision = result?.data?.decision;
  const isAllowed = decision?.allowed === true;
  const checks = decision?.checks || {};

  return (
    <div>
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 13, padding: "0 0 18px", display: "flex", alignItems: "center", gap: 6 }}
      >
        ← Back to Products
      </button>
      <div className="cs-checkout">
        {/* Left: product + result */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Product summary */}
          <div className="cs-order-panel">
            <div className="cs-order-panel__header">
              <span className="cs-order-panel__title">Order Summary</span>
              <span className="cs-badge cs-badge--client">CLIENT APPLICATION</span>
            </div>
            <div className="cs-order-panel__body">
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 0 14px", borderBottom: "1px solid var(--border-soft)" }}>
                <div style={{ fontSize: 40, background: "var(--panel-alt)", width: 64, height: 64, borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {product.emoji}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{product.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3 }}>{product.desc}</div>
                  <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-faint)", marginTop: 4 }}>Order #{orderId}</div>
                </div>
              </div>
              <div className="cs-order-row"><span className="cs-order-row__label">Product</span><span className="cs-order-row__value">{product.name}</span></div>
              <div className="cs-order-row"><span className="cs-order-row__label">Currency</span><span className="cs-order-row__value">INR</span></div>
              <div className="cs-order-row"><span className="cs-order-row__label">Security</span><span className="cs-order-row__value" style={{ color: "var(--accent)" }}>HMAC-SHA256</span></div>
              <div className="cs-order-divider" />
              <div className="cs-order-total">
                <span className="cs-order-total__label">Total Amount</span>
                <span className="cs-order-total__amount">{formatINR(product.price)}</span>
              </div>
            </div>
          </div>

          {/* Arch annotation */}
          <div style={{ background: "var(--panel-alt)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius)", padding: "12px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent)", marginBottom: 8 }}>Request Flow</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {[
                { label: "CipherShop", badge: "CLIENT APPLICATION", color: "var(--cs-accent)" },
                { label: "↓ HMAC-signed request" },
                { label: "CipherGate", badge: "SECURITY GATEWAY", color: "var(--accent)" },
                { label: "↓ Security pipeline" },
                { label: "Demo Backend", badge: "BACKEND API", color: "var(--success)" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, color: r.color || "var(--text-dim)" }}>
                  <span>{r.label}</span>
                  {r.badge && <span style={{ fontSize: 9, background: "var(--panel)", border: "1px solid var(--border-soft)", borderRadius: 999, padding: "2px 7px", color: r.color, letterSpacing: "0.06em" }}>{r.badge}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={`cs-result cs-result--${isAllowed ? "success" : "blocked"}`}>
              <div className="cs-result__icon">{isAllowed ? "✅" : "🚨"}</div>
              <div className="cs-result__title">{isAllowed ? "Payment Successful" : "Payment Blocked"}</div>
              <div className="cs-result__sub">
                {isAllowed
                  ? `Your payment of ${formatINR(product.price)} was authenticated, verified, and processed by CipherGate.`
                  : result.data?.message || "CipherGate rejected the request."}
              </div>
              <div className="cs-checks">
                {Object.entries(CHECK_LABELS).map(([key, label]) => (
                  <CheckRow key={key} label={label} state={checks[key]} />
                ))}
              </div>
              <div className="cs-result__http">
                HTTP {result.status} · {isAllowed ? "REQUEST ALLOWED" : `BLOCKED — ${result.data?.error || "REJECTED"}`}
              </div>
            </div>
          )}

          {/* Pipeline visualization */}
          {checks && Object.keys(checks).length > 0 && (
            <div className="cs-pipeline-wrap">
              <div className="cs-pipeline-label">CipherGate Security Pipeline</div>
              <SecurityPipeline checks={checks} allowed={isAllowed} />
            </div>
          )}

          {/* Request details */}
          {lastReqMeta && (
            <RequestDetailsPanel
              timestamp={lastReqMeta.ts}
              nonce={lastReqMeta.n}
              hmac={lastReqMeta.sig}
              apiKey={lastReqMeta.apiKey}
            />
          )}
        </div>

        {/* Right: pay panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="cs-order-panel">
            <div className="cs-order-panel__header">
              <span className="cs-order-panel__title">Secure Checkout</span>
              <span className="cs-badge cs-badge--gateway">CipherGate</span>
            </div>
            <div className="cs-order-panel__body">
              <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 6 }}>
                Clicking <strong style={{ color: "var(--text)" }}>PAY NOW</strong> will:
              </div>
              <ol style={{ margin: "0 0 14px", padding: "0 0 0 18px", fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.8 }}>
                <li>Generate a timestamp &amp; nonce</li>
                <li>Construct canonical request</li>
                <li>Generate HMAC-SHA256 signature</li>
                <li>Send through CipherGate</li>
                <li>Gateway verifies all checks</li>
                <li>Forward to demo backend</li>
              </ol>
              <div className="cs-order-divider" />
              <div className="cs-order-total" style={{ marginBottom: 14 }}>
                <span className="cs-order-total__label">Total</span>
                <span className="cs-order-total__amount">{formatINR(product.price)}</span>
              </div>
              <button
                className="cs-pay-btn"
                id="btn-ciphershop-pay"
                onClick={handlePay}
                disabled={processing || !creds?.api_key}
              >
                {processing ? (
                  <><span className="cs-pay-btn__spinner" /> Signing &amp; Sending...</>
                ) : (
                  <>🛡️ PAY NOW</>
                )}
              </button>
              <button
                className="cs-pay-btn"
                style={{ marginTop: 10, background: "var(--panel-alt)", color: "var(--text)", border: "1px solid var(--border-soft)", fontSize: 13 }}
                onClick={() => onNavigateToSecurityDemo({ amount: product.price, receiver: `${product.name} - CipherShop` })}
              >
                ⚡ Test in Security Demo
              </button>
              <div className="cs-security-note">
                <span className="cs-security-note__icon">🔒</span>
                <span>All requests are HMAC-signed client-side before transmission. CipherGate verifies integrity before forwarding.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CartView
// ---------------------------------------------------------------------------
function CartView({ cart, onRemove, onCheckout }) {
  const total = cart.reduce((s, p) => s + p.price, 0);
  if (cart.length === 0) {
    return (
      <div className="cs-cart-empty">
        <div className="cs-cart-empty__icon">🛒</div>
        <div className="cs-cart-empty__title">Your cart is empty</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Browse products and add items to your cart.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="cs-order-panel">
        <div className="cs-order-panel__header"><span className="cs-order-panel__title">Cart</span><span style={{ fontSize: 12, color: "var(--text-dim)" }}>{cart.length} item{cart.length !== 1 ? "s" : ""}</span></div>
        <div className="cs-order-panel__body">
          {cart.map(p => (
            <div className="cs-cart-item" key={p.id + Math.random()}>
              <div className="cs-cart-item__icon">{p.emoji}</div>
              <div className="cs-cart-item__info">
                <div className="cs-cart-item__name">{p.name}</div>
                <div className="cs-cart-item__price">{formatINR(p.price)}</div>
              </div>
              <button className="cs-cart-remove-btn" onClick={() => onRemove(p.id)}>Remove</button>
            </div>
          ))}
          <div className="cs-order-divider" style={{ margin: "8px 0" }} />
          <div className="cs-order-total">
            <span className="cs-order-total__label">Total</span>
            <span className="cs-order-total__amount">{formatINR(total)}</span>
          </div>
          <button className="cs-pay-btn" style={{ marginTop: 14 }} onClick={() => onCheckout(cart[0])}>
            🛡️ Proceed to Checkout
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CipherShop page
// ---------------------------------------------------------------------------
export default function CipherShop({ onNavigateToSecurityDemo }) {
  const [tab, setTab] = useState("home"); // home | cart | checkout
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [creds, setCreds] = useState(null);
  const [credStatus, setCredStatus] = useState("loading"); // loading | ready | error

  // Auto-provision credentials on mount
  useEffect(() => {
    ensureCredentials().then(res => {
      if (res.ok) {
        setCreds(res.creds);
        setCredStatus(res.fresh ? "just-registered" : "ready");
      } else {
        setCredStatus("error");
      }
    });
  }, []);

  const handleSelectProduct = useCallback(product => {
    setSelectedProduct(product);
    setTab("checkout");
  }, []);

  const handleAddToCart = useCallback(product => {
    setCart(prev => [...prev, product]);
  }, []);

  const handleRemoveFromCart = useCallback(pid => {
    setCart(prev => {
      const idx = prev.findIndex(p => p.id === pid);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  return (
    <div className="cs-root">
      {/* Header */}
      <div className="cs-header">
        <div className="cs-brand">
          <div className="cs-brand-mark">CS</div>
          <div>
            <div className="cs-brand-name">CipherShop</div>
            <div className="cs-brand-tagline">SAMPLE REST API CLIENT</div>
          </div>
          <span className="cs-badge cs-badge--client" style={{ marginLeft: 8 }}>CLIENT APPLICATION</span>
        </div>
        <nav className="cs-nav">
          <button className={`cs-nav-btn ${tab === "home" ? "cs-nav-btn--active" : ""}`} onClick={() => { setTab("home"); setSelectedProduct(null); }}>Home</button>
          <button className={`cs-nav-btn ${tab === "home" ? "cs-nav-btn--active" : ""}`} onClick={() => { setTab("home"); setSelectedProduct(null); }}>Products</button>
          <button
            className={`cs-nav-btn ${tab === "cart" ? "cs-nav-btn--active" : ""}`}
            onClick={() => { setTab("cart"); setSelectedProduct(null); }}
          >
            🛒 Cart {cart.length > 0 && <span style={{ background: "var(--cs-accent)", color: "#1a0e00", borderRadius: 999, fontSize: 10, padding: "1px 6px", marginLeft: 4, fontWeight: 700 }}>{cart.length}</span>}
          </button>
          <button
            className="cs-nav-btn"
            onClick={() => onNavigateToSecurityDemo?.()}
          >
            ⚡ Security Demo
          </button>
        </nav>
      </div>

      {/* Credential status */}
      {credStatus === "loading" && (
        <div className="cs-cred-notice">
          <span className="cs-cred-notice__icon">⏳</span>
          <div className="cs-cred-notice__text">Registering CipherShop as a CipherGate application…</div>
        </div>
      )}
      {credStatus === "just-registered" && (
        <div className="cs-cred-notice cs-cred-notice--success" style={{ marginBottom: 8 }}>
          <span className="cs-cred-notice__icon">✅</span>
          <div className="cs-cred-notice__text">
            <strong style={{ color: "var(--cs-green)" }}>CipherShop registered with CipherGate.</strong>{" "}
            API Key and HMAC secret auto-provisioned. All payments will be signed and routed through the security gateway.
          </div>
        </div>
      )}
      {credStatus === "error" && (
        <div className="cs-cred-notice" style={{ background: "var(--danger-dim)", borderColor: "rgba(255,93,115,0.25)", marginBottom: 8 }}>
          <span className="cs-cred-notice__icon">⚠️</span>
          <div className="cs-cred-notice__text" style={{ color: "var(--danger)" }}>
            Could not register with CipherGate. Make sure the backend is running on port 8000.
          </div>
        </div>
      )}

      {/* Content */}
      {tab === "checkout" && selectedProduct ? (
        <CheckoutPanel
          product={selectedProduct}
          creds={creds}
          onBack={() => { setTab("home"); setSelectedProduct(null); }}
          onNavigateToSecurityDemo={onNavigateToSecurityDemo}
        />
      ) : tab === "cart" ? (
        <>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--cs-accent)", marginBottom: 6 }}>CipherShop</div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Shopping Cart</h1>
          </div>
          <CartView cart={cart} onRemove={handleRemoveFromCart} onCheckout={handleSelectProduct} />
        </>
      ) : (
        <>
          {/* Hero */}
          <div className="cs-hero">
            <div className="cs-hero__eyebrow">CipherShop</div>
            <h1 className="cs-hero__title">Sample REST API Client<br />Protected by CipherGate</h1>
            <p className="cs-hero__subtitle">
              CipherShop demonstrates how a real-world e-commerce application communicates with CipherGate.
              Every payment request is HMAC-signed, timestamp-validated, nonce-protected, and rate-limited before reaching the backend.
            </p>
            <div className="cs-hero__arch">
              <span style={{ color: "var(--cs-accent)", fontWeight: 700 }}>CipherShop</span>
              <span className="cs-hero__arch-arrow">→</span>
              <span className="cs-hero__arch-cg">CipherGate</span>
              <span className="cs-hero__arch-arrow">→</span>
              <span>Demo Backend</span>
            </div>
          </div>

          {/* Products */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", marginBottom: 14 }}>
              Select a product to trigger a real HMAC-signed API request through CipherGate:
            </div>
            <div className="cs-products">
              {PRODUCTS.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onSelect={handleSelectProduct}
                  inCart={cart.some(c => c.id === p.id)}
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
