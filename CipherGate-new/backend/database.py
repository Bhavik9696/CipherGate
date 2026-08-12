"""
SQLite database setup (SQLAlchemy ORM) and table definitions.
"""
import datetime
import uuid

from sqlalchemy import create_engine, Column, String, Integer, Boolean, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker

from config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def now_utc() -> datetime.datetime:
    return datetime.datetime.utcnow()


def gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


class Application(Base):
    """A registered client application / demo credential set."""

    __tablename__ = "applications"

    id = Column(String, primary_key=True, default=lambda: gen_id("app"))
    name = Column(String, nullable=False)
    api_key = Column(String, unique=True, index=True, nullable=False)
    hmac_secret = Column(String, nullable=False)
    hashed_password = Column(String, nullable=True)  # for JWT /auth/login demo
    rate_limit = Column(Integer, default=settings.DEFAULT_RATE_LIMIT)
    created_at = Column(DateTime, default=now_utc)
    is_active = Column(Boolean, default=True)


class SecurityEvent(Base):
    """Audit log of every request CipherGate has evaluated."""

    __tablename__ = "security_events"

    id = Column(String, primary_key=True, default=lambda: gen_id("evt"))
    timestamp = Column(DateTime, default=now_utc, index=True)
    client_id = Column(String, nullable=True, index=True)
    endpoint = Column(String, nullable=False)
    method = Column(String, nullable=False)
    event_type = Column(String, nullable=False)      # e.g. VALID, TAMPERING, REPLAY, RATE_LIMIT, AUTH_FAILURE
    security_check = Column(String, nullable=False)  # which check produced this event
    status = Column(String, nullable=False)           # ALLOWED / BLOCKED
    reason = Column(Text, nullable=True)


class UsedNonce(Base):
    """Persisted nonce store so replay protection survives a server restart."""

    __tablename__ = "used_nonces"

    id = Column(String, primary_key=True, default=lambda: gen_id("nonce"))
    client_id = Column(String, nullable=False, index=True)
    nonce = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=now_utc)


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
