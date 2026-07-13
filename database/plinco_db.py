from database.db_config import engine, plinco_table
from database.user_db import getUserData
import sqlalchemy as sa
import json
from log_manager import log


def postPlinco(user_id, bet_id, game_data: json, result: json):
    user_data = getUserData(user_id)


    with engine.begin() as conn:
        rows = game_data.rows if hasattr(game_data, "rows") else game_data.get("rows")
        post_stmt = sa.insert(plinco_table).values(user_id=user_id,
                                                   client_seed_used=user_data['client_seed'],
                                                   hash_server_seed=user_data['hash_server_seed'],
                                                   bet_id=bet_id,
                                                   nonce_used=user_data['nonce'],
                                                   rows=rows,
                                                   risk_mode=game_data.risk_mode if hasattr(game_data, 'risk_mode') else game_data.get('risk_mode'),
                                                   result=result.get('multiplier'),
                                                   basket=result['basket'])
        conn.execute(post_stmt)
        log.info(
            f"Plinco INSERT completed | user_id={user_id} | bet_id={bet_id} | "
            f"basket={result.get('basket')} | multiplier={result.get('multiplier')}"
        )

        