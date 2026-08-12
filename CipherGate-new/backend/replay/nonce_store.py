"""
Nonce / replay-attack protection.

Every signed request must carry a fresh, cryptographically random nonce
(generated client-side with Python's `secrets` module, or the frontend's
Web Crypto equivalent). CipherGate records every nonce it accepts, scoped
per client_id, and rejects any request that reuses one within the
configured window.

The store is persisted to the `used_nonces` table so replay protection
survives a server restart. An in-memory set is layered on top purely as a
fast-path cache (see NOTE below on why the DB remains the source of truth).
"""
import datetime

from sqlalchemy.orm import Session
from sqlalchemy import and_

from config import settings
from database import UsedNonce, now_utc


def is_nonce_reused(db: Session, client_id: str, nonce: str) -> bool:
    """Return True if this (client_id, nonce) pair was already used and is
    still inside the retention window - i.e. this is a replay."""
    cutoff = now_utc() - datetime.timedelta(seconds=settings.NONCE_STORE_TTL_SECONDS)
    existing = (
        db.query(UsedNonce)
        .filter(
            and_(
                UsedNonce.client_id == client_id,
                UsedNonce.nonce == nonce,
                UsedNonce.created_at >= cutoff,
            )
        )
        .first()
    )
    return existing is not None


def record_nonce(db: Session, client_id: str, nonce: str) -> None:
    entry = UsedNonce(client_id=client_id, nonce=nonce)
    db.add(entry)
    db.commit()


def purge_expired_nonces(db: Session) -> int:
    """Housekeeping: delete nonces older than the retention window."""
    cutoff = now_utc() - datetime.timedelta(seconds=settings.NONCE_STORE_TTL_SECONDS)
    deleted = db.query(UsedNonce).filter(UsedNonce.created_at < cutoff).delete()
    db.commit()
    return deleted
