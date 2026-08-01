from __future__ import annotations

import sqlalchemy as sa

from admin_panel.services.players import find_player, get_player
from database.db_config import deposit_table, engine, transaction_table, withdraw_table
from payments.withdraw import WithdrawManager


def universal_search(query: str) -> dict:
    """
    Auto-detect entity from operator input.

    Returns:
      {"kind": "player"|"deposit"|"withdraw"|"transaction"|"unknown", ...}
    """
    raw = (query or "").strip()
    if not raw:
        return {"kind": "unknown", "error": "Empty query"}

    # Prefer player resolution for numeric / username / referral key.
    player = find_player(raw)
    if player is not None and not raw.upper().startswith(("D", "W", "T", "TX")):
        # Still allow explicit prefixes below; for pure numbers also check
        # deposit/withdraw ids if player match was only by coincidence of ids.
        pass

    prefix = raw.upper()
    numeric = None
    if raw.isdigit():
        numeric = int(raw)
    elif ":" in raw:
        kind, _, rest = raw.partition(":")
        if rest.isdigit():
            numeric = int(rest)
            prefix = kind.upper()

    with engine.begin() as conn:
        if numeric is not None and (
            prefix.startswith("D") or raw.upper().startswith("DEP")
        ):
            row = conn.execute(
                sa.select(deposit_table).where(deposit_table.c.id == numeric)
            ).mappings().first()
            if row:
                return {"kind": "deposit", "deposit": dict(row)}

        if numeric is not None and (
            prefix.startswith("W") or raw.upper().startswith("WD")
        ):
            row = WithdrawManager.getWithdraw(numeric)
            if row:
                return {"kind": "withdraw", "withdraw": dict(row)}

        if numeric is not None and (
            prefix.startswith("T") or raw.upper().startswith("TX")
        ):
            row = conn.execute(
                sa.select(transaction_table).where(transaction_table.c.id == numeric)
            ).mappings().first()
            if row:
                return {"kind": "transaction", "transaction": dict(row)}

        if numeric is not None:
            # Ambiguous number: try withdraw → deposit → transaction, else player.
            w = WithdrawManager.getWithdraw(numeric)
            if w is not None:
                # Prefer player if id matches a user; otherwise withdraw.
                user = get_player(numeric)
                if user is None:
                    return {"kind": "withdraw", "withdraw": dict(w)}
            d = conn.execute(
                sa.select(deposit_table).where(deposit_table.c.id == numeric)
            ).mappings().first()
            # Prefer player for numeric ids that exist as users.
            if player is not None:
                return {"kind": "player", "player": player}
            if w is not None:
                return {"kind": "withdraw", "withdraw": dict(w)}
            if d is not None:
                return {"kind": "deposit", "deposit": dict(d)}
            tx = conn.execute(
                sa.select(transaction_table).where(transaction_table.c.id == numeric)
            ).mappings().first()
            if tx is not None:
                return {"kind": "transaction", "transaction": dict(tx)}

    if player is not None:
        return {"kind": "player", "player": player}

    # Last chance: deposit/withdraw by plain id when no user exists.
    if numeric is not None:
        w = WithdrawManager.getWithdraw(numeric)
        if w is not None:
            return {"kind": "withdraw", "withdraw": dict(w)}
        with engine.begin() as conn:
            d = conn.execute(
                sa.select(deposit_table).where(deposit_table.c.id == numeric)
            ).mappings().first()
            if d is not None:
                return {"kind": "deposit", "deposit": dict(d)}
            tx = conn.execute(
                sa.select(transaction_table).where(transaction_table.c.id == numeric)
            ).mappings().first()
            if tx is not None:
                return {"kind": "transaction", "transaction": dict(tx)}

    return {"kind": "unknown", "error": f"Nothing found for: {raw}"}


def format_deposit(d: dict) -> str:
    return (
        f"⬇️ Deposit #{d['id']}\n\n"
        f"User: {d.get('user_id')}\n"
        f"Status: {d.get('status')}\n"
        f"USD: ${float(d.get('usd_amount') or 0):.2f}\n"
        f"Coin: {d.get('coin')} | amount: {d.get('received_amount')}\n"
        f"UUID: {d.get('uuid')}\n"
        f"Created: {d.get('created_at')}\n"
        f"Confirmed: {d.get('confirmed_at')}"
    )


def format_transaction(tx: dict) -> str:
    return (
        f"📄 Transaction #{tx['id']}\n\n"
        f"User: {tx.get('user_id')}\n"
        f"Type: {tx.get('type')}\n"
        f"Balance: {tx.get('balance_type')}\n"
        f"Amount: {float(tx.get('amount') or 0):.4f}\n"
        f"After: {float(tx.get('balance_after') or 0):.4f}\n"
        f"Status: {tx.get('status')}\n"
        f"Ref: {tx.get('reference_id') or '—'}"
    )
