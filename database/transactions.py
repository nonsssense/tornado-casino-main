from database.db_config import engine, transaction_table
import sqlalchemy as sa
from log_manager import log


class TransactionManager:
    def __init__(
        self,
        user_id,
        wallet_id,
        balance_type,
        transaction_type,
        amount,
        balance_after,
        status="Done",
        reference_id=None,
        bonus_instance_id=None,
    ):
        self.user_id = user_id
        self.wallet_id = wallet_id
        self.balance_type = balance_type
        self.transaction_type = transaction_type
        self.amount = amount
        self.balance_after = balance_after
        self.status = status
        self.reference_id = reference_id
        self.bonus_instance_id = bonus_instance_id

    def postTransaction(self, conn=None):
        if conn is None:
            with engine.begin() as new_conn:
                return self.postTransaction(new_conn)

        values = {
            "user_id": self.user_id,
            "wallet_id": self.wallet_id,
            "type": self.transaction_type,
            "balance_type": self.balance_type,
            "amount": self.amount,
            "balance_after": self.balance_after,
            "status": self.status,
        }

        if self.reference_id is not None:
            values["reference_id"] = self.reference_id
        if self.bonus_instance_id is not None:
            values["bonus_instance_id"] = self.bonus_instance_id

        post_stmt = (
            sa.insert(transaction_table)
            .values(**values)
            .returning(transaction_table.c.id)
        )

        transaction_id = conn.execute(post_stmt).scalar_one()
        log.info(
            f"Transaction INSERT completed | user_id={self.user_id} | transaction_id={transaction_id} | "
            f"type={self.transaction_type} | balance_type={self.balance_type} | "
            f"amount={self.amount} | balance_after={self.balance_after}"
        )
        return transaction_id


def getUserTransactions(user_id, limit=50):
    with engine.begin() as conn:
        stmt = (
            sa.select(transaction_table)
            .where(transaction_table.c.user_id == user_id)
            .order_by(transaction_table.c.id.desc())
            .limit(limit)
        )
        return conn.execute(stmt).mappings().all()
    


