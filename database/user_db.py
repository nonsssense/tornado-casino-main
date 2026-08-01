from database.db_config import engine, users_table
import sqlalchemy as sa
from log_manager import log


def getUserData(user_id, conn=None):
    """
    Load Provably Fair material for a user.

    Returns consistent keys:
      server_seed, hash_server_seed, client_seed, nonce
    Plus alias server_seed_hash (== hash_server_seed) for older callers.
    Does NOT increment nonce — caller owns that after a successful game.
    """
    get_stmt = sa.select(users_table).where(users_table.c.id == user_id)

    if conn is not None:
        row = conn.execute(get_stmt).mappings().first()
    else:
        with engine.begin() as new_conn:
            row = new_conn.execute(get_stmt).mappings().first()

    if row is None:
        log.warning(f"User data not found | user_id={user_id}")
        return None

    data = dict(row)

    server_seed = data.get("server_seed")
    if "server_seed" not in data and conn is not None:
        server_seed = conn.execute(
            sa.text("SELECT server_seed FROM users WHERE id = :id"),
            {"id": user_id},
        ).scalar_one_or_none()
    elif "server_seed" not in data:
        with engine.begin() as new_conn:
            server_seed = new_conn.execute(
                sa.text("SELECT server_seed FROM users WHERE id = :id"),
                {"id": user_id},
            ).scalar_one_or_none()

    hash_server_seed = data.get("hash_server_seed")
    client_seed = data.get("client_seed")
    nonce = int(data.get("nonce") or 0)

    response = {
        "server_seed": server_seed,
        "hash_server_seed": hash_server_seed,
        "server_seed_hash": hash_server_seed,
        "client_seed": client_seed,
        "nonce": nonce,
    }
    log.info(f"User data loaded | user_id={user_id} | nonce={nonce}")
    return response


def updateUserNonce(user_id, conn=None):
    """Increment users.nonce by 1 (correct SQL increment)."""
    update_stmt = (
        sa.update(users_table)
        .where(users_table.c.id == user_id)
        .values(nonce=users_table.c.nonce + 1)
    )

    if conn is not None:
        conn.execute(update_stmt)
    else:
        with engine.begin() as new_conn:
            new_conn.execute(update_stmt)

    log.info(f"User nonce UPDATE completed | user_id={user_id}")

# Метод который обновялет запись об пригласившегося пользователя этого пользователя, что бы обновлять статистику пригласившегося при депозитах этого игрока )
def referrerIdUpdate(user_id, referrer_id, conn):
    # Write-once: only set referrer_id when still NULL (immutable attribution).
    update_stmt = (
        sa.update(users_table)
        .where(
            users_table.c.id == user_id,
            users_table.c.referrer_id.is_(None),
        )
        .values(referrer_id=referrer_id)
    )
    result = conn.execute(update_stmt)

    if result.rowcount == 0:
        log.info(f'Re-referral error. referral_id found | user_id: {user_id}')
        return False

    log.info(f'Update users_table | user_id: {user_id} | refferer_id: {referrer_id}')
    return True

