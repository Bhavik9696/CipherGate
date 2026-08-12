"""
Application registration and API-key / HMAC-secret issuance.
"""
import secrets

import bcrypt
from sqlalchemy.orm import Session

from database import Application


def generate_api_key() -> str:
    return f"cg_live_{secrets.token_urlsafe(24)}"


def generate_hmac_secret() -> str:
    return secrets.token_urlsafe(32)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_application(db: Session, name: str, password: str = None) -> Application:
    app = Application(
        name=name,
        api_key=generate_api_key(),
        hmac_secret=generate_hmac_secret(),
        hashed_password=hash_password(password) if password else None,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    return app


def get_application_by_api_key(db: Session, api_key: str) -> Application | None:
    return db.query(Application).filter(Application.api_key == api_key, Application.is_active == True).first()  # noqa: E712


def get_application_by_id(db: Session, app_id: str) -> Application | None:
    return db.query(Application).filter(Application.id == app_id).first()
