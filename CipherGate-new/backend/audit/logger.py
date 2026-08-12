"""
Audit logging - every request CipherGate evaluates is persisted here,
regardless of outcome, so the dashboard and security-events page are always
backed by real data.
"""
from sqlalchemy.orm import Session

from database import SecurityEvent
from gateway.decision_engine import DecisionResult


def _event_type_for(result: DecisionResult) -> str:
    if result.allowed:
        return "VALID"
    return {
        "authentication": "AUTH_FAILURE",
        "hmac": "TAMPERING",
        "timestamp": "TIMESTAMP_EXPIRED",
        "nonce": "REPLAY",
        "rate_limit": "RATE_LIMIT",
    }.get(result.failed_check, "UNKNOWN")


def log_event(db: Session, *, method: str, endpoint: str, result: DecisionResult) -> SecurityEvent:
    event = SecurityEvent(
        client_id=result.client_id,
        endpoint=endpoint,
        method=method.upper(),
        event_type=_event_type_for(result),
        security_check=result.failed_check or "all",
        status="ALLOWED" if result.allowed else "BLOCKED",
        reason=result.reason or "Request passed all security checks",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
