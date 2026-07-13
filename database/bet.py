from database.db_config import engine, bet_table
from datetime import datetime
import sqlalchemy as sa
from log_manager import log


class Bet:
    def __init__(self, user_id, bet_transaction_id, balance_type):
        self.user_id = user_id
        self.bet_transaction_id = bet_transaction_id
        self.balance_type = balance_type

    def createBet(self, conn, game, amount, result, profit):
        post_stmt = (
            sa.insert(bet_table)
            .values(
                bet_transaction_id=self.bet_transaction_id,
                user_id=self.user_id,
                balance_type=self.balance_type,
                game=game,
                bet_amount=amount,
                result=result,
                profit=profit,
                created_at=datetime.now(),
            )
            .returning(bet_table.c.id)
        )

        bet_id = conn.execute(post_stmt).scalar_one()
        log.info(
            f"Bet INSERT completed | user_id={self.user_id} | bet_id={bet_id} | game={game} | "
            f"result={result} | profit={profit}"
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
