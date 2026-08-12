import { useState } from "react";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import RequestEditor from "./pages/RequestEditor.jsx";
import Applications from "./pages/Applications.jsx";
import SecurityEvents from "./pages/SecurityEvents.jsx";
import Settings from "./pages/Settings.jsx";

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [lastCredentials, setLastCredentials] = useState(null);

  return (
    <Layout active={active} onNavigate={setActive}>
      {active === "dashboard" && <Dashboard />}
      {active === "editor" && <RequestEditor credentials={lastCredentials} />}
      {active === "applications" && (
        <Applications onCredentialsIssued={setLastCredentials} />
      )}
      {active === "events" && <SecurityEvents />}
      {active === "settings" && <Settings />}
    </Layout>
  );
}
