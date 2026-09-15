"""
CipherShop Integration Tests

Verifies that the CipherShop → CipherGate → Demo Backend flow works correctly
for all five demonstration scenarios. All tests use real HTTP requests against
the actual CipherGate security pipeline — nothing is mocked.

These tests complement (and do not replace) the existing test_gateway.py suite.
"""
import time
import json

import pytest

from tests.conftest import sign_payment_request, sign_request


# ---------------------------------------------------------------------------
# Helper: build a signed request for a CipherShop-style payment body
# ---------------------------------------------------------------------------

def cs_body(amount=5000, product="Wireless Headphones - CipherShop"):
    return {"amount": amount, "receiver": product}


# ---------------------------------------------------------------------------
# 1. DEMO 1 — Normal payment flow
# ---------------------------------------------------------------------------

def test_ciphershop_valid_payment_allowed(client, registered_app):
    """CipherShop PAY NOW: valid signed request passes all security checks."""
    headers, body_raw = sign_payment_request(
        registered_app,
        cs_body(5000, "Wireless Headphones - CipherShop"),
    )
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["decision"]["allowed"] is True


def test_ciphershop_valid_request_reaches_backend(client, registered_app):
    """Valid payment is forwarded to the demo backend after all checks pass."""
    headers, body_raw = sign_payment_request(
        registered_app,
        cs_body(8000, "Smart Watch - CipherShop"),
    )
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    data = resp.json()
    assert resp.status_code == 200
    assert data["message"] == "Payment request processed"
    assert data["amount"] == 8000
    assert "Smart Watch" in data["receiver"]


def test_ciphershop_all_pipeline_checks_pass(client, registered_app):
    """All five security checks report 'passed' for a valid request."""
    headers, body_raw = sign_payment_request(
        registered_app,
        cs_body(4000, "Mechanical Keyboard - CipherShop"),
    )
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    checks = resp.json()["decision"]["checks"]
    for check in ["authentication", "hmac", "timestamp", "nonce", "rate_limit"]:
        assert checks[check] == "passed", f"Expected {check} to pass"


# ---------------------------------------------------------------------------
# 2. DEMO 2 — Request Tampering Attack
# ---------------------------------------------------------------------------

def test_ciphershop_tampered_body_rejected(client, registered_app):
    """Sign ₹5,000 body, send ₹50,000 body — HMAC mismatch blocks the request."""
    # Sign the original body
    headers, _ = sign_payment_request(
        registered_app,
        cs_body(5000, "Wireless Headphones - CipherShop"),
    )
    # Send a different body with the same signature
    tampered_raw = json.dumps({"amount": 50000, "receiver": "Wireless Headphones - CipherShop"},
                               separators=(",", ":"))
    resp = client.post("/api/payment", headers=headers, content=tampered_raw)
    assert resp.status_code == 403
    data = resp.json()
    assert data["error"] == "HMAC_VERIFICATION_FAILED"
    assert data["decision"]["allowed"] is False


def test_ciphershop_tampered_request_does_not_reach_backend(client, registered_app):
    """Tampered request is blocked before the backend processes it."""
    headers, _ = sign_payment_request(
        registered_app,
        cs_body(5000, "Wireless Headphones - CipherShop"),
    )
    tampered_raw = json.dumps({"amount": 50000, "receiver": "Wireless Headphones - CipherShop"},
                               separators=(",", ":"))
    resp = client.post("/api/payment", headers=headers, content=tampered_raw)
    data = resp.json()
    # Backend-only fields must be absent — demo backend was never called
    assert "message" not in data or data.get("error") == "HMAC_VERIFICATION_FAILED"
    assert "amount" not in data


# ---------------------------------------------------------------------------
# 3. DEMO 3 — Replay Attack
# ---------------------------------------------------------------------------

def test_ciphershop_replay_first_request_allowed(client, registered_app):
    """First request with a fresh nonce is allowed."""
    headers, body_raw = sign_payment_request(
        registered_app,
        cs_body(5000, "Smart Watch - CipherShop"),
    )
    first = client.post("/api/payment", headers=headers, content=body_raw)
    assert first.status_code == 200
    assert first.json()["decision"]["allowed"] is True


def test_ciphershop_replay_second_request_rejected(client, registered_app):
    """Exact same request (same nonce) is rejected as a replay attack."""
    headers, body_raw = sign_payment_request(
        registered_app,
        cs_body(5000, "Smart Watch - CipherShop"),
    )
    first = client.post("/api/payment", headers=headers, content=body_raw)
    assert first.status_code == 200

    second = client.post("/api/payment", headers=headers, content=body_raw)
    assert second.status_code == 409
    data = second.json()
    assert data["error"] == "REPLAY_ATTACK"
    assert data["decision"]["allowed"] is False


# ---------------------------------------------------------------------------
# 4. DEMO 4 — Expired Timestamp Attack
# ---------------------------------------------------------------------------

def test_ciphershop_expired_timestamp_rejected(client, registered_app):
    """Request with a 10-minute-old timestamp is rejected by CipherGate."""
    old_ts = time.time() - 600  # 10 minutes ago; window is 30s
    headers, body_raw = sign_payment_request(
        registered_app,
        cs_body(5000, "Laptop - CipherShop"),
        timestamp=old_ts,
    )
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    assert resp.status_code == 408
    data = resp.json()
    assert data["error"] == "TIMESTAMP_EXPIRED"
    assert data["decision"]["allowed"] is False


# ---------------------------------------------------------------------------
# 5. DEMO 5 — Rate Limit Burst
# ---------------------------------------------------------------------------

def test_ciphershop_rate_limit_burst(client, registered_app):
    """
    25 requests from CipherShop: first ~20 allowed, remaining get 429.
    Rate limit is 20/min per application (DEFAULT_RATE_LIMIT = 20).
    """
    responses = []
    for i in range(25):
        headers, body_raw = sign_payment_request(
            registered_app,
            cs_body(100, f"Rate-Limit-Test-{i}"),
        )
        responses.append(client.post("/api/payment", headers=headers, content=body_raw))

    statuses = [r.status_code for r in responses]
    assert 200 in statuses, "At least some requests should be allowed"
    assert 429 in statuses, "Some requests should be rate-limited"

    blocked = [r for r in responses if r.status_code == 429]
    assert all(r.json()["error"] == "RATE_LIMIT_EXCEEDED" for r in blocked)
    assert len(blocked) >= 1


# ---------------------------------------------------------------------------
# 6. Audit / Dashboard integration
# ---------------------------------------------------------------------------

def test_ciphershop_events_appear_in_audit_log(client, registered_app):
    """CipherShop requests are recorded in the security_events audit table."""
    headers, body_raw = sign_payment_request(
        registered_app,
        cs_body(5000, "Wireless Headphones - CipherShop"),
    )
    client.post("/api/payment", headers=headers, content=body_raw)

    logs = client.get("/audit/logs").json()
    assert len(logs) >= 1
    assert logs[0]["endpoint"] == "/api/payment"


def test_ciphershop_blocked_events_appear_in_audit_log(client, registered_app):
    """Blocked requests (HMAC failure) are also logged in the audit system."""
    headers, _ = sign_payment_request(
        registered_app,
        cs_body(5000, "Wireless Headphones - CipherShop"),
    )
    tampered_raw = json.dumps({"amount": 99999, "receiver": "ATTACKER"}, separators=(",", ":"))
    client.post("/api/payment", headers=headers, content=tampered_raw)

    logs = client.get("/audit/logs").json()
    blocked = [e for e in logs if e["status"] == "BLOCKED"]
    assert len(blocked) >= 1


def test_ciphershop_dashboard_stats_updated(client, registered_app):
    """Dashboard counters reflect both allowed and blocked CipherShop events."""
    # Send a valid request
    headers1, body_raw1 = sign_payment_request(
        registered_app,
        cs_body(5000, "Smart Watch - CipherShop"),
    )
    client.post("/api/payment", headers=headers1, content=body_raw1)

    # Replay it (blocked)
    client.post("/api/payment", headers=headers1, content=body_raw1)

    stats = client.get("/dashboard/stats").json()
    assert stats["total_requests"] >= 2
    assert stats["allowed"] >= 1
    assert stats["replay_attacks"] >= 1


# ---------------------------------------------------------------------------
# 7. Existing pages still work (regression guard)
# ---------------------------------------------------------------------------

def test_existing_dashboard_stats_still_work(client, registered_app):
    """Dashboard stats endpoint returns all expected fields."""
    resp = client.get("/dashboard/stats")
    assert resp.status_code == 200
    data = resp.json()
    for key in ["total_requests", "allowed", "blocked", "hmac_failures",
                "replay_attacks", "rate_limit_violations", "timestamp_failures"]:
        assert key in data, f"Missing key: {key}"


def test_existing_applications_page_still_works(client, registered_app):
    """Applications listing endpoint still returns at least the registered app."""
    resp = client.get("/applications")
    assert resp.status_code == 200
    apps = resp.json()
    assert isinstance(apps, list)
    assert len(apps) >= 1
    assert "api_key" in apps[0]
    assert "hmac_secret" not in apps[0]   # never re-exposed


def test_existing_request_editor_gateway_still_works(client, registered_app):
    """The generic /gateway/request (Request Editor) endpoint still functions."""
    body = {"name": "CipherShop Test Item", "price": 5000}
    headers, _ = sign_request(registered_app, body, path="/api/items")
    envelope = {"method": "POST", "path": "/api/items", "body": body}
    resp = client.post("/gateway/request", headers=headers, json=envelope)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["decision"]["allowed"] is True


def test_existing_security_events_page_still_works(client, registered_app):
    """The audit log endpoint returns structured event records."""
    headers, body_raw = sign_payment_request(
        registered_app,
        cs_body(5000, "Keyboard - CipherShop"),
    )
    client.post("/api/payment", headers=headers, content=body_raw)

    resp = client.get("/audit/logs?limit=10")
    assert resp.status_code == 200
    logs = resp.json()
    assert isinstance(logs, list)
    assert len(logs) >= 1
    record = logs[0]
    for field in ["id", "timestamp", "endpoint", "event_type", "status"]:
        assert field in record, f"Missing field: {field}"
