"""
User authentication (email + password) — separate from the Application credential system.
Provides register / login for human users of the CipherGate dashboard.
"""
import secrets
import bcrypt
from sqlalchemy.orm import Session
from database import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_user(db: Session, email: str, password: str, full_name: str = "") -> User:
    user = User(
        email=email.lower().strip(),
        hashed_password=hash_password(password),
        full_name=full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email.lower().strip()).first()


def get_user_by_id(db: Session, user_id: str) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def create_or_get_google_user(db: Session, email: str, full_name: str = "") -> User:
    """Finds an existing user by email or creates a new active user for Google OAuth."""
    clean_email = email.lower().strip()
    existing = get_user_by_email(db, clean_email)
    if existing:
        if not existing.full_name and full_name:
            existing.full_name = full_name
            db.commit()
            db.refresh(existing)
        return existing

    # Create new user with a random secure password hash to satisfy schema
    user = User(
        email=clean_email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        full_name=full_name or "",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
