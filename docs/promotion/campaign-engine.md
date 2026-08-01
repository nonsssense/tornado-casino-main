# Campaign Engine — подробно

Сжатый справочник. Полный lifecycle: [../campaign-engine-lifecycle-ru.md](../campaign-engine-lifecycle-ru.md).

## Классы

| Класс | Владеет | Не должен |
|---|---|---|
| `Campaign` | Конфиг кампании | Платить |
| `CampaignParticipation` | Статус/прогресс игрока | Платить |
| `CampaignManager` | CRUD, events, player API, SQL | Bonus math |
| `RuleEvaluator` | Eligibility hooks | Хардкод в hooks |
| `ProgressTracker` | Метрики прогресса | Wallet |

**Repository:** отдельных классов нет — SQL внутри `CampaignManager`.

## Вызовы при депозите

```
PromotionManager.on_deposit_confirmed
  → Bonus/Referral rewards
  → CampaignManager.handleEvent(DEPOSIT)
       → getCampaignByTrigger
       → RuleEvaluator.is_eligible
       → getOrCreateParticipation
       → ProgressTracker
       → updateParticipationStatus
```

## Статусы participation

AVAILABLE → QUALIFIED → ACTIVE → COMPLETED  
или EXPIRED / CANCELLED.

## Future (явно не сделано)

Сегментация, targeting, Admin UI, grant из кампании, A/B, VIP rules, promo codes as campaigns, missions UI.

Точки расширения: `RuleEvaluator._passes_segmentation`, `config.segmentation`, `createCampaign` из админки.
