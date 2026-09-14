import { useState, useCallback } from "react";
import { apiPostJson } from "../services/api.js";
import "./AuthPage.css";

/* ── password strength helper ─────────────────────────────────────── */
function strengthOf(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 3);
}

const STRENGTH_LABELS = ["", "Weak", "Fair", "Strong"];

/* ── hero feature list ───────────────────────────────────────────── */
const FEATURES = [
  {
    icon: "🛡️",
    title: "Zero-Trust Architecture",
    body: "Every request is verified with HMAC signatures, timestamps, and nonce replay protection.",
  },
  {
    icon: "🔑",
    title: "JWT-Based Sessions",
    body: "Stateless, cryptographically signed tokens — no sessions, no cookies.",
  },
  {
    icon: "📊",
    title: "Real-Time Security Dashboard",
    body: "Monitor threats, rate limits, and blocked requests as they happen.",
  },
];

/* ── main component ──────────────────────────────────────────────── */
export default function AuthPage({ onAuth }) {
  const [tab, setTab] = useState("login"); // "login" | "signup"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  /* login state */
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass]   = useState("");

  /* signup state */
  const [signEmail, setSignEmail]     = useState("");
  const [signName, setSignName]       = useState("");
  const [signPass, setSignPass]       = useState("");
  const [signConfirm, setSignConfirm] = useState("");

  const pwStrength = strengthOf(signPass);

  const switchTab = useCallback((t) => {
    setTab(t);
    setError("");
    setShowPass(false);
    setShowConfirm(false);
  }, []);

  /* ── handlers ────────────────────────────────────────────────── */
  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    if (!loginEmail || !loginPass) { setError("Please fill in all fields."); return; }
    setLoading(true);
    const res = await apiPostJson("/auth/user/login", { email: loginEmail, password: loginPass });
    setLoading(false);
    if (res.status === 200 && res.data.success) {
      localStorage.setItem("cg_user_token", res.data.access_token);
      localStorage.setItem("cg_user_email", res.data.email);
      localStorage.setItem("cg_user_name", res.data.full_name || res.data.email);
      onAuth(res.data);
    } else {
      setError(res.data?.detail?.message || res.data?.message || "Login failed. Check your credentials.");
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    if (!signEmail || !signPass || !signConfirm) { setError("Please fill in all required fields."); return; }
    if (signPass !== signConfirm) { setError("Passwords do not match."); return; }
    if (signPass.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    const res = await apiPostJson("/auth/user/register", {
      email: signEmail,
      password: signPass,
      full_name: signName,
    });
    setLoading(false);
    if (res.status === 200 && res.data.success) {
      localStorage.setItem("cg_user_token", res.data.access_token);
      localStorage.setItem("cg_user_email", res.data.email);
      localStorage.setItem("cg_user_name", res.data.full_name || res.data.email);
      onAuth(res.data);
    } else {
      setError(res.data?.detail?.message || res.data?.message || "Registration failed. Please try again.");
    }
  }

  return (
    <div className="auth-root">
      {/* ── hero panel ─────────────────────────────────────────── */}
      <section className="auth-hero" aria-hidden="true">
        <div className="auth-hero__logo">
          <div className="auth-hero__mark">CG</div>
          <div>
            <div className="auth-hero__name">CipherGate</div>
            <div className="auth-hero__tagline">Zero-Trust API Security Gateway</div>
          </div>
        </div>

        <h1 className="auth-hero__headline">
          Secure your APIs<br />
          with <span>Zero-Trust</span><br />
          by default.
        </h1>
        <p className="auth-hero__desc">
          CipherGate enforces HMAC integrity, replay protection, and rate
          limiting on every request — so no client is ever trusted implicitly.
        </p>

        <div className="auth-hero__features">
          {FEATURES.map((f) => (
            <div className="auth-feature" key={f.title}>
              <div className="auth-feature__icon">{f.icon}</div>
              <div>
                <div className="auth-feature__title">{f.title}</div>
                <div className="auth-feature__body">{f.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── card panel ─────────────────────────────────────────── */}
      <div className="auth-card-wrap">
        <div className="auth-card">
          {/* tab switcher */}
          <div className="auth-tabs" role="tablist">
            <button
              id="tab-login"
              role="tab"
              aria-selected={tab === "login"}
              className={`auth-tab ${tab === "login" ? "auth-tab--active" : ""}`}
              onClick={() => switchTab("login")}
            >
              Sign In
            </button>
            <button
              id="tab-signup"
              role="tab"
              aria-selected={tab === "signup"}
              className={`auth-tab ${tab === "signup" ? "auth-tab--active" : ""}`}
              onClick={() => switchTab("signup")}
            >
              Sign Up
            </button>
          </div>

          {/* ── LOGIN ─────────────────────────────────────────── */}
          {tab === "login" && (
            <>
              <h2 className="auth-card__title">Welcome back</h2>
              <p className="auth-card__sub">Sign in to your CipherGate account</p>

              <form className="auth-form" onSubmit={handleLogin} noValidate>
                {error && (
                  <div className="auth-error" role="alert">
                    <span>⚠️</span> {error}
                  </div>
                )}

                <div className="auth-field">
                  <label className="auth-field__label" htmlFor="login-email">Email address</label>
                  <div className="auth-field__input-wrap">
                    <span className="auth-field__icon">✉️</span>
                    <input
                      id="login-email"
                      type="email"
                      className={`auth-input ${error ? "auth-input--error" : ""}`}
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-field__label" htmlFor="login-pass">Password</label>
                  <div className="auth-field__input-wrap">
                    <span className="auth-field__icon">🔒</span>
                    <input
                      id="login-pass"
                      type={showPass ? "text" : "password"}
                      className={`auth-input ${error ? "auth-input--error" : ""}`}
                      placeholder="Your password"
                      autoComplete="current-password"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                    />
                    <button
                      type="button"
                      className="auth-toggle-pass"
                      aria-label={showPass ? "Hide password" : "Show password"}
                      onClick={() => setShowPass((v) => !v)}
                    >
                      {showPass ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <button
                  id="btn-login-submit"
                  type="submit"
                  className={`auth-submit ${loading ? "auth-submit--loading" : ""}`}
                  disabled={loading}
                >
                  {loading && <span className="auth-spinner" aria-hidden="true" />}
                  Sign In
                </button>

                <div className="auth-divider">or</div>

                <div className="auth-footer">
                  Don't have an account?{" "}
                  <button type="button" onClick={() => switchTab("signup")}>
                    Create one
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ── SIGNUP ────────────────────────────────────────── */}
          {tab === "signup" && (
            <>
              <h2 className="auth-card__title">Create account</h2>
              <p className="auth-card__sub">Start securing your APIs in minutes</p>

              <form className="auth-form" onSubmit={handleSignup} noValidate>
                {error && (
                  <div className="auth-error" role="alert">
                    <span>⚠️</span> {error}
                  </div>
                )}

                <div className="auth-field">
                  <label className="auth-field__label" htmlFor="sign-name">Full name <span style={{color:"var(--text-faint)"}}>(optional)</span></label>
                  <div className="auth-field__input-wrap">
                    <span className="auth-field__icon">👤</span>
                    <input
                      id="sign-name"
                      type="text"
                      className="auth-input"
                      placeholder="Jane Doe"
                      autoComplete="name"
                      value={signName}
                      onChange={(e) => setSignName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-field__label" htmlFor="sign-email">Email address</label>
                  <div className="auth-field__input-wrap">
                    <span className="auth-field__icon">✉️</span>
                    <input
                      id="sign-email"
                      type="email"
                      className={`auth-input ${error && !signEmail ? "auth-input--error" : ""}`}
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={signEmail}
                      onChange={(e) => setSignEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-field__label" htmlFor="sign-pass">Password</label>
                  <div className="auth-field__input-wrap">
                    <span className="auth-field__icon">🔒</span>
                    <input
                      id="sign-pass"
                      type={showPass ? "text" : "password"}
                      className="auth-input"
                      placeholder="Min. 6 characters"
                      autoComplete="new-password"
                      value={signPass}
                      onChange={(e) => setSignPass(e.target.value)}
                    />
                    <button
                      type="button"
                      className="auth-toggle-pass"
                      aria-label={showPass ? "Hide password" : "Show password"}
                      onClick={() => setShowPass((v) => !v)}
                    >
                      {showPass ? "🙈" : "👁️"}
                    </button>
                  </div>
                  {signPass && (
                    <div className="auth-strength">
                      <div className="auth-strength__bars">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`auth-strength__bar ${pwStrength >= i ? `auth-strength__bar--${pwStrength}` : ""}`}
                          />
                        ))}
                      </div>
                      <span className="auth-strength__label">{STRENGTH_LABELS[pwStrength]}</span>
                    </div>
                  )}
                </div>

                <div className="auth-field">
                  <label className="auth-field__label" htmlFor="sign-confirm">Confirm password</label>
                  <div className="auth-field__input-wrap">
                    <span className="auth-field__icon">🔒</span>
                    <input
                      id="sign-confirm"
                      type={showConfirm ? "text" : "password"}
                      className={`auth-input ${signConfirm && signPass !== signConfirm ? "auth-input--error" : ""}`}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      value={signConfirm}
                      onChange={(e) => setSignConfirm(e.target.value)}
                    />
                    <button
                      type="button"
                      className="auth-toggle-pass"
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                      onClick={() => setShowConfirm((v) => !v)}
                    >
                      {showConfirm ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                <button
                  id="btn-signup-submit"
                  type="submit"
                  className={`auth-submit ${loading ? "auth-submit--loading" : ""}`}
                  disabled={loading}
                >
                  {loading && <span className="auth-spinner" aria-hidden="true" />}
                  Create Account
                </button>

                <div className="auth-divider">or</div>

                <div className="auth-footer">
                  Already have an account?{" "}
                  <button type="button" onClick={() => switchTab("login")}>
                    Sign in
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
