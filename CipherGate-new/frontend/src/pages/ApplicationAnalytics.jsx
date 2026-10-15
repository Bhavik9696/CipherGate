import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Page, Panel, Button, EmptyState, StatusBadge } from "../components/Primitives.jsx";
import { getApplicationRequests } from "../services/api.js";
import "./Analytics.css";

const RANGE_OPTIONS = [
  { key: "all", label: "All Time" },
  { key: "24h", label: "Last 24h" },
  { key: "7d", label: "Last 7d" },
  { key: "30d", label: "Last 30d" },
];

function CustomBarTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="custom-chart-tooltip">
        <div className="custom-chart-tooltip__title">{data.fullName || label}</div>
        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent)", marginBottom: 6 }}>
          ID: {data.id}
        </div>
        <div className="custom-chart-tooltip__value" style={{ color: "var(--success)" }}>
          <span>●</span> Allowed: {data.allowed_requests}
        </div>
        <div className="custom-chart-tooltip__value" style={{ color: "var(--danger)" }}>
          <span>●</span> Blocked: {data.blocked_requests}
        </div>
        <div style={{ borderTop: "1px solid var(--border-soft)", marginTop: 6, paddingTop: 4, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Total Requests:</span>
          <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text)" }}>
            {data.total_requests}
          </span>
        </div>
      </div>
    );
  }
  return null;
}

export default function ApplicationAnalytics({ onNavigate }) {
  const [data, setData] = useState(null);
  const [range, setRange] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  const loadData = useCallback(async (selectedRange = range, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await getApplicationRequests(selectedRange);
      if (res.status === 200 && res.data) {
        setData(res.data);
      } else {
        setError(res.data?.message || "Failed to load application analytics.");
      }
    } catch {
      setError("Network error: Unable to connect to backend server.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => {
    loadData(range);
  }, [range, loadData]);

  const rawApplications = data?.applications || [];
  const unauthenticated = data?.unauthenticated;

  // Filter for display
  const applications = showActiveOnly
    ? rawApplications.filter((a) => a.total_requests > 0)
    : rawApplications;

  const totalRegistered = data?.registered_apps_count ?? 0;
  const activeAppsCount = rawApplications.filter((a) => a.total_requests > 0).length;
  const totalVolume = data?.total_requests ?? 0;
  const topApp = rawApplications[0]?.total_requests > 0 ? rawApplications[0] : null;

  // Prepare chart data (top 10 for readability on charts)
  const chartApps = (rawApplications.filter((a) => a.total_requests > 0).slice(0, 10)).map((app) => ({
    name: app.name.length > 16 ? app.name.slice(0, 14) + "…" : app.name,
    fullName: app.name,
    id: app.id,
    allowed_requests: app.allowed_requests,
    blocked_requests: app.blocked_requests,
    total_requests: app.total_requests,
  }));

  // If unauthenticated requests exist, include as entry in chart if significant
  if (unauthenticated && unauthenticated.total_requests > 0) {
    chartApps.push({
      name: "Unauthenticated",
      fullName: unauthenticated.name,
      id: "unauth",
      allowed_requests: unauthenticated.allowed_requests,
      blocked_requests: unauthenticated.blocked_requests,
      total_requests: unauthenticated.total_requests,
    });
  }

  return (
    <Page
      eyebrow="Client Telemetry"
      title="Application Analytics"
      subtitle="Request traffic and security rejection volume broken down by registered client application."
      actions={
        <div className="field-row">
          <div className="filter-group">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={`filter-btn ${range === opt.key ? "filter-btn--active" : ""}`}
                onClick={() => setRange(opt.key)}
                disabled={loading || refreshing}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={() => loadData(range, true)}
            disabled={loading || refreshing}
            title="Reload latest application telemetry from backend"
          >
            <span className={refreshing ? "spin-icon" : ""}>🔄</span> Refresh
          </Button>
          {onNavigate && (
            <Button variant="ghost" onClick={() => onNavigate("applications")}>
              Manage Applications →
            </Button>
          )}
        </div>
      }
    >
      {/* Overview Stat Cards */}
      <div className="analytics-grid">
        <div className="analytics-card analytics-card--accent">
          <div className="analytics-card__label">Registered Applications</div>
          <div className="analytics-card__value">{totalRegistered}</div>
          <div className="analytics-card__sub">Credentials issued in database</div>
        </div>
        <div className="analytics-card analytics-card--success">
          <div className="analytics-card__label">Active Traffic Apps</div>
          <div className="analytics-card__value">{activeAppsCount}</div>
          <div className="analytics-card__sub">
            Apps with recorded gateway events ({totalRegistered > 0 ? Math.round((activeAppsCount / totalRegistered) * 100) : 0}%)
          </div>
        </div>
        <div className="analytics-card">
          <div className="analytics-card__label">Highest Volume Client</div>
          <div
            className="analytics-card__value"
            style={{ fontSize: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            title={topApp?.name || "None"}
          >
            {topApp ? topApp.name : "None"}
          </div>
          <div className="analytics-card__sub">
            {topApp ? `${topApp.total_requests} requests (${topApp.allowed_requests} allowed)` : "No traffic yet"}
          </div>
        </div>
        <div className="analytics-card analytics-card--warning">
          <div className="analytics-card__label">Unauthenticated Requests</div>
          <div className="analytics-card__value">{unauthenticated?.total_requests ?? 0}</div>
          <div className="analytics-card__sub">Invalid or missing API keys blocked</div>
        </div>
      </div>

      {/* Main Bar Chart Panel */}
      <Panel
        title={`Request Volume by Application (${RANGE_OPTIONS.find((o) => o.key === range)?.label || "All Time"})`}
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              className={`filter-btn ${showActiveOnly ? "filter-btn--active" : ""}`}
              onClick={() => setShowActiveOnly(!showActiveOnly)}
              style={{ border: "1px solid var(--border-soft)" }}
            >
              {showActiveOnly ? "Showing Active Only" : "Show Active Only"}
            </button>
          </div>
        }
      >
        {loading ? (
          <div className="empty">
            <div className="empty__title">Loading Application Analytics...</div>
            <div className="empty__subtitle">Aggregating per-application traffic from backend</div>
          </div>
        ) : error ? (
          <div className="empty">
            <div className="empty__title" style={{ color: "var(--danger)" }}>Error Loading Analytics</div>
            <div className="empty__subtitle">{error}</div>
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => loadData(range)}>Try Again</Button>
            </div>
          </div>
        ) : chartApps.length === 0 ? (
          <EmptyState
            title="No application traffic recorded"
            subtitle="Registered applications have not sent any requests yet. Use the Request Editor or CipherShop store to send signed requests."
          />
        ) : (
          <div className="chart-panel-content">
            <div className="chart-wrapper" style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartApps} margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="var(--text-dim)"
                    tick={{ fill: "var(--text-dim)", fontSize: 11 }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    stroke="var(--text-dim)"
                    tick={{ fill: "var(--text-dim)", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
                  />
                  <Bar
                    dataKey="allowed_requests"
                    name="Allowed Requests"
                    fill="var(--success)"
                    stackId="a"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="blocked_requests"
                    name="Blocked Requests"
                    fill="var(--danger)"
                    stackId="a"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Panel>

      {/* Applications Breakdown Table */}
      <Panel
        title={`All Registered Applications (${applications.length})`}
        right={
          <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Database Source: applications & security_events
          </span>
        }
      >
        {applications.length === 0 ? (
          <EmptyState title="No applications match criteria" subtitle="Create new applications in the Applications page." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Application Name</th>
                  <th>App ID</th>
                  <th>API Key Prefix</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th style={{ textAlign: "right" }}>Allowed</th>
                  <th style={{ textAlign: "right" }}>Blocked</th>
                  <th style={{ minWidth: 120 }}>Ratio</th>
                  <th style={{ textAlign: "center" }}>Rate Limit</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const allowedRatio = app.total_requests > 0 ? (app.allowed_requests / app.total_requests) * 100 : 0;
                  return (
                    <tr key={app.id}>
                      <td>
                        <strong style={{ color: "var(--text)" }}>{app.name}</strong>
                      </td>
                      <td className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        {app.id}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {app.api_key_prefix || "—"}
                      </td>
                      <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
                        {app.total_requests}
                      </td>
                      <td className="mono" style={{ textAlign: "right", color: "var(--success)" }}>
                        {app.allowed_requests}
                      </td>
                      <td className="mono" style={{ textAlign: "right", color: app.blocked_requests > 0 ? "var(--danger)" : "var(--text-dim)" }}>
                        {app.blocked_requests}
                      </td>
                      <td>
                        {app.total_requests > 0 ? (
                          <div className="ratio-bar-wrap" title={`${Math.round(allowedRatio)}% Allowed`}>
                            <div className="ratio-bar-fill" style={{ width: `${allowedRatio}%` }} />
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>No traffic</span>
                        )}
                      </td>
                      <td className="mono" style={{ textAlign: "center", fontSize: 12 }}>
                        {app.rate_limit}/min
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <StatusBadge status={app.is_active ? "ALLOWED" : "BLOCKED"} />
                      </td>
                    </tr>
                  );
                })}

                {/* Unauthenticated traffic row if any exists */}
                {unauthenticated && unauthenticated.total_requests > 0 && (
                  <tr style={{ background: "var(--bg-raised)" }}>
                    <td>
                      <strong style={{ color: "var(--warning)" }}>⚠️ {unauthenticated.name}</strong>
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                      unauth
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                      (invalid / missing)
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
                      {unauthenticated.total_requests}
                    </td>
                    <td className="mono" style={{ textAlign: "right", color: "var(--success)" }}>
                      {unauthenticated.allowed_requests}
                    </td>
                    <td className="mono" style={{ textAlign: "right", color: "var(--danger)" }}>
                      {unauthenticated.blocked_requests}
                    </td>
                    <td>
                      <div className="ratio-bar-wrap" title="100% Blocked">
                        <div className="ratio-bar-fill" style={{ width: "0%" }} />
                      </div>
                    </td>
                    <td className="mono" style={{ textAlign: "center", fontSize: 12 }}>
                      —
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="badge badge--danger">REJECTED</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Page>
  );
}
