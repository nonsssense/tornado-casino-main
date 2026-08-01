# Referrals

## Что это

Клиентская реферальная программа: атрибуция, FTD bounty, edge RevShare, hold, claim.

Файл: `database/referral.py`.  
Конфиг: `config.REFERRAL_*`, `GAME_EDGES`, `REFERRAL_TIERS`.

## Ответственность

- профиль + referral_key / link;
- invite (unique referred);
- atomic `qualified_at`;
- bounty с daily cap;
- accrual комиссий с REAL-ставок;
- claim в REAL.

**Не делает:** BONUS grants, Crash notify (Crash не шлёт `on_bet_settled`).

## Ключевые методы

`createReferralProfile`, `createInvite`, `mark_qualified_ftd`, `maybe_grant_ftd_bounty`, `accrue_edge_share`, `release_held_earnings`, `claim_earnings`, `stats_summary`.

## БД

`referral_profiles`, `referrals`, `referral_commissions`, `users.referrer_id`.

## API

**HTTP claim/summary для игрока отсутствует** (*Planned*). Логика claim в коде есть.

## Affiliate

`AFFILIATE_*` в config — **seeds only**, runtime path нет (*Planned*).
