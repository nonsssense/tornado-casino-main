# Реферальная система

## Live (customer)

1. Регистрация с `start_param` → write-once `referrer_id` + invite.  
2. FTD ≥ min → `qualified_at` + bounty (daily cap).  
3. REAL ставки Dice/Plinko → edge × revshare → hold → claim.

Тиры Bronze/Silver/Gold из config.

## Нет в продукте сейчас

- HTTP API claim/summary для игрока;
- Affiliate product (`AFFILIATE_ENABLED=False`);
- Crash в accrual;
- UI рефералов (nav-заглушки).

## Антифрод (есть)

Self-ref block, unique referred, atomic FTD, daily bounty cap, `payout_frozen`, claim FOR UPDATE.
