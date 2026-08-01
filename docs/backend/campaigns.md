# Campaign Engine (backend)

## Что это

Инфраструктура кампаний: хранение, eligibility stub, прогресс, participation.  
**Деньги не выдаёт.**

Файл: `database/campaign.py`.  
Детали lifecycle: [../campaign-engine-lifecycle-ru.md](../campaign-engine-lifecycle-ru.md), [../promotion/campaign-engine.md](../promotion/campaign-engine.md).

## Классы

| Класс | Роль |
|---|---|
| `Campaign` | Domain row |
| `CampaignParticipation` | Domain participation |
| `CampaignManager` | CRUD + `handleEvent` + player API (+ SQL = repository) |
| `RuleEvaluator` | `is_eligible` (segmentation/conditions — stub True) |
| `ProgressTracker` | count / USD / % → `ProgressSnapshot` |

Отдельных `CampaignRepository` / `ParticipationRepository` классов **нет** — логика в `CampaignManager`.

## Публичные методы (главные)

Discovery: `getActiveCampaigns`, `getAvailableCampaigns`, `getCampaignByCode`, `getCampaignByTrigger`  
CRUD: `createCampaign`, `updateCampaign`, `enable/disable`, `deleteCampaign` (soft)  
Events: `handleEvent`  
Participations: `create/get/getOrCreate`, `updateParticipationStatus`, `complete/expire`  
Player API: `getUserCampaigns`, `getCampaignProgress`

## БД

`campaign`, `campaign_participations`.

## Важно

Пока в БД нет строк кампаний с нужным `trigger`, `handleEvent` ничего не обновляет (no-op match).
