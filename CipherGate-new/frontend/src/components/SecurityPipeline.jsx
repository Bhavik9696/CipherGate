import "./SecurityPipeline.css";

const STAGES = [
  { key: "authentication", label: "Auth" },
  { key: "hmac", label: "HMAC" },
  { key: "timestamp", label: "Timestamp" },
  { key: "nonce", label: "Nonce" },
  { key: "rate_limit", label: "Rate Limit" },
];

/**
 * The signature element: a live 5-stage checkpoint chain. Each node's
 * state (idle / passed / failed / skipped) comes straight from the
 * decision engine's response - nothing here is simulated.
 */
export default function SecurityPipeline({ checks, allowed, compact = false }) {
  const hasResult = checks && Object.keys(checks).length > 0;

  return (
    <div className={`pipeline ${compact ? "pipeline--compact" : ""}`}>
      <div className="pipeline__chain">
        {STAGES.map((stage, i) => {
          const state = hasResult ? checks[stage.key] || "idle" : "idle";
          return (
            <div className="pipeline__stage" key={stage.key}>
              <div className={`pipeline__node pipeline__node--${state}`}>
                <span className="pipeline__index">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <div className="pipeline__label">{stage.label}</div>
              {i < STAGES.length - 1 && (
                <div className={`pipeline__connector pipeline__connector--${state === "passed" ? "on" : "off"}`} />
              )}
            </div>
          );
        })}
      </div>
      {hasResult && !compact && (
        <div className={`pipeline__verdict pipeline__verdict--${allowed ? "allowed" : "blocked"}`}>
          {allowed ? "REQUEST ALLOWED" : "REQUEST BLOCKED"}
        </div>
      )}
    </div>
  );
}
