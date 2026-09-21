"""
CipherGate configuration.

All tunables are read from environment variables (with sane defaults) so the
gateway's security posture can be changed without touching code.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./ciphergate.db")

    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev_only_change_me_in_env")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "30"))

    DEFAULT_RATE_LIMIT: int = int(os.getenv("DEFAULT_RATE_LIMIT", "20"))
    RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

    REPLAY_WINDOW_SECONDS: int = int(os.getenv("REPLAY_WINDOW_SECONDS", "30"))

    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "").strip()

    # How long a used nonce is remembered (must be >= REPLAY_WINDOW_SECONDS,
    # a bit of slack is kept so borderline requests are still caught).
    NONCE_STORE_TTL_SECONDS: int = int(
        os.getenv("NONCE_STORE_TTL_SECONDS", str(REPLAY_WINDOW_SECONDS * 4))
    )


settings = Settings()
