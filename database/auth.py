from database.db_config import users_table, engine, getTelegramUser
import sqlalchemy as sa
from games.probably_fair import ProvablyFair
from log_manager import log

# Fixed Telegram id for local browser sessions when WEB_DEFENCE=False.
DEV_BROWSER_TG_ID = -1


def userValidate(data):
    with engine.begin() as conn:
        user = getTelegramUser(data)
        stmt = (sa.select(users_table).where(users_table.c.tg_id==user["id"]))
        user_db = (conn.execute(stmt).mappings().first())

        if user_db:
            user_id = user_db['id']
            log.info(f"Existing user found | telegram_id={user['id']} | user_id={user_id}")
        else:
            server_seed = ProvablyFair.generateServerSeed()
            conn.execute(sa.insert(users_table).values(tg_id=user["id"],
                                                       lang_code=user.get("language_code"),
                                                       status='real',
                                                       first_name=user.get("first_name"),
                                                       last_name=user.get("last_name"),
                                                       username=user.get("username"),
                                                       allows_write_to_pm=user.get("allows_write_to_pm"),
                                                       client_seed=ProvablyFair.generateClientSeed(),
                                                       hash_server_seed=ProvablyFair.getServerSeedHash(server_seed),
                                                       nonce=1,
                                                       ))
            stmt = (sa.select(users_table).where(users_table.c.tg_id == user["id"]))
            user_db = (conn.execute(stmt).mappings().first())
            
            user_id = user_db['id']
            log.info(f"New user created | telegram_id={user['id']} | user_id={user_id}")
            
        
    return user_id


def ensureDevBrowserUser():
    """Create or reuse the fixed local browser user (WEB_DEFENCE=False only)."""
    with engine.begin() as conn:
        stmt = sa.select(users_table).where(users_table.c.tg_id == DEV_BROWSER_TG_ID)
        user_db = conn.execute(stmt).mappings().first()

        if user_db:
            log.info(
                f"Dev browser user found | telegram_id={DEV_BROWSER_TG_ID} | user_id={user_db['id']}"
            )
            return user_db['id']

        server_seed = ProvablyFair.generateServerSeed()
        conn.execute(sa.insert(users_table).values(
            tg_id=DEV_BROWSER_TG_ID,
            lang_code='en',
            status='real',
            first_name='Dev',
            last_name='Browser',
            username='browser_dev',
            allows_write_to_pm=False,
            client_seed=ProvablyFair.generateClientSeed(),
            hash_server_seed=ProvablyFair.getServerSeedHash(server_seed),
            nonce=1,
        ))
        user_db = conn.execute(stmt).mappings().first()
        log.info(
            f"Dev browser user created | telegram_id={DEV_BROWSER_TG_ID} | user_id={user_db['id']}"
        )
        return user_db['id']
