from database.db_config import users_table, engine, getTelegramUser
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from games.provably_fair import ProvablyFair
from log_manager import log
from promo.promo_manager import PromotionManager


class AccountBannedError(Exception):
    """Raised when a banned user attempts authentication."""


def userValidate(data, ip=None):
    """
    Upsert Telegram user.

    Returns:
        (user_id, is_new_user)
        is_new_user is True only when this call created the row.
    """
    is_new_user = False

    with engine.begin() as conn:
        user = getTelegramUser(data)
        stmt = (sa.select(users_table).where(users_table.c.tg_id==user["id"]))
        user_db = (conn.execute(stmt).mappings().first())

        if user_db:
            if str(user_db.get("status") or "").lower() == "banned":
                log.warning(
                    f"Banned user auth blocked | telegram_id={user['id']} | "
                    f"user_id={user_db['id']}"
                )
                raise AccountBannedError("Account is banned")
            user_id = user_db['id']
            log.info(f"Existing user found | telegram_id={user['id']} | user_id={user_id}")
        else:
            server_seed = ProvablyFair.generateServerSeed()
            values = dict(
                tg_id=user["id"],
                ip_address=ip,
                lang_code=user.get("language_code"),
                status='real',
                first_name=user.get("first_name"),
                last_name=user.get("last_name"),
                username=user.get("username"),
                allows_write_to_pm=user.get("allows_write_to_pm"),
                client_seed=ProvablyFair.generateClientSeed(),
                hash_server_seed=ProvablyFair.getServerSeedHash(server_seed),
                nonce=1,
            )
            # Persist plaintext seed when the column exists (HMAC for Dice/PF games).
            if "server_seed" in users_table.c:
                values["server_seed"] = server_seed
            # First-time welcome: pending until the client dismisses it.
            if "welcome_pending" in users_table.c:
                values["welcome_pending"] = True

            created = False
            try:
                with conn.begin_nested():
                    conn.execute(sa.insert(users_table).values(**values))
                created = True
            except IntegrityError:
                # Concurrent first registration won UNIQUE(tg_id) — treat as existing.
                stmt = (sa.select(users_table).where(users_table.c.tg_id == user["id"]))
                user_db = (conn.execute(stmt).mappings().first())
                if user_db is not None and str(user_db.get("status") or "").lower() == "banned":
                    raise AccountBannedError("Account is banned")
                user_id = user_db['id']
                log.info(
                    f"Existing user found after insert race | telegram_id={user['id']} | user_id={user_id}"
                )

            if created:
                stmt = (sa.select(users_table).where(users_table.c.tg_id == user["id"]))
                user_db = (conn.execute(stmt).mappings().first())

                user_id = user_db['id']
                is_new_user = True
                PromotionManager(user_id).on_user_registered(
                    user_id,
                    invite_key=user.get("start_param"),
                    conn=conn,
                )
                log.info(f"New user created | telegram_id={user['id']} | user_id={user_id}")


    return user_id, is_new_user


def getUserDisplayFields(user_id):
    """Trusted profile display fields from DB (fallback when initData user parse fails)."""
    if not user_id:
        return None

    with engine.begin() as conn:
        row = conn.execute(
            sa.select(users_table).where(users_table.c.id == user_id)
        ).mappings().first()

    if not row:
        return None

    return {
        "id": row.get("tg_id"),
        "username": row.get("username"),
        "first_name": row.get("first_name"),
        "last_name": row.get("last_name"),
        "language_code": row.get("lang_code"),
    }


def getWelcomeState(user_id):
    """
    Return welcome modal state for this user.

    show — welcome_pending is True (set only on first registration).
    referred — users.referrer_id is set (joined via referral link).
    """
    if not user_id:
        return {"show": False, "referred": False}

    with engine.begin() as conn:
        row = conn.execute(
            sa.select(users_table).where(users_table.c.id == user_id)
        ).mappings().first()

    if not row:
        return {"show": False, "referred": False}

    pending = bool(row.get("welcome_pending")) if "welcome_pending" in row else False
    referred = row.get("referrer_id") is not None
    return {"show": pending, "referred": referred}


def dismissWelcome(user_id):
    """Mark welcome as shown — never show again for this user."""
    if not user_id:
        return False
    if "welcome_pending" not in users_table.c:
        return False

    with engine.begin() as conn:
        result = conn.execute(
            sa.update(users_table)
            .where(users_table.c.id == int(user_id))
            .values(welcome_pending=False)
        )
    return result.rowcount > 0
