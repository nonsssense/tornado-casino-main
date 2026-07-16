"""SQL layer for the existing `plinco` table — insert only, no schema redesign."""

import sqlalchemy as sa

from database.db_config import engine, plinco_table
from log_manager import log


def insert_plinco_round(
    conn,
    *,
    user_id,
    bet_id,
    client_seed_used,
    hash_server_seed,
    nonce_used,
    rows,
    risk_mode,
    result,
    basket,
):
    """INSERT into existing `plinco` columns (schema unchanged)."""
    stmt = sa.insert(plinco_table).values(
        user_id=user_id,
        bet_id=bet_id,
        client_seed_used=client_seed_used,
        hash_server_seed=hash_server_seed,
        nonce_used=nonce_used,
        rows=rows,
        risk_mode=risk_mode,
        result=result,
        basket=basket,
    )
    conn.execute(stmt)
    log.info(
        f"Plinco INSERT completed | user_id={user_id} | bet_id={bet_id} | "
        f"basket={basket} | multiplier={result} | nonce_used={nonce_used}"
    )


def postPlinco(user_id, bet_id, game_data, result, conn=None, fairness=None):
    """
    Persist a completed Plinko round.

    Prefer calling with an open `conn` + `fairness` dict so the insert shares the
    game transaction. Standalone conn opens a new begin() for legacy callers.
    """
    rows = game_data.rows if hasattr(game_data, "rows") else game_data.get("rows")
    risk_mode = (
        game_data.risk_mode
        if hasattr(game_data, "risk_mode")
        else game_data.get("risk_mode")
    )

    if fairness is None:
        raise ValueError("fairness seeds are required — pass locked fairness material")

    values = dict(
        user_id=user_id,
        bet_id=bet_id,
        client_seed_used=fairness["client_seed"],
        hash_server_seed=fairness["hash_server_seed"],
        nonce_used=fairness["nonce"],
        rows=rows,
        risk_mode=risk_mode,
        result=result.get("multiplier"),
        basket=result["basket"],
    )

    if conn is not None:
        conn.execute(sa.insert(plinco_table).values(**values))
        log.info(
            f"Plinco INSERT completed | user_id={user_id} | bet_id={bet_id} | "
            f"basket={result.get('basket')} | multiplier={result.get('multiplier')}"
        )
        return

    with engine.begin() as new_conn:
        new_conn.execute(sa.insert(plinco_table).values(**values))
        log.info(
            f"Plinco INSERT completed | user_id={user_id} | bet_id={bet_id} | "
            f"basket={result.get('basket')} | multiplier={result.get('multiplier')}"
        )
