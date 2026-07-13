# House edge in dice will be 2.5%
config = 97.5

from secrets import randbelow
from database.db_config import engine, user_events_table
from sqlalchemy import insert
from log_manager import log


balance = 100

bd = list()
def getChance(limit, over):

    if over:
        return 99 - limit

    return limit


def getFactor(chance: float):
    return config / chance


def get_payout(state, json, factor: float):
    if state:
        return (json.bid * factor) - json.bid
    else:
        return -json.bid


def roll(json):
    game_result = randbelow(100)  # random value 0-99

    if json.over:
        result = json.limit < game_result
    else:
        result = json.limit > game_result

    return result, game_result
    
insert_wo_values = insert(user_events_table)

def dice(json, result_of_game: bool, factor: float):
    #bd[balance].append(payout)
    # Здесь будет транзакция которая будет записывать результат в базуе данных + обновлять баланс игрока
    # with ...
    with engine.begin() as conn:
        result = conn.execute(insert_wo_values.values(
            user_id=json.user_id, # заправить данными таблицу
        ))
    
    payout = get_payout(result_of_game, json, factor)
    return {'payout': payout, 'result': result_of_game}
   



def getDiceResult(json, user_id):
    result, game_result = roll(json)
    factor = getFactor(getChance(json.limit, json.over))
    data = dice(json, result, factor)
    data['roll'] = game_result
    log.info(
        f"Dice result | bid={json.bid} | roll={game_result} | result={data.get('result')} | payout={data.get('payout')}"
    )
    return data
