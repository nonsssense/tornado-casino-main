# Согласованность кошелька

## Механика

```
BEGIN
  SELECT wallet FOR UPDATE
  UPDATE … SET balance = balance + :delta
    WHERE … AND balance + :delta >= 0
  INSERT transactions
COMMIT
```

## Защиты

- `pending_balance` hold на вывод;
- CHECK ≥ 0;
- один active withdraw (partial unique);
- multi-field изменения одним UPDATE (hold, unlock).

## Ledger

Каждое движение — строка в `transactions` с `balance_after`.

## Race conditions (закрытые / остаток)

| Закрыто | Остаток |
|---|---|
| Deposit без wallet lock | Soft once-only bonus grant |
| Withdraw spend-then-debit | — |
| Crash absolute RMW | Multi-worker Crash |
