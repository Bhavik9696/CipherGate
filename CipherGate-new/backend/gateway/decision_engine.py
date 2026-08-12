"""
The Security Decision Engine.

This is CipherGate's single point of truth: every gated request passes
through `evaluate_request`, which runs the checks in order and returns a
structured result the API layer and the audit log both consume.

Order matters and mirrors the assignment brief:
  1. Authentication (API key lookup)
  2. HMAC-SHA256 integrity
  3. Timestamp freshness
  4. Nonce / replay
  5. Rate limit
"""
import time
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from config import settings
from crypto.hmac_utils import build_canonical_request, verify_signature
from replay.nonce_store import is_nonce_reused, record_nonce
from rate_limit.limiter import rate_limiter
from auth.credentials import get_application_by_api_key
from database import Application

CHECK_ORDER = ["authentication", "hmac", "timestamp", "nonce", "rate_limit"]


@dataclass
class DecisionResult:
    allowed: bool
    checks: dict = field(default_factory=dict)   # check_name -> "passed" | "failed" | "skipped"
    failed_check: Optional[str] = None
    reason: Optional[str] = None
    status_code: int = 200
    error_code: Optional[str] = None
    client_id: Optional[str] = None
    application: Optional[Application] = None


def _fail(result: DecisionResult, check: str, status_code: int, error_code: str, reason: str) -> DecisionResult:
    result.checks[check] = "failed"
    for remaining in CHECK_ORDER[CHECK_ORDER.index(check) + 1:]:
        result.checks[remaining] = "skipped"
    result.allowed = False
    result.failed_check = check
    result.status_code = status_code
    result.error_code = error_code
    result.reason = reason
    return result


def evaluate_request(
    db: Session,
    *,
    method: str,
    path: str,
    body_raw: str,
    api_key: Optional[str],
    timestamp: Optional[str],
    nonce: Optional[str],
    signature: Optional[str],
) -> DecisionResult:
    result = DecisionResult(allowed=True)

    # 1. Authentication --------------------------------------------------
    application = get_application_by_api_key(db, api_key) if api_key else None
    if not application:
        return _fail(result, "authentication", 401, "AUTHENTICATION_FAILED", "Invalid or missing API key")
    result.checks["authentication"] = "passed"
    result.client_id = application.id
    result.application = application

    # 2. HMAC-SHA256 integrity -------------------------------------------
    if not signature:
        return _fail(result, "hmac", 403, "HMAC_VERIFICATION_FAILED", "Missing signature")
    canonical = build_canonical_request(method, path, timestamp or "", nonce or "", body_raw)
    if not verify_signature(application.hmac_secret, canonical, signature):
        return _fail(result, "hmac", 403, "HMAC_VERIFICATION_FAILED", "Request integrity verification failed")
    result.checks["hmac"] = "passed"

    # 3. Timestamp freshness ----------------------------------------------
    try:
        ts_value = float(timestamp)
    except (TypeError, ValueError):
        return _fail(result, "timestamp", 401, "TIMESTAMP_INVALID", "Request timestamp missing or malformed")

    if abs(time.time() - ts_value) > settings.REPLAY_WINDOW_SECONDS:
        return _fail(result, "timestamp", 408, "TIMESTAMP_EXPIRED", "Request timestamp expired")
    result.checks["timestamp"] = "passed"

    # 4. Nonce / replay -----------------------------------------------------
    if not nonce:
        return _fail(result, "nonce", 401, "NONCE_MISSING", "Missing nonce")
    if is_nonce_reused(db, application.id, nonce):
        return _fail(result, "nonce", 409, "REPLAY_ATTACK", "Replay attack detected: nonce already used")
    result.checks["nonce"] = "passed"

    # 5. Rate limit -----------------------------------------------------
    if not rate_limiter.allow(application.id, limit_override=application.rate_limit):
        return _fail(result, "rate_limit", 429, "RATE_LIMIT_EXCEEDED", "Too many requests")
    result.checks["rate_limit"] = "passed"

    # All checks passed - record the nonce now so it can't be reused.
    record_nonce(db, application.id, nonce)

    result.allowed = True
    result.status_code = 200
    return result
