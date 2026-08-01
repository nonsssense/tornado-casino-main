from database.db_config import engine, bet_table
from datetime import datetime
import sqlalchemy as sa
from log_manager import log

_bet_schema_ready = False


def ensure_bet_schema():
    """Add real_part / bonus_part for cash-first split accounting (idempotent)."""
    global _bet_schema_ready
    if _bet_schema_ready:
        return
    with engine.begin() as conn:
        for col in ("real_part", "bonus_part"):
            conn.execute(
                sa.text(
                    f"ALTER TABLE bets ADD COLUMN IF NOT EXISTS {col} NUMERIC"
                )
            )
    for col in ("real_part", "bonus_part"):
        try:
            bet_table.append_column(
                sa.Column(col, sa.Numeric, nullable=True),
                replace_existing=True,
            )
        except Exception:
            pass
    _bet_schema_ready = True
    log.info("Bet schema ensured (real_part + bonus_part)")


class Bet:
    def __init__(self, user_id, bet_transaction_id, balance_type):
        self.user_id = user_id
        self.bet_transaction_id = bet_transaction_id
        self.balance_type = balance_type

    def createBet(self, conn, game, amount, result, profit, real_part=None, bonus_part=None):
        ensure_bet_schema()
        values = {
            "bet_transaction_id": self.bet_transaction_id,
            "user_id": self.user_id,
            "balance_type": self.balance_type,
            "game": game,
            "bet_amount": amount,
            "result": result,
            "profit": profit,
            "created_at": datetime.now(),
        }
        if real_part is not None:
            values["real_part"] = float(real_part)
        if bonus_part is not None:
            values["bonus_part"] = float(bonus_part)

        post_stmt = (
            sa.insert(bet_table)
            .values(**values)
            .returning(bet_table.c.id)
        )

        bet_id = conn.execute(post_stmt).scalar_one()
        log.info(
            f"Bet INSERT completed | user_id={self.user_id} | bet_id={bet_id} | game={game} | "
            f"result={result} | profit={profit} | real_part={real_part} | bonus_part={bonus_part}"
        )
        return bet_id

    def updateWinTransaction(self, conn, win_transaction_id, bet_id):
        update_stmt = (
            sa.update(bet_table)
            .where(bet_table.c.id == bet_id)
            .values(win_transaction_id=win_transaction_id)
        )
        conn.execute(update_stmt)
        log.info(
            f"Bet UPDATE completed | user_id={self.user_id} | bet_id={bet_id} | "
            f"win_transaction_id={win_transaction_id}"
        )

    def updateOutcome(self, conn, bet_id, result, profit, win_transaction_id=None):
        values = {
            "result": result,
            "profit": profit,
        }
        if win_transaction_id is not None:
            values["win_transaction_id"] = win_transaction_id

        update_stmt = (
            sa.update(bet_table)
            .where(bet_table.c.id == bet_id)
            .values(**values)
        )
        conn.execute(update_stmt)
        log.info(
            f"Bet outcome UPDATE completed | user_id={self.user_id} | bet_id={bet_id} | "
            f"result={result} | profit={profit} | win_transaction_id={win_transaction_id}"
        )
