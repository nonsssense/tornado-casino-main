# ----config import-----
from config import bot_token

# ------fastapi import------
from fastapi import FastAPI, Response, Request, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

# --------extra imports--------
import asyncio
import os
import threading
import time
import uuid
from urllib.parse import quote
from pydantic import BaseModel
from aiogram.exceptions import TelegramConflictError

# ------ individual imports------
from games.game_manager import GameManager
from games.crash.router import router as crash_router
from games.crash.crash_game import crash_loop
from handler_helpers import prepareRequest
from bot import casino_dp, casino_bot
from admin_bot import admin_dp, admin_bot
from log_manager import log
from config import is_web_defence_enabled, plinko_tables
from telegram_auth import validate_init_data, has_telegram_id

# -------database imports------
from database.auth import userValidate, ensureDevBrowserUser
from database.bonus import BonusManager
from database.db_config import getTelegramId
from database.transactions import getUserTransactions
from database.wallet import WalletManager

# ----------payments-------------
from payments.deposit import BlockBeeClient, DepositManager, normalize_blockbee_ticker
from payments.withdraw import WithdrawManager

# -----------exceptions----------
from exceptions import notEnoughBalance

# ---------verifier-------------
from payments.verifier import BlockBeeVerifier

log.info("Starting FastAPI application...")

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
app.mount("/banners", StaticFiles(directory="banners"), name="banners")

# Vite production bundles (hashed JS/CSS/images). Directory may be empty until `npm run build`.
os.makedirs("dist/app", exist_ok=True)
app.mount("/app", StaticFiles(directory="dist/app"), name="app_build")

# Crash REST + WebSocket (implemented in games/crash/router.py)
app.include_router(crash_router)


def _index_html_path() -> str:
    """Prefer Vite build output; fall back to source index for local pre-build use."""
    dist_index = os.path.join("dist", "index.html")
    if os.path.isfile(dist_index):
        return dist_index
    return "index.html"

# Exactly one Crash loop task for this process
_crash_loop_task = None

# Bot polling: one task per bot, stopped cleanly on shutdown
_casino_bot_task = None
_admin_bot_task = None
_bots_enabled = False


def _bot_debug_ctx(label: str) -> str:
    task = asyncio.current_task()
    return (
        f"{label} | pid={os.getpid()} | thread={threading.get_ident()} | "
        f"task_id={id(task) if task else None} | "
        f"task_name={task.get_name() if task else None}"
    )


# функции для поддержки постоянной работы ботов. Если один падает - он перезапускается. В то время как другой продолжает работать.
async def start_casino_bot():
    log.info(_bot_debug_ctx("start_casino_bot() ENTERED"))
    while _bots_enabled:
        try:
            log.info(_bot_debug_ctx("casino start_polling() BEFORE"))
            await casino_dp.start_polling(casino_bot)
            log.info(_bot_debug_ctx("casino start_polling() EXITED normally"))
        except asyncio.CancelledError:
            log.info(_bot_debug_ctx("casino polling CancelledError"))
            raise
        except TelegramConflictError:
            log.error(
                _bot_debug_ctx(
                    "Casino TelegramConflictError: another getUpdates client is using "
                    "this bot token (duplicate process, uvicorn --reload overlap, or "
                    "run_bot.py still running)"
                )
            )
            if not _bots_enabled:
                break
            await asyncio.sleep(10)
        except Exception:
            log.exception(
                _bot_debug_ctx("Casino bot crashed. Restarting in 5 seconds...")
            )
            if not _bots_enabled:
                break
            await asyncio.sleep(5)
    log.info(_bot_debug_ctx("start_casino_bot() LOOP EXIT"))


async def start_admin_bot():
    log.info(_bot_debug_ctx("start_admin_bot() ENTERED"))
    while _bots_enabled:
        try:
            log.info(_bot_debug_ctx("admin start_polling() BEFORE"))
            await admin_dp.start_polling(admin_bot)
            log.info(_bot_debug_ctx("admin start_polling() EXITED normally"))
        except asyncio.CancelledError:
            log.info(_bot_debug_ctx("admin polling CancelledError"))
            raise
        except TelegramConflictError:
            log.error(
                _bot_debug_ctx(
                    "Admin TelegramConflictError: another getUpdates client is using "
                    "this bot token (duplicate process, uvicorn --reload overlap, or "
                    "admin_bot.py __main__ still running)"
                )
            )
            if not _bots_enabled:
                break
            await asyncio.sleep(10)
        except Exception:
            log.exception(
                _bot_debug_ctx("Admin bot crashed. Restarting in 5 seconds...")
            )
            if not _bots_enabled:
                break
            await asyncio.sleep(5)
    log.info(_bot_debug_ctx("start_admin_bot() LOOP EXIT"))


async def _stop_bot_polling(task, dispatcher, bot, name: str):
    log.info(_bot_debug_ctx(f"stopping {name} polling"))
    try:
        await dispatcher.stop_polling()
    except Exception:
        log.exception(_bot_debug_ctx(f"{name} stop_polling failed"))

    if task is not None and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    try:
        await bot.session.close()
    except Exception:
        log.exception(_bot_debug_ctx(f"{name} session.close failed"))

    log.info(_bot_debug_ctx(f"{name} polling stopped"))


# Запуск приложения FastAPI и ботов при старте            
@app.on_event("startup")
async def on_startup():
    global _crash_loop_task, _casino_bot_task, _admin_bot_task, _bots_enabled

    log.info(_bot_debug_ctx("FastAPI on_startup BEGIN"))
    _bots_enabled = True

    if _casino_bot_task is None or _casino_bot_task.done():
        _casino_bot_task = asyncio.create_task(
            start_casino_bot(),
            name="casino-bot-polling",
        )
        log.info(_bot_debug_ctx("Casino bot task CREATED"))
    else:
        log.warning(_bot_debug_ctx("Casino bot task already running; skip duplicate"))

    if _admin_bot_task is None or _admin_bot_task.done():
        _admin_bot_task = asyncio.create_task(
            start_admin_bot(),
            name="admin-bot-polling",
        )
        log.info(_bot_debug_ctx("Admin bot task CREATED"))
    else:
        log.warning(_bot_debug_ctx("Admin bot task already running; skip duplicate"))

    # Start Crash game loop once — crashLoop() also no-ops if already running
    if _crash_loop_task is None or _crash_loop_task.done():
        _crash_loop_task = asyncio.create_task(
            crash_loop.crashLoop(),
            name="crash-game-loop",
        )
        log.info(_bot_debug_ctx("Crash game loop task created"))
    else:
        log.info(_bot_debug_ctx("Crash game loop already running; skip duplicate start"))

    log.info(_bot_debug_ctx("FastAPI on_startup END"))


@app.on_event("shutdown")
async def on_shutdown():
    global _crash_loop_task, _casino_bot_task, _admin_bot_task, _bots_enabled

    log.info(_bot_debug_ctx("FastAPI on_shutdown BEGIN"))
    _bots_enabled = False

    await _stop_bot_polling(_casino_bot_task, casino_dp, casino_bot, "casino")
    _casino_bot_task = None

    await _stop_bot_polling(_admin_bot_task, admin_dp, admin_bot, "admin")
    _admin_bot_task = None

    if _crash_loop_task is not None and not _crash_loop_task.done():
        _crash_loop_task.cancel()
        try:
            await _crash_loop_task
        except asyncio.CancelledError:
            pass
        log.info(_bot_debug_ctx("Crash game loop task cancelled"))

    _crash_loop_task = None
    log.info(_bot_debug_ctx("FastAPI on_shutdown END"))


# Запуск эндпоинта для обслуживания фронтенда
@app.get("/")
async def serve_frontend():
    endpoint = "/"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        return FileResponse(_index_html_path())
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

class CrashRequest(BaseModel):
    bet_amount: int
    

class UserRequest(BaseModel):
    initdata: str = ""

# Роутер домашней страницы для аутентификации пользователя 
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
        response = FileResponse(_index_html_path())
        event_type = 'Auth'

        init_data = initdata.initdata or ""

        # Auth gate:
        # - WEB_DEFENCE=True  → production: valid Telegram InitData required (unchanged)
        # - WEB_DEFENCE=False → development: empty/stub/invalid InitData → ensureDevBrowserUser()
        #                       real valid Telegram InitData still accepted
        if is_web_defence_enabled():
            # Production: require valid Telegram InitData (unchanged security rules).
            if not has_telegram_id(init_data):
                raise HTTPException(
                    status_code=401,
                    detail="Invalid Telegram InitData")

            if not validate_init_data(init_data):
                raise HTTPException(
                    status_code=401,
                    detail="Invalid Telegram InitData")

            user_id = userValidate(initdata)
            telegram_id = getTelegramId(initdata)
            log.info(
                f"Telegram validation succeeded | request_id={request_id} | "
                f"telegram_id={telegram_id} | user_id={user_id}"
            )
        elif has_telegram_id(init_data) and validate_init_data(init_data):
            user_id = userValidate(initdata)
            telegram_id = getTelegramId(initdata)
            log.info(
                f"Development Telegram auth succeeded | request_id={request_id} | "
                f"telegram_id={telegram_id} | user_id={user_id}"
            )
        else:
            # Missing, empty, or stub InitData in local browser → fixed browser_dev user.
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
        _, user_id = prepareRequest(request, "dice")
        return GameManager(user_id).playDice(json)
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.get("/api/games/plinco/config")
async def plinco_config(request: Request):
    """Read-only Plinko payout tables from config.py for frontend bin labels."""
    endpoint = "/api/games/plinco/config"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        prepareRequest(request, 'plinco_config')
        return {
            "tables": plinko_tables,
            "rows": [8, 10, 12, 14, 16],
            "risk_modes": ["low", "medium", "high"],
        }
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
        _, user_id = prepareRequest(request, 'plinco')
        return GameManager(user_id).playPlinco(json)
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

class WithdrawRequest(BaseModel):
    ticker: str
    address: str
    amount: float

class BonusSelectRequest(BaseModel):
    offer_id: str


@app.get("/api/bonus/offers")
async def get_bonus_offers(request: Request):
    endpoint = "/api/bonus/offers"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "bonus_offers")
        return BonusManager(user_id).listDepositOffers()
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.get("/api/bonus/active")
async def get_active_bonuses(request: Request):
    endpoint = "/api/bonus/active"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "bonus_active")
        return {"bonuses": BonusManager(user_id).listActiveBonuses()}
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.post("/api/bonus/select")
async def select_bonus_offer(json: BonusSelectRequest, request: Request):
    endpoint = "/api/bonus/select"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "bonus_select")
        try:
            return BonusManager(user_id).selectDepositOffer(json.offer_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")

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
        real_balance = wallet.getRealBalance(wallet_id)
        bonus_balance = wallet.getBonusBalance(wallet_id)

        return {
            "balance": real_balance,
            "real_balance": real_balance,
            "bonus_balance": bonus_balance,
        }
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
        session_token, user_id = prepareRequest(request, "update_deposit_status")

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
                    "balance_type": row.get("balance_type"),
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


@app.post("/api/wallet/withdraw")
async def create_withdraw(json: WithdrawRequest, request: Request):
    session_token, user_id = prepareRequest(request, "withdraw")

    try:
        ticker = normalize_blockbee_ticker(json.ticker)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    address = json.address.strip()
    if not address:
        raise HTTPException(status_code=400, detail="Withdraw address is required")

    if json.amount <= 0:
        raise HTTPException(status_code=400, detail="Withdraw amount must be greater than zero")

    wallet = WalletManager(user_id)
    wallet_id = wallet.ensureWallet()

    withdraw = WithdrawManager(user_id)

    try:
        withdraw_id = withdraw.createWithdrawRequest(
            wallet_id=wallet_id,
            amount=json.amount,
            coin=ticker,
            address=address,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "withdraw_id": withdraw_id,
        "status": "PENDING",
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
        if full_path.startswith(("api", "crash", "static", "assets", "banners", "app")):
            log.warning(f"SPA fallback rejected reserved path | path={full_path}")
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(_index_html_path())
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")
