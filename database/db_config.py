import sqlalchemy as sa
from config import db_url, DEBUG
from urllib.parse import parse_qs, unquote
import json

engine = sa.create_engine(db_url, echo=DEBUG)

metadata = sa.MetaData()

with engine.begin() as _conn:
    _conn.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_id INTEGER"
    ))
    _conn.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_pending BOOLEAN NOT NULL DEFAULT FALSE"
    ))

user_events_table = sa.Table(
    "user_events",
    metadata,
    autoload_with=engine
)

users_table = sa.Table(
    "users",
    metadata,
    autoload_with=engine
)

user_session_table = sa.Table(
    'user_sessions',
    metadata,
    autoload_with=engine
)

transaction_table = sa.Table(
    "transactions",
    metadata,
    autoload_with=engine
)

wallet_table = sa.Table(
    'wallet',
    metadata,
    autoload_with=engine
)

bet_table = sa.Table(
    'bets',
    metadata,
    autoload_with=engine
)

plinco_table = sa.Table(
    'plinco',
    metadata,
    autoload_with=engine
)

deposit_table = sa.Table(
    'deposit',
    metadata,
    autoload_with=engine
)

bonus_instances_table = sa.Table(
    'bonus_instances',  
    metadata,
    autoload_with=engine
)

frebet_grants_table = sa.Table(
    'frebet_grants',  
    metadata,
    autoload_with=engine
)

freebet_ticket_table = sa.Table(
    'freebet_tickets',  
    metadata,
    autoload_with=engine
)

withdrawal_addresses_table = sa.Table(
    'withdrawal_addresses',
    metadata,
    autoload_with=engine
)

fraud_signals_table = sa.Table(
    'fraud_signals',
    metadata,
    autoload_with=engine
)

user_trust_score_table = sa.Table(
    'user_trust_score',
    metadata,
    autoload_with=engine
)

withdraw_table = sa.Table(
    'withdraws',
    metadata,
    autoload_with=engine
)

crash_table = sa.Table(
    'crash',
    metadata,
    autoload_with=engine
)


def _ensure_referral_tables():
    """Create referral tables/columns expected by ReferralManager if missing."""
    ddl = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_id INTEGER",
        """
        CREATE TABLE IF NOT EXISTS referral_profiles (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE,
            referral_key VARCHAR(32) NOT NULL UNIQUE,
            status VARCHAR(32) NOT NULL DEFAULT 'Bronze',
            revshare_percent NUMERIC NOT NULL DEFAULT 25,
            referral_link TEXT,
            total_invites INTEGER NOT NULL DEFAULT 0,
            pending_earnings NUMERIC NOT NULL DEFAULT 0,
            available_earnings NUMERIC NOT NULL DEFAULT 0,
            lifetime_earned NUMERIC NOT NULL DEFAULT 0,
            qualified_ftd_count INTEGER NOT NULL DEFAULT 0,
            bounty_day DATE,
            bounty_earned_today NUMERIC NOT NULL DEFAULT 0,
            payout_frozen BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS referrals (
            id SERIAL PRIMARY KEY,
            referrer_id INTEGER NOT NULL,
            referred_id INTEGER NOT NULL UNIQUE,
            registred_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
            status VARCHAR(32) NOT NULL DEFAULT 'Bronze',
            qualified_at TIMESTAMP WITHOUT TIME ZONE,
            ftd_amount NUMERIC
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS referral_commissions (
            id SERIAL PRIMARY KEY,
            referrer_id INTEGER NOT NULL,
            referred_id INTEGER,
            amount NUMERIC NOT NULL,
            stake NUMERIC NOT NULL DEFAULT 0,
            game VARCHAR(32),
            risk_mode VARCHAR(32),
            edge NUMERIC,
            revshare_percent NUMERIC,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
            available_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            claimed_at TIMESTAMP WITHOUT TIME ZONE
        )
        """,
        "ALTER TABLE referral_profiles ADD COLUMN IF NOT EXISTS pending_earnings NUMERIC NOT NULL DEFAULT 0",
        "ALTER TABLE referral_profiles ADD COLUMN IF NOT EXISTS available_earnings NUMERIC NOT NULL DEFAULT 0",
        "ALTER TABLE referral_profiles ADD COLUMN IF NOT EXISTS lifetime_earned NUMERIC NOT NULL DEFAULT 0",
        "ALTER TABLE referral_profiles ADD COLUMN IF NOT EXISTS qualified_ftd_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE referral_profiles ADD COLUMN IF NOT EXISTS bounty_day DATE",
        "ALTER TABLE referral_profiles ADD COLUMN IF NOT EXISTS bounty_earned_today NUMERIC NOT NULL DEFAULT 0",
        "ALTER TABLE referral_profiles ADD COLUMN IF NOT EXISTS payout_frozen BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE referrals ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMP WITHOUT TIME ZONE",
        "ALTER TABLE referrals ADD COLUMN IF NOT EXISTS ftd_amount NUMERIC",
    ]
    with engine.begin() as conn:
        for statement in ddl:
            conn.execute(sa.text(statement))


_ensure_referral_tables()

referrals = sa.Table(
    'referrals',
    metadata,
    autoload_with=engine
)

referral_profiles = sa.Table(
    'referral_profiles',
    metadata,
    autoload_with=engine
)

referral_commissions = sa.Table(
    'referral_commissions',
    metadata,
    autoload_with=engine
)


# `dice` is defined explicitly in database/dice_db.py (created via ensure_dice_schema).


def getTelegramUser(data):
    init_data = getattr(data, "initdata", None) or ""
    pars_init_data = parse_qs(init_data, keep_blank_values=True)
    user = json.loads(pars_init_data["user"][0])
    user["start_param"] = _extract_start_param(init_data, pars_init_data)
    return user


def getTelegramId(data):
    pars_init_data = parse_qs(getattr(data, "initdata", None) or "", keep_blank_values=True)
    user = json.loads(pars_init_data["user"][0])
    return user["id"]


def _extract_start_param(init_data: str, parsed=None):
    """Read Mini App start_param from signed initData (?startapp= → start_param)."""
    if parsed is None:
        parsed = parse_qs(init_data or "", keep_blank_values=True)

    value = parsed.get("start_param", [None])[0]
    if value:
        return value

    if not init_data:
        return None

    for part in str(init_data).split("&"):
        if part.startswith("start_param="):
            raw = part.split("=", 1)[1]
            return unquote(raw) or None
    return None


