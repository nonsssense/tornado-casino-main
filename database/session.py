from database.db_config import engine, getTelegramId, users_table, user_session_table
import sqlalchemy as sa
from urllib.parse import parse_qs 
import json
import datetime
import secrets
from log_manager import log
class SessionManager:
    def __init__(self, user_id, session_token):
        self.user_id = user_id
        self.session_token = session_token

    def createSession(self):
        with engine.begin() as conn:
            now = datetime.datetime.now()
            insert_stmt = (sa.insert(user_session_table).values(
                user_id=self.user_id,
                open_at=now,
                last_activity=now,
                session_token=self.session_token,
            ))
            conn.execute(insert_stmt)
            log.info(
                f"Session INSERT completed | user_id={self.user_id} | session_token={self.session_token}"
            )

    def closeSession(self):
        with engine.begin() as conn:
            close_stmt = sa.select(user_session_table).where(
                user_session_table.c.session_token == self.session_token
            )
            
            result = conn.execute(close_stmt)
            session = result.mappings().first()

            if session is None:
                log.warning(
                    f"Session not found for close | user_id={self.user_id} | "
                    f"session_token={self.session_token}"
                )
                return
            
            close_at = (session['last_activity'] or session['open_at'] or datetime.datetime.now()) + datetime.timedelta(minutes=30)
            update_stmt = sa.update(user_session_table).where(user_session_table.c.session_token == self.session_token).values(
                close_at=close_at,
                active_status=False
            )
            conn.execute(update_stmt)

            log.info(
                f"Session closed | user_id={self.user_id} | session_token={self.session_token}"
            )

    def updateSession(self):
        with engine.begin() as conn:
            update_stmt = sa.select(user_session_table).where(
                user_session_table.c.session_token == self.session_token
            )
            
            result = conn.execute(update_stmt)
            session = result.mappings().first()

            if session is None:
                log.warning(
                    f"Session not found for update | user_id={self.user_id} | "
                    f"session_token={self.session_token}"
                )
                return

            now = datetime.datetime.now()
            update_stmt = sa.update(user_session_table).where(user_session_table.c.session_token == self.session_token).values(
                last_activity=now
            )
            conn.execute(update_stmt)

    def checkSessionStatus (self):
        if self.session_token:
            self.updateSession()
        else:
            self.session_token = secrets.token_urlsafe(32)
            self.createSession()
        
        return self.session_token
