# Withdraws (вывод)

## Что это

Вывод REAL на крипто-адрес с **hold** в `pending_balance`.

## Flow (текущий)

```
POST /api/wallet/withdraw
  → FOR UPDATE wallet
  → проверить нет active withdraw
  → REAL -= amount; PENDING += amount
  → статус PENDING

Approve (admin/ops path в коде)
  → PENDING → PROCESSING
  → on-chain payout
  → PENDING -= amount   # REAL уже списан при создании

Reject
  → PENDING → REAL (release hold)
```

## Защиты

- partial unique index: один PENDING/PROCESSING на user;
- игры тратят только REAL → held нельзя проиграть.

## БД

`withdraws`, `wallet.pending_balance`, `withdrawal_addresses`.

## Promo

`on_withdrawal_completed` в PromotionManager — **заглушка**, call site не найден.
