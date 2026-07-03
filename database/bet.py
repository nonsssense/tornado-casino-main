from database.db_config import engine, bet_table
from datetime import datetime
import sqlalchemy as sa


class Bet:
    def __init__(self, user_id, transaction_id):
        self.user_id = user_id
        self.transaction_id = transaction_id

    def createBet(self, game, amount, result, profit):
        with engine.begin() as conn:
            post_stmt = sa.insert(bet_table).values(transaction_id=self.transaction_id,
                                                     user_id=self.user_id,
                                                       game=game,
                                                         bet_amount=amount,
                                                           result=result,
                                                             profit=profit).returning(bet_table.c.id)
                                                             
            conn.execute(post_stmt)

    def updateWinTransaction(self, win_transaction_id, bet_id):
        with engine.begin() as conn:
            update_stmt = sa.update(bet_table.c.win_transaction_id).where(bet_table.c.id==bet_id).values(win_transaction_id)
            conn.execute(update_stmt)

        
