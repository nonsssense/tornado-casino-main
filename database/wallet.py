from database.db_config import engine, wallet_table
import sqlalchemy as sa
from datetime import datetime

def getWalletId(user_id):
    with engine.begin() as conn:
        get_stmt = sa.select(wallet_table.c.wallet_id).where(wallet_table.c.user_id==user_id)
        result = conn.execute(get_stmt)
        wallet_id = result.result.scalar_one_or_none()

        if wallet_id == None:
            return 'None'

        return wallet_id
    

class WalletManager:
    def __init__(self, user_id):
        self.user_id = user_id


    def checkWalletStatus(self):
        with engine.begin() as conn:
            get_stmt = sa.select(wallet_table).where(wallet_table.c.user_id==self.user_id)
            result = conn.execute(get_stmt)
            wallet = result.fetchone()

            if wallet is None:
                return None
            
            return wallet.id

    def createWallet(self):
        with engine.begin() as conn:
            post_stmt = sa.insert(wallet_table).values(user_id=self.user_id, type='real', created_at=datetime.now())
            conn.execute(post_stmt)

    # conn - required for atomar transactions
    def updateBalance(self, conn, balance_after): 
        update_stmt = sa.update(wallet_table.c.balance).where(wallet_table.c.user_id==self.user_id).values(balance=balance_after)
        conn.execute(update_stmt)

    def updateCurrency(self, currency):
        with engine.begin() as conn:
            update_stmt = sa.update(wallet_table.c.currency).where(wallet_table.c.user_id==self.user_id).values(balance=currency)
            conn.execute(update_stmt)

    def getBalance(self, wallet_id):
        with engine.begin() as conn:
            get_stmt = sa.select(wallet_table.c.balance).where(wallet_table.c.id==wallet_id)
            balance = conn.execute(get_stmt).scalar_one_or_none()

            return balance
