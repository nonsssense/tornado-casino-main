from database.db_config import engine, withdraw_table
from database.transactions import TransactionManager
from database.wallet import (
    WalletManager,
    BALANCE_REAL,
    BALANCE_PENDING,
    lock_wallet,
    ensure_wallet_schema,
)
from promo.promo_manager import PromotionManager
from payments.deposit import BlockBeeClient, normalize_blockbee_ticker
from payments.convert import usd_to_crypto
from config import WITHDRAW_MIN_USD
import sqlalchemy as sa
from datetime import datetime
from log_manager import log

WITHDRAW_STATUS_PENDING = "PENDING"
WITHDRAW_STATUS_PROCESSING = "PROCESSING"
WITHDRAW_STATUS_COMPLETED = "COMPLETED"
WITHDRAW_STATUS_REJECTED = "REJECTED"
WITHDRAW_STATUS_FAILED = "FAILED"


class WithdrawBelowMinimumError(ValueError):
    """Raised when the requested USD amount is below WITHDRAW_MIN_USD."""

    def __init__(self, amount, minimum_usd):
        self.amount = float(amount)
        self.minimum_usd = float(minimum_usd)
        super().__init__(f"Minimum withdrawal is ${self.minimum_usd:g}")


def get_withdraw_minimum_usd() -> float:
    """Configured product floor for withdrawals (USD)."""
    return float(WITHDRAW_MIN_USD)


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

    def _has_active_withdraw(self, conn):
        """True if user already has PENDING or PROCESSING withdraw."""
        existing = conn.execute(
            sa.select(withdraw_table.c.id).where(
                withdraw_table.c.user_id == self.user_id,
                withdraw_table.c.status.in_(
                    (WITHDRAW_STATUS_PENDING, WITHDRAW_STATUS_PROCESSING)
                ),
            )
        ).scalar_one_or_none()
        return existing is not None

    def createWithdrawRequest(self, wallet_id, amount, coin, address):
        """
        Reserve funds at request time:
          real_balance -= amount
          pending_balance += amount
        Games cannot spend reserved REAL. Approve only clears pending.
        """
        ensure_wallet_schema()
        amount = float(amount)
        coin = normalize_blockbee_ticker(coin)
        address = address.strip()

        if amount <= 0:
            raise ValueError("Withdraw amount must be greater than zero")

        minimum_usd = get_withdraw_minimum_usd()
        if amount + 1e-9 < minimum_usd:
            log.warning(
                f"Withdraw below minimum | user_id={self.user_id} | "
                f"amount={amount} | minimum_usd={minimum_usd}"
            )
            raise WithdrawBelowMinimumError(amount, minimum_usd)

        if not address:
            raise ValueError("Withdraw address is required")

        wallet = WalletManager(self.user_id)

        with engine.begin() as conn:
            locked = lock_wallet(conn, self.user_id, wallet_id)
            if locked is None:
                raise ValueError("Wallet not found")

            if self._has_active_withdraw(conn):
                raise ValueError("Sorry. You already have a pending withdrawal")

            if float(locked.get("pending_balance") or 0) > 0:
                raise ValueError("Sorry. You already have a pending withdrawal")

            if float(locked["real_balance"]) < amount:
                log.warning(
                    f"Insufficient balance for withdraw request | "
                    f"user_id={self.user_id} | "
                    f"balance={locked['real_balance']} | "
                    f"amount={amount}"
                )
                raise ValueError("Insufficient real balance")

            # Rulebook: forfeit remaining welcome bonus BEFORE real→pending.
            PromotionManager(self.user_id).on_withdrawal_requested(
                self.user_id, wallet_id, conn=conn
            )

            # One statement: hold funds so concurrent bets cannot spend them.
            balances = wallet.apply_balance_deltas(
                conn,
                wallet_id,
                real_delta=-amount,
                pending_delta=amount,
            )

            try:
                withdraw_id = conn.execute(
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
                ).scalar_one()
            except Exception:
                # Unique partial index race — surface cleanly.
                raise ValueError("Sorry. You already have a pending withdrawal") from None

            TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_REAL,
                transaction_type="withdraw hold",
                amount=-amount,
                balance_after=balances["real_balance"],
                status="Done",
                reference_id=str(withdraw_id),
            ).postTransaction(conn)

            log.info(
                f"Withdraw request created | "
                f"user_id={self.user_id} | "
                f"withdraw_id={withdraw_id} | "
                f"amount={amount} | "
                f"coin={coin} | "
                f"pending={balances['pending_balance']}"
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
        """Release hold: pending → real. Only PENDING rows."""
        ensure_wallet_schema()
        withdraw = self.getWithdraw(withdraw_id)

        if withdraw is None or withdraw["user_id"] != self.user_id:
            return {"ok": False, "error": "Withdraw not found"}

        if withdraw["status"] != WITHDRAW_STATUS_PENDING:
            return {"ok": False, "error": "Withdraw is not pending"}

        amount = float(withdraw["amount"])
        wallet_id = withdraw["wallet_id"]
        wallet = WalletManager(self.user_id)

        with engine.begin() as conn:
            claimed = conn.execute(
                sa.update(withdraw_table)
                .where(
                    withdraw_table.c.id == withdraw_id,
                    withdraw_table.c.user_id == self.user_id,
                    withdraw_table.c.status == WITHDRAW_STATUS_PENDING,
                )
                .values(
                    status=WITHDRAW_STATUS_REJECTED,
                    reviewed_by=reviewed_by,
                    reviewed_at=datetime.now(),
                    reject_reason=reason,
                )
                .returning(withdraw_table)
            ).mappings().first()
            if claimed is None:
                return {"ok": False, "error": "Withdraw is not pending"}

            locked = lock_wallet(conn, self.user_id, wallet_id)
            if locked is None:
                return {"ok": False, "error": "Wallet not found"}

            balances = wallet.apply_balance_deltas(
                conn,
                wallet_id,
                real_delta=amount,
                pending_delta=-amount,
            )
            TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_REAL,
                transaction_type="withdraw reject release",
                amount=amount,
                balance_after=balances["real_balance"],
                status="Done",
                reference_id=str(withdraw_id),
            ).postTransaction(conn)

        log.info(
            f"Withdraw rejected | user_id={self.user_id} | withdraw_id={withdraw_id} | "
            f"reviewed_by={reviewed_by}"
        )
        return {"ok": True, "withdraw_id": withdraw_id, "status": WITHDRAW_STATUS_REJECTED}

    def _claimPendingWithdraw(self, withdraw_id, reviewed_by):
        """Atomically PENDING → PROCESSING. Returns claimed row or None if lost race."""
        with engine.begin() as conn:
            claimed = conn.execute(
                sa.update(withdraw_table)
                .where(
                    withdraw_table.c.id == withdraw_id,
                    withdraw_table.c.user_id == self.user_id,
                    withdraw_table.c.status == WITHDRAW_STATUS_PENDING,
                )
                .values(
                    status=WITHDRAW_STATUS_PROCESSING,
                    reviewed_by=reviewed_by,
                    reviewed_at=datetime.now(),
                )
                .returning(withdraw_table)
            ).mappings().first()
            return claimed

    def _release_hold_on_failure(self, withdraw_id, wallet_id, amount, reviewed_by):
        """Payout never left / failed before chain — return pending to real."""
        wallet = WalletManager(self.user_id)
        with engine.begin() as conn:
            locked = lock_wallet(conn, self.user_id, wallet_id)
            if locked is None:
                self._markFailed(withdraw_id, reviewed_by)
                return
            try:
                balances = wallet.apply_balance_deltas(
                    conn,
                    wallet_id,
                    real_delta=amount,
                    pending_delta=-amount,
                )
                TransactionManager(
                    user_id=self.user_id,
                    wallet_id=wallet_id,
                    balance_type=BALANCE_REAL,
                    transaction_type="withdraw fail release",
                    amount=amount,
                    balance_after=balances["real_balance"],
                    status="Done",
                    reference_id=str(withdraw_id),
                ).postTransaction(conn)
            except Exception:
                log.exception(
                    f"Failed to release withdraw hold | user_id={self.user_id} | "
                    f"withdraw_id={withdraw_id}"
                )
            self._markFailed(withdraw_id, reviewed_by, conn=conn)

    async def approveWithdraw(self, withdraw_id, reviewed_by):
        """
        Funds already reserved in pending_balance at create time.
        Flow: claim → send_payout → clear pending (do NOT debit real again).
        """
        ensure_wallet_schema()
        withdraw = self.getWithdraw(withdraw_id)

        if withdraw is None or withdraw["user_id"] != self.user_id:
            return {"ok": False, "error": "Withdraw not found"}

        if withdraw["status"] != WITHDRAW_STATUS_PENDING:
            return {"ok": False, "error": "Withdraw is not pending"}

        claimed = self._claimPendingWithdraw(withdraw_id, reviewed_by)
        if claimed is None:
            return {"ok": False, "error": "Withdraw is not pending"}

        wallet_id = claimed["wallet_id"]
        amount_usd = float(claimed["amount"])
        coin = claimed["coin"]
        wallet = WalletManager(self.user_id)

        # Hold must cover the payout (real was already reduced at create).
        with engine.begin() as conn:
            locked = lock_wallet(conn, self.user_id, wallet_id)
            if locked is None or float(locked.get("pending_balance") or 0) < amount_usd:
                self._markFailed(withdraw_id, reviewed_by, conn=conn)
                return {"ok": False, "error": "Insufficient pending hold"}

        try:
            crypto_amount, convert_rate = usd_to_crypto(coin, amount_usd)
        except Exception as exc:
            self._release_hold_on_failure(withdraw_id, wallet_id, amount_usd, reviewed_by)
            log.exception(
                f"Withdraw FX conversion failed | user_id={self.user_id} | "
                f"withdraw_id={withdraw_id} | coin={coin} | usd={amount_usd}"
            )
            return {"ok": False, "error": str(exc), "status": WITHDRAW_STATUS_FAILED}

        client = BlockBeeClient()

        try:
            payout = await client.send_payout(coin, claimed["address"], crypto_amount)
        except Exception as exc:
            self._release_hold_on_failure(withdraw_id, wallet_id, amount_usd, reviewed_by)
            log.exception(
                f"Withdraw approval failed at BlockBee | user_id={self.user_id} | "
                f"withdraw_id={withdraw_id} | usd={amount_usd} | crypto={crypto_amount} | "
                f"convert_rate={convert_rate}"
            )
            return {"ok": False, "error": str(exc), "status": WITHDRAW_STATUS_FAILED}

        with engine.begin() as conn:
            locked = lock_wallet(conn, self.user_id, wallet_id)
            if locked is None:
                # On-chain paid but wallet missing — ops reconcile; do not invent balance.
                log.error(
                    f"Withdraw paid on-chain but wallet missing | user_id={self.user_id} | "
                    f"withdraw_id={withdraw_id}"
                )
                self._markFailed(withdraw_id, reviewed_by, conn=conn)
                return {"ok": False, "error": "Wallet not found after payout"}

            try:
                balances = wallet.apply_balance_deltas(
                    conn, wallet_id, pending_delta=-amount_usd
                )
            except Exception:
                # Funds already on-chain; pending clear failed — mark for ops.
                log.exception(
                    f"Withdraw paid on-chain but pending clear failed | "
                    f"user_id={self.user_id} | withdraw_id={withdraw_id}"
                )
                conn.execute(
                    sa.update(withdraw_table)
                    .where(withdraw_table.c.id == withdraw_id)
                    .values(
                        status=WITHDRAW_STATUS_FAILED,
                        reviewed_by=reviewed_by,
                        reviewed_at=datetime.now(),
                        blockbee_request_id=payout.get("request_id"),
                        blockbee_payout_id=payout.get("payout_id"),
                        txid=payout.get("txid") or None,
                    )
                )
                return {"ok": False, "error": "Pending clear failed after payout"}

            transaction_id = TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_PENDING,
                transaction_type="withdraw",
                amount=-amount_usd,
                balance_after=balances["pending_balance"],
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
            f"transaction_id={transaction_id} | txid={payout.get('txid')} | "
            f"usd={amount_usd} | crypto={crypto_amount} | convert_rate={convert_rate}"
        )
        return {
            "ok": True,
            "withdraw_id": withdraw_id,
            "status": WITHDRAW_STATUS_COMPLETED,
            "transaction_id": transaction_id,
            "txid": payout.get("txid"),
        }

    def _markFailed(self, withdraw_id, reviewed_by, conn=None):
        def _run(c):
            c.execute(
                sa.update(withdraw_table)
                .where(withdraw_table.c.id == withdraw_id)
                .values(
                    status=WITHDRAW_STATUS_FAILED,
                    reviewed_by=reviewed_by,
                    reviewed_at=datetime.now(),
                )
            )

        if conn is not None:
            _run(conn)
            return
        with engine.begin() as new_conn:
            _run(new_conn)
