from urllib.parse import parse_qs
from database.db_config import users_table, engine, getTelegramId
import sqlalchemy as sa
import json
from games.probably_fair import ProvablyFair

def userValidate(data):
    telegram_id = getTelegramId(data)
    
    with engine.begin() as conn:
        stmt = (sa.select(users_table).where(users_table.c.tg_id == telegram_id))
        user_db = (conn.execute(stmt).mappings().first())

        if user_db:
            user_id = user_db['id']
        else:
            server_seed = ProvablyFair.generateServerSeed()
            conn.execute(sa.insert(users_table).values(tg_id=telegram_id,
                                                       client_seed=ProvablyFair.generateClientSeed(),
                                                       hash_server_seed=ProvablyFair.getServerSeedHash(server_seed),
                                                       nonce=1))
            stmt = (sa.select(users_table).where(users_table.c.tg_id == telegram_id))
            user_db = (conn.execute(stmt).mappings().first())
            
            user_id = user_db['id']
            
        
    return user_id