from fastapi import FastAPI
from pydantic import BaseModel
from games.Dice.dice import getChance, getFactor, roll, dice

app = FastAPI()

class DiceRequest(BaseModel):
    bid: float
    limit: int
    over: bool

# dice roll
@app.post('/api/games/rolldice')
async def roll_dice(json: DiceRequest):
    chance = getChance(json.limit, json.over)
    factor = getFactor(chance)
    result = roll(json)
    data = dice(json, result, factor)

    return data

