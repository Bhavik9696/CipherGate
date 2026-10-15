import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Panel, Button, EmptyState } from "../components/Primitives.jsx";
import { getSecurityThreats } from "../services/api.js";
import "./Analytics.css";

const RANGE_OPTIONS = [
  { key: "all", label: "All Time" },
  { key: "24h", label: "Last 24h" },
  { key: "7d", label: "Last 7d" },
  { key: "30d", label: "Last 30d" },
];

function CustomThreatTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="custom-chart-tooltip" style={{ maxWidth: 280 }}>
        <div className="custom-chart-tooltip__title">{data.category}</div>
        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginBottom: 4 }}>
          Event: {data.event_type} • Check: {data.security_check}
        </div>
        <div className="custom-chart-tooltip__value" style={{ color: data.color }}>
          <span>●</span> {data.count} blocked attacks ({data.percentage}%)
        </div>
        <div className="custom-chart-tooltip__detail" style={{ fontStyle: "italic", marginTop: 6 }}>
          Reason: "{data.sample_reason}"
        </div>
      </div>
    );
  }
  return null;
}

export default function SecurityThreatAnalytics({ onClose }) {
  const [threatData, setThreatData] = useState(null);
  const [range, setRange] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (selectedRange = range, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await getSecurityThreats(selectedRange);
      if (res.status === 200 && res.data) {
        setThreatData(res.data);
      } else {
        setError(res.data?.message || "Failed to load threat telemetry.");
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

  const totalThreats = threatData?.total_threats ?? 0;
  const categories = threatData?.categories || [];

  // Find top threat category
  const topThreat = categories.length > 0 && totalThreats > 0
    ? [...categories].sort((a, b) => b.count - a.count)[0]
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Sub-header Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="secondary" onClick={onClose} title="Return to raw security audit logs">
            ← Back to Event Logs
          </Button>
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
            Viewing categorized threat metrics
          </span>
        </div>

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
            title="Reload latest security threat metrics from backend"
          >
            <span className={refreshing ? "spin-icon" : ""}>🔄</span> Refresh
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="analytics-grid">
        <div className="analytics-card analytics-card--danger">
          <div className="analytics-card__label">Total Threats Blocked</div>
          <div className="analytics-card__value">{totalThreats}</div>
          <div className="analytics-card__sub">Zero requests passed to backend</div>
        </div>
        <div className="analytics-card analytics-card--warning">
          <div className="analytics-card__label">Primary Attack Vector</div>
          <div
            className="analytics-card__value"
            style={{ fontSize: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            title={topThreat ? topThreat.category : "None"}
          >
            {topThreat ? topThreat.category : "None"}
          </div>
          <div className="analytics-card__sub">
            {topThreat ? `${topThreat.count} events (${topThreat.percentage}% of blocked)` : "No threats detected"}
          </div>
        </div>
        <div className="analytics-card analytics-card--accent">
          <div className="analytics-card__label">Active Defenses</div>
          <div className="analytics-card__value">5 / 5</div>
          <div className="analytics-card__sub">HMAC, Replay, Freshness, Auth, Rate-Limit</div>
        </div>
      </div>

      {/* Main Threat Breakdown Chart */}
      <Panel
        title={`Security Threat Breakdown by Category (${RANGE_OPTIONS.find((o) => o.key === range)?.label || "All Time"})`}
        right={
          <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Database Source: security_events (status = BLOCKED)
          </span>
        }
      >
        {loading ? (
          <div className="empty">
            <div className="empty__title">Loading Security Threat Telemetry...</div>
            <div className="empty__subtitle">Aggregating blocked attack logs from backend</div>
          </div>
        ) : error ? (
          <div className="empty">
            <div className="empty__title" style={{ color: "var(--danger)" }}>Error Loading Threat Analytics</div>
            <div className="empty__subtitle">{error}</div>
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => loadData(range)}>Try Again</Button>
            </div>
          </div>
        ) : totalThreats === 0 ? (
          <EmptyState
            title="Zero security threats detected"
            subtitle={`No attack attempts or security rejections were recorded in this time range (${RANGE_OPTIONS.find((o) => o.key === range)?.label.toLowerCase()}). Use the Request Editor to test HMAC tampering, replay attacks, or rate limit bursts.`}
          />
        ) : (
          <div className="chart-panel-content">
            <div className="chart-wrapper" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categories}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--text-dim)"
                    tick={{ fill: "var(--text-dim)", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    stroke="var(--text-dim)"
                    tick={{ fill: "var(--text-dim)", fontSize: 11.5 }}
                    width={180}
                  />
                  <Tooltip content={<CustomThreatTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {categories.map((entry, index) => (
                      <Cell key={`threat-cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Panel>

      {/* Threat Category Deep Dive Cards */}
      <Panel title="Threat Categories & Decision Engine Rules">
        <div className="threat-grid">
          {categories.map((cat) => (
            <div key={cat.category} className="threat-card" style={{ borderLeft: `3px solid ${cat.color}` }}>
              <div className="threat-card__top">
                <div className="threat-card__title">{cat.category}</div>
                <span className="threat-card__check">{cat.security_check}</span>
              </div>
              <div className="threat-card__stats">
                <span className="threat-card__count">{cat.count}</span>
                <span className="threat-card__pct">{cat.percentage}% of all rejections</span>
              </div>
              <div className="threat-card__bar-wrap">
                <div
                  className="threat-card__bar"
                  style={{ width: `${cat.percentage}%`, background: cat.color }}
                />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                {cat.description}
              </div>
              <div className="threat-card__reason" style={{ borderLeftColor: cat.color }}>
                <strong style={{ color: "var(--text)", display: "block", marginBottom: 2 }}>Sample Recorded Reason:</strong>
                {cat.sample_reason}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
