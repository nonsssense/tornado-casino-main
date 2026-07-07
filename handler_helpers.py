from fastapi import Request, HTTPException
from database.event_treck import Event
from database.session import SessionManager
from database.db_config import engine, user_session_table
import sqlalchemy as sa
from database.wallet import getWalletId
from log_manager import log



def getUserId(session_token):
    if not session_token:
        log.warning("No session_token provided for user lookup")
        return None

    with engine.begin() as conn:
        get_stmt = sa.select(user_session_table).where(
            user_session_table.c.session_token == session_token,
            user_session_table.c.active_status == True,
        )
        session = conn.scalar(get_stmt)

        if session is None:
            log.warning(f"Active session not found | session_token={session_token}")
            return None

        return session.user_id
    

def prepareRequest(request: Request, event_type_or_user_id, event_type=None):
    if event_type is not None:
        user_id = event_type_or_user_id
        resolved_event_type = event_type
    else:
        resolved_event_type = event_type_or_user_id
        user_id = None

    session_token = request.cookies.get("session_token")

    if user_id is None:
        if session_token is None:
            log.warning(f"Missing session_token cookie | event_type={resolved_event_type}")
        user_id = getUserId(session_token)
        if user_id is None:
            log.warning(f"Unauthorized request | event_type={resolved_event_type}")
            raise HTTPException(status_code=401, detail="Unauthorized")

    session = SessionManager(user_id, session_token)
    session_token = session.checkSessionStatus()

    Event(user_id, resolved_event_type).postEvent()

    return session_token


def walletCheck(user_id):
    wallet_id = getWalletId(user_id)

    if wallet_id is None:
        return 'mase deposit'
    return wallet_id

def balanceCheck(wallet, wallet_id, bid):
    balance = wallet.getBalance(wallet_id)

    if balance < bid:
        log.warning(
            f"Insufficient balance | wallet_id={wallet_id} | balance={balance} | bid={bid}"
        )
        return 'not enough'
    return balance
