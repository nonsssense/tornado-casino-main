# ----config import-----
from config import bot_token, DEBUG

# ------fastapi import------
from fastapi import FastAPI, Response, Request, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

# --------extra imports--------
import asyncio
import os
import threading
import time
import uuid
from typing import Literal
from urllib.parse import quote
from pydantic import BaseModel, Field
from aiogram.exceptions import TelegramConflictError

# ------ individual imports------
from games.game_manager import GameManager
from games.crash.router import router as crash_router
from games.crash.crash_game import crash_loop
from handler_helpers import prepareRequest, recordUserEvent
from bot import casino_dp, casino_bot
from admin_bot import admin_dp, admin_bot
from log_manager import log
from config import plinko_tables
from telegram_auth import validate_init_data, has_telegram_id, extract_telegram_user

# -------database imports------
from database.auth import userValidate, getUserDisplayFields, AccountBannedError, getWelcomeState, dismissWelcome
from database.bonus import BonusManager
from database.campaign import CampaignManager
from database.db_config import getTelegramId
from database.referral import ReferralManager
from database.user_settings import get_user_settings, update_user_settings
from database.wallet import WalletManager

# ----------payments-------------
from payments.deposit import (
    BlockBeeClient,
    DepositManager,
    normalize_blockbee_ticker,
    resolve_effective_deposit_minimum,
)
from payments.withdraw import WithdrawManager, WithdrawBelowMinimumError, get_withdraw_minimum_usd

# -----------exceptions----------
from exceptions import notEnoughBalance

# ---------verifier-------------
from payments.verifier import BlockBeeVerifier

log.info("Starting FastAPI application...")

app = FastAPI()

# Compress text responses when a reverse proxy is not terminating Brotli/gzip.
# Prefer nginx brotli+gzip in production (see deploy/nginx.conf.example).
app.add_middleware(GZipMiddleware, minimum_size=500)


@app.middleware("http")
async def static_cache_control(request: Request, call_next):
    """
    Browser cache policy:
    - hashed Vite bundles under /app → immutable long-cache
    - unhashed media folders → short/medium cache
    - HTML shell → always revalidate
    """
    response = await call_next(request)
    path = request.url.path or "/"

    if "Cache-Control" in response.headers:
        return response

    if path.startswith("/app/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif path.startswith(("/assets/", "/banners/", "/soundeffects/")):
        response.headers["Cache-Control"] = "public, max-age=604800"
    elif path == "/" or path.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response


app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
app.mount("/banners", StaticFiles(directory="banners"), name="banners")
app.mount("/soundeffects", StaticFiles(directory="soundeffects"), name="soundeffects")

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


def _index_html_response() -> FileResponse:
    return FileResponse(
        _index_html_path(),
        headers={"Cache-Control": "no-cache, must-revalidate"},
    )

# Exactly one Crash loop task for this process
_crash_loop_task = None

# Bot polling: one task per bot, stopped cleanly on shutdown
_casino_bot_task = None
_admin_bot_task = None
_bots_enabled = False

# Idle session sweeper — closes orphaned / idle active sessions
_session_sweeper_task = None


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
    from database.wallet import ensure_wallet_schema
    from database.campaign import ensure_campaign_schema
    from database.perf_indexes import ensure_hot_path_indexes
    from database.session import session_idle_sweeper_loop
    ensure_wallet_schema()
    ensure_campaign_schema()
    ensure_hot_path_indexes()
    global _crash_loop_task, _casino_bot_task, _admin_bot_task, _session_sweeper_task, _bots_enabled

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

    if _session_sweeper_task is None or _session_sweeper_task.done():
        _session_sweeper_task = asyncio.create_task(
            session_idle_sweeper_loop(),
            name="session-idle-sweeper",
        )
        log.info(_bot_debug_ctx("Session idle sweeper task created"))
    else:
        log.info(_bot_debug_ctx("Session idle sweeper already running; skip duplicate start"))

    log.info(_bot_debug_ctx("FastAPI on_startup END"))


@app.on_event("shutdown")
async def on_shutdown():
    global _crash_loop_task, _casino_bot_task, _admin_bot_task, _session_sweeper_task, _bots_enabled

    log.info(_bot_debug_ctx("FastAPI on_shutdown BEGIN"))
    _bots_enabled = False

    await _stop_bot_polling(_casino_bot_task, casino_dp, casino_bot, "casino")
    _casino_bot_task = None

    await _stop_bot_polling(_admin_bot_task, admin_dp, admin_bot, "admin")
    _admin_bot_task = None

    if _session_sweeper_task is not None and not _session_sweeper_task.done():
        _session_sweeper_task.cancel()
        try:
            await _session_sweeper_task
        except asyncio.CancelledError:
            pass
        log.info(_bot_debug_ctx("Session idle sweeper task cancelled"))
    _session_sweeper_task = None

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
        return _index_html_response()
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


class DiceRequest(BaseModel):
    bid: float
    limit: int = Field(..., ge=3, le=97)
    over: bool

class PlincoRequest(BaseModel):
    bid: float
    risk_mode: str
    rows: int


class PlincoBatchRequest(BaseModel):
    bid: float = Field(..., gt=0, allow_inf_nan=False)
    count: int = Field(..., ge=1, le=10)
    risk_mode: Literal["low", "medium", "high"]
    rows: Literal[8, 10, 12, 14, 16]
    idempotency_key: str = Field(
        ...,
        min_length=16,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
    )

class CrashRequest(BaseModel):
    bet_amount: int
    

class UserRequest(BaseModel):
    initdata: str = ""


class SettingsUpdateRequest(BaseModel):
    sound_enabled: bool | None = None
    haptic_enabled: bool | None = None


class TelegramDebugProbe(BaseModel):
    """Payload for DEBUG-only /api/debug/telegram."""

    version: str | None = None
    platform: str | None = None
    initData_exists: str
    HapticFeedback_exists: str
    safeAreaInset_exists: str
    contentSafeAreaInset_exists: str
    requestFullscreen_exists: str
    hideKeyboard_exists: str
    safeAreaInset: object | None = None
    contentSafeAreaInset: object | None = None


class LaunchDebugSnapshot(BaseModel):
    """Payload for DEBUG-only /api/debug/launch."""

    phase: str
    launch_id: str
    t_ms: float
    href: str = ""
    hash: str = ""
    hash_len: int = 0
    has_tg_web_app_data_in_hash: bool = False
    tg_web_app_data_len_from_hash: int = 0
    telegram_exists: bool = False
    webapp_exists: bool = False
    init_data_len: int = 0
    init_data_unsafe_user_id: int | str | None = None
    platform: str | None = None
    version: str | None = None
    stored_tg_web_app_data_len: int = 0
    note: str | None = None


if DEBUG:
    @app.post("/api/debug/launch")
    async def debug_launch_snapshot(payload: LaunchDebugSnapshot):
        """DEBUG only — Mini App launch timeline (SDK → bootstrap → auth)."""
        log.info(
            "[TG-LAUNCH] phase=%s | launch_id=%s | t_ms=%.1f | "
            "telegram=%s | webapp=%s | initData_len=%d | user_id=%s | "
            "hash_len=%d | hash_has_tgWebAppData=%s | hash_tgWebAppData_len=%d | "
            "stored_tgWebAppData_len=%d | platform=%s | version=%s | "
            "href=%s | hash=%s | note=%s",
            payload.phase,
            payload.launch_id,
            payload.t_ms,
            payload.telegram_exists,
            payload.webapp_exists,
            payload.init_data_len,
            payload.init_data_unsafe_user_id,
            payload.hash_len,
            payload.has_tg_web_app_data_in_hash,
            payload.tg_web_app_data_len_from_hash,
            payload.stored_tg_web_app_data_len,
            payload.platform,
            payload.version,
            payload.href[:300],
            payload.hash[:200],
            payload.note,
        )
        return {"ok": True}

    @app.post("/api/debug/telegram")
    async def debug_telegram_probe(payload: TelegramDebugProbe):
        """DEBUG only — Telegram Mini Apps API probe from the client WebView."""
        log.info(
            "[TG-PROBE] version=%s | platform=%s | initData_exists=%s | "
            "HapticFeedback_exists=%s | safeAreaInset_exists=%s | "
            "contentSafeAreaInset_exists=%s | requestFullscreen_exists=%s | "
            "hideKeyboard_exists=%s | safeAreaInset=%s | contentSafeAreaInset=%s",
            payload.version,
            payload.platform,
            payload.initData_exists,
            payload.HapticFeedback_exists,
            payload.safeAreaInset_exists,
            payload.contentSafeAreaInset_exists,
            payload.requestFullscreen_exists,
            payload.hideKeyboard_exists,
            payload.safeAreaInset,
            payload.contentSafeAreaInset,
        )
        return {"ok": True}


@app.get("/api/settings")
async def get_settings(request: Request):
    endpoint = "/api/settings"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "SettingsGet")
        return get_user_settings(user_id)
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.put("/api/settings")
async def put_settings(json: SettingsUpdateRequest, request: Request):
    endpoint = "/api/settings"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "SettingsUpdate")
        if json.sound_enabled is None and json.haptic_enabled is None:
            raise HTTPException(
                status_code=400,
                detail="Provide sound_enabled and/or haptic_enabled",
            )
        return update_user_settings(
            user_id,
            sound_enabled=json.sound_enabled,
            haptic_enabled=json.haptic_enabled,
        )
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


class ClientEventRequest(BaseModel):
    event_type: Literal["app_open", "page_nav", "game_open", "game_close"]


@app.post("/api/events")
async def post_client_event(json: ClientEventRequest, request: Request):
    """Record UI lifecycle events through the existing user_events table."""
    endpoint = "/api/events"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint} | event_type={json.event_type}")
    try:
        prepareRequest(request, json.event_type)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.post("/api/welcome/dismiss")
async def dismiss_welcome(request: Request):
    """Mark first-time welcome as seen — never show again for this user."""
    endpoint = "/api/welcome/dismiss"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "WelcomeDismiss")
        dismissWelcome(user_id)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


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
        event_type = 'Auth'
        init_data = initdata.initdata or ""

        if not init_data:
            raise HTTPException(
                status_code=401,
                detail="Invalid Telegram InitData",
            )

        if not has_telegram_id(init_data):
            raise HTTPException(
                status_code=401,
                detail="Invalid Telegram InitData",
            )

        if not validate_init_data(init_data):
            raise HTTPException(
                status_code=401,
                detail="Invalid Telegram InitData",
            )

        user_id, is_new_user = userValidate(initdata)
        telegram_id = getTelegramId(initdata)
        log.info(
            f"Telegram validation succeeded | request_id={request_id} | "
            f"telegram_id={telegram_id} | user_id={user_id} | is_new_user={is_new_user}"
        )

        session_token, _ = prepareRequest(request, user_id, event_type)

        response.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=False,
            samesite="Lax"
        )

        # Profile display fields — only after HMAC-validated initData.
        telegram_user = extract_telegram_user(init_data)
        if telegram_user is None and user_id is not None:
            telegram_user = getUserDisplayFields(user_id)

        welcome_state = getWelcomeState(user_id)
        welcome_variant = "referral" if welcome_state["referred"] else "default"

        return {
            "ok": True,
            "user_id": user_id,
            "telegram_id": telegram_id,
            "user": telegram_user,
            "is_new_user": bool(is_new_user),
            "welcome": {
                "show": bool(welcome_state["show"]),
                "variant": welcome_variant,
                "referred": bool(welcome_state["referred"]),
            },
        }
    except AccountBannedError:
        raise HTTPException(status_code=403, detail="Account is banned")
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
    session_token = None
    user_id = None
    try:
        session_token, user_id = prepareRequest(request, "dice")
        return GameManager(user_id).playDice(json)
    except HTTPException as exc:
        if user_id is not None and exc.status_code == 400:
            recordUserEvent(user_id, "ValidationError", session_token)
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
        # Stringify row keys so JSON clients never depend on int-key quirks.
        tables = {
            risk_mode: {
                str(int(rows)): [float(value) for value in table]
                for rows, table in risk_tables.items()
            }
            for risk_mode, risk_tables in plinko_tables.items()
        }
        return {
            "tables": tables,
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
    session_token = None
    user_id = None
    try:
        session_token, user_id = prepareRequest(request, 'plinco')
        return GameManager(user_id).playPlinco(json)
    except HTTPException as exc:
        if user_id is not None and exc.status_code == 400:
            recordUserEvent(user_id, "ValidationError", session_token)
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.post("/api/games/plinco/batch")
async def plinco_batch(json: PlincoBatchRequest, request: Request):
    endpoint = "/api/games/plinco/batch"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint} | count={json.count}")
    session_token = None
    user_id = None
    try:
        session_token, user_id = prepareRequest(request, "plinco_batch")
        return GameManager(user_id).playPlincoBatch(json)
    except HTTPException as exc:
        if user_id is not None and exc.status_code == 400:
            recordUserEvent(user_id, "ValidationError", session_token)
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


class DepositRequest(BaseModel):
    ticker: str
    # Optional: address creation does not require a declared amount.
    # When provided, it is validated against the effective deposit minimum.
    amount: float | None = Field(default=None, gt=0)


class WithdrawRequest(BaseModel):
    ticker: str
    address: str
    amount: float

class BonusSelectRequest(BaseModel):
    offer_id: str


@app.get("/api/bonuses/catalog")
async def get_bonuses_catalog(request: Request):
    """My Bonuses catalog — Bonus Cards + filters for the player UI."""
    endpoint = "/api/bonuses/catalog"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "bonuses_catalog")
        return BonusManager(user_id).listBonusCatalog()
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.get("/api/bonuses/catalog/{bonus_id}")
async def get_bonus_catalog_item(bonus_id: str, request: Request):
    """Single Bonus Card for the detail view."""
    endpoint = f"/api/bonuses/catalog/{bonus_id}"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "bonuses_catalog_detail")
        card = BonusManager(user_id).getBonusCard(bonus_id)
        if card is None:
            raise HTTPException(status_code=404, detail="Bonus not found")
        return card
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


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


@app.get("/api/campaigns")
async def get_campaigns(request: Request):
    """Player campaign board: personal progress + available offers."""
    endpoint = "/api/campaigns"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "campaigns")
        from database.db_config import engine as _db_engine

        mgr = CampaignManager()
        with _db_engine.begin() as conn:
            available_raw = mgr.getAvailableCampaigns(user_id, conn=conn)
            yours = mgr.getUserCampaigns(
                user_id, conn=conn, available=available_raw
            )
            yours_ids = {
                int(card.get("campaign_id"))
                for card in yours
                if card.get("campaign_id") is not None
            }
            available = []
            for campaign in available_raw:
                if campaign.id in yours_ids:
                    continue
                # Not in "yours" ⇒ no participation row; skip per-card lookup.
                available.append(
                    mgr.getCampaignProgress(
                        user_id,
                        campaign,
                        conn=conn,
                        participation=None,
                    )
                )

        active_bonuses = BonusManager(user_id).listActiveBonuses()
        return {
            "yours": yours,
            "available": available,
            "active_bonuses": active_bonuses,
        }
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.get("/api/campaigns/{campaign_id}")
async def get_campaign_detail(campaign_id: int, request: Request):
    endpoint = f"/api/campaigns/{campaign_id}"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "campaign_detail")
        mgr = CampaignManager()
        card = mgr.getCampaignProgress(user_id, int(campaign_id))
        if card.get("error"):
            raise HTTPException(status_code=404, detail="Campaign not found")
        return card
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.get("/api/referrals/status")
async def get_referral_status(request: Request):
    """Authenticated player's current referral tier (Bronze / Silver / Gold)."""
    endpoint = "/api/referrals/status"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "referral_status")
        return ReferralManager(user_id).player_status()
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.get("/api/referrals/summary")
async def get_referral_summary(request: Request):
    endpoint = "/api/referrals/summary"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "referral_summary")
        summary = ReferralManager(user_id).player_summary()
        if summary is None:
            raise HTTPException(status_code=404, detail="Referral profile not found")
        return summary
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


@app.post("/api/referrals/claim")
async def claim_referral_earnings(request: Request):
    endpoint = "/api/referrals/claim"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        _, user_id = prepareRequest(request, "referral_claim")
        return ReferralManager(user_id).claim_to_wallet()
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
    "Below minimum": "below_minimum",
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
        balances = wallet.getBalances()
        real_balance = balances["real_balance"]
        bonus_balance = balances["bonus_balance"]
        pending_balance = balances["pending_balance"]
        # Withdrawable cash = REAL (pending holds are already deducted from REAL).
        withdrawable_balance = real_balance

        bonus = BonusManager(user_id)
        bonus.expireDueBonuses(wallet.ensureWallet())
        active = bonus.getPrimaryActiveInstance()
        active_payload = None
        if active is not None:
            serialized = bonus._serializeInstance(active)
            active_payload = {
                "id": serialized["id"],
                "source": serialized["source"],
                "status": serialized["status"],
                "principal": serialized["principal"],
                "wager_required": serialized["wager_required"],
                "wager_progress": serialized["wager_progress"],
                "wager_remaining": serialized["wager_remaining"],
                "mqb": serialized.get("mqb"),
                "expires_at": serialized.get("expires_at"),
                "progress_percent": (
                    int(
                        round(
                            min(
                                100.0,
                                max(
                                    0.0,
                                    (
                                        float(serialized["wager_progress"])
                                        / float(serialized["wager_required"])
                                    )
                                    * 100.0,
                                ),
                            )
                        )
                    )
                    if float(serialized.get("wager_required") or 0) > 0
                    else 0
                ),
            }

        return {
            "balance": real_balance + bonus_balance,
            "real_balance": real_balance,
            "bonus_balance": bonus_balance,
            "pending_balance": pending_balance,
            "withdrawable_balance": withdrawable_balance,
            "available_balance": real_balance + bonus_balance,
            "active_welcome_bonus": active_payload,
            "has_active_welcome_bonus": active_payload is not None,
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
        session_token, user_id = prepareRequest(request)

        deposit = DepositManager(user_id)
        deposit_data = deposit.getDeposit(deposit_id)

        if deposit_data is None or deposit_data["user_id"] != user_id:
            raise HTTPException(status_code=404, detail="Deposit not found")

        return {
            "deposit_id": deposit_id,
            "status": mapDepositStatus(deposit_data["status"]),
            "db_status": deposit_data["status"],
            "received_amount": deposit_data.get("received_amount"),
            "bonus_granted": deposit_data.get("bonus_granted"),
            "bonus_skipped_reason": deposit_data.get("bonus_skipped_reason"),
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
async def get_wallet_history(request: Request, category: str = "all"):
    endpoint = "/api/wallet/history"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        session_token, user_id = prepareRequest(request, "history")
        from database.history import get_user_history

        return get_user_history(user_id, category=category, limit=100)
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")

@app.get("/api/wallet/deposit/minimum")
async def get_deposit_minimum(request: Request, ticker: str):
    """Return effective deposit minimum for a ticker without creating a deposit."""
    endpoint = "/api/wallet/deposit/minimum"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        prepareRequest(request, "deposit")

        try:
            normalized = normalize_blockbee_ticker(ticker)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        client = BlockBeeClient()
        try:
            info = await client.get_ticker_info(normalized)
        except Exception as exc:
            log.exception(f"BlockBee ticker info failed | ticker={normalized}")
            raise HTTPException(
                status_code=502,
                detail="Unable to resolve deposit minimum for the selected network",
            ) from exc

        mins = resolve_effective_deposit_minimum(normalized, info.get("minimum"))
        return {
            "ticker": normalized,
            **mins,
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
    # Create a deposit address for the selected ticker.
    # Declared amount is optional and only used for early minimum validation.
    session_token, user_id = prepareRequest(request, "deposit")

    try:
        ticker = normalize_blockbee_ticker(json.ticker)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    amount_usd = float(json.amount) if json.amount is not None else None

    client = BlockBeeClient()
    try:
        info = await client.get_ticker_info(ticker)
    except Exception as exc:
        log.exception(f"BlockBee ticker info failed before deposit | user_id={user_id} | ticker={ticker}")
        raise HTTPException(
            status_code=502,
            detail="Unable to resolve deposit minimum for the selected network",
        ) from exc

    mins = resolve_effective_deposit_minimum(ticker, info.get("minimum"))
    if amount_usd is not None and amount_usd + 1e-9 < float(mins["minimum_usd"]):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "below_minimum",
                "minimum": mins["minimum"],
                "minimum_usd": mins["minimum_usd"],
                "message": f"Minimum deposit is ${mins['minimum_usd']}",
            },
        )

    wallet = WalletManager(user_id)
    wallet_id = wallet.ensureWallet()

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

    # Prefer the stricter of info-derived and create-response BlockBee minima for storage/UI.
    create_mins = resolve_effective_deposit_minimum(ticker, payment.get("minimum"))
    if float(create_mins["minimum_usd"]) > float(mins["minimum_usd"]):
        mins = create_mins

    payment["minimum"] = mins["minimum"]
    payment["minimum_usd"] = mins["minimum_usd"]
    if amount_usd is not None:
        payment["amount"] = amount_usd

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


@app.get("/api/wallet/withdraw/minimum")
async def get_withdraw_minimum(request: Request):
    """Return configured product withdrawal minimum (USD)."""
    endpoint = "/api/wallet/withdraw/minimum"
    start = time.perf_counter()
    log.info(f"Endpoint started | endpoint={endpoint}")
    try:
        prepareRequest(request)
        return {"minimum_usd": get_withdraw_minimum_usd()}
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")


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

    minimum_usd = get_withdraw_minimum_usd()
    if float(json.amount) + 1e-9 < minimum_usd:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "below_minimum",
                "minimum_usd": minimum_usd,
                "message": f"Minimum withdrawal is ${minimum_usd:g}",
            },
        )

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
    except WithdrawBelowMinimumError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "below_minimum",
                "minimum_usd": exc.minimum_usd,
                "message": str(exc),
            },
        ) from exc
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
    user_id_raw = request.query_params.get("user_id")

    if user_id_raw is None:
        log.error("Webhook received without user_id")
        return PlainTextResponse("*ok*", status_code=200)
    
    try:
        user_id = int(user_id_raw)
    except ValueError:
        log.error(f"Invalid user_id: {user_id_raw}")
        return PlainTextResponse("*ok*", status_code=200)

    if user_id is None:
        return PlainTextResponse("*ok*", status_code=200)

    deposit = DepositManager(user_id)
    deposit_id_raw = request.query_params.get("deposit_id")
    
    if deposit_id_raw is None:
        log.error("Webhook received without deposit_id")
        return PlainTextResponse("*ok*", status_code=200)
    
    try:
        deposit_id = int(deposit_id_raw)
    except ValueError:
        log.error(f"Invalid deposit_id: {deposit_id_raw}")
        return PlainTextResponse("*ok*", status_code=200)

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
        return _index_html_response()
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Endpoint failed | endpoint={endpoint}")
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        log.info(f"Endpoint completed | endpoint={endpoint} | duration_ms={duration_ms:.2f}")
