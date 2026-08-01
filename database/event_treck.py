"""
User event tracking — inserts into existing user_events table.

Meaningful events also refresh session last_activity (throttled).
"""

from database.db_config import engine, user_events_table
import sqlalchemy as sa
from datetime import datetime
from log_manager import log

# Events that should be persisted and slide the session window.
# Polling / read-only lookups are intentionally excluded.
TRACKED_EVENTS = frozenset({
    # Auth / session lifecycle
    "Auth",
    "SessionCreated",
    "SessionExpired",
    "app_open",
    # Navigation / game chrome
    "page_nav",
    "game_open",
    "game_close",
    # Bets / results / cashout (existing prepareRequest names)
    "dice",
    "plinco",
    "plinco_batch",
    "CrashBet",
    "CrashCashout",
    "GameResult",
    # Wallet
    "deposit",
    "withdraw",
    "Open deposit window",
    # Settings / bonus selection
    "SettingsUpdate",
    "bonus_select",
    # Errors
    "ValidationError",
})


def is_tracked_event(event_type: str) -> bool:
    return bool(event_type) and event_type in TRACKED_EVENTS


class Event:
    def __init__(self, user_id: int, event_type: str):
        self.user_id = user_id
        self.event_type = event_type

    def postEvent(self, *, session_token=None, touch_session=True):
        """
        Insert user_events row. Optionally refresh session activity.

        touch_session=False is used for SessionCreated/SessionExpired to avoid
        recursive activity writes during session lifecycle itself.
        """
        with engine.begin() as conn:
            post_stmt = sa.insert(user_events_table).values(
                user_id=self.user_id,
                event_type=self.event_type,
                event_time_at=datetime.now(),
            )
            conn.execute(post_stmt)
            log.info(
                f"Event INSERT completed | user_id={self.user_id} | "
                f"event_type={self.event_type}"
            )

        if touch_session and session_token and is_tracked_event(self.event_type):
            from database.session import SessionManager

            SessionManager(self.user_id, session_token).touchActivity()
