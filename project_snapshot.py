#######################################################################
# FILE: bot.py
#######################################################################
from aiogram import Bot, Dispatcher
from aiogram.types import Message
from aiogram.filters import CommandStart
import asyncio
from config import bot_token

if bot_token is None:
    print(bot_token)
    #raise ValueError("BOT_TOKEN is not set in the environment variables.")
else:
    bot = Bot(token=bot_token)
dp = Dispatcher()

@dp.message(CommandStart())
async def start(message: Message):
    await message.answer('Hello!')

    
#######################################################################
# FILE: config.py
#######################################################################
from dotenv import load_dotenv
import os

load_dotenv('.env')

bot_token = os.getenv('BOT_TOKEN')
db_url = os.getenv('DB_URL')


# -------------------------- Plinco Multipier Schemes ---------------------------
plinko_tables = {
    "high": {
        8: [
            24.984, 3.897, 1.599, 0.29, 0.2,
            0.29, 1.599, 3.897, 24.984
        ],
        10: [
            54.363, 12.081, 2.617, 1.007, 0.292,
            0.171, 0.292, 1.007, 2.617, 12.081, 54.363
        ],
        12: [
            140.065, 28.013, 5.202, 1.901, 0.8,
            0.34, 0.18, 0.34, 0.8, 1.901,
            5.202, 28.013, 140.065
        ],
        14: [
            343.18, 58.542, 10.094, 3.634, 1.615,
            0.737, 0.373, 0.192, 0.373, 0.737,
            1.615, 3.634, 10.094, 58.542, 343.18
        ],
        16: [
            894.293, 119.239, 19.873, 5.962, 2.981,
            1.292, 0.795, 0.397, 0.199, 0.397,
            0.795, 1.292, 2.981, 5.962, 19.873,
            119.239, 894.293
        ]
    },

    "medium": {
        8: [
            10.971, 3.092, 1.297, 0.688, 0.389,
            0.688, 1.297, 3.092, 10.971
        ],
        10: [
            18.962, 6.786, 2.295, 1.098, 0.629,
            0.339, 0.629, 1.098, 2.295, 6.786, 18.962
        ],
        12: [
            34.538, 14.221, 3.86, 1.828, 1.016,
            0.589, 0.335, 0.589, 1.016, 1.828,
            3.86, 14.221, 34.538
        ],
        14: [
            60.598, 27.269, 6.262, 3.131, 1.717,
            1.01, 0.505, 0.313, 0.505, 1.01,
            1.717, 3.131, 6.262, 27.269, 60.598
        ],
        16: [
            110.033, 50.015, 10.003, 4.501, 2.901,
            1.5, 1.1, 0.4, 0.3, 0.4,
            1.1, 1.5, 2.901, 4.501, 10.003,
            50.015, 110.033
        ]
    },

    "low": {
        8: [
            5.457, 2.084, 1.091, 0.972, 0.486,
            0.972, 1.091, 2.084, 5.457
        ],
        10: [
            7.318, 3.208, 1.504, 1.103, 0.942,
            0.471, 0.942, 1.103, 1.504, 3.208, 7.318
        ],
        12: [
            9.834, 4.866, 1.825, 1.217, 1.115,
            0.963, 0.466, 0.963, 1.115, 1.217,
            1.825, 4.866, 9.834
        ],
        14: [
            13.094, 6.749, 2.015, 1.511, 1.209,
            1.108, 0.977, 0.433, 0.977, 1.108,
            1.209, 1.511, 2.015, 6.749, 13.094
        ],
        16: [
            16.001, 9.001, 2.0, 1.7, 1.3,
            1.2, 1.1, 1.0, 0.4, 1.0,
            1.1, 1.2, 1.3, 1.7, 2.0,
            9.001, 16.001
        ]
    }
}
#---------------------------------------------------------------------------------------
#######################################################################
# FILE: database/auth.py
#######################################################################
from urllib.parse import parse_qs
from database.db_config import users_table, engine, getTelegramId
import sqlalchemy as sa
import json
from games.probably_fair import ProvablyFair

def userValidate(data):
    telegram_id = getTelegramId(data)
    
    with engine.begin() as conn:
        stmt = (sa.select(users_table).where(users_table.c.tg_id == telegram_id))
        user_db = (conn.execute(stmt).mappings().first())

        if user_db:
            user_id = user_db['id']
        else:
            server_seed = ProvablyFair.generateServerSeed()
            conn.execute(sa.insert(users_table).values(tg_id=telegram_id,
                                                       client_seed=ProvablyFair.generateClientSeed(),
                                                       hash_server_seed=ProvablyFair.getServerSeedHash(server_seed),
                                                       nonce=1))
            stmt = (sa.select(users_table).where(users_table.c.tg_id == telegram_id))
            user_db = (conn.execute(stmt).mappings().first())
            
            user_id = user_db['id']
            
        
    return user_id
#######################################################################
# FILE: database/bet.py
#######################################################################
from database.db_config import engine, bet_table
from datetime import datetime
import sqlalchemy as sa


class Bet:
    def __init__(self, user_id, transaction_id):
        self.user_id = user_id
        self.transaction_id = transaction_id

    def createBet(self, game, amount, result, profit):
        with engine.begin() as conn:
            post_stmt = sa.insert(bet_table).values(transaction_id=self.transaction_id,
                                                     user_id=self.user_id,
                                                       game=game,
                                                         bet_amount=amount,
                                                           result=result,
                                                             profit=profit).returning(bet_table.c.id)
                                                             
            conn.execute(post_stmt)

    def updateWinTransaction(self, win_transaction_id, bet_id):
        with engine.begin() as conn:
            update_stmt = sa.update(bet_table.c.win_transaction_id).where(bet_table.c.id==bet_id).values(win_transaction_id)
            conn.execute(update_stmt)

        
#######################################################################
# FILE: database/db_config.py
#######################################################################
import sqlalchemy as sa
from config import db_url
from urllib import parse_qs
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

users_session_table = sa.Table(
    'user_session',
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

bet_wallet = sa.Table(
    'bets',
    metadata,
    autoload_with=engine
)

plinco_table = sa.Table(
    'plinco',
    metadata,
    autoload_with=engine
)

def getTelegramId(data): 
    pars_init_data = parse_qs(data.initdata)
    user = json.loads(pars_init_data["user"][0])
    telegram_id = user["id"]

    return telegram_id


#######################################################################
# FILE: database/event_treck.py
#######################################################################
from database.db_config import engine, user_events_table
import sqlalchemy as sa
from datetime import datetime

class Event:
    def __init__(self, user_id: int, event_type: str):
        self.user_id = user_id
        self.event_type = event_type

    def postEvent(self):
        with engine.begin() as conn:
            post_stmt = sa.insert(user_events_table).values(user_id=self.user_id, event_type=self.event_type, event_time_at=datetime.now())

            conn.execute(post_stmt)



#######################################################################
# FILE: database/plinco_db.py
#######################################################################
from database.db_config import engine, plinco_table
from database.user_db import getUserData
import sqlalchemy as sa
import json


def postPlinco(user_id, bet_id, game_data: json, result: json):
    user_data = getUserData(user_id)


    with engine.begin() as conn:
        post_stmt = sa.insert(plinco_table).values(user_id=user_id,
                                                   client_seed_used=user_data['client_seed'],
                                                   hash_server_seed=user_data['hash_server_seed'],
                                                   bet_id=bet_id,
                                                   nonce_used=user_data['nonce'],
                                                   rows=game_data['rows'],
                                                   risk_mode=game_data['rows'],
                                                   result=result['multipier'],
                                                   basket=result['basket'])
        conn.execute(post_stmt)

        
#######################################################################
# FILE: database/session.py
#######################################################################
from database.db_config import engine, getTelegramId, users_table, user_session_table
import sqlalchemy as sa
from urllib import parse_qs
import json
import datetime
import secrets

class SessionManager:
    def __init__(self, user_id, session_token):
        self.user_id = user_id
        self.session_token = session_token

    def createSession(self):
        with engine.begin() as conn:
            insert_stmt = (sa.insert(user_session_table).values(user_id=self.user_id, open_at=datetime.datetime.now(), session_token=self.session_token))
            conn.execute(insert_stmt)

    def closeSession(self):
        with engine.begin() as conn:
            close_stmt = (sa.select(user_session_table).where(session_token=self.session_token))
            session = conn.scalar(close_stmt)
    
            session.close_at = session.last_activity + datetime.timedelta(minutes=30)
            session.active_status = False

    def updateSession(self):
        with engine.begin() as conn:
            update_stmt = (sa.select(user_session_table).where(session_token=self.session_token))
            session = conn.scalar(update_stmt)

            if datetime.datetime.now() - session.last_activity > datetime.timedelta(minutes=30):
                self.closeSession()
            
            session.last_activity = datetime.datetime.now()

    def checkSessionStatus (self):
        if self.session_token:
            self.updateSession()
        else:
            self.session_token = secrets.token_urlsafe(32)
            self.createSession()
        
        return self.session_token

    

    

    

    
#######################################################################
# FILE: database/test1_db_config.py
#######################################################################
# set of db for the project
from sqlalchemy import ForeignKey, create_engine, text, Connection, MetaData, Table, Column, Integer, String, BigInteger, ForeignKey
# //user:password@host/dbname
engine = create_engine("sqlite+pysqlite:///:memory:", echo=True)
metadata = MetaData()

user_table = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", BigInteger, unique=True),
    Column("fullname", String),
)

address = Table(
    "addresses",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", ForeignKey("users.user_id")),
    Column("email", String, nullable=False),
)

metadata.create_all(engine)
metadata.drop_all(engine)
#######################################################################
# FILE: database/test2_db.py
#######################################################################
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, select
from sqlalchemy.orm import Mapped, as_declarative, declared_attr, mapped_column, Session

engine = create_engine("sqlite+pysqlite:///:memory:", echo=True)


# Создание таблиц с помощью ORM
@as_declarative()
class AbstractModel():
    id: Mapped[int] = mapped_column(autoincrement=True, primary_key=True)

    __allow_unmapped__ = False

    @classmethod
    @declared_attr
    def __tablename__(cls):
        return cls.__name__.lower()


class UserModel(AbstractModel):
    __tablename__ = "users"
    user_id: Mapped[int] = mapped_column(unique=True)
    name: Mapped[str] = mapped_column(String(30))
    fullname: Mapped[str] = mapped_column()


class AddressModel(AbstractModel):
    __tablename__ = "addresses"
    email: Mapped[str] = mapped_column(String(50), nullable=False)
    user_id= mapped_column(ForeignKey("users.id"))


# Создание обьектов таблиц 



with Session(engine) as session:
    with session.begin():
        AbstractModel.metadata.create_all(engine)
        user = UserModel(user_id=1, name="John", fullname="John Doe")
        session.add(user)
    with session.begin():
        res = session.execute(select(UserModel).where(UserModel.user_id == 1))
        user = res.scalar()
        
#######################################################################
# FILE: database/test3.py
#######################################################################
# Построение запросов Core
# Работа с данными Core 

import sqlalchemy as sa

engine = sa.create_engine("sqlite+pysqlite:///:memory:", echo=True)
metadata = sa.MetaData()

user_table = sa.Table(
    "users",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, unique=True, autoincrement=True),
    sa.Column("user_name", sa.String(30)),    
    sa.Column("fullname", sa.String(50))
)

address_table = sa.Table(
    "addresses",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, unique=True, autoincrement=True),
    sa.Column("email_address", sa.String(50), nullable=False),
    sa.Column("user_id", sa.ForeignKey("users.id")),
)


metadata.create_all(engine)

stmt = sa.insert(user_table).values(user_name="test", fullname="test test")
print(stmt)
        
#######################################################################
# FILE: database/transactions.py
#######################################################################
from database.db_config import engine, transaction_table, wallet_table
import sqlalchemy as sa
from database.wallet import WalletManager
from exceptions import notActualWallet, notEnoughBalance
from handler_helpers import balanceCheck


class TransactionManager:
    def __init__(self, user_id, wallet_id, type, amount, status="Processing", reference_id=None):
        self.user_id = user_id
        self.wallet_id = wallet_id
        self.type = type
        self.amount = amount
        self.status = status
        self.reference_id = reference_id

    def postTransaction(self):
        # wallet_table select and transaction_table insert 'll be in one sql transaction 

        with engine.begin() as conn:

            wallet = WalletManager(self.user_id)
            wallet_id = wallet.checkWalletStatus()

            result = conn.execute(getBalanceStmt(self.user_id))
            balance = result.scalar_one_or_none()
            balance_check_status = balanceCheck(wallet, wallet_id, self.amount)

            if balance is None:
                raise notActualWallet()
            if balance_check_status == 'not enough':
                raise notEnoughBalance()

            balance_after = balance + self.amouunt

            post_stmt = sa.insert(transaction_table).values(user_id=self.user_id,
                                                            wallet_id=self.wallet_id,
                                                            type=self.type,
                                                            amount=self.amount,
                                                            status='Done',
                                                            balance_after=balance_after).returning(transaction_table.c.id)
            
            transaction_id = conn.execute(post_stmt).scalar_one()
            wallet.updateBalance(conn, balance_after)

            return transaction_id

def getBalanceStmt(user_id):
    get_balance_stmt = sa.select(wallet_table.c.balance).where(wallet_table.c.user_id==user_id)

    return get_balance_stmt



#######################################################################
# FILE: database/user_db.py
#######################################################################
from db_config import engine, users_table
import sqlalchemy as sa

# datamase module for info about a users

# Работа с базой данных для получения информации о пользователях


# client_seed, hash_server_seed, nonce, 
def getUserData(user_id):

    with engine.begin() as conn:
        get_stmt = sa.select(users_table).where(users_table.c.id==user_id)
        result = conn.execute(get_stmt)

        response = {'hash_server_seed': result.hash_server_seed,
                    'client_seed': result.client_seed,
                    'nonce': result.nonce}
        
        updateUserNonce(user_id)
        return response

        

def updateUserNonce(user_id):
    with engine.begin() as conn:
        update_stmt = sa.update(users_table.c.nonce).where(users_table.c.id==user_id).values(nonce=+1)
        conn.execute(update_stmt)
        
#######################################################################
# FILE: database/wallet.py
#######################################################################
from database.db_config import engine, wallet_table
import sqlalchemy as sa
from datetime import datetime

def getWalletId(user_id):
    with engine.begin() as conn:
        get_stmt = sa.select(wallet_table.c.wallet_id).where(wallet_table.c.user_id==user_id)
        result = conn.execute(get_stmt)
        wallet_id = result.result.scalar_one_or_none()

        if wallet_id == None:
            return 'None'

        return wallet_id
    

class WalletManager:
    def __init__(self, user_id):
        self.user_id = user_id


    def checkWalletStatus(self):
        with engine.begin() as conn:
            get_stmt = sa.select(wallet_table).where(wallet_table.c.user_id==self.user_id)
            result = conn.execute(get_stmt)
            wallet = result.fetchone()

            if wallet is None:
                return None
            
            return wallet.id

    def createWallet(self):
        with engine.begin() as conn:
            post_stmt = sa.insert(wallet_table).values(user_id=self.user_id, type='real', created_at=datetime.now())
            conn.execute(post_stmt)

    # conn - required for atomar transactions
    def updateBalance(self, conn, balance_after): 
        update_stmt = sa.update(wallet_table.c.balance).where(wallet_table.c.user_id==self.user_id).values(balance=balance_after)
        conn.execute(update_stmt)

    def updateCurrency(self, currency):
        with engine.begin() as conn:
            update_stmt = sa.update(wallet_table.c.currency).where(wallet_table.c.user_id==self.user_id).values(balance=currency)
            conn.execute(update_stmt)

    def getBalance(self, wallet_id):
        with engine.begin() as conn:
            get_stmt = sa.select(wallet_table.c.balance).where(wallet_table.c.id==wallet_id)
            balance = conn.execute(get_stmt).scalar_one_or_none()

            return balance

#######################################################################
# FILE: exceptions.py
#######################################################################
from fastapi import HTTPException

def notEnoughBalance():
    return HTTPException(
        status_code=409,
        detail={
            "code": "NOT_ENOUGH_BALANCE",
            "title": "Insufficient balance",
            "message": "Please top up your balance."
        }
    )

def notActualWallet():
    return HTTPException(
        status_code=409,
        detail={
            'code': 'NOT_ACTUAL_BALANCE',
            'title': 'The wallet has not been created',
            'message': 'Please top up your balance'
        }
    )
#######################################################################
# FILE: games/Dice/dice.py
#######################################################################
# House edge in dice will be 2.5%
config = 97.5

from secrets import randbelow
from database.db_config import engine, user_events_table
from sqlalchemy import insert


balance = 100

bd = list()
def getChance(limit, over):

    if over:
        return 99 - limit

    return limit


def getFactor(chance: float):
    return config / chance


def get_payout(state, json, factor: float):
    if state:
        return (json.bid * factor) - json.bid
    else:
        return -json.bid


def roll(json):
    game_result = randbelow(100) # random value 0-100

    if json.over: # over true ?
        return json.limit < game_result
    else:
        return json.limit > game_result
    
insert_wo_values = insert(user_events_table)

def dice(json, result_of_game: bool, factor: float):
    #bd[balance].append(payout)
    # Здесь будет транзакция которая будет записывать результат в базуе данных + обновлять баланс игрока
    # with ...
    with engine.begin() as conn:
        result = conn.execute(insert_wo_values.values(
            user_id=json.user_id, # заправить данными таблицу
        ))
    
    payout = get_payout(result_of_game, json, factor)
    return {'payout': payout, 'result': result_of_game}
   



def getDiceResult(json, user_id):
    data = dice(json, roll(json), getFactor(getChance(json.limit, json.over)))
#######################################################################
# FILE: games/Plinco/plinco.py
#######################################################################
# House edge in dice will be 2.5%
from games.probably_fair import ProvablyFair
from config import plinko_tables
from fastapi import Request
from database.user_db import getUserData

def getPlinkoResult(json, user_id):

    user_data = getUserData(user_id)

    rows = json.rows
    bits = ProvablyFair.getBits(user_data['server_seed'], user_data['client_seed'], user_data['nonce'], rows)
    bid = json.bid
    risk_mode = json.risk_mode


    final_basket = sum(bits)
    multiplier = plinko_tables[risk_mode][rows][final_basket]

    result_json = {
        "payout": bid * multiplier,
        "multiplier": multiplier,
        "basket": final_basket,
        "path": bits,
        "nonce": user_data['nonce'],
        "server_seed_hash": user_data['server_seed_hash']
        }
    
    #with engine.begin() as conn:
        #pass

    return result_json



#######################################################################
# FILE: games/probably_fair.py
#######################################################################
import hmac
import hashlib
import secrets


class ProvablyFair:

    # Return a random server seed (32 bytes)
    @staticmethod
    def generateServerSeed() -> str:
        return secrets.token_hex(32) 

    # return a random client seed (16 bytes)
    @staticmethod
    def generateClientSeed() -> str:
        return secrets.token_hex(16)

    # return a hash of the server seed (sha256)
    @staticmethod
    def getServerSeedHash(server_seed: str) -> str:
        return hashlib.sha256(
            server_seed.encode()
        ).hexdigest()

    # return a hmac(scheme) of the server seed, client seed and nonce
    @staticmethod
    def getHmac(
        server_seed: str,
        client_seed: str,
        nonce: int
    ) -> bytes:

        message = f"{client_seed}:{nonce}"

        return hmac.new(
            server_seed.encode(),
            message.encode(),
            hashlib.sha256
        ).digest()

    @staticmethod
    def getBits(
        server_seed: str,
        client_seed: str,
        nonce: int,
        amount: int
    ) -> list[int]:

        digest = ProvablyFair.get_hmac(
            server_seed,
            client_seed,
            nonce
        )

        bits = []

        for byte in digest:

            for i in range(8):

                bit = (byte >> i) & 1

                bits.append(bit)

                if len(bits) == amount:
                    return bits

        return bits
    
#######################################################################
# FILE: handler_helpers.py
#######################################################################
from fastapi import Request
from database.event_treck import Event
from database.session import SessionManager
from database.db_config import engine, user_session_table
import sqlalchemy as sa
from database.wallet import getWalletId



def getUserId(session_token):
    with engine.begin() as conn:
        get_stmt = sa.select(user_session_table).where(session_id=session_token, active_status=True)
        session = conn.scalar(get_stmt)

        return session.user_id
    

def prepareRequest(request: Request, event_type):
    session_token = request.cookie.get("session_token")
    user_id = getUserId(session_token)
    

    session = SessionManager(user_id, session_token)
    session_token = session.checkSessionStatus()

    Event(user_id, event_type, ).postEvent()

    return session_token


def walletCheck(user_id):
    wallet_id = getWalletId(user_id)

    if wallet_id is None:
        return 'mase deposit'
    return wallet_id

def balanceCheck(wallet, wallet_id, bid):
    balance = wallet.getBalance(wallet_id)

    if balance < bid:
        return 'not enough'
    return balance
#######################################################################
# FILE: main.py
#######################################################################
# ----config import-----
from config import bot_token

# ------fastapi import------
from fastapi import FastAPI, Response, Request, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# --------extra imports--------
import asyncio
from pydantic import BaseModel

# ------ individual imports------
from games.Dice.dice import getDiceResult
from games.Plinco.plinco import getPlincoResult
from handler_helpers import prepareRequest, getUserId, walletCheck, balanceCheck
from bot import dp, bot

# -------database imports------
from database.auth import userValidate
from database.transactions import TransactionManager
from database.wallet import WalletManager
from database.bet import Bet
from database.plinco_db import postPlinco

# -----------exceptions----------
from exceptions import notEnoughBalance



app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

class DiceRequest(BaseModel):
    bid: float
    limit: int
    over: bool


class PlincoRequest(BaseModel):
    bid: float
    risk_mode: str
    rows: int


class UserRequest(BaseModel):
    initdata: str


@app.post("/api/auth")
async def root(response: Response, request:Request, initdata: UserRequest):
    response = FileResponse("index.html")
    event_type = 'Auth'

    # Firslty user validate. Check if user exist
    user_id = userValidate(initdata)

    # Then check session status
    session_token = prepareRequest(request, user_id, event_type)

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="Lax"
    )

    return response


@app.post('/api/games/rolldice')
async def roll_dice(json: DiceRequest, request: Request):
    session_token = prepareRequest(request, "dice")
    user_id = getUserId(session_token)

    wallet_id = walletCheck(user_id)
    wallet = WalletManager(user_id)
    balance = balanceCheck(wallet, wallet_id, json['bid'])
    if balance == 'not enough':
        raise notEnoughBalance()
    
    bet_transaction = TransactionManager(user_id, wallet_id, 'dice bet', json['bid'])
    bet_transaction_id = bet_transaction.postTransaction()

    result = getDiceResult(json)

    bet = Bet(user_id, bet_transaction_id)
    if result['result_of_game']:
        bet_id = bet.createBet('dice', json['bid'], 'Win', result['payout'])

        # after game transaction write
        win_transaction = TransactionManager(user_id, wallet_id, 'plinco ', (result['payout']))
        win_transaction_id = win_transaction.postTransaction()
    else:
        bet_id = bet.createBet('dice', json['bid'], 'Lose', result['payout'])

    if win_transaction:
        bet.updateWinTransaction(win_transaction_id, bet_id)

    


    return result


@app.post("/api/games/plinco")
async def plinco(json: PlincoRequest, request: Request):
    session_token = prepareRequest(request, 'plinco')
    user_id = getUserId(session_token)

    # wallet and balance check
    wallet_id = walletCheck(user_id)
    wallet = WalletManager(user_id)
    balance = balanceCheck(wallet, wallet_id, json['bid'])
    if balance == 'not enough':
        raise notEnoughBalance() 

    # bet transaction
    bet_transaction = TransactionManager(user_id, wallet_id, 'plinco bet', json['bid'])
    bet_transaction_id = bet_transaction.postTransaction()

    # game result
    result = getPlincoResult(json, user_id)

    # bet
    bet = Bet(user_id, bet_transaction_id)
    bet_id = bet.createBet('plinco', json['bid'], 'Win', result['payout'])

    # after game transaction write
    win_transaction = TransactionManager(user_id, wallet_id, 'plinco ', (result['payout']))
    win_transaction_id = win_transaction.postTransaction()

    bet.updateWinTransaction(win_transaction_id, bet_id)

    # game table post
    postPlinco(user_id, bet_id, json, result)


    return result
    

# tg bot start
async def main():
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())
#######################################################################
# FILE: router.py
#######################################################################
from fastapi import FastAPI
from pydantic import BaseModel
from games.Dice.dice import getChance, getFactor, roll, dice

app = FastAPI()

class DiceRequest(BaseModel):
    bid: float
    limit: int
    over: bool

# dice roll
@app.post('/api/games/rolldice')
async def roll_dice(json: DiceRequest):
    chance = getChance(json.limit, json.over)
    factor = getFactor(chance)
    result = roll(json)
    data = dice(json, result, factor)

    return data

