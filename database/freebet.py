from database.db_config import engine, frebet_grants_table, freebet_ticket_table
from database.bonus import BonusManager
import sqlalchemy as sa
from datetime import datetime
from log_manager import log

TICKET_STATUS_AVAILABLE = "available"
TICKET_STATUS_USED = "used"
TICKET_STATUS_EXPIRED = "expired"


class FreebetManager:
    def __init__(self, user_id):
        self.user_id = user_id
        self.bonus = BonusManager(user_id)

    def createGrant(self, day_index, tickets_count, bet_size, eligible_games, spin_seed=None, spin_proof=None, expires_at=None, conn=None):
        values = {
            "user_id": self.user_id,
            "day_index": day_index,
            "tickets_count": tickets_count,
            "bet_size": bet_size,
            "eligible_games": eligible_games,
            "spin_seed": spin_seed,
            "spin_proof": spin_proof,
            "granted_at": datetime.now(),
            "expires_at": expires_at,
        }

        if conn is not None:
            grant_id = conn.execute(
                sa.insert(frebet_grants_table).values(**values).returning(frebet_grants_table.c.id)
            ).scalar_one()
            self._createTickets(grant_id, tickets_count, bet_size, conn)
            return grant_id

        with engine.begin() as new_conn:
            return self.createGrant(
                day_index,
                tickets_count,
                bet_size,
                eligible_games,
                spin_seed,
                spin_proof,
                expires_at,
                conn=new_conn,
            )

    def _createTickets(self, grant_id, tickets_count, bet_size, conn):
        for _ in range(tickets_count):
            conn.execute(
                sa.insert(freebet_ticket_table).values(
                    grant_id=grant_id,
                    user_id=self.user_id,
                    bet_size=bet_size,
                    status=TICKET_STATUS_AVAILABLE,
                )
            )

        log.info(
            f"Freebet tickets created | user_id={self.user_id} | grant_id={grant_id} | "
            f"count={tickets_count}"
        )

    def getAvailableTicket(self, game_id, conn=None):
        stmt = (
            sa.select(freebet_ticket_table)
            .where(
                freebet_ticket_table.c.user_id == self.user_id,
                freebet_ticket_table.c.status == TICKET_STATUS_AVAILABLE,
            )
            .order_by(freebet_ticket_table.c.id.asc())
            .limit(1)
        )

        if conn is not None:
            ticket = conn.execute(stmt).mappings().first()
        else:
            with engine.begin() as new_conn:
                ticket = new_conn.execute(stmt).mappings().first()

        if ticket is None:
            return None

        grant = self._getGrant(ticket["grant_id"], conn=conn)
        if grant is None:
            return None

        eligible_games = grant.get("eligible_games") or []
        if eligible_games and game_id not in eligible_games:
            return None

        expires_at = grant.get("expires_at")
        if expires_at is not None and expires_at <= datetime.now():
            return None

        return ticket

    def _getGrant(self, grant_id, conn=None):
        stmt = sa.select(frebet_grants_table).where(frebet_grants_table.c.id == grant_id)

        if conn is not None:
            return conn.execute(stmt).mappings().first()

        with engine.begin() as new_conn:
            return new_conn.execute(stmt).mappings().first()

    def consumeTicket(self, ticket_id, game_id, conn=None):
        if conn is not None:
            return self._consumeTicket(ticket_id, game_id, conn)

        with engine.begin() as new_conn:
            return self._consumeTicket(ticket_id, game_id, new_conn)

    def _consumeTicket(self, ticket_id, game_id, conn):
        ticket = conn.execute(
            sa.select(freebet_ticket_table).where(freebet_ticket_table.c.id == ticket_id)
        ).mappings().first()

        if ticket is None or ticket["status"] != TICKET_STATUS_AVAILABLE:
            return None

        conn.execute(
            sa.update(freebet_ticket_table)
            .where(freebet_ticket_table.c.id == ticket_id)
            .values(status=TICKET_STATUS_USED, game_id=game_id, used_at=datetime.now())
        )

        log.info(
            f"Freebet ticket consumed | user_id={self.user_id} | ticket_id={ticket_id} | "
            f"game_id={game_id}"
        )
        return ticket

    def recordWin(self, ticket_id, wallet_id, win_amount, wager_multiplier=1, conn=None):
        if win_amount <= 0:
            if conn is not None:
                conn.execute(
                    sa.update(freebet_ticket_table)
                    .where(freebet_ticket_table.c.id == ticket_id)
                    .values(win_amount=0)
                )
            return None

        if conn is not None:
            conn.execute(
                sa.update(freebet_ticket_table)
                .where(freebet_ticket_table.c.id == ticket_id)
                .values(win_amount=win_amount)
            )
            return self.bonus.grantFromFreebetWin(
                wallet_id, win_amount, wager_multiplier=wager_multiplier, conn=conn
            )

        with engine.begin() as new_conn:
            return self.recordWin(
                ticket_id, wallet_id, win_amount, wager_multiplier, conn=new_conn
            )
