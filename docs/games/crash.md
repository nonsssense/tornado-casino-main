# Crash

## Что это

Мультиплеерный раунд: ставка в BETTING, рост множителя в FLYING, cashout или lose.

## Request / event flow

```
CrashGameLoop: BETTING → FLYING → CRASHED
REST: /crash/bet, /cashout, /state, /history
WS: STATE_SYNC + ROUND_* + PLAYER_*
```

Фронт анимирует от `start_time` (без tick stream).  
Reconnect: freeze + resync (Step A).

## Provably Fair

Crash point считается при открытии раунда, в БД multiplier **reveal** только после crash.

## БД

`crash`, `crash_stats`, `bets`, `wallet`.

## Wallet

**Только REAL.** BONUS нельзя поставить → нельзя обойти отыгрыш через Crash.

## Promotion / Referral

`on_bet_settled` **не вызывается** → referral edge с Crash сейчас **не начисляется**.  
Campaign observe с Crash тоже нет (нет хука).

## Ops

- один worker (advisory lock);
- restart → refund Pending bets;
- live round в RAM (*архитектурный лимит*).
