"""In-process, dependency-free rate limiting (defense-in-depth / abuse control).

This is NOT a financial-integrity mechanism. Database row locks, atomic balance
mutations, authorization checks and idempotency remain the authoritative controls
for money movement. Rate limits only blunt brute-force / flooding abuse.

Design notes
------------
* Sliding-window counter keyed by an arbitrary string (IP, user, session, ...).
* State lives in this process only. TORNADO runs Crash (and therefore the app)
  with a single worker, so a per-process limiter is sufficient. Coarse per-IP
  limits can additionally be enforced at nginx (see deploy/nginx.conf.example).
* O(1) amortised: each key keeps a small deque of recent hit timestamps and is
  pruned lazily; idle keys are garbage-collected opportunistically.
"""

from __future__ import annotations

import threading
import time
from collections import deque

from fastapi import HTTPException

try:
    from config import RATE_LIMIT_ENABLED
except Exception:  # pragma: no cover - config must import, but stay safe
    RATE_LIMIT_ENABLED = True


class _SlidingWindowLimiter:
    def __init__(self):
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._last_gc = time.monotonic()

    def check(self, key: str, limit: int, window_seconds: float) -> tuple[bool, float]:
        """Return (allowed, retry_after_seconds).

        A call is allowed when fewer than ``limit`` hits happened within the last
        ``window_seconds``. When blocked, ``retry_after_seconds`` estimates when the
        oldest in-window hit expires.
        """
        if limit <= 0:
            return True, 0.0

        now = time.monotonic()
        cutoff = now - window_seconds

        with self._lock:
            bucket = self._hits.get(key)
            if bucket is None:
                bucket = deque()
                self._hits[key] = bucket

            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after = max(0.0, bucket[0] + window_seconds - now)
                self._maybe_gc(now)
                return False, retry_after

            bucket.append(now)
            self._maybe_gc(now)
            return True, 0.0

    def _maybe_gc(self, now: float) -> None:
        # Prune empty/idle buckets at most once per minute to bound memory.
        if now - self._last_gc < 60.0:
            return
        self._last_gc = now
        stale = [k for k, b in self._hits.items() if not b]
        for k in stale:
            self._hits.pop(k, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


_limiter = _SlidingWindowLimiter()


def check_rate_limit(key: str, limit: int, window_seconds: float) -> tuple[bool, float]:
    if not RATE_LIMIT_ENABLED:
        return True, 0.0
    return _limiter.check(key, limit, window_seconds)


def enforce(bucket: str, identity: str, limit: int, window_seconds: float) -> None:
    """Raise HTTP 429 when ``identity`` exceeds ``limit`` hits per window in ``bucket``.

    ``bucket`` namespaces the counter (e.g. "auth", "withdraw") so different
    endpoints do not share a budget for the same identity.
    """
    if not RATE_LIMIT_ENABLED:
        return
    allowed, retry_after = _limiter.check(f"{bucket}:{identity}", limit, window_seconds)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please slow down.",
            headers={"Retry-After": str(max(1, int(retry_after) + 1))},
        )


def reset_for_tests() -> None:
    _limiter.reset()
