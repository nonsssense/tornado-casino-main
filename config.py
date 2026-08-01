from pathlib import Path

from dotenv import load_dotenv
import os

white_ids = {
    5478327492: "owner",
    1200219142: "owner",
    #456123789: "investor",
    #741852963: "support",
}

# Always resolve .env from the project root (this file's directory), not process cwd.
_ENV_FILE = Path(__file__).resolve().parent / '.env'
load_dotenv(_ENV_FILE)

bot_token = os.getenv('BOT_TOKEN')
admin_bot_token = os.getenv('ADMIN_BOT_TOKEN')
db_url = os.getenv('DB_URL')

# When true: SQLAlchemy echo + /api/debug/* routes. Production must leave unset/false.
DEBUG = os.getenv('DEBUG', 'false').strip().lower() in ('1', 'true', 'yes', 'on')

# Public bot username (without @) for referral Mini App deep links.
BOT_USERNAME = (os.getenv('BOT_USERNAME') or 'wwwinwwwin_bot').lstrip('@')
# Optional Mini App short name from BotFather. When set, links use /{short}?startapp=
MINI_APP_SHORT_NAME = (os.getenv('MINI_APP_SHORT_NAME') or '').strip().strip('/')

BLOCKBEE_API_KEY = os.getenv('API_BLOCKBEE')
DOMEN = os.getenv('DOMEN')
BLOCKBEE_PUBLIC_KEY_PATH = Path(os.getenv("BLOCKBEE_PUBLIC_KEY_PATH"))
binance_api_url = os.getenv('BINANCE_API')


# -------------------------- Game bet limits (backend source of truth) ----------
# Frontend mirrors these for UX only — never trust client-side checks alone.
BET_MIN = 0.10

DICE_BET_MAX = 5.00

PLINKO_BET_MAX_BY_RISK = {
    "high": 5.00,
    "medium": 20.00,
    "low": 80.00,
}

CRASH_BET_MAX_PER_SLOT = 4.90
CRASH_BET_MAX_TOTAL = 5.00
#------------------------------------------------------------------------------


# -------------------------- Economics (commercial seeds) -----------------------
# Source: docs/mvp-economics-launch-spec.md — change here, not in managers.

REFERRAL_ENABLED = True
AFFILIATE_ENABLED = False

# Per-game expected house edge for referral accrual (not a single global HE).
GAME_EDGES = {
    "dice": 0.025,
    "crash": 0.030,
    "plinco": {
        "low": 0.025,
        "medium": 0.030,
        "high": 0.040,
    },
}

# Welcome Bonus MVP rulebook — wager base is (Deposit + Bonus), not bonus-only.
DEPOSIT_BONUS_WAGER_MULTIPLIER = 35
DEPOSIT_BONUS_EXPIRES_DAYS = 7
DEPOSIT_BONUS_EDGE_BASIS = 0.030
# MQB: max stake amount that counts toward wagering (larger bets allowed).
# Stored on bonus_instances.max_bet for backward-compatible column reuse.
DEPOSIT_BONUS_MQB_PERCENT = 0.10
DEPOSIT_BONUS_MQB_ABSOLUTE = 5.0
# Legacy aliases — same MQB values (do not use as hard bet blocks).
DEPOSIT_BONUS_MAX_BET_PERCENT = DEPOSIT_BONUS_MQB_PERCENT
DEPOSIT_BONUS_MAX_BET_ABSOLUTE = DEPOSIT_BONUS_MQB_ABSOLUTE
DEPOSIT_BONUS_MAX_WIN_STAKE_MULTIPLIER = 50
DEPOSIT_BONUS_MAX_WIN_ABSOLUTE = 50.0
DEPOSIT_BONUS_MIN_DEPOSIT = 5.0
DEPOSIT_BONUS_MAX_BONUS = 50.0
# Product floor for credited deposits (USD). Effective min = max(this, BlockBee min).
DEPOSIT_MIN_USD = float(os.getenv("DEPOSIT_MIN_USD", "3") or 3)
# Product floor for withdrawal requests (USD). Enforced before hold / DB write.
WITHDRAW_MIN_USD = float(os.getenv("WITHDRAW_MIN_USD", "3") or 3)
DEPOSIT_BONUS_OFFER_VERSION = 2
# Every game counts 100% (marketing lock).
DEPOSIT_BONUS_ELIGIBLE_GAMES = {
    "dice": True,
    "crash": True,
    "plinco": True,
}

DEPOSIT_BONUS_OFFERS = (
    {
        "id": "deposit_tier_1",
        "source": "deposit_tier_1",
        "deposit_index": 1,
        "name": "Welcome Bonus — 50%",
        "percent": 50,
        "description": "50% on your 1st deposit · all games count",
        "wager_multiplier": DEPOSIT_BONUS_WAGER_MULTIPLIER,
        "expires_days": DEPOSIT_BONUS_EXPIRES_DAYS,
        "edge_basis": DEPOSIT_BONUS_EDGE_BASIS,
        "max_bet_percent_of_bonus": DEPOSIT_BONUS_MAX_BET_PERCENT,
        "max_bet_absolute": DEPOSIT_BONUS_MAX_BET_ABSOLUTE,
        "max_win_stake_multiplier": DEPOSIT_BONUS_MAX_WIN_STAKE_MULTIPLIER,
        "max_win_absolute": DEPOSIT_BONUS_MAX_WIN_ABSOLUTE,
        "eligible_games": DEPOSIT_BONUS_ELIGIBLE_GAMES,
        "offer_version": DEPOSIT_BONUS_OFFER_VERSION,
    },
    {
        "id": "deposit_tier_2",
        "source": "deposit_tier_2",
        "deposit_index": 2,
        "name": "Welcome Bonus — 75%",
        "percent": 75,
        "description": "75% on your 2nd deposit · all games count",
        "wager_multiplier": DEPOSIT_BONUS_WAGER_MULTIPLIER,
        "expires_days": DEPOSIT_BONUS_EXPIRES_DAYS,
        "edge_basis": DEPOSIT_BONUS_EDGE_BASIS,
        "max_bet_percent_of_bonus": DEPOSIT_BONUS_MAX_BET_PERCENT,
        "max_bet_absolute": DEPOSIT_BONUS_MAX_BET_ABSOLUTE,
        "max_win_stake_multiplier": DEPOSIT_BONUS_MAX_WIN_STAKE_MULTIPLIER,
        "max_win_absolute": DEPOSIT_BONUS_MAX_WIN_ABSOLUTE,
        "eligible_games": DEPOSIT_BONUS_ELIGIBLE_GAMES,
        "offer_version": DEPOSIT_BONUS_OFFER_VERSION,
    },
    {
        "id": "deposit_tier_3",
        "source": "deposit_tier_3",
        "deposit_index": 3,
        "name": "Welcome Bonus — 100%",
        "percent": 100,
        "description": "100% on your 3rd deposit · all games count",
        "wager_multiplier": DEPOSIT_BONUS_WAGER_MULTIPLIER,
        "expires_days": DEPOSIT_BONUS_EXPIRES_DAYS,
        "edge_basis": DEPOSIT_BONUS_EDGE_BASIS,
        "max_bet_percent_of_bonus": DEPOSIT_BONUS_MAX_BET_PERCENT,
        "max_bet_absolute": DEPOSIT_BONUS_MAX_BET_ABSOLUTE,
        "max_win_stake_multiplier": DEPOSIT_BONUS_MAX_WIN_STAKE_MULTIPLIER,
        "max_win_absolute": DEPOSIT_BONUS_MAX_WIN_ABSOLUTE,
        "eligible_games": DEPOSIT_BONUS_ELIGIBLE_GAMES,
        "offer_version": DEPOSIT_BONUS_OFFER_VERSION,
    },
)

# Customer referral (edge share %). Affiliate seeds kept for later — separate product.
REFERRAL_TIERS = {
    "Bronze": {"revshare_percent": 25, "min_qualified_ftd": 0},
    "Silver": {"revshare_percent": 30, "min_qualified_ftd": 3},
    "Gold": {"revshare_percent": 35, "min_qualified_ftd": 10},
}
REFERRAL_QUALIFIED_FTD_MIN = 3.0
REFERRAL_FTD_BOUNTY = 0.50
REFERRAL_FTD_BOUNTY_DAILY_CAP = 25.0
REFERRAL_HOLD_HOURS = 48
REFERRAL_MIN_CLAIM = 1.0

AFFILIATE_QUALIFIED_FTD_MIN = 5.0
AFFILIATE_TIERS = {
    "Starter": {"revshare_percent": 40},
    "Growth": {"revshare_percent": 50},
    "Pro": {"revshare_percent": 60},
}
AFFILIATE_INDIVIDUAL_MAX_PERCENT = 70
#------------------------------------------------------------------------------


# -------------------------- Plinco Multipier Schemes ---------------------------
plinko_tables = {
    "high": {
        8: [28, 4, 1.4, 0.3, 0.2, 0.3, 1.4, 4, 28],
        10: [55, 12, 2.5, 1, 0.3, 0.2, 0.3, 1, 2.5, 12, 55],
        12: [140, 28, 5, 3.1, 0.5, 0.2, 0.2, 0.2, 0.5, 3.1, 5, 28, 140],
        14: [340, 58, 10, 3.5, 1.6, 0.7, 0.4, 0.2, 0.4, 0.7, 1.6, 3.5, 10, 58, 340],
        16: [900, 120, 20, 8, 3, 2, 0.5, 0.2, 0.2, 0.2, 0.5, 2, 3, 8, 20, 120, 900],
    },
    "medium": {
        8: [11, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 11],
        10: [19, 6.5, 2.2, 1.1, 0.6, 0.4, 0.6, 1.1, 2.3, 6.5, 19],
        12: [35, 14, 3.5, 1.8, 1.1, 0.6, 0.3, 0.6, 1.1, 1.8, 3.5, 14, 35],
        14: [60, 27, 6, 3, 1.7, 1, 0.5, 0.4, 0.5, 1, 1.7, 3, 6, 27, 60],
        16: [110, 40, 10, 4.5, 3, 1.5, 1.1, 0.4, 0.3, 0.4, 1.1, 1.5, 3, 4.5, 10, 40, 110],
    },
    "low": {
        8: [5, 2, 1.1, 1, 0.45, 1, 1.1, 2, 5],
        10: [6, 3, 1.4, 1.1, 1, 0.45, 1, 1.1, 1.4, 3, 6],
        12: [10, 4.5, 2, 1.3, 1.2, 0.9, 0.45, 0.9, 1.2, 1.3, 2, 4.5, 10],
        14: [12, 6, 2, 1.5, 1.3, 1.1, 0.9, 0.5, 0.9, 1.1, 1.3, 1.5, 2, 6, 12],
        16: [16, 9, 2, 1.4, 1.3, 1.2, 1.2, 0.9, 0.5, 0.9, 1.2, 1.2, 1.3, 1.4, 2, 9, 16],
    },
}
#---------------------------------------------------------------------------------------