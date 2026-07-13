from database.db_config import engine, withdraw_table
from database.transactions import TransactionManager
from database.wallet import WalletManager, BALANCE_REAL
from payments.deposit import BlockBeeClient, normalize_blockbee_ticker
from exceptions import notEnoughBalance
import sqlalchemy as sa
from datetime import datetime
from log_manager import log

WITHDRAW_STATUS_PENDING = "PENDING"
WITHDRAW_STATUS_COMPLETED = "COMPLETED"
WITHDRAW_STATUS_REJECTED = "REJECTED"
WITHDRAW_STATUS_FAILED = "FAILED"


class WithdrawManager:
    def __init__(self, user_id):
        self.user_id = int(user_id)
        log.info(f"WithdrawManager initialized | user_id={self.user_id}")

    @staticmethod
    def getWithdraw(withdraw_id):
        with engine.begin() as conn:
            stmt = sa.select(withdraw_table).where(withdraw_table.c.id == withdraw_id)
            withdraw = conn.execute(stmt).mappings().first()

            if withdraw is None:
                log.warning(f"Withdraw not found | withdraw_id={withdraw_id}")
            else:
                log.info(
                    f"Withdraw found | withdraw_id={withdraw_id} | status={withdraw.get('status')}"
                )

            return withdraw

    @staticmethod
    def listPendingWithdraws(limit=50):
        with engine.begin() as conn:
            stmt = (
                sa.select(withdraw_table)
                .where(withdraw_table.c.status == WITHDRAW_STATUS_PENDING)
                .order_by(withdraw_table.c.created_at.asc())
                .limit(limit)
            )
            return conn.execute(stmt).mappings().all()

    def _getPendingWithdrawAmount(self, conn):
        stmt = (
            sa.select(sa.func.coalesce(sa.func.sum(withdraw_table.c.amount), 0))
            .where(
                withdraw_table.c.user_id == self.user_id,
                withdraw_table.c.status == WITHDRAW_STATUS_PENDING,
            )
        )
        return float(conn.execute(stmt).scalar_one())

    def createWithdrawRequest(self, wallet_id, amount, coin, address):
        amount = float(amount)
        coin = normalize_blockbee_ticker(coin)
        address = address.strip()

        if amount <= 0:
            raise ValueError("Withdraw amount must be greater than zero")

        if not address:
            raise ValueError("Withdraw address is required")

        wallet = WalletManager(self.user_id)

        with engine.begin() as conn:
            stmt = sa.select(withdraw_table.c.id).where(
                withdraw_table.c.user_id == self.user_id,
                withdraw_table.c.status == WITHDRAW_STATUS_PENDING,)
            
            existing = conn.execute(stmt).scalar_one_or_none()

            if existing is not None:
                raise Exception("You already have a pending withdrawal request.")
            
            real_balance = wallet.getRealBalance(wallet_id, conn=conn)

            if real_balance < amount:
                log.warning(
                    f"Insufficient balance for withdraw request | "
                    f"user_id={self.user_id} | "
                    f"balance={real_balance} | "
                    f"amount={amount}"
                )
                raise ValueError("You already have a pending withdrawal request.")
            post_stmt = (
                sa.insert(withdraw_table)
                .values(
                    user_id=self.user_id,
                    wallet_id=wallet_id,
                    amount=amount,
                    coin=coin,
                    address=address,
                    status=WITHDRAW_STATUS_PENDING,
                    created_at=datetime.now(),
                )
                .returning(withdraw_table.c.id)
            )
            
            withdraw_id = conn.execute(post_stmt).scalar_one()
            log.info(
                f"Withdraw request created | "
                f"user_id={self.user_id} | "
                f"withdraw_id={withdraw_id} | "
                f"amount={amount} | "
                f"coin={coin}"
            )

            return withdraw_id


    def getUserWithdraws(self, limit=20):
        with engine.begin() as conn:
            stmt = (
                sa.select(withdraw_table)
                .where(withdraw_table.c.user_id == self.user_id)
                .order_by(withdraw_table.c.id.desc())
                .limit(limit)
            )
            return conn.execute(stmt).mappings().all()

    def rejectWithdraw(self, withdraw_id, reviewed_by, reason=None):
        withdraw = self.getWithdraw(withdraw_id)

        if withdraw is None or withdraw["user_id"] != self.user_id:
            return {"ok": False, "error": "Withdraw not found"}

        if withdraw["status"] != WITHDRAW_STATUS_PENDING:
            return {"ok": False, "error": "Withdraw is not pending"}

        with engine.begin() as conn:
            conn.execute(
                sa.update(withdraw_table)
                .where(withdraw_table.c.id == withdraw_id)
                .values(
                    status=WITHDRAW_STATUS_REJECTED,
                    reviewed_by=reviewed_by,
                    reviewed_at=datetime.now(),
                    reject_reason=reason,
                )
            )

        log.info(
            f"Withdraw rejected | user_id={self.user_id} | withdraw_id={withdraw_id} | "
            f"reviewed_by={reviewed_by}"
        )
        return {"ok": True, "withdraw_id": withdraw_id, "status": WITHDRAW_STATUS_REJECTED}

    async def approveWithdraw(self, withdraw_id, reviewed_by):
        withdraw = self.getWithdraw(withdraw_id)

        if withdraw is None or withdraw["user_id"] != self.user_id:
            return {"ok": False, "error": "Withdraw not found"}

        if withdraw["status"] != WITHDRAW_STATUS_PENDING:
            return {"ok": False, "error": "Withdraw is not pending"}

        wallet_id = withdraw["wallet_id"]
        amount = float(withdraw["amount"])
        wallet = WalletManager(self.user_id)

        if not wallet.hasEnoughBalance(wallet_id, amount, BALANCE_REAL):
            self._markFailed(withdraw_id, reviewed_by)
            return {"ok": False, "error": "Insufficient real balance"}

        client = BlockBeeClient()

        try:
            payout = await client.send_payout(withdraw["coin"], withdraw["address"], amount)
        except Exception as exc:
            self._markFailed(withdraw_id, reviewed_by)
            log.exception(
                f"Withdraw approval failed at BlockBee | user_id={self.user_id} | "
                f"withdraw_id={withdraw_id}"
            )
            return {"ok": False, "error": str(exc), "status": WITHDRAW_STATUS_FAILED}

        with engine.begin() as conn:
            real_balance = wallet.getRealBalance(wallet_id, conn=conn)
            balance_after = real_balance - amount
            wallet.updateRealBalance(conn, balance_after)

            transaction_id = TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_REAL,
                transaction_type="withdraw",
                amount=-amount,
                balance_after=balance_after,
                status="Completed",
                reference_id=payout.get("payout_id"),
            ).postTransaction(conn)

            conn.execute(
                sa.update(withdraw_table)
                .where(withdraw_table.c.id == withdraw_id)
                .values(
                    status=WITHDRAW_STATUS_COMPLETED,
                    transaction_id=transaction_id,
                    blockbee_request_id=payout.get("request_id"),
                    blockbee_payout_id=payout.get("payout_id"),
                    txid=payout.get("txid") or None,
                    reviewed_by=reviewed_by,
                    reviewed_at=datetime.now(),
                )
            )

        log.info(
            f"Withdraw completed | user_id={self.user_id} | withdraw_id={withdraw_id} | "
            f"transaction_id={transaction_id} | txid={payout.get('txid')}"
        )
        return {
            "ok": True,
            "withdraw_id": withdraw_id,
            "status": WITHDRAW_STATUS_COMPLETED,
            "transaction_id": transaction_id,
            "txid": payout.get("txid"),
        }

    def _markFailed(self, withdraw_id, reviewed_by):
        with engine.begin() as conn:
            conn.execute(
                sa.update(withdraw_table)
                .where(withdraw_table.c.id == withdraw_id)
                .values(
                    status=WITHDRAW_STATUS_FAILED,
                    reviewed_by=reviewed_by,
                    reviewed_at=datetime.now(),
                )
            )
