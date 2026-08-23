"""In-memory rate limits for a single API instance."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock


class SlidingWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        self.limit = max(1, limit)
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def remaining(self, key: str) -> int:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            cutoff = now - self.window
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            return max(0, self.limit - len(bucket))

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            cutoff = now - self.window
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= self.limit:
                return False
            bucket.append(now)
            return True


class AnalyzeAbuseGuard:
    """Per-IP minute/hour/day caps plus a process-wide daily Gemini budget."""

    def __init__(
        self,
        per_minute: int,
        per_hour: int,
        per_day: int,
        global_per_day: int,
    ) -> None:
        self.per_minute = SlidingWindowRateLimiter(per_minute, 60)
        self.per_hour = SlidingWindowRateLimiter(per_hour, 3600)
        self.per_day = SlidingWindowRateLimiter(per_day, 86400)
        self.global_day = SlidingWindowRateLimiter(global_per_day, 86400)
        self._lock = Lock()

    def admit(self, ip: str) -> str | None:
        """Return a client-facing reason if blocked, else record the hit."""
        with self._lock:
            if self.global_day.remaining("global") <= 0:
                return "ANVAYA is at capacity right now. Please try again later."
            if self.per_day.remaining(ip) <= 0:
                return "Daily limit reached. Please try again tomorrow."
            if self.per_hour.remaining(ip) <= 0:
                return "Hourly limit reached. Please wait before reading another page."
            if self.per_minute.remaining(ip) <= 0:
                return "Too many requests. Please wait a moment and try again."
            self.global_day.allow("global")
            self.per_day.allow(ip)
            self.per_hour.allow(ip)
            self.per_minute.allow(ip)
            return None
