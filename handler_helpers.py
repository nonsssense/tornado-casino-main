from fastapi import Request, HTTPException
from database.event_treck import Event, is_tracked_event
from database.session import SessionManager, getActiveSessionUserId
from database.wallet import BALANCE_REAL
from log_manager import log
from fastapi import Request


def getUserId(session_token):
    """Resolve user_id for an active, non-expired session (sliding 30m idle)."""
    return getActiveSessionUserId(session_token)


def prepareRequest(request: Request, event_type_or_user_id=None, event_type=None):
    """
    Authenticate via session cookie and optionally record a tracked event.

    Forms:
      prepareRequest(request, "dice")
      prepareRequest(request, user_id, "Auth")
      prepareRequest(request)  # validate session only (no event)

    Session last_activity is NOT refreshed on every request.
    It is refreshed (throttled to 5 minutes) only after a meaningful
    tracked event is successfully recorded.
    """
    if event_type is not None:
        user_id = event_type_or_user_id
        resolved_event_type = event_type
        identity_bound = True
    else:
        resolved_event_type = event_type_or_user_id
        user_id = None
        identity_bound = False

    session_token = None
    if hasattr(request, "cookies"):
        session_token = request.cookies.get("session_token")

    if identity_bound:
        # /api/auth path — mint or reuse a session for the authenticated user.
        session = SessionManager(user_id, session_token)
        session_token = session.checkSessionStatus()
        _maybe_record_event(user_id, resolved_event_type, session_token)
        if resolved_event_type == "Auth":
            session.touchActivity(force=True)
        return session_token, user_id

    # Cookie session path — validate only; never mint a session here.
    if session_token is None:
        log.warning(f"Missing session_token cookie | event_type={resolved_event_type}")

    user_id = getUserId(session_token)

    if user_id is None:
        log.warning(f"Unauthorized request | event_type={resolved_event_type}")
        raise HTTPException(status_code=401, detail="Unauthorized")

    _maybe_record_event(user_id, resolved_event_type, session_token)
    return session_token, user_id


def _maybe_record_event(user_id, event_type, session_token):
    if not event_type or not is_tracked_event(event_type):
        return
    Event(user_id, event_type).postEvent(session_token=session_token)


def recordUserEvent(user_id, event_type, session_token=None):
    """Record a tracked event and slide session activity when applicable."""
    if not is_tracked_event(event_type):
        return False
    Event(user_id, event_type).postEvent(session_token=session_token)
    return True


def balanceCheck(wallet, wallet_id, bid, balance_type=BALANCE_REAL):
    balance = (
        wallet.getRealBalance(wallet_id)
        if balance_type == BALANCE_REAL
        else wallet.getBonusBalance(wallet_id)
    )
    if balance < bid:
        log.warning(
            f"Insufficient balance | wallet_id={wallet_id} | balance={balance} | bid={bid}"
        )
        return "not enough"
    return balance

def getIpAddress(request) -> str:
    """Resolve the real client IP behind a trusted reverse proxy.

    SECURITY: X-Forwarded-For is fully client-controllable. nginx APPENDS the real
    peer to XFF (``$proxy_add_x_forwarded_for``), so a spoofed value sent by the
    client ends up on the LEFT and the trusted proxy's observation on the RIGHT.
    We therefore read XFF from the right using ``TRUSTED_PROXY_COUNT`` instead of
    blindly trusting the left-most (attacker-chosen) entry.

    IP is only used for rate limiting / abuse detection / logging — never as an
    authentication factor.
    """
    from config import TRUSTED_PROXY_COUNT

    client_host = None
    client = getattr(request, "client", None)
    if client is not None:
        client_host = getattr(client, "host", None)

    # No trusted proxy configured → trust only the direct socket peer.
    if TRUSTED_PROXY_COUNT <= 0:
        return client_host or "unknown"

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        # Take the hop appended by our own (Nth-from-edge) trusted proxy. Only trust
        # it when the header is at least as deep as the configured proxy count; a
        # shorter header means the value at that position would be client-controlled,
        # so we fall through to safer sources instead of picking the left-most entry.
        if len(parts) >= TRUSTED_PROXY_COUNT:
            return parts[len(parts) - TRUSTED_PROXY_COUNT]

    # nginx `proxy_set_header X-Real-IP $remote_addr` overwrites any client value.
    real = request.headers.get("X-Real-IP")
    if real:
        return real.strip()

    return client_host or "unknown"
