import { useState } from "react";
import AuthPage from "./pages/AuthPage.jsx";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import PaymentPage from "./pages/PaymentPage.jsx";
import RequestEditor from "./pages/RequestEditor.jsx";
import Applications from "./pages/Applications.jsx";
import SecurityEvents from "./pages/SecurityEvents.jsx";
import Settings from "./pages/Settings.jsx";
import HelpGuide from "./pages/HelpGuide.jsx";

export default function App() {
  // Check if we already have a saved session
  const savedToken = localStorage.getItem("cg_user_token");
  const [user, setUser] = useState(
    savedToken
      ? {
          access_token: savedToken,
          email: localStorage.getItem("cg_user_email") || "",
          full_name: localStorage.getItem("cg_user_name") || "",
        }
      : null
  );

  const [active, setActive] = useState("dashboard");
  const [lastCredentials, setLastCredentials] = useState(null);

  function handleAuth(userData) {
    setUser(userData);
    setActive("dashboard");
  }

  function handleLogout() {
    localStorage.removeItem("cg_user_token");
    localStorage.removeItem("cg_user_email");
    localStorage.removeItem("cg_user_name");
    setUser(null);
  }

  // Show auth landing if not authenticated
  if (!user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return (
    <Layout active={active} onNavigate={setActive} user={user} onLogout={handleLogout}>
      {active === "dashboard" && <Dashboard onNavigate={setActive} />}
      {active === "payment" && <PaymentPage credentials={lastCredentials} />}
      {active === "editor" && <RequestEditor credentials={lastCredentials} onNavigate={setActive} />}
      {active === "applications" && (
        <Applications onCredentialsIssued={setLastCredentials} onNavigate={setActive} />
      )}
      {active === "events" && <SecurityEvents />}
      {active === "settings" && <Settings onNavigate={setActive} />}
      {active === "help" && <HelpGuide onNavigate={setActive} />}
    </Layout>
  );
}

