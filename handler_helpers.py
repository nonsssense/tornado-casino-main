from fastapi import Request
from database.event_treck import Event
from database.session import SessionManager
from database.db_config import engine, user_session_table
import sqlalchemy as sa
from database.wallet import getWalletId



def getUserId(session_token):
    with engine.begin() as conn:
        get_stmt = sa.select(user_session_table).where(session_id=session_token, active_status=True)
        session = conn.scalar(get_stmt)

        return session.user_id
    

def prepareRequest(request: Request, event_type):
    session_token = request.cookie.get("session_token")
    user_id = getUserId(session_token)
    

    session = SessionManager(user_id, session_token)
    session_token = session.checkSessionStatus()

    Event(user_id, event_type, ).postEvent()

    return session_token


def walletCheck(user_id):
    wallet_id = getWalletId(user_id)

    if wallet_id is None:
        return 'mase deposit'
    return wallet_id

def balanceCheck(wallet, wallet_id, bid):
    balance = wallet.getBalance(wallet_id)

    if balance < bid:
        return 'not enough'
    return balance
