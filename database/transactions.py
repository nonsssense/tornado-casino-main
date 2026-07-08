from database.db_config import engine, transaction_table, wallet_table
import sqlalchemy as sa
from database.wallet import WalletManager
from exceptions import notActualWallet, notEnoughBalance
from handler_helpers import balanceCheck
from log_manager import log


class TransactionManager:
    def __init__(self, user_id, wallet_id, type, amount, status="Processing", reference_id=None):
        self.user_id = user_id
        self.wallet_id = wallet_id
        self.type = type
        self.amount = amount
        self.status = status
        self.reference_id = reference_id

    def postTransaction(self, conn=None):
        try:
            # wallet_table select and transaction_table insert 'll be in one sql transaction 
            if conn is None:
                with engine.begin() as new_conn:
                    return self.postTransaction(new_conn)
                
            wallet = WalletManager(self.user_id)
            wallet_id = wallet.checkWalletStatus()

            result = conn.execute(getBalanceStmt(self.user_id))
            balance = result.scalar_one_or_none()
            if balance is None:
                log.warning(
                    f"Wallet balance not found for transaction | user_id={self.user_id} | "
                    f"wallet_id={self.wallet_id}"
                )
                raise notActualWallet()

            if self.type != "deposit":
                balance_check_status = balanceCheck(wallet, wallet_id, self.amount)
                if balance_check_status == 'not enough':
                    raise notEnoughBalance()

            balance_after = balance + self.amount

            post_stmt = sa.insert(transaction_table).values(user_id=self.user_id,
                                                            wallet_id=self.wallet_id,
                                                            type=self.type,
                                                            amount=self.amount,
                                                            status='Done',
                                                            balance_after=balance_after).returning(transaction_table.c.id)
                
            transaction_id = conn.execute(post_stmt).scalar_one()
            log.info(
                f"Transaction INSERT completed | user_id={self.user_id} | transaction_id={transaction_id} | "
                f"type={self.type} | amount={self.amount} | balance_after={balance_after}"
            )

            wallet.updateBalance(conn, balance_after)

            return transaction_id
        except Exception:
            log.exception(
                f"Transaction failed | user_id={self.user_id} | type={self.type} | amount={self.amount}"
            )
            raise

def getBalanceStmt(user_id):
    get_balance_stmt = sa.select(wallet_table.c.balance).where(wallet_table.c.user_id==user_id)

    return get_balance_stmt


def getUserTransactions(user_id, limit=50):
    with engine.begin() as conn:
        stmt = (
            sa.select(transaction_table)
            .where(transaction_table.c.user_id == user_id)
            .order_by(transaction_table.c.id.desc())
            .limit(limit)
        )
        return conn.execute(stmt).mappings().all()


