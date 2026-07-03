from database.db_config import engine, getTelegramId, users_table, user_session_table
import sqlalchemy as sa
from urllib import parse_qs
import json
import datetime
import secrets

class SessionManager:
    def __init__(self, user_id, session_token):
        self.user_id = user_id
        self.session_token = session_token

    def createSession(self):
        with engine.begin() as conn:
            insert_stmt = (sa.insert(user_session_table).values(user_id=self.user_id, open_at=datetime.datetime.now(), session_token=self.session_token))
            conn.execute(insert_stmt)

    def closeSession(self):
        with engine.begin() as conn:
            close_stmt = (sa.select(user_session_table).where(session_token=self.session_token))
            session = conn.scalar(close_stmt)
    
            session.close_at = session.last_activity + datetime.timedelta(minutes=30)
            session.active_status = False

    def updateSession(self):
        with engine.begin() as conn:
            update_stmt = (sa.select(user_session_table).where(session_token=self.session_token))
            session = conn.scalar(update_stmt)

            if datetime.datetime.now() - session.last_activity > datetime.timedelta(minutes=30):
                self.closeSession()
            
            session.last_activity = datetime.datetime.now()

    def checkSessionStatus (self):
        if self.session_token:
            self.updateSession()
        else:
            self.session_token = secrets.token_urlsafe(32)
            self.createSession()
        
        return self.session_token

    

    

    

    
