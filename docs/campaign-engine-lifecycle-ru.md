# Campaign Engine — Архитектурный справочник

**Аудитория:** новые разработчики (5–10 минут)  
**Код:** `database/campaign.py`, `promo/promo_manager.py`  
**Правило:** Campaign Engine **отслеживает**; Bonus/Referral managers **выплачивают**.

*Оригинал:* `docs/campaign-engine-lifecycle.md`

---

## 1. Архитектура

```
auth / deposit / game_manager / withdraw / daily_reset
                    │
                    ▼
            PromotionManager          ← награды + наблюдение
           ┌────────┴────────┐
           ▼                 ▼
    BonusManager      CampaignManager   ← ОС для кампаний
    ReferralManager          │
                     ┌───────┼───────────────┐
                     ▼       ▼               ▼
              RuleEvaluator  ProgressTracker  SQL-таблицы
                     │
                     ▼
              Campaign / CampaignParticipation
```

Отдельных классов **Repository нет**. Persistence живёт внутри `CampaignManager` (та же роль, что и repository-слой).

| Класс | Владеет | Не должен |
|---|---|---|
| **Campaign** | Одна строка кампании как domain-объект (`config` JSONB, расписание, хелперы бюджета) | Выдавать деньги; ходить в игры |
| **CampaignParticipation** | Одна строка user×campaign (status, progress, metadata) | Выдавать награды |
| **CampaignManager** | CRUD, discovery, `handleEvent`, participations, player API | Реализовывать математику deposit/referral payout |
| **RuleEvaluator** | Абстракция eligibility (`is_eligible` → stub сегментации + stub условий) | Хардкодить продуктовые правила в PromotionManager |
| **ProgressTracker** | Универсальный расчёт прогресса (count / USD / %) → `ProgressSnapshot` | Трогать кошельки |
| **PromotionManager** | Вызывать Bonus/Referral для **наград**; затем `_track_campaign_event` | Держать SQL кампаний или eligibility inline |
| **BonusManager** | Grant в BONUS-кошелёк, отыгрыш, unlock/expire | Знать про таблицы `campaign` |
| **ReferralManager** | FTD bounty, edge share, claim | Знать про таблицы `campaign` |

**Таблицы:** `campaign`, `campaign_participations`  
**Schema ensure:** `ensure_campaign_schema()` (startup + init менеджера)

---

## 2. Поток данных

### Persistence → domain → orchestration

```
PostgreSQL (campaign / campaign_participations)
        ↓
CampaignManager (SQL = repository)
        ↓
Campaign / CampaignParticipation
        ↓
RuleEvaluator + ProgressTracker
        ↓
handleEvent / getUserCampaigns
        ↑
PromotionManager._track_campaign_event  (только наблюдение)
        │
        ├── BonusManager / ReferralManager  (награды — без изменений)
```

### Discovery для игрока (будущий UI Promotions)

```
getAvailableCampaigns(user)     # active + RuleEvaluator
        ↓
getUserCampaigns(user)          # карточки
        ↓
getCampaignProgress(user, campaign)
```

---

## 3. Жизненный цикл события

Живой вход — **не** `PromotionManager.handleEvent`.  
Хуки остаются `on_*`; каждый заканчивается best-effort tracking.

### Депозит подтверждён (канонический пример)

```
deposit.py completeDeposit
    ↓
PromotionManager.on_deposit_confirmed
    ├── BonusManager.grantDepositBonus          # НАГРАДА (без изменений)
    ├── ReferralManager.mark_qualified_ftd…     # НАГРАДА (без изменений)
    └── finally: _track_campaign_event(DEPOSIT)
            ↓
        CampaignManager.handleEvent(user, DEPOSIT, context)
            ↓
        getCampaignByTrigger("DEPOSIT")   # алиасы: on_deposit_confirmed
            ↓
        RuleEvaluator.is_eligible(...)
            ↓
        getOrCreateParticipation(...)
            ↓
        ProgressTracker.build_snapshot + metadata_for_snapshot
            ↓
        updateParticipationStatus(...)    # progress + status
            ↓
        STOP  (grant здесь нет)

Будущее (не реализовано):
            ↓
        BonusManager.grantReward(...)     # только после решения CampaignManager
```

Ошибки `handleEvent` логируются и **игнорируются** — награды не откатываются.

---

## 4. Жизненный цикл игрока (порядок вызовов)

| Момент | Путь награды | Наблюдение кампании |
|---|---|---|
| **Регистрация** | `on_user_registered` → Referral profile / invite | `EVENT_REGISTER` |
| **Логин** | *(не подключено)* | `EVENT_LOGIN` поддерживается движком; хука в PromotionManager пока нет |
| **Депозит** | `on_deposit_confirmed` → deposit bonus + FTD bounty | `EVENT_DEPOSIT` |
| **Расчёт ставки** | `on_bet_settled` → wager progress + referral accrual | `EVENT_BET_SETTLED` |
| **Бонус полностью закрыт** | *(после unlock BONUS не остаётся active instances)* | `EVENT_BONUS_COMPLETED` |
| **Дневной expire бонусов** | `on_daily_reset` → `expireDueBonuses` | `EVENT_BONUS_EXPIRED` |
| **Вывод** | `on_withdrawal_completed` (заглушка) | `EVENT_WITHDRAW` |

### Внутри `CampaignManager.handleEvent`

1. Нормализация event → trigger-алиасы  
2. `getCampaignByTrigger`  
3. `RuleEvaluator.is_eligible`  
4. `getOrCreateParticipation`  
5. Skip при terminal status (кроме событий COMPLETED/EXPIRED)  
6. `ProgressTracker` → ratio + metadata  
7. `_next_status_for_event` → `updateParticipationStatus`

---

## 5. Жизненный цикл кампании

```
Admin / script: CampaignManager.createCampaign(...)
        ↓
Строка в campaign (enabled, trigger, config JSONB, schedule, budget)
        ↓
getActiveCampaigns() — enabled + внутри start_at/ends_at
        ↓
getAvailableCampaigns(user) — + RuleEvaluator (сегментация позже)
        ↓
Событие игрока → handleEvent → создаётся participation
        ↓
Прогресс обновляется на следующих событиях
        ↓
Status → COMPLETED / EXPIRED / CANCELLED
        ↓
Награда сегодня: по-прежнему Bonus/Referral на своих хуках
Награда позже: CampaignManager может оркестрировать grant после COMPLETED
```

**Soft delete:** `deleteCampaign` = `disableCampaign` (`enabled=false`). История сохраняется.

**Config JSONB (расширяемый):** `conditions`, `reward`, `game`, `limits`, `progress`, в будущем `segmentation`.

---

## 6. Жизненный цикл participation

Каноническое поле: **`status`**. Булевы (`qualified`, `reward_granted`, `completed`) — производные хелперы.

```
AVAILABLE          createParticipation / REGISTER / LOGIN
    ↓
QUALIFIED          DEPOSIT (progress < 100%)
    ↓
ACTIVE             BET_SETTLED (progress < 100%)
    ↓
COMPLETED          progress ratio ≥ 1.0  или  BONUS_COMPLETED
                   (флаг REWARDED также выставляется на путях ACTIVE/COMPLETED)

EXPIRED            BONUS_EXPIRED / expireParticipation
CANCELLED          admin / будущий cancel API
```

| Status | Типичный триггер |
|---|---|
| `AVAILABLE` | Первый контакт / регистрация |
| `QUALIFIED` | Депозит в сторону кампании |
| `REWARDED` | Зарезервировано (флаг при `reward_id`; полный grant пока снаружи) |
| `ACTIVE` | Ставки / прогресс отыгрыша |
| `COMPLETED` | Цель достигнута или бонус завершён |
| `EXPIRED` | Событие истечения кампании/бонуса |
| `CANCELLED` | Явная отмена |

Terminal: `COMPLETED` \| `EXPIRED` \| `CANCELLED` — дальнейшие события пропускаются (кроме обработчиков expire/complete).

---

## 7. Будущие расширения (точки подключения)

| Фича | Куда встраивать | Чего избегать |
|---|---|---|
| VIP / страна / affiliate / A/B / ручной таргетинг | `RuleEvaluator._passes_segmentation` + `config.segmentation` | Править каждый хук `on_*` |
| Промокоды | Новый `type` кампании + trigger; redemption → `handleEvent` | Параллельный движок |
| Cashback / missions | Метрики `ProgressTracker` + `config.progress` | Хардкод в PromotionManager |
| Leaderboards / турниры | Отдельный домен; прогресс через `handleEvent` или записи participations | Форк API CampaignManager |
| Настоящий rule engine | `RuleEvaluator._evaluate_conditions` | Условия внутри BonusManager |
| Grant от кампании | После status→COMPLETED вызывать Bonus/Referral из PromotionManager | Grant внутри SQL CampaignManager |

**Стабильный API, который нужно сохранять:**  
`handleEvent`, `getAvailableCampaigns`, `getUserCampaigns`, `getCampaignProgress`, `createCampaign`.

---

## Краткая карта файлов

| Путь | Роль |
|---|---|
| `database/campaign.py` | Domain + CampaignManager + evaluator + progress + schema |
| `database/campaign_test.py` | Тесты инфраструктуры / событий / player API |
| `promo/promo_manager.py` | Награды + `_track_campaign_event` |
| `main.py` | `ensure_campaign_schema()` на startup |

---

*Campaign Engine сегодня = наблюдение + организация. Авторитет по наградам остаётся у BonusManager / ReferralManager до явной миграции.*
