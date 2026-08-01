# Dice

## Что это

Игра «больше/меньше» с серверным settle и provably fair.

## Request flow

```
Frontend DiceGame
  → POST /api/games/rolldice
  → GameManager.playDice
  → Dice evaluation (PF)
  → wallet debit/credit
  → PromotionManager.on_bet_settled
```

## Provably Fair

Семена/nonce через `ProvablyFair` + запись в `dice` / связанные поля.

## БД

`bets`, `dice`, `wallet`, `transactions`.

## Wallet

REAL или BONUS (авто-выбор, если бонус eligible).  
При BONUS: `validateBonusBet`, `capBonusWin`.

## Promotion

BONUS stake → `recordWagerProgress`.  
REAL stake → referral `accrue_edge_share`.  
Campaign observe: `BET_SETTLED`.

## Referral

Да, через `on_bet_settled` (REAL).
