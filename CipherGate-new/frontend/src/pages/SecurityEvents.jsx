import { useEffect, useState, useCallback } from "react";
import { Page, Panel, EmptyState, EventTypeTag, StatusBadge, Button } from "../components/Primitives.jsx";
import { apiGet } from "../services/api.js";

export default function SecurityEvents() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    const res = await apiGet("/audit/logs?limit=100");
    if (Array.isArray(res.data)) setLogs(res.data);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  const filtered = filter === "ALL" ? logs : logs.filter((l) => l.status === filter);

  return (
    <Page
      eyebrow="Audit Trail"
      title="Security Events"
      subtitle="Every request CipherGate has evaluated, persisted to the security_events table."
      actions={
        <div className="field-row">
          <Button variant={filter === "ALL" ? "primary" : "ghost"} onClick={() => setFilter("ALL")}>All</Button>
          <Button variant={filter === "ALLOWED" ? "primary" : "ghost"} onClick={() => setFilter("ALLOWED")}>Allowed</Button>
          <Button variant={filter === "BLOCKED" ? "primary" : "ghost"} onClick={() => setFilter("BLOCKED")}>Blocked</Button>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </Page>
  );
}
