"""
Unified wallet history aggregator.

Maps ledger `transactions` rows into a single player-facing feed with
stable categories for filtering. Reuses the existing transaction table —
does not duplicate write paths.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import sqlalchemy as sa

from database.db_config import engine, transaction_table
from database.transactions import getUserTransactions

HISTORY_CATEGORIES = (
    "all",
    "deposits",
    "withdrawals",
    "game_bets",
    "game_wins",
    "referrals",
    "bonuses",
    "rewards",
    "system",
)

_GAME_BET_MARKERS = (
    "dice_bet",
    "plinko_bet",
    "crash bet",
    "crash_bet",
)
_GAME_WIN_MARKERS = (
    "dice_win",
    "plinko_win",
    "crash win",
    "crash_win",
)


def categorize_transaction_type(tx_type: Optional[str]) -> str:
    """Map a raw ledger type string to a history filter category."""
    raw = str(tx_type or "").strip()
    key = raw.lower()

    if key == "deposit" or key.startswith("deposit"):
        return "deposits"

    if "withdraw" in key:
        return "withdrawals"

    if key in _GAME_BET_MARKERS or key.endswith("_bet") or key.endswith(" bet"):
        return "game_bets"

    if key in _GAME_WIN_MARKERS or key.endswith("_win") or key.endswith(" win"):
        return "game_wins"

    if "referral" in key:
        return "referrals"

    if key.startswith("bonus") or "bonus grant" in key or "bonus unlock" in key:
        return "bonuses"

    if "bounty" in key or "reward" in key or "freebet" in key:
        return "rewards"

    if "refund" in key:
        return "system"

    return "system"


def _title_key_for(category: str, tx_type: str) -> str:
    """Stable i18n key hint for the frontend (frontend owns copy)."""
    key = str(tx_type or "").lower().replace(" ", "_")
    if category == "deposits":
        return "deposit"
    if category == "withdrawals":
        if "hold" in key:
            return "withdraw_hold"
        if "reject" in key or "fail" in key:
            return "withdraw_release"
        return "withdraw"
    if category == "game_bets":
        if "dice" in key:
            return "dice_bet"
        if "plinko" in key:
            return "plinko_bet"
        if "crash" in key:
            return "crash_bet"
        return "game_bet"
    if category == "game_wins":
        if "dice" in key:
            return "dice_win"
        if "plinko" in key:
            return "plinko_win"
        if "crash" in key:
            return "crash_win"
        return "game_win"
    if category == "referrals":
        if "bounty" in key:
            return "referral_bounty"
        if "claim" in key:
            return "referral_claim"
        return "referral"
    if category == "bonuses":
        if "grant" in key:
            return "bonus_grant"
        if "unlock" in key:
            return "bonus_unlock"
        if "expire" in key:
            return "bonus_expire"
        if "forfeit" in key:
            return "bonus_forfeit"
        return "bonus"
    if category == "rewards":
        return "reward"
    return "system"


def _serialize_datetime(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def serialize_history_item(row: Any) -> dict:
    """Normalize one transactions row for the unified history API."""
    mapping = dict(row) if not isinstance(row, dict) else row
    tx_type = mapping.get("type") or ""
    category = categorize_transaction_type(tx_type)
    amount = float(mapping.get("amount") or 0)
    created = mapping.get("created_at")
    title_key = _title_key_for(category, tx_type)

    return {
        "id": mapping.get("id"),
        "category": category,
        "type": tx_type,
        "title_key": title_key,
        "description_key": title_key,
        "amount": amount,
        "balance_type": mapping.get("balance_type"),
        "balance_after": (
            float(mapping["balance_after"])
            if mapping.get("balance_after") is not None
            else None
        ),
        "status": mapping.get("status"),
        "created_at": _serialize_datetime(created),
        "reference_id": mapping.get("reference_id"),
        "bonus_instance_id": mapping.get("bonus_instance_id"),
        "icon": category,
    }


def get_user_history(
    user_id: int,
    *,
    category: str = "all",
    limit: int = 100,
) -> dict:
    """
    Aggregate wallet ledger into a filterable history feed.

    Filtering is done in-process after a single ordered fetch so category
    switches do not require divergent queries.
    """
    requested = str(category or "all").strip().lower()
    if requested not in HISTORY_CATEGORIES:
        requested = "all"

    # Fetch a wider window when filtering so the page still feels full.
    fetch_limit = limit if requested == "all" else max(limit * 4, 200)
    rows = getUserTransactions(user_id, limit=fetch_limit)
    items = [serialize_history_item(row) for row in rows]

    if requested != "all":
        items = [item for item in items if item["category"] == requested]

    items = items[:limit]

    return {
        "items": items,
        "category": requested,
        "categories": list(HISTORY_CATEGORIES),
        # Back-compat for older clients that expect `transactions`.
        "transactions": [
            {
                "id": item["id"],
                "type": item["type"],
                "balance_type": item["balance_type"],
                "amount": item["amount"],
                "status": item["status"],
                "balance_after": item["balance_after"],
                "category": item["category"],
                "created_at": item["created_at"],
                "title_key": item["title_key"],
                "icon": item["icon"],
            }
            for item in items
        ],
    }
