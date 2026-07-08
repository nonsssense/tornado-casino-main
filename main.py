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
from urllib.parse import quote
from pydantic import BaseModel

# ------ individual imports------
from games.Dice.dice import getDiceResult
from games.Plinco.plinco import getPlincoResult
from handler_helpers import prepareRequest, balanceCheck
from bot import dp, bot
from log_manager import log
from config import is_web_defence_enabled
from telegram_auth import validate_init_data, has_telegram_id

# -------database imports------
from database.auth import userValidate, ensureDevBrowserUser
from database.db_config import getTelegramId
from database.transactions import TransactionManager, getUserTransactions
from database.wallet import WalletManager
from database.bet import Bet
from database.plinco_db import postPlinco

# -----------exceptions----------
from exceptions import notEnoughBalance

# ----------payments-------------
from payments.deposit import BlockBeeClient, DepositManager, normalize_blockbee_ticker

# ---------verifier-------------
from payments.verifier import BlockBeeVerifier

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

        # Original TG-ID architecture + single WEB_DEFENCE exception when TG ID is missing.
        if has_telegram_id(initdata.initdata):
            if not validate_init_data(initdata.initdata):
                raise HTTPException(
                    status_code=401,
                    detail="Invalid Telegram InitData")

            user_id = userValidate(initdata)
            telegram_id = getTelegramId(initdata)
            log.info(
                f"Telegram validation succeeded | request_id={request_id} | "
                f"telegram_id={telegram_id} | user_id={user_id}"
            )
        else:
            if is_web_defence_enabled():
                raise HTTPException(
                    status_code=401,
                    detail="Invalid Telegram InitData")

            user_id = ensureDevBrowserUser()
            log.info(
                f"Development auth succeeded (WEB_DEFENCE=False) | request_id={request_id} | "
                f"user_id={user_id}"
            )

        session_token, _ = prepareRequest(request, user_id, event_type)

        response.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=False,
            samesite="Lax"
        )

        return response
    except HTTPException as e:
        if telegram_id is None and has_telegram_id(initdata.initdata):
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
        if telegram_id is None and has_telegram_id(initdata.initdata):
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
        session_token, user_id = prepareRequest(request, "dice")

        wallet = WalletManager(user_id)
        wallet_id = wallet.ensureWallet()
        
        balance = balanceCheck(wallet, wallet_id, json.bid)
        if balance == 'not enough':
            raise notEnoughBalance()

        bet_transaction = TransactionManager(user_id, wallet_id, 'dice bet', json.bid)
        bet_transaction_id = bet_transaction.postTransaction()

        result = getDiceResult(json)

        bet = Bet(user_id, bet_transaction_id)
        win_transaction = None
        
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
        session_token, user_id = prepareRequest(request, 'plinco')

        wallet = WalletManager(user_id)
        wallet_id = wallet.ensureWallet()

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

DEPOSIT_STATUS_MAP = {
    "Open deposit window": "pending",
    "Pending": "confirming",
    "Completed": "completed",
}

def mapDepositStatus(db_status):
    return DEPOSIT_STATUS_MAP.get(db_status, "pending")

@app.get("/api/wallet/balance")
async def get_wallet_balance(request: Request):
    endpoint = "/api/wallet/balance"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        session_token, user_id = prepareRequest(request, "balance")

        wallet = WalletManager(user_id)
        wallet_id = wallet.ensureWallet()
        balance = wallet.getBalance(wallet_id)

        return {"balance": balance or 0}
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")

@app.get("/api/wallet/deposit/status")
async def get_deposit_status(request: Request, deposit_id: int):
    endpoint = "/api/wallet/deposit/status"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        session_token, user_id = prepareRequest(request, "deposit_status")

        deposit = DepositManager(user_id)
        deposit_data = deposit.getDeposit(deposit_id)

        if deposit_data is None or deposit_data["user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Deposit not found")

        return {
            "deposit_id": deposit_id,
            "status": mapDepositStatus(deposit_data["status"]),
            "db_status": deposit_data["status"],
            "received_amount": deposit_data.get("received_amount"),
        }
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")

@app.get("/api/wallet/history")
async def get_wallet_history(request: Request):
    endpoint = "/api/wallet/history"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        session_token, user_id = prepareRequest(request, "history")

        transactions = getUserTransactions(user_id)

        return {
            "transactions": [
                {
                    "id": row["id"],
                    "type": row["type"],
                    "amount": row["amount"],
                    "status": row["status"],
                    "balance_after": row["balance_after"],
                }
                for row in transactions
            ]
        }
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")

@app.post("/api/wallet/deposit")
async def create_deposit(json: DepositRequest, request: Request):
    
    # create data about user and prepare request
    session_token, user_id = prepareRequest(request, "deposit")

    try:
        ticker = normalize_blockbee_ticker(json.ticker)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    wallet = WalletManager(user_id)
    wallet_id = wallet.ensureWallet()

    client = BlockBeeClient()
    deposit = DepositManager(user_id)
    deposit_id = deposit.postPreDeposit(wallet_id, ticker, "Open deposit window")

    try:
        payment = await client.create_payment_address(
            ticker=ticker,
            user_id=user_id,
            wallet_id=wallet_id,
            deposit_id=deposit_id
        )
    except Exception as exc:
        log.exception(
            f"BlockBee address creation failed | user_id={user_id} | "
            f"deposit_id={deposit_id} | ticker={ticker}"
        )
        raise HTTPException(
            status_code=502,
            detail="Unable to create deposit address for the selected network",
        ) from exc

    if payment is None:
        raise HTTPException(status_code=502, detail="Unable to create deposit address")

    deposit.updateAddressDeposit(deposit_id, payment["address"], payment["minimum"])

    qr_code = (
        "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="
        + quote(payment["address"])
    )

    return {
        **payment,
        "deposit_id": deposit_id,
        "ticker": ticker,
        "qr_code": qr_code,
    }


@app.post("/api/payment/webhook")
async def blockbee_webhook(request: Request):

    if not await BlockBeeVerifier().verify(request):
        raise HTTPException(
            status_code=401,
            detail='Invalid BlockBee Signature'
        )
    
    # Получаем JSON от BlockBee
    webhook = await request.json()
    
    # user_id прилетит в callback URL
    user_id = request.query_params.get("user_id")

    if user_id is None:
        return PlainTextResponse("*ok*", status_code=200)

    deposit = DepositManager(user_id)
    deposit_id = request.query_params.get("deposit_id")
    if deposit_id is None:
        return PlainTextResponse("*ok*", status_code=200)
    deposit_data = deposit.getDeposit(deposit_id)
    if deposit_data is None:
        return PlainTextResponse("*ok*", status_code=200)
    

    deposit.processWebhook(deposit_data, webhook)

    return PlainTextResponse("*ok*", status_code=200)


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

# tg bot start
async def main(): 
    log.info("Starting Telegram bot polling...")
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())
