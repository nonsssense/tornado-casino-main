from __future__ import annotations

import asyncio
import logging
import time

"""
Central admin-alert dispatcher.

`send_alert(text, category)` is thread-safe and non-blocking — safe to call from
any context (sync route, sync DB code, a logging handler, or async code). It hands
the message to the app event loop, where a background drainer forwards it to staff
via `notify_admins` (admin bot).

Anti-spam is built in: per-category throttling, duplicate-error suppression, and a
global per-minute cap so we never trip Telegram's flood limits. Every category can
be muted independently in `CATEGORY_ENABLED`.
"""

# Toggle categories here. Set to False to mute a whole class of alerts.
CATEGORY_ENABLED = {
    "new_user": True,        # a brand-new player registered
    "app_open": True,        # player opened the Mini App
    "deposit_attempt": True, # player started a deposit (crypto / fiat)
    "deposit": True,         # deposit credited
    "withdraw": True,        # withdrawal request created
    "psp_error": True,       # payment provider problem
    "error": True,           # any ERROR/EXCEPTION logged on the platform
}

_ICON = {
    "new_user": "🆕",
    "app_open": "👋",
    "deposit_attempt": "💸",
    "deposit": "✅",
    "withdraw": "⬆️",
    "psp_error": "🛑",
    "error": "❗",
}

# Per-category minimum seconds between messages (0 = no throttle). Noisy signals
# like app_open are collapsed so a burst of logins can't flood the chat.
_MIN_GAP_SEC = {
    "app_open": 15,
    "error": 3,
}

# Hard ceiling regardless of category — stays well under Telegram limits.
_GLOBAL_MAX_PER_MIN = 25

_loop: asyncio.AbstractEventLoop | None = None
_queue: "asyncio.Queue | None" = None
_drainer: "asyncio.Task | None" = None
_log_handler: "logging.Handler | None" = None

_last_by_category: dict[str, float] = {}
_recent_error_sigs: dict[str, float] = {}
_global_window_start = 0.0
_global_count = 0
_suppressed = 0


def init_alerts(loop: asyncio.AbstractEventLoop) -> None:
    """Bind the running event loop, start the drainer, attach the log handler.

    Call once from FastAPI on_startup (inside the running loop).
    """
    global _loop, _queue, _drainer
    _loop = loop
    _queue = asyncio.Queue(maxsize=2000)
    _drainer = loop.create_task(_drain(), name="admin-alerts-drainer")
    _attach_log_handler()


def shutdown_alerts() -> None:
    global _drainer, _log_handler
    if _log_handler is not None:
        try:
            from log_manager import log as root_log
            root_log.removeHandler(_log_handler)
        except Exception:
            pass
        _log_handler = None
    if _drainer is not None:
        _drainer.cancel()
        _drainer = None


def send_alert(text: str, category: str = "error") -> None:
    """Queue an admin alert. Thread-safe, non-blocking, never raises."""
    if not text or not CATEGORY_ENABLED.get(category, True):
        return
    loop = _loop
    if loop is None:
        return  # not initialized yet (pre-startup) — drop silently
    try:
        loop.call_soon_threadsafe(_enqueue, category, str(text))
    except RuntimeError:
        # Loop closed / shutting down.
        pass


def _enqueue(category: str, text: str) -> None:
    """Runs on the loop thread: apply throttle/dedupe/cap, then enqueue."""
    global _global_window_start, _global_count, _suppressed

    now = time.monotonic()

    gap = _MIN_GAP_SEC.get(category, 0)
    if gap:
        if now - _last_by_category.get(category, 0.0) < gap:
            return
        _last_by_category[category] = now

    if category in ("error", "psp_error"):
        sig = text[:120]
        if now - _recent_error_sigs.get(sig, 0.0) < 60:
            return
        _recent_error_sigs[sig] = now
        if len(_recent_error_sigs) > 500:
            _recent_error_sigs.clear()

    # Rolling 60s global window.
    if now - _global_window_start >= 60:
        if _suppressed and _queue is not None:
            try:
                _queue.put_nowait(
                    ("error", f"(rate limit) suppressed {_suppressed} alerts in the last minute")
                )
            except asyncio.QueueFull:
                pass
        _global_window_start = now
        _global_count = 0
        _suppressed = 0

    if _global_count >= _GLOBAL_MAX_PER_MIN:
        _suppressed += 1
        return

    _global_count += 1
    if _queue is not None:
        try:
            _queue.put_nowait((category, text))
        except asyncio.QueueFull:
            pass


async def _drain() -> None:
    from admin_panel.notify import notify_admins
    while True:
        try:
            category, text = await _queue.get()
        except asyncio.CancelledError:
            raise
        try:
            await notify_admins(f"{_ICON.get(category, 'ℹ️')} {text}")
        except asyncio.CancelledError:
            raise
        except Exception:
            # Never let a send failure kill the drainer (and never re-log at
            # ERROR here — that would loop back through the alert handler).
            pass
        finally:
            try:
                _queue.task_done()
            except Exception:
                pass


def _attach_log_handler() -> None:
    global _log_handler
    if _log_handler is not None:
        return
    from log_manager import log as root_log
    handler = _AlertLogHandler()
    handler.setLevel(logging.ERROR)
    root_log.addHandler(handler)
    _log_handler = handler


class _AlertLogHandler(logging.Handler):
    """Forwards every ERROR/EXCEPTION on the `casino` logger to admin alerts.

    Recursion guard: skips records emitted by the alert/notify path itself, so a
    failed send can never trigger an infinite alert loop.
    """

    def emit(self, record: logging.LogRecord) -> None:
        try:
            if record.levelno < logging.ERROR:
                return
            if record.name.startswith("casino.alerts"):
                return
            if getattr(record, "module", "") in ("alerts", "notify"):
                return
            msg = record.getMessage()
            loc = f"{record.filename}:{record.lineno}"
            if record.exc_info and record.exc_info[1] is not None:
                msg = f"{msg} | {record.exc_info[1]!r}"
            send_alert(f"{loc} | {msg}"[:1500], category="error")
        except Exception:
            pass
