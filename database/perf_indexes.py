"""
Hot-path indexes for auth, wallet history, bonuses, referrals, and deposits.

Idempotent — safe to run on every process start. Only indexes named lookup
patterns that the audit identified as frequent sequential-scan risks.
"""

from database.db_config import engine
import sqlalchemy as sa
from log_manager import log

_indexes_ready = False

# (index_name, DDL) — each CREATE INDEX IF NOT EXISTS
_HOT_PATH_INDEXES = (
    # Auth: every cookie request resolves user via session_token.
    (
        "user_sessions_session_token_idx",
        """
        CREATE INDEX IF NOT EXISTS user_sessions_session_token_idx
        ON user_sessions (session_token)
        """,
    ),
    # Auth upsert / login by Telegram id.
    (
        "users_tg_id_idx",
        """
        CREATE INDEX IF NOT EXISTS users_tg_id_idx
        ON users (tg_id)
        """,
    ),
    # Wallet history: WHERE user_id ORDER BY id DESC LIMIT n
    (
        "transactions_user_id_id_idx",
        """
        CREATE INDEX IF NOT EXISTS transactions_user_id_id_idx
        ON transactions (user_id, id DESC)
        """,
    ),
    # Bonus catalog / offers / active lists by user + status or source.
    (
        "bonus_instances_user_id_status_idx",
        """
        CREATE INDEX IF NOT EXISTS bonus_instances_user_id_status_idx
        ON bonus_instances (user_id, status)
        """,
    ),
    (
        "bonus_instances_user_id_source_idx",
        """
        CREATE INDEX IF NOT EXISTS bonus_instances_user_id_source_idx
        ON bonus_instances (user_id, source)
        """,
    ),
    # Deposit tier progress + admin filters.
    (
        "deposit_user_id_status_idx",
        """
        CREATE INDEX IF NOT EXISTS deposit_user_id_status_idx
        ON deposit (user_id, status)
        """,
    ),
    # Referral invite counts / commission release & claim.
    (
        "referrals_referrer_id_idx",
        """
        CREATE INDEX IF NOT EXISTS referrals_referrer_id_idx
        ON referrals (referrer_id)
        """,
    ),
    (
        "referral_commissions_referrer_status_available_idx",
        """
        CREATE INDEX IF NOT EXISTS referral_commissions_referrer_status_available_idx
        ON referral_commissions (referrer_id, status, available_at)
        """,
    ),
    # Wallet ensure / balance by user_id (unique already common; index if missing).
    (
        "wallet_user_id_idx",
        """
        CREATE INDEX IF NOT EXISTS wallet_user_id_idx
        ON wallet (user_id)
        """,
    ),
)


def ensure_hot_path_indexes():
    """Create missing hot-path indexes (no-op when already present)."""
    global _indexes_ready
    if _indexes_ready:
        return

    with engine.begin() as conn:
        for name, ddl in _HOT_PATH_INDEXES:
            try:
                conn.execute(sa.text(ddl))
            except Exception:
                # Table may not exist yet in brand-new envs — log and continue.
                log.exception(f"Hot-path index skipped | index={name}")

    _indexes_ready = True
    log.info(
        f"Hot-path indexes ensured | count={len(_HOT_PATH_INDEXES)}"
    )
