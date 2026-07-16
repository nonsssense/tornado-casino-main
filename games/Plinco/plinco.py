"""Plinko result evaluation — mathematics unchanged; seeds injected by caller."""

from games.provably_fair import ProvablyFair
from config import plinko_tables
from log_manager import log


def evaluate_plinco(bid, rows, risk_mode, server_seed, client_seed, nonce):
    """
    Existing Plinko algorithm with injected fairness material.

    Bits / basket / multiplier / payout formulas are unchanged.
    """
    bits = ProvablyFair.getBits(server_seed, client_seed, nonce, rows)
    final_basket = sum(bits)
    multiplier = plinko_tables[risk_mode][rows][final_basket]
    payout = bid * multiplier

    result_json = {
        "payout": payout,
        "multiplier": multiplier,
        "basket": final_basket,
        "path": bits,
        "nonce": nonce,
        "nonce_used": nonce,
        "server_seed_hash": ProvablyFair.getServerSeedHash(server_seed),
        "hash_server_seed": ProvablyFair.getServerSeedHash(server_seed),
        "client_seed_used": client_seed,
    }

    log.info(
        f"Plinco result | basket={final_basket} | "
        f"multiplier={multiplier} | payout={payout} | nonce={nonce}"
    )
    return result_json


def getPlincoResult(json, server_seed, client_seed, nonce):
    """Evaluate Plinko from locked fairness seeds (no DB side effects)."""
    return evaluate_plinco(
        bid=float(json.bid),
        rows=int(json.rows),
        risk_mode=json.risk_mode,
        server_seed=server_seed,
        client_seed=client_seed,
        nonce=int(nonce),
    )
