from urllib.parse import parse_qs
from database.db_config import users_table, engine, getTelegramUser
import sqlalchemy as sa
import json
from games.probably_fair import ProvablyFair
from log_manager import log

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
