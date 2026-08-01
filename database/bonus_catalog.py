"""
Player-facing bonus catalog.

Bonus Cards are the single UI contract for My Bonuses.
Adding a future bonus type = add an entry to BONUS_CATALOG_ENTRIES
(and wire live state in BonusManager.listBonusCatalog when needed).
The frontend filters and renders whatever the API returns.
"""

from __future__ import annotations

from config import (
    DEPOSIT_BONUS_OFFERS,
    DEPOSIT_BONUS_MIN_DEPOSIT,
    DEPOSIT_BONUS_MAX_BONUS,
    DEPOSIT_BONUS_WAGER_MULTIPLIER,
    DEPOSIT_BONUS_EXPIRES_DAYS,
    DEPOSIT_BONUS_MQB_PERCENT,
    DEPOSIT_BONUS_MQB_ABSOLUTE,
    DEPOSIT_BONUS_MAX_BET_PERCENT,
    DEPOSIT_BONUS_MAX_BET_ABSOLUTE,
)

# ---------------------------------------------------------------------------
# Catalog registry — source of truth for My Bonuses presentation metadata.
# Commercial rules for deposit tiers still live on DEPOSIT_BONUS_OFFERS.
# ---------------------------------------------------------------------------

BONUS_CATALOG_ENTRIES = (
    {
        "id": "deposit_tier_1",
        "type": "deposit",
        "categories": ("deposit", "my_bonuses"),
        "order": 10,
        "banner": "/assets/bonus-banner-deposit-50.webp",
        "detail_banner": "/assets/bonus-info-50.png",
        "offer_id": "deposit_tier_1",
    },
    {
        "id": "deposit_tier_2",
        "type": "deposit",
        "categories": ("deposit", "my_bonuses"),
        "order": 20,
        "banner": "/assets/bonus-banner-deposit-75.webp",
        "detail_banner": "/assets/bonus-info-75.png",
        "offer_id": "deposit_tier_2",
    },
    {
        "id": "deposit_tier_3",
        "type": "deposit",
        "categories": ("deposit", "my_bonuses"),
        "order": 30,
        "banner": "/assets/bonus-banner-deposit-100.webp",
        "detail_banner": "/assets/bonus-info-100.png",
        "offer_id": "deposit_tier_3",
    },
)

# Filters are data-driven. category=None means "all active/visible bonuses".
BONUS_CATALOG_FILTERS = (
    {"id": "my_bonuses", "category": "my_bonuses", "label_key": "bonuses.filters.yours"},
    {"id": "all", "category": None, "label_key": "bonuses.filters.all"},
    {"id": "promocode", "category": "promocode", "label_key": "bonuses.filters.promo"},
    {"id": "deposit", "category": "deposit", "label_key": "bonuses.filters.deposit"},
)

BONUS_CATALOG_HERO = {
    "banner": "/assets/bonuses-main-banner.webp",
    "alt_key": "bonuses.hero.alt",
}

_OFFERS_BY_ID = {offer["id"]: offer for offer in DEPOSIT_BONUS_OFFERS}


def _format_games(eligible_games: dict | None) -> list[str]:
    if not eligible_games:
        return ["All Games"]
    labels = []
    if eligible_games.get("dice") is True:
        labels.append("Dice")
    crash = eligible_games.get("crash")
    if crash is True:
        labels.append("Crash")
    plinco = eligible_games.get("plinco")
    if plinco is True:
        labels.append("Plinko")
    elif isinstance(plinco, dict):
        labels.append("Plinko")
    if eligible_games.get("dice") and eligible_games.get("crash") and plinco:
        return ["All Games"]
    return labels or ["All Games"]


def _progress_from_instance(instance: dict | None, status: str) -> dict:
    if status in ("completed",):
        return {
            "percent": 100,
            "current": None,
            "required": None,
            "locked": False,
            "label": "completed",
        }
    if not instance:
        return {
            "percent": 0,
            "current": 0.0,
            "required": None,
            "locked": status == "locked",
            "label": status,
        }
    required = float(instance.get("wager_required") or 0)
    current = float(instance.get("wager_progress") or 0)
    percent = 0
    if required > 0:
        percent = int(round(min(100.0, max(0.0, (current / required) * 100.0))))
    return {
        "percent": percent,
        "current": current,
        "required": required,
        "locked": False,
        "label": status,
    }


def _button_for_status(status: str, claimable: bool) -> dict:
    if claimable:
        return {
            "action": "deposit",
            "enabled": True,
            "label_key": "bonuses.actions.claim",
        }
    if status == "completed":
        return {
            "action": "none",
            "enabled": False,
            "label_key": "bonuses.actions.claimed",
        }
    if status == "active":
        return {
            "action": "none",
            "enabled": False,
            "label_key": "bonuses.actions.in_progress",
        }
    if status == "expired":
        return {
            "action": "none",
            "enabled": False,
            "label_key": "bonuses.actions.expired",
        }
    # locked / upcoming / forfeited
    return {
        "action": "none",
        "enabled": False,
        "label_key": "bonuses.actions.locked",
    }


def _unlock_hint(offer: dict, completed_deposits: int, status: str) -> str | None:
    if status != "locked":
        return None
    return (
        "Finish your current Welcome Bonus to unlock the next one."
    )


def build_deposit_bonus_card(
    entry: dict,
    *,
    state: str,
    instance: dict | None,
    completed_deposits: int,
) -> dict:
    """Normalize a deposit-tier offer into a Bonus Card for the catalog API."""
    offer = _OFFERS_BY_ID.get(entry["offer_id"]) or {}
    # Map internal states onto catalog statuses.
    if state == "upcoming":
        status = "locked"
    elif state == "available":
        status = "available"
    elif state == "active":
        status = "active"
    elif state == "completed":
        status = "completed"
    elif state == "expired":
        status = "expired"
    elif state == "forfeited":
        status = "forfeited"
    else:
        status = str(state or "locked")

    claimable = status == "available"
    unlocked = status not in ("locked",)
    percent = offer.get("percent")
    wager_multiplier = offer.get("wager_multiplier", DEPOSIT_BONUS_WAGER_MULTIPLIER)
    expires_days = offer.get("expires_days", DEPOSIT_BONUS_EXPIRES_DAYS)
    eligible_games = offer.get("eligible_games") or {}

    serialized_instance = None
    if instance:
        # Accept either raw row-like or already serialized instance.
        serialized_instance = {
            "id": instance.get("id"),
            "principal": float(instance.get("principal") or 0),
            "wager_required": float(instance.get("wager_required") or 0),
            "wager_progress": float(instance.get("wager_progress") or 0),
            "wager_remaining": max(
                0.0,
                float(instance.get("wager_required") or 0)
                - float(instance.get("wager_progress") or 0),
            ),
            "mqb": (
                float(instance["max_bet"])
                if instance.get("max_bet") is not None
                else (
                    float(instance["mqb"])
                    if instance.get("mqb") is not None
                    else None
                )
            ),
            "max_bet": (
                float(instance["max_bet"])
                if instance.get("max_bet") is not None
                else None
            ),
            "max_win_cap": (
                float(instance["max_win_cap"])
                if instance.get("max_win_cap") is not None
                else None
            ),
            "expires_at": (
                instance["expires_at"].isoformat()
                if hasattr(instance.get("expires_at"), "isoformat")
                else instance.get("expires_at")
            ),
            "status": instance.get("status"),
        }

    progress = _progress_from_instance(serialized_instance, status)
    if status == "locked":
        progress["locked"] = True
        progress["percent"] = 0

    deposit_index = offer.get("deposit_index")
    return {
        "id": entry["id"],
        "type": entry["type"],
        "categories": list(entry["categories"]),
        "title": offer.get("name") or entry["id"],
        "description": offer.get("description") or "",
        "banner": entry["banner"],
        "detail_banner": entry.get("detail_banner") or entry["banner"],
        "reward": {
            "kind": "deposit_match",
            "percent": percent,
            "label": f"{percent}%" if percent is not None else None,
        },
        "status": status,
        "progress": progress,
        "claimable": claimable,
        "unlocked": unlocked,
        "order": entry["order"],
        "button": _button_for_status(status, claimable),
        "details": {
            "deposit_index": deposit_index,
            "min_deposit": float(DEPOSIT_BONUS_MIN_DEPOSIT),
            "max_bonus": float(DEPOSIT_BONUS_MAX_BONUS),
            "wager_multiplier": wager_multiplier,
            "wager_base": "deposit_plus_bonus",
            "mqb_percent": float(DEPOSIT_BONUS_MQB_PERCENT),
            "mqb_absolute": float(DEPOSIT_BONUS_MQB_ABSOLUTE),
            "max_bet_percent": float(DEPOSIT_BONUS_MAX_BET_PERCENT),
            "max_bet_absolute": float(DEPOSIT_BONUS_MAX_BET_ABSOLUTE),
            "games": _format_games(eligible_games),
            "expires_days": expires_days,
            "unlock_hint": _unlock_hint(offer, completed_deposits, status),
            "wager_remaining": (
                float(serialized_instance["wager_remaining"])
                if serialized_instance and serialized_instance.get("wager_remaining") is not None
                else None
            ),
            "expires_at": (
                serialized_instance.get("expires_at") if serialized_instance else None
            ),
        },
        "instance": serialized_instance,
    }


def list_catalog_entries():
    return [dict(entry) for entry in BONUS_CATALOG_ENTRIES]


def get_catalog_entry(bonus_id: str):
    for entry in BONUS_CATALOG_ENTRIES:
        if entry["id"] == bonus_id:
            return dict(entry)
    return None


def catalog_filters():
    return [dict(item) for item in BONUS_CATALOG_FILTERS]


def catalog_hero():
    return dict(BONUS_CATALOG_HERO)
