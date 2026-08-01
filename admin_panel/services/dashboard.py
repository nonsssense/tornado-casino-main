from __future__ import annotations

from datetime import datetime, timedelta

import sqlalchemy as sa

from database.campaign import CampaignManager
from database.db_config import (
    bet_table,
    deposit_table,
    engine,
    user_session_table,
    users_table,
    withdraw_table,
)
from database.session import SESSION_IDLE_MINUTES
from payments.withdraw import WITHDRAW_STATUS_PENDING


def _day_start() -> datetime:
    now = datetime.now()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def get_dashboard_stats() -> dict:
    start = _day_start()
    idle_cutoff = datetime.now() - timedelta(minutes=SESSION_IDLE_MINUTES)

    with engine.begin() as conn:
        registered = conn.execute(sa.select(sa.func.count()).select_from(users_table)).scalar() or 0

        online = (
            conn.execute(
                sa.select(sa.func.count(sa.distinct(user_session_table.c.user_id))).where(
                    user_session_table.c.active_status.is_(True),
                    user_session_table.c.last_activity >= idle_cutoff,
                )
            ).scalar()
            or 0
        )

        deposits_today = (
            conn.execute(
                sa.select(sa.func.coalesce(sa.func.sum(deposit_table.c.usd_amount), 0)).where(
                    deposit_table.c.status == "Completed",
                    deposit_table.c.confirmed_at >= start,
                )
            ).scalar()
            or 0
        )
        # Fallback: some rows may only have created_at stamped on completion.
        if float(deposits_today) == 0:
            deposits_today = (
                conn.execute(
                    sa.select(sa.func.coalesce(sa.func.sum(deposit_table.c.usd_amount), 0)).where(
                        deposit_table.c.status == "Completed",
                        deposit_table.c.created_at >= start,
                    )
                ).scalar()
                or 0
            )

        withdrawals_today = (
            conn.execute(
                sa.select(sa.func.coalesce(sa.func.sum(withdraw_table.c.amount), 0)).where(
                    withdraw_table.c.status == "COMPLETED",
                    withdraw_table.c.created_at >= start,
                )
            ).scalar()
            or 0
        )

        # House GGR ≈ -sum(player profit) on settled bets today.
        ggr = (
            conn.execute(
                sa.select(sa.func.coalesce(sa.func.sum(-bet_table.c.profit), 0)).where(
                    bet_table.c.result.in_(("Win", "Lose")),
                    bet_table.c.created_at >= start,
                )
            ).scalar()
            or 0
        )

        pending_withdrawals = (
            conn.execute(
                sa.select(sa.func.count()).select_from(withdraw_table).where(
                    withdraw_table.c.status == WITHDRAW_STATUS_PENDING
                )
            ).scalar()
            or 0
        )

    active_campaigns = len(CampaignManager().getActiveCampaigns())
    # MVP NGR ≈ GGR (bonus cost not fully attributed yet).
    ngr = float(ggr)

    return {
        "online_players": int(online),
        "registered_players": int(registered),
        "deposits_today": float(deposits_today),
        "withdrawals_today": float(withdrawals_today),
        "ggr_today": float(ggr),
        "ngr_today": ngr,
        "pending_withdrawals": int(pending_withdrawals),
        "active_campaigns": int(active_campaigns),
    }


def format_dashboard(stats: dict) -> str:
    return (
        "📊 Dashboard\n\n"
        f"Online Players: {stats['online_players']}\n"
        f"Registered Players: {stats['registered_players']}\n"
        f"Today's Deposits: ${stats['deposits_today']:.2f}\n"
        f"Today's Withdrawals: ${stats['withdrawals_today']:.2f}\n"
        f"Today's GGR: ${stats['ggr_today']:.2f}\n"
        f"Today's NGR: ${stats['ngr_today']:.2f}\n"
        f"Pending Withdrawals: {stats['pending_withdrawals']}\n"
        f"Active Campaigns: {stats['active_campaigns']}"
    )
