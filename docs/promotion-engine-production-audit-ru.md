# Promotion Engine — Аудит архитектуры и безопасности (production)

**Дата:** 2026-07-27  
**Объём:** Только чтение. Код не менялся.  
**Угол зрения:** Долгосрочная промо-платформа казино с реальными деньгами, а не чеклист MVP.

*Оригинал:* `docs/promotion-engine-production-audit.md`

---

## Итоговый вердикт

Текущая система — это **крепкий MVP-каркас промоций**, а не production-**платформа** промоций.

Что есть: тонкий оркестратор (`PromotionManager`), координирующий два независимых менеджера (`BonusManager`, `ReferralManager`), коммерческие числа в `config.py`, безопасные для кошелька начисления и реально подключенная экономика депозитных тиров + клиентского реферала на register / deposit / settle Dice+Plinko.

Чего **нет**: модели сущностей casino promo engine — **кампании**, **версии**, **сегментация**, **stacking/mutex**, **бюджеты**, **промокоды**, **admin CRUD**, **планировщики** и **полноценный UX игрока**. Добавить «Weekly cashback» или «VIP birthday» сегодня значит **править бизнес-логику на Python и деплоить**, а не настроить кампанию.

**Фундамент надолго?** Частично. **Разделение Bonus vs Referral + тонкий оркестратор** — правильное зерно. **Модель данных и rule engine — нет**. Это хороший MVP-kernel, которому нужен слой кампаний, прежде чем честно поддерживать непрерывный рост продукта.

---

## 1. Обзор архитектуры

### 1.1 Карта компонентов

```
┌─────────────────────────────────────────────────────────────────┐
│ Точки входа                                                      │
│  auth.py | deposit.py | game_manager.py | admin_bot (метрики)    │
│  main.py (/api/bonus/* только чтение)                            │
└───────────────────────────────┬─────────────────────────────────┘
                                │ side-effects
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ PromotionManager  (promo/promo_manager.py)                       │
│  Тонкий оркестратор — не владеет деньгами и persistence правил   │
└───────────────┬─────────────────────────────┬───────────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────────┐
│ BonusManager              │   │ ReferralManager                 │
│  bonus_instances          │   │  referral_profiles / invites    │
│  BONUS wallet             │   │  commissions / REAL bounty      │
│  freebet → bonus (infra)  │   │  claim_earnings (нет HTTP)      │
└───────────────────────────┘   └─────────────────────────────────┘
                │
                ▼
┌───────────────────────────┐
│ config.py commercial seeds│  ← НЕ хранилище кампаний
└───────────────────────────┘
```

**Ограничение (намеренное):** `BonusManager` и `ReferralManager` не импортируют друг друга. Только `PromotionManager` выстраивает последовательность. Для MVP это архитектурно здорово.

### 1.2 Точки входа

| Вход | Хук | Подключено? |
|---|---|---|
| Регистрация | `on_user_registered` | Да (`database/auth.py`) |
| Депозит подтверждён | `on_deposit_confirmed` | Да (`payments/deposit.py`, та же TX) |
| Ставка рассчитана | `on_bet_settled` | Да, только Dice/Plinko (`game_manager.py`) |
| Crash рассчитан | — | **Нет** |
| Вывод завершён | `on_withdrawal_completed` | Заглушка / не подключён |
| Дневной сброс | `on_daily_reset` | Реализован / **не запланирован** |
| Действие админа | `on_admin_action` | Реализован / **не подключён** |
| HTTP grant/claim | — | Только чтение бонусов; claim реферала **без API** |

### 1.3 Типы промоций (факт vs заглушки)

| Тип | Статус | Примечание |
|---|---|---|
| Deposit match (3 тира) | **Live** | Каталог config → `bonus_instances` |
| Customer referral FTD bounty | **Live** | REAL + дневной кап |
| Customer referral edge RevShare | **Live** | Только Dice/Plinko REAL; Crash отсутствует |
| Welcome bonus | Только метод | Не вызывается |
| Reload | Только метод | Не вызывается |
| Бонус по промокоду | Только метод | Нет сущности кода |
| Cashback | Только метод | Нет движка начислений |
| Freebets / free spins | Таблицы + пути GameManager | **Нет точки grant / нет HTTP** |
| Affiliate RevShare | Только seeds в config | `AFFILIATE_ENABLED=False`, не используется |
| Турнир / VIP / день рождения / ручной admin | Отсутствует | — |

### 1.4 Жизненный цикл (как реализовано)

**Жизненного цикла кампании нет.** Есть жизненный цикл **инстанса бонуса** и **реферального инвайта**.

```
Кампания (ОТСУТСТВУЕТ)
  create → schedule → activate → qualify → reward → expire → cancel

Что есть вместо этого:

Атрибуция
  register + invite_key → write-once referrer_id → строка invite

Активация / grant
  deposit confirmed → grantDepositBonus(source=deposit_tier_N)
  (UI выбора есть, но grant идёт по deposit_index, не по выбору игрока)

Квалификация (реферал)
  deposit ≥ FTD min → atomic qualified_at → опциональный bounty

Награда
  BONUS при grant; REAL bounty; pending-комиссии с REAL-ставок

Отыгрыш
  BONUS-ставки → recordWagerProgress → unlock (BONUS→REAL ≤ principal)

Истечение
  Ленивый expireDueBonuses на list/validate; сжигание остатка BONUS
  Пакетно через on_daily_reset (без расписания)

Отмена / forfeit
  forfeitBonus + on_admin_action('forfeit_bonus') — без UI админки
```

### 1.5 Ключевые файлы

| Путь | Роль |
|---|---|
| `promo/promo_manager.py` | Оркестратор |
| `database/bonus.py` | Инстансы бонусов, отыгрыш, капы |
| `database/referral.py` | FTD, bounty, accrual, claim |
| `database/freebet.py` | Freebet grants/tickets |
| `config.py` | Коммерческие seeds |
| `games/game_manager.py` | Игра на BONUS + notify settle |
| `games/crash/crash_game.py` | Только REAL; промо не подключено |
| `main.py` | `/api/bonus/offers|active|select` |
| `static/src/features/wallet/deposit.bonus-selector.js` | UI офферов |
| `docs/promotion-engine-implementation-architecture.md` | Задуманная форма MVP |

---

## 2. Сильные стороны

1. **Чистое разделение MVP** — оркестратор vs денежные менеджеры; менеджеры не кросс-импортируются.
2. **Коммерческие числа централизованы** в `config.py` (инженерам легко менять без охоты за magic numbers).
3. **Денежные пути безопасны для кошелька** (после работы по transaction-safety): grant/unlock/expire/forfeit/bounty/claim используют locks + относительные deltas.
4. **Реальные анти-абьюз примитивы атрибуции реферала**: write-once `referrer_id`, unique `referred_id`, запрет self-referral, atomic FTD qualify, дневной кап bounty, `payout_frozen`, claim `FOR UPDATE`.
5. **Once-only источники депозитного бонуса** (`deposit_tier_1/2/3`) с мягкой идемпотентностью.
6. **Игровое принуждение для deposit BONUS** на Dice/Plinko: max bet, eligibility, win cap, авто-предпочтение BONUS при eligibility.
7. **Crash не может тратить BONUS** — нельзя обойти отыгрыш кэшаутом бонуса в Crash.
8. **Бонус не выводится** (withdraw держит только REAL).

---

## 3. Слабые стороны (структурные)

1. **Нет сущности кампании** — нельзя выразить start/end, бюджет, приоритет, stacking, аудиторию или историю версий.
2. **Правила = код + константы config**, а не данные — Admin Panel не сможет управлять кампаниями без нового хранилища и движка.
3. **Методы grant размножаются по имени** (`grantWelcomeBonus`, `grantReloadBonus`, `grantPromoBonus`, `grantCashbackBonus`) вместо единого `grant(campaign_id, context)`.
4. **Нет движка сегментации** — eligibility = индекс депозита + min amount + allowlist игр.
5. **Нет stacking / mutex / priority** кроме мягкого skip «один активный non-once source».
6. **Хуки неполные** — Crash settle, withdraw, daily job, admin actions не подключены.
7. **Frontend сильно отстаёт от backend** — прогресс отыгрыша, рефералы, freebets, cashback в основном отсутствуют или мёртвый nav.
8. **Freebet / welcome / promo / cashback — мины** — вызываемы без продуктовых капов, расписаний и unique-ограничений.
9. **`offer_version` не снапшотится при grant** — смена config задним числом меняет смысл исторических офферов в каталоге.
10. **Пустой `eligible_games` = все игры разрешены** — non-deposit источники наследуют слабые дефолты.

---

## 4. Аудит расширяемости

### Можно ли добавить новые типы промо без переписывания существующего кода?

**В основном нет.** Паттерн сегодня:

| Новый тип | Типичная поверхность изменений |
|---|---|
| Reload bonus | Подключить caller + возможно ужесточить идемпотентность `createInstance`; может править `PromotionManager` |
| Weekly cashback | Новый job начислений, правила source, config, хук на settle/period — **новая подсистема** |
| Lossback | Нужен ledger проигрышей + окна периодов — **не смоделировано** |
| Free spins | Тикеты как freebet + слот-движок — **новый продукт** |
| Промокоды | Новая таблица + redemption API + fraud — **с нуля** |
| Награды турнира | Домен турниров — **вне движка** |
| VIP / день рождения | Сегментация + планировщик — **отсутствует** |
| Ручной admin-бонус | Admin API + audit log — частично (заглушка `on_admin_action`) |

### Где добавление кампании заставляет править существующую бизнес-логику

| Место | Почему |
|---|---|
| `promo/promo_manager.py` | Новые события жизненного цикла / последовательность |
| `database/bonus.py` | Новый метод `grantX` или ветка в `createInstance` / `ONCE_ONLY_SOURCES` |
| `config.py` | Новые константы / кортежи офферов |
| `payments/deposit.py` / `game_manager.py` / Crash | Новые триггеры |
| `main.py` + frontend | Экспозиция |
| Eligibility-хелперы (`_is_game_eligible`, deposit index) | Захардкоженные допущения |

**Переиспользуемо сегодня:** паттерны кредита кошелька, FIFO прогресса отыгрыша, форма ledger реферальных комиссий.  
**Не переиспользуемо как фреймворк кампаний:** каталог офферов, квалификация, сегментация, stacking.

**Модульность по задумке:** хороший kernel, слабая продуктовая платформа.

---

## 5. Аудит конфигурируемости (готовность Admin Panel)

| Параметр | Сейчас | Готово к админке? |
|---|---|---|
| Active/inactive | Деплой кода / `REFERRAL_ENABLED` | Нет |
| Даты start/end | Отсутствуют | Нет |
| Валюты | Подразумевается USD | Нет |
| Игры / risk modes | dict в `config` | Только инженер |
| % / суммы бонуса | `DEPOSIT_BONUS_OFFERS` | Только инженер |
| Требования отыгрыша | Config | Только инженер |
| Max win / max bet | Config (stake× max win **не применён** в формуле капа) | Частично / несогласованно |
| Период claim | Hold-часы реферала в config | Только инженер |
| Expiration | Дни в config | Только инженер |
| Eligible users | Нет (все) | Нет |
| Cooldown / повторяемость | Once-only set в коде | Нет |
| Требования к депозиту | Min в config | Только инженер |
| Приоритет / stacking | Отсутствует | Нет |

**Захардкожено в коде (даже не config):** deep-link URL реферального бота, алфавит/длина ключа, дефолтные множители welcome/reload, поведение «expire сжигает весь BONUS», unlock до principal, строковые enum source, empty-eligibility=allow-all.

**Чтобы кампании стали полностью конфигурируемыми** (порядок величины):

1. `campaigns` + `campaign_versions` + `campaign_rules` JSON/колонки  
2. `campaign_participations` / redemptions с unique-ограничениями  
3. Rule evaluator (qualify → reward → limits)  
4. Admin CRUD + audit log  
5. Планировщик start/end/expire/периодов cashback  
6. Снапшот правил на grant в момент выдачи  

**Оценка:** 6–12 engineer-weeks на правдоподобный v1 слой кампаний (без полного frontend и fraud ML).

---

## 6. Аудит сегментации

**Поддержка сегодня:** отсутствует.

| Сегмент | Поддержан? |
|---|---|
| Страна / язык | Нет |
| VIP-уровень | Нет |
| Возраст регистрации | Нет |
| FTD-статус | Только косвенно через referral `qualified_at` / счётчик депозитов |
| Сумма депозитов / lifetime wager | Счётчик только для индекса тира |
| Последняя активность / неактивные | Нет |
| Affiliate / source | Только ключ атрибуции; нет правил сегмента |
| Кастомные теги / risk level | Таблицы `fraud_signals` / `user_trust_score` есть, но **не используются** |

**Добавить сегменты без переписывания движка:** невозможно. Нужен подключаемый слой предикатов на activation/qualification. Неиспользуемые trust-таблицы — намёк, что идея fraud/сегментов была и застопорилась.

---

## 7. Аудит антифрода

| # | Проблема | Эксплойт | Влияние | Severity | Рекомендуемый фикс |
|---|---|---|---|---|---|
| F1 | Мягкий once-only grant (нет UNIQUE) | Параллельные complete депозита гоняют `hasReceivedSource` → двойной insert одного тира | Двойной BONUS principal | **P0** | `UNIQUE(user_id, source)` для once-only **или** advisory lock / `INSERT … ON CONFLICT` |
| F2 | Freebet `createGrant` без ограничений | Любой будущий caller может минтить бесконечные тикеты | Free EV / ферма бонусов | **P0** (латентный) | Не открывать, пока нет капов + unique `(user_id, day_index)` + оркестрация промо |
| F3 | Слабые дефолты welcome/promo/cashback | Grant без max_bet / пустой eligibility → все Dice/Plinko | Раздутая игра на бонусе | **P0** (латентный) | Требовать снапшот лимитов; запрещать пустой eligibility для денежных grant |
| F4 | Sybil FTD farming | Много аккаунтов по одному инвайту ≥ $3 | Слив bounty (смягчено капом $25/день) | **P1** | Кластеризация device/IP, trust score, progressive FTD, KYC-гейты |
| F5 | Crash не в accrual реферала | Честный пробел / несогласованность edge | Недоплата реферерам; продуктовая дыра | **P1** | Подключить `on_bet_settled` с REAL-settle Crash |
| F6 | Deposit bonus игнорирует выбор игрока | UX выбирает тир; grant идёт по `deposit_index` | Путаница; не прямая кража | **P2** | Убрать выбор или выдавать выбранный eligible оффер |
| F7 | `MAX_WIN_STAKE_MULTIPLIER` не в формуле капа | Config рекламирует правило, которое не enforced | Расхождение с условиями; мягче абсолютного капа $50 | **P1** | Применять `min(stake×mult, absolute)` последовательно в `capBonusWin` |
| F8 | Expire сжигает **весь** BONUS-кошелёк | Взаимодействие нескольких источников / orphan funds | Потеря игрока / нагрузка на саппорт | **P1** | Expire только по principal инстанса; никогда не cross-burn |
| F9 | Нет бюджета промо / глобального потолка spend | Ошибка маркетинговой конфигурации | Неограниченная liability | **P1** | Счётчики бюджета кампании с atomic decrement |
| F10 | Replay webhook депозита | Уже смягчено lock строки депозита + status (wallet pass) | — | Смягчено | Сохранить; добавить idempotency key grant на `deposit_id` |
| F11 | Self-referral | Заблокирован | — | Смягчено | Сохранить |
| F12 | Дубликат referral invite | UNIQUE `referred_id` | — | Смягчено | Сохранить |
| F13 | Двойная FTD-квалификация | Atomic `qualified_at IS NULL` | — | Смягчено | Сохранить |
| F14 | Гонка claim | Profile `FOR UPDATE` + wallet lock | — | Смягчено | Открывать HTTP осторожно в той же TX |
| F15 | Мультиаккаунт с одного платёжного источника | Не обработано | Абьюз бонуса + bounty | **P1** | Payment fingerprint / граф связей выводов |
| F16 | Гонка consume freebet-тикета | Check-then-update без `FOR UPDATE` (вероятно) | Двойное использование тикета | **P1** (когда включат) | `UPDATE … WHERE status=available RETURNING` |
| F17 | Admin forfeit/freeze не подключены | Нет UX kill-switch | Медленный ответ на инцидент | **P1** | Подключить admin-инструменты + audit log |

---

## 8. Согласованность frontend / backend

| Возможность | Backend | Frontend |
|---|---|---|
| Каталог депозитных офферов | Да | Да (селектор) |
| Выбор оффера | Да | Да (но grant игнорирует выбор) |
| Активные бонусы + прогресс отыгрыша | Да (`/api/bonus/active`) | Загружается, **не показывается** |
| Bonus balance | Да | Да (только сумма) |
| UX unlock / expire | Частично | Нет |
| Referral link / stats / claim | Логика есть; **HTTP нет** | Заглушки nav мертвы |
| Freebets | Инфраструктура | Stub |
| Промокоды | Нет | Нет |
| Cashback | Только метод | Неиспользуемый prop |
| Доступность / eligibility кампании | Нет | Только баннер-картинка |
| Обработка ошибок | Сообщения валидации игр | Базовые toast |

**Несогласованные состояния:** игрок может «выбрать» тир, который не будет выдан; метр отыгрыша невидим при показанном BONUS balance; nav рефералов ничего не делает; legacy `/api/bonus/claim` / `/api/referrals/summary` в мёртвом legacy JS.

---

## 9. Аудит исполнения бонуса (игры)

| Проверка | Dice | Plinko | Crash | Будущие слоты |
|---|---|---|---|---|
| Использует BONUS | Да (авто, если eligible) | Да (для deposit только low risk) | **Никогда** | Нет |
| `validateBonusBet` | Да | Да | N/A | Нужно добавить |
| Вклад в отыгрыш | Да через `on_bet_settled` | Да | **Нет** | Нужно подключить |
| Путь freebet | Код есть, HTTP закрыт | То же | Нет | TBD |
| Смешанные балансы | Авто BONUS-first; клиент не может форсировать REAL при eligible BONUS | То же | Только REAL | Нужна явная политика |
| Win cap | `capBonusWin` | То же | N/A | Обязателен |
| Max bet | Enforced | Enforced (unit stake в batch) | N/A | Обязателен |
| Expiration mid-play | Лениво на validate/list | То же | N/A | Нужна проверка на settle |
| Обход лимитов через Crash | **Нет** (нельзя тратить BONUS) | — | — | — |
| Обход через client payload | **Нет** (`preferred_balance` / ticket id нет в HTTP-моделях) | То же | — | Защитить при добавлении полей |

**Блокировка бонуса:** статус инстанса + выбор primary active; отдельного ledger «locked wager pool» нет — только `bonus_balance` + прогресс инстанса.

**Обойти лимиты deposit bonus на Dice/Plinko** при текущем HTTP-поверхности **нельзя**. Остаточный риск — **выдача слабых non-deposit источников**.

---

## 10. Аудит модели данных

### Есть
- `bonus_instances` (grant на пользователя)
- `wallet.selected_bonus_source`, `bonus_balance`
- `frebet_grants` / `freebet_tickets`
- `referral_profiles`, `referrals`, `referral_commissions`
- `users.referrer_id`
- Неиспользуемое: `fraud_signals`, `user_trust_score`

### Не хватает для production-платформы
| Сущность | Зачем нужна |
|---|---|
| `campaigns` | Promo первого класса |
| `campaign_versions` / снапшоты правил | Неизменяемая история |
| `campaign_participations` / redemptions | Квалификация + уникальные claim |
| `promo_codes` / redemptions | Продукт кодов |
| `bonus_ledger` / события вклада | Аудит отыгрыша |
| `campaign_budgets` | Контроль liability |
| `segment_definitions` / assignments | Таргетинг |
| `admin_audit_log` | Compliance |
| `offer_version` на `bonus_instances` | Историческая правда |
| `deposit_id` на bonus grant | Идемпотентность |

**Тысячи кампаний:** текущая модель их не хранит; кортежи config не масштабируются дальше горстки.

---

## 11. Масштабируемость (поддерживаемость продукта)

| Объём | Оценка |
|---|---|
| **~10 промоций** | Больно, но терпимо с новыми `grantX` + config |
| **~100 промоций** | **Неподдерживаемо** без campaign DB + generic grant |
| **~1000 промоций** | Невозможно на текущем дизайне; нужны rule engine, индексы, admin tooling, observability |

Runtime-производительность на текущем объёме в порядке. Узкое место — **пропускная способность инженерии и корректность**, не QPS.

---

## 12. Оценки готовности к production (1–10)

| Измерение | Оценка | Комментарий |
|---|---|---|
| Architecture | **6** | Хороший MVP-kernel; не промо-платформа |
| Flexibility | **3** | Новые типы требуют правок кода |
| Configurability | **3** | Только инженерный `config.py` |
| Scalability (продукт) | **3** | Ломается задолго до 100 кампаний |
| Maintainability | **5** | Понятные модули; риск разрастания grant-методов |
| Security | **6** | Пути кошелька улучшены; гонки grant / латентный freebet остаются |
| Anti-fraud | **5** | Крепкая база атрибуции; слабые Sybil/бюджет/уникальность grant |
| Frontend consistency | **3** | Большой разрыв возможностей |
| Backend consistency | **5** | Хуки неполные (Crash, jobs, API) |
| Bonus execution | **7** | Deposit BONUS на Dice/Plinko крепкий; пробел Crash/referral |
| Future Admin Panel readiness | **2** | Сначала нужна новая модель данных |

**Взвешенно в целом (production promo platform): ~4/10**  
**Как MVP deposit+referral каркас: ~6.5/10**

---

## 13. Критические проблемы (P0)

1. **Нет абстракции кампании** — нельзя безопасно растить продукт дальше нескольких захардкоженных офферов.  
2. **Гонка once-only bonus grant** — нет DB uniqueness на `(user_id, source)`.  
3. **Латентные неуправляемые grant API** (freebet / welcome / promo / cashback) без продуктовых контролей.  
4. **Expire может сжечь чужой BONUS** — опасно, если когда-либо сосуществуют несколько источников.  
5. **Admin Panel невозможна** на текущей схеме — обещание «конфигурируемых кампаний» ложно до переписывания модели.

---

## 14. Высокий приоритет (P1)

1. Снапшотить `offer_version` + поля правил на `bonus_instances` при grant.  
2. Подключить Crash → `on_bet_settled` для реферала (и задокументировать политику Crash BONUS).  
3. Запланировать `on_daily_reset`; подключить admin forfeit/freeze с audit log.  
4. Открыть HTTP summary + claim реферала с теми же lock.  
5. UI игрока: прогресс отыгрыша, статус активного бонуса, рефералы.  
6. Применить `MAX_WIN_STAKE_MULTIPLIER` или убрать из публичных условий.  
7. Уникальный idempotency key: bonus grant на `deposit_id`.  
8. Запретить пустой eligibility для денежных grant; требовать капы.  
9. Контроли Sybil / payment fingerprint для FTD bounty.  
10. Согласовать селектор депозита с фактической логикой grant.

---

## 15. Средний приоритет (P2)

1. Хук вывода (политика forfeit бонуса при withdraw, если нужна).  
2. Ledger вкладов для споров саппорта.  
3. Путь affiliate-продукта (config уже засеян).  
4. Публичные API истории cashout/promo.  
5. Матрица feature-flag по играм для бонуса.  
6. Почистить мёртвый nav / legacy endpoints.  
7. Счётчики бюджета даже для трёх депозитных тиров.

---

## 16. Оценка трудозатрат (до правдоподобного production-фундамента)

| Направление | Трудозатраты |
|---|---|
| P0: уникальность grant + expire-by-instance + заморозка латентных grant | 3–5 дней |
| Campaign + version + participation schema + generic grant | 3–5 недель |
| Rule evaluator (eligibility, stacking, limits) | 2–4 недели |
| Admin CRUD + audit + планировщик | 3–5 недель |
| Segmentation v1 | 1–2 недели |
| UI промо-центра игрока | 2–3 недели |
| Подключить Crash/jobs/referral API + базовый fraud | 1–2 недели |
| **Итого до «real promo platform v1»** | **~3–5 месяцев** (небольшая команда) |

Укрепить **только** текущий MVP (без платформы кампаний): **~1–2 недели**.

---

## 17. Итоговое архитектурное суждение

**Хороший ли это долгосрочный фундамент для production-казино?**

**Как kernel: да, с оговорками.** Сохранить:

- Тонкий `PromotionManager`
- Независимые `BonusManager` / `ReferralManager`
- Config-driven коммерческие seeds (пока нет DB-кампаний)
- Отыгрыш на инстансах + разделение кошельков

**Как платформа: нет, пока нет.** Не растягивать методы `grantX` и кортежи `config.py` на десятки живых промо. Перед непрерывным ростом ввести:

1. Кампанию как данные первого класса  
2. Неизменяемые снапшоты правил на каждый grant  
3. Идемпотентные ограничения участия  
4. Сегментацию + политику stacking  
5. Admin + планировщик + UX промо игрока  
6. Явную матрицу вклада игр (включая Crash / будущие слоты)

До тех пор честно позиционировать это как **MVP deposit-match + customer-referral engine**, а не полноценный Promotion Engine.

---

*Только аудит — реализация не выполнялась.*
