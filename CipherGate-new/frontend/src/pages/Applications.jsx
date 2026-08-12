import { useEffect, useState } from "react";
import { Page, Panel, Button, EmptyState } from "../components/Primitives.jsx";
import { apiGet, apiPostJson } from "../services/api.js";

export default function Applications({ onCredentialsIssued }) {
  const [apps, setApps] = useState([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [issued, setIssued] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const res = await apiGet("/applications");
    if (Array.isArray(res.data)) setApps(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  const register = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter an application name.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiPostJson("/auth/register", { name: name.trim(), password: password || null });
    setLoading(false);
    if (res.status !== 200) {
      setError(res.data?.message || "Registration failed");
      return;
    }
    setIssued(res.data);
    setName("");
    setPassword("");
    load();
    onCredentialsIssued?.(res.data);
  };

  return (
    <Page
      eyebrow="Credential Management"
      title="Applications"
      subtitle="Register a demo client to receive an API key and HMAC secret. The secret is shown once — CipherGate never stores or re-exposes it in plaintext views."
    >
      <Panel title="Register a new application">
        <form onSubmit={register} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            placeholder="Application name (e.g. Storefront Web App)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: "1 1 260px" }}
          />
          <input
            className="input"
            placeholder="Login password (optional, for JWT demo)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ flex: "1 1 220px" }}
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Registering..." : "Register application"}
          </Button>
        </form>
        {error && <div className="form-error">{error}</div>}
      </Panel>

      {issued && (
        <Panel title="New credentials — copy these now" className="panel--highlight">
          <div className="credential-grid">
            <div>
              <div className="credential-label">Application ID</div>
              <code className="credential-value">{issued.application_id}</code>
            </div>
            <div>
              <div className="credential-label">API Key</div>
              <code className="credential-value">{issued.api_key}</code>
            </div>
            <div>
              <div className="credential-label">HMAC Secret</div>
              <code className="credential-value">{issued.hmac_secret}</code>
            </div>
          </div>
          <p className="credential-note">
            Paste these into the API Request Editor to sign requests as this application.
          </p>
        </Panel>
      )}

      <Panel title="Registered applications">
        {apps.length === 0 ? (
          <EmptyState title="No applications yet" subtitle="Register one above to get started." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>API Key</th>
                <th>Rate Limit</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="mono">{a.api_key}</td>
                  <td className="mono">{a.rate_limit}/min</td>
                  <td className="mono">{new Date(a.created_at + "Z").toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </Page>
  );
}
