from database.db_config import engine, transaction_table, wallet_table
import sqlalchemy as sa
from database.wallet import WalletManager
from exceptions import notActualWallet, notEnoughBalance
from handler_helpers import balanceCheck


class TransactionManager:
    def __init__(self, user_id, wallet_id, type, amount, status="Processing", reference_id=None):
        self.user_id = user_id
        self.wallet_id = wallet_id
        self.type = type
        self.amount = amount
        self.status = status
        self.reference_id = reference_id

    def postTransaction(self, conn=None):
        # wallet_table select and transaction_table insert 'll be in one sql transaction 
        if conn is None:
            with engine.begin() as new_conn:
                return self._postTransaction(new_conn)
            
        wallet = WalletManager(self.user_id)
        wallet_id = wallet.checkWalletStatus()

        result = conn.execute(getBalanceStmt(self.user_id))
        balance = result.scalar_one_or_none()
        balance_check_status = balanceCheck(wallet, wallet_id, self.amount)

        if balance is None:
            raise notActualWallet()
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
        wallet.updateBalance(conn, balance_after)

        return transaction_id

def getBalanceStmt(user_id):
    get_balance_stmt = sa.select(wallet_table.c.balance).where(wallet_table.c.user_id==user_id)

    return get_balance_stmt



