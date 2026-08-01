"""SQL layer for Plinko rounds and durable batch idempotency."""

import json
import sqlalchemy as sa

from database.db_config import engine, plinco_table
from log_manager import log

_batch_schema_ready = False


def ensure_plinko_batch_schema():
    """Create the minimal durable response store required for safe retries."""
    global _batch_schema_ready
    if _batch_schema_ready:
        return

    with engine.begin() as conn:
        conn.execute(
            sa.text(
                """
                CREATE TABLE IF NOT EXISTS plinco_batches (
                    id BIGSERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    idempotency_key VARCHAR(64) NOT NULL,
                    response_json JSONB NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_plinco_batch_user_key
                        UNIQUE (user_id, idempotency_key)
                )
                """
            )
        )
    _batch_schema_ready = True
    log.info("Plinco batch idempotency schema ensured")


def get_plinko_batch_response(conn, user_id, idempotency_key):
    row = conn.execute(
        sa.text(
            "SELECT response_json FROM plinco_batches "
            "WHERE user_id = :user_id AND idempotency_key = :idempotency_key"
        ),
        {"user_id": user_id, "idempotency_key": idempotency_key},
    ).scalar_one_or_none()
    if row is None:
        return None
    return json.loads(row) if isinstance(row, str) else row


def insert_plinko_batch_response(conn, user_id, idempotency_key, response):
    conn.execute(
        sa.text(
            "INSERT INTO plinco_batches "
            "(user_id, idempotency_key, response_json) "
            "VALUES (:user_id, :idempotency_key, CAST(:response_json AS JSONB))"
        ),
        {
            "user_id": user_id,
            "idempotency_key": idempotency_key,
            "response_json": json.dumps(response),
        },
    )


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
