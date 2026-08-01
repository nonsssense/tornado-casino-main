"""Crash WebSocket connection manager and broadcast helpers.

Not wired into main.py — import `router` (or `ws_manager`) manually later.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket
from log_manager import log


class CrashWebSocketManager:
    """Tracks connected Crash clients and broadcasts round events."""

    def __init__(self):
        self.connections: set[WebSocket] = set()

    def online_count(self) -> int:
        return len(self.connections)

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.add(websocket)
        log.info(f"Crash WS connected | clients={len(self.connections)}")

    def disconnect(self, websocket: WebSocket):
        self.connections.discard(websocket)
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
