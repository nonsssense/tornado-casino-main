# Promotion — обзор

## Слои

```
PromotionManager     — оркестрация наград + observe
BonusManager         — BONUS money
ReferralManager      — REAL referral money
CampaignManager      — учёт кампаний (без выплат)
```

| Документ | Тема |
|---|---|
| [bonus-system.md](bonus-system.md) | Deposit / wager BONUS |
| [referral-system.md](referral-system.md) | Реферал |
| [campaign-engine.md](campaign-engine.md) | Campaign Engine |
| [../campaign-engine-lifecycle-ru.md](../campaign-engine-lifecycle-ru.md) | Lifecycle reference |
| [../backend/promotion.md](../backend/promotion.md) | PromotionManager |

## Что live

- 3 депозитных тира (config);
- FTD bounty + edge share (Dice/Plinko REAL);
- Campaign track при событиях (если есть rows в `campaign`).

## Planned

Admin Panel кампаний, сегментация, grant из CampaignManager, UI Promotions, referral HTTP, Crash→referral, freebet product.
