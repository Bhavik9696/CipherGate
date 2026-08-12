import os
import sys
import time
import json
import secrets

import pytest

BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, os.path.abspath(BACKEND_DIR))

os.environ["DATABASE_URL"] = "sqlite:///./test_ciphergate.db"

from fastapi.testclient import TestClient  # noqa: E402

import database  # noqa: E402
import main  # noqa: E402
from crypto.hmac_utils import build_canonical_request, sign  # noqa: E402


@pytest.fixture(scope="function")
def client():
    if os.path.exists("./test_ciphergate.db"):
        os.remove("./test_ciphergate.db")
    database.init_db()
    with TestClient(main.app) as c:
        yield c
    database.engine.dispose()
    if os.path.exists("./test_ciphergate.db"):
        os.remove("./test_ciphergate.db")


@pytest.fixture()
def registered_app(client):
    resp = client.post("/auth/register", json={"name": "Test App", "password": "s3cret-pass"})
    assert resp.status_code == 200
    return resp.json()


def sign_request(app_creds: dict, body: dict, path: str = "/api/payment", method: str = "POST", timestamp: float = None, nonce: str = None):
    """Build a fully-signed request the same way the real frontend does."""
    ts = str(timestamp if timestamp is not None else time.time())
    n = nonce if nonce is not None else secrets.token_urlsafe(16)
    body_raw = json.dumps(body, separators=(",", ":"))
    canonical = build_canonical_request(method, path, ts, n, body_raw)
    signature = sign(app_creds["hmac_secret"], canonical)
    headers = {
        "X-API-Key": app_creds["api_key"],
        "X-Timestamp": ts,
        "X-Nonce": n,
        "X-Signature": signature,
        "Content-Type": "application/json",
    }
    return headers, body_raw


def sign_payment_request(app_creds: dict, body: dict, timestamp: float = None, nonce: str = None):
    """Backward-compatible helper for the payment endpoint tests."""
    return sign_request(app_creds, body, timestamp=timestamp, nonce=nonce)