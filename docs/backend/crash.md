# Crash (backend)

См. также [../games/crash.md](../games/crash.md).

## Entry

Router `/crash/*` + in-process `CrashGameLoop`.

## Важно

- REAL only;
- состояние раунда в памяти;
- singleton advisory lock;
- boot refund Pending bets;
- **нет** `PromotionManager.on_bet_settled` → нет referral accrual с Crash сейчас.
