from __future__ import annotations

import json

from database.campaign import (
    CAMPAIGN_TYPE_CUSTOM,
    CampaignManager,
    campaign_participations_table,
    ensure_campaign_schema,
)
from database.db_config import engine
import sqlalchemy as sa
from log_manager import log


def list_campaigns() -> list:
    return CampaignManager().getAllCampaigns()


def campaign_stats_summary() -> dict:
    ensure_campaign_schema()
    campaigns = CampaignManager().getAllCampaigns()
    active = CampaignManager().getActiveCampaigns()
    with engine.begin() as conn:
        part_count = (
            conn.execute(
                sa.select(sa.func.count()).select_from(campaign_participations_table)
            ).scalar()
            or 0
        )
        by_status = conn.execute(
            sa.select(
                campaign_participations_table.c.status,
                sa.func.count(),
            ).group_by(campaign_participations_table.c.status)
        ).all()

    return {
        "total": len(campaigns),
        "active": len(active),
        "enabled": sum(1 for c in campaigns if c.enabled),
        "participations": int(part_count),
        "by_status": {str(status): int(count) for status, count in by_status},
    }


def get_campaign_detail(campaign_id: int) -> dict | None:
    mgr = CampaignManager()
    campaign = mgr.getCampaignById(int(campaign_id))
    if campaign is None:
        return None

    ensure_campaign_schema()
    with engine.begin() as conn:
        parts = (
            conn.execute(
                sa.select(campaign_participations_table)
                .where(campaign_participations_table.c.campaign_id == int(campaign_id))
                .order_by(campaign_participations_table.c.id.desc())
                .limit(15)
            )
            .mappings()
            .all()
        )
        total = (
            conn.execute(
                sa.select(sa.func.count())
                .select_from(campaign_participations_table)
                .where(campaign_participations_table.c.campaign_id == int(campaign_id))
            ).scalar()
            or 0
        )

    return {
        "campaign": campaign,
        "participants_total": int(total),
        "participants": [dict(r) for r in parts],
    }


def format_campaign_list(campaigns) -> str:
    if not campaigns:
        return "📋 Campaigns\n\nNo campaigns yet."
    lines = ["📋 Campaign List\n"]
    for c in campaigns[:40]:
        archived = bool((c.config or {}).get("archived"))
        flag = "🗄" if archived else ("✅" if c.enabled else "⏸")
        lines.append(
            f"{flag} #{c.id} {c.code} | {c.type} | trigger={c.trigger or '—'}"
        )
    return "\n".join(lines)


def format_campaign_detail(detail: dict) -> str:
    c = detail["campaign"]
    cfg = c.config or {}
    lines = [
        f"🎁 Campaign #{c.id}",
        f"Code: {c.code}",
        f"Name: {c.name}",
        f"Type: {c.type}",
        f"Enabled: {c.enabled}",
        f"Archived: {bool(cfg.get('archived'))}",
        f"Trigger: {c.trigger or '—'}",
        f"Priority: {c.priority}",
        f"Budget: {c.budget} / spent {c.spent_budget}",
        f"Schedule: {c.start_at or '—'} → {c.ends_at or '—'}",
        f"Participants: {detail['participants_total']}",
        "",
        "Config:",
        json.dumps(cfg, ensure_ascii=False, default=str)[:800],
        "",
        "Recent participants:",
    ]
    if detail["participants"]:
        for p in detail["participants"][:10]:
            lines.append(
                f"  user={p.get('user_id')} | {p.get('status')} | "
                f"progress={p.get('progress')}"
            )
    else:
        lines.append("  —")
    return "\n".join(lines)


def format_campaign_stats(stats: dict) -> str:
    lines = [
        "📊 Campaign Statistics\n",
        f"Total: {stats['total']}",
        f"Enabled: {stats['enabled']}",
        f"Active now: {stats['active']}",
        f"Participations: {stats['participations']}",
        "",
        "By participation status:",
    ]
    if stats["by_status"]:
        for status, count in sorted(stats["by_status"].items()):
            lines.append(f"  {status}: {count}")
    else:
        lines.append("  —")
    return "\n".join(lines)


def create_campaign_from_text(text: str, *, created_by: str) -> dict:
    """
    MVP create format:
      code|name|type|trigger
    Optional 5th field: JSON config.
    """
    parts = [p.strip() for p in (text or "").split("|")]
    if len(parts) < 3:
        return {
            "ok": False,
            "error": "Format: code|name|type|trigger|[json_config]",
        }

    code, name, ctype = parts[0], parts[1], parts[2]
    trigger = parts[3] if len(parts) > 3 and parts[3] else None
    config = {}
    if len(parts) > 4 and parts[4]:
        try:
            config = json.loads(parts[4])
            if not isinstance(config, dict):
                return {"ok": False, "error": "Config must be a JSON object"}
        except json.JSONDecodeError as exc:
            return {"ok": False, "error": f"Invalid JSON config: {exc}"}

    if not code or not name:
        return {"ok": False, "error": "code and name are required"}

    ctype = ctype or CAMPAIGN_TYPE_CUSTOM
    try:
        campaign = CampaignManager().createCampaign(
            code=code,
            name=name,
            type=ctype,
            trigger=trigger,
            config=config,
            created_by=created_by,
            enabled=True,
        )
        return {"ok": True, "campaign": campaign}
    except Exception as exc:
        log.exception("Campaign create failed")
        return {"ok": False, "error": str(exc)}


def enable_campaign(campaign_id: int):
    return CampaignManager().enableCampaign(int(campaign_id))


def disable_campaign(campaign_id: int):
    return CampaignManager().disableCampaign(int(campaign_id))


def archive_campaign(campaign_id: int):
    mgr = CampaignManager()
    campaign = mgr.getCampaignById(int(campaign_id))
    if campaign is None:
        return None
    config = dict(campaign.config or {})
    config["archived"] = True
    return mgr.updateCampaign(
        int(campaign_id),
        {"enabled": False, "config": config},
    )
