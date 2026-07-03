# House edge in dice will be 2.5%
from games.probably_fair import ProvablyFair
from config import plinko_tables
from fastapi import Request
from database.user_db import getUserData

def getPlinkoResult(json, user_id):

    user_data = getUserData(user_id)

    rows = json.rows
    bits = ProvablyFair.getBits(user_data['server_seed'], user_data['client_seed'], user_data['nonce'], rows)
    bid = json.bid
    risk_mode = json.risk_mode


    final_basket = sum(bits)
    multiplier = plinko_tables[risk_mode][rows][final_basket]

    result_json = {
        "payout": bid * multiplier,
        "multiplier": multiplier,
        "basket": final_basket,
        "path": bits,
        "nonce": user_data['nonce'],
        "server_seed_hash": user_data['server_seed_hash']
        }
    
    #with engine.begin() as conn:
        #pass

    return result_json





    

