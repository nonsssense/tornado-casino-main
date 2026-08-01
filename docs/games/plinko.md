# Plinko (Plinco)

## Что это

Шарик по доске, множитель по корзине; single + batch.

## Request flow

```
GET /api/games/plinco/config
POST /api/games/plinco | /batch
  → GameManager
  → Plinco math
  → settle + on_bet_settled
```

Batch: идемпотентность `plinco_batches`.

## BONUS / Promotion

Как Dice. Для deposit bonus разрешён только risk **low**.

## Referral

REAL stakes → edge share.  
Campaign: `BET_SETTLED`.
