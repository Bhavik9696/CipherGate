"""
Tests for Google Identity Services Authentication (POST /auth/google).
"""
from unittest.mock import patch
import pytest
from auth.google_auth import GoogleAuthError, verify_google_id_token
import database
from database import User


def test_google_auth_empty_credential_rejected(client):
    """Empty or missing credential token must be rejected with 401."""
    resp = client.post("/auth/google", json={"credential": ""})
    assert resp.status_code == 401
    data = resp.json()
    assert data["detail"]["error"] == "GOOGLE_AUTH_FAILED"


def test_google_auth_invalid_token_rejected(client):
    """Invalid token signature/payload must be rejected with 401."""
    resp = client.post("/auth/google", json={"credential": "invalid.google.jwt.token"})
    assert resp.status_code == 401
    data = resp.json()
    assert data["detail"]["error"] == "GOOGLE_AUTH_FAILED"


def test_google_auth_valid_token_creates_new_user_and_issues_jwt(client):
    """A verified Google token creates a new user and issues a standard CipherGate JWT."""
    mock_id_info = {
        "iss": "https://accounts.google.com",
        "email": "alex.dev@gmail.com",
        "email_verified": True,
        "name": "Alex Dev",
        "sub": "google-user-id-12345",
    }

    with patch("auth.google_auth.id_token.verify_oauth2_token", return_value=mock_id_info):
        resp = client.post("/auth/google", json={"credential": "mock_valid_google_token"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["email"] == "alex.dev@gmail.com"
        assert data["full_name"] == "Alex Dev"
        assert "access_token" in data
        assert data["token_type"] == "bearer"

        # Verify that the issued JWT works with CipherGate's /auth/verify endpoint
        verify_resp = client.get("/auth/verify", headers={"Authorization": f"Bearer {data['access_token']}"})
        assert verify_resp.status_code == 200
        verify_data = verify_resp.json()
        assert verify_data["success"] is True
        assert verify_data["claims"]["name"] == "alex.dev@gmail.com"


def test_google_auth_existing_user_logs_in_successfully(client):
    """An existing user logging in via Google gets their JWT without creating duplicate accounts."""
    # First login / registration
    mock_id_info = {
        "iss": "accounts.google.com",
        "email": "sarah.sec@company.org",
        "email_verified": True,
        "name": "Sarah Security",
        "sub": "google-user-id-67890",
    }

    with patch("auth.google_auth.id_token.verify_oauth2_token", return_value=mock_id_info):
        resp1 = client.post("/auth/google", json={"credential": "valid_token_1"})
        assert resp1.status_code == 200
        user_id_1 = resp1.json()["user_id"]

        # Second login
        resp2 = client.post("/auth/google", json={"credential": "valid_token_2"})
        assert resp2.status_code == 200
        user_id_2 = resp2.json()["user_id"]

        assert user_id_1 == user_id_2

        # Verify only one user exists in DB
        db = database.SessionLocal()
        try:
            users_count = db.query(User).filter(User.email == "sarah.sec@company.org").count()
            assert users_count == 1
        finally:
            db.close()


def test_google_auth_disabled_user_is_blocked(client):
    """A disabled account cannot authenticate via Google."""
    mock_id_info = {
        "iss": "https://accounts.google.com",
        "email": "disabled.user@domain.com",
        "email_verified": True,
        "name": "Disabled User",
    }

    with patch("auth.google_auth.id_token.verify_oauth2_token", return_value=mock_id_info):
        # Register user
        resp = client.post("/auth/google", json={"credential": "token_before_disable"})
        assert resp.status_code == 200

        # Disable user
        db = database.SessionLocal()
        try:
            user = db.query(User).filter(User.email == "disabled.user@domain.com").first()
            user.is_active = False
            db.commit()
        finally:
            db.close()

        # Try to log in again
        resp_disabled = client.post("/auth/google", json={"credential": "token_after_disable"})
        assert resp_disabled.status_code == 403
        assert resp_disabled.json()["detail"]["error"] == "ACCOUNT_DISABLED"
