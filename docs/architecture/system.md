# Архитектура системы

## Что это

Описание всего бэкенда Tornado: кто за что отвечает, как модули связаны, как текут данные и события.

## Зачем

Чтобы новый разработчик видел границы ответственности до чтения кода.

---

## Общая схема

```
┌──────────────────── Frontend (Telegram Mini App) ────────────────────┐
│  static/src — router, games, wallet UI, bonus selector               │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ REST + Crash WS
┌───────────────────────────────▼──────────────────────────────────────┐
│  main.py (FastAPI) + games/crash/router.py                           │
│  prepareRequest → session cookie                                     │
└───────┬───────────────┬────────────────┬─────────────────┬───────────┘
        │               │                │                 │
   Auth/Session     Wallet/Pay        GameManager      CrashGameLoop
        │               │                │                 │
        ▼               ▼                ▼                 ▼
   users/sessions   wallet/txns      bets/dice/          crash/
                    deposit/withdraw  plinco              crash_stats
        │               │                │
        └───────────────┴────────────────┘
                        │
                        ▼
              PromotionManager
           ┌────────────┴────────────┐
           ▼                         ▼
     BonusManager              ReferralManager
     (награды BONUS)           (REAL bounty/share)
           │
           └─ observe ─► CampaignManager
                         (campaign / participations)
```

---

## Кто чем владеет

| Модуль | Владеет | Не должен |
|---|---|---|
| `database/auth.py` | Регистрация / валидация пользователя | Игровая математика |
| `database/session.py` | Cookie-сессии | Балансы |
| `database/wallet.py` | REAL / BONUS / PENDING, lock, deltas | Правила бонусов |
| `database/transactions.py` | Ledger | Бизнес-промо |
| `payments/deposit.py` | Адреса депозита, webhook complete | Crash loop |
| `payments/withdraw.py` | Hold pending → выплата | Бонус-отыгрыш |
| `games/game_manager.py` | Dice/Plinko settle + promo notify | Crash (отдельный loop) |
| `games/crash/*` | Раунды Crash in-memory + API | BONUS-ставки (REAL only) |
| `database/bonus.py` | `bonus_instances`, wager unlock | Реферал |
| `database/referral.py` | Profiles, FTD, commissions | Бонус-инстансы |
| `database/campaign.py` | Кампании, participation, progress | Выдача денег |
| `promo/promo_manager.py` | Порядок: награда → observe кампании | Хардкод условий кампаний |

**Важно:** `BonusManager` и `ReferralManager` **не импортируют друг друга**. Связка только через `PromotionManager`.

---

## Потоки данных

### Авторизация

```
POST /api/auth (Telegram initData)
  → HMAC verify
  → auth.userValidate / register
  → PromotionManager.on_user_registered
  → session cookie
```

### Депозит

```
POST /api/wallet/deposit → BlockBee address
POST /api/payment/webhook → verify → completeDeposit
  → lock deposit + wallet
  → REAL += amount
  → PromotionManager.on_deposit_confirmed
       → grantDepositBonus (если eligible)
       → FTD bounty (если eligible)
       → CampaignManager.handleEvent(DEPOSIT)  # observe
```

### Ставка Dice/Plinko

```
POST /api/games/rolldice|plinco
  → GameManager
  → lock wallet → debit REAL or BONUS
  → settle → credit
  → PromotionManager.on_bet_settled
       → wager progress / referral accrual
       → CampaignManager.handleEvent(BET_SETTLED)
```

### Crash

```
CrashGameLoop (один worker, advisory lock)
  → BETTING → FLYING → CRASHED
  → REST bet/cashout + WS STATE_SYNC / events
  → REAL only; PromotionManager.on_bet_settled НЕ вызывается
```

### Вывод

```
POST /api/wallet/withdraw
  → lock wallet
  → REAL → PENDING (hold)
  → PENDING row
Admin approve → on-chain → clear PENDING
```

---

## Поток событий промо

```
Хук PromotionManager (on_*)
  1) Награда: Bonus / Referral (как раньше)
  2) finally: _track_campaign_event → CampaignManager.handleEvent
       (ошибка трекинга не ломает выплату)
```

Подключённые хуки: `on_user_registered`, `on_deposit_confirmed`, `on_bet_settled` (Dice/Plinko).  
Реализованы, но **не запланированы в cron / не вызываются извне:** `on_daily_reset`, `on_admin_action`.  
`on_withdrawal_completed` — заглушка + observe WITHDRAW, **call site отсутствует**.

---

## Frontend vs Backend

| Слой | Ответственность |
|---|---|
| Frontend | UI, анимация Crash от `start_time`, выбор оффера депозита |
| Backend | Истина по балансу, settle, PF, лимитам бонуса |

Клиент **не** может выбрать `preferred_balance` / freebet через HTTP (поля не в request models).

---

## Расширение без ломки границ

| Хотите добавить | Куда |
|---|---|
| Новую игру | `games/` + хук settle → `on_bet_settled` при необходимости |
| Новый тип промо-награды | Bonus/Referral manager + тонкий вызов из PromotionManager |
| Трекинг кампании | `campaign` row + `trigger` + `handleEvent` |
| Сегментацию | `RuleEvaluator._passes_segmentation` (*Future*) |
| Admin CRUD кампаний | поверх `CampaignManager.createCampaign` (*Future*) |

---

## Связанные документы

- [../backend/README.md](../backend/README.md)
- [../promotion/overview.md](../promotion/overview.md)
- [../security/overview.md](../security/overview.md)
- [../campaign-engine-lifecycle-ru.md](../campaign-engine-lifecycle-ru.md)
