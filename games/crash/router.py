"""Crash HTTP + WebSocket API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from database.crash import CrashDatabase
from games.crash.crash_game import crash_loop
from games.crash.websocketCrash import ws_manager
from handler_helpers import prepareRequest
from log_manager import log

router = APIRouter(prefix="/crash", tags=["crash"])

# Shared wiring — loop broadcasts through this manager
crash_loop.set_ws_manager(ws_manager)


class CrashBetRequest(BaseModel):
    amount: float = Field(..., gt=0)


class CrashCashoutRequest(BaseModel):
    """Cashout uses the authenticated session; body is optional/empty."""

    pass


@router.post("/bet")
async def place_bet(request: Request, body: CrashBetRequest):
    _, user_id = prepareRequest(request, "CrashBet")
    try:
        result = await crash_loop.place_bet(
            user_id=user_id,
            amount=body.amount,
        )
        return {"ok": True, **result}
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Crash bet failed | user_id={user_id}")
        raise HTTPException(status_code=500, detail="Failed to place bet")


@router.post("/cashout")
async def cashout(request: Request, body: CrashCashoutRequest | None = None):
    _, user_id = prepareRequest(request, "CrashCashout")
    try:
        result = await crash_loop.cashout(user_id=user_id)
        return {"ok": True, **result}
    except HTTPException:
        raise
    except Exception:
        log.exception(f"Crash cashout failed | user_id={user_id}")
        raise HTTPException(status_code=500, detail="Failed to cash out")


@router.get("/state")
async def get_state(request: Request):
    """Immediate sync snapshot after the page opens."""
    _, user_id = prepareRequest(request, "CrashState")
    return crash_loop.get_state(viewer_user_id=user_id)


@router.get("/history")
async def get_history(
    request: Request,
    limit: int = Query(default=10, ge=1, le=50),
):
    """Latest completed crash multipliers for the history strip."""
    prepareRequest(request, "CrashHistory")
    try:
        items = CrashDatabase.get_recent_multipliers(limit=limit)
        return {"items": items}
    except Exception:
        # Table may not exist yet during early setup — keep UI syncable.
        log.exception("Crash history fetch failed; returning empty list")
        return {"items": []}


@router.websocket("/ws")
async def crash_websocket(websocket: WebSocket):
    """
    Live round events:
      ROUND_OPEN | ROUND_START | PLAYER_BET | PLAYER_CASHOUT | ROUND_END
    """
    await ws_manager.connect(websocket)

    # Push current snapshot so late joiners sync without waiting for next event
    try:
        await ws_manager.send_personal(
            websocket,
            {"event": "STATE_SYNC", **crash_loop.get_state()},
        )
    except Exception:
        ws_manager.disconnect(websocket)
        return

    try:
        while True:
            # Keep-alive / ignore client messages (bets go through REST)
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        log.exception("Crash websocket error")
        ws_manager.disconnect(websocket)
