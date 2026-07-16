import sqlalchemy as sa
from config import db_url
from urllib.parse import parse_qs
import json

engine = sa.create_engine(db_url, echo=True)

metadata = sa.MetaData()

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

# `dice` is defined explicitly in database/dice_db.py (created via ensure_dice_schema).


def getTelegramUser(data): 
    pars_init_data = parse_qs(data.initdata)
    user = json.loads(pars_init_data["user"][0])

    return user

def getTelegramId(data): 
    pars_init_data = parse_qs(data.initdata)
    user = json.loads(pars_init_data["user"][0])
    telegram_id = user["id"]

    return telegram_id


