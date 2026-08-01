"""
Session helpers for sliding inactivity expiry.

Existing architecture preserved: SessionManager + user_sessions table.
"""

from database.db_config import engine, user_session_table
import sqlalchemy as sa
import asyncio
import datetime
import secrets
from log_manager import log

# Sliding idle lifetime — inactive sessions are closed after this.
SESSION_IDLE_MINUTES = 30

# Throttle last_activity writes — skip UPDATE if fresher than this.
ACTIVITY_UPDATE_MINUTES = 5

# Background sweeper interval (orphan / idle cleanup).
SESSION_SWEEP_INTERVAL_SECONDS = 120


class SessionManager:
    def __init__(self, user_id, session_token):
        self.user_id = user_id
        self.session_token = session_token

    def createSession(self):
        """
        Mint a new active session for this user.

        Closes every other active session for the same user first so a login
        never leaves orphan active rows behind.
        """
        with engine.begin() as conn:
            now = datetime.datetime.now()
            closed = _close_active_sessions_for_user(
                conn,
                self.user_id,
                close_at=now,
                except_token=self.session_token,
            )
            if closed:
                log.info(
                    f"Prior sessions closed on mint | user_id={self.user_id} | "
                    f"closed_count={closed}"
                )

            insert_stmt = (
                sa.insert(user_session_table).values(
                    user_id=self.user_id,
                    open_at=now,
                    last_activity=now,
                    session_token=self.session_token,
                    active_status=True,
                )
            )
            conn.execute(insert_stmt)
            log.info(
                f"Session INSERT completed | user_id={self.user_id} | "
                f"session_token_suffix={_token_suffix(self.session_token)}"
            )

    def closeSession(self, reason="idle"):
        with engine.begin() as conn:
            close_stmt = sa.select(user_session_table).where(
                user_session_table.c.session_token == self.session_token
            )

            result = conn.execute(close_stmt)
            session = result.mappings().first()

            if session is None:
                log.warning(
                    f"Session not found for close | user_id={self.user_id} | "
                    f"session_token_suffix={_token_suffix(self.session_token)}"
                )
                return False

            if session.get("active_status") is False:
                return False

            now = datetime.datetime.now()
            close_at = (
                session["last_activity"]
                or session["open_at"]
                or now
            ) + datetime.timedelta(minutes=SESSION_IDLE_MINUTES)
            if close_at > now:
                close_at = now

            update_stmt = (
                sa.update(user_session_table)
                .where(user_session_table.c.session_token == self.session_token)
                .values(
                    close_at=close_at,
                    active_status=False,
                )
            )
            conn.execute(update_stmt)

            log.info(
                f"Session closed | user_id={self.user_id} | reason={reason} | "
                f"session_token_suffix={_token_suffix(self.session_token)}"
            )
            return True

    def updateSession(self, *, force=False):
        """
        Refresh last_activity (sliding window).

        Writes only when force=True or at least ACTIVITY_UPDATE_MINUTES
        have passed since the previous last_activity.
        """
        with engine.begin() as conn:
            select_stmt = sa.select(user_session_table).where(
                user_session_table.c.session_token == self.session_token,
                user_session_table.c.active_status == True,
            )

            result = conn.execute(select_stmt)
            session = result.mappings().first()

            if session is None:
                log.warning(
                    f"Session not found for update | user_id={self.user_id} | "
                    f"session_token_suffix={_token_suffix(self.session_token)}"
                )
                return False

            now = datetime.datetime.now()
            last = session.get("last_activity") or session.get("open_at")

            if not force and last is not None:
                age = now - last
                if age < datetime.timedelta(minutes=ACTIVITY_UPDATE_MINUTES):
                    return False

            update_stmt = (
                sa.update(user_session_table)
                .where(user_session_table.c.session_token == self.session_token)
                .values(last_activity=now)
            )
            conn.execute(update_stmt)
            return True

    def touchActivity(self, *, force=False):
        """Public alias used after meaningful events."""
        return self.updateSession(force=force)

    def checkSessionStatus(self):
        """
        Auth / ensure path: keep a valid active session for this user.

        - Missing / foreign / expired cookie → mint a new session.
        - Valid active cookie → reuse (does not bump last_activity).
        """
        if self.session_token:
            row = _load_session_row(self.session_token)
            if row is not None and row["user_id"] == self.user_id:
                if _is_idle_expired(row):
                    self.closeSession(reason="idle")
                    _record_session_expired(self.user_id)
                else:
                    return self.session_token
            elif row is not None and row.get("active_status"):
                # Cookie belongs to another user — do not refresh it.
                pass

        self.session_token = secrets.token_urlsafe(32)
        self.createSession()
        _record_session_created(self.user_id)
        return self.session_token


def getActiveSessionUserId(session_token):
    """
    Resolve user_id for an active, non-expired session.

    Closes and records SessionExpired when idle timeout is exceeded.
    """
    if not session_token:
        log.warning("No session_token provided for user lookup")
        return None

    row = _load_session_row(session_token, active_only=True)
    if row is None:
        log.warning(
            f"Active session not found | session_token_suffix={_token_suffix(session_token)}"
        )
        return None

    if _is_idle_expired(row):
        manager = SessionManager(row["user_id"], session_token)
        if manager.closeSession(reason="idle"):
            _record_session_expired(row["user_id"])
        log.warning(
            f"Session expired (idle) | user_id={row['user_id']} | "
            f"session_token_suffix={_token_suffix(session_token)}"
        )
        return None

    return row["user_id"]


def closeIdleSessions():
    """
    Close abandoned active sessions whose idle window has elapsed.

    Used by the background sweeper so orphan tokens (never presented again)
    still transition to inactive without requiring a cookie hit.
    """
    with engine.begin() as conn:
        now = datetime.datetime.now()
        cutoff = now - datetime.timedelta(minutes=SESSION_IDLE_MINUTES)
        update_stmt = (
            sa.update(user_session_table)
            .where(
                user_session_table.c.active_status == True,
                user_session_table.c.last_activity < cutoff,
            )
            .values(
                active_status=False,
                close_at=now,
            )
        )
        result = conn.execute(update_stmt)
        closed = result.rowcount or 0

    if closed:
        log.info(f"Idle session sweeper closed sessions | closed_count={closed}")
    return closed


async def session_idle_sweeper_loop(
    interval_seconds=SESSION_SWEEP_INTERVAL_SECONDS,
):
    """Periodic idle cleanup; safe to cancel on shutdown."""
    log.info(
        f"Session idle sweeper started | interval_seconds={interval_seconds} | "
        f"idle_minutes={SESSION_IDLE_MINUTES}"
    )
    # Run once immediately so existing orphans are repaired on process start.
    try:
        await asyncio.to_thread(closeIdleSessions)
    except Exception:
        log.exception("Session idle sweeper initial pass failed")

    while True:
        try:
            await asyncio.sleep(interval_seconds)
            await asyncio.to_thread(closeIdleSessions)
        except asyncio.CancelledError:
            log.info("Session idle sweeper cancelled")
            raise
        except Exception:
            log.exception("Session idle sweeper pass failed")


def _close_active_sessions_for_user(conn, user_id, *, close_at, except_token=None):
    """Mark all active sessions for user inactive. Returns closed row count."""
    conditions = [
        user_session_table.c.user_id == user_id,
        user_session_table.c.active_status == True,
    ]
    if except_token:
        conditions.append(user_session_table.c.session_token != except_token)

    update_stmt = (
        sa.update(user_session_table)
        .where(*conditions)
        .values(
            active_status=False,
            close_at=close_at,
        )
    )
    result = conn.execute(update_stmt)
    return result.rowcount or 0


def _load_session_row(session_token, *, active_only=False):
    with engine.begin() as conn:
        stmt = sa.select(user_session_table).where(
            user_session_table.c.session_token == session_token,
        )
        if active_only:
            stmt = stmt.where(user_session_table.c.active_status == True)
        return conn.execute(stmt).mappings().first()


def _is_idle_expired(session_row):
    last = session_row.get("last_activity") or session_row.get("open_at")
    if last is None:
        return True
    return datetime.datetime.now() - last > datetime.timedelta(minutes=SESSION_IDLE_MINUTES)


def _token_suffix(token):
    if not token:
        return "none"
    return str(token)[-8:]


def _record_session_created(user_id):
    # Local import avoids circular import with event_treck → session.
    from database.event_treck import Event

    Event(user_id, "SessionCreated").postEvent(touch_session=False)


def _record_session_expired(user_id):
    from database.event_treck import Event

    Event(user_id, "SessionExpired").postEvent(touch_session=False)
