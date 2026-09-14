/**
 * SecurityDemo — CipherShop Attack Simulator
 *
 * All 5 attack scenarios send REAL HTTP requests through the live CipherGate
 * security pipeline. No results are faked or hard-coded.
 *
 * Architecture: CipherShop → CipherGate → (ALLOW → Demo Backend | BLOCK → Audit Log)
 */
import { useState, useCallback } from "react";
import SecurityPipeline from "../components/SecurityPipeline.jsx";
import { generateTimestamp, generateNonce, signRequest } from "../services/crypto.js";
import { apiPostRaw, BASE_URL } from "../services/api.js";
import "./SecurityDemo.css";

// ── Credential helpers ────────────────────────────────────────────────────

function getStoredCreds() {
  return {
    api_key: localStorage.getItem("cs_api_key") || "",
    hmac_secret: localStorage.getItem("cs_hmac_secret") || "",
  };
}

async function ensureCredsThenRun(fn) {
  let creds = getStoredCreds();
  if (!creds.api_key || !creds.hmac_secret) {
    // Auto-register if not yet done
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "CipherShop Demo" }),
      });
      const data = await res.json();
      localStorage.setItem("cs_api_key", data.api_key);
      localStorage.setItem("cs_hmac_secret", data.hmac_secret);
      creds = { api_key: data.api_key, hmac_secret: data.hmac_secret };
    } catch {
      return null;
    }
  }
  return fn(creds);
}

// ── Shared request builder ────────────────────────────────────────────────

async function sendSigned(creds, body, { tsOverride, nonceOverride } = {}) {
  const bodyRaw = JSON.stringify(body);
  const ts = tsOverride ?? generateTimestamp();
  const n = nonceOverride ?? generateNonce();
  const sig = await signRequest({
    secret: creds.hmac_secret,
    method: "POST",
    path: "/api/payment",
    timestamp: ts,
    nonce: n,
    bodyRaw,
  });
  const res = await apiPostRaw("/api/payment", bodyRaw, {
    "X-API-Key": creds.api_key,
    "X-Timestamp": ts,
    "X-Nonce": n,
    "X-Signature": sig,
  });
  return { res, ts, n, sig };
}

// ── ResultBox ──────────────────────────────────────────────────────────────

function ResultBox({ result, label = "" }) {
  if (!result) return null;
  const decision = result.data?.decision;
  const allowed = decision?.allowed === true;
  const tone = allowed ? "allowed" : "blocked";
  return (
    <div className={`sd-result sd-result--${tone}`}>
      {label && <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)", marginBottom: 4 }}>{label}</div>}
      <div className="sd-result__verdict">
        {allowed ? "✓ REQUEST ALLOWED" : `✗ REQUEST BLOCKED`}
      </div>
      <div className="sd-result__http">
        HTTP {result.status} · {result.data?.error || (allowed ? "OK" : "BLOCKED")}
      </div>
      {result.data?.message && (
        <div className="sd-result__reason">{result.data.message}</div>
      )}
      {decision?.checks && Object.keys(decision.checks).length > 0 && (
        <SecurityPipeline checks={decision.checks} allowed={allowed} compact />
      )}
    </div>
  );
}

// ── 1. Valid Request ───────────────────────────────────────────────────────

function ValidRequest({ baseData }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setResult(null);
    await ensureCredsThenRun(async (creds) => {
      const { res } = await sendSigned(creds, baseData);
      setResult(res);
    });
    setLoading(false);
  }, []);

  return (
    <div className="sd-section">
      <div className="sd-section__header">
        <span className="sd-section__num">01</span>
        <span className="sd-section__title">Valid Request</span>
      </div>
      <div className="sd-section__body">
        <div className="sd-section__desc">
          A fully signed, fresh, unique request. API key valid, HMAC covers the exact body,
          timestamp is within the replay window, nonce is unseen, rate limit not exceeded.
          Expected: <strong style={{ color: "var(--success)" }}>HTTP 200 — ALLOWED</strong>.
        </div>
        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius)", padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
          <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Request</div>
          <div>POST /api/payment</div>
          <div style={{ color: "var(--text-dim)" }}>Client: {baseData.receiver}</div>
          <div style={{ color: "var(--cs-accent, #f5a623)" }}>Amount: ₹{baseData.amount.toLocaleString("en-IN")}</div>
        </div>
        <button id="btn-sd-valid" className="sd-btn sd-btn--primary" onClick={run} disabled={loading}>
          {loading ? <><span className="sd-btn__spinner" /> Sending...</> : "▶ Send Valid Request"}
        </button>
        <ResultBox result={result} />
      </div>
    </div>
  );
}

// ── 2. Request Tampering ──────────────────────────────────────────────────

function TamperingAttack({ baseData }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setResult(null);
    await ensureCredsThenRun(async (creds) => {
      // Sign the ORIGINAL body
      const originalBody = baseData;
      const originalRaw = JSON.stringify(originalBody);
      const ts = generateTimestamp();
      const n = generateNonce();
      const sig = await signRequest({
        secret: creds.hmac_secret,
        method: "POST",
        path: "/api/payment",
        timestamp: ts,
        nonce: n,
        bodyRaw: originalRaw,
      });

      // But SEND the tampered body (amount x 10) with the original signature
      const tamperedBody = { ...baseData, amount: baseData.amount * 10 };
      const tamperedRaw = JSON.stringify(tamperedBody);

      const res = await apiPostRaw("/api/payment", tamperedRaw, {
        "X-API-Key": creds.api_key,
        "X-Timestamp": ts,
        "X-Nonce": n,
        "X-Signature": sig, // ← original signature, wrong for tampered body
      });
      setResult(res);
    });
    setLoading(false);
  }, []);

  return (
    <div className="sd-section">
      <div className="sd-section__header">
        <span className="sd-section__num">02</span>
        <span className="sd-section__title">Request Tampering Attack</span>
      </div>
      <div className="sd-section__body">
        <div className="sd-section__desc">
          A legitimate request is signed for ₹{baseData.amount.toLocaleString("en-IN")}. An attacker modifies the amount to ₹{(baseData.amount * 10).toLocaleString("en-IN")}
          <em> without regenerating the HMAC</em>. CipherGate computes the HMAC over the received body
          and compares it to the original signature — they won't match.
          Expected: <strong style={{ color: "var(--danger)" }}>HTTP 403 — HMAC_VERIFICATION_FAILED</strong>.
        </div>

        {/* MitM visualization */}
        <div className="sd-mitm">
          <div className="sd-mitm__title">🔍 Man-in-the-Middle Style Modification</div>
          <div className="sd-mitm-node sd-arch-node--client">CipherShop</div>
          <div className="sd-mitm-arrow">
            <span className="sd-mitm-arrow__line">│  Original: amount = ₹{baseData.amount.toLocaleString("en-IN")}</span>
            <span className="sd-mitm-arrow__line">↓  HMAC signed for ₹{baseData.amount.toLocaleString("en-IN")}</span>
          </div>
          <div className="sd-mitm-node" style={{ background: "var(--warning-dim)", borderColor: "rgba(245,185,66,0.4)", color: "var(--warning)", minWidth: 200, textAlign: "center", padding: "10px 16px", borderRadius: "var(--radius)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>
            ⚡ Attack Simulator
          </div>
          <div className="sd-mitm-arrow">
            <span className="sd-mitm-arrow__line">│  Modified: amount = ₹{(baseData.amount * 10).toLocaleString("en-IN")}</span>
            <span className="sd-mitm-arrow__line">↓  ORIGINAL HMAC (wrong!)</span>
          </div>
          <div className="sd-mitm-node sd-arch-node--gateway">CipherGate</div>
          <div className="sd-mitm-arrow">
            <span className="sd-mitm-arrow__line">│  HMAC mismatch detected</span>
            <span className="sd-mitm-arrow__line">↓</span>
          </div>
          <div className="sd-mitm-node sd-arch-node--blocked">BLOCKED — 403</div>
        </div>

        <div className="sd-compare">
          <div className="sd-code-block sd-code-block--original">
            <div className="sd-code-block__header">✓ Signed (Original)</div>
            <div className="sd-code-block__body">{`{\n  "amount": ${baseData.amount},\n  "receiver": "${baseData.receiver}"\n}`}</div>
          </div>
          <div className="sd-code-block sd-code-block--tampered">
            <div className="sd-code-block__header">✗ Sent (Tampered)</div>
            <div className="sd-code-block__body">{`{\n  "amount": ${baseData.amount * 10},\n  "receiver": "${baseData.receiver}"\n}`}</div>
          </div>
        </div>

        <button id="btn-sd-tamper" className="sd-btn sd-btn--danger" onClick={run} disabled={loading}>
          {loading ? <><span className="sd-btn__spinner" /> Attacking...</> : "⚡ Run Tampering Attack"}
        </button>
        <ResultBox result={result} />
      </div>
    </div>
  );
}

// ── 3. Replay Attack ───────────────────────────────────────────────────────

function ReplayAttack({ baseData }) {
  const [loading, setLoading] = useState(false);
  const [step1Result, setStep1Result] = useState(null);
  const [step2Result, setStep2Result] = useState(null);
  const [savedReq, setSavedReq] = useState(null);

  const runStep1 = useCallback(async () => {
    setLoading(true);
    setStep1Result(null);
    setStep2Result(null);
    setSavedReq(null);
    await ensureCredsThenRun(async (creds) => {
      const body = baseData;
      const bodyRaw = JSON.stringify(body);
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
      const res = await apiPostRaw("/api/payment", bodyRaw, {
        "X-API-Key": creds.api_key,
        "X-Timestamp": ts,
        "X-Nonce": n,
        "X-Signature": sig,
      });
      setStep1Result(res);
      setSavedReq({ bodyRaw, ts, n, sig, apiKey: creds.api_key });
    });
    setLoading(false);
  }, []);

  const runStep2 = useCallback(async () => {
    if (!savedReq) return;
    setLoading(true);
    setStep2Result(null);
    // Replay: identical headers + body as step 1
    const res = await apiPostRaw("/api/payment", savedReq.bodyRaw, {
      "X-API-Key": savedReq.apiKey,
      "X-Timestamp": savedReq.ts,
      "X-Nonce": savedReq.n,
      "X-Signature": savedReq.sig,
    });
    setStep2Result(res);
    setLoading(false);
  }, [savedReq]);

  return (
    <div className="sd-section">
      <div className="sd-section__header">
        <span className="sd-section__num">03</span>
        <span className="sd-section__title">Replay Attack</span>
      </div>
      <div className="sd-section__body">
        <div className="sd-section__desc">
          A valid signed request is captured and re-sent with the exact same nonce. CipherGate
          stores all used nonces and rejects any request that reuses one — even if the signature
          is mathematically valid. Expected: first request 200 OK, second request
          <strong style={{ color: "var(--danger)" }}> HTTP 409 — REPLAY_ATTACK</strong>.
        </div>
        <div className="sd-replay-steps">
          <div className="sd-replay-step">
            <div className="sd-replay-step__label">Step 1 — Original Request</div>
            <button id="btn-sd-replay-1" className="sd-btn sd-btn--primary" style={{ marginBottom: 12, width: "100%" }} onClick={runStep1} disabled={loading}>
              {loading && !savedReq ? <><span className="sd-btn__spinner" /> Sending...</> : "▶ Send Valid Request"}
            </button>
            {step1Result && <ResultBox result={step1Result} label="First request" />}
          </div>
          <div className="sd-replay-step">
            <div className="sd-replay-step__label">Step 2 — Replay (Same Nonce)</div>
            <button id="btn-sd-replay-2" className="sd-btn sd-btn--danger" style={{ marginBottom: 12, width: "100%" }} onClick={runStep2} disabled={loading || !savedReq}>
              {loading && savedReq ? <><span className="sd-btn__spinner" /> Replaying...</> : "⚡ Replay Exact Request"}
            </button>
            {!savedReq && <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>Run Step 1 first to capture the request.</div>}
            {step2Result && <ResultBox result={step2Result} label="Replay attempt" />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 4. Expired Timestamp ───────────────────────────────────────────────────

function ExpiredTimestamp({ baseData }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setResult(null);
    await ensureCredsThenRun(async (creds) => {
      // Use a timestamp 10 minutes in the past (well outside the 30s window)
      const oldTs = ((Date.now() / 1000) - 600).toFixed(3);
      const body = baseData;
      const bodyRaw = JSON.stringify(body);
      const n = generateNonce();
      // Signature IS valid — computed with the old timestamp
      const sig = await signRequest({
        secret: creds.hmac_secret,
        method: "POST",
        path: "/api/payment",
        timestamp: oldTs,
        nonce: n,
        bodyRaw,
      });
      const res = await apiPostRaw("/api/payment", bodyRaw, {
        "X-API-Key": creds.api_key,
        "X-Timestamp": oldTs,
        "X-Nonce": n,
        "X-Signature": sig,
      });
      setResult(res);
    });
    setLoading(false);
  }, []);

  return (
    <div className="sd-section">
      <div className="sd-section__header">
        <span className="sd-section__num">04</span>
        <span className="sd-section__title">Expired Timestamp Attack</span>
      </div>
      <div className="sd-section__body">
        <div className="sd-section__desc">
          A request is constructed with a timestamp 10 minutes in the past — far outside the configured
          <strong style={{ color: "var(--accent)" }}> REPLAY_WINDOW_SECONDS = 30</strong> window.
          The HMAC is correctly computed using that old timestamp, so the signature itself is cryptographically valid.
          CipherGate still blocks it because the request is too stale.
          Expected: <strong style={{ color: "var(--danger)" }}>HTTP 408 — TIMESTAMP_EXPIRED</strong>.
        </div>
        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius)", padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Injected timestamp</div>
          <div style={{ color: "var(--danger)" }}>X-Timestamp: {`<now - 600s>`}</div>
          <div style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 6 }}>HMAC is valid (signed with the old timestamp) — but timestamp is outside replay window</div>
        </div>
        <button id="btn-sd-expired" className="sd-btn sd-btn--warning" onClick={run} disabled={loading}>
          {loading ? <><span className="sd-btn__spinner" /> Sending...</> : "⏱ Send Expired Timestamp"}
        </button>
        <ResultBox result={result} />
      </div>
    </div>
  );
}

// ── 5. Rate Limit Burst ────────────────────────────────────────────────────

function RateLimitBurst({ baseData }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState([]);  // array of "allowed" | "blocked" | "pending"
  const TOTAL = 25;

  const run = useCallback(async () => {
    setLoading(true);
    setProgress([]);
    await ensureCredsThenRun(async (creds) => {
      const dots = new Array(TOTAL).fill("pending");
      setProgress([...dots]);

      for (let i = 0; i < TOTAL; i++) {
        const body = { ...baseData, receiver: `${baseData.receiver} (Burst-${i + 1})` };
        const bodyRaw = JSON.stringify(body);
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
        const res = await apiPostRaw("/api/payment", bodyRaw, {
          "X-API-Key": creds.api_key,
          "X-Timestamp": ts,
          "X-Nonce": n,
          "X-Signature": sig,
        });
        const status = res.data?.decision?.allowed === true ? "allowed" : "blocked";
        dots[i] = status;
        setProgress([...dots]);
      }
    });
    setLoading(false);
  }, []);

  const done = progress.filter(d => d !== "pending");
  const allowed = done.filter(d => d === "allowed").length;
  const blocked = done.filter(d => d === "blocked").length;

  return (
    <div className="sd-section">
      <div className="sd-section__header">
        <span className="sd-section__num">05</span>
        <span className="sd-section__title">Rate Limit Burst Attack</span>
      </div>
      <div className="sd-section__body">
        <div className="sd-section__desc">
          25 sequential requests are sent from CipherShop. The gateway's per-application rate limit is
          <strong style={{ color: "var(--accent)" }}> DEFAULT_RATE_LIMIT = 20 per 60s</strong>.
          After the 20th request, subsequent ones are rejected with
          <strong style={{ color: "var(--danger)" }}> HTTP 429 — RATE_LIMIT_EXCEEDED</strong>.
          Each request uses a fresh nonce and timestamp — the replay and HMAC checks all pass.
          Only the rate limiter blocks them.
        </div>
        <button id="btn-sd-ratelimit" className="sd-btn sd-btn--danger" onClick={run} disabled={loading}>
          {loading ? <><span className="sd-btn__spinner" /> Sending {done.length}/{TOTAL}...</> : `⚡ Send ${TOTAL} Requests`}
        </button>
        {progress.length > 0 && (
          <div className="sd-rate-progress">
            <div className="sd-rate-progress__label">
              <span>Requests sent: {done.length} / {TOTAL}</span>
              {done.length === TOTAL && (
                <span>
                  <span style={{ color: "var(--success)" }}>✓ Allowed: {allowed}</span>
                  {"  "}
                  <span style={{ color: "var(--danger)" }}>✗ Blocked: {blocked}</span>
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              <div className="sd-rate-bar-track" style={{ flex: 1 }}>
                <div className="sd-rate-bar-fill sd-rate-bar-fill--allowed" style={{ width: `${(allowed / TOTAL) * 100}%` }} />
              </div>
              <div className="sd-rate-bar-track" style={{ flex: 1 }}>
                <div className="sd-rate-bar-fill sd-rate-bar-fill--blocked" style={{ width: `${(blocked / TOTAL) * 100}%` }} />
              </div>
            </div>
            <div className="sd-rate-dots">
              {progress.map((state, i) => (
                <div key={i} className={`sd-rate-dot ${state !== "pending" ? `sd-rate-dot--${state}` : ""}`} title={`Request ${i + 1}: ${state}`}>
                  {i + 1}
                </div>
              ))}
            </div>
            {done.length === TOTAL && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg-raised)", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
                <div style={{ color: "var(--success)", marginBottom: 4 }}>✓ ALLOWED: {allowed} requests passed all security checks</div>
                <div style={{ color: "var(--danger)" }}>✗ BLOCKED: {blocked} requests → HTTP 429 RATE_LIMIT_EXCEEDED</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Architecture Diagram ───────────────────────────────────────────────────

function ArchDiagram() {
  return (
    <div className="sd-arch">
      <div className="sd-arch__title">Security Pipeline Architecture</div>
      <div className="sd-arch-flow">
        <div className="sd-arch-node sd-arch-node--client">CipherShop</div>
        <div className="sd-arch-arrow"><span>↓</span><span className="sd-arch-arrow__label">Signed Request</span></div>
        {["API Key", "HMAC-SHA256", "Timestamp", "Nonce/Replay", "Rate Limit"].map((check, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "var(--accent-dim)", border: "1px solid rgba(47,212,224,0.3)", color: "var(--accent)", padding: "7px 20px", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, minWidth: 160, textAlign: "center" }}>
              {check}
            </div>
            {i < 4 && <div className="sd-arch-arrow"><span>↓</span></div>}
          </div>
        ))}
        <div className="sd-arch-arrow"><span>↓</span><span className="sd-arch-arrow__label">Decision Engine</span></div>
        <div className="sd-arch-split">
          <div className="sd-arch-branch">
            <div className="sd-arch-node sd-arch-node--backend">ALLOW → Backend</div>
          </div>
          <div className="sd-arch-branch">
            <div className="sd-arch-node sd-arch-node--blocked">BLOCK → Audit Log</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard() {
  return (
    <div className="sd-summary">
      <div className="sd-summary__header">📊 Attack Results Summary</div>
      <div className="sd-summary__grid">
        {[
          { attack: "Valid Request", verdict: "ALLOWED", detail: "All checks pass", cls: "allowed" },
          { attack: "Request Tampering", verdict: "BLOCKED", detail: "HMAC mismatch", cls: "blocked" },
          { attack: "Replay Attack", verdict: "BLOCKED", detail: "Nonce already used", cls: "blocked" },
          { attack: "Expired Timestamp", verdict: "BLOCKED", detail: "Request too stale", cls: "blocked" },
          { attack: "Rate Limit Burst", verdict: "BLOCKED", detail: "After ~20 requests", cls: "blocked" },
        ].map((item, i) => (
          <div className="sd-summary__item" key={i}>
            <div className="sd-summary__attack">{item.attack}</div>
            <span className={`sd-summary__verdict sd-summary__verdict--${item.cls}`}>{item.verdict}</span>
            <div className="sd-summary__detail">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function SecurityDemo({ onNavigateToShop, transactionData }) {
  const baseData = transactionData || { amount: 5000, receiver: "CipherShop Demo" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {/* Page header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            onClick={() => onNavigateToShop?.()}
            style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 13, padding: 0, display: "flex", alignItems: "center", gap: 5 }}
          >
            ← CipherShop
          </button>
          <div style={{ height: 14, width: 1, background: "var(--border)" }} />
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--cs-accent, #f5a623)" }}>
            Attack Simulator
          </div>
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800 }}>Security Demo</h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-dim)", maxWidth: "56ch", lineHeight: 1.6 }}>
          Controlled attack demonstrations against the local CipherGate gateway.
          Every test sends a real HTTP request — no results are simulated.
        </p>
      </div>

      {/* Warning banner */}
      <div className="sd-banner">
        <span className="sd-banner__icon">🛡️</span>
        <div>
          <div className="sd-banner__title">Controlled Security Demonstration</div>
          <div className="sd-banner__body">
            All attacks are simulated against the <strong>local CipherShop demo environment only</strong>.
            No external websites or third-party APIs are contacted. Every result you see comes
            from the real CipherGate security pipeline running on your machine.
          </div>
        </div>
      </div>

      {/* Architecture diagram */}
      <ArchDiagram />

      {/* Attack sections */}
      <ValidRequest baseData={baseData} />
      <TamperingAttack baseData={baseData} />
      <ReplayAttack baseData={baseData} />
      <ExpiredTimestamp baseData={baseData} />
      <RateLimitBurst baseData={baseData} />

      {/* Summary */}
      <SummaryCard />

      {/* Note about dashboard */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius)", padding: "16px 20px", fontSize: 13, color: "var(--text-dim)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
          📈 Dashboard Integration
        </strong>
        Every request sent from this page is processed by CipherGate's security pipeline and recorded in the
        audit log. Open the <strong style={{ color: "var(--text)" }}>Dashboard</strong> or{" "}
        <strong style={{ color: "var(--text)" }}>Security Events</strong> pages to see all events —
        including allowed requests, HMAC failures, replay detections, and rate limit violations —
        reflected in real time.
      </div>
    </div>
  );
}
