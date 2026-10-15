import { useEffect, useState, useCallback } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Page, Panel, Button, EmptyState } from "../components/Primitives.jsx";
import { getRequestDecisions } from "../services/api.js";
import "./Analytics.css";

const RANGE_OPTIONS = [
  { key: "all", label: "All Time" },
  { key: "24h", label: "Last 24h" },
  { key: "7d", label: "Last 7d" },
  { key: "30d", label: "Last 30d" },
];

function CustomDonutTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="custom-chart-tooltip">
        <div className="custom-chart-tooltip__title">{data.name}</div>
        <div className="custom-chart-tooltip__value" style={{ color: data.color }}>
          <span>●</span>
          {data.value} requests ({data.percentage}%)
        </div>
        <div className="custom-chart-tooltip__detail">
          Status: {data.status} by Security Decision Engine
        </div>
      </div>
    );
  }
  return null;
}

export default function RequestAnalytics({ onNavigate }) {
  const [data, setData] = useState(null);
  const [range, setRange] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (selectedRange = range, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await getRequestDecisions(selectedRange);
      if (res.status === 200 && res.data) {
        setData(res.data);
      } else {
        setError(res.data?.message || "Failed to load request decisions analytics.");
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

  const handleRangeChange = (newRange) => {
    setRange(newRange);
  };

  const total = data?.total ?? 0;
  const allowed = data?.allowed ?? 0;
  const blocked = data?.blocked ?? 0;
  const allowedPct = data?.allowed_pct ?? 0;
  const blockedPct = data?.blocked_pct ?? 0;
  const chartData = data?.breakdown || [];

  return (
    <Page
      eyebrow="Security Telemetry"
      title="Request Analytics"
      subtitle="Cryptographic verification audit of Allowed vs. Blocked requests, evaluated in real time by CipherGate."
      actions={
        <div className="field-row">
          <div className="filter-group">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={`filter-btn ${range === opt.key ? "filter-btn--active" : ""}`}
                onClick={() => handleRangeChange(opt.key)}
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
            title="Reload latest decision telemetry from backend"
          >
            <span className={refreshing ? "spin-icon" : ""}>🔄</span> Refresh
          </Button>
          {onNavigate && (
            <Button variant="ghost" onClick={() => onNavigate("events")}>
              View Raw Audit Logs →
            </Button>
          )}
        </div>
      }
    >
      {/* Stat Cards Overview */}
      <div className="analytics-grid">
        <div className="analytics-card analytics-card--accent">
          <div className="analytics-card__label">Total Requests</div>
          <div className="analytics-card__value">{total}</div>
          <div className="analytics-card__sub">Evaluated through gateway pipeline</div>
        </div>
        <div className="analytics-card analytics-card--success">
          <div className="analytics-card__label">Allowed Requests</div>
          <div className="analytics-card__value">{allowed}</div>
          <div className="analytics-card__sub">
            <span>●</span> {allowedPct}% passed all 5 security checks
          </div>
        </div>
        <div className="analytics-card analytics-card--danger">
          <div className="analytics-card__label">Blocked Requests</div>
          <div className="analytics-card__value">{blocked}</div>
          <div className="analytics-card__sub">
            <span>●</span> {blockedPct}% rejected at security boundary
          </div>
        </div>
        <div className="analytics-card">
          <div className="analytics-card__label">Pass Rate</div>
          <div className="analytics-card__value" style={{ color: allowedPct >= 70 ? "var(--success)" : "var(--warning)" }}>
            {allowedPct}%
          </div>
          <div className="analytics-card__sub">Integrity & freshness compliance</div>
        </div>
      </div>

      {/* Main Chart Panel */}
      <Panel
        title={`Request Decision Distribution (${RANGE_OPTIONS.find((o) => o.key === range)?.label || "All Time"})`}
        right={
          <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Database Source: security_events
          </span>
        }
      >
        {loading ? (
          <div className="empty">
            <div className="empty__title">Loading Analytics...</div>
            <div className="empty__subtitle">Aggregating cryptographic decision records from backend</div>
          </div>
        ) : error ? (
          <div className="empty">
            <div className="empty__title" style={{ color: "var(--danger)" }}>Error Loading Analytics</div>
            <div className="empty__subtitle">{error}</div>
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => loadData(range)}>Try Again</Button>
            </div>
          </div>
        ) : total === 0 ? (
          <EmptyState
            title="No request records found"
            subtitle={`There are no security events logged for ${RANGE_OPTIONS.find((o) => o.key === range)?.label.toLowerCase()}. Send requests from the Request Editor or Payment Checkout to populate live data.`}
          />
        ) : (
          <div className="chart-split-view">
            {/* Doughnut Chart with Center Number */}
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Tooltip content={<CustomDonutTooltip />} />
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={78}
                    outerRadius={114}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="var(--panel)"
                    strokeWidth={3}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Center Donut Label */}
              <div className="donut-center-info">
                <div className="donut-center-total">{total}</div>
                <div className="donut-center-label">Total Requests</div>
              </div>
            </div>

            {/* Breakdown & Legend */}
            <div className="breakdown-list">
              <div className="breakdown-item" style={{ borderLeft: "4px solid var(--success)" }}>
                <div className="breakdown-left">
                  <div className="breakdown-dot" style={{ background: "var(--success)" }} />
                  <div>
                    <div className="breakdown-name">Allowed Requests</div>
                    <div className="breakdown-desc">Passed API key, HMAC, timestamp, replay & rate limit</div>
                  </div>
                </div>
                <div className="breakdown-right">
                  <div className="breakdown-value" style={{ color: "var(--success)" }}>{allowed}</div>
                  <div className="breakdown-pct">{allowedPct}%</div>
                </div>
              </div>

              <div className="breakdown-item" style={{ borderLeft: "4px solid var(--danger)" }}>
                <div className="breakdown-left">
                  <div className="breakdown-dot" style={{ background: "var(--danger)" }} />
                  <div>
                    <div className="breakdown-name">Blocked Requests</div>
                    <div className="breakdown-desc">Rejected by Decision Engine before backend execution</div>
                  </div>
                </div>
                <div className="breakdown-right">
                  <div className="breakdown-value" style={{ color: "var(--danger)" }}>{blocked}</div>
                  <div className="breakdown-pct">{blockedPct}%</div>
                </div>
              </div>

              <div style={{ padding: "12px 14px", background: "var(--bg-raised)", borderRadius: "var(--radius-sm)", fontSize: 12.5, color: "var(--text-dim)" }}>
                <strong style={{ color: "var(--text)" }}>Zero-Trust Boundary:</strong> All {total} requests were checked at the gateway boundary. No unauthorized or tampered payload reached protected business endpoints.
              </div>
            </div>
          </div>
        )}
      </Panel>
    </Page>
  );
}
