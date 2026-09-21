import { useState, useEffect } from "react";
import "./ThemeToggle.css";

/**
 * Reads the saved theme from localStorage, falling back to "dark" (the
 * original CipherGate default).  Applies `data-theme` on `<html>` so every
 * CSS variable override activates site-wide.
 */
function getInitialTheme() {
  const saved = localStorage.getItem("cg_theme");
  if (saved === "light" || saved === "dark") return saved;
  // Optionally respect OS preference on first visit
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

export default function ThemeToggle({ floating = false }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cg_theme", theme);
  }, [theme]);

  function toggle() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  const isDark = theme === "dark";

  return (
    <button
      id="btn-theme-toggle"
      className={`theme-toggle theme-toggle--${theme}${floating ? " theme-toggle--floating" : ""}`}
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
    >
      <span className="theme-toggle__icon">
        {/* Sun icon */}
        <span className="theme-toggle__sun" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </span>
        {/* Moon icon */}
        <span className="theme-toggle__moon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </span>
      </span>
      <span className="theme-toggle__label">
        {isDark ? "Dark Mode" : "Light Mode"}
      </span>
    </button>
  );
}
