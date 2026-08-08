"""Crash WebSocket connection manager and broadcast helpers.

Not wired into main.py — import `router` (or `ws_manager`) manually later.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket
from log_manager import log

from config import CRASH_WS_MAX_PER_IP, CRASH_WS_MAX_TOTAL
from handler_helpers import getIpAddress

# WebSocket close codes.
_WS_CLOSE_POLICY = 1008  # policy violation (per-IP cap)
_WS_CLOSE_TRY_LATER = 1013  # server overloaded (global cap)


class CrashWebSocketManager:
    """Tracks connected Crash clients and broadcasts round events.

    Enforces abuse limits (total connections + connections per client IP) and
    reliably releases per-IP counters on disconnect so a churn of connect/close
    cycles cannot leak accounting.
    """

    def __init__(self):
        self.connections: set[WebSocket] = set()
        self._ip_by_ws: dict[WebSocket, str] = {}
        self._ip_counts: dict[str, int] = {}

    def online_count(self) -> int:
        return len(self.connections)

    async def connect(self, websocket: WebSocket) -> bool:
        """Accept the socket unless a connection limit is exceeded.

        Returns True when the socket was accepted and registered; False when it was
        rejected (already closed here — the caller must simply return).
        """
        ip = getIpAddress(websocket) or "unknown"

        if CRASH_WS_MAX_TOTAL > 0 and len(self.connections) >= CRASH_WS_MAX_TOTAL:
            log.warning(
                f"Crash WS rejected (global cap) | ip={ip} | "
                f"clients={len(self.connections)} | cap={CRASH_WS_MAX_TOTAL}"
            )
            await self._safe_close(websocket, _WS_CLOSE_TRY_LATER)
            return False

        if CRASH_WS_MAX_PER_IP > 0 and self._ip_counts.get(ip, 0) >= CRASH_WS_MAX_PER_IP:
            log.warning(
                f"Crash WS rejected (per-IP cap) | ip={ip} | "
                f"per_ip={self._ip_counts.get(ip, 0)} | cap={CRASH_WS_MAX_PER_IP}"
            )
            await self._safe_close(websocket, _WS_CLOSE_POLICY)
            return False

        await websocket.accept()
        self.connections.add(websocket)
        self._ip_by_ws[websocket] = ip
        self._ip_counts[ip] = self._ip_counts.get(ip, 0) + 1
        log.info(
            f"Crash WS connected | ip={ip} | clients={len(self.connections)} | "
            f"per_ip={self._ip_counts[ip]}"
        )
        return True

    @staticmethod
    async def _safe_close(websocket: WebSocket, code: int) -> None:
        try:
            await websocket.close(code=code)
        except Exception:
            pass

    def disconnect(self, websocket: WebSocket):
        self.connections.discard(websocket)
        ip = self._ip_by_ws.pop(websocket, None)
        if ip is not None:
            remaining = self._ip_counts.get(ip, 0) - 1
            if remaining > 0:
                self._ip_counts[ip] = remaining
            else:
                self._ip_counts.pop(ip, None)
        log.info(f"Crash WS disconnected | clients={len(self.connections)}")

    async def broadcast_online_count(self):
        """Notify all clients of the current Crash lobby size."""
        await self.broadcast(
            {
                "event": "ONLINE_COUNT",
                "online": self.online_count(),
            }
        )

    async def broadcast(self, message: dict[str, Any]):
        """Send a JSON event to every connected client. No multiplier ticks."""
        if not self.connections:
            return

        payload = json.dumps(message, default=str)
        stale: list[WebSocket] = []

        for websocket in list(self.connections):
            try:
                await websocket.send_text(payload)
            except Exception:
                stale.append(websocket)

        pruned = False
        for websocket in stale:
            if websocket in self.connections:
                self.disconnect(websocket)
                pruned = True

        # After pruning dead sockets, refresh the online counter once.
        if pruned and message.get("event") != "ONLINE_COUNT" and self.connections:
            online_payload = json.dumps(
                {"event": "ONLINE_COUNT", "online": self.online_count()},
                default=str,
            )
            for websocket in list(self.connections):
                try:
                    await websocket.send_text(online_payload)
                except Exception:
                    self.disconnect(websocket)

    async def send_personal(self, websocket: WebSocket, message: dict[str, Any]):
        await websocket.send_text(json.dumps(message, default=str))


ws_manager = CrashWebSocketManager()
