"""
Per-API-key rate limiting.

Fixed-window in-memory counter keyed by client_id. This is intentionally
simple for a PBL prototype - the interface (`allow(client_id)`) is kept
narrow so it could be swapped for a Redis-backed sliding-window limiter
later without touching any caller.
"""
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from config import settings


class InMemoryRateLimiter:
    def __init__(self, limit: int = settings.DEFAULT_RATE_LIMIT,
                 window_seconds: int = settings.RATE_LIMIT_WINDOW_SECONDS):
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, client_id: str, limit_override: int = None) -> bool:
        """Sliding-window check: True if this request is allowed."""
        limit = limit_override or self.limit
        now = time.time()
        with self._lock:
            q = self._hits[client_id]
            while q and now - q[0] > self.window_seconds:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def current_count(self, client_id: str) -> int:
        now = time.time()
        with self._lock:
            q = self._hits[client_id]
            while q and now - q[0] > self.window_seconds:
                q.popleft()
            return len(q)


rate_limiter = InMemoryRateLimiter()
