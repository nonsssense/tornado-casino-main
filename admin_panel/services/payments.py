from __future__ import annotations

import sqlalchemy as sa

from database.db_config import deposit_table, engine, withdraw_table
from payments.withdraw import WithdrawManager


def list_deposits(limit: int = 20, status: str | None = None) -> list[dict]:
    with engine.begin() as conn:
        stmt = sa.select(deposit_table).order_by(deposit_table.c.id.desc()).limit(limit)
        if status:
            stmt = (
                sa.select(deposit_table)
                .where(deposit_table.c.status == status)
                .order_by(deposit_table.c.id.desc())
                .limit(limit)
            )
        return [dict(r) for r in conn.execute(stmt).mappings().all()]


def list_withdraws(status: str | None = None, limit: int = 20) -> list[dict]:
    if status is None or status == "PENDING":
        return [dict(r) for r in WithdrawManager.listPendingWithdraws(limit=limit)]

    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(withdraw_table)
            .where(withdraw_table.c.status == status)
            .order_by(withdraw_table.c.id.desc())
            .limit(limit)
        ).mappings().all()
        return [dict(r) for r in rows]


def get_withdraw(withdraw_id: int) -> dict | None:
    row = WithdrawManager.getWithdraw(int(withdraw_id))
    return dict(row) if row else None


async def approve_withdraw(withdraw_id: int, reviewed_by: int) -> dict:
    withdraw = WithdrawManager.getWithdraw(int(withdraw_id))
    if withdraw is None:
        return {"ok": False, "error": "Withdraw not found"}
    manager = WithdrawManager(withdraw["user_id"])
    return await manager.approveWithdraw(int(withdraw_id), reviewed_by)


def reject_withdraw(withdraw_id: int, reviewed_by: int, reason: str | None = None) -> dict:
    withdraw = WithdrawManager.getWithdraw(int(withdraw_id))
    if withdraw is None:
        return {"ok": False, "error": "Withdraw not found"}
    manager = WithdrawManager(withdraw["user_id"])
    return manager.rejectWithdraw(int(withdraw_id), reviewed_by, reason=reason)


def format_deposits(rows: list[dict]) -> str:
    if not rows:
        return "⬇️ Deposits\n\nNo deposits found."
    lines = ["⬇️ Deposits\n"]
    for d in rows:
        lines.append(
            f"#{d['id']} user={d.get('user_id')} | {d.get('status')} | "
            f"${float(d.get('usd_amount') or 0):.2f} {d.get('coin')}"
        )
    return "\n".join(lines)


def format_withdraws(rows: list[dict], title: str = "Withdrawals") -> str:
    if not rows:
        return f"⬆️ {title}\n\nNo items."
    lines = [f"⬆️ {title}\n"]
    for w in rows:
        lines.append(
            f"#{w['id']} user={w.get('user_id')} | {w.get('status')} | "
            f"${float(w.get('amount') or 0):.2f} {w.get('coin')}\n"
            f"  {w.get('address')}"
        )
    return "\n".join(lines)


def format_withdraw_detail(w: dict) -> str:
    return (
        f"💳 Withdraw #{w['id']}\n\n"
        f"User: {w.get('user_id')}\n"
        f"Amount: ${float(w.get('amount') or 0):.2f} {w.get('coin')}\n"
        f"Address: {w.get('address')}\n"
        f"Status: {w.get('status')}\n"
        f"Created: {w.get('created_at')}\n"
        f"Reviewed by: {w.get('reviewed_by') or '—'}\n"
        f"Reject reason: {w.get('reject_reason') or '—'}"
    )
