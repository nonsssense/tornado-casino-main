from database.db_config import engine, wallet_table
import sqlalchemy as sa
from datetime import datetime
from log_manager import log

BALANCE_REAL = "REAL"
BALANCE_BONUS = "BONUS"


def getWalletId(user_id):
    with engine.begin() as conn:
        get_stmt = sa.select(wallet_table.c.id).where(wallet_table.c.user_id == user_id)
        result = conn.execute(get_stmt)
        wallet_id = result.scalar_one_or_none()

        if wallet_id is None:
            log.warning(f"Wallet not found | user_id={user_id}")
            return None

        log.info(f"Wallet found | user_id={user_id} | wallet_id={wallet_id}")
        return wallet_id


class WalletManager:
    def __init__(self, user_id):
        self.user_id = user_id

    def checkWalletStatus(self):
        with engine.begin() as conn:
            get_stmt = sa.select(wallet_table).where(wallet_table.c.user_id == self.user_id)
            result = conn.execute(get_stmt)
            wallet = result.fetchone()

            if wallet is None:
                log.warning(f"Wallet record not found | user_id={self.user_id}")
                return None

            return wallet.id

    def createWallet(self):
        with engine.begin() as conn:
            post_stmt = sa.insert(wallet_table).values(
                user_id=self.user_id,
                type="real",
                real_balance=0,
                bonus_balance=0,
                created_at=datetime.now(),
            )
            conn.execute(post_stmt)
            log.info(f"Wallet INSERT completed | user_id={self.user_id}")

    def getRealBalance(self, wallet_id, conn=None):
        get_stmt = sa.select(wallet_table.c.real_balance).where(wallet_table.c.id == wallet_id)

        if conn is not None:
            balance = conn.execute(get_stmt).scalar_one_or_none()
        else:
            with engine.begin() as new_conn:
                balance = new_conn.execute(get_stmt).scalar_one_or_none()

        if balance is None:
            log.warning(f"Real balance not found | user_id={self.user_id} | wallet_id={wallet_id}")
            return 0

        return float(balance)

    def getBonusBalance(self, wallet_id, conn=None):
        get_stmt = sa.select(wallet_table.c.bonus_balance).where(wallet_table.c.id == wallet_id)

        if conn is not None:
            balance = conn.execute(get_stmt).scalar_one_or_none()
        else:
            with engine.begin() as new_conn:
                balance = new_conn.execute(get_stmt).scalar_one_or_none()

        if balance is None:
            log.warning(f"Bonus balance not found | user_id={self.user_id} | wallet_id={wallet_id}")
            return 0

        return float(balance)

    def updateRealBalance(self, conn, balance_after):
        update_stmt = (
            sa.update(wallet_table)
            .where(wallet_table.c.user_id == self.user_id)
            .values(real_balance=balance_after)
        )
        conn.execute(update_stmt)
        log.info(
            f"Wallet real balance UPDATE completed | user_id={self.user_id} | balance_after={balance_after}"
        )

    def updateBonusBalance(self, conn, balance_after):
        update_stmt = (
            sa.update(wallet_table)
            .where(wallet_table.c.user_id == self.user_id)
            .values(bonus_balance=balance_after)
        )
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

    def hasEnoughBalance(self, wallet_id, amount, balance_type=BALANCE_REAL, conn=None):
        if balance_type == BALANCE_REAL:
            balance = self.getRealBalance(wallet_id, conn=conn)
        else:
            balance = self.getBonusBalance(wallet_id, conn=conn)

        if balance < amount:
            log.warning(
                f"Not enough balance | user_id={self.user_id} | wallet_id={wallet_id} | "
                f"balance_type={balance_type} | balance={balance} | required_amount={amount}"
            )
            return False

        return True
