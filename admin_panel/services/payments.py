from __future__ import annotations

import sqlalchemy as sa

from database.db_config import deposit_table, engine, withdraw_table
from payments.withdraw import WithdrawManager
from admin_panel.services.players import get_risk_stats


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


def _frozen_send_line(w: dict) -> str:
    """The exact crypto amount the admin must send by hand (frozen at request)."""
    crypto = w.get("crypto_amount")
    if crypto is None:
        return f"Send: — {w.get('coin')} (rate unavailable — compute manually)"
    return f"Send: {float(crypto):.8f} {w.get('coin')}"


def _risk_block(user_id) -> str:
    if user_id is None:
        return "Player: —"
    s = get_risk_stats(user_id)
    return (
        f"👤 Player #{user_id} (tg {s.get('tg_id')} @{s.get('username') or '—'})\n"
        f"Registered: {s.get('registered_at') or '—'}\n"
        f"Reg IP: {s.get('ip_address') or '—'}\n"
        f"Deposits: {s['deposits_count']} (${s['deposits_total_usd']:.2f})\n"
        f"Completed WD: {s['withdraws_completed']}\n"
        f"Balance: real ${s['real']:.2f} / pending ${s['pending']:.2f}"
    )


def build_withdraw_alert(w: dict) -> str:
    """Telegram alert sent to staff the moment a withdrawal request is created."""
    return (
        f"🆕 Withdrawal request #{w['id']}\n\n"
        f"Amount: ${float(w.get('amount') or 0):.2f}\n"
        f"{_frozen_send_line(w)}\n"
        f"Address: {w.get('address')}\n\n"
        f"{_risk_block(w.get('user_id'))}\n\n"
        f"→ Send the amount above, then press «Завершено» in the panel."
    )


def format_withdraw_detail(w: dict) -> str:
    rate = w.get("convert_rate")
    rate_line = f"{float(rate):.6g}" if rate is not None else "—"
    return (
        f"💳 Withdraw #{w['id']}\n\n"
        f"Amount: ${float(w.get('amount') or 0):.2f} {w.get('coin')}\n"
        f"{_frozen_send_line(w)} (frozen)\n"
        f"Rate: {rate_line}\n"
        f"Address: {w.get('address')}\n"
        f"Status: {w.get('status')}\n"
        f"Created: {w.get('created_at')}\n"
        f"Reviewed by: {w.get('reviewed_by') or '—'}\n"
        f"Reject reason: {w.get('reject_reason') or '—'}\n\n"
        f"{_risk_block(w.get('user_id'))}"
    )
