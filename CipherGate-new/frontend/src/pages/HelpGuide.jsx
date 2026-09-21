import { useState, useEffect } from "react";
import { Page, Panel, Button, StatusBadge, EventTypeTag } from "../components/Primitives.jsx";
import { generateTimestamp, generateNonce, signRequest } from "../services/crypto.js";
import "./HelpGuide.css";

const CODE_EXAMPLES = {
  python: {
    title: "Python (httpx / requests)",
    lang: "python",
    code: `import hashlib
import hmac
import json
import secrets
import time
import httpx

CIPHERGATE_URL = "http://localhost:8000"
API_KEY = "cg_live_your_api_key_here"
HMAC_SECRET = "your_hmac_secret_here"

def serialize_body(body: dict) -> str:
    """Compact JSON serialization without whitespace"""
    return json.dumps(body, separators=(",", ":"), ensure_ascii=False)

def canonical_request(method: str, path: str, timestamp: str, nonce: str, body_raw: str) -> str:
    """Format: METHOD\\nPATH\\nTIMESTAMP\\nNONCE\\nBODY"""
    return "\\n".join([method.upper(), path, timestamp, nonce, body_raw])

def send_protected_request(target_path: str, body: dict):
    # 1. Generate timestamp (seconds) and cryptographic nonce
    timestamp = str(int(time.time()))
    nonce = secrets.token_urlsafe(24)
    body_raw = serialize_body(body)

    # 2. Build canonical string & compute HMAC-SHA256 signature
    canonical = canonical_request("POST", target_path, timestamp, nonce, body_raw)
    signature = hmac.new(
        HMAC_SECRET.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    # 3. Dispatch HTTP POST to CipherGate gateway endpoint
    headers = {
        "X-API-Key": API_KEY,
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Signature": signature,
        "Content-Type": "application/json",
    }
    
    envelope = {
        "method": "POST",
        "path": target_path,
        "body": body,
    }

    response = httpx.post(f"{CIPHERGATE_URL}/gateway/request", headers=headers, json=envelope)
    return response.status_code, response.json()

# Example invocation
if __name__ == "__main__":
    status, data = send_protected_request("/api/orders", {"item_id": "laptop-pro", "qty": 1, "price": 1299})
    print(f"Status: {status}\\nResponse:", data)
`,
  },
  nodejs: {
    title: "Node.js (Fetch & Crypto)",
    lang: "javascript",
    code: `import crypto from "node:crypto";

const CIPHERGATE_URL = "http://localhost:8000";
const API_KEY = "cg_live_your_api_key_here";
const HMAC_SECRET = "your_hmac_secret_here";

function canonicalRequest(method, path, timestamp, nonce, bodyRaw) {
  return [method.toUpperCase(), path, timestamp, nonce, bodyRaw].join("\\n");
}

async function sendProtectedRequest(targetPath, body) {
  // 1. Generate timestamp and random cryptographic nonce
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const bodyRaw = JSON.stringify(body);

  // 2. Build canonical string & compute HMAC-SHA256 signature
  const canonical = canonicalRequest("POST", targetPath, timestamp, nonce, bodyRaw);
  const signature = crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(canonical, "utf8")
    .digest("hex");

  // 3. Dispatch to CipherGate Gateway
  const response = await fetch(\`\${CIPHERGATE_URL}/gateway/request\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
      "X-Signature": signature,
    },
    body: JSON.stringify({
      method: "POST",
      path: targetPath,
      body: body,
    }),
  });

  const data = await response.json();
  return { status: response.status, data };
}

// Example invocation
const result = await sendProtectedRequest("/api/orders", { itemId: "tablet-air", quantity: 2 });
console.log("Status:", result.status, "Data:", result.data);
`,
  },
  curl: {
    title: "cURL / Bash Script",
    lang: "bash",
    code: `#!/usr/bin/env bash

CIPHERGATE_URL="http://localhost:8000"
API_KEY="cg_live_your_api_key_here"
HMAC_SECRET="your_hmac_secret_here"

METHOD="POST"
TARGET_PATH="/api/payment"
BODY_RAW='{"amount":500,"receiver":"Demo Store"}'

TIMESTAMP=$(date +%s)
NONCE=$(openssl rand -hex 12)

# Construct canonical string (METHOD\\nPATH\\nTIMESTAMP\\nNONCE\\nBODY)
CANONICAL=$(printf "%s\\n%s\\n%s\\n%s\\n%s" "$METHOD" "$TARGET_PATH" "$TIMESTAMP" "$NONCE" "$BODY_RAW")

# Calculate HMAC-SHA256 signature
SIGNATURE=$(printf "%s" "$CANONICAL" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | awk '{print $NF}')

# Send request to CipherGate
curl -X POST "$CIPHERGATE_URL/gateway/request" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $API_KEY" \\
  -H "X-Timestamp: $TIMESTAMP" \\
  -H "X-Nonce: $NONCE" \\
  -H "X-Signature: $SIGNATURE" \\
  -d "{\\"method\\": \\"$METHOD\\", \\"path\\": \\"$TARGET_PATH\\", \\"body\\": $BODY_RAW}"
`,
  },
  golang: {
    title: "Go (Golang)",
    lang: "go",
    code: `package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func generateNonce() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func main() {
	ciphergateURL := "http://localhost:8000"
	apiKey := "cg_live_your_api_key_here"
	hmacSecret := "your_hmac_secret_here"
	targetPath := "/api/orders"
	method := "POST"

	bodyPayload := map[string]interface{}{"item": "keyboard", "price": 99}
	bodyRaw, _ := json.Marshal(bodyPayload)

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	nonce := generateNonce()

	// Canonical format: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY
	canonical := strings.Join([]string{method, targetPath, timestamp, nonce, string(bodyRaw)}, "\n")
	mac := hmac.New(sha256.New, []byte(hmacSecret))
	mac.Write([]byte(canonical))
	signature := hex.EncodeToString(mac.Sum(nil))

	envelope := map[string]interface{}{
		"method": method,
		"path":   targetPath,
		"body":   bodyPayload,
	}
	envelopeJSON, _ := json.Marshal(envelope)

	req, _ := http.NewRequest("POST", ciphergateURL+"/gateway/request", bytes.NewBuffer(envelopeJSON))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", apiKey)
	req.Header.Set("X-Timestamp", timestamp)
	req.Header.Set("X-Nonce", nonce)
	req.Header.Set("X-Signature", signature)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer resp.Body.Close()
	fmt.Println("Gateway Response Status:", resp.Status)
}
`,
  },
};

const FAQ_ITEMS = [
  {
    q: "What is the difference between API Key Authentication and HMAC Request Integrity?",
    a: "The API Key tells CipherGate WHO is calling (identity). The HMAC signature proves WHAT was sent and ensures the request body, method, path, timestamp, and nonce were NOT modified in transit (integrity & authenticity). Even if someone intercepts an API key or proxy traffic, they cannot change a single byte in the request without invalidating the cryptographic HMAC signature.",
  },
  {
    q: "Why do we need both a Timestamp and a Nonce for Replay Protection?",
    a: "Timestamps prevent attackers from reusing old requests indefinitely by enforcing a freshness window (default: 30 seconds). Nonces ensure that within that active freshness window, a specific signed request can only ever be processed once. CipherGate records every used nonce in the database and immediately rejects duplicates with a 409 REPLAY_ATTACK.",
  },
  {
    q: "Where should the HMAC Secret and API Key be stored?",
    a: "CRITICAL: The HMAC Secret and API Key must ALWAYS remain on your backend server (e.g. in environment variables or a secret vault). Never include them in frontend client-side code, mobile binaries, or client browsers. The client browser communicates with your backend, and your backend signs and forwards the request to CipherGate.",
  },
  {
    q: "How does the canonical request format work?",
    a: "CipherGate reconstructs the canonical string using exact newline delimiters: METHOD\\nPATH\\nTIMESTAMP\\nNONCE\\nBODY. The body must be minified JSON (no extra whitespace between keys and values). If even a single space or capitalization differs, the HMAC hash will not match and the gateway will reject it with 403 HMAC_VERIFICATION_FAILED.",
  },
  {
    q: "What happens if CipherGate is unavailable?",
    a: "In a Zero-Trust architecture, if the gateway or security checks cannot be evaluated, the request is safely denied (fail-closed) rather than letting potentially tampered payloads bypass the security perimeter.",
  },
];

export default function HelpGuide({ onNavigate }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedLang, setSelectedLang] = useState("python");
  const [copiedKey, setCopiedKey] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);

  // Interactive Sandbox State
  const [sbMethod, setSbMethod] = useState("POST");
  const [sbPath, setSbPath] = useState("/api/orders");
  const [sbTimestamp, setSbTimestamp] = useState(Math.floor(Date.now() / 1000).toString());
  const [sbNonce, setSbNonce] = useState("a1b2c3d4e5f6");
  const [sbSecret, setSbSecret] = useState("my_super_secret_hmac_key");
  const [sbBody, setSbBody] = useState('{"orderId": 1042, "amount": 89.99}');
  const [sbCanonical, setSbCanonical] = useState("");
  const [sbSignature, setSbSignature] = useState("");

  // Update sandbox calculation
  useEffect(() => {
    let compactBody = sbBody.trim();
    try {
      compactBody = JSON.stringify(JSON.parse(sbBody));
    } catch {
      // Keep as-is if invalid JSON
    }

    const normPath = sbPath.trim().startsWith("/") ? sbPath.trim() : `/${sbPath.trim()}`;
    const canonical = [sbMethod.toUpperCase(), normPath, sbTimestamp, sbNonce, compactBody].join("\n");
    setSbCanonical(canonical);

    if (sbSecret) {
      signRequest({
        secret: sbSecret,
        method: sbMethod.toUpperCase(),
        path: normPath,
        timestamp: sbTimestamp,
        nonce: sbNonce,
        bodyRaw: compactBody,
      }).then((sig) => setSbSignature(sig));
    } else {
      setSbSignature("");
    }
  }, [sbMethod, sbPath, sbTimestamp, sbNonce, sbSecret, sbBody]);

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const generateSandboxValues = () => {
    setSbTimestamp(generateTimestamp());
    setSbNonce(generateNonce());
  };

  return (
    <Page
      eyebrow="Documentation & Integration"
      title="Help & Integration Guide"
      subtitle="Complete guide on how CipherGate works, how to test attack scenarios, and how to seamlessly integrate external applications into the Zero-Trust Gateway."
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => onNavigate?.("applications")}>
            Applications
          </Button>
          <Button variant="primary" onClick={() => onNavigate?.("editor")}>
            Request Editor
          </Button>
        </div>
      }
    >
      <div className="help-container">
        {/* Navigation Tabs */}
        <div className="help-tabs">
          <button
            className={`help-tab ${activeTab === "overview" ? "help-tab--active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            <span className="help-tab__icon">🛡️</span> How to Use CipherGate
          </button>
          <button
            className={`help-tab ${activeTab === "integration" ? "help-tab--active" : ""}`}
            onClick={() => setActiveTab("integration")}
          >
            <span className="help-tab__icon">🔌</span> External App Integration
          </button>
          <button
            className={`help-tab ${activeTab === "code" ? "help-tab--active" : ""}`}
            onClick={() => setActiveTab("code")}
          >
            <span className="help-tab__icon">💻</span> Code Examples & SDKs
          </button>
          <button
            className={`help-tab ${activeTab === "sandbox" ? "help-tab--active" : ""}`}
            onClick={() => setActiveTab("sandbox")}
          >
            <span className="help-tab__icon">🧪</span> Interactive HMAC Sandbox
          </button>
          <button
            className={`help-tab ${activeTab === "ciphershop" ? "help-tab--active" : ""}`}
            onClick={() => setActiveTab("ciphershop")}
          >
            <span className="help-tab__icon">🏪</span> CipherShop Case Study
          </button>
          <button
            className={`help-tab ${activeTab === "troubleshooting" ? "help-tab--active" : ""}`}
            onClick={() => setActiveTab("troubleshooting")}
          >
            <span className="help-tab__icon">❓</span> Codes & Troubleshooting
          </button>
        </div>

        {/* TAB 1: HOW TO USE CIPHERGATE */}
        {activeTab === "overview" && (
          <>
            <div className="help-hero-card">
              <h2>Zero-Trust Request Verification Architecture</h2>
              <p>
                CipherGate acts as a cryptographic shield in front of backend microservices. Standard APIs blindly trust
                payloads once authenticated. CipherGate independently proves request integrity, freshness, and unicity
                using a 5-layer pipeline before routing requests downstream.
              </p>

              <div className="arch-diagram">
                <div className="arch-node arch-node--client">
                  <div className="arch-node__label">Client App / SDK</div>
                  <div className="arch-node__sub">Signs canonical string</div>
                </div>
                <div className="arch-arrow">➔</div>
                <div className="arch-node arch-node--gateway">
                  <div className="arch-node__label">CipherGate Gateway</div>
                  <div className="arch-node__sub">5-stage Security Engine</div>
                </div>
                <div className="arch-arrow">➔</div>
                <div className="arch-node arch-node--backend">
                  <div className="arch-node__label">Target Backend API</div>
                  <div className="arch-node__sub">Protected endpoint</div>
                </div>
              </div>
            </div>

            <Panel title="The 5-Layer Security Pipeline Breakdown">
              <div className="help-pipeline-grid">
                <div className="help-step-card">
                  <div className="help-step-card__num">Layer 1</div>
                  <h3 className="help-step-card__title">Authentication</h3>
                  <p className="help-step-card__desc">
                    Validates the <code>X-API-Key</code> header against registered active clients in the database.
                  </p>
                </div>

                <div className="help-step-card">
                  <div className="help-step-card__num">Layer 2</div>
                  <h3 className="help-step-card__title">Timestamp Freshness</h3>
                  <p className="help-step-card__desc">
                    Enforces a 30s sliding replay window. Rejects expired timestamps or clocks drifting too far in the future.
                  </p>
                </div>

                <div className="help-step-card">
                  <div className="help-step-card__num">Layer 3</div>
                  <h3 className="help-step-card__title">Nonce Replay Protection</h3>
                  <p className="help-step-card__desc">
                    Checks the <code>X-Nonce</code> against persisted nonce history. Prevents repeated execution of duplicate transactions.
                  </p>
                </div>

                <div className="help-step-card">
                  <div className="help-step-card__num">Layer 4</div>
                  <h3 className="help-step-card__title">Per-App Rate Limiter</h3>
                  <p className="help-step-card__desc">
                    Enforces sliding-window request throttling per application key (default 20 req/min) to prevent brute-force flooding.
                  </p>
                </div>

                <div className="help-step-card">
                  <div className="help-step-card__num">Layer 5</div>
                  <h3 className="help-step-card__title">HMAC-SHA256 Integrity</h3>
                  <p className="help-step-card__desc">
                    Recomputes the cryptographic signature over the canonical payload and verifies via constant-time digest comparison.
                  </p>
                </div>
              </div>
            </Panel>

            <Panel title="Step-by-Step UI Walkthrough">
              <div className="features-grid">
                <div className="feature-box">
                  <div className="feature-box__title">
                    <span>1.</span> Register an Application
                  </div>
                  <p className="feature-box__desc">
                    Navigate to the <strong>Applications</strong> tab. Enter your app name to generate a unique API Key and
                    HMAC secret. <em>Note:</em> The HMAC secret is revealed only once!
                  </p>
                </div>

                <div className="feature-box">
                  <div className="feature-box__title">
                    <span>2.</span> Test with Request Editor
                  </div>
                  <p className="feature-box__desc">
                    Head to the <strong>Request Editor</strong>. Click <em>Generate Timestamp</em>, <em>Generate Nonce</em>, and{" "}
                    <em>Generate HMAC</em>. Click <em>Send Request</em> to see all 5 green checks!
                  </p>
                </div>

                <div className="feature-box">
                  <div className="feature-box__title">
                    <span>3.</span> Simulate Attack Scenarios
                  </div>
                  <p className="feature-box__desc">
                    <strong>Tampering:</strong> Modify the JSON amount without regenerating HMAC.
                    <br />
                    <strong>Replay:</strong> Click <em>Send Again</em> with the same nonce.
                    <br />
                    <strong>Rate Limit:</strong> Click <em>Send 25 Requests</em> burst.
                  </p>
                </div>

                <div className="feature-box">
                  <div className="feature-box__title">
                    <span>4.</span> Inspect Audit Logs
                  </div>
                  <p className="feature-box__desc">
                    Review <strong>Security Events</strong> and <strong>Dashboard</strong> to verify how every decision,
                    timestamp, client ID, and block reason is persisted in real time.
                  </p>
                </div>
              </div>
            </Panel>
          </>
        )}

        {/* TAB 2: EXTERNAL APP INTEGRATION */}
        {activeTab === "integration" && (
          <>
            <div className="help-hero-card">
              <h2>How to Connect & Integrate External Applications</h2>
              <p>
                Connecting any external web app, mobile backend, microservice, or eCommerce platform to CipherGate requires
                only standard HTTP headers and HMAC-SHA256 signing.
              </p>
            </div>

            <div className="help-callout help-callout--warning">
              <div className="help-callout__icon">⚠️</div>
              <div>
                <strong>Zero-Trust Secret Management Rule:</strong>
                <br />
                Never expose your <code>HMAC Secret</code> or <code>API Key</code> in public frontend code (browsers or mobile
                clients). External frontend apps should make requests to their own backend, which signs the canonical
                payload and dispatches it to CipherGate.
              </div>
            </div>

            <Panel title="The 5 Integration Steps">
              <div className="help-pipeline-grid">
                <div className="help-step-card">
                  <div className="help-step-card__num">Step 1</div>
                  <h3 className="help-step-card__title">Get Credentials</h3>
                  <p className="help-step-card__desc">
                    Go to <button className="btn btn--ghost" style={{ padding: "2px 6px", fontSize: 11 }} onClick={() => onNavigate?.("applications")}>Applications</button> to register your service and receive your <code>X-API-Key</code> and <code>HMAC Secret</code>.
                  </p>
                </div>

                <div className="help-step-card">
                  <div className="help-step-card__num">Step 2</div>
                  <h3 className="help-step-card__title">Configure Environment</h3>
                  <p className="help-step-card__desc">
                    Save the credentials in your app's <code>.env</code> file:
                    <br />
                    <code>CIPHERGATE_URL=http://localhost:8000</code>
                    <br />
                    <code>CIPHERGATE_API_KEY=cg_live_...</code>
                    <br />
                    <code>CIPHERGATE_HMAC_SECRET=...</code>
                  </p>
                </div>

                <div className="help-step-card">
                  <div className="help-step-card__num">Step 3</div>
                  <h3 className="help-step-card__title">Build Canonical Request</h3>
                  <p className="help-step-card__desc">
                    Join items using newline (<code>\n</code>):
                    <br />
                    <code>METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY</code>
                    <br />
                    Body must be compact JSON without space.
                  </p>
                </div>

                <div className="help-step-card">
                  <div className="help-step-card__num">Step 4</div>
                  <h3 className="help-step-card__title">Sign with HMAC-SHA256</h3>
                  <p className="help-step-card__desc">
                    Compute the HMAC-SHA256 digest using your secret key and format as a lowercase hexadecimal string.
                  </p>
                </div>

                <div className="help-step-card">
                  <div className="help-step-card__num">Step 5</div>
                  <h3 className="help-step-card__title">Dispatch to Gateway</h3>
                  <p className="help-step-card__desc">
                    Send a POST request to <code>/gateway/request</code> with headers and JSON envelope containing target method, path, and body.
                  </p>
                </div>
              </div>
            </Panel>

            <Panel title="Request Specification Reference">
              <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text)" }}>Required Gateway Headers</h4>
              <table className="table" style={{ marginBottom: 20 }}>
                <thead>
                  <tr>
                    <th>Header</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Example</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono">X-API-Key</td>
                    <td>String</td>
                    <td>Issued public application identifier</td>
                    <td className="mono">cg_live_9f8a2b...</td>
                  </tr>
                  <tr>
                    <td className="mono">X-Timestamp</td>
                    <td>Integer (seconds)</td>
                    <td>Unix epoch time when request was created</td>
                    <td className="mono">1758467820</td>
                  </tr>
                  <tr>
                    <td className="mono">X-Nonce</td>
                    <td>String</td>
                    <td>Unique random cryptographic string per request</td>
                    <td className="mono">7b9e31d4f2...</td>
                  </tr>
                  <tr>
                    <td className="mono">X-Signature</td>
                    <td>Hex string</td>
                    <td>HMAC-SHA256 hash over canonical request</td>
                    <td className="mono">4c72a8e10d...</td>
                  </tr>
                  <tr>
                    <td className="mono">Content-Type</td>
                    <td>String</td>
                    <td>Standard JSON header</td>
                    <td className="mono">application/json</td>
                  </tr>
                </tbody>
              </table>

              <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--text)" }}>Gateway Request Envelope (POST /gateway/request)</h4>
              <div className="code-block-wrap">
                <div className="code-block-header">
                  <span className="code-block-lang">JSON ENVELOPE</span>
                  <button
                    className="code-block-copy"
                    onClick={() =>
                      handleCopy(
                        JSON.stringify(
                          {
                            method: "POST",
                            path: "/api/orders",
                            body: {
                              item_id: "macbook-pro",
                              quantity: 1,
                              amount: 1999.0,
                            },
                          },
                          null,
                          2
                        ),
                        "envelope"
                      )
                    }
                  >
                    {copiedKey === "envelope" ? "✓ Copied!" : "📋 Copy"}
                  </button>
                </div>
                <pre className="code-block-pre">{`{
  "method": "POST",
  "path": "/api/orders",
  "body": {
    "item_id": "macbook-pro",
    "quantity": 1,
    "amount": 1999.00
  }
}`}</pre>
              </div>
            </Panel>
          </>
        )}

        {/* TAB 3: CODE EXAMPLES & SDKS */}
        {activeTab === "code" && (
          <>
            <Panel title="Production-Ready Integration Code">
              <div className="lang-selector">
                <button
                  className={`lang-btn ${selectedLang === "python" ? "lang-btn--active" : ""}`}
                  onClick={() => setSelectedLang("python")}
                >
                  Python (FastAPI / Requests)
                </button>
                <button
                  className={`lang-btn ${selectedLang === "nodejs" ? "lang-btn--active" : ""}`}
                  onClick={() => setSelectedLang("nodejs")}
                >
                  Node.js (TypeScript / JS)
                </button>
                <button
                  className={`lang-btn ${selectedLang === "curl" ? "lang-btn--active" : ""}`}
                  onClick={() => setSelectedLang("curl")}
                >
                  cURL / Shell
                </button>
                <button
                  className={`lang-btn ${selectedLang === "golang" ? "lang-btn--active" : ""}`}
                  onClick={() => setSelectedLang("golang")}
                >
                  Go (Golang)
                </button>
              </div>

              <div className="code-block-wrap">
                <div className="code-block-header">
                  <span className="code-block-lang">{CODE_EXAMPLES[selectedLang].title}</span>
                  <button
                    className="code-block-copy"
                    onClick={() => handleCopy(CODE_EXAMPLES[selectedLang].code, selectedLang)}
                  >
                    {copiedKey === selectedLang ? "✓ Copied Code!" : "📋 Copy Code"}
                  </button>
                </div>
                <pre className="code-block-pre">{CODE_EXAMPLES[selectedLang].code}</pre>
              </div>
            </Panel>
          </>
        )}

        {/* TAB 4: INTERACTIVE CANONICAL & HMAC SANDBOX */}
        {activeTab === "sandbox" && (
          <>
            <div className="help-hero-card">
              <h2>Interactive Canonical String & HMAC Calculator</h2>
              <p>
                Use this interactive tool to visualize how your payload is serialized into the canonical request string
                and how the final HMAC-SHA256 signature is calculated in real time.
              </p>
            </div>

            <Panel title="Request Parameters">
              <div className="sandbox-card">
                <div className="field-row">
                  <div className="field-group" style={{ flex: "0 0 120px" }}>
                    <label className="field-label">HTTP Method</label>
                    <select className="select" value={sbMethod} onChange={(e) => setSbMethod(e.target.value)}>
                      <option>POST</option>
                      <option>GET</option>
                      <option>PUT</option>
                      <option>DELETE</option>
                    </select>
                  </div>
                  <div className="field-group" style={{ flex: "1 1 240px" }}>
                    <label className="field-label">Endpoint Path</label>
                    <input className="input" value={sbPath} onChange={(e) => setSbPath(e.target.value)} />
                  </div>
                  <div className="field-group" style={{ flex: "1 1 300px" }}>
                    <label className="field-label">HMAC Secret</label>
                    <input
                      className="input"
                      value={sbSecret}
                      onChange={(e) => setSbSecret(e.target.value)}
                      placeholder="Enter HMAC secret..."
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field-group" style={{ flex: "1 1 180px" }}>
                    <label className="field-label">Timestamp</label>
                    <input className="input" value={sbTimestamp} onChange={(e) => setSbTimestamp(e.target.value)} />
                  </div>
                  <div className="field-group" style={{ flex: "1 1 220px" }}>
                    <label className="field-label">Nonce</label>
                    <input className="input" value={sbNonce} onChange={(e) => setSbNonce(e.target.value)} />
                  </div>
                  <div style={{ alignSelf: "flex-end", marginBottom: 2 }}>
                    <Button variant="secondary" onClick={generateSandboxValues}>
                      Generate Fresh TS & Nonce
                    </Button>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label">JSON Body Payload</label>
                  <textarea
                    className="textarea"
                    value={sbBody}
                    onChange={(e) => setSbBody(e.target.value)}
                    style={{ minHeight: 90 }}
                  />
                </div>
              </div>
            </Panel>

            <Panel title="Computed Canonical Representation & Signature">
              <div style={{ marginBottom: 16 }}>
                <label className="field-label">Exact Canonical String (Raw Newline Separated)</label>
                <div className="canonical-preview">
                  {sbCanonical.split("\n").map((line, idx) => (
                    <span key={idx} className="canonical-line canonical-line--highlight">
                      [Line {idx + 1}] {line || "<EMPTY>"}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className="field-label">Calculated HMAC-SHA256 Hex Signature</label>
                  <button
                    className="code-block-copy"
                    onClick={() => handleCopy(sbSignature, "calc-sig")}
                    disabled={!sbSignature}
                  >
                    {copiedKey === "calc-sig" ? "✓ Copied!" : "📋 Copy Signature"}
                  </button>
                </div>
                <code className="credential-value">{sbSignature || "(Enter HMAC Secret to compute signature)"}</code>
              </div>
            </Panel>
          </>
        )}

        {/* TAB 5: CIPHERSHOP CASE STUDY */}
        {activeTab === "ciphershop" && (
          <>
            <div className="help-hero-card">
              <h2>Reference Implementation: CipherShop</h2>
              <p>
                The workspace includes a complete sample external application — <strong>CipherShop</strong> (located in{" "}
                <code>Ciphershop/</code>). It illustrates real-world e-commerce checkout integration protected by CipherGate.
              </p>
            </div>

            <Panel title="CipherShop Integration Architecture">
              <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.6 }}>
                CipherShop runs independently on ports <strong>8001</strong> (backend API) and <strong>5174</strong> (React
                storefront). It owns its catalog and cart, while securing every order submission through CipherGate:
              </p>

              <div className="arch-diagram">
                <div className="arch-node arch-node--client">
                  <div className="arch-node__label">CipherShop UI</div>
                  <div className="arch-node__sub">Browser (Port 5174)</div>
                </div>
                <div className="arch-arrow">➔</div>
                <div className="arch-node arch-node--backend">
                  <div className="arch-node__label">CipherShop API</div>
                  <div className="arch-node__sub">Backend (Port 8001)</div>
                </div>
                <div className="arch-arrow">➔</div>
                <div className="arch-node arch-node--gateway">
                  <div className="arch-node__label">CipherGate Gateway</div>
                  <div className="arch-node__sub">Security Engine (8000)</div>
                </div>
              </div>

              <div className="features-grid" style={{ marginTop: 16 }}>
                <div className="feature-box">
                  <div className="feature-box__title">📁 Secret Isolation</div>
                  <p className="feature-box__desc">
                    CipherShop stores <code>CIPHERGATE_API_KEY</code> and <code>CIPHERGATE_HMAC_SECRET</code> strictly in{" "}
                    <code>Ciphershop/backend/.env</code>. The customer browser never sees or touches these credentials.
                  </p>
                </div>

                <div className="feature-box">
                  <div className="feature-box__title">🔐 Server-Side Signing Client</div>
                  <p className="feature-box__desc">
                    Implemented in <code>Ciphershop/backend/services/ciphergate.py</code>, it prepares the canonical
                    payload, generates cryptographic nonces, computes the HMAC digest, and handles gateway response states.
                  </p>
                </div>

                <div className="feature-box">
                  <div className="feature-box__title">🧪 Live Attack Demos</div>
                  <p className="feature-box__desc">
                    CipherShop UI includes a dedicated <em>Security Demos</em> page triggering tampering, replay attacks,
                    and rate-limit floods directly against CipherGate to showcase failure logging.
                  </p>
                </div>
              </div>
            </Panel>

            <Panel title="Running CipherShop Locally">
              <div className="code-block-wrap">
                <div className="code-block-header">
                  <span className="code-block-lang">BASH / TERMINAL COMMANDS</span>
                  <button
                    className="code-block-copy"
                    onClick={() =>
                      handleCopy(
                        `# 1. Start CipherGate (if not already running)
cd CipherGate/backend && uvicorn main:app --reload --port 8000

# 2. Register an app in CipherGate and configure Ciphershop/backend/.env
# Copy CIPHERGATE_API_KEY and CIPHERGATE_HMAC_SECRET into .env

# 3. Start CipherShop Backend
cd Ciphershop/backend && uvicorn main:app --reload --port 8001

# 4. Start CipherShop Frontend
cd Ciphershop/frontend && npm run dev`,
                        "shop-run"
                      )
                    }
                  >
                    {copiedKey === "shop-run" ? "✓ Copied!" : "📋 Copy Commands"}
                  </button>
                </div>
                <pre className="code-block-pre">{`# 1. Start CipherGate backend
cd CipherGate/backend && uvicorn main:app --reload --port 8000

# 2. Start CipherShop backend (reads API Key & HMAC Secret from .env)
cd Ciphershop/backend && uvicorn main:app --reload --port 8001

# 3. Start CipherShop frontend
cd Ciphershop/frontend && npm run dev -- --port 5174`}</pre>
              </div>
            </Panel>
          </>
        )}

        {/* TAB 6: STATUS CODES & TROUBLESHOOTING */}
        {activeTab === "troubleshooting" && (
          <>
            <Panel title="Gateway HTTP Status & Error Codes Matrix">
              <table className="table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Error Code</th>
                    <th>Cause</th>
                    <th>Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><StatusBadge status="ALLOWED" /></td>
                    <td className="mono">200 OK</td>
                    <td>All 5 security checks passed successfully.</td>
                    <td>Request routed to backend microservice.</td>
                  </tr>
                  <tr>
                    <td><span className="tag tag--danger">401</span></td>
                    <td className="mono">AUTHENTICATION_FAILED</td>
                    <td>Missing or invalid <code>X-API-Key</code>.</td>
                    <td>Ensure API key is copied correctly from Applications tab.</td>
                  </tr>
                  <tr>
                    <td><span className="tag tag--danger">403</span></td>
                    <td className="mono">HMAC_VERIFICATION_FAILED</td>
                    <td>Signature mismatch / payload modified in transit.</td>
                    <td>Verify canonical format, secret key, and ensure no extra JSON whitespace.</td>
                  </tr>
                  <tr>
                    <td><span className="tag tag--warning">408</span></td>
                    <td className="mono">TIMESTAMP_EXPIRED</td>
                    <td>Timestamp is older than 30s replay window.</td>
                    <td>Synchronize server clocks (NTP) and generate fresh unix timestamp.</td>
                  </tr>
                  <tr>
                    <td><span className="tag tag--danger">409</span></td>
                    <td className="mono">REPLAY_ATTACK</td>
                    <td>Nonce was already processed for this application.</td>
                    <td>Always generate a unique cryptographic nonce (UUID / random hex) per request.</td>
                  </tr>
                  <tr>
                    <td><span className="tag tag--warning">429</span></td>
                    <td className="mono">RATE_LIMIT_EXCEEDED</td>
                    <td>Application exceeded allowed requests/minute window.</td>
                    <td>Implement client-side backoff or adjust application rate limit settings.</td>
                  </tr>
                  <tr>
                    <td><span className="tag tag--danger">503</span></td>
                    <td className="mono">GATEWAY_UNAVAILABLE</td>
                    <td>CipherGate server is down or unreachable.</td>
                    <td>Ensure CipherGate backend is running on the configured host & port.</td>
                  </tr>
                </tbody>
              </table>
            </Panel>

            <Panel title="Frequently Asked Questions (FAQ)">
              <div className="faq-list">
                {FAQ_ITEMS.map((item, idx) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div key={idx} className={`faq-item ${isOpen ? "faq-item--open" : ""}`}>
                      <button className="faq-header" onClick={() => setOpenFaq(isOpen ? null : idx)}>
                        <span>{item.q}</span>
                        <span className="faq-icon">{isOpen ? "▲" : "▼"}</span>
                      </button>
                      {isOpen && <div className="faq-body">{item.a}</div>}
                    </div>
                  );
                })}
              </div>
            </Panel>
          </>
        )}
      </div>
    </Page>
  );
}
