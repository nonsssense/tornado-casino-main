# Payments (депозит)

## Что это

Приём крипто-депозитов через **BlockBee**: создание адреса, webhook, зачисление REAL.

## Классы

| | |
|---|---|
| `DepositManager` / функции в `payments/deposit.py` | Жизненный цикл депозита |
| `payments/verifier.py` | RSA-подпись webhook |
| `payments/convert.py` | crypto↔USD |

## Типичный flow

```
POST /api/wallet/deposit
  → создать deposit row + address
POST /api/payment/webhook
  → verify signature
  → completeDeposit:
       lock deposit (idempotent status)
       lock wallet
       REAL += amount_usd
       ledger
       PromotionManager.on_deposit_confirmed
```

## БД

`deposit`, `wallet`, `transactions`.

## Важно

- Депозитный бонус и FTD — **после** кредита, в том же TX (promo).
- Повтор webhook не должен дважды кредитовать (status + lock).

## Planned

Отдельные валютные политики / multi-rail — не реализованы.
