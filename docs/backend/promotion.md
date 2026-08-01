# PromotionManager

## Что это

Тонкий оркестратор промо: **сначала награды** (Bonus/Referral), **потом observe** (Campaign).

Файл: `promo/promo_manager.py`.

## Ответственность

| Делает | Не делает |
|---|---|
| Вызов Bonus/Referral на хуках | Условия кампаний (это RuleEvaluator) |
| Best-effort `_track_campaign_event` | SQL кампаний напрямую |
| Сохранение порядка MVP-экономики | Переписывание grant-математики |

## Публичные хуки

| Метод | Награда | Observe |
|---|---|---|
| `on_user_registered` | referral profile + invite | `REGISTER` |
| `on_deposit_confirmed` | deposit bonus + FTD bounty | `DEPOSIT` |
| `on_bet_settled` | wager progress + edge share | `BET_SETTLED` (+ `BONUS_COMPLETED` если нет active) |
| `on_withdrawal_completed` | — | `WITHDRAW` (*call site нет*) |
| `on_daily_reset` | release hold + expire bonuses | `BONUS_EXPIRED` (*не scheduled*) |
| `on_admin_action` | forfeit / freeze | — (*не wired*) |

## Зависимости

→ `BonusManager`, `ReferralManager`, `CampaignManager`, `WalletManager`, `config`.

## Типичный deposit

```
on_deposit_confirmed
  try:
    grantDepositBonus?
    mark_qualified_ftd + bounty?
  finally:
    campaigns.handleEvent(DEPOSIT)  # ошибки глотаются
```

## Расширение

Новый триггер награды = новый/расширенный `on_*` + вызов менеджера.  
Трекинг = событие в Campaign Engine.
