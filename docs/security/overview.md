# Безопасность — обзор

## Темы

| Документ | Содержание |
|---|---|
| этот файл | Карта угроз и контролей |
| [wallet-consistency.md](wallet-consistency.md) | FOR UPDATE, deltas, ledger |
| [auth-sessions.md](auth-sessions.md) | Telegram auth, cookies |
| [payments-withdraw.md](payments-withdraw.md) | Webhook, withdraw hold |
| [promo-abuse.md](promo-abuse.md) | Bonus / referral / campaign |

## Принципы

1. Деньги только под lock + relative UPDATE.  
2. Идемпотентность депозита и once-only бонусов (мягкая; UNIQUE once-only — *улучшение*).  
3. Crash — один worker; restart refund.  
4. Campaign observe не должен ломать выплаты.  
5. Не обещать Admin/сегментацию как уже работающие.

## Известные остаточные риски

- once-only bonus без DB UNIQUE (гонка);
- Crash multi-worker без sticky;
- Sybil FTD (есть daily cap);
- latent freebet/welcome grants без продуктовых капов;
- `fraud_signals` / trust score не используются.
