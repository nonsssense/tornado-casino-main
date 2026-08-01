# House edge in dice will be 2.5%
config = 97.5

from games.provably_fair import ProvablyFair
from log_manager import log


def getChance(limit, over):
    if over:
        return 100 - limit
    return limit


def getFactor(chance: float):
    return config / chance


def get_payout(won, bid, factor: float):
    """Net profit on win, -stake on loss (unchanged payout formula)."""
    if won:
        return (bid * factor) - bid
    return -bid


def resolve_roll(limit: int, over: bool, roll: int) -> bool:
    """Existing over/under comparison — unchanged."""
    if over:
        return roll >= limit
    return roll < limit


def roll_from_provably_fair(server_seed: str, client_seed: str, nonce: int) -> int:
    digest = ProvablyFair.getHmac(server_seed, client_seed, nonce)
    return int.from_bytes(digest[:4], "big") % 100


def evaluate_dice(bid, limit, over, server_seed, client_seed, nonce):
    roll_result = roll_from_provably_fair(server_seed, client_seed, nonce)
    won = resolve_roll(limit, over, roll_result)
    chance = getChance(limit, over)
    factor = getFactor(chance)
    net_payout = get_payout(won, bid, factor)
    # Gross return credited on win (stake + net). Zero gross on loss (stake already debited).
    gross_payout = (bid * factor) if won else 0.0

    result = {
        "result": won,
        "result_of_game": won,
        "roll": roll_result,
        "payout": net_payout,
        "multipier": factor,
        "gross_payout": gross_payout,
        "nonce_used": nonce,
        "client_seed_used": client_seed,
        "hash_server_seed_used": ProvablyFair.getServerSeedHash(server_seed),
    }
    log.info(
        f"Dice result | bid={bid} | roll={roll_result} | result={won} | "
        f"payout={net_payout} | multipier={factor} | nonce={nonce}"
    )
    return result


def getDiceResult(json, user_id=None, *, server_seed, client_seed, nonce):
    """Evaluate a Dice game from locked fairness material."""
    return evaluate_dice(
        bid=float(json.bid),
        limit=int(json.limit),
        over=bool(json.over),
        server_seed=server_seed,
        client_seed=client_seed,
        nonce=int(nonce),
    )
