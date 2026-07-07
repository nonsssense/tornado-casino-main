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
            insert_stmt = (sa.insert(user_session_table).values(user_id=self.user_id, open_at=datetime.datetime.now(), session_token=self.session_token))
            conn.execute(insert_stmt)
            log.info(
                f"Session INSERT completed | user_id={self.user_id} | session_token={self.session_token}"
            )

    def closeSession(self):
        with engine.begin() as conn:
            close_stmt = sa.select(user_session_table).where(
                user_session_table.c.session_token == self.session_token
            )
            session = conn.scalar(close_stmt)

            if session is None:
                log.warning(
                    f"Session not found for close | user_id={self.user_id} | "
                    f"session_token={self.session_token}"
                )
                return
    
            session.close_at = session.last_activity + datetime.timedelta(minutes=30)
            session.active_status = False
            log.info(
                f"Session closed | user_id={self.user_id} | session_token={self.session_token}"
            )

    def updateSession(self):
        with engine.begin() as conn:
            update_stmt = sa.select(user_session_table).where(
                user_session_table.c.session_token == self.session_token
            )
            session = conn.scalar(update_stmt)

            if session is None:
                log.warning(
                    f"Session not found for update | user_id={self.user_id} | "
                    f"session_token={self.session_token}"
                )
                return

            if datetime.datetime.now() - session.last_activity > datetime.timedelta(minutes=30):
                log.warning(
                    f"Session expired | user_id={self.user_id} | session_token={self.session_token}"
                )
                self.closeSession()
     
            session.last_activity = datetime.datetime.now()

    def checkSessionStatus (self):
        if self.session_token:
            self.updateSession()
        else:
            self.session_token = secrets.token_urlsafe(32)
            self.createSession()
        
        return self.session_token
