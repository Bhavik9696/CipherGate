import { Page, Panel, Button } from "../components/Primitives.jsx";
import { BASE_URL } from "../services/api.js";

export default function Settings({ onNavigate }) {
  return (
    <Page
      eyebrow="Configuration"
      title="Settings"
      subtitle="CipherGate's security thresholds are set on the backend via environment variables — this page shows what's currently in effect."
      actions={
        onNavigate && (
          <Button variant="secondary" onClick={() => onNavigate("help")}>
            📖 Help & Integration Guide
          </Button>
        )
      }
    >
      <Panel title="Gateway connection">
        <div className="credential-grid">
          <div>
            <div className="credential-label">API Base URL</div>
            <code className="credential-value">{BASE_URL}</code>
          </div>
        </div>
        <p className="credential-note">
          Change VITE_API_BASE_URL in frontend/.env and restart the dev server to point at a different backend.
        </p>
      </Panel>

      <Panel title="Security thresholds (backend/.env)">
        <table className="table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Purpose</th>
              <th>Default</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">REPLAY_WINDOW_SECONDS</td>
              <td>Max age of a request timestamp before it's rejected</td>
              <td className="mono">30</td>
            </tr>
            <tr>
              <td className="mono">DEFAULT_RATE_LIMIT</td>
              <td>Requests allowed per application per window</td>
              <td className="mono">20</td>
            </tr>
            <tr>
              <td className="mono">RATE_LIMIT_WINDOW_SECONDS</td>
              <td>Rate-limit sliding window size</td>
              <td className="mono">60</td>
            </tr>
            <tr>
              <td className="mono">JWT_EXPIRE_MINUTES</td>
              <td>Access token lifetime</td>
              <td className="mono">30</td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </Page>
  );
}
