"""SQL layer for Crash game tables.

Tables (schema owned externally — do not alter here):
  - crash
  - crash_stats
  - bets (outcome updates only; Bet.createBet still used for INSERT)

Lifecycle:
  place bet  -> INSERT crash_stats (bet_result/result NULL)
  cashout    -> UPDATE crash_stats to Win
  round lose -> UPDATE crash_stats to Lose

Missing crash_stats on settle is a bug — no INSERT fallback.
"""

from datetime import datetime

import sqlalchemy as sa

from database.db_config import bet_table, engine, metadata, users_table
from log_manager import log

crash_table = sa.Table(
    "crash",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("game_seed_used", sa.String(255), nullable=False),
    sa.Column("hash_server_seed_used", sa.String(255), nullable=False),
    sa.Column("nonce_used", sa.Integer, nullable=False),
    sa.Column("multipier_result", sa.Integer, nullable=False),
    sa.Column("instant_crash", sa.Boolean, nullable=False),
    sa.Column("created_at", sa.DateTime, nullable=False),
    extend_existing=True,
)

# If the live DB uses the draft typo name "crash_ststs", change only this.
CRASH_STATS_TABLE_NAME = "crash_stats"

crash_stats_table = sa.Table(
    CRASH_STATS_TABLE_NAME,
    metadata,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("crash_id", sa.Integer, nullable=False),
    sa.Column("user_id", sa.Integer, nullable=False),
    sa.Column("bet_id", sa.Integer, nullable=False),
    sa.Column("bet_result", sa.String),
    sa.Column("result", sa.Integer),
    extend_existing=True,
)


class CrashDatabase:
    """SQL-only access for Crash persistence."""

    @staticmethod
    def insert_crash_round(
        game_seed_used,
        hash_server_seed_used,
        nonce_used,
        multipier_result,
        instant_crash,
        conn=None,
    ):
        """Insert generated round into `crash`. Returns crash id."""

        def _run(connection):
            stmt = (
                sa.insert(crash_table)
                .values(
                    game_seed_used=game_seed_used,
                    hash_server_seed_used=hash_server_seed_used,
                    nonce_used=nonce_used,
                    multipier_result=multipier_result,
                    instant_crash=instant_crash,
                    created_at=datetime.now(),
                )
                .returning(crash_table.c.id)
            )
            crash_id = connection.execute(stmt).scalar_one()
            log.info(
                f"Crash INSERT completed | crash_id={crash_id} | "
                f"multipier={multipier_result} | instant_crash={instant_crash}"
            )
            return crash_id

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    @staticmethod
    def insert_active_bet(crash_id, user_id, bet_id, conn=None):
        """INSERT crash_stats with unresolved outcome (bet_result/result NULL)."""

        def _run(connection):
            stmt = (
                sa.insert(crash_stats_table)
                .values(
                    crash_id=crash_id,
                    user_id=user_id,
                    bet_id=bet_id,
                    bet_result=None,
                    result=None,
                )
                .returning(crash_stats_table.c.id)
            )
            stats_id = connection.execute(stmt).scalar_one()
            log.info(
                f"Crash stats INSERT (active) | stats_id={stats_id} | "
                f"crash_id={crash_id} | user_id={user_id} | bet_id={bet_id}"
            )
            return stats_id

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    @staticmethod
    def cashout_bet(crash_stats_id, profit, conn=None):
        """UPDATE crash_stats to Win. Raises if the pending row is missing."""

        def _run(connection):
            stmt = (
                sa.update(crash_stats_table)
                .where(
                    crash_stats_table.c.id == crash_stats_id,
                    crash_stats_table.c.bet_result.is_(None),
                )
                .values(
                    bet_result="Win",
                    result=int(round(profit)),
                )
            )
            result = connection.execute(stmt)
            if result.rowcount != 1:
                raise RuntimeError(
                    f"crash_stats cashout UPDATE failed | stats_id={crash_stats_id} | "
                    f"rowcount={result.rowcount}"
                )
            log.info(
                f"Crash stats cashout UPDATE | stats_id={crash_stats_id} | profit={profit}"
            )
            return result.rowcount

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    @staticmethod
    def finish_active_bet(crash_stats_id, bet_amount, conn=None):
        """UPDATE crash_stats to Lose. Raises if the pending row is missing."""

        loss = int(round(-abs(bet_amount)))

        def _run(connection):
            stmt = (
                sa.update(crash_stats_table)
                .where(
                    crash_stats_table.c.id == crash_stats_id,
                    crash_stats_table.c.bet_result.is_(None),
                )
                .values(
                    bet_result="Lose",
                    result=loss,
                )
            )
            result = connection.execute(stmt)
            if result.rowcount != 1:
                raise RuntimeError(
                    f"crash_stats finish UPDATE failed | stats_id={crash_stats_id} | "
                    f"rowcount={result.rowcount}"
                )
            log.info(
                f"Crash stats finish UPDATE | stats_id={crash_stats_id} | result={loss}"
            )
            return result.rowcount

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    @staticmethod
    def update_bet_outcome(bet_id, result, profit, win_transaction_id=None, conn=None):
        """UPDATE bets.result / bets.profit (and optional win_transaction_id)."""

        def _run(connection):
            values = {
                "result": result,
                "profit": profit,
            }
            if win_transaction_id is not None:
                values["win_transaction_id"] = win_transaction_id

            stmt = sa.update(bet_table).where(bet_table.c.id == bet_id).values(**values)
            exec_result = connection.execute(stmt)
            if exec_result.rowcount != 1:
                raise RuntimeError(
                    f"bet outcome UPDATE failed | bet_id={bet_id} | "
                    f"rowcount={exec_result.rowcount}"
                )
            log.info(
                f"Bet outcome UPDATE | bet_id={bet_id} | result={result} | profit={profit}"
            )
            return exec_result.rowcount

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    @staticmethod
    def get_recent_multipliers(limit=10, conn=None):
        """Return latest crash multipliers as floats (newest first)."""

        limit = max(1, min(int(limit), 50))

        def _run(connection):
            stmt = (
                sa.select(crash_table.c.multipier_result)
                .order_by(crash_table.c.id.desc())
                .limit(limit)
            )
            rows = connection.execute(stmt).scalars().all()
            # Stored as integer cents of multiplier (e.g. 152 -> 1.52x)
            return [round(int(value) / 100, 2) for value in rows]

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    @staticmethod
    def get_user_display_names(user_ids, conn=None):
        """Map user_id -> telegram username (or first_name fallback)."""

        ids = [int(uid) for uid in user_ids if uid is not None]
        if not ids:
            return {}

        def _run(connection):
            stmt = sa.select(
                users_table.c.id,
                users_table.c.username,
                users_table.c.first_name,
            ).where(users_table.c.id.in_(ids))
            result = {}
            for row in connection.execute(stmt).mappings():
                username = row.get("username")
                first_name = row.get("first_name")
                if username:
                    label = f"@{username}"
                elif first_name:
                    label = first_name
                else:
                    label = f"Player {row['id']}"
                result[int(row["id"])] = label
            return result

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)
