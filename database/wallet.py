from database.db_config import engine, wallet_table,
import sqlalchemy as sa
from datetime import datetime
from log_manager import log

def getWalletId(user_id):
    with engine.begin() as conn:
        get_stmt = sa.select(wallet_table.c.id).where(wallet_table.c.user_id==user_id)
        result = conn.execute(get_stmt)
        wallet_id = result.scalar_one_or_none()

        if wallet_id == None:
            log.warning(f"Wallet not found | user_id={user_id}")
            return None

        log.info(f"Wallet found | user_id={user_id} | wallet_id={wallet_id}")
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
                log.warning(f"Wallet record not found | user_id={self.user_id}")
                return None
            
            return wallet.id

    def createWallet(self):
        with engine.begin() as conn:
            post_stmt = sa.insert(wallet_table).values(user_id=self.user_id, type='real', created_at=datetime.now())
            conn.execute(post_stmt)
            log.info(f"Wallet INSERT completed | user_id={self.user_id}")

    # conn - required for atomar transactions
    def updateBalance(self, conn, balance_after): 
        update_stmt = sa.update(wallet_table).where(wallet_table.c.user_id==self.user_id).values(balance=balance_after)
        conn.execute(update_stmt)
        log.info(
            f"Wallet balance UPDATE completed | user_id={self.user_id} | balance_after={balance_after}"
        )

    def updateCurrency(self, currency):
        with engine.begin() as conn:
            update_stmt = sa.update(wallet_table.c.currency).where(wallet_table.c.user_id==self.user_id).values(balance=currency)
            conn.execute(update_stmt)
            log.info(f"Wallet currency UPDATE completed | user_id={self.user_id} | currency={currency}")

    def getRealBalance(self, wallet_id):
        with engine.begin() as conn:
            get_stmt = sa.select(wallet_table.c.real_balance).where(wallet_table.c.id==wallet_id)
            balance = conn.execute(get_stmt).scalar_one_or_none()

            if balance is None:
                log.warning(f"Real balance not found | user_id={self.user_id} | wallet_id={wallet_id}")

            return balance
        
    def getBonusBalance(self, wallet_id):
        with engine.begin() as conn:
            get_stmt = sa.select(wallet_table.c.bonus_balance).where(wallet_table.c.id==wallet_id)
            balance = conn.execute(get_stmt).scalar_one_or_none()

            if balance is None:
                log.warning(f"Bonus balance not found | user_id={self.user_id} | wallet_id={wallet_id}")

            return balance
        
    def updateRealBalance(self, conn, balance_after):
        update_stmt = sa.update(wallet_table).where(wallet_table.c.user_id==self.user_id).values(real_balance=balance_after)
        conn.execute(update_stmt)
        log.info(
            f"Wallet real balance UPDATE completed | user_id={self.user_id} | balance_after={balance_after}"
        )

    def updateBonusBalance(self, conn, balance_after):
        update_stmt = sa.update(wallet_table).where(wallet_table.c.user_id==self.user_id).values(bonus_balance=balance_after)
        conn.execute(update_stmt)
        log.info(
            f"Wallet bonus balance UPDATE completed | user_id={self.user_id} | balance_after={balance_after}"
        )
        
    def ensureWallet(self):
        wallet_id = self.checkWalletStatus()

        if wallet_id is None:
            self.createWallet()
            wallet_id = self.checkWalletStatus()

        if wallet_id is None:
            log.error(f"Failed to create wallet | user_id={self.user_id}")
            raise Exception("Failed to create wallet")

        return wallet_id
    
    def getRealBalance(self, wallet_id):
        with engine.begin() as conn:
            get_stmt = sa.select(wallet_table.c.balance).where(wallet_table.c.id==wallet_id)
            balance = conn.execute(get_stmt).scalar_one_or_none()

            if balance is None:
                log.warning(f"Real balance not found | user_id={self.user_id} | wallet_id={wallet_id}")
                return None

            return balance
    def hasEnoughBalance(self, wallet_id, amount):
        balance = self.getRealBalance(wallet_id)

        if balance is None:
            log.warning(f"Cannot check balance | user_id={self.user_id} | wallet_id={wallet_id}")
            return False

        if balance < amount:
            log.warning(f"Not enough balance | user_id={self.user_id} | wallet_id={wallet_id} | balance={balance} | required_amount={amount}")
            return False

        return True


        

