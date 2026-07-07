from database.db_config import engine, user_events_table
import sqlalchemy as sa
from datetime import datetime
from log_manager import log

class Event:
    def __init__(self, user_id: int, event_type: str):
        self.user_id = user_id
        self.event_type = event_type

    def postEvent(self):
        with engine.begin() as conn:
            post_stmt = sa.insert(user_events_table).values(user_id=self.user_id, event_type=self.event_type, event_time_at=datetime.now())

            conn.execute(post_stmt)
            log.info(
                f"Event INSERT completed | user_id={self.user_id} | event_type={self.event_type}"
            )


