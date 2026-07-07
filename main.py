# ----config import-----
from config import bot_token

# ------fastapi import------
from fastapi import FastAPI, Response, Request, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

# --------extra imports--------
import asyncio
import time
import uuid
from pydantic import BaseModel

# ------ individual imports------
from games.Dice.dice import getDiceResult
from games.Plinco.plinco import getPlincoResult
from handler_helpers import prepareRequest, getUserId, walletCheck, balanceCheck
from bot import dp, bot
from log_manager import log
from telegram_auth import validate_init_data

# -------database imports------
from database.auth import userValidate
from database.db_config import getTelegramId
from database.transactions import TransactionManager
from database.wallet import WalletManager
from database.bet import Bet
from database.plinco_db import postPlinco

# -----------exceptions----------
from exceptions import notEnoughBalance

# ----------payments-------------
#from payments.deposit import BlockBeeClient, DepositManager

# ---------verifier-------------
#from payments.verifier import BlockBeeVerifier

log.info("Starting FastAPI application...")

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
app.mount("/banners", StaticFiles(directory="banners"), name="banners")

INDEX_HTML = "index.html"


@app.on_event("startup")
async def on_startup():
    log.info("FastAPI application startup completed")


@app.get("/")
async def serve_frontend():
    endpoint = "/"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        return FileResponse(INDEX_HTML)
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    endpoint = f"/{full_path}"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        if full_path.startswith(("api", "static", "assets", "banners")):
            log.warning(f"SPA fallback rejected reserved path | path={full_path}")
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(INDEX_HTML)
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")

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
async def root(response: Response, request: Request, initdata: UserRequest):

    if not validate_init_data(initdata.initdata):
        raise HTTPException(
            status_code=401,
            detail="Invalid Telegram InitData")

    endpoint = "/api/auth"
    request_id = str(uuid.uuid4())
    telegram_id = None
    user_id = None
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    log.info(f"Authentication request received | request_id={request_id}")
    
    try:
        response = FileResponse("index.html")
        event_type = 'Auth'

        user_id = userValidate(initdata)
        telegram_id = getTelegramId(initdata)
        log.info(
            f"Telegram validation succeeded | request_id={request_id} | "
            f"telegram_id={telegram_id} | user_id={user_id}"
        )

        session_token = prepareRequest(request, user_id, event_type)

        response.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=False,
            samesite="Lax"
        )

        return response
    except HTTPException as e:
        if telegram_id is None:
            try:
                telegram_id = getTelegramId(initdata)
            except Exception:
                pass
        log.warning(
            f"Authentication failed | request_id={request_id} | "
            f"telegram_id={telegram_id} | user_id={user_id} | reason={e.detail}"
        )
        raise
    except Exception:
        if telegram_id is None:
            try:
                telegram_id = getTelegramId(initdata)
            except Exception as validation_error:
                log.exception(
                    f"Authentication failed | request_id={request_id} | "
                    f"telegram_id=None | user_id=None | "
                    f"reason=telegram_validation_failed | error={type(validation_error).__name__}"
                )
                raise
        log.exception(
            f"Authentication failed | request_id={request_id} | "
            f"telegram_id={telegram_id} | user_id={user_id}"
        )
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.post('/api/games/rolldice')
async def roll_dice(json: DiceRequest, request: Request):
    endpoint = "/api/games/rolldice"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        session_token = prepareRequest(request, "dice")
        user_id = getUserId(session_token)

        wallet_id = walletCheck(user_id)
        wallet = WalletManager(user_id)
        balance = balanceCheck(wallet, wallet_id, json.bid)
        if balance == 'not enough':
            raise notEnoughBalance()

        bet_transaction = TransactionManager(user_id, wallet_id, 'dice bet', json.bid)
        bet_transaction_id = bet_transaction.postTransaction()

        result = getDiceResult(json)

        bet = Bet(user_id, bet_transaction_id)
        if result['result_of_game']:
            bet_id = bet.createBet('dice', json.bid, 'Win', result['payout'])

            win_transaction = TransactionManager(user_id, wallet_id, 'plinco ', (result['payout']))
            win_transaction_id = win_transaction.postTransaction()
        else:
            bet_id = bet.createBet('dice', json.bid, 'Lose', result['payout'])

        if win_transaction:
            bet.updateWinTransaction(win_transaction_id, bet_id)

        return result
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.post("/api/games/plinco")
async def plinco(json: PlincoRequest, request: Request):
    endpoint = "/api/games/plinco"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        session_token = prepareRequest(request, 'plinco')
        user_id = getUserId(session_token)

        wallet_id = walletCheck(user_id)
        wallet = WalletManager(user_id)
        balance = balanceCheck(wallet, wallet_id, json.bid)
        if balance == 'not enough':
            raise notEnoughBalance()

        bet_transaction = TransactionManager(user_id, wallet_id, 'plinco bet', json.bid)
        bet_transaction_id = bet_transaction.postTransaction()

        result = getPlincoResult(json, user_id)

        bet = Bet(user_id, bet_transaction_id)
        bet_id = bet.createBet('plinco', json.bid, 'Win', result['payout'])

        win_transaction = TransactionManager(user_id, wallet_id, 'plinco ', (result['payout']))
        win_transaction_id = win_transaction.postTransaction()

        bet.updateWinTransaction(win_transaction_id, bet_id)

        postPlinco(user_id, bet_id, json, result)

        return result
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")
    
class DepositRequest(BaseModel):
    ticker:str

#@app.post("/api/wallet/deposit")
#async def create_deposit(json: DepositRequest, request: Request):
    
    # create data about user and prepare request
    #session_token = prepareRequest(request, "deposit")
    #user_id = getUserId(session_token)
    #wallet = WalletManager(user_id)
    #wallet_id = wallet.checkWalletStatus()

    #client = BlockBeeClient()
    #deposit = DepositManager(user_id)
    #deposit_id = deposit.postPreDeposit(wallet_id, json.ticker, "Open deposit window")

    #payment = await client.create_payment_address(
        #ticker=json.ticker,
        #user_id=user_id,
        #wallet_id=wallet_id,
        #deposit_id=deposit_id
    #)

    #if payment is None:
        #raise HTTPException(500)

    #deposit.updateAddressDeposit(deposit_id, payment["address"], payment["minimum"])


    #return payment


#@app.post("/api/payment/webhook")
#async def blockbee_webhook(request: Request):

    #if not await BlockBeeVerifier().verify(request):
        #raise HTTPException(
            #status_code=401,
            #detail='Invalid BlockBee Signature'
        #)
    
    # Получаем JSON от BlockBee
    #webhook = await request.json()

    # user_id прилетит в callback URL
    #user_id = request.query_params.get("user_id")

    #if user_id is None:
        #return PlainTextResponse("*ok*", status_code=200)

    #deposit = DepositManager(user_id)
    #deposit_id = request.query_params.get("deposit_id")
    #if deposit_id is None:
        #return PlainTextResponse("*ok*", status_code=200)
    #deposit_data = deposit.getDeposit(deposit_id)
    #if deposit_data is None:
        #return PlainTextResponse("*ok*", status_code=200)
    

    #deposit.processWebhook(deposit_data, webhook)

    #return PlainTextResponse("*ok*", status_code=200)

# tg bot start
async def main(): 
    log.info("Starting Telegram bot polling...")
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())
