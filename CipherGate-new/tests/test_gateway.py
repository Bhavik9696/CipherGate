"""
Real, end-to-end tests against the actual CipherGate pipeline.

No mocking of the security checks - every test sends genuine HTTP requests
through FastAPI's TestClient and asserts on the real HTTP responses.
"""
import time

from tests.conftest import sign_payment_request, sign_request


def test_assistant_returns_grounded_security_answer(client):
    resp = client.post("/assistant/chat", json={"question": "How does HMAC stop tampering?"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "HMAC-SHA256" in data["answer"]
    assert data["sources"][0]["title"] == "HMAC request integrity"


def test_valid_api_request_is_allowed(client, registered_app):
    headers, body_raw = sign_payment_request(registered_app, {"amount": 500, "receiver": "ABC Store"})
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["decision"]["allowed"] is True
    assert data["decision"]["checks"]["hmac"] == "passed"


def test_request_editor_gateway_accepts_a_non_payment_endpoint(client, registered_app):
    """A signed request to /api/items must be forwarded by the generic editor route."""
    target_path = "/api/items"
    body = {"name": "Notebook", "quantity": 2}
    headers, _ = sign_request(registered_app, body, path=target_path)
    envelope = {"method": "POST", "path": target_path, "body": body}

    resp = client.post("/gateway/request", headers=headers, json=envelope)

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["endpoint"] == target_path
    assert data["body_received"] == body
    assert data["decision"]["allowed"] is True

def test_invalid_api_key_is_rejected(client, registered_app):
    headers, body_raw = sign_payment_request(registered_app, {"amount": 500, "receiver": "ABC Store"})
    headers["X-API-Key"] = "cg_live_totally_fake_key"
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    assert resp.status_code == 401
    assert resp.json()["error"] == "AUTHENTICATION_FAILED"


def test_invalid_jwt_is_rejected(client, registered_app):
    resp = client.get("/auth/verify", headers={"Authorization": "Bearer not.a.real.token"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["error"] == "JWT_INVALID"


def test_valid_jwt_login_and_verify(client, registered_app):
    login_resp = client.post("/auth/login", json={
        "application_id": registered_app["application_id"], "password": "s3cret-pass"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    verify_resp = client.get("/auth/verify", headers={"Authorization": f"Bearer {token}"})
    assert verify_resp.status_code == 200
    assert verify_resp.json()["claims"]["sub"] == registered_app["application_id"]


def test_valid_hmac_passes(client, registered_app):
    headers, body_raw = sign_payment_request(registered_app, {"amount": 100, "receiver": "Shop"})
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    assert resp.status_code == 200
    assert resp.json()["decision"]["checks"]["hmac"] == "passed"


def test_modified_body_fails_hmac(client, registered_app):
    """The tampering demo: sign one body, send a different one."""
    headers, _ = sign_payment_request(registered_app, {"amount": 500, "receiver": "ABC Store"})
    tampered_body_raw = '{"amount":5000,"receiver":"ABC Store"}'
    resp = client.post("/api/payment", headers=headers, content=tampered_body_raw)
    assert resp.status_code == 403
    assert resp.json()["error"] == "HMAC_VERIFICATION_FAILED"


def test_invalid_hmac_signature_rejected(client, registered_app):
    headers, body_raw = sign_payment_request(registered_app, {"amount": 500, "receiver": "ABC Store"})
    headers["X-Signature"] = "0" * 64
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    assert resp.status_code == 403
    assert resp.json()["error"] == "HMAC_VERIFICATION_FAILED"


def test_expired_timestamp_rejected(client, registered_app):
    old_ts = time.time() - 300  # 5 minutes ago, window is 30s
    headers, body_raw = sign_payment_request(registered_app, {"amount": 500, "receiver": "ABC Store"}, timestamp=old_ts)
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    assert resp.status_code == 408
    assert resp.json()["error"] == "TIMESTAMP_EXPIRED"


def test_reused_nonce_is_replay_attack(client, registered_app):
    headers, body_raw = sign_payment_request(registered_app, {"amount": 500, "receiver": "ABC Store"})
    first = client.post("/api/payment", headers=headers, content=body_raw)
    assert first.status_code == 200

    # Exact same request again - the nonce database must catch this.
    second = client.post("/api/payment", headers=headers, content=body_raw)
    assert second.status_code == 409
    assert second.json()["error"] == "REPLAY_ATTACK"


def test_rate_limit_exceeded(client, registered_app):
    # Application's default rate limit is 20/min (see config.settings.DEFAULT_RATE_LIMIT)
    responses = []
    for _ in range(25):
        headers, body_raw = sign_payment_request(registered_app, {"amount": 10, "receiver": "Shop"})
        responses.append(client.post("/api/payment", headers=headers, content=body_raw))

    statuses = [r.status_code for r in responses]
    assert 200 in statuses
    assert 429 in statuses
    assert statuses.count(429) >= 1


def test_valid_request_reaches_backend(client, registered_app):
    headers, body_raw = sign_payment_request(registered_app, {"amount": 750, "receiver": "Bookstore"})
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    data = resp.json()
    assert resp.status_code == 200
    assert data["message"] == "Payment request processed"
    assert data["amount"] == 750


def test_invalid_request_does_not_reach_backend(client, registered_app):
    headers, body_raw = sign_payment_request(registered_app, {"amount": 500, "receiver": "ABC Store"})
    headers["X-Signature"] = "deadbeef" * 8
    resp = client.post("/api/payment", headers=headers, content=body_raw)
    data = resp.json()
    assert resp.status_code == 403
    # backend-only fields must be absent - the demo backend was never called
    assert "message" not in data or data.get("error") == "HMAC_VERIFICATION_FAILED"
    assert "amount" not in data


def test_audit_log_records_events(client, registered_app):
    headers, body_raw = sign_payment_request(registered_app, {"amount": 500, "receiver": "ABC Store"})
    client.post("/api/payment", headers=headers, content=body_raw)
    logs = client.get("/audit/logs").json()
    assert len(logs) >= 1
    assert logs[0]["endpoint"] == "/api/payment"


def test_dashboard_stats_reflect_real_events(client, registered_app):
    headers, body_raw = sign_payment_request(registered_app, {"amount": 500, "receiver": "ABC Store"})
    client.post("/api/payment", headers=headers, content=body_raw)  # allowed
    client.post("/api/payment", headers=headers, content=body_raw)  # replay -> blocked

    stats = client.get("/dashboard/stats").json()
    assert stats["total_requests"] >= 2
    assert stats["allowed"] >= 1
    assert stats["replay_attacks"] >= 1
