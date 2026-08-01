from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa

from database.bonus import BonusManager
from database.campaign import CampaignManager
from database.db_config import (
    bet_table,
    deposit_table,
    engine,
    users_table,
    withdraw_table,
)
from database.referral import ReferralManager


def _day_start() -> datetime:
    now = datetime.now()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def get_analytics() -> dict:
    start = _day_start()
    with engine.begin() as conn:
        players = conn.execute(sa.select(sa.func.count()).select_from(users_table)).scalar() or 0
        deposits_all = (
            conn.execute(
                sa.select(sa.func.coalesce(sa.func.sum(deposit_table.c.usd_amount), 0)).where(
                    deposit_table.c.status == "Completed"
                )
            ).scalar()
            or 0
        )
        deposits_today = (
            conn.execute(
                sa.select(sa.func.coalesce(sa.func.sum(deposit_table.c.usd_amount), 0)).where(
                    deposit_table.c.status == "Completed",
                    sa.func.coalesce(deposit_table.c.confirmed_at, deposit_table.c.created_at)
                    >= start,
                )
            ).scalar()
            or 0
        )
        withdrawals_all = (
            conn.execute(
                sa.select(sa.func.coalesce(sa.func.sum(withdraw_table.c.amount), 0)).where(
                    withdraw_table.c.status == "COMPLETED"
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
        ggr_all = (
            conn.execute(
                sa.select(sa.func.coalesce(sa.func.sum(-bet_table.c.profit), 0)).where(
                    bet_table.c.result.in_(("Win", "Lose"))
                )
            ).scalar()
            or 0
        )
        bets_today = (
            conn.execute(
                sa.select(sa.func.count()).select_from(bet_table).where(
                    bet_table.c.created_at >= start
                )
            ).scalar()
            or 0
        )
        games = conn.execute(
            sa.select(bet_table.c.game, sa.func.count())
            .group_by(bet_table.c.game)
            .order_by(sa.func.count().desc())
        ).all()

    bonus = BonusManager.stats_summary()
    referral = ReferralManager.stats_summary()
    campaigns = CampaignManager().getAllCampaigns()
    active = CampaignManager().getActiveCampaigns()

    return {
        "players": int(players),
        "deposits_all": float(deposits_all),
        "deposits_today": float(deposits_today),
        "withdrawals_all": float(withdrawals_all),
        "withdrawals_today": float(withdrawals_today),
        "ggr_all": float(ggr_all),
        "bets_today": int(bets_today),
        "games": [(str(g or "—"), int(c)) for g, c in games],
        "bonus": bonus,
        "referral": referral,
        "campaigns_total": len(campaigns),
        "campaigns_active": len(active),
    }


def format_analytics(data: dict) -> str:
    games_lines = "\n".join(
        f"  {name}: {count}" for name, count in data["games"][:10]
    ) or "  —"
    bonus = data["bonus"]
    referral = data["referral"]
    return (
        "📈 Analytics\n\n"
        f"Players: {data['players']}\n"
        f"Revenue (GGR all-time): ${data['ggr_all']:.2f}\n\n"
        f"Deposits today: ${data['deposits_today']:.2f}\n"
        f"Deposits all-time: ${data['deposits_all']:.2f}\n"
        f"Withdrawals today: ${data['withdrawals_today']:.2f}\n"
        f"Withdrawals all-time: ${data['withdrawals_all']:.2f}\n\n"
        f"Bets today: {data['bets_today']}\n"
        f"Games:\n{games_lines}\n\n"
        "Bonuses\n"
        f"  active: {bonus.get('active_count')}\n"
        f"  unlocked: {bonus.get('unlocked_count')}\n"
        f"  liability: ${float(bonus.get('active_liability') or 0):.2f}\n\n"
        "Referrals\n"
        f"  profiles: {referral.get('profiles')}\n"
        f"  invites: {referral.get('invites')}\n"
        f"  qualified FTDs: {referral.get('qualified_ftds')}\n"
        f"  lifetime earned: ${float(referral.get('lifetime_earned') or 0):.2f}\n\n"
        "Campaigns\n"
        f"  total: {data['campaigns_total']}\n"
        f"  active: {data['campaigns_active']}"
    )
