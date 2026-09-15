import "./Layout.css";
import AssistantWidget from "./AssistantWidget.jsx";

const NAV = [
  { key: "dashboard", label: "Dashboard" },
  { key: "payment", label: "Payment Checkout" },
  { key: "editor", label: "Request Editor" },
  { key: "applications", label: "Applications" },
  { key: "events", label: "Security Events" },
  { key: "settings", label: "Settings" },
  { key: "_sep", label: "", separator: true },
  { key: "ciphershop", label: "🛒 CipherShop" },
  { key: "security-demo", label: "⚡ Security Demo" },
];

export default function Layout({ active, onNavigate, children, user, onLogout }) {
  const displayName = user?.full_name || user?.email || "User";
  const displayEmail = user?.email || "";

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <div className="shell__brand-mark">CG</div>
          <div>
            <div className="shell__brand-name">CipherGate</div>
            <div className="shell__brand-sub">Zero-Trust Gateway</div>
          </div>
        </div>
        <nav className="shell__nav">
          {NAV.map((item) => {
            if (item.separator) {
              return (
                <div key={item.key} style={{ margin: "8px 0", borderTop: "1px solid var(--border-soft)" }} />
              );
            }
            const isShopItem = item.key === "ciphershop" || item.key === "security-demo";
            return (
              <button
                key={item.key}
                className={`shell__nav-item ${active === item.key ? "shell__nav-item--active" : ""} ${isShopItem && active !== item.key ? "shell__nav-item--shop" : ""}`}
                onClick={() => onNavigate(item.key)}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="shell__sidebar-footer">
          <div className="shell__user-info">
            <div className="shell__user-avatar">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="shell__user-text">
              <div className="shell__user-name">{displayName}</div>
              {displayEmail && displayEmail !== displayName && (
                <div className="shell__user-email">{displayEmail}</div>
              )}
            </div>
          </div>
          <div className="shell__status-row">
            <div className="shell__status-dot" />
            <span>Gateway online</span>
            {onLogout && (
              <button id="btn-logout" className="shell__logout-btn" onClick={onLogout} title="Sign out">
                ⏏
              </button>
            )}
          </div>
        </div>
      </aside>
      <main className="shell__main">{children}</main>
      <AssistantWidget />
    </div>
  );
}
