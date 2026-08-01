from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from database.db_config import engine, metadata
from log_manager import log

# ---------------------------------------------------------------------------
# Status / type / priority constants (VARCHAR in DB; extensible without ENUM migrations)
# ---------------------------------------------------------------------------

CAMPAIGN_TYPE_DEPOSIT_BONUS = "deposit_bonus"
CAMPAIGN_TYPE_RELOAD = "reload"
CAMPAIGN_TYPE_CASHBACK = "cashback"
CAMPAIGN_TYPE_FREEBET = "freebet"
CAMPAIGN_TYPE_PROMO_CODE = "promo_code"
CAMPAIGN_TYPE_REFERRAL = "referral"
CAMPAIGN_TYPE_WELCOME = "welcome"
CAMPAIGN_TYPE_CUSTOM = "custom"

CAMPAIGN_PRIORITY_LOW = "LOW"
CAMPAIGN_PRIORITY_NORMAL = "NORMAL"
CAMPAIGN_PRIORITY_HIGH = "HIGH"
CAMPAIGN_PRIORITY_CRITICAL = "CRITICAL"

PARTICIPATION_STATUS_AVAILABLE = "AVAILABLE"
PARTICIPATION_STATUS_QUALIFIED = "QUALIFIED"
PARTICIPATION_STATUS_REWARDED = "REWARDED"
PARTICIPATION_STATUS_ACTIVE = "ACTIVE"
PARTICIPATION_STATUS_COMPLETED = "COMPLETED"
PARTICIPATION_STATUS_EXPIRED = "EXPIRED"
PARTICIPATION_STATUS_CANCELLED = "CANCELLED"

# Sentinel: look up participation unless caller passes an explicit value (incl. None).
_CAMPAIGN_PROGRESS_LOOKUP = object()

# Canonical campaign events (also used as trigger values).
EVENT_REGISTER = "REGISTER"
EVENT_LOGIN = "LOGIN"
EVENT_DEPOSIT = "DEPOSIT"
EVENT_BET_SETTLED = "BET_SETTLED"
EVENT_WITHDRAW = "WITHDRAW"
EVENT_BONUS_COMPLETED = "BONUS_COMPLETED"
EVENT_BONUS_EXPIRED = "BONUS_EXPIRED"

# Accept legacy / verbose trigger aliases without requiring DB rewrites.
_TRIGGER_ALIASES: dict[str, tuple[str, ...]] = {
    EVENT_REGISTER: (EVENT_REGISTER, "on_user_registered"),
    EVENT_LOGIN: (EVENT_LOGIN, "on_login"),
    EVENT_DEPOSIT: (EVENT_DEPOSIT, "on_deposit_confirmed"),
    EVENT_BET_SETTLED: (EVENT_BET_SETTLED, "on_bet_settled"),
    EVENT_WITHDRAW: (EVENT_WITHDRAW, "on_withdrawal_completed", "on_withdraw"),
    EVENT_BONUS_COMPLETED: (EVENT_BONUS_COMPLETED, "on_bonus_completed"),
    EVENT_BONUS_EXPIRED: (EVENT_BONUS_EXPIRED, "on_bonus_expired"),
}

_TERMINAL_STATUSES = frozenset(
    {
        PARTICIPATION_STATUS_COMPLETED,
        PARTICIPATION_STATUS_EXPIRED,
        PARTICIPATION_STATUS_CANCELLED,
    }
)

_schema_ready = False

campaign_table = sa.Table(
    "campaign",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("code", sa.String(128), nullable=False, unique=True),
    sa.Column("name", sa.String(255), nullable=False),
    sa.Column("description", sa.Text, nullable=True),
    sa.Column("type", sa.String(64), nullable=False),
    sa.Column("version", sa.String(64), nullable=False, server_default="1"),
    sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.true()),
    sa.Column(
        "priority",
        sa.String(32),
        nullable=False,
        server_default=CAMPAIGN_PRIORITY_NORMAL,
    ),
    sa.Column("start_at", sa.DateTime, nullable=True),
    sa.Column("ends_at", sa.DateTime, nullable=True),
    sa.Column("trigger", sa.String(128), nullable=True),
    sa.Column("config", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    sa.Column("budget", sa.Integer, nullable=True),
    sa.Column("spent_budget", sa.Integer, nullable=False, server_default="0"),
    sa.Column("created_at", sa.DateTime, nullable=False),
    sa.Column("updated_at", sa.DateTime, nullable=False),
    sa.Column("created_by", sa.String(128), nullable=True),
    extend_existing=True,
)

campaign_participations_table = sa.Table(
    "campaign_participations",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("campaign_id", sa.Integer, nullable=False),
    sa.Column("user_id", sa.Integer, nullable=False),
    sa.Column(
        "status",
        sa.String(32),
        nullable=False,
        server_default=PARTICIPATION_STATUS_AVAILABLE,
    ),
    # Convenience flags kept in sync with status for future queries / admin UI.
    sa.Column("qualified", sa.Boolean, nullable=False, server_default=sa.false()),
    sa.Column("reward_granted", sa.Boolean, nullable=False, server_default=sa.false()),
    sa.Column("completed", sa.Boolean, nullable=False, server_default=sa.false()),
    sa.Column("qualified_at", sa.DateTime, nullable=True),
    sa.Column("granted_at", sa.DateTime, nullable=True),
    sa.Column("completed_at", sa.DateTime, nullable=True),
    sa.Column("expired_at", sa.DateTime, nullable=True),
    sa.Column("reward_id", sa.Integer, nullable=True),
    sa.Column("campaign_version", sa.String(64), nullable=True),
    sa.Column("created_at", sa.DateTime, nullable=False),
    sa.Column("updated_at", sa.DateTime, nullable=False),
    sa.Column("progress", sa.Numeric, nullable=False, server_default="0"),
    sa.Column("source_event", sa.String(128), nullable=True),
    sa.Column("metadata", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
    sa.Column("fail_reason", sa.Text, nullable=True),
    extend_existing=True,
)


def ensure_campaign_schema():
    """Create campaign tables/indexes if missing (idempotent)."""
    global _schema_ready
    if _schema_ready:
        return

    with engine.begin() as conn:
        conn.execute(
            sa.text(
                """
                CREATE TABLE IF NOT EXISTS campaign (
                    id SERIAL PRIMARY KEY,
                    code VARCHAR(128) NOT NULL UNIQUE,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    type VARCHAR(64) NOT NULL,
                    version VARCHAR(64) NOT NULL DEFAULT '1',
                    enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    priority VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
                    start_at TIMESTAMP WITHOUT TIME ZONE,
                    ends_at TIMESTAMP WITHOUT TIME ZONE,
                    trigger VARCHAR(128),
                    config JSONB NOT NULL DEFAULT '{}'::jsonb,
                    budget INTEGER,
                    spent_budget INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                    created_by VARCHAR(128)
                )
                """
            )
        )
        conn.execute(
            sa.text(
                """
                CREATE TABLE IF NOT EXISTS campaign_participations (
                    id SERIAL PRIMARY KEY,
                    campaign_id INTEGER NOT NULL REFERENCES campaign(id),
                    user_id INTEGER NOT NULL,
                    status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
                    qualified BOOLEAN NOT NULL DEFAULT FALSE,
                    reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
                    completed BOOLEAN NOT NULL DEFAULT FALSE,
                    qualified_at TIMESTAMP WITHOUT TIME ZONE,
                    granted_at TIMESTAMP WITHOUT TIME ZONE,
                    completed_at TIMESTAMP WITHOUT TIME ZONE,
                    expired_at TIMESTAMP WITHOUT TIME ZONE,
                    reward_id INTEGER,
                    campaign_version VARCHAR(64),
                    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                    progress NUMERIC NOT NULL DEFAULT 0,
                    source_event VARCHAR(128),
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    fail_reason TEXT
                )
                """
            )
        )
        conn.execute(
            sa.text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS campaign_participations_campaign_user_uidx
                ON campaign_participations (campaign_id, user_id)
                """
            )
        )
        conn.execute(
            sa.text(
                """
                CREATE INDEX IF NOT EXISTS campaign_trigger_enabled_idx
                ON campaign (trigger, enabled)
                """
            )
        )
        conn.execute(
            sa.text(
                """
                CREATE INDEX IF NOT EXISTS campaign_participations_user_idx
                ON campaign_participations (user_id)
                """
            )
        )

    _schema_ready = True
    log.info("Campaign schema ensured (campaign + campaign_participations)")


def _now() -> datetime:
    return datetime.now()


def _as_dict(value: Any) -> dict:
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return dict(parsed) if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    try:
        return dict(value)
    except Exception:
        return {}


def _flags_for_status(status: str) -> dict:
    """Derive convenience booleans from the canonical status field."""
    normalized = str(status or "").upper()
    return {
        "qualified": normalized
        in {
            PARTICIPATION_STATUS_QUALIFIED,
            PARTICIPATION_STATUS_REWARDED,
            PARTICIPATION_STATUS_ACTIVE,
            PARTICIPATION_STATUS_COMPLETED,
        },
        "reward_granted": normalized
        in {
            PARTICIPATION_STATUS_REWARDED,
            PARTICIPATION_STATUS_ACTIVE,
            PARTICIPATION_STATUS_COMPLETED,
        },
        "completed": normalized == PARTICIPATION_STATUS_COMPLETED,
    }


@dataclass
class Campaign:
    """Domain object for one campaign row."""

    id: Optional[int]
    code: str
    name: str
    description: Optional[str] = None
    type: str = CAMPAIGN_TYPE_CUSTOM
    version: str = "1"
    enabled: bool = True
    priority: str = CAMPAIGN_PRIORITY_NORMAL
    start_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    trigger: Optional[str] = None
    config: dict = field(default_factory=dict)
    budget: Optional[int] = None
    spent_budget: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None

    @classmethod
    def from_row(cls, row) -> "Campaign":
        data = dict(row)
        return cls(
            id=data.get("id"),
            code=data["code"],
            name=data["name"],
            description=data.get("description"),
            type=data.get("type") or CAMPAIGN_TYPE_CUSTOM,
            version=str(data.get("version") or "1"),
            enabled=bool(data.get("enabled", True)),
            priority=data.get("priority") or CAMPAIGN_PRIORITY_NORMAL,
            start_at=data.get("start_at"),
            ends_at=data.get("ends_at"),
            trigger=data.get("trigger"),
            config=_as_dict(data.get("config")),
            budget=data.get("budget"),
            spent_budget=int(data.get("spent_budget") or 0),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
            created_by=data.get("created_by"),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "description": self.description,
            "type": self.type,
            "version": self.version,
            "enabled": self.enabled,
            "priority": self.priority,
            "start_at": self.start_at.isoformat() if self.start_at else None,
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
            "trigger": self.trigger,
            "config": dict(self.config or {}),
            "budget": self.budget,
            "spent_budget": self.spent_budget,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_by": self.created_by,
        }

    def is_enabled(self) -> bool:
        return bool(self.enabled)

    def is_within_schedule(self, at: Optional[datetime] = None) -> bool:
        moment = at or _now()
        if self.start_at is not None and moment < self.start_at:
            return False
        if self.ends_at is not None and moment > self.ends_at:
            return False
        return True

    def is_active(self, at: Optional[datetime] = None) -> bool:
        return self.is_enabled() and self.is_within_schedule(at)

    def remaining_budget(self) -> Optional[int]:
        if self.budget is None:
            return None
        return max(0, int(self.budget) - int(self.spent_budget or 0))

    def conditions(self) -> dict:
        return _as_dict((self.config or {}).get("conditions"))

    def reward(self) -> dict:
        return _as_dict((self.config or {}).get("reward"))

    def game_rules(self) -> dict:
        return _as_dict((self.config or {}).get("game"))

    def limits(self) -> dict:
        return _as_dict((self.config or {}).get("limits"))


@dataclass
class CampaignParticipation:
    """Domain object for one campaign_participations row."""

    id: Optional[int]
    campaign_id: int
    user_id: int
    status: str = PARTICIPATION_STATUS_AVAILABLE
    qualified: bool = False
    reward_granted: bool = False
    completed: bool = False
    qualified_at: Optional[datetime] = None
    granted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None
    reward_id: Optional[int] = None
    campaign_version: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    progress: float = 0
    source_event: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    fail_reason: Optional[str] = None

    @classmethod
    def from_row(cls, row) -> "CampaignParticipation":
        data = dict(row)
        return cls(
            id=data.get("id"),
            campaign_id=int(data["campaign_id"]),
            user_id=int(data["user_id"]),
            status=data.get("status") or PARTICIPATION_STATUS_AVAILABLE,
            qualified=bool(data.get("qualified", False)),
            reward_granted=bool(data.get("reward_granted", False)),
            completed=bool(data.get("completed", False)),
            qualified_at=data.get("qualified_at"),
            granted_at=data.get("granted_at"),
            completed_at=data.get("completed_at"),
            expired_at=data.get("expired_at"),
            reward_id=data.get("reward_id"),
            campaign_version=data.get("campaign_version"),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
            progress=float(data.get("progress") or 0),
            source_event=data.get("source_event"),
            metadata=_as_dict(data.get("metadata")),
            fail_reason=data.get("fail_reason"),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "campaign_id": self.campaign_id,
            "user_id": self.user_id,
            "status": self.status,
            "qualified": self.qualified,
            "reward_granted": self.reward_granted,
            "completed": self.completed,
            "qualified_at": self.qualified_at.isoformat() if self.qualified_at else None,
            "granted_at": self.granted_at.isoformat() if self.granted_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "expired_at": self.expired_at.isoformat() if self.expired_at else None,
            "reward_id": self.reward_id,
            "campaign_version": self.campaign_version,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "progress": float(self.progress or 0),
            "source_event": self.source_event,
            "metadata": dict(self.metadata or {}),
            "fail_reason": self.fail_reason,
        }


@dataclass
class ProgressSnapshot:
    """Generic progress view for any campaign type."""

    current: float = 0.0
    target: Optional[float] = None
    unit: str = "percent"
    ratio: float = 0.0
    label: str = ""
    remaining: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "current": float(self.current),
            "target": float(self.target) if self.target is not None else None,
            "unit": self.unit,
            "ratio": float(self.ratio),
            "percent": round(float(self.ratio) * 100.0, 2),
            "label": self.label,
            "remaining": float(self.remaining) if self.remaining is not None else None,
        }


class RuleEvaluator:
    """
    Single eligibility abstraction for campaigns.

    Segmentation and condition rules live here — CampaignManager must not
    hardcode promotion conditions.
    """

    def is_eligible(self, campaign: Campaign, user_id: int, context: Optional[dict] = None,) -> bool:
        context = context or {}
        if not self._passes_segmentation(campaign, user_id, context):
            return False
        return self._evaluate_conditions(campaign, user_id, context)

    def _passes_segmentation(self, campaign: Campaign, user_id: int, context: dict) -> bool:
        """
        Future: country, VIP, segment, risk group, affiliate, promo code,
        A/B bucket, manual targeting from campaign.config.segmentation.

        Today every enabled campaign is visible to every player.
        """
        _ = (campaign, user_id, context)
        # TODO: implement segmentation filters without changing CampaignManager API.
        return True

    def _evaluate_conditions(self,
        campaign: Campaign,
        user_id: int,
        context: dict,
    ) -> bool:
        """
        Future: evaluate campaign.config.conditions against event context.

        TODO: real rule engine. Always True for infrastructure phase.
        """
        _ = (campaign, user_id, context)
        return True


class ProgressTracker:
    """
    Isolated progress calculation.

    Different campaign types can specialize later without changing handleEvent.
    """

    def build_snapshot(
        self,
        campaign: Campaign,
        participation: Optional[CampaignParticipation],
        event: Optional[str] = None,
        context: Optional[dict] = None,
    ) -> ProgressSnapshot:
        context = context or {}
        meta = dict((participation.metadata if participation else {}) or {})
        progress_cfg = _as_dict((campaign.config or {}).get("progress"))
        conditions = campaign.conditions()

        metric = str(
            progress_cfg.get("metric")
            or context.get("progress_metric")
            or self._default_metric(campaign, event)
        )
        target = progress_cfg.get("target")
        if target is None:
            target = conditions.get("deposit_number") or conditions.get("target")
        if target is None and metric == "percent":
            target = 100.0

        current = meta.get("current")
        if current is None:
            current = float(participation.progress or 0) if participation else 0.0
        current = float(current or 0)

        # Apply event delta when present.
        if event == EVENT_DEPOSIT:
            if metric in {"deposit_count", "count"}:
                current = float(meta.get("deposit_count") or 0) + 1.0
            elif metric in {"deposit_amount", "usd", "wager_amount"}:
                current = float(meta.get("current") or 0) + float(
                    context.get("amount_usd")
                    or context.get("amount")
                    or context.get("stake")
                    or 0
                )
        elif event == EVENT_BET_SETTLED:
            if metric in {"wager_amount", "usd"}:
                current = float(meta.get("wagered") or meta.get("current") or 0) + float(
                    context.get("stake") or context.get("amount") or 0
                )
            elif metric == "percent":
                # Context may pass absolute percent (0..100) or ratio (0..1).
                if context.get("progress_percent") is not None:
                    current = float(context["progress_percent"])
                elif context.get("wager_progress") is not None and context.get(
                    "wager_required"
                ):
                    required = float(context["wager_required"]) or 1.0
                    current = min(
                        100.0,
                        (float(context["wager_progress"]) / required) * 100.0,
                    )
        elif event == EVENT_BONUS_COMPLETED:
            current = float(target) if target is not None else 100.0
        elif event in {EVENT_REGISTER, EVENT_LOGIN}:
            current = max(current, 0.0)

        target_f = float(target) if target is not None else None
        if metric == "percent":
            ratio = max(0.0, min(1.0, float(current) / 100.0))
            remaining = max(0.0, 100.0 - float(current))
            unit = "percent"
            label = f"{round(float(current), 1)}%"
        elif target_f and target_f > 0:
            ratio = max(0.0, min(1.0, float(current) / target_f))
            remaining = max(0.0, target_f - float(current))
            unit = "count" if metric in {"deposit_count", "count"} else "usd"
            if unit == "count":
                label = f"{int(current)} / {int(target_f)}"
            else:
                label = f"${float(current):.2f} / ${target_f:.2f}"
        else:
            ratio = max(0.0, min(1.0, float(participation.progress or 0))) if participation else 0.0
            remaining = None
            unit = metric or "ratio"
            label = f"{round(ratio * 100.0, 1)}%"

        return ProgressSnapshot(
            current=float(current),
            target=target_f,
            unit=unit,
            ratio=ratio,
            label=label,
            remaining=remaining,
        )

    def metadata_for_snapshot(
        self,
        previous_meta: Optional[dict],
        snapshot: ProgressSnapshot,
        event: str,
        context: Optional[dict] = None,
    ) -> dict:
        context = context or {}
        meta = dict(previous_meta or {})
        meta["current"] = snapshot.current
        meta["target"] = snapshot.target
        meta["unit"] = snapshot.unit
        meta["label"] = snapshot.label
        meta["ratio"] = snapshot.ratio
        meta["last_event"] = event
        if event == EVENT_DEPOSIT:
            meta["deposit_count"] = float(meta.get("deposit_count") or 0) + 1.0
            if context.get("deposit_index") is not None:
                meta["deposit_index"] = context["deposit_index"]
            if context.get("amount_usd") is not None:
                meta["last_deposit_amount"] = float(context["amount_usd"])
        if event == EVENT_BET_SETTLED:
            stake = float(context.get("stake") or context.get("amount") or 0)
            meta["wagered"] = float(meta.get("wagered") or 0) + stake
            if context.get("game") is not None:
                meta["last_game"] = context["game"]
        return meta

    @staticmethod
    def _default_metric(campaign: Campaign, event: Optional[str]) -> str:
        if event == EVENT_DEPOSIT or campaign.type == CAMPAIGN_TYPE_DEPOSIT_BONUS:
            return "deposit_count"
        if event == EVENT_BET_SETTLED:
            return "wager_amount"
        reward_type = str((campaign.reward() or {}).get("type") or "")
        if "bonus" in reward_type or campaign.type in {
            CAMPAIGN_TYPE_WELCOME,
            CAMPAIGN_TYPE_RELOAD,
        }:
            return "percent"
        return "percent"


class CampaignManager:
    """
    Operating system for promotions: discovery, participation, progress, events.

    Does NOT issue rewards — BonusManager / ReferralManager remain authoritative.
    """

    def __init__(
        self,
        rule_evaluator: Optional[RuleEvaluator] = None,
        progress_tracker: Optional[ProgressTracker] = None,
    ):
        ensure_campaign_schema()
        self._rule_evaluator = rule_evaluator or RuleEvaluator()
        self._progress_tracker = progress_tracker or ProgressTracker()

    # ------------------------------------------------------------------
    # Rule evaluation (delegates — no hardcoded conditions here)
    # ------------------------------------------------------------------

    def _evaluateConditions(
        self,
        campaign: Campaign,
        context: Optional[dict] = None,
        user_id: Optional[int] = None,
    ) -> bool:
        uid = int(user_id if user_id is not None else (context or {}).get("user_id") or 0)
        return self._rule_evaluator.is_eligible(campaign, uid, context)

    # ------------------------------------------------------------------
    # Campaign CRUD
    # ------------------------------------------------------------------

    def createCampaign(
        self,
        *,
        code: str,
        name: str,
        type: str,
        config: Optional[dict] = None,
        description: Optional[str] = None,
        version: str = "1",
        enabled: bool = True,
        priority: str = CAMPAIGN_PRIORITY_NORMAL,
        start_at: Optional[datetime] = None,
        ends_at: Optional[datetime] = None,
        trigger: Optional[str] = None,
        budget: Optional[int] = None,
        created_by: Optional[str] = None,
        conn=None,
    ) -> Campaign:
        ensure_campaign_schema()
        now = _now()
        values = {
            "code": str(code).strip(),
            "name": str(name).strip(),
            "description": description,
            "type": str(type).strip(),
            "version": str(version),
            "enabled": bool(enabled),
            "priority": str(priority or CAMPAIGN_PRIORITY_NORMAL),
            "start_at": start_at,
            "ends_at": ends_at,
            "trigger": trigger,
            "config": dict(config or {}),
            "budget": budget,
            "spent_budget": 0,
            "created_at": now,
            "updated_at": now,
            "created_by": created_by,
        }

        def _run(connection) -> Campaign:
            row = (
                connection.execute(
                    sa.insert(campaign_table)
                    .values(**values)
                    .returning(campaign_table)
                )
                .mappings()
                .one()
            )
            campaign = Campaign.from_row(row)
            log.info(
                f"Campaign created | id={campaign.id} | code={campaign.code} | "
                f"type={campaign.type}"
            )
            return campaign

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def updateCampaign(self, campaign_id: int, updates: dict, conn=None) -> Optional[Campaign]:
        ensure_campaign_schema()
        if not updates:
            return self.getCampaignById(campaign_id, conn=conn)

        allowed = {
            "code",
            "name",
            "description",
            "type",
            "version",
            "enabled",
            "priority",
            "start_at",
            "ends_at",
            "trigger",
            "config",
            "budget",
            "spent_budget",
            "created_by",
        }
        values = {key: updates[key] for key in updates if key in allowed}
        if not values:
            return self.getCampaignById(campaign_id, conn=conn)
        values["updated_at"] = _now()

        def _run(connection) -> Optional[Campaign]:
            row = (
                connection.execute(
                    sa.update(campaign_table)
                    .where(campaign_table.c.id == int(campaign_id))
                    .values(**values)
                    .returning(campaign_table)
                )
                .mappings()
                .first()
            )
            return Campaign.from_row(row) if row else None

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def deleteCampaign(self, campaign_id: int, conn=None) -> Optional[Campaign]:
        """Soft-delete: disable campaign (keep history / participations)."""
        return self.disableCampaign(campaign_id, conn=conn)

    def enableCampaign(self, campaign_id: int, conn=None) -> Optional[Campaign]:
        return self.updateCampaign(campaign_id, {"enabled": True}, conn=conn)

    def disableCampaign(self, campaign_id: int, conn=None) -> Optional[Campaign]:
        return self.updateCampaign(campaign_id, {"enabled": False}, conn=conn)

    def getCampaignById(self, campaign_id: int, conn=None) -> Optional[Campaign]:
        ensure_campaign_schema()

        def _run(connection) -> Optional[Campaign]:
            row = (
                connection.execute(
                    sa.select(campaign_table).where(
                        campaign_table.c.id == int(campaign_id)
                    )
                )
                .mappings()
                .first()
            )
            return Campaign.from_row(row) if row else None

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def getCampaignsByIds(
        self, campaign_ids: list[int], conn=None
    ) -> list[Campaign]:
        """Batch-load campaigns by primary key (preserves no particular order)."""
        ensure_campaign_schema()
        ids = [int(cid) for cid in campaign_ids if cid is not None]
        if not ids:
            return []

        def _run(connection) -> list[Campaign]:
            rows = (
                connection.execute(
                    sa.select(campaign_table).where(campaign_table.c.id.in_(ids))
                )
                .mappings()
                .all()
            )
            return [Campaign.from_row(row) for row in rows]

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def getCampaignByCode(self, code: str, conn=None) -> Optional[Campaign]:
        ensure_campaign_schema()

        def _run(connection) -> Optional[Campaign]:
            row = (
                connection.execute(
                    sa.select(campaign_table).where(
                        campaign_table.c.code == str(code).strip()
                    )
                )
                .mappings()
                .first()
            )
            return Campaign.from_row(row) if row else None

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def getAllCampaigns(self, conn=None) -> list[Campaign]:
        ensure_campaign_schema()

        def _run(connection) -> list[Campaign]:
            rows = (
                connection.execute(
                    sa.select(campaign_table).order_by(
                        campaign_table.c.priority.desc(),
                        campaign_table.c.id.asc(),
                    )
                )
                .mappings()
                .all()
            )
            return [Campaign.from_row(row) for row in rows]

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def getActiveCampaigns(self, at: Optional[datetime] = None, conn=None) -> list[Campaign]:
        """Enabled campaigns within optional start/end window."""
        ensure_campaign_schema()
        moment = at or _now()

        def _run(connection) -> list[Campaign]:
            rows = (
                connection.execute(
                    sa.select(campaign_table)
                    .where(campaign_table.c.enabled.is_(True))
                    .order_by(
                        campaign_table.c.priority.desc(),
                        campaign_table.c.id.asc(),
                    )
                )
                .mappings()
                .all()
            )
            campaigns = [Campaign.from_row(row) for row in rows]
            return [c for c in campaigns if c.is_within_schedule(moment)]

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def getAvailableCampaigns(
        self,
        user_id: int,
        context: Optional[dict] = None,
        *,
        at: Optional[datetime] = None,
        conn=None,
    ) -> list[Campaign]:
        """
        Active campaigns visible to this player.

        Today: all active campaigns (segmentation stub always passes).
        Later: filter via RuleEvaluator._passes_segmentation without API changes.
        """
        context = dict(context or {})
        context.setdefault("user_id", int(user_id))
        active = self.getActiveCampaigns(at=at, conn=conn)
        return [
            campaign
            for campaign in active
            if self._rule_evaluator.is_eligible(campaign, int(user_id), context)
        ]

    def getCampaignsByTrigger(
        self,
        trigger: str,
        *,
        active_only: bool = True,
        at: Optional[datetime] = None,
        conn=None,
    ) -> list[Campaign]:
        ensure_campaign_schema()
        moment = at or _now()
        aliases = self._trigger_aliases(trigger)

        def _run(connection) -> list[Campaign]:
            stmt = sa.select(campaign_table).where(
                campaign_table.c.trigger.in_(aliases)
            )
            if active_only:
                stmt = stmt.where(campaign_table.c.enabled.is_(True))
            stmt = stmt.order_by(
                campaign_table.c.priority.desc(),
                campaign_table.c.id.asc(),
            )
            rows = connection.execute(stmt).mappings().all()
            campaigns = [Campaign.from_row(row) for row in rows]
            if active_only:
                return [c for c in campaigns if c.is_within_schedule(moment)]
            return campaigns

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def getCampaignByTrigger(
        self,
        trigger: str,
        *,
        active_only: bool = True,
        at: Optional[datetime] = None,
        conn=None,
    ) -> list[Campaign]:
        """Alias for getCampaignsByTrigger (player/admin discovery API)."""
        return self.getCampaignsByTrigger(
            trigger,
            active_only=active_only,
            at=at,
            conn=conn,
        )

    @staticmethod
    def _trigger_aliases(trigger: str) -> tuple[str, ...]:
        key = str(trigger or "").strip()
        upper = key.upper()
        if upper in _TRIGGER_ALIASES:
            return _TRIGGER_ALIASES[upper]
        for aliases in _TRIGGER_ALIASES.values():
            if key in aliases or upper in {a.upper() for a in aliases}:
                return aliases
        return (key,) if key else tuple()

    # ------------------------------------------------------------------
    # Participations
    # ------------------------------------------------------------------

    def createParticipation(
        self,
        *,
        campaign_id: int,
        user_id: int,
        status: str = PARTICIPATION_STATUS_AVAILABLE,
        source_event: Optional[str] = None,
        campaign_version: Optional[str] = None,
        metadata: Optional[dict] = None,
        progress: float = 0,
        conn=None,
    ) -> CampaignParticipation:
        ensure_campaign_schema()
        now = _now()
        flags = _flags_for_status(status)

        if campaign_version is None:
            campaign = self.getCampaignById(campaign_id, conn=conn)
            campaign_version = campaign.version if campaign else None

        values = {
            "campaign_id": int(campaign_id),
            "user_id": int(user_id),
            "status": str(status),
            "qualified": flags["qualified"],
            "reward_granted": flags["reward_granted"],
            "completed": flags["completed"],
            "qualified_at": now if flags["qualified"] else None,
            "granted_at": now if flags["reward_granted"] else None,
            "completed_at": now if flags["completed"] else None,
            "expired_at": now if status == PARTICIPATION_STATUS_EXPIRED else None,
            "reward_id": None,
            "campaign_version": campaign_version,
            "created_at": now,
            "updated_at": now,
            "progress": float(progress or 0),
            "source_event": source_event,
            "metadata": dict(metadata or {}),
            "fail_reason": None,
        }

        def _run(connection) -> CampaignParticipation:
            row = (
                connection.execute(
                    sa.insert(campaign_participations_table)
                    .values(**values)
                    .returning(campaign_participations_table)
                )
                .mappings()
                .one()
            )
            participation = CampaignParticipation.from_row(row)
            log.info(
                f"Campaign participation created | id={participation.id} | "
                f"campaign_id={campaign_id} | user_id={user_id} | status={status}"
            )
            return participation

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def getOrCreateParticipation(
        self,
        *,
        campaign: Campaign,
        user_id: int,
        source_event: Optional[str] = None,
        conn=None,
    ) -> CampaignParticipation:
        existing = self.getParticipation(
            campaign_id=int(campaign.id),
            user_id=int(user_id),
            conn=conn,
        )
        if existing is not None:
            return existing
        return self.createParticipation(
            campaign_id=int(campaign.id),
            user_id=int(user_id),
            status=PARTICIPATION_STATUS_AVAILABLE,
            source_event=source_event,
            campaign_version=campaign.version,
            conn=conn,
        )

    def getParticipation(
        self,
        *,
        campaign_id: int,
        user_id: int,
        conn=None,
    ) -> Optional[CampaignParticipation]:
        ensure_campaign_schema()

        def _run(connection) -> Optional[CampaignParticipation]:
            row = (
                connection.execute(
                    sa.select(campaign_participations_table).where(
                        campaign_participations_table.c.campaign_id == int(campaign_id),
                        campaign_participations_table.c.user_id == int(user_id),
                    )
                )
                .mappings()
                .first()
            )
            return CampaignParticipation.from_row(row) if row else None

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def getParticipationsByUser(
        self,
        user_id: int,
        conn=None,
    ) -> list[CampaignParticipation]:
        ensure_campaign_schema()

        def _run(connection) -> list[CampaignParticipation]:
            rows = (
                connection.execute(
                    sa.select(campaign_participations_table)
                    .where(campaign_participations_table.c.user_id == int(user_id))
                    .order_by(campaign_participations_table.c.id.desc())
                )
                .mappings()
                .all()
            )
            return [CampaignParticipation.from_row(row) for row in rows]

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def updateParticipationStatus(
        self,
        participation_id: int,
        status: str,
        *,
        reward_id: Optional[int] = None,
        progress: Optional[float] = None,
        fail_reason: Optional[str] = None,
        metadata: Optional[dict] = None,
        conn=None,
    ) -> Optional[CampaignParticipation]:
        ensure_campaign_schema()
        now = _now()
        flags = _flags_for_status(status)
        values: dict[str, Any] = {
            "status": str(status),
            "qualified": flags["qualified"],
            "reward_granted": flags["reward_granted"],
            "completed": flags["completed"],
            "updated_at": now,
        }
        if flags["qualified"]:
            values["qualified_at"] = sa.func.coalesce(
                campaign_participations_table.c.qualified_at, now
            )
        if flags["reward_granted"]:
            values["granted_at"] = sa.func.coalesce(
                campaign_participations_table.c.granted_at, now
            )
        if flags["completed"]:
            values["completed_at"] = now
        if status == PARTICIPATION_STATUS_EXPIRED:
            values["expired_at"] = now
        if reward_id is not None:
            values["reward_id"] = int(reward_id)
        if progress is not None:
            values["progress"] = float(progress)
        if fail_reason is not None:
            values["fail_reason"] = fail_reason
        if metadata is not None:
            values["metadata"] = dict(metadata)

        def _run(connection) -> Optional[CampaignParticipation]:
            row = (
                connection.execute(
                    sa.update(campaign_participations_table)
                    .where(campaign_participations_table.c.id == int(participation_id))
                    .values(**values)
                    .returning(campaign_participations_table)
                )
                .mappings()
                .first()
            )
            return CampaignParticipation.from_row(row) if row else None

        if conn is not None:
            return _run(conn)
        with engine.begin() as connection:
            return _run(connection)

    def completeParticipation(
        self,
        participation_id: int,
        *,
        reward_id: Optional[int] = None,
        conn=None,
    ) -> Optional[CampaignParticipation]:
        return self.updateParticipationStatus(
            participation_id,
            PARTICIPATION_STATUS_COMPLETED,
            reward_id=reward_id,
            conn=conn,
        )

    def expireParticipation(
        self,
        participation_id: int,
        *,
        fail_reason: Optional[str] = None,
        conn=None,
    ) -> Optional[CampaignParticipation]:
        return self.updateParticipationStatus(
            participation_id,
            PARTICIPATION_STATUS_EXPIRED,
            fail_reason=fail_reason,
            conn=conn,
        )

    # ------------------------------------------------------------------
    # Event dispatcher + progress (observe only — no rewards)
    # ------------------------------------------------------------------

    def handleEvent(
        self,
        user_id: int,
        event: str,
        context: Optional[dict] = None,
        conn=None,
    ) -> list[dict]:
        """
        Generic event entry point.

        Loads campaigns for the trigger, ensures participation, evaluates
        eligibility, updates progress/status. Never issues bonuses/referrals.
        """
        ensure_campaign_schema()
        event_name = str(event or "").strip().upper()
        context = dict(context or {})
        context.setdefault("user_id", int(user_id))
        context.setdefault("event", event_name)

        campaigns = self.getCampaignByTrigger(event_name, active_only=True, conn=conn)
        results: list[dict] = []

        for campaign in campaigns:
            if not self._rule_evaluator.is_eligible(campaign, int(user_id), context):
                continue

            participation = self.getOrCreateParticipation(
                campaign=campaign,
                user_id=int(user_id),
                source_event=event_name,
                conn=conn,
            )

            if (
                participation.status in _TERMINAL_STATUSES
                and event_name not in {EVENT_BONUS_EXPIRED, EVENT_BONUS_COMPLETED}
            ):
                results.append(
                    {
                        "campaign_id": campaign.id,
                        "participation_id": participation.id,
                        "status": participation.status,
                        "skipped": True,
                        "reason": "terminal_status",
                    }
                )
                continue

            snapshot = self._progress_tracker.build_snapshot(
                campaign,
                participation,
                event=event_name,
                context=context,
            )
            meta = self._progress_tracker.metadata_for_snapshot(
                participation.metadata,
                snapshot,
                event_name,
                context,
            )
            next_status = self._next_status_for_event(
                event_name,
                participation.status,
                snapshot,
            )
            updated = self.updateParticipationStatus(
                int(participation.id),
                next_status,
                progress=snapshot.ratio,
                metadata=meta,
                reward_id=context.get("reward_id"),
                fail_reason=context.get("fail_reason"),
                conn=conn,
            )
            results.append(
                {
                    "campaign_id": campaign.id,
                    "participation_id": updated.id if updated else participation.id,
                    "status": updated.status if updated else next_status,
                    "progress": snapshot.to_dict(),
                    "skipped": False,
                }
            )

        log.info(
            f"Campaign handleEvent | user_id={user_id} | event={event_name} | "
            f"matched={len(campaigns)} | updated={sum(1 for r in results if not r.get('skipped'))}"
        )
        return results

    def _next_status_for_event(
        self,
        event: str,
        current_status: str,
        snapshot: ProgressSnapshot,
    ) -> str:
        if event == EVENT_BONUS_EXPIRED:
            return PARTICIPATION_STATUS_EXPIRED
        if event == EVENT_BONUS_COMPLETED or (
            snapshot.target is not None and snapshot.ratio >= 1.0 and event != EVENT_REGISTER
        ):
            return PARTICIPATION_STATUS_COMPLETED
        if event == EVENT_DEPOSIT:
            if snapshot.ratio >= 1.0:
                return PARTICIPATION_STATUS_COMPLETED
            return PARTICIPATION_STATUS_QUALIFIED
        if event == EVENT_BET_SETTLED:
            if snapshot.ratio >= 1.0:
                return PARTICIPATION_STATUS_COMPLETED
            return PARTICIPATION_STATUS_ACTIVE
        if event in {EVENT_REGISTER, EVENT_LOGIN}:
            if current_status in _TERMINAL_STATUSES:
                return current_status
            return PARTICIPATION_STATUS_AVAILABLE
        if event == EVENT_WITHDRAW:
            return current_status if current_status else PARTICIPATION_STATUS_ACTIVE
        return current_status or PARTICIPATION_STATUS_AVAILABLE

    # ------------------------------------------------------------------
    # Player-facing API (Promotions page ready)
    # ------------------------------------------------------------------

    def getUserCampaigns(
        self,
        user_id: int,
        conn=None,
        *,
        available: Optional[list] = None,
    ) -> list[dict]:
        """Campaign cards for the future Promotions UI."""
        if available is None:
            available = self.getAvailableCampaigns(user_id, conn=conn)
        by_id = {int(c.id): c for c in available if c.id is not None}
        participations = {
            int(p.campaign_id): p for p in self.getParticipationsByUser(user_id, conn=conn)
        }

        # Include campaigns the user already joined even if no longer "available".
        missing_ids = [cid for cid in participations.keys() if cid not in by_id]
        if missing_ids:
            for campaign in self.getCampaignsByIds(missing_ids, conn=conn):
                if campaign.id is not None:
                    by_id[int(campaign.id)] = campaign

        priority_rank = {
            CAMPAIGN_PRIORITY_CRITICAL: 4,
            CAMPAIGN_PRIORITY_HIGH: 3,
            CAMPAIGN_PRIORITY_NORMAL: 2,
            CAMPAIGN_PRIORITY_LOW: 1,
        }
        cards = []
        for campaign_id, campaign in sorted(
            by_id.items(),
            key=lambda item: (
                priority_rank.get(item[1].priority, 0),
                item[1].id or 0,
            ),
            reverse=True,
        ):
            cards.append(
                self.getCampaignProgress(
                    user_id,
                    campaign,
                    conn=conn,
                    participation=participations.get(int(campaign_id)),
                )
            )
        return cards

    def getCampaignProgress(
        self,
        user_id: int,
        campaign: Campaign | int,
        conn=None,
        *,
        participation: Any = _CAMPAIGN_PROGRESS_LOOKUP,
    ) -> dict:
        if isinstance(campaign, int):
            loaded = self.getCampaignById(campaign, conn=conn)
            if loaded is None:
                return {"error": "campaign_not_found", "campaign_id": campaign}
            campaign = loaded

        if participation is _CAMPAIGN_PROGRESS_LOOKUP:
            participation = self.getParticipation(
                campaign_id=int(campaign.id),
                user_id=int(user_id),
                conn=conn,
            )
        snapshot = self._progress_tracker.build_snapshot(
            campaign,
            participation,
            event=None,
            context={"user_id": int(user_id)},
        )
        reward = campaign.reward()
        status = (
            participation.status
            if participation is not None
            else PARTICIPATION_STATUS_AVAILABLE
        )
        return {
            "campaign": campaign.to_dict(),
            "campaign_id": campaign.id,
            "code": campaign.code,
            "name": campaign.name,
            "type": campaign.type,
            "status": status,
            "progress": snapshot.to_dict(),
            "completion_percent": snapshot.to_dict()["percent"],
            "remaining": snapshot.remaining,
            "remaining_requirements": snapshot.label
            if snapshot.remaining not in (None, 0)
            else None,
            "expiration": campaign.ends_at.isoformat() if campaign.ends_at else None,
            "reward_description": self._reward_description(reward, campaign),
            "reward": reward,
            "participation": participation.to_dict() if participation else None,
        }

    @staticmethod
    def _reward_description(reward: dict, campaign: Campaign) -> str:
        if not reward:
            return campaign.description or campaign.name
        rtype = reward.get("type") or campaign.type
        if reward.get("bonus_percent") is not None:
            return f"{reward.get('bonus_percent')}% {rtype}".strip()
        if reward.get("amount") is not None:
            return f"${reward.get('amount')} {rtype}".strip()
        if reward.get("description"):
            return str(reward["description"])
        return campaign.description or campaign.name
