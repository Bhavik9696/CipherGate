"""
Google Identity Services (GIS) ID Token Verification.
Verifies cryptographic signature, issuer, audience, and expiration via Google's public certs.
"""
from typing import Optional
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from config import settings


class GoogleAuthError(Exception):
    """Raised when Google ID token verification fails."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def verify_google_id_token(credential: str, expected_client_id: Optional[str] = None) -> dict:
    """
    Verifies a Google ID token (JWT) using Google's public certificates.

    Enforces:
      1. Cryptographic signature against Google's public JWK certificates.
      2. Token expiration (exp timestamp).
      3. Issuer matches 'accounts.google.com' or 'https://accounts.google.com'.
      4. Audience matches expected_client_id (if provided or configured in settings).

    Returns the verified token claims dictionary on success.
    Raises GoogleAuthError on any verification failure.
    """
    if not credential or not isinstance(credential, str) or not credential.strip():
        raise GoogleAuthError("Missing or empty Google credential token.")

    clean_credential = credential.strip()
    client_id = expected_client_id or (settings.GOOGLE_CLIENT_ID.strip() if settings.GOOGLE_CLIENT_ID else None)

    try:
        request = google_requests.Request()
        # id_token.verify_oauth2_token verifies signature, exp, and aud (if client_id is provided)
        id_info = id_token.verify_oauth2_token(
            clean_credential,
            request,
            audience=client_id,
        )

        # Explicit issuer verification for defense-in-depth
        issuer = id_info.get("iss")
        if issuer not in ("accounts.google.com", "https://accounts.google.com"):
            raise GoogleAuthError(f"Invalid Google token issuer: {issuer}")

        email = id_info.get("email")
        if not email:
            raise GoogleAuthError("Google token does not contain an email address.")

        return id_info
    except ValueError as e:
        raise GoogleAuthError(f"Invalid Google ID token: {str(e)}")
    except GoogleAuthError:
        raise
    except Exception as e:
        raise GoogleAuthError(f"Google token verification failed: {str(e)}")
