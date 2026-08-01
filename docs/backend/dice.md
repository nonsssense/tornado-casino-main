# Dice (backend)

См. также [../games/dice.md](../games/dice.md).

## Entry

`POST /api/games/rolldice` → `GameManager.playDice` → `games/Dice/dice.py`.

## Flow

```
lock wallet → выбрать REAL/BONUS → validateBonusBet?
→ debit → evaluate roll (PF) → credit (capBonusWin если BONUS)
→ bets/dice rows → on_bet_settled
```

## БД

`bets`, `dice`, `wallet`, `transactions`, `bonus_instances` (при BONUS).
