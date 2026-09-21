import { useEffect, useState, useCallback } from "react";
import { Page, Panel, StatCard, EmptyState, Button } from "../components/Primitives.jsx";
import { EventTypeTag, StatusBadge } from "../components/Primitives.jsx";
import { apiGet } from "../services/api.js";

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [statsRes, logsRes] = await Promise.all([
        apiGet("/dashboard/stats"),
        apiGet("/audit/logs?limit=8"),
      ]);
      setStats(statsRes.data);
      setLogs(logsRes.data);
      setError(null);
    } catch {
      setError("Could not reach CipherGate. Is the backend running on the configured URL?");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <Page
      eyebrow="Security Overview"
      title="Dashboard"
      subtitle="Live counters and recent activity, sourced directly from CipherGate's audit log — nothing here is hardcoded."
      actions={
        onNavigate && (
          <Button variant="secondary" onClick={() => onNavigate("help")}>
            📖 Help & Integration Guide
          </Button>
        )
      }
    >
      {error && (
        <Panel>
          <EmptyState title="Gateway unreachable" subtitle={error} />
        </Panel>
      )}

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
          <StatCard label="Total Requests" value={stats.total_requests} tone="accent" />
          <StatCard label="Allowed" value={stats.allowed} tone="success" />
          <StatCard label="Blocked" value={stats.blocked} tone="danger" />
          <StatCard label="HMAC Failures" value={stats.hmac_failures} tone="danger" />
          <StatCard label="Replay Attacks" value={stats.replay_attacks} tone="danger" />
          <StatCard label="Auth Failures" value={stats.authentication_failures} tone="warning" />
          <StatCard label="Rate Limit Violations" value={stats.rate_limit_violations} tone="warning" />
        </div>
      )}

      <Panel title="Recent Security Events">
        {logs.length === 0 ? (
          <EmptyState
            title="No events yet"
            subtitle="Send a request from the API Request Editor to see it appear here in real time."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Endpoint</th>
                <th>Event</th>
                <th>Check</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{new Date(e.timestamp + "Z").toLocaleTimeString()}</td>
                  <td className="mono">{e.endpoint}</td>
                  <td><EventTypeTag type={e.event_type} /></td>
                  <td className="mono">{e.security_check}</td>
                  <td><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </Page>
  );
}
