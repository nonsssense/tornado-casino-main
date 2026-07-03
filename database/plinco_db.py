from database.db_config import engine, plinco_table
from database.user_db import getUserData
import sqlalchemy as sa
import json


def postPlinco(user_id, bet_id, game_data: json, result: json):
    user_data = getUserData(user_id)


    with engine.begin() as conn:
        post_stmt = sa.insert(plinco_table).values(user_id=user_id,
                                                   client_seed_used=user_data['client_seed'],
                                                   hash_server_seed=user_data['hash_server_seed'],
                                                   bet_id=bet_id,
                                                   nonce_used=user_data['nonce'],
                                                   rows=game_data['rows'],
                                                   risk_mode=game_data['rows'],
                                                   result=result['multipier'],
                                                   basket=result['basket'])
        conn.execute(post_stmt)

        
