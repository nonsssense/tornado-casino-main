from fastapi import FastAPI
from pydantic import BaseModel
from games.Dice.dice import getChance, getFactor, roll, dice
from log_manager import log
import time

app = FastAPI()

class DiceRequest(BaseModel):
    bid: float
    limit: int
    over: bool

# dice roll
@app.post('/api/games/rolldice')
async def roll_dice(json: DiceRequest):
    endpoint = "/api/games/rolldice"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        chance = getChance(json.limit, json.over)
        factor = getFactor(chance)
        result = roll(json)
        data = dice(json, result, factor)
        return data
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")
