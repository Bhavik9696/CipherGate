"""
Automated unit & integration tests for CipherGate Analytics endpoints:
- GET /analytics/request-decisions
- GET /analytics/application-requests
- GET /analytics/security-threats
"""
import time
from tests.conftest import sign_payment_request, sign_request


def test_empty_database_request_decisions(client):
    """Graceful empty database response for request decisions."""
    resp = client.get("/analytics/request-decisions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["allowed"] == 0
    assert data["blocked"] == 0
    assert data["allowed_pct"] == 0.0
    assert data["blocked_pct"] == 0.0
    assert len(data["breakdown"]) == 2
    assert data["breakdown"][0]["value"] == 0
    assert data["breakdown"][1]["value"] == 0


def test_empty_database_application_requests(client):
    """Graceful empty database response for application requests."""
    resp = client.get("/analytics/application-requests")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_requests"] == 0
    assert data["registered_apps_count"] == 0
    assert data["applications"] == []
    assert data["unauthenticated"]["total_requests"] == 0


def test_empty_database_security_threats(client):
    """Graceful empty database response for security threats."""
    resp = client.get("/analytics/security-threats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_threats"] == 0
    assert len(data["categories"]) == 5
    for cat in data["categories"]:
        assert cat["count"] == 0
        assert cat["percentage"] == 0.0


def test_request_decisions_allowed_vs_blocked_accuracy(client, registered_app):
    """Generates real allowed and blocked requests and verifies analytics accuracy."""
    # 1. Send 2 valid requests (Allowed)
    h1, b1 = sign_payment_request(registered_app, {"amount": 100, "receiver": "Shop A"})
    resp1 = client.post("/api/payment", headers=h1, content=b1)
    assert resp1.status_code == 200

    h2, b2 = sign_payment_request(registered_app, {"amount": 200, "receiver": "Shop B"})
    resp2 = client.post("/api/payment", headers=h2, content=b2)
    assert resp2.status_code == 200

    # 2. Send 1 tampered request (Blocked)
    h3, _ = sign_payment_request(registered_app, {"amount": 300, "receiver": "Shop C"})
    resp3 = client.post("/api/payment", headers=h3, content='{"amount": 9999, "receiver": "Shop C"}')
    assert resp3.status_code == 403

    # Query analytics
    analytics_resp = client.get("/analytics/request-decisions")
    assert analytics_resp.status_code == 200
    data = analytics_resp.json()

    assert data["total"] == 3
    assert data["allowed"] == 2
    assert data["blocked"] == 1
    assert data["allowed_pct"] == 66.7
    assert data["blocked_pct"] == 33.3

    # Verify breakdown items
    allowed_entry = next(item for item in data["breakdown"] if item["status"] == "ALLOWED")
    blocked_entry = next(item for item in data["breakdown"] if item["status"] == "BLOCKED")
    assert allowed_entry["value"] == 2
    assert blocked_entry["value"] == 1


def test_request_decisions_time_range_filter(client, registered_app):
    """Verifies that the range parameter is respected and returned."""
    for r in ["all", "24h", "7d", "30d"]:
        resp = client.get(f"/analytics/request-decisions?range={r}")
        assert resp.status_code == 200
        assert resp.json()["range"] == r


def test_application_requests_aggregation(client, registered_app):
    """Verifies that requests are accurately correlated with registered applications."""
    # Register a second application
    resp_app2 = client.post("/auth/register", json={"name": "Second App", "password": "pass2"})
    assert resp_app2.status_code == 200
    app2 = resp_app2.json()

    # Send 3 requests from App 1 (2 allowed, 1 tampered blocked)
    h, b = sign_payment_request(registered_app, {"amount": 50})
    client.post("/api/payment", headers=h, content=b)
    h, b = sign_payment_request(registered_app, {"amount": 60})
    client.post("/api/payment", headers=h, content=b)
    h, _ = sign_payment_request(registered_app, {"amount": 70})
    client.post("/api/payment", headers=h, content='{"amount": 7000}')

    # Send 1 request from App 2 (1 allowed)
    h2, b2 = sign_payment_request(app2, {"amount": 100})
    client.post("/api/payment", headers=h2, content=b2)

    # Send 1 unauthenticated request (bad API key)
    bad_headers, bad_b = sign_payment_request(registered_app, {"amount": 10})
    bad_headers["X-API-Key"] = "cg_live_invalid_key_999"
    client.post("/api/payment", headers=bad_headers, content=bad_b)

    # Query application analytics
    res = client.get("/analytics/application-requests")
    assert res.status_code == 200
    data = res.json()

    assert data["total_requests"] == 5
    assert data["registered_apps_count"] >= 2

    # Verify App 1 stats
    app1_id = registered_app.get("application_id") or registered_app.get("id")
    app1_stats = next(a for a in data["applications"] if a["id"] == app1_id)
    assert app1_stats["name"] == registered_app["name"]
    assert app1_stats["total_requests"] == 3
    assert app1_stats["allowed_requests"] == 2
    assert app1_stats["blocked_requests"] == 1

    # Verify App 2 stats
    app2_id = app2.get("application_id") or app2.get("id")
    app2_stats = next(a for a in data["applications"] if a["id"] == app2_id)
    assert app2_stats["name"] == "Second App"
    assert app2_stats["total_requests"] == 1
    assert app2_stats["allowed_requests"] == 1
    assert app2_stats["blocked_requests"] == 0

    # Verify unauthenticated stats
    assert data["unauthenticated"]["total_requests"] == 1
    assert data["unauthenticated"]["blocked_requests"] == 1

    # Verify no secrets are exposed in response
    for a in data["applications"]:
        assert "hmac_secret" not in a
        assert "hashed_password" not in a


def test_security_threat_breakdown_reflects_actual_attack_events(client, registered_app):
    """
    Triggers real HMAC tampering, replay attack, expired timestamp, and auth failure events,
    then asserts that the /analytics/security-threats breakdown accurately counts each category.
    """
    # 1. HMAC Tampering
    h1, _ = sign_payment_request(registered_app, {"amount": 500, "receiver": "Store"})
    client.post("/api/payment", headers=h1, content='{"amount": 50000, "receiver": "Attacker"}')

    # 2. Replay Attack
    h2, b2 = sign_payment_request(registered_app, {"amount": 100, "receiver": "Store"})
    r1 = client.post("/api/payment", headers=h2, content=b2)
    assert r1.status_code == 200
    r2 = client.post("/api/payment", headers=h2, content=b2)  # Replay
    assert r2.status_code == 409

    # 3. Expired Timestamp
    old_ts = time.time() - 120  # 2 minutes ago
    h3, b3 = sign_payment_request(registered_app, {"amount": 200}, timestamp=old_ts)
    r3 = client.post("/api/payment", headers=h3, content=b3)
    assert r3.status_code == 408

    # 4. Authentication Failure (missing or invalid API key)
    h4, b4 = sign_payment_request(registered_app, {"amount": 300})
    h4["X-API-Key"] = "cg_live_fake_key"
    r4 = client.post("/api/payment", headers=h4, content=b4)
    assert r4.status_code == 401

    # Query threat analytics
    threats_res = client.get("/analytics/security-threats")
    assert threats_res.status_code == 200
    data = threats_res.json()

    assert data["total_threats"] == 4

    cat_map = {c["event_type"]: c for c in data["categories"]}

    # HMAC tampering
    assert "TAMPERING" in cat_map
    assert cat_map["TAMPERING"]["count"] == 1
    assert cat_map["TAMPERING"]["category"] == "HMAC Verification Failures"
    assert cat_map["TAMPERING"]["security_check"] == "hmac"

    # Replay attack
    assert "REPLAY" in cat_map
    assert cat_map["REPLAY"]["count"] == 1
    assert cat_map["REPLAY"]["category"] == "Replay Attack Detections"
    assert cat_map["REPLAY"]["security_check"] == "nonce"

    # Timestamp expired
    assert "TIMESTAMP_EXPIRED" in cat_map
    assert cat_map["TIMESTAMP_EXPIRED"]["count"] == 1
    assert cat_map["TIMESTAMP_EXPIRED"]["category"] == "Expired / Stale Timestamps"
    assert cat_map["TIMESTAMP_EXPIRED"]["security_check"] == "timestamp"

    # Auth failure
    assert "AUTH_FAILURE" in cat_map
    assert cat_map["AUTH_FAILURE"]["count"] == 1
    assert cat_map["AUTH_FAILURE"]["category"] == "Authentication Failures"
    assert cat_map["AUTH_FAILURE"]["security_check"] == "authentication"

    # Rate limit (none triggered in this test -> must be 0)
    assert "RATE_LIMIT" in cat_map
    assert cat_map["RATE_LIMIT"]["count"] == 0
