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

def getTelegramUser(data): 
    pars_init_data = parse_qs(data.initdata)
    user = json.loads(pars_init_data["user"][0])

    return user

def getTelegramId(data): 
    pars_init_data = parse_qs(data.initdata)
    user = json.loads(pars_init_data["user"][0])
    telegram_id = user["id"]

    return telegram_id


