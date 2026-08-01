# Tornado — Аудит финансового абьюза

**Модель противника:** бонус-абьюзер, affiliate/referral-фармер, платёжный фродстер, advantage-player  
**Область:** бизнес-логика, гонки (races), экономика — не XSS/SQLi/CSRF, если только они не позволяют «напечатать» деньги  
**Источник:** живой код (wallet, deposit, withdraw, bonus, referral, promo, games, admin, config)

---

## Главный вывод

Реальный путь потери денег **сегодня**:

1. **Withdraw без hold** + **payout до debit**
2. Усиливается **незаблокированным wallet RMW** (Crash / deposit) и **параллельными PENDING withdraw**

Абьюз referral/bonus — в основном **Sybil-экономика** и **латентный freebet** — идемпотентность deposit-bonus сама по себе в порядке.

---

## Счётчики приоритетов

| Приоритет | Кол-во | Смысл |
|---|---|---|
| **P0** | 6 | Исправить до реального объёма |
| **P1** | 9 | До referral cash-out / freebet / новых промо |
| **P2** | 3 | Корректность / UX / будущее |

---

## Kill chain, которая теряет деньги сегодня

```
Параллельный PENDING withdraw (W2)
  → трата REAL в Crash/Dice (WL1 без lock)
  → admin одобряет
  → W1 платит on-chain ДО debit
```

Параллельный путь:

```
Sybil FTD farming (R1) → REAL bounty
+ dust-депозиты поднимают bonus tier index (B3)
```

---

## P0 — исправить до масштаба

### W1 — Withdraw платит on-chain до debit

| | |
|---|---|
| **Эксплойт** | Создать PENDING withdraw на весь REAL-баланс, затем проиграть/потратить этот баланс в играх. Admin одобряет → BlockBee payout выполняется **до** списания с wallet. Код помечает FAILED уже после ухода денег. |
| **Импакт** | Прямой убыток казино = полная сумма вывода. Комментарий в `approveWithdraw` признаёт, что средства уже отправлены. |
| **Вероятность** | High |
| **Доказательство** | `payments/withdraw.py` — `send_payout`, затем позже `lock_wallet` + debit |
| **Митигация** | Резервировать/списывать REAL в момент **запроса** (hold). Никогда не вызывать `send_payout` до reserved funds. |
| **Приоритет** | P0 |

### W2 — Параллельные PENDING withdraw

| | |
|---|---|
| **Эксплойт** | Два одновременных `createWithdrawRequest`: проверка pending + чтение баланса без `FOR UPDATE` → несколько PENDING-строк до 2× баланса. |
| **Импакт** | Двойной on-chain payout при одобрении обоих (особенно вместе с W1). |
| **Вероятность** | High |
| **Митигация** | Wallet `FOR UPDATE` при create; partial `UNIQUE(user_id) WHERE status IN ('PENDING','PROCESSING')`. |
| **Приоритет** | P0 |

### WL1 — Абсолютный SET баланса без row lock

| | |
|---|---|
| **Эксплойт** | `updateRealBalance` / `updateBonusBalance` пишут абсолютные балансы без lock. Crash `_debit_real` / `_credit_real` и кредиты deposit пропускают `lock_wallet`. Параллельный Crash↔Dice/deposit → lost-update mint или wipe. |
| **Импакт** | Фантомный REAL-кредит или исчезнувшие средства. |
| **Вероятность** | High |
| **Доказательство** | `database/wallet.py`; `games/crash/crash_game.py`; `payments/deposit.py` |
| **Митигация** | Все денежные мутации: `lock_wallet` затем RMW, или относительный `UPDATE … WHERE balance >= debit`. Добавить `CHECK (balance >= 0)`. |
| **Приоритет** | P0 |

### D1 — Кредит депозита без wallet lock

| | |
|---|---|
| **Эксплойт** | `completeDeposit` лочит строку deposit, но кредитует wallet без lock — гонка с живыми ставками (усиливает WL1). |
| **Импакт** | Потерянный кредит депозита или завышенный REAL. |
| **Вероятность** | High |
| **Митигация** | `lock_wallet` в той же TX до credit + bonus grant. |
| **Приоритет** | P0 |

### CR1 — Состояние Crash в RAM / multi-worker

| | |
|---|---|
| **Эксплойт** | Crash loop / `active_bets` живут в памяти процесса. Multi-worker uvicorn или restart mid-round оставляет Pending-ставки списанными без settlement. |
| **Импакт** | Зависшие стейки, failed cashouts, раздвоенная правда между воркерами. |
| **Вероятность** | High (если >1 worker) |
| **Митигация** | Один Crash-воркер или состояние раунда в DB/Redis; recover Pending при старте. |
| **Приоритет** | P0 |

### B1 — Неуправляемые источники бонуса (латентный freebet)

| | |
|---|---|
| **Эксплойт** | Гранты не из deposit (`freebet` / welcome / promo / cashback) создают instances с `max_bet=None`, `max_win_cap=None`, пустым `eligible_games` → валидация трактует пустое как **все игры разрешены**. Freebet по умолчанию `wager_multiplier=1`. |
| **Импакт** | Когда freebet подключён: BONUS на Plinko HIGH без капа, 1× unlock в REAL. |
| **Вероятность** | Med (API ещё не передаёт `freebet_ticket_id`) |
| **Митигация** | Никогда не трактовать отсутствующий offer как unrestricted. Всегда задавать caps + eligible games + product wager для каждого source. Считать **P0 до включения freebet API**. |
| **Приоритет** | P0 |

---

## P1 — до referral cash-out / freebet / новых промо

### B2 — Валидация только по самому старому active bonus

| | |
|---|---|
| **Эксплойт** | `validateBonusBet` / `capBonusWin` смотрят на самый старый active instance; `recordWagerProgress` заполняет **все** active. Микс источников → обход более молодых caps. |
| **Импакт** | Обход max-bet / game / win-cap при ≥2 разных sources. |
| **Вероятность** | Med |
| **Митигация** | Валидировать против самого строгого из всех active. |
| **Приоритет** | P1 |

### B3 — Dust-депозиты поднимают bonus tier index

| | |
|---|---|
| **Эксплойт** | Депозиты &lt; $5 пропускают grant, но всё равно помечаются `Completed` → index растёт. Два dust-депозита, затем крупный депозит попадает на **Tier 3 (100%)** вместо Tier 1 (50%). |
| **Импакт** | До ~2× bonus principal на первом «реальном» депозите (всё ещё capped на $50 max_bonus). |
| **Вероятность** | Med |
| **Митигация** | Считать в tier index только депозиты ≥ `DEPOSIT_BONUS_MIN_DEPOSIT`. |
| **Приоритет** | P1 |

### R1 — Sybil FTD farming

| | |
|---|---|
| **Эксплойт** | Много Telegram-аккаунтов под одним invite. Каждый депозит ≥ $3 → bounty $0.50 REAL (cap $25/день/referrer) **без wager**. Cluster-проверки из спеки не подключены. |
| **Импакт** | До $25/день/referrer REAL + edge share; альты могут ещё взять deposit bonuses при ≥ $5. |
| **Вероятность** | High |
| **Митигация** | Подключить `fraud_signals` / `user_trust_score`; clustering по device/IP/payment; задерживать bounty до REAL wager; clawback; caps на invites/earn. |
| **Приоритет** | P1 |

### R2 — Edge accrual без капа + гонка FTD qualify

| | |
|---|---|
| **Эксплойт** | Edge accrual без daily/lifetime cap. Параллельный FTD qualify без `WHERE qualified_at IS NULL` + profile lock → возможен double bounty. |
| **Импакт** | Неограниченная referral liability; double bounty при burst completes. |
| **Вероятность** | Med |
| **Митигация** | Атомарный qualify update; lock profile; unique bounty на `referred_id`; `max_daily_earn` + auto-freeze. |
| **Приоритет** | P1 |

### R3 — Claim race (латентная)

| | |
|---|---|
| **Эксплойт** | `claim_earnings` RMW без `FOR UPDATE`. Double claim, когда появится endpoint. |
| **Импакт** | Дублированный REAL payout. |
| **Вероятность** | Low (claim API ещё нет) |
| **Митигация** | `SELECT … FOR UPDATE` до claim API. |
| **Приоритет** | P1 |

### FB1 — Гонка consume freebet ticket

| | |
|---|---|
| **Эксплойт** | `consumeTicket` без `FOR UPDATE` / ownership / expiry. Параллельная игра с одним ticket → double-settle. |
| **Импакт** | Двойная бесплатная игра + подпитывает B1. |
| **Вероятность** | Low до подключения API |
| **Митигация** | `UPDATE … WHERE status='available' AND user_id=:uid RETURNING`. |
| **Приоритет** | P1 |

### PF1 — Жизненный цикл Provably Fair seed

| | |
|---|---|
| **Эксплойт** | Dice/Plinko `server_seed` хранится plaintext на жизнь аккаунта; Crash seeds создаются один раз при import, никогда не ротируются/не reveal. Утечка → предсказание всех будущих исходов. |
| **Импакт** | Полное предсказание до restart/rotate. |
| **Вероятность** | Med (ops leak) / catastrophic при экспозиции |
| **Митигация** | Публично только commit-hash; rotate+reveal; никогда не отдавать plaintext; Crash seeds на раунд. |
| **Приоритет** | P1 |

### A1 — Односторонний необратимый payout админом

| | |
|---|---|
| **Эксплойт** | Один owner/admin в Telegram одобряет → мгновенная on-chain отправка. Нет dual control. |
| **Импакт** | Слив всей withdraw-очереди при компрометации admin TG. |
| **Вероятность** | Med |
| **Митигация** | Dual approval выше порога; повторное подтверждение адреса; hold+balance check до payout. |
| **Приоритет** | P1 |

### MON1 — Слепые зоны расследования

| | |
|---|---|
| **Эксплойт** | Нет correlation id через deposit/bet/referral; у ledger нет `UNIQUE(reference_id)`; `fraud_signals` / `user_trust_score` не используются; нет config audit (кто/когда/старое/новое). |
| **Импакт** | Невозможно расследовать фармы, double pays или ошибки админа после факта. |
| **Вероятность** | High |
| **Митигация** | Correlation id на запрос; unique ledger keys; подключить fraud tables; audit log изменений config. |
| **Приоритет** | P1 |

---

## P2 — корректность / UX / будущее

### CFG1 — max_bet &lt; BET_MIN

$5 dep × 50% → principal $2.50 → max_bet $0.05 &lt; BET_MIN $0.10 → бонус нельзя отыграть, expires/burns.  
**Фикс:** `max_bet = max(computed, BET_MIN)` или поднять эффективный min deposit.

### PR1 — Будущий stacking промо

PromotionManager тонкий (только bonus+referral). До cashback/reload/VIP: mutex groups, per-user limits, budget.

### AUTH1 — Заметки по session / attribution

`referrer_id` write-once + same-TG self-ref заблокирован (хорошо). Cookie `secure=False` → кража сессии → **запросы** withdraw (payout всё ещё через admin). Multi-account Sybil остаётся R1.

---

## Проверено: НЕ уязвимо

- Deposit webhook: RSA body signature + deposit `FOR UPDATE` + status/uuid gate
- Deposit bonus grant: once-only sources + `hasReceivedSource` идемпотентен
- Bonus unlock/expire/forfeit: guards `status == active`
- Crash в каталоге `False` для BONUS; код Crash — REAL-only
- WS Crash cashout: settle только через REST + DB pending guard (нет reconnect double credit)
- Referral self-ref same TG + `createInvite` UNIQUE(`referred_id`)
- Withdraw REAL-only (bonus напрямую не выводится)
- Dice/Plinko paid path: wallet `FOR UPDATE` + fairness lock + atomic TX
- Plinko batch: idempotency key + сериализация через wallet lock

---

## Рекомендуемый порядок фиксов

1. **W1 + W2** — withdraw hold; никогда не payout до debit; один PENDING на пользователя  
2. **WL1 + D1** — `lock_wallet` на каждую мутацию REAL/BONUS (Crash + deposit)  
3. **CR1** — один Crash-воркер или durable round state  
4. **B1** — дефолтные caps на все bonus sources до freebet  
5. **B3 + R1/R2** — tier index только для депозитов ≥min; Sybil/trust до referral claims  
6. **MON1** — correlation IDs + fraud tables, чтобы фармы можно было расследовать  

---

## Покрытие vs чеклист

**Конкретные находки:** гонки wallet, порядок withdraw hold/payout, lock кредита депозита, неуправляемые бонусы, tier climbing, referral Sybil/bounty/claim, freebet consume, Crash memory + wallet lock, PF seeds, admin single-click payout, config max_bet&lt;BET_MIN, пробелы мониторинга, будущий promo stacking.

**Низкий остаточный риск:** webhook query `user_id` не привязан (совпадение адреса всё ещё блокирует кражу); reject withdraw TOCTOU (цельность ops); instant crash — house edge, не mint игрока; A/B/segment/budget — только будущее. Бесконечного money loop кроме kill chain race+withdraw и Sybil bounty не найдено.

---

*Английский оригинал: `docs/financial-abuse-audit.md`*
