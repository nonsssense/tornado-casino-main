from database.db_config import engine, wallet_table
import sqlalchemy as sa
from datetime import datetime
from log_manager import log
from exceptions import notEnoughBalance

BALANCE_REAL = "REAL"
BALANCE_BONUS = "BONUS"
BALANCE_PENDING = "PENDING"
BALANCE_MIXED = "MIXED"

_wallet_schema_ready = False


def allocate_cash_first_stake(real_balance, bonus_balance, stake):
    """
    Cash-first split for a stake S (Welcome Bonus MVP rulebook).
    Returns (real_part, bonus_part) or raises notEnoughBalance.
    """
    stake = float(stake)
    real_balance = float(real_balance or 0)
    bonus_balance = float(bonus_balance or 0)
    if stake <= 0:
        raise ValueError("Stake must be greater than zero")
    if real_balance + bonus_balance + 1e-12 < stake:
        raise notEnoughBalance()
    real_part = min(stake, real_balance)
    bonus_part = stake - real_part
    if bonus_part > bonus_balance + 1e-12:
        raise notEnoughBalance()
    return round(real_part, 8), round(bonus_part, 8)


def split_payout_pro_rata(payout, real_part, bonus_part):
    """Distribute payout P across stake sources proportionally."""
    payout = float(payout or 0)
    real_part = float(real_part or 0)
    bonus_part = float(bonus_part or 0)
    total = real_part + bonus_part
    if payout <= 0 or total <= 0:
        return 0.0, 0.0
    real_credit = payout * (real_part / total)
    bonus_credit = payout * (bonus_part / total)
    return round(real_credit, 8), round(bonus_credit, 8)


def balance_type_for_parts(real_part, bonus_part):
    real_part = float(real_part or 0)
    bonus_part = float(bonus_part or 0)
    if real_part > 0 and bonus_part > 0:
        return BALANCE_MIXED
    if bonus_part > 0:
        return BALANCE_BONUS
    return BALANCE_REAL


def ensure_wallet_schema():
    """Add pending_balance + non-negative CHECKs (idempotent)."""
    global _wallet_schema_ready
    if _wallet_schema_ready:
        return
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "ALTER TABLE wallet "
                "ADD COLUMN IF NOT EXISTS pending_balance NUMERIC NOT NULL DEFAULT 0"
            )
        )
        # Backfill nulls if column existed without default.
        conn.execute(
            sa.text(
                "UPDATE wallet SET pending_balance = 0 WHERE pending_balance IS NULL"
            )
        )
        for name, expr in (
            ("wallet_real_balance_nonneg", "real_balance >= 0"),
            ("wallet_bonus_balance_nonneg", "bonus_balance >= 0"),
            ("wallet_pending_balance_nonneg", "pending_balance >= 0"),
        ):
            conn.execute(
                sa.text(
                    f"""
                    DO $$ BEGIN
                        ALTER TABLE wallet ADD CONSTRAINT {name} CHECK ({expr});
                    EXCEPTION WHEN duplicate_object THEN NULL;
                    END $$;
                    """
                )
            )
        conn.execute(
            sa.text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS withdraws_one_active_per_user
                ON withdraws (user_id)
                WHERE status IN ('PENDING', 'PROCESSING')
                """
            )
        )
    _wallet_schema_ready = True
    # Refresh reflected table so pending_balance is visible.
    try:
        wallet_table.append_column(
            sa.Column("pending_balance", sa.Numeric, nullable=False, server_default="0"),
            replace_existing=True,
        )
    except Exception:
        pass
    log.info("Wallet schema ensured (pending_balance + CHECKs + withdraw unique)")


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


def lock_wallet(conn, user_id, wallet_id):
    """SELECT wallet … FOR UPDATE. Returns wallet mapping or None."""
    ensure_wallet_schema()
    return (
        conn.execute(
            sa.select(wallet_table)
            .where(
                wallet_table.c.id == wallet_id,
                wallet_table.c.user_id == user_id,
            )
            .with_for_update()
        )
        .mappings()
        .first()
    )


class WalletManager:
    def __init__(self, user_id):
        self.user_id = user_id

    def checkWalletStatus(self, conn=None):
        get_stmt = sa.select(wallet_table).where(wallet_table.c.user_id == self.user_id)

        if conn is not None:
            result = conn.execute(get_stmt)
            wallet = result.fetchone()

            if wallet is None:
                log.warning(f"Wallet record not found | user_id={self.user_id}")
                return None

            return wallet.id
        else:
            with engine.begin() as new_conn:
                result = new_conn.execute(get_stmt)
                wallet = result.fetchone()

                if wallet is None:
                    log.warning(f"Wallet record not found | user_id={self.user_id}")
                    return None

                return wallet.id

    def createWallet(self):
        ensure_wallet_schema()
        with engine.begin() as conn:
            post_stmt = sa.insert(wallet_table).values(
                user_id=self.user_id,
                type="real",
                real_balance=0,
                bonus_balance=0,
                pending_balance=0,
                created_at=datetime.now(),
            )
            try:
                conn.execute(post_stmt)
            except Exception:
                # UNIQUE(user_id) — concurrent create; reuse existing.
                existing = self.checkWalletStatus(conn=conn)
                if existing is None:
                    raise
                log.info(
                    f"Wallet INSERT race resolved | user_id={self.user_id} | "
                    f"wallet_id={existing}"
                )
                return
            log.info(f"Wallet INSERT completed | user_id={self.user_id}")

    def getRealBalance(self, wallet_id, conn=None):
        get_stmt = sa.select(wallet_table.c.real_balance).where(
            wallet_table.c.id == wallet_id
        )

        if conn is not None:
            balance = conn.execute(get_stmt).scalar_one_or_none()
        else:
            with engine.begin() as new_conn:
                balance = new_conn.execute(get_stmt).scalar_one_or_none()

        if balance is None:
            log.warning(
                f"Real balance not found | user_id={self.user_id} | wallet_id={wallet_id}"
            )
            return 0

        return float(balance)

    def getBonusBalance(self, wallet_id, conn=None):
        get_stmt = sa.select(wallet_table.c.bonus_balance).where(
            wallet_table.c.id == wallet_id
        )

        if conn is not None:
            balance = conn.execute(get_stmt).scalar_one_or_none()
        else:
            with engine.begin() as new_conn:
                balance = new_conn.execute(get_stmt).scalar_one_or_none()

        if balance is None:
            log.warning(
                f"Bonus balance not found | user_id={self.user_id} | wallet_id={wallet_id}"
            )
            return 0

        return float(balance)

    def getPendingBalance(self, wallet_id, conn=None):
        ensure_wallet_schema()
        get_stmt = sa.select(wallet_table.c.pending_balance).where(
            wallet_table.c.id == wallet_id
        )
        if conn is not None:
            balance = conn.execute(get_stmt).scalar_one_or_none()
        else:
            with engine.begin() as new_conn:
                balance = new_conn.execute(get_stmt).scalar_one_or_none()

        if balance is None:
            log.warning(
                f"Pending balance not found | user_id={self.user_id} | wallet_id={wallet_id}"
            )
            return 0

        return float(balance)

    def getBalances(self, wallet_id=None, conn=None):
        """
        Read real / bonus / pending in one SELECT.

        Ensures the wallet row exists (same as ensureWallet) then returns all
        balances from a single round-trip when the row already exists.
        """
        ensure_wallet_schema()

        def _row_to_balances(row, fallback_id=None):
            if row is None:
                log.warning(
                    f"Wallet balances not found | user_id={self.user_id} | "
                    f"wallet_id={fallback_id}"
                )
                return {
                    "wallet_id": fallback_id,
                    "real_balance": 0.0,
                    "bonus_balance": 0.0,
                    "pending_balance": 0.0,
                }
            return {
                "wallet_id": int(row["id"]),
                "real_balance": float(row["real_balance"] or 0),
                "bonus_balance": float(row["bonus_balance"] or 0),
                "pending_balance": float(row.get("pending_balance") or 0),
            }

        def _run(connection):
            columns = (
                wallet_table.c.id,
                wallet_table.c.real_balance,
                wallet_table.c.bonus_balance,
                wallet_table.c.pending_balance,
            )
            if wallet_id is not None:
                row = connection.execute(
                    sa.select(*columns).where(wallet_table.c.id == int(wallet_id))
                ).mappings().first()
                return _row_to_balances(row, fallback_id=int(wallet_id))

            row = connection.execute(
                sa.select(*columns).where(wallet_table.c.user_id == self.user_id)
            ).mappings().first()
            if row is not None:
                return _row_to_balances(row)

            try:
                connection.execute(
                    sa.insert(wallet_table).values(
                        user_id=self.user_id,
                        type="real",
                        real_balance=0,
                        bonus_balance=0,
                        pending_balance=0,
                        created_at=datetime.now(),
                    )
                )
                log.info(f"Wallet INSERT completed | user_id={self.user_id}")
            except Exception:
                row = connection.execute(
                    sa.select(*columns).where(wallet_table.c.user_id == self.user_id)
                ).mappings().first()
                if row is None:
                    raise
                log.info(
                    f"Wallet INSERT race resolved | user_id={self.user_id} | "
                    f"wallet_id={row['id']}"
                )
                return _row_to_balances(row)

            row = connection.execute(
                sa.select(*columns).where(wallet_table.c.user_id == self.user_id)
            ).mappings().first()
            if row is None:
                raise Exception("Failed to create wallet")
            return _row_to_balances(row)

        if conn is not None:
            return _run(conn)

        with engine.begin() as new_conn:
            return _run(new_conn)

    def apply_balance_deltas(
        self,
        conn,
        wallet_id,
        *,
        real_delta=0.0,
        bonus_delta=0.0,
        pending_delta=0.0,
    ):
        """
        Atomic relative wallet mutation. Caller MUST hold wallet FOR UPDATE.

        Single UPDATE for all fields. Fails (raises notEnoughBalance) if any
        resulting balance would be negative — race-safe even under concurrency
        because the row lock serializes writers and the WHERE clause rejects
        overdrafts.
        """
        ensure_wallet_schema()
        real_delta = float(real_delta)
        bonus_delta = float(bonus_delta)
        pending_delta = float(pending_delta)

        if real_delta == 0 and bonus_delta == 0 and pending_delta == 0:
            locked = lock_wallet(conn, self.user_id, wallet_id)
            if locked is None:
                raise RuntimeError(f"Wallet not found | user_id={self.user_id}")
            return {
                "real_balance": float(locked["real_balance"]),
                "bonus_balance": float(locked["bonus_balance"]),
                "pending_balance": float(locked.get("pending_balance") or 0),
            }

        row = conn.execute(
            sa.text(
                """
                UPDATE wallet
                SET
                    real_balance = real_balance + :real_delta,
                    bonus_balance = bonus_balance + :bonus_delta,
                    pending_balance = pending_balance + :pending_delta
                WHERE id = :wallet_id
                  AND user_id = :user_id
                  AND real_balance + :real_delta >= 0
                  AND bonus_balance + :bonus_delta >= 0
                  AND pending_balance + :pending_delta >= 0
                RETURNING real_balance, bonus_balance, pending_balance
                """
            ),
            {
                "wallet_id": wallet_id,
                "user_id": self.user_id,
                "real_delta": real_delta,
                "bonus_delta": bonus_delta,
                "pending_delta": pending_delta,
            },
        ).mappings().first()

        if row is None:
            log.warning(
                f"Wallet delta rejected | user_id={self.user_id} | wallet_id={wallet_id} | "
                f"real_delta={real_delta} | bonus_delta={bonus_delta} | "
                f"pending_delta={pending_delta}"
            )
            raise notEnoughBalance()

        log.info(
            f"Wallet delta applied | user_id={self.user_id} | wallet_id={wallet_id} | "
            f"real_delta={real_delta} | bonus_delta={bonus_delta} | "
            f"pending_delta={pending_delta} | "
            f"real={row['real_balance']} | bonus={row['bonus_balance']} | "
            f"pending={row['pending_balance']}"
        )
        return {
            "real_balance": float(row["real_balance"]),
            "bonus_balance": float(row["bonus_balance"]),
            "pending_balance": float(row["pending_balance"]),
        }

    def updateRealBalance(self, conn, balance_after):
        """Deprecated absolute SET — prefer apply_balance_deltas. Kept for tests."""
        ensure_wallet_schema()
        current = conn.execute(
            sa.select(wallet_table.c.real_balance).where(
                wallet_table.c.user_id == self.user_id
            )
        ).scalar_one()
        delta = float(balance_after) - float(current)
        wallet_id = conn.execute(
            sa.select(wallet_table.c.id).where(wallet_table.c.user_id == self.user_id)
        ).scalar_one()
        self.apply_balance_deltas(conn, wallet_id, real_delta=delta)

    def updateBonusBalance(self, conn, balance_after):
        """Deprecated absolute SET — prefer apply_balance_deltas."""
        ensure_wallet_schema()
        current = conn.execute(
            sa.select(wallet_table.c.bonus_balance).where(
                wallet_table.c.user_id == self.user_id
            )
        ).scalar_one()
        delta = float(balance_after) - float(current)
        wallet_id = conn.execute(
            sa.select(wallet_table.c.id).where(wallet_table.c.user_id == self.user_id)
        ).scalar_one()
        self.apply_balance_deltas(conn, wallet_id, bonus_delta=delta)

    def updatePendingBalance(self, amount, conn):
        """Deprecated relative helper — prefer apply_balance_deltas."""
        ensure_wallet_schema()
        wallet_id = conn.execute(
            sa.select(wallet_table.c.id).where(wallet_table.c.user_id == self.user_id)
        ).scalar_one()
        self.apply_balance_deltas(conn, wallet_id, pending_delta=float(amount))

    def ensureWallet(self):
        ensure_wallet_schema()
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
        elif balance_type == BALANCE_PENDING:
            balance = self.getPendingBalance(wallet_id, conn=conn)
        else:
            balance = self.getBonusBalance(wallet_id, conn=conn)

        if balance < amount:
            log.warning(
                f"Not enough balance | user_id={self.user_id} | wallet_id={wallet_id} | "
                f"balance_type={balance_type} | balance={balance} | required_amount={amount}"
            )
            return False

        return True
