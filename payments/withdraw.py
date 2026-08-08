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
from payments.deposit import normalize_blockbee_ticker
from payments.convert import usd_to_crypto
from config import WITHDRAW_MIN_USD, WITHDRAW_CONFIRMATION_TTL_MINUTES
import hashlib
import hmac
import secrets
import sqlalchemy as sa
from datetime import datetime, timedelta
from log_manager import log

WITHDRAW_STATUS_PENDING = "PENDING"
WITHDRAW_STATUS_PROCESSING = "PROCESSING"
WITHDRAW_STATUS_COMPLETED = "COMPLETED"
WITHDRAW_STATUS_REJECTED = "REJECTED"
WITHDRAW_STATUS_FAILED = "FAILED"

# Step-up confirmation states (independent of the payout status machine above).
CONFIRM_UNCONFIRMED = "unconfirmed"
CONFIRM_CONFIRMED = "confirmed"
CONFIRM_CANCELLED = "cancelled"


def _confirmation_payload_hash(user_id, withdraw_id, amount, coin, address) -> str:
    """Bind the confirmation to (user, withdrawal id, amount, coin, address).

    If any of those fields were ever mutated the recomputed hash would differ and
    confirmation is refused ("invalidated if the withdrawal changes").
    """
    canonical = f"{int(user_id)}|{int(withdraw_id)}|{float(amount):.8f}|{coin}|{address}"
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


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

        # Freeze the crypto payout amount + FX rate at request time. The payout is
        # made by an admin by hand (off-system), so the player is promised exactly
        # this crypto amount regardless of later rate moves — FX risk sits with the
        # house. Done before the wallet lock so the Binance call never holds the row.
        # Best-effort: if the rate is momentarily unavailable we still let the request
        # through (admin computes manually); columns stay NULL.
        crypto_amount = None
        convert_rate = None
        try:
            crypto_amount, convert_rate = usd_to_crypto(coin, amount)
        except Exception:
            log.exception(
                f"Withdraw freeze rate unavailable | user_id={self.user_id} | "
                f"coin={coin} | usd={amount}"
            )

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

            # Step-up: withdrawal starts PENDING but security-UNCONFIRMED. It is not
            # eligible for admin approval until the user confirms from Telegram.
            confirm_token = secrets.token_urlsafe(24)
            confirm_expires = datetime.now() + timedelta(
                minutes=WITHDRAW_CONFIRMATION_TTL_MINUTES
            )

            insert_values = dict(
                user_id=self.user_id,
                wallet_id=wallet_id,
                amount=amount,
                coin=coin,
                address=address,
                status=WITHDRAW_STATUS_PENDING,
                created_at=datetime.now(),
            )
            # Persist the frozen payout only when the columns exist (added in DB).
            if "crypto_amount" in withdraw_table.c:
                insert_values["crypto_amount"] = crypto_amount
            if "convert_rate" in withdraw_table.c:
                insert_values["convert_rate"] = convert_rate
            if "confirmation_status" in withdraw_table.c:
                insert_values["confirmation_status"] = CONFIRM_UNCONFIRMED
            if "confirmation_token" in withdraw_table.c:
                insert_values["confirmation_token"] = confirm_token
            if "confirmation_expires_at" in withdraw_table.c:
                insert_values["confirmation_expires_at"] = confirm_expires

            try:
                withdraw_id = conn.execute(
                    sa.insert(withdraw_table)
                    .values(**insert_values)
                    .returning(withdraw_table.c.id)
                ).scalar_one()
            except Exception:
                # Unique partial index race — surface cleanly.
                raise ValueError("Sorry. You already have a pending withdrawal") from None

            # Bind the confirmation to the concrete withdrawal id + amount/coin/address.
            if "confirmation_payload_hash" in withdraw_table.c:
                conn.execute(
                    sa.update(withdraw_table)
                    .where(withdraw_table.c.id == withdraw_id)
                    .values(
                        confirmation_payload_hash=_confirmation_payload_hash(
                            self.user_id, withdraw_id, amount, coin, address
                        )
                    )
                )

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
                f"frozen_crypto={crypto_amount} | "
                f"convert_rate={convert_rate} | "
                f"pending={balances['pending_balance']}"
            )
            return withdraw_id

    def confirmWithdraw(self, withdraw_id, token):
        """User step-up confirmation from Telegram.

        Atomic, single-use, time-limited and non-replayable. The clicking Telegram
        user is resolved to ``self.user_id`` by the caller, and every guard below is
        also encoded in the final conditional UPDATE so concurrent clicks cannot both
        win. On success the token is cleared (no replay) and the row becomes eligible
        for admin approval.

        Returns a dict with an ``ok`` flag and a machine-readable ``error`` on failure.
        """
        if "confirmation_status" not in withdraw_table.c:
            # Column-less legacy DB — nothing to confirm; treat as already eligible.
            return {"ok": True, "withdraw_id": withdraw_id, "status": WITHDRAW_STATUS_PENDING}

        token = (token or "").strip()
        if not token:
            return {"ok": False, "error": "invalid"}

        now = datetime.now()
        with engine.begin() as conn:
            row = conn.execute(
                sa.select(withdraw_table).where(
                    withdraw_table.c.id == withdraw_id,
                    withdraw_table.c.user_id == self.user_id,
                )
            ).mappings().first()

            if row is None:
                # Either wrong id or a different user — never reveal which.
                return {"ok": False, "error": "not_found"}
            if row["status"] != WITHDRAW_STATUS_PENDING:
                return {"ok": False, "error": "not_pending"}
            if row.get("confirmation_status") == CONFIRM_CONFIRMED:
                return {"ok": False, "error": "already_confirmed"}
            if row.get("confirmation_status") != CONFIRM_UNCONFIRMED:
                return {"ok": False, "error": "invalid"}

            stored_token = row.get("confirmation_token") or ""
            if not stored_token or not hmac.compare_digest(stored_token, token):
                return {"ok": False, "error": "invalid"}

            expires_at = row.get("confirmation_expires_at")
            if expires_at is not None and now > expires_at:
                return {"ok": False, "error": "expired"}

            expected_hash = _confirmation_payload_hash(
                self.user_id, withdraw_id, row["amount"], row["coin"], row["address"]
            )
            stored_hash = row.get("confirmation_payload_hash")
            if stored_hash is not None and not hmac.compare_digest(
                str(stored_hash), expected_hash
            ):
                return {"ok": False, "error": "changed"}

            claim_where = [
                withdraw_table.c.id == withdraw_id,
                withdraw_table.c.user_id == self.user_id,
                withdraw_table.c.status == WITHDRAW_STATUS_PENDING,
                withdraw_table.c.confirmation_status == CONFIRM_UNCONFIRMED,
                withdraw_table.c.confirmation_token == token,
            ]
            if "confirmation_expires_at" in withdraw_table.c:
                # Belt-and-suspenders: also enforce non-expiry atomically.
                claim_where.append(
                    sa.or_(
                        withdraw_table.c.confirmation_expires_at.is_(None),
                        withdraw_table.c.confirmation_expires_at >= now,
                    )
                )

            claimed = conn.execute(
                sa.update(withdraw_table)
                .where(*claim_where)
                .values(
                    confirmation_status=CONFIRM_CONFIRMED,
                    confirmed_at=now,
                    confirmation_token=None,
                )
                .returning(withdraw_table.c.id)
            ).scalar_one_or_none()

            if claimed is None:
                # Lost a concurrent race — someone/something already handled it.
                return {"ok": False, "error": "already_confirmed"}

        log.info(
            f"Withdraw confirmed by user | user_id={self.user_id} | withdraw_id={withdraw_id}"
        )
        return {"ok": True, "withdraw_id": withdraw_id, "status": WITHDRAW_STATUS_PENDING}

    def cancelWithdrawByUser(self, withdraw_id, reason="user_cancelled"):
        """Release the hold and reject a still-PENDING withdrawal at the user's request.

        Reuses the same balance-release accounting as an admin reject so the wallet
        invariants and one-active-withdrawal constraint stay intact. Also used to
        auto-release funds when the confirmation message could not be delivered.
        """
        ensure_wallet_schema()
        withdraw = self.getWithdraw(withdraw_id)
        if withdraw is None or withdraw["user_id"] != self.user_id:
            return {"ok": False, "error": "not_found"}
        if withdraw["status"] != WITHDRAW_STATUS_PENDING:
            return {"ok": False, "error": "not_pending"}

        amount = float(withdraw["amount"])
        wallet_id = withdraw["wallet_id"]
        wallet = WalletManager(self.user_id)

        confirm_values = {}
        if "confirmation_status" in withdraw_table.c:
            confirm_values["confirmation_status"] = CONFIRM_CANCELLED
        if "confirmation_token" in withdraw_table.c:
            confirm_values["confirmation_token"] = None

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
                    reviewed_at=datetime.now(),
                    reject_reason=reason,
                    **confirm_values,
                )
                .returning(withdraw_table.c.id)
            ).scalar_one_or_none()
            if claimed is None:
                return {"ok": False, "error": "not_pending"}

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
                transaction_type="withdraw cancel release",
                amount=amount,
                balance_after=balances["real_balance"],
                status="Done",
                reference_id=str(withdraw_id),
            ).postTransaction(conn)

        log.info(
            f"Withdraw cancelled by user | user_id={self.user_id} | "
            f"withdraw_id={withdraw_id} | reason={reason}"
        )
        return {"ok": True, "withdraw_id": withdraw_id, "status": WITHDRAW_STATUS_REJECTED}

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

    async def approveWithdraw(self, withdraw_id, reviewed_by):
        """
        Manual settlement ("Завершено"). The admin has already sent the frozen
        crypto amount to the player's address by hand (off-system). This only does
        the internal accounting — there is NO PSP / BlockBee call here:

          • clears the pending hold (pending -= amount; real was reduced at create),
          • records the ledger entry,
          • marks the row COMPLETED.

        Funds were reserved in pending_balance at request time, so approval never
        debits REAL again.
        """
        ensure_wallet_schema()
        withdraw = self.getWithdraw(withdraw_id)

        if withdraw is None or withdraw["user_id"] != self.user_id:
            return {"ok": False, "error": "Withdraw not found"}

        if withdraw["status"] != WITHDRAW_STATUS_PENDING:
            return {"ok": False, "error": "Withdraw is not pending"}

        # Step-up gate: never pay out a withdrawal the user has not confirmed from
        # Telegram. This blocks a session hijacker from draining funds even after a
        # PENDING row exists, because approval requires the account owner's device.
        if "confirmation_status" in withdraw_table.c:
            if withdraw.get("confirmation_status") != CONFIRM_CONFIRMED:
                return {"ok": False, "error": "Withdraw not confirmed by user"}

        wallet_id = withdraw["wallet_id"]
        amount_usd = float(withdraw["amount"])
        wallet = WalletManager(self.user_id)

        # Extra WHERE guard so the confirmation gate is also enforced atomically.
        confirm_guard = []
        if "confirmation_status" in withdraw_table.c:
            confirm_guard.append(
                withdraw_table.c.confirmation_status == CONFIRM_CONFIRMED
            )

        with engine.begin() as conn:
            locked = lock_wallet(conn, self.user_id, wallet_id)
            if locked is None:
                return {"ok": False, "error": "Wallet not found"}
            if float(locked.get("pending_balance") or 0) < amount_usd:
                return {"ok": False, "error": "Insufficient pending hold"}

            # Claim the row (PENDING → COMPLETED) under the wallet lock so a
            # double-click / second admin loses the race and cannot settle twice.
            claimed = conn.execute(
                sa.update(withdraw_table)
                .where(
                    withdraw_table.c.id == withdraw_id,
                    withdraw_table.c.user_id == self.user_id,
                    withdraw_table.c.status == WITHDRAW_STATUS_PENDING,
                    *confirm_guard,
                )
                .values(
                    status=WITHDRAW_STATUS_COMPLETED,
                    reviewed_by=reviewed_by,
                    reviewed_at=datetime.now(),
                )
                .returning(withdraw_table)
            ).mappings().first()
            if claimed is None:
                return {"ok": False, "error": "Withdraw is not pending"}

            balances = wallet.apply_balance_deltas(
                conn, wallet_id, pending_delta=-amount_usd
            )

            transaction_id = TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_PENDING,
                transaction_type="withdraw",
                amount=-amount_usd,
                balance_after=balances["pending_balance"],
                status="Completed",
                reference_id=str(withdraw_id),
            ).postTransaction(conn)

            conn.execute(
                sa.update(withdraw_table)
                .where(withdraw_table.c.id == withdraw_id)
                .values(transaction_id=transaction_id)
            )

        log.info(
            f"Withdraw settled manually | user_id={self.user_id} | withdraw_id={withdraw_id} | "
            f"transaction_id={transaction_id} | reviewed_by={reviewed_by} | "
            f"usd={amount_usd} | frozen_crypto={claimed.get('crypto_amount')} | "
            f"pending={balances['pending_balance']}"
        )
        return {
            "ok": True,
            "withdraw_id": withdraw_id,
            "status": WITHDRAW_STATUS_COMPLETED,
            "transaction_id": transaction_id,
        }
