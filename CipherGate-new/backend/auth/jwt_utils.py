"""
Minimal JWT authentication flow.

This exists to demonstrate that "who is calling" (authentication) is a
DIFFERENT concern from "was this exact request tampered with" (HMAC
integrity). It is intentionally NOT a full OAuth/OIDC server.
"""
import datetime

import jwt

from config import settings


def create_access_token(app_id: str, app_name: str) -> str:
    now = datetime.datetime.utcnow()
    payload = {
        "sub": app_id,
        "name": app_name,
        "iat": now,
        "exp": now + datetime.timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


class JWTError(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def verify_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise JWTError("JWT expired")
    except jwt.InvalidTokenError:
        raise JWTError("JWT invalid")

    if payload.get("type") != "access" or "sub" not in payload:
        raise JWTError("JWT missing required claims")

    return payload
