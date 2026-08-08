from __future__ import annotations

from datetime import datetime, timedelta

import sqlalchemy as sa

from database.bonus import BonusManager
from database.campaign import CampaignManager
from database.db_config import (
    bet_table,
    deposit_table,
    engine,
    referral_profiles,
    user_session_table,
    users_table,
    wallet_table,
    withdraw_table,
)
from database.referral import ReferralManager, getUserByKey
from database.session import SESSION_IDLE_MINUTES
from database.transactions import TransactionManager
from database.wallet import BALANCE_REAL, WalletManager, lock_wallet
from exceptions import notEnoughBalance
from log_manager import log

USER_STATUS_ACTIVE = "real"
USER_STATUS_BANNED = "banned"


def find_player(query: str) -> dict | None:
    """Resolve by internal id, tg_id, username, or referral key."""
    raw = (query or "").strip()
    if not raw:
        return None

    with engine.begin() as conn:
        if raw.isdigit():
            value = int(raw)
            row = conn.execute(
                sa.select(users_table).where(users_table.c.id == value)
            ).mappings().first()
            if row:
                return dict(row)
            row = conn.execute(
                sa.select(users_table).where(users_table.c.tg_id == value)
            ).mappings().first()
            if row:
                return dict(row)

        username = raw.lstrip("@")
        row = conn.execute(
            sa.select(users_table).where(
                sa.func.lower(users_table.c.username) == username.lower()
            )
        ).mappings().first()
        if row:
            return dict(row)

        referrer_id = getUserByKey(raw, conn)
        if referrer_id is not None:
            row = conn.execute(
                sa.select(users_table).where(users_table.c.id == int(referrer_id))
            ).mappings().first()
            if row:
                return dict(row)

    return None


def get_player(user_id: int) -> dict | None:
    with engine.begin() as conn:
        row = conn.execute(
            sa.select(users_table).where(users_table.c.id == int(user_id))
        ).mappings().first()
        return dict(row) if row else None


def list_online_players(limit: int = 30) -> list[dict]:
    cutoff = datetime.now() - timedelta(minutes=SESSION_IDLE_MINUTES)
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(
                users_table.c.id,
                users_table.c.tg_id,
                users_table.c.username,
                user_session_table.c.last_activity,
            )
            .select_from(
                user_session_table.join(
                    users_table, users_table.c.id == user_session_table.c.user_id
                )
            )
            .where(
                user_session_table.c.active_status.is_(True),
                user_session_table.c.last_activity >= cutoff,
            )
            .order_by(user_session_table.c.last_activity.desc())
            .limit(limit)
        ).mappings().all()
        return [dict(r) for r in rows]


def list_banned_players(limit: int = 30) -> list[dict]:
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(users_table)
            .where(users_table.c.status == USER_STATUS_BANNED)
            .order_by(users_table.c.id.desc())
            .limit(limit)
        ).mappings().all()
        return [dict(r) for r in rows]


def list_top_players(limit: int = 20) -> list[dict]:
    with engine.begin() as conn:
        rows = conn.execute(
            sa.select(
                users_table.c.id,
                users_table.c.tg_id,
                users_table.c.username,
                wallet_table.c.real_balance,
                wallet_table.c.bonus_balance,
            )
            .select_from(
                users_table.join(wallet_table, wallet_table.c.user_id == users_table.c.id)
            )
            .order_by(wallet_table.c.real_balance.desc())
            .limit(limit)
        ).mappings().all()
        return [dict(r) for r in rows]


def _wallet_snapshot(user_id: int, conn) -> dict:
    row = conn.execute(
        sa.select(wallet_table).where(wallet_table.c.user_id == int(user_id))
    ).mappings().first()
    if not row:
        return {"wallet_id": None, "real": 0.0, "bonus": 0.0, "pending": 0.0}
    return {
        "wallet_id": row["id"],
        "real": float(row["real_balance"] or 0),
        "bonus": float(row["bonus_balance"] or 0),
        "pending": float(row.get("pending_balance") or 0),
    }


def get_risk_stats(user_id: int) -> dict:
    """Compact risk snapshot for withdrawal review / admin alerts."""
    uid = int(user_id)
    with engine.begin() as conn:
        user = conn.execute(
            sa.select(users_table).where(users_table.c.id == uid)
        ).mappings().first()
        wallet = _wallet_snapshot(uid, conn)
        dep = conn.execute(
            sa.select(
                sa.func.count().label("cnt"),
                sa.func.coalesce(
                    sa.func.sum(deposit_table.c.usd_amount), 0
                ).label("total"),
            ).where(
                deposit_table.c.user_id == uid,
                deposit_table.c.status == "Completed",
            )
        ).mappings().first()
        wd_done = conn.execute(
            sa.select(sa.func.count()).where(
                withdraw_table.c.user_id == uid,
                withdraw_table.c.status == "COMPLETED",
            )
        ).scalar_one()

    return {
        "tg_id": user.get("tg_id") if user else None,
        "username": user.get("username") if user else None,
        # `ip_address` is captured once at first /api/auth (registration IP).
        "ip_address": user.get("ip_address") if user else None,
        "registered_at": user.get("created_at") if user else None,
        "status": user.get("status") if user else None,
        "deposits_count": int((dep and dep["cnt"]) or 0),
        "deposits_total_usd": float((dep and dep["total"]) or 0),
        "withdraws_completed": int(wd_done or 0),
        "real": wallet["real"],
        "bonus": wallet["bonus"],
        "pending": wallet["pending"],
    }


def build_player_profile(user_id: int) -> dict | None:
    user = get_player(user_id)
    if user is None:
        return None

    with engine.begin() as conn:
        wallet = _wallet_snapshot(user_id, conn)
        deposits = conn.execute(
            sa.select(deposit_table)
            .where(deposit_table.c.user_id == int(user_id))
            .order_by(deposit_table.c.id.desc())
            .limit(5)
        ).mappings().all()
        withdraws = conn.execute(
            sa.select(withdraw_table)
            .where(withdraw_table.c.user_id == int(user_id))
            .order_by(withdraw_table.c.id.desc())
            .limit(5)
        ).mappings().all()
        bets = conn.execute(
            sa.select(bet_table)
            .where(bet_table.c.user_id == int(user_id))
            .order_by(bet_table.c.id.desc())
            .limit(8)
        ).mappings().all()
        session = conn.execute(
            sa.select(user_session_table)
            .where(user_session_table.c.user_id == int(user_id))
            .order_by(user_session_table.c.id.desc())
            .limit(1)
        ).mappings().first()
        ref_profile = ReferralManager(user_id, conn).get_profile(conn)
        referrer_id = user.get("referrer_id")

    campaigns = []
    try:
        campaigns = CampaignManager().getUserCampaigns(user_id)[:8]
    except Exception as exc:
        log.warning(f"Player campaigns load failed | user_id={user_id} | {exc}")

    return {
        "user": user,
        "wallet": wallet,
        "deposits": [dict(r) for r in deposits],
        "withdraws": [dict(r) for r in withdraws],
        "bets": [dict(r) for r in bets],
        "session": dict(session) if session else None,
        "referral": dict(ref_profile) if ref_profile else None,
        "referrer_id": referrer_id,
        "campaigns": campaigns,
    }


def format_player_profile(profile: dict) -> str:
    user = profile["user"]
    wallet = profile["wallet"]
    ref = profile.get("referral") or {}
    session = profile.get("session")

    lines = [
        f"👤 Player #{user['id']}",
        f"TG: {user.get('tg_id')} | @{user.get('username') or '—'}",
        f"Name: {user.get('first_name') or ''} {user.get('last_name') or ''}".strip(),
        f"Status: {user.get('status')}",
        f"Referrer: {profile.get('referrer_id') or '—'}",
        "",
        "Wallet",
        f"  real: ${wallet['real']:.2f}",
        f"  bonus: ${wallet['bonus']:.2f}",
        f"  pending: ${wallet['pending']:.2f}",
        "",
        "Referral",
        f"  key: {ref.get('referral_key') or '—'}",
        f"  invites: {ref.get('total_invites') or 0}",
        f"  lifetime: ${float(ref.get('lifetime_earned') or 0):.2f}",
        f"  available: ${float(ref.get('available_earnings') or 0):.2f}",
        "",
        "Session",
    ]
    if session:
        lines.append(
            f"  active={session.get('active_status')} | last={session.get('last_activity')}"
        )
    else:
        lines.append("  —")

    lines.append("\nCampaigns")
    if profile["campaigns"]:
        for card in profile["campaigns"][:6]:
            lines.append(
                f"  {card.get('code')} | {card.get('status')} | "
                f"{float(card.get('completion_percent') or 0):.0f}%"
            )
    else:
        lines.append("  —")

    lines.append("\nDeposits")
    if profile["deposits"]:
        for d in profile["deposits"]:
            lines.append(
                f"  #{d['id']} {d.get('status')} ${float(d.get('usd_amount') or 0):.2f} {d.get('coin')}"
            )
    else:
        lines.append("  —")

    lines.append("\nWithdrawals")
    if profile["withdraws"]:
        for w in profile["withdraws"]:
            lines.append(
                f"  #{w['id']} {w.get('status')} ${float(w.get('amount') or 0):.2f} {w.get('coin')}"
            )
    else:
        lines.append("  —")

    lines.append("\nRecent bets")
    if profile["bets"]:
        for b in profile["bets"]:
            lines.append(
                f"  #{b['id']} {b.get('game')} {b.get('result')} "
                f"bet=${float(b.get('bet_amount') or 0):.2f} profit=${float(b.get('profit') or 0):.2f}"
            )
    else:
        lines.append("  —")

    return "\n".join(lines)


def adjust_real_balance(user_id: int, amount: float, *, admin_tg_id: int) -> dict:
    """Add (positive) or remove (negative) REAL balance via WalletManager."""
    amount = float(amount)
    if amount == 0:
        return {"ok": False, "error": "Amount must be non-zero"}

    wallet_mgr = WalletManager(user_id)
    wallet_id = wallet_mgr.checkWalletStatus()
    if wallet_id is None:
        return {"ok": False, "error": "Wallet not found"}

    try:
        with engine.begin() as conn:
            lock_wallet(conn, user_id, wallet_id)
            balances = wallet_mgr.apply_balance_deltas(
                conn, wallet_id, real_delta=amount
            )
            tx_type = "admin credit" if amount > 0 else "admin debit"
            TransactionManager(
                user_id=user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_REAL,
                transaction_type=tx_type,
                amount=amount,
                balance_after=balances["real_balance"],
                status="Done",
                reference_id=f"admin:{admin_tg_id}",
            ).postTransaction(conn)
        log.info(
            f"Admin balance adjust | user_id={user_id} | amount={amount} | "
            f"admin={admin_tg_id} | real={balances['real_balance']}"
        )
        return {"ok": True, "balances": balances}
    except notEnoughBalance:
        return {"ok": False, "error": "Insufficient balance"}
    except Exception as exc:
        log.exception(f"Admin balance adjust failed | user_id={user_id}")
        return {"ok": False, "error": str(exc)}


def grant_bonus(user_id: int, principal: float, wager_multiplier: float = 1.0) -> dict:
    principal = float(principal)
    if principal <= 0:
        return {"ok": False, "error": "Principal must be > 0"}

    wallet_mgr = WalletManager(user_id)
    wallet_id = wallet_mgr.checkWalletStatus()
    if wallet_id is None:
        return {"ok": False, "error": "Wallet not found"}

    wager_required = principal * float(wager_multiplier)
    try:
        instance_id = BonusManager(user_id).grantPromoBonus(
            wallet_id, principal, wager_required
        )
        return {"ok": True, "instance_id": instance_id}
    except Exception as exc:
        log.exception(f"Admin grant bonus failed | user_id={user_id}")
        return {"ok": False, "error": str(exc)}


def set_ban_status(user_id: int, banned: bool) -> dict:
    status = USER_STATUS_BANNED if banned else USER_STATUS_ACTIVE
    with engine.begin() as conn:
        row = conn.execute(
            sa.update(users_table)
            .where(users_table.c.id == int(user_id))
            .values(status=status)
            .returning(users_table)
        ).mappings().first()
        if row is None:
            return {"ok": False, "error": "User not found"}
        return {"ok": True, "user": dict(row)}
