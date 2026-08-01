# Wallet

## Что это / зачем

Единый слой денежных балансов игрока: **REAL**, **BONUS**, **PENDING**.  
Нужен, чтобы все игры и платежи меняли деньги одинаково и без lost update.

## Ответственность

- создание кошелька;
- `SELECT … FOR UPDATE`;
- относительные `UPDATE` deltas;
- запрет отрицательных балансов.

**Не делает:** правила бонусов, PF, BlockBee.

## Классы / API

| Символ | Роль |
|---|---|
| `WalletManager` | Балансы пользователя |
| `lock_wallet(conn, user_id, wallet_id)` | Row lock |
| `apply_balance_deltas(...)` | Один SQL на multi-field delta |
| `ensure_wallet_schema()` | pending + CHECKs + withdraw unique index |

Устаревшие absolute setters (`updateRealBalance`) внутри сводятся к deltas.

## БД

`wallet`, `transactions` (через `TransactionManager`).

## Типичный lifecycle

```
ensureWallet
  → BEGIN
  → lock_wallet
  → validate
  → apply_balance_deltas
  → postTransaction
  → COMMIT
```

## Зависимости

Используется: games, deposit, withdraw, bonus, referral, crash.

## Расширение

Новые типы баланса — только через тот же delta+lock путь.
