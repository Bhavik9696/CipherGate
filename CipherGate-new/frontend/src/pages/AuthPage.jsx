import { useState, useCallback, useEffect, useRef } from "react";
import { apiPostJson } from "../services/api.js";
import ThemeToggle from "../components/ThemeToggle.jsx";
import "./AuthPage.css";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const googleBtnRef = useRef(null);

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

  /* ── Google credential response handler ──────────────────────── */
  const handleGoogleCredentialResponse = useCallback(
    async (response) => {
      if (!response?.credential) {
        setError("Google Sign-In failed: No credential received.");
        return;
      }
      setGoogleLoading(true);
      setError("");
      try {
        const res = await apiPostJson("/auth/google", { credential: response.credential });
        setGoogleLoading(false);
        if (res.status === 200 && res.data.success) {
          localStorage.setItem("cg_user_token", res.data.access_token);
          localStorage.setItem("cg_user_email", res.data.email);
          localStorage.setItem("cg_user_name", res.data.full_name || res.data.email);
          onAuth(res.data);
        } else {
          setError(
            res.data?.detail?.message ||
              res.data?.message ||
              "Google authentication failed on server."
          );
        }
      } catch (err) {
        setGoogleLoading(false);
        setError("Failed to connect to CipherGate backend for Google verification.");
      }
    },
    [onAuth]
  );

  /* ── Initialize Google Identity Services ──────────────────────── */
  useEffect(() => {
    if (tab !== "login") return;

    let timer = null;
    function renderGis() {
      if (window.google?.accounts?.id && GOOGLE_CLIENT_ID) {
        try {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          if (googleBtnRef.current) {
            googleBtnRef.current.innerHTML = "";
            window.google.accounts.id.renderButton(googleBtnRef.current, {
              theme: "outline",
              size: "large",
              type: "standard",
              shape: "rectangular",
              text: "signin_with",
              logo_alignment: "left",
              width: 320,
            });
          }
          return true;
        } catch (e) {
          console.error("Failed to render GIS button:", e);
        }
      }
      return false;
    }

    if (!renderGis()) {
      timer = setInterval(() => {
        if (renderGis()) {
          clearInterval(timer);
        }
      }, 300);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [tab, handleGoogleCredentialResponse]);

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
      <ThemeToggle floating />
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

              {error && (
                <div className="auth-error" role="alert" style={{ marginBottom: 16 }}>
                  <span>⚠️</span> {error}
                </div>
              )}

              {/* ── Google Sign In ── */}
              <div className="auth-google-section">
                <div ref={googleBtnRef} id="google-signin-btn-container" className="auth-google-wrapper" />
                {(!GOOGLE_CLIENT_ID || googleLoading) && (
                  <button
                    id="btn-google-signin"
                    type="button"
                    className={`auth-google-btn ${googleLoading ? "auth-google-btn--loading" : ""}`}
                    onClick={() => {
                      if (!GOOGLE_CLIENT_ID) {
                        setError("Google Sign-In requires VITE_GOOGLE_CLIENT_ID to be set in frontend/.env");
                      }
                    }}
                    disabled={loading || googleLoading}
                  >
                    <svg className="auth-google-icon" viewBox="0 0 24 24" width="18" height="18">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>{googleLoading ? "Signing in with Google..." : "Sign in with Google"}</span>
                  </button>
                )}
              </div>

              <div className="auth-divider">or continue with email</div>

              <form className="auth-form" onSubmit={handleLogin} noValidate>

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
