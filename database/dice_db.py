"""SQL layer for the Dice game table.

Schema owned externally — matching the project Dice DDL.
Column name `multipier` matches the draft schema typo (same pattern as Crash).
"""

from datetime import datetime

import sqlalchemy as sa

from database.db_config import engine, metadata, users_table, wallet_table
from database.wallet import lock_wallet  # canonical FOR UPDATE helper
from games.provably_fair import ProvablyFair
from log_manager import log

dice_table = sa.Table(
    "dice",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("user_id", sa.Integer, nullable=False),
    sa.Column("bet_id", sa.Integer, nullable=False),
    sa.Column("client_seed_used", sa.String(255), nullable=False),
    sa.Column("hash_server_seed_used", sa.String(255), nullable=False),
    sa.Column("nonce_used", sa.Integer, nullable=False),
    sa.Column("roll_result", sa.Integer, nullable=False),
    sa.Column("target", sa.Integer, nullable=False),
    sa.Column("is_over", sa.Boolean, nullable=False),
    sa.Column("multipier", sa.Numeric, nullable=False),
    sa.Column("payout", sa.Numeric, nullable=False),
    sa.Column("created_at", sa.DateTime, nullable=False),
    extend_existing=True,
)

_schema_ready = False


def ensure_dice_schema():
    """Create `dice` and ensure `users.server_seed` exists (idempotent)."""
    global _schema_ready
    if _schema_ready:
        return

    with engine.begin() as conn:
        conn.execute(
            sa.text(
                """
                CREATE TABLE IF NOT EXISTS dice (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    bet_id INTEGER NOT NULL,
                    client_seed_used VARCHAR(255) NOT NULL,
                    hash_server_seed_used VARCHAR(255) NOT NULL,
                    nonce_used INTEGER NOT NULL,
                    roll_result INTEGER NOT NULL,
                    target INTEGER NOT NULL,
                    is_over BOOLEAN NOT NULL,
                    multipier NUMERIC NOT NULL,
                    payout NUMERIC NOT NULL,
                    created_at TIMESTAMP NOT NULL
                )
                """
            )
        )
        conn.execute(
            sa.text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS server_seed VARCHAR(255)"
            )
        )

    _schema_ready = True
    log.info("Dice schema ensured (dice table + users.server_seed)")


def lock_user_fairness(conn, user_id):
    """
    Lock the user row and return Provably Fair material.

    Uses existing ProvablyFair seed/hash helpers only — generation unchanged.
    Persists server_seed when missing so HMAC can run.
    """
    # server_seed may be absent from reflected columns until process restart
    # after ALTER; select listed columns safely via text when needed.
    row = (
        conn.execute(
            sa.select(users_table).where(users_table.c.id == user_id).with_for_update()
        )
        .mappings()
        .first()
    )
    if row is None:
        raise RuntimeError(f"User not found | user_id={user_id}")

    data = dict(row)

    # Prefer ORM column when reflected; fall back to raw SELECT after ALTER.
    server_seed = data.get("server_seed")
    if "server_seed" not in data:
        server_seed = conn.execute(
            sa.text("SELECT server_seed FROM users WHERE id = :id"),
            {"id": user_id},
        ).scalar_one_or_none()

    client_seed = data.get("client_seed")
    hash_server_seed = data.get("hash_server_seed")
    nonce = int(data.get("nonce") or 0)

    if not client_seed:
        client_seed = ProvablyFair.generateClientSeed()
        conn.execute(
            sa.update(users_table)
            .where(users_table.c.id == user_id)
            .values(client_seed=client_seed)
        )

    if not server_seed:
        server_seed = ProvablyFair.generateServerSeed()
        hash_server_seed = ProvablyFair.getServerSeedHash(server_seed)
        conn.execute(
            sa.text(
                "UPDATE users SET server_seed = :server_seed, "
                "hash_server_seed = :hash_server_seed WHERE id = :id"
            ),
            {
                "server_seed": server_seed,
                "hash_server_seed": hash_server_seed,
                "id": user_id,
            },
        )
        log.info(f"User server_seed persisted | user_id={user_id}")

    if not hash_server_seed:
        hash_server_seed = ProvablyFair.getServerSeedHash(server_seed)
        conn.execute(
            sa.update(users_table)
            .where(users_table.c.id == user_id)
            .values(hash_server_seed=hash_server_seed)
        )

    return {
        "server_seed": server_seed,
        "client_seed": client_seed,
        "hash_server_seed": hash_server_seed,
        "nonce": nonce,
    }


def increment_nonce(conn, user_id):
    """Increment users.nonce by 1 (must run after successful settle)."""
    increment_nonce_by(conn, user_id, 1)


def increment_nonce_by(conn, user_id, count):
    """Increment users.nonce by a committed contiguous result count."""
    if count < 1:
        raise ValueError("Nonce increment count must be positive")
    conn.execute(
        sa.update(users_table)
        .where(users_table.c.id == user_id)
        .values(nonce=users_table.c.nonce + count)
    )
    log.info(f"User nonce incremented | user_id={user_id} | count={count}")


def insert_dice_round(
    conn,
    *,
    user_id,
    bet_id,
    client_seed_used,
    hash_server_seed_used,
    nonce_used,
    roll_result,
    target,
    is_over,
    multipier,
    payout,
):
    stmt = (
        sa.insert(dice_table)
        .values(
            user_id=user_id,
            bet_id=bet_id,
            client_seed_used=client_seed_used,
            hash_server_seed_used=hash_server_seed_used,
            nonce_used=nonce_used,
            roll_result=roll_result,
            target=target,
            is_over=is_over,
            multipier=multipier,
            payout=payout,
            created_at=datetime.now(),
        )
        .returning(dice_table.c.id)
    )
    dice_id = conn.execute(stmt).scalar_one()
    log.info(
        f"Dice INSERT completed | user_id={user_id} | dice_id={dice_id} | "
        f"bet_id={bet_id} | roll={roll_result} | nonce_used={nonce_used}"
    )
    return dice_id
