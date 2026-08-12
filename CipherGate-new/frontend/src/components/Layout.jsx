import "./Layout.css";

const NAV = [
  { key: "dashboard", label: "Dashboard" },
  { key: "editor", label: "Request Editor" },
  { key: "applications", label: "Applications" },
  { key: "events", label: "Security Events" },
  { key: "settings", label: "Settings" },
];

export default function Layout({ active, onNavigate, children }) {
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
          {NAV.map((item) => (
            <button
              key={item.key}
              className={`shell__nav-item ${active === item.key ? "shell__nav-item--active" : ""}`}
              onClick={() => onNavigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="shell__sidebar-footer">
          <div className="shell__status-dot" />
          <span>Gateway online</span>
        </div>
      </aside>
      <main className="shell__main">{children}</main>
    </div>
  );
}
