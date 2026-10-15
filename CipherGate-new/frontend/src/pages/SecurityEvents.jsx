import { useEffect, useState, useCallback } from "react";
import { Page, Panel, EmptyState, EventTypeTag, StatusBadge, Button, TrashIcon } from "../components/Primitives.jsx";
import { apiGet, apiDelete } from "../services/api.js";
import SecurityThreatAnalytics from "./SecurityThreatAnalytics.jsx";

export default function SecurityEvents() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [deletingId, setDeletingId] = useState(null);
  const [viewMode, setViewMode] = useState("logs"); // "logs" | "threats"

  const load = useCallback(async () => {
    const res = await apiGet("/audit/logs?limit=100");
    if (Array.isArray(res.data)) setLogs(res.data);
  }, []);

  const handleDelete = async (id, e) => {
    e?.stopPropagation?.();
    setDeletingId(id);
    try {
      const res = await apiDelete(`/audit/logs/${id}`);
      if (res.status === 200) {
        setLogs((prev) => prev.filter((item) => item.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (viewMode === "logs") {
      load();
      const id = setInterval(load, 4000);
      return () => clearInterval(id);
    }
  }, [load, viewMode]);

  const filtered = filter === "ALL" ? logs : logs.filter((l) => l.status === filter);

  // If user clicked "View Security Threat Analytics", render the dedicated threat breakdown view within this section
  if (viewMode === "threats") {
    return (
      <Page
        eyebrow="Security & Audit"
        title="Security Threat Analytics"
        subtitle="Dedicated category breakdown of blocked attack attempts, HMAC tampering, replays, and expired timestamps."
      >
        <SecurityThreatAnalytics onClose={() => setViewMode("logs")} />
      </Page>
    );
  }

  return (
    <Page
      eyebrow="Audit Trail"
      title="Security Events"
      subtitle="Every request CipherGate has evaluated, persisted to the security_events table."
      actions={
        <div className="field-row">
          <Button
            variant="primary"
            onClick={() => setViewMode("threats")}
            title="Inspect visual threat category breakdown and attack statistics"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            📊 View Security Threat Analytics
          </Button>

          <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />

          <Button variant={filter === "ALL" ? "secondary" : "ghost"} onClick={() => setFilter("ALL")}>
            All
          </Button>
          <Button variant={filter === "ALLOWED" ? "secondary" : "ghost"} onClick={() => setFilter("ALLOWED")}>
            Allowed
          </Button>
          <Button variant={filter === "BLOCKED" ? "secondary" : "ghost"} onClick={() => setFilter("BLOCKED")}>
            Blocked
          </Button>
        </div>
      }
    >
      <Panel>
        {filtered.length === 0 ? (
          <EmptyState title="No matching events" subtitle="Trigger some traffic from the Request Editor." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Client</th>
                <th>Endpoint</th>
                <th>Method</th>
                <th>Event</th>
                <th>Failed Check</th>
                <th>Status</th>
                <th>Reason</th>
                <th style={{ width: 44, textAlign: "center" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{new Date(e.timestamp + "Z").toLocaleTimeString()}</td>
                  <td className="mono">{e.client_id ? e.client_id.slice(0, 14) + "…" : "—"}</td>
                  <td className="mono">{e.endpoint}</td>
                  <td className="mono">{e.method}</td>
                  <td><EventTypeTag type={e.event_type} /></td>
                  <td className="mono">{e.security_check}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td style={{ color: "var(--text-dim)", fontSize: 12.5 }}>{e.reason}</td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      className="btn-icon"
                      title="Delete event record"
                      aria-label="Delete event record"
                      disabled={deletingId === e.id}
                      onClick={(evt) => handleDelete(e.id, evt)}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </Page>
  );
}
