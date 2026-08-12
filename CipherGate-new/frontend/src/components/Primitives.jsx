import "./Primitives.css";

export function Page({ eyebrow, title, subtitle, actions, children }) {
  return (
    <div className="page">
      <div className="page__header">
        <div>
          {eyebrow && <div className="page__eyebrow">{eyebrow}</div>}
          <h1 className="page__title">{title}</h1>
          {subtitle && <p className="page__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page__actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, right, children, className = "" }) {
  return (
    <div className={`panel ${className}`}>
      {(title || right) && (
        <div className="panel__header">
          {title && <div className="panel__title">{title}</div>}
          {right}
        </div>
      )}
      <div className="panel__body">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, tone = "neutral" }) {
  return (
    <div className={`stat stat--${tone}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const isAllowed = status === "ALLOWED";
  return (
    <span className={`badge ${isAllowed ? "badge--success" : "badge--danger"}`}>
      {status}
    </span>
  );
}

export function EventTypeTag({ type }) {
  const toneMap = {
    VALID: "success",
    TAMPERING: "danger",
    REPLAY: "danger",
    RATE_LIMIT: "warning",
    AUTH_FAILURE: "danger",
    TIMESTAMP_EXPIRED: "warning",
  };
  const tone = toneMap[type] || "neutral";
  return <span className={`tag tag--${tone}`}>{type}</span>;
}

export function Button({ children, variant = "primary", ...props }) {
  return (
    <button className={`btn btn--${variant}`} {...props}>
      {children}
    </button>
  );
}

export function EmptyState({ title, subtitle }) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {subtitle && <div className="empty__subtitle">{subtitle}</div>}
    </div>
  );
}
