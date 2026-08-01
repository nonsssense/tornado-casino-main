# API — Crash

Prefix: `/crash` (`games/crash/router.py`).

## POST `/crash/bet`

`{ amount }` → place bet (REAL), только в BETTING.

## POST `/crash/cashout`

`{ bet_id }` → cashout в FLYING.

## GET `/crash/state`

Snapshot: phase, timers, active_bets, my_bets, server_time, my_settled, can_cashout, …

## GET `/crash/history`

Завершённые множители (без unrevealed).

## WS `/crash/ws`

```
connect → STATE_SYNC → ROUND_OPEN|START|PLAYER_*|ROUND_END
```

Auth cookie опционален.
