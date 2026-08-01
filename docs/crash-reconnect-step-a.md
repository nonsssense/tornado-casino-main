# Crash Reconnect Step A — Implementation Report

**Date:** 2026-07-27  
**Scope:** Snapshot-driven reconnect / freeze UI. No Redis, no math/payout changes.

---

## 1. Files changed

| File | Change |
|---|---|
| `games/crash/crash_game.py` | `server_time`, `phase_ends_at`, `my_settled`, `can_cashout`; in-round settlements; `ROUND_END.round_id` |
| `games/crash/crash_game_test.py` | Wallet fakes + snapshot/settlement tests |
| `static/src/services/crash.service.js` | Connect generation (no ghost reconnects); `isConnected()` |
| `static/src/games/crash/crash.game.js` | Freeze on disconnect; HTTP resync; preserve panels; visibility resume; event barrier |
| `static/src/i18n/locales/en.js` | Reconnect copy |
| `static/src/i18n/locales/ru.js` | Reconnect copy |

---

## 2. Reconnect bugs fixed

| Bug | Fix |
|---|---|
| Fake flying multiplier after WS drop | Freeze: stop rAF + countdown; disable cashout; ignore live events until sync |
| Missed `ROUND_END` during blip | `awaitingSync` drops events; rebuild from `GET /crash/state` and/or `STATE_SYNC` |
| Ghost duplicate reconnect timers | `connectGeneration` invalidates superseded socket close handlers |
| Empty `my_bets` wiping panels on anonymous WS | `preservePersonalIfEmpty` keeps open panels when still in `active_bets` / storage |
| Lost cashed-out UI after refresh mid-round | `my_settled` + `can_cashout` in snapshot |
| Mini App resume stale UI | `visibilitychange` → HTTP resync (+ reconnect if socket dead) |
| Nav away/back | Unchanged remount path; now uses richer snapshot + clean timer teardown |

---

## 3. Client flow now

```
WS close / resume with dead socket
  → freeze UI (no animation)
  → awaitingSync = true (drop live events)

WS open OR visibility resume
  → GET /crash/state (auth)  and/or  STATE_SYNC
  → rebuild UI from snapshot
  → clear freeze
  → accept live events again
```

---

## 4. Remaining limitations (not Step A)

- **Server restart mid-round:** still refund-only; no live round resume (needs durable state — redesign).
- **Multi-worker without sticky routing:** empty/stale loop on non-owner process.
- **Clock skew:** multiplier display still uses device clock vs `start_time` (server remains cashout authority).
- **Public cashed-out tape:** other players’ greens still not fully restored from snapshot (only open `active_bets` + own `my_settled`).
- **Settlements memory:** `my_settled` is process-local for current round only (cleared on `ROUND_OPEN`).

---

## 5. Impossible without future architecture

| Scenario | Why |
|---|---|
| Continue same FLYING round after process death | Round + `active_bets` only in RAM |
| Horizontal multi-instance Crash | Needs shared round lease / sticky single owner |
| Perfect public cashout history after refresh | Would need round event log or DB projection |

Money after restart remains covered by existing boot refund — separate from UI continuity.
