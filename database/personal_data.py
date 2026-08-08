"""Aggregated Personal Data payload for the full-screen profile page."""

from __future__ import annotations

import sqlalchemy as sa

from database.bonus import BonusManager
from database.db_config import (
    engine,
    users_table,
)
from database.referral import ReferralManager
from database.wallet import WalletManager


def _normalize_game_name(raw: str | None) -> str | None:
    value = str(raw or "").strip().lower()
    if not value:
        return None
    if value == "plinco":
        return "plinko"
    return value


def _build_overview(user_row: dict, referral_summary: dict) -> dict:
    username = user_row.get("username")
    first_name = str(user_row.get("first_name") or "").strip()
    last_name = str(user_row.get("last_name") or "").strip()

    display_name = (
        f"@{username}"
        if username
        else " ".join(part for part in (first_name, last_name) if part)
    ) or "Player"

    current_status = referral_summary.get("status") or "Bronze"
    next_status = referral_summary.get("next_tier")
    progress_current = int(referral_summary.get("qualified_ftd") or 0)
    remaining_ftd = referral_summary.get("remaining_ftd")
    if remaining_ftd is None:
        progress_required = None
    else:
        progress_required = progress_current + int(remaining_ftd)

    progress_percent = 100
    if progress_required and progress_required > 0:
        progress_percent = max(0, min(100, int(round((progress_current / progress_required) * 100))))

    return {
        "avatar_url": (
            str(user_row.get("photo_url")).strip()
            if user_row.get("photo_url") is not None and str(user_row.get("photo_url")).strip()
            else None
        ),
        "username": display_name,
        "status": current_status,
        "next_status": next_status,
        "progress_current": progress_current,
        "progress_required": progress_required,
        "progress_percent": progress_percent,
        "progress_unit": "FTD",
    }


def _build_wallet(user_id: int, conn) -> dict:
    wallet = WalletManager(user_id)
    balances = wallet.getBalances(conn=conn)
    bonus_manager = BonusManager(user_id)
    bonus_manager.expireDueBonuses(wallet.ensureWallet(), conn=conn)
    active = bonus_manager.getPrimaryActiveInstance(conn=conn)
    remaining_wager = 0.0
    if active:
        wager_required = float(active.get("wager_required") or 0)
        wager_progress = float(active.get("wager_progress") or 0)
        remaining_wager = max(0.0, wager_required - wager_progress)

    return {
        "real_balance": float(balances["real_balance"]),
        "bonus_balance": float(balances["bonus_balance"]),
        "withdrawable_balance": float(balances["real_balance"]),
        "remaining_wager": remaining_wager,
    }


def _build_statistics(user_id: int, conn) -> tuple[dict, list[dict]]:
    row = conn.execute(
        sa.text(
            """
            WITH dep AS (
                SELECT
                    COUNT(*) FILTER (WHERE status = 'Completed')::BIGINT AS total_deposits,
                    COALESCE(SUM(CASE WHEN status = 'Completed' THEN COALESCE(usd_amount, 0) ELSE 0 END), 0)::NUMERIC AS total_deposit_amount
                FROM deposit
                WHERE user_id = :user_id
            ),
            wd AS (
                SELECT
                    COUNT(*) FILTER (WHERE status = 'COMPLETED')::BIGINT AS total_withdrawals,
                    COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN COALESCE(amount, 0) ELSE 0 END), 0)::NUMERIC AS total_withdrawal_amount
                FROM withdraws
                WHERE user_id = :user_id
            ),
            b AS (
                SELECT
                    COUNT(*)::BIGINT AS total_bets,
                    COALESCE(SUM(COALESCE(bet_amount, 0)), 0)::NUMERIC AS total_wager,
                    COALESCE(SUM(CASE WHEN COALESCE(profit, 0) > 0 THEN profit ELSE 0 END), 0)::NUMERIC AS total_wins,
                    COALESCE(SUM(CASE WHEN COALESCE(profit, 0) < 0 THEN ABS(profit) ELSE 0 END), 0)::NUMERIC AS total_losses,
                    COALESCE(AVG(NULLIF(bet_amount, 0)), 0)::NUMERIC AS average_bet
                FROM bets
                WHERE user_id = :user_id
            ),
            fav AS (
                SELECT game, COUNT(*)::BIGINT AS plays
                FROM bets
                WHERE user_id = :user_id
                GROUP BY game
                ORDER BY plays DESC, game ASC
                LIMIT 1
            ),
            play AS (
                SELECT
                    COALESCE(
                        SUM(
                            EXTRACT(
                                EPOCH FROM (
                                    COALESCE(close_at, last_activity, open_at) - open_at
                                )
                            )
                        ),
                        0
                    )::NUMERIC AS total_play_time_seconds
                FROM user_sessions
                WHERE user_id = :user_id
                  AND open_at IS NOT NULL
            )
            SELECT
                dep.total_deposits,
                dep.total_deposit_amount,
                wd.total_withdrawals,
                wd.total_withdrawal_amount,
                b.total_bets,
                b.total_wager,
                b.total_wins,
                b.total_losses,
                b.average_bet,
                fav.game AS favorite_game,
                fav.plays AS favorite_game_rounds,
                play.total_play_time_seconds
            FROM dep, wd, b, play
            LEFT JOIN fav ON TRUE
            """
        ),
        {"user_id": int(user_id)},
    ).mappings().one()

    stats = {
        "total_deposits": int(row["total_deposits"] or 0),
        "total_deposit_amount": float(row["total_deposit_amount"] or 0),
        "total_withdrawals": int(row["total_withdrawals"] or 0),
        "total_withdrawal_amount": float(row["total_withdrawal_amount"] or 0),
        "total_bets": int(row["total_bets"] or 0),
        "total_wager": float(row["total_wager"] or 0),
        "total_wins": float(row["total_wins"] or 0),
        "total_losses": float(row["total_losses"] or 0),
        "favorite_game": _normalize_game_name(row.get("favorite_game")),
        "favorite_game_rounds": int(row["favorite_game_rounds"] or 0),
        "average_bet": float(row["average_bet"] or 0),
        "total_play_time_seconds": None,
    }

    unavailable: list[dict] = []
    # Stored sessions represent app activity windows, not strict in-game engagement.
    # Report it as unavailable for "active play time" until per-round timing events exist.
    unavailable.append(
        {
            "key": "total_play_time",
            "reason": "strict_active_play_time_not_stored",
            "missing_fields": [
                "per_round_started_at",
                "per_round_finished_at",
                "game_session_duration_seconds",
            ],
        }
    )

    return stats, unavailable


def get_personal_data_payload(user_id: int) -> dict:
    """Single-request aggregated payload for Personal Data page."""
    with engine.begin() as conn:
        user_row = conn.execute(
            sa.select(users_table).where(users_table.c.id == int(user_id))
        ).mappings().first()
        if user_row is None:
            raise ValueError("User not found")

        referral_summary = ReferralManager(user_id, conn).player_summary(conn=conn) or {}
        overview = _build_overview(user_row, referral_summary)
        wallet = _build_wallet(user_id, conn)
        statistics, unavailable = _build_statistics(user_id, conn)

        return {
            "overview": overview,
            "wallet": wallet,
            "statistics": statistics,
            "unavailable_statistics": unavailable,
        }

