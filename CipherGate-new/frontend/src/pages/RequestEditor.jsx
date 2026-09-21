import { useState } from "react";
import { Page, Panel, Button } from "../components/Primitives.jsx";
import SecurityPipeline from "../components/SecurityPipeline.jsx";
import { generateTimestamp, generateNonce, signRequest } from "../services/crypto.js";
import { apiPostRaw } from "../services/api.js";

const DEFAULT_BODY = JSON.stringify({ amount: 500, receiver: "ABC Store" }, null, 2);

// The gateway (and normal HTTP URLs) use absolute paths. Accept the more
// natural `api/items` entry too, so it is signed and forwarded as `/api/items`.
const normalizePath = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return "/api/payment";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

export default function RequestEditor({ credentials, onNavigate }) {
  const [method, setMethod] = useState("POST");
  const [path, setPath] = useState("/api/payment");
  const [apiKey, setApiKey] = useState(credentials?.api_key || "");
  const [hmacSecret, setHmacSecret] = useState(credentials?.hmac_secret || "");
  const [bodyText, setBodyText] = useState(DEFAULT_BODY);
  const [timestamp, setTimestamp] = useState("");
  const [nonce, setNonce] = useState("");
  const [signature, setSignature] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { status, data }
  const [rateBusy, setRateBusy] = useState(false);

  const compactBody = () => {
    try {
      return JSON.stringify(JSON.parse(bodyText));
    } catch {
      return bodyText;
    }
  };

  const doGenerateTimestamp = () => setTimestamp(generateTimestamp());
  const doGenerateNonce = () => setNonce(generateNonce());

  const doGenerateHmac = async () => {
    if (!hmacSecret) return;
    const ts = timestamp || generateTimestamp();
    const n = nonce || generateNonce();
    if (!timestamp) setTimestamp(ts);
    if (!nonce) setNonce(n);
    const sig = await signRequest({ secret: hmacSecret, method, path: normalizePath(path), timestamp: ts, nonce: n, bodyRaw: compactBody() });
    setSignature(sig);
  };

  const send = async (opts = {}) => {
    setSending(true);
    const headers = {
      "X-API-Key": apiKey,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
      "X-Signature": signature,
    };
    let innerBody;
    try {
      innerBody = JSON.parse(opts.bodyOverride !== undefined ? opts.bodyOverride : compactBody());
    } catch {
      innerBody = {};
    }
    const envelope = JSON.stringify({ method, path: normalizePath(path), body: innerBody });
    const res = await apiPostRaw("/gateway/request", envelope, headers);
    setResult(res);
    setSending(false);
  };

  const sendAgain = () => send(); // deliberately reuses the same timestamp/nonce/signature

  const reset = () => {
    setMethod("POST");
    setPath("/api/payment");
    setBodyText(DEFAULT_BODY);
    setTimestamp("");
    setNonce("");
    setSignature("");
    setResult(null);
  };

  const sendRateLimitBurst = async () => {
    setRateBusy(true);
    let lastRes = null;
    for (let i = 0; i < 25; i++) {
      const ts = generateTimestamp();
      const n = generateNonce();
      const innerBody = { amount: 10 + i, receiver: "Bulk Test" };
      const bodyRaw = JSON.stringify(innerBody);
      const targetPath = normalizePath(path);
      const sig = await signRequest({ secret: hmacSecret, method: "POST", path: targetPath, timestamp: ts, nonce: n, bodyRaw });
      const envelope = JSON.stringify({ method: "POST", path: targetPath, body: innerBody });
      lastRes = await apiPostRaw("/gateway/request", envelope, {
        "X-API-Key": apiKey,
        "X-Timestamp": ts,
        "X-Nonce": n,
        "X-Signature": sig,
      });
    }
    setResult(lastRes);
    setRateBusy(false);
  };

  const checks = result?.data?.decision?.checks || (result?.status === 200 ? null : null);
  const allowed = result?.data?.decision?.allowed;

  return (
    <Page
      eyebrow="Live Testing"
      title="API Request Editor"
      subtitle="Build a real signed request, then tamper with it, replay it, or flood it — every check below is computed by the live gateway, not simulated."
      actions={
        onNavigate && (
          <Button variant="secondary" onClick={() => onNavigate("help")}>
            📖 View Pipeline & Attack Guide
          </Button>
        )
      }
    >
      <Panel title="Client credentials">
        <div className="field-row">
          <div className="field-group" style={{ flex: "1 1 300px" }}>
            <label className="field-label">API Key</label>
            <input className="input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="cg_live_..." style={{ width: "100%" }} />
          </div>
          <div className="field-group" style={{ flex: "1 1 300px" }}>
            <label className="field-label">HMAC Secret (used locally to sign — never sent to the server)</label>
            <input className="input" value={hmacSecret} onChange={(e) => setHmacSecret(e.target.value)} placeholder="paste the secret from Applications" style={{ width: "100%" }} />
          </div>
        </div>
      </Panel>

      <Panel title="Request">
        <div className="field-row" style={{ marginBottom: 14 }}>
          <div className="field-group">
            <label className="field-label">Method</label>
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>POST</option>
              <option>GET</option>
            </select>
          </div>
          <div className="field-group" style={{ flex: 1 }}>
            <label className="field-label">Endpoint path</label>
            <input className="input" value={path} onChange={(e) => setPath(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        <div className="field-group" style={{ marginBottom: 14 }}>
          <label className="field-label">JSON body</label>
          <textarea className="textarea" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
        </div>

        <div className="field-row" style={{ marginBottom: 14 }}>
          <div className="field-group" style={{ flex: "1 1 220px" }}>
            <label className="field-label">Timestamp</label>
            <input className="input" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} placeholder="unix seconds" style={{ width: "100%" }} />
          </div>
          <div className="field-group" style={{ flex: "1 1 260px" }}>
            <label className="field-label">Nonce</label>
            <input className="input" value={nonce} onChange={(e) => setNonce(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        <div className="field-group" style={{ marginBottom: 18 }}>
          <label className="field-label">HMAC-SHA256 Signature</label>
          <input className="input" value={signature} onChange={(e) => setSignature(e.target.value)} style={{ width: "100%" }} />
        </div>

        <div className="field-row">
          <Button variant="secondary" onClick={doGenerateTimestamp}>Generate Timestamp</Button>
          <Button variant="secondary" onClick={doGenerateNonce}>Generate Nonce</Button>
          <Button variant="secondary" onClick={doGenerateHmac} disabled={!hmacSecret}>Generate HMAC</Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={reset}>Reset</Button>
          <Button variant="danger" onClick={sendAgain} disabled={sending || !nonce}>Send Again (same nonce)</Button>
          <Button onClick={() => send()} disabled={sending || !apiKey}>{sending ? "Sending..." : "Send Request"}</Button>
        </div>
      </Panel>

      <Panel
        title="Attack demonstrations"
      >
        <div className="field-row">
          <Button variant="secondary" onClick={sendRateLimitBurst} disabled={rateBusy || !hmacSecret}>
            {rateBusy ? "Sending 25 requests..." : "Send 25 Requests (rate limit demo)"}
          </Button>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
          Tampering demo: send a valid request, then edit the body above (e.g. change the amount) without
          regenerating the HMAC, and send again — CipherGate recalculates the signature server-side and blocks it.
        </p>
      </Panel>

      <Panel title="Security Verification">
        <SecurityPipeline checks={checks} allowed={allowed} />
        {result && (
          <div style={{ marginTop: 18 }}>
            <label className="field-label">Response — HTTP {result.status}</label>
            <div className="response-block">{JSON.stringify(result.data, null, 2)}</div>
          </div>
        )}
      </Panel>
    </Page>
  );
}
