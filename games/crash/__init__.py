"""Crash (Aviator) game module.

Public entry points for later wiring from main.py:
  - router          FastAPI routes + websocket
  - crash_loop      continuous round loop (start via asyncio.create_task)
  - crash_manager   provably-fair generator
  - ws_manager      websocket broadcaster
"""

from games.crash.crash_game import crash_loop, crash_manager
from games.crash.router import router
from games.crash.websocketCrash import ws_manager

__all__ = ["router", "crash_loop", "crash_manager", "ws_manager"]
