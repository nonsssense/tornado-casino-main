# Casino Economics Engine — Technical Design Research

**Тип документа:** Исследование архитектуры и продуктовой экономики  
**Аудитория:** Backend-архитекторы, product, finance, risk  
**Область охвата:** Системы промоакций, бонусов, рефералов и аффилиатов  
**Ограничение:** Только принципы проектирования и отраслевая математика — без кода, без схем, без рецептов реализации  
**Статус:** Базовая спецификация для гибкого Promotion Engine  

---

## Executive Summary

Профессиональные iGaming-платформы не рассматривают бонусы, рефералы и аффилиатов как отдельные продукты. Они рассматривают их как **экономические инструменты (economic instruments)**, которые создают, преобразуют и урегулируют **обязательства (liability)** относительно активности игрока.

Три истины доминируют в отраслевой архитектуре:

1. **Обязательство должно быть оценено до его выдачи.** У каждой промоакции есть ожидаемая стоимость. Если вы не можете оценить EV в момент grant, вы не можете контролировать маржу.
2. **Правила должны быть данными, а не кодом.** Платформы, которые хардкодят логику промоакций, не могут итерировать. SOFTSWISS (Bonus API + Motion), EveryMatrix (отделённый BonusEngine), Affilka/NetRefer/Income Access — все сходятся на: *конфигурируемые инструменты + неизменяемые снимки grant + универсальные settlement engines*.
3. **Распределение variance — это бизнес-решение.** Крипто-казино (Stake, Rollbit, BC.Game, Gamdom) часто платят партнёрам на основе **теоретического house edge / EV**, а не реализованного NGR, потому что крипто-объёмы + бонусы + джекпоты делают реализованный P&L слишком шумным. Традиционный iGaming по-прежнему по умолчанию использует **NGR RevShare** с явной политикой negative-carryover.

**MVP design thesis:** Построить один **Promotion Engine**, который понимает *offers → grants → wallets/ledgers → contribution → conversion → settlement → expiry*. Deposit bonuses, cashback, referrals, affiliates, free spins, missions и tournaments — это **конфигурации одних и тех же экономических примитивов**, а не отдельные системы.

---

## Industry Context (Why These Systems Exist)

| Тип актора | Примеры | Экономическая роль |
|---|---|---|
| Crypto casinos | Stake, BC.Game, Rollbit, Shuffle, Gamdom, Roobet, Duelbits | Высокий объём, быстрый settlement, часто комиссия на house-edge / EV, агрессивные VIP и referral |
| Platform providers | SOFTSWISS, EveryMatrix | Bonus engines, PAM, wallet, CRM-автоматизация, API-driven персонализация |
| Game studios | Pragmatic Play (и аналоги) | Интеграции free spins / tournament; ограничения contribution и eligibility |
| Affiliate platforms | NetRefer, Income Access, Affilka | CPA / RevShare / Hybrid, формулы NGR, settlement, партнёрские порталы |

**Почему промоакции существуют (бизнес):**

- **Acquisition:** CAC часто превышает маржу первого депозита; бонусы покупают первую сессию и кривую обучения.
- **Activation:** Депозиторы, которые не ставят, уходят в churn; free spins / free bets принуждают к product discovery.
- **Retention:** Cashback, reload, VIP, missions снижают churn игроков с высоким LTV.
- **Acquisition channel economics:** Аффилиаты и рефералы — это платная дистрибуция; их модель комиссии должна соответствовать качеству трафика и толерантности к variance.
- **Competitive signaling:** Крипто-бренды конкурируют видимой щедростью (rakeback, referral %, VIP). Математика всё равно должна оставлять house edge нетронутым после всех givebacks.

**Почему ограничения существуют (математика):**

Одного house edge **недостаточно**, чтобы защитить вас, если игроки могут:

- clear bonuses на играх с низким edge,
- ставить oversized ставки, чтобы конвертировать бонус в cash при низкой variance,
- через multi-account фармить FTD ради CPA / referral,
- выводить principal, сохраняя bonus EV,
- заставлять вас платить партнёрам за убыточные когорты.

Каждый «раздражающий» параметр бонуса ниже существует, чтобы закрыть одну из этих дыр.

---

# SECTION 1 — Deposit Bonus Mathematics

Депозитный бонус — это не «бесплатные деньги». Это **условное обязательство (contingent liability)**, ожидаемая стоимость которого равна:

```
E[cost] ≈ f(
  grant_amount,
  wagering_burden,
  game_contribution_mix,
  house_edge_of_eligible_games,
  max_bet,
  max_cashout,
  sticky_policy,
  expiry,
  conversion_rules,
  abuse_rate
)
```

Грубая операторская интуиция, используемая по всей отрасли:

```
Clearance EV for skilled player ≈
  BonusValue
  − (EffectiveWagering × HouseEdge)
  − friction(max_bet, expiry, contribution)
  capped by MaxCashout
```

Если EffectiveWagering × HouseEdge > BonusValue (и нет cashout cap), бонус имеет **negative EV** для игрока и дёшев для дома — маркетинговый театр.  
Если наоборот, бонус — это реальный центр затрат и привлекает hunters.

UKGC теперь ограничивает wagering на уровне **10×** на этом рынке (2026), что является структурным напоминанием: **wagering — это регулируемый экономический рычаг**, а не только продуктовая ручка.

---

## 1.1 Bonus Percentage

| Аспект | Детали |
|---|---|
| **Controls** | Match rate на депозит (например, 100% → депозит $100 → бонус $100). |
| **Why exposed** | Маркетинговый headline; конкурентное сравнение; сегментная дифференциация (welcome vs reload). |
| **Financial impact** | Линеен относительно размера grant. Удвоение % удваивает liability до применения caps. |
| **Abuse** | Высокий % + низкий wagering = ферма positive EV. |
| **Math** | `bonus = min(deposit × pct, max_bonus)` с учётом min/max deposit gates. |
| **Industry defaults** | Welcome: 50–200% (у crypto часто выше headline). Reload: 25–100%. |
| **Configurable?** | **Да — всегда.** Ключевой коммерческий рычаг. |

---

## 1.2 Maximum Bonus Amount

| Аспект | Детали |
|---|---|
| **Controls** | Жёсткий потолок grant независимо от размера депозита. |
| **Why** | Ограничивает whale liability; предотвращает катастрофы вида депозит $100k → бонус $100k. |
| **Financial impact** | Обрезает правый хвост стоимости. Доминирующий risk-контроль для high rollers. |
| **Abuse** | Без max крупные депозиты усиливают bonus EV. |
| **Defaults** | Welcome часто $100–$5,000 в зависимости от tier бренда; у crypto может быть выше при более жёстком wagering. |
| **Configurable?** | **Да — обязательно.** |

---

## 1.3 Minimum Deposit

| Аспект | Детали |
|---|---|
| **Controls** | Наименьший депозит, который квалифицирует. |
| **Why** | Фильтрует dust-аккаунты; обеспечивает KYC/payment cost << bonus cost; повышает качество FTD для CPA. |
| **Financial impact** | Снижает micro-abuse; может снизить конверсию игроков с низким намерением. |
| **Abuse** | Крошечные депозиты + multi-accounts для фарма бонусов / referral CPA. |
| **Defaults** | $10–$20 обычны; у crypto иногда ниже ($1–$5), что увеличивает поверхность abuse. |
| **Configurable?** | **Да.** |

---

## 1.4 Maximum Deposit (for bonus eligibility)

| Аспект | Детали |
|---|---|
| **Controls** | Верхняя граница депозита, при которой всё ещё начисляется бонус (отличается от max bonus). |
| **Why** | Иногда используется, чтобы исключить whales из массовых офферов (VIP обрабатывается отдельно). |
| **Financial impact** | Сегментирует продукт: массовое промо vs VIP desk. |
| **Abuse** | Меньше про abuse, больше про дизайн оффера. |
| **Configurable?** | Опционально, но полезно. |

---

## 1.5 Wager Multiplier

| Аспект | Детали |
|---|---|
| **Controls** | Сколько раз wager base должен быть прокручен до conversion/withdrawal. |
| **Why** | Главный EV-дроссель. Принуждает к экспозиции к house edge. |
| **Financial impact** | Expected house take ≈ `wager_target × edge × contribution_adjusted`. Выше multiplier → ниже player EV → ниже стоимость для оператора (пока оффер не перестаёт конвертировать). |
| **Abuse** | Низкий multiplier + игры с высоким RTP = bleed. |
| **Defaults** | Offshore/crypto: часто 30–60×. Player-friendly: 20–35×. Регулируемый UK: ≤10×. |
| **Configurable?** | **Да — первичный.** |

**Математическое следствие:**  
`required_turnover = wager_base × multiplier`  
Эффективная стоимость clearance растёт обратно пропорционально contribution rate (см. §1.11).

---

## 1.6 Wager Base (Bonus-only vs Deposit+Bonus)

| Аспект | Детали |
|---|---|
| **Controls** | Что именно умножает multiplier. |
| **Why** | Тихо удваивает (или больше) реальную сложность, не меняя headline «35×». |
| **Financial impact** | `deposit+bonus` при 100% match ≈ **2×** turnover относительно bonus-only. Огромное снижение EV. |
| **Abuse** | Игроки неправильно читают «35×» и принимают худшие условия — риск споров, если неясно. |
| **Defaults** | Оба распространены; прозрачные операторы явно указывают base. |
| **Configurable?** | **Да — критично.** |

Пример: депозит $100, бонус 100%, 35×  
- Bonus-only: $3,500 turnover  
- D+B: $7,000 turnover  

То же маркетинговое число, двойная экономическая нагрузка.

---

## 1.7 Max Cashout

| Аспект | Детали |
|---|---|
| **Controls** | Потолок выводимых выигрышей из средств, полученных от бонуса. |
| **Why** | Ограничивает liability, когда variance идёт против дома (особенно free spins / no-deposit). |
| **Financial impact** | Обрезает upside игрока; делает редкий jackpot-on-bonus переживаемым. |
| **Abuse** | Без cap одна удачная серия конвертирует дешёвый бонус в крупное cash liability. |
| **Defaults** | No-deposit / free spins: часто 5–50× бонуса или фиксированные $50–$500. Deposit match: иногда без потолка или с высоким cap. |
| **Configurable?** | **Да — особенно для free / high-variance инструментов.** |

---

## 1.8 Max Bet While Wagering

| Аспект | Детали |
|---|---|
| **Controls** | Максимальная ставка на bet/spin, пока бонус активен. |
| **Why** | Предотвращает «one-spin clearance» и извлечение variance на малой выборке. |
| **Financial impact** | Принуждает к множеству независимых испытаний → закон больших чисел → house edge реализуется. |
| **Abuse** | Oversized ставки на бонусные средства могут конвертировать EV в cash с высокой вероятностью успеха в коротком горизонте. |
| **Defaults** | Классический fiat: ~€/$5. Crypto: часто % от бонуса или абсолютный crypto-эквивалент. Отраслевой ориентир: ~10–15% бонуса как более мягкое правило для дизайна, но абсолютные caps остаются распространёнными. |
| **Configurable?** | **Да — обязательный anti-abuse.** Нарушение обычно аннулирует бонус + выигрыши. |

---

## 1.9 Expiration

| Аспект | Детали |
|---|---|
| **Controls** | Временное окно для clear wagering / claim / convert. |
| **Why** | Ограничивает длительность открытого liability; создаёт urgency; снижает долгоживущий accounting debt. |
| **Financial impact** | Короче expiry → больше forfeiture → ниже реализованная стоимость, но хуже UX и больше жалоб. |
| **Abuse** | Длинные окна позволяют терпеливым hunters и медленному арбитражу. |
| **Defaults** | 7 дней обычно; 14 щедро; 30 для VIP/reload. Claim windows иногда короче, чем clear windows. |
| **Configurable?** | **Да.** При необходимости раздельно *claim expiry* vs *wagering expiry* vs *converted-funds expiry*. |

---

## 1.10 Auto-Claim vs Manual Claim vs Opt-Out

| Режим | Почему существует | Economics / ops |
|---|---|---|
| **Auto-claim** | Максимизирует take-rate оффера; снижает friction. | Более высокая реализация liability; игроки могут чувствовать себя «обманутыми», если sticky. |
| **Manual claim** | Informed consent; дружественность к регуляторике; гигиена opt-in. | Ниже take-rate; лучше позиция в спорах. |
| **Opt-out** | Позволяет вовлечённым игрокам отказаться от офферов с плохим EV. | Снижает принудительный sticky lock-in; повышает доверие; может снизить стоимость бонуса. |

**Configurable?** Да. Регулируемые рынки склоняются к opt-in/manual. Crypto часто auto с семантикой forfeit-on-withdraw.

---

## 1.11 Bonus Priority / Real Balance Priority / Spend Order

| Политика | Значение | Почему |
|---|---|---|
| **Real-first (non-sticky / parachute)** | Сначала тратится cash; бонус активируется, когда cash ≈ 0. | Защищает депозит; игрок может вывести cash-выигрыши, отказавшись от бонуса (forfeit). |
| **Bonus-first** | Сначала расходуется бонус. | Более быстрый bonus burn; другой путь EV. |
| **Proportional / merged (sticky)** | Объединённый пул; вывод заблокирован, пока wagering не выполнен. | Блокирует депозит за стеной wagering. |

**Financial impact:** Sticky + (D+B) wagering — самая защищающая дом распространённая структура и самая враждебная к игроку. Non-sticky дружелюбнее и всё ещё контролируем через wagering, max bet, contribution, cashout caps.

**Industry note:** Крипто-бренды различаются; традиционные операторы часто используют non-sticky с forfeit. Выбор продукта — это позиционирование бренда не меньше, чем математика.

**Configurable?** **Да — фундаментальный тип инструмента.**

---

## 1.12 Game Contribution Weighting

| Аспект | Детали |
|---|---|
| **Controls** | Доля каждой ставки, которая засчитывается в wagering (slots 100%, blackjack 5–10% и т.д.). |
| **Why** | Игры с низким edge могут clear bonuses при крошечном ожидаемом убытке. Contribution восстанавливает house EV. |
| **Math** | `progress += stake × contribution_rate`  
`effective_turnover_needed = required_turnover / contribution_rate` |
| **Defaults** | Slots ~100%; roulette ~10–20%; blackjack/video poker ~0–10%; некоторые originals/high RTP исключены. |
| **Abuse** | Пробелы в weighting (игра неверно классифицирована) — классические эксплойты hunters. |
| **Configurable?** | **Да — по категории и по title.** Должен быть snapshot в момент grant. |

---

## 1.13 Excluded Games

Абсолютный 0% contribution или жёсткая блокировка, пока бонус активен. Используется для:

- high RTP / low variance titles,
- игр с bonus buy features, которые искажают sizing ставки,
- title провайдеров с конфликтами free-spin,
- crash / dice / originals, где edge известен и farmable.

**Configurable?** Да. Списки исключений часто меняются → должны быть версионированы.

---

## 1.14 Loss Contribution

Некоторые системы cashback / wagering засчитывают **net losses**, а не turnover.

| Аспект | Детали |
|---|---|
| **Controls** | Отслеживает ли progress ставки, settled losses или оба. |
| **Why** | Cashback по природе loss-based; некоторые варианты «wagering» используют net loss, чтобы предотвратить churning без риска. |
| **Abuse** | Чистый turnover можно геймить хеджированными / почти гарантированными ставками; loss-based этому сопротивляется. |
| **Configurable?** | Да для cashback-подобных инструментов; обычно нет для классического deposit match (turnover — стандарт). |

---

## 1.15 Conversion Rules / Partial Conversion / Progressive Unlock

| Правило | Значение | Почему |
|---|---|---|
| **All-or-nothing conversion** | Бонус становится cash только когда полный wagering выполнен. | Простой accounting; распространено. |
| **Partial conversion** | Pro-rata unlock по мере прогресса wagering. | Лучше UX; сложнее ledger; может увеличить early withdrawal leakage. |
| **Progressive unlock** | Вехи (25/50/75/100%) разблокируют доли. | Механика retention; снижает cliff frustration. |
| **Winnings-only conversion** | Sticky: principal бонуса никогда не выводится; только surplus выше бонуса может быть выведен. | Классическая sticky-математика: `withdrawable = max(0, balance − bonus_principal)`. |

**Математическое следствие обработки sticky principal:**  
Игрок, закончивший с $380 после sticky-бонуса $200, выводит $180. Медленный grinding может дать **отрицательный net vs deposit** даже после «успешной» игры — намеренная защита дома.

---

## 1.16 Sticky vs Non-Sticky (Deep Dive)

| | Sticky | Non-sticky |
|---|---|---|
| Balance model | Merged / locked | Separate cash + bonus |
| Withdraw before clear | Нет (или только после forfeit всего связанного) | Да на cash (forfeit bonus) |
| Player risk | Депозит заблокирован | Депозит защищён |
| Operator liability profile | Ниже player EV, выше риск споров | Выше player EV optionality, ниже lock-in |
| Marketing | Выглядит больше / проще | Требует education |

**Рекомендация для современного crypto MVP:** Предпочитать **non-sticky** с явным forfeit, сильным max-bet, contribution и cashout-контролями. Sticky — грубый инструмент, который повреждает доверие и нагрузку на support. Использовать sticky только для специфических high-match VIP-инструментов, если вообще.

---

## 1.17 Principal Handling & Surplus Handling

После успешного wagering:

1. **Principal (deposit):** всегда cash (если sticky его не заблокировал).  
2. **Bonus principal:** либо конвертируется в cash (cashable/non-sticky cleared), либо вычитается (sticky).  
3. **Surplus (выигрыши выше principal):** подлежит max cashout; остаток forfeited или перемещён в bonus void.

**Обработка expired balance (отраслевые паттерны):**

- Forfeit оставшегося бонуса + связанных выигрышей.
- Конвертировать неиспользованную часть в ноль; сохранить real cash.
- Редко: конвертировать остаток в low-value locked funds (плохая практика — accounting mess).

**Configurable?** Policy enums: `on_expiry`, `on_forfeit`, `on_withdraw_request`, `on_violation`.

---

## 1.18 Parameter Configurability Verdict

| Параметр | Configurable? | Snapshot at grant? |
|---|---|---|
| %, min/max deposit, max bonus | Да | Да |
| wager multiplier & base | Да | Да |
| max bet / max cashout / expiry | Да | Да |
| sticky policy / spend order | Да | Да |
| contribution & exclusions | Да | Да (критично) |
| conversion / unlock schedule | Да | Да |
| claim mode | Да | Да |
| house edge of games | Обычно из game catalog, не из promo | Версия catalog referenced |
| wallet double-entry mechanics | Нет — инвариант engine | N/A |

---

# SECTION 2 — Referral Program Mathematics

Различайте внимательно:

| Программа | Кто | Типичный crypto-паттерн |
|---|---|---|
| **Player referral** | Пользователь приглашает друга | Lifetime % от house edge / wager commission (Stake ~10% of edge; Gamdom 10–20% of edge; BC.Game wager-% + VIP transfer bounties) |
| **Affiliate** | Коммерческий партнёр | CPA / NGR RevShare / Hybrid через платформы класса Affilka |

Они разделяют инфраструктуру attribution, но **разные risk, KYC, contracts и settlement**.

---

## 2.1 Lifetime Attribution

**What:** First-touch referrer владеет игроком навсегда (обычно в crypto).  
**Why:** Просто; сильный стимул к рекрутингу.  
**Math:** Создаёт **perpetual liability** = `Σ_t commission_rate_t × commission_base_t`.  
**Trade-off:** Lifetime щедр; без quality gates вы платите вечно за когорты bonus-abuse.  
**Alternative:** Time-boxed attribution (12–24 месяца) — редко в crypto, встречается в некоторых традиционных сделках.

**MVP recommendation:** Lifetime для player referral, но commission base должен быть **edge-based или NGR-after-bonus**, никогда raw deposits.

---

## 2.2 FTD Qualification

**What:** Награда за реферал начинается (или разблокируется) только после First Time Deposit.  
**Why:** Фильтрует фейковые регистрации; выравнивает с ценностью acquisition.  
**Math:** Без FTD gate фарминг рефералов пустыми аккаунтами стоит support/infra при нулевом GGR.  
**Configurable:** Min FTD amount, качество payment method, завершённый KYC.

---

## 2.3 Referral Qualification Beyond FTD

Распространённые дополнительные gates:

- minimum real-money wager (не bonus wager),
- cooling period,
- исключение same IP / device / payment fingerprint,
- geo eligibility,
- возраст аккаунта referrer / история ставок (anti-self-referral rings).

**Why:** Один только FTD геймится циклами deposit-withdraw и multi-accounting.

---

## 2.4 Real Wager vs Bonus Wager

| Base | Значение | Следствие |
|---|---|---|
| All wager | Включает ставки на бонусные средства | Вы платите комиссию за активность, которую сами субсидировали |
| Real-money wager only | Исключает bonus stakes | Корректно для маржи |
| Edge on real wager | Теоретическая доля EV | Crypto-standard, стабильно |

**Industry crypto standard:** Комиссия на **house edge eligible real wagers** (или близких вариантах). Платить на bonus wager — accounting self-own.

---

## 2.5 Revenue Share Calculation (Referral)

Три математических семейства:

### A) Theoretical Edge Share (crypto-native)

```
commission = Σ (stake × house_edge × referrer_rate)
```

Пример: stake $1,000, edge 2%, rate 10% → $2.

**Pros:** Нет negative carryover; предсказуемая стоимость для оператора как % от theoretical win.  
**Cons:** Риск game-mix на партнёре; нужно поддерживать точную edge table; выигрыши игрока не снижают комиссию (оператор сохраняет variance).

Концептуально используется программами стиля Stake/Rollbit/Gamdom.

### B) Realized NGR Share

```
NGR = GGR − bonuses − fees − …  
commission = NGR × rate
```

**Pros:** Выравнивает с прибылью.  
**Cons:** Variance, споры, политика NCO — обычно overkill для *player* referral.

### C) Flat bounty

```
pay $X on qualified FTD / VIP transfer
```

VIP transfer bounties в стиле BC.Game (до крупных фиксированных сумм) — это acquisition CPA под видом referral.

---

## 2.6 Payout Timing — Batch vs Real-Time

| Режим | Почему | Trade-offs |
|---|---|---|
| **Real-time / near-real-time accrual** | Dopamine; crypto UX | Сложнее fraud reversal; шум ledger |
| **Daily batch** | Баланс UX и ops | Хороший MVP default |
| **Weekly / monthly settlement** | Контроли уровня affiliate | Слишком медленно для consumer referral UX |

**Recommendation:** Начислять непрерывно (видимый баланс), **settle/claim** по расписанию с clawback window для fraud.

---

## 2.7 Tier Progression & Retroactive Tiers

| Политика | Значение | Math |
|---|---|---|
| Prospective tiers | Более высокая ставка применяется только к будущей активности | Предсказуемое liability |
| Retroactive tiers | Более высокая ставка пересчитывается на прошлый период | Взрывающееся liability; affiliate-friendly, опасно для оператора |
| Volume tiers by FTDs / wager | FTD-лестницы в стиле BC.Game для аффилиатов | Поощряет качественный объём |

**MVP:** Только prospective. Retroactive — это контрактная фича для стратегических аффилиатов, не для player referral.

---

## 2.8 Referral Abuse, Self-Play, Fraud

Основной attack graph:

1. Self-referral (один человек — два аккаунта).  
2. Collusive rings (общие devices, VPN farms).  
3. Bonus-funded wager loops, генерирующие edge commission.  
4. Deposit-min + withdraw для триггера FTD bounties.  
5. Referrer мотивирует друзей off-platform kickbacks + bonus stacking.

**Controls (product-level, не implementation):**

- исключение по device / payment / KYC graph,
- пороги real-wager до accrual,
- исключение bonus stakes из commission base,
- commission delay / hold,
- lifetime caps на referrer на раннем этапе,
- правила geo + velocity.

---

## 2.9 Long-Term Liability

Lifetime edge share — это **liability annuity**. Finance должен моделировать:

```
Referral_LTV_cost ≈ LTV_wager × avg_edge × rate × survival
```

Если VIP rakeback + referral + affiliate могут стакаться на одной и той же ставке, **total giveback** может превысить устойчивую маржу. Архитектура должна определить **stacking / priority / exclusion** между:

- player rakeback,
- referrer commission,
- affiliate commission.

**Industry pattern:** Обычно affiliate XOR player-referral attribution (один владелец). Rakeback всё ещё может стакаться на стороне игрока — должен вычитаться из NGR/EV base при выплате B2B аффилиатам.

---

# SECTION 3 — Affiliate Program

Профессиональная экономика аффилиатов (мышление класса NetRefer, Income Access, Affilka, Scaleo):

## 3.1 CPA

**Definition:** Фиксированная выплата за квалифицированное привлечение (обычно FTD, иногда FTD + wager).  

**Why:** Paid media нуждается в предсказуемом cashflow. Оператор покупает игроков по известному CAC.

**Math:**

```
CPA_ROI = Player_LTV_NGR − CPA − bonus_cost − payment_cost − fraud_cost
```

**Risk:** Платить CPA за bonus abusers / one-deposit churners.  
**Mitigation:** Qualification (min deposit, min wager, KYC, no multi-account), delayed CPA, clawbacks.

**Industry standard:** Да, особенно для media buyers. Ставки сильно варьируются по geo и vertical.

---

## 3.2 RevShare

**Definition:** Постоянный % от revenue привлечённых игроков.

**Bases:**

| Base | Взгляд оператора | Взгляд аффилиата |
|---|---|---|
| **GGR** | Дорого; игнорирует bonus/tax/fees | Привлекательно, просто |
| **NGR** | Отраслевой default для traditional | Нужно доверять deductions |
| **House edge / EV** | Crypto-friendly; variance остаётся у оператора | Стабильный доход; риск game-mix |

**Standard RevShare rates (traditional):** ~25–45% of NGR; медиана часто ~30–35% в обсуждениях операторских данных.  
**Crypto:** Публикуемые ставки различаются; переговоры обычны (opacity в стиле Stake vs опубликованные tiers BC.Game).

---

## 3.3 Hybrid

**Definition:** Сниженный CPA + сниженный RevShare.

**Why:** Новые программы с неизвестным качеством трафика; инфлюенсеры со spiky-кампаниями; аффилиаты, которым нужны cashflow + upside.

**Industry standard:** Сильный default для запуска программ.

---

## 3.4 GGR vs NGR (Deep)

```
GGR = stakes − winnings
NGR = GGR − bonuses − taxes − PSP fees − chargebacks − jackpot contributions − (sometimes) provider fees
```

NGR может быть **на 30–65% ниже** GGR в зависимости от интенсивности бонусов и юрисдикции.  
Headline «35% RevShare» на NGR может эффективно равняться ~15–20% of GGR.

**Operator recommendation:** Платить на **NGR или EV**, никогда на raw GGR, если только ставка не радикально ниже и deductions невозможно определить (ранние crypto MVP иногда вместо этого используют edge share).

---

## 3.5 Negative Carry-Over (NCO)

| Политика | Значение | Кому нравится |
|---|---|---|
| **NCO on** | Отрицательный месяц переносится как дефицит против будущих комиссий | Операторам с jackpot variance |
| **No NCO** | Месяц сбрасывается в ноль; оператор абсорбирует отрицательное | Аффилиатам (магнит для рекрутинга) |
| **Capped NCO** | Перенос на 1–2 периода, затем reset | Компромисс |
| **Per-player NCO** | Один whale не заражает весь портфель | Апгрейд справедливости |

**Industry reality:** NCO — жалоба аффилиатов №1. Крипто-бренды часто рекламируют **no NCO** или избегают его структурно через edge-модели (per-bet edge share в стиле Rollbit не может уйти в минус тем же способом).

**MVP recommendation:**

- Player referral: edge model → NCO нерелевантен.  
- B2B affiliates: начинать с **No NCO** или capped NCO для рекрутинга; переходить к более жёстким условиям только с premium-партнёрами и прозрачной отчётностью.

---

## 3.6 Lifetime Attribution & Revenue Delay

- **Lifetime** распространён у iGaming affiliates.  
- **Revenue delay / hold:** 7–30 дней, чтобы учесть chargebacks, review bonus abuse, KYC fails.  
- **Settlement periods:** weekly (crypto) до monthly (traditional).  

---

## 3.7 Partner Obligations & Liabilities

Типичная контрактная экономика (концептуально):

- no incentivized traffic without disclosure,
- no brand bidding,
- fraud / multi-accounting clawbacks,
- creative compliance,
- geo restrictions,
- видимость sub-affiliate (SubIDs),
- право менять неопубликованные ставки с уведомлением для будущих игроков (не всегда прошлых).

**Partner liability:** Обычно ограничена качеством трафика; оператор несёт game variance, если только EV-модель не переносит риск.

---

## 3.8 What Is Industry Standard?

| Решение | Стандарт |
|---|---|
| RevShare base | NGR (traditional); edge/EV (многие crypto) |
| CPA | Распространён для paid traffic |
| Hybrid | Распространённый launch default |
| Lifetime | Распространён |
| NCO | Спорно; раскрывать ясно |
| Transparent deductions | Обязательны для доверия |
| Player referral ≠ affiliate | Отдельные продукты, общий attribution service |

---

# SECTION 4 — Promotion Engine Architecture

## 4.1 Design Goal

Поддерживать сегодняшние и завтрашние промоакции **без изменения backend business logic**:

Deposit / reload / cashback / VIP / referral / affiliate / promo codes / free bets / free spins / daily-weekly rewards / seasonal / missions / tournaments / unknown future.

## 4.2 Core Insight from Industry Platforms

| Паттерн платформы | Урок |
|---|---|
| EveryMatrix BonusEngine detached from PAM | Логика бонусов — отдельный домен; wallet — зависимость |
| SOFTSWISS Bonus API + Motion (trigger → condition → action) | CRM запускает промоакции как configuration + automation, а не через deploys |
| Affilka / NetRefer / Income Access | Settlement и partner rules — это configuration + reporting |
| Pragmatic free spins | Внешним award instruments нужны adapters, тот же grant lifecycle |

**Architectural principle:**  
Разделять **Offer Catalog** (что можно выдать) от **Grant Lifecycle** (что было выдано) от **Settlement** (как движется ценность) от **Eligibility Automation** (кому предлагают).

---

## 4.3 Economic Primitives (The Only Backend Concepts)

Гибкому engine нужен небольшой набор примитивов. Новые типы промоакций — это **композиции**, а не новые engines.

### Primitive A — Instrument Types

Логические классы наград:

1. **Bonus Money** (баланс, связанный wagering)  
2. **Cash Credit** (реальный баланс, возможно с мягкими ограничениями)  
3. **Free Spins / Free Bets** (provider-linked или internal)  
4. **Cashback Accrual** (убыток за период → payout)  
5. **Commission Accrual** (referral/affiliate)  
6. **Points / XP / Mission Progress** (non-cash, конвертируемые по правилам)  
7. **Tournament Score** (competitive ranking → prize pool)  
8. **Entitlement** (fee skip, higher limits, VIP flag)

### Primitive B — Offer

Версионированное определение коммерческого продукта: eligibility, schedule, caps, instrument template, stacking rules, budget.

### Primitive C — Grant (Instance)

Неизменяемый snapshot правил, применённых к конкретному игроку в момент claim/award + изменяемое progress state (оставшийся wagering, оставшиеся spins, status).

### Primitive D — Contribution Event

Нормализованные события gameplay/payment, которые обновляют прогресс grant или commission bases.

### Primitive E — Settlement Action

Движения ledger: convert, expire, forfeit, pay commission, unlock cashout, award prize.

### Primitive F — Attribution Edge

Кто владеет игроком для целей referral/affiliate (рекомендуется exclusive owner).

---

## 4.4 Generic Lifecycle (All Promotions)

```
Schedule/Publish Offer
    → Evaluate Eligibility (segment, geo, KYC, history, exclusions)
        → Create Grant (snapshot rules)
            → Fund Instrument (bonus wallet / spins / accrual bucket)
                → Observe Contribution Events
                    → Update Progress / Accruals
                        → Convert / Unlock / Pay / Expire / Forfeit
                            → Close Grant + emit accounting
```

Missions и tournaments используют тот же spine: grant = enrollment; contribution = qualified actions; settlement = reward table.

---

## 4.5 How Future Promotions Fit Without New Logic

| Будущая идея | Композиция |
|---|---|
| “Deposit 3 days in a row” | Mission progress instrument + cash/bonus settlement |
| “Wager $10k this week for raffle ticket” | Mission + lottery entitlement |
| “Lossback 10% on crash only” | Cashback accrual, отфильтрованный по game tag |
| “Streamer drop codes” | Promo code offer → free spins grant |
| “Dynamic personalized match %” | Offer template + eligibility service подаёт параметры в snapshot |

Backend logic остаётся: eligibility → grant → contribute → settle.  
Изменения продукта остаются: offer configuration + reward tables.

---

## 4.6 Stacking, Priority, Exclusion

EveryMatrix подчёркивает **dependency and exclusion logic** между бонусными программами. Это обязательно.

Engine должен поддерживать декларативные правила, такие как:

- welcome XOR reload,
- max one active wagering bonus,
- cashback стакается с VIP rakeback или нет,
- affiliate-attributed игроки исключены из referral,
- promo code нельзя комбинировать с welcome package,
- порядок priority, когда существует несколько cashback.

**Why:** Неконтролируемый stacking — это то, как total giveback превышает house edge.

---

## 4.7 Budgets & Kill Switches

Профессиональные системы рассматривают промоакции как **budgeted campaigns**:

- global budget,
- per-segment budget,
- per-player cap,
- daily issuance cap,
- auto-disable при исчерпании бюджета,
- manual kill switch без redeploy.

Так продуктовые эксперименты остаются безопасными.

---

## 4.8 Recommended Logical Architecture (Conceptual Layers)

1. **Catalog & Configuration Layer** — offers, templates, schedules, A/B variants  
2. **Decision / Eligibility Layer** — кто квалифицируется (могут быть rules + CRM triggers)  
3. **Grant & Snapshot Layer** — неизменяемые коммерческие условия на каждую награду  
4. **Wallet / Ledger Layer** — балансы и accounting (забота PAM)  
5. **Contribution Pipeline** — bets, deposits, losses → progress  
6. **Settlement Engine** — conversions, payouts, expiries, forfeits  
7. **Partner Economics Layer** — referral/affiliate accrual & statements  
8. **Risk / Abuse Layer** — velocity, graphs, void reasons  
9. **Reporting / Liability Layer** — outstanding bonus liability, accrued commissions  

Ни один слой не должен хардкодить «математику welcome bonus». Welcome bonus — это offer template, использующий Bonus Money + политику wagering settlement.

---

# SECTION 5 — Configuration System

## 5.1 What Belongs in Configuration

Всё, что product manager или CRM marketer меняет еженедельно:

- commercial numbers (%, multipliers, caps, dates),
- eligibility segments,
- contribution weights & exclusions,
- stacking/exclusion matrices,
- claim modes,
- budgets & schedules,
- reward tables (mission tiers, tournament prizes),
- commission rates & bases,
- copy/T&Cs references,
- A/B variant weights.

## 5.2 What Belongs in Business Logic (Engine Invariants)

Редко меняется; критично для корректности:

- double-entry ledger consistency,
- grant state machine (pending → active → converted/expired/forfeited/void),
- snapshot immutability after grant,
- idempotent settlement,
- contribution application algebra,
- abuse void reason model,
- attribution exclusivity rules,
- money precision & rounding policy,
- timezone/settlement period definitions.

## 5.3 What Belongs in Immutable Snapshots

**Industry + regulatory answer:** Как только игрок opted in / внёс депозит в ожидании бонуса / начал игру, условия не должны меняться для этого grant.

Руководство UKGC по unfair-terms явно: операторы не должны изменять или прекращать промоакцию для потребителей, которые уже opted in / внесли депозит / начали игру, кроме как для предотвращения fraud.

**Поэтому профессиональные платформы делают snapshot:**

- всех числовых условий,
- версии contribution map,
- conversion policy,
- max bet / cashout,
- expiry timestamps,
- hash версии документа T&Cs,
- currency & FX policy, использованную при grant.

Активные grants **сохраняют исходные правила** после правок catalog. Правки catalog влияют **только на будущие grants**.

Именно поэтому тихие правки T&Cs — отраслевая проблема доверия: без snapshots споры невозможно выиграть.

---

## 5.4 Rule Versioning Model (Conceptual)

1. **Offer Template vN** — редактируемый draft.  
2. **Published Offer Version** — неизменяемая коммерческая ревизия.  
3. **Grant Snapshot** — копия published version (+ resolved personalized params).  
4. **Catalog references** — version ID набора game contribution хранится в snapshot.

**Можно ли “hotfix” активный grant?**  
Только через явную **migration policy**: согласие игрока, или fraud void, или выгодное изменение с audit. Никогда silent tightening.

---

## 5.5 Configuration vs Personalization

Паттерн SOFTSWISS Bonus API: defaults бэк-офиса + API-driven персонализированные awards.

Чистое разделение:

- **Template** определяет допустимые диапазоны параметров и тип инструмента.  
- **Decisioning** (CRM/Motion-like) выбирает eligible игроков и может заполнять параметры в пределах диапазонов.  
- **Engine** валидирует диапазоны, делает snapshots, выдаёт grants.

Это не даёт CRM изобретать небезопасные инструменты вне risk bounds.

---

# SECTION 6 — Mathematical Liability by Promotion Type

Шкала риска: **L** low / **M** medium / **H** high / **C** critical  

| Type | Expected cost driver | EV character | Liability shape | Abuse potential | Risk | Ops complexity |
|---|---|---|---|---|---|---|
| Deposit match | Grant × clearance rate × (1 − house take on wagering) | Настраивается через wagering/caps | Open bonus balances + potential cashout | H | H | M |
| Reload | То же, меньше, повторно | Обычно ниже welcome | Recurring | M | M | M |
| Cashback | % от net losses за период | Часто negative EV для игрока, если с wagering; positive, если cash | Accrued payable | M (multi-account loss shaping) | M | M |
| VIP bonus | Discretionary / tier tables | Relationship cost | Negotiated | L–M | M | H (human) |
| Player referral | Edge × rate × lifetime wager | Annuity | Perpetual accrued commissions | H (rings) | H | M |
| Affiliate CPA | Flat × qualified FTD | CAC | Near-term payable | H | H | M |
| Affiliate RevShare | % NGR/EV lifetime | Profit share | Long-tail | M–H | H | H |
| Promo codes | То же, что underlying instrument | Depends | Campaign-capped | H (leakage) | M | L–M |
| Free bets | Stake не возвращается; выигрыши могут быть bonus | Sports matched-betting sensitive | Short | H | H | M |
| Free spins | Spins × stake × RTP path + wagering on wins | High variance | Short + wagering tail | H | H | M (provider) |
| Daily/weekly rewards | Calendar grant value | Habit loop | Предсказуемо, если capped | M | L–M | L |
| Seasonal | Campaign budget | Marketing | Budget-capped | M | M | M |
| Missions | Reward table × completion rate | Controlled | Низко, если rewards малы | M | L–M | M |
| Tournaments | Prize pool (+ fee opt.) | Pool — жёсткий cap | Prize pool liability | M (collusion) | M | H |

### Operator cost heuristics

**Deposit bonus (simplified):**

```
E[cost] ≈ P(clear) × E[converted_value | clear] + P(forfeit) × 0
         + support/fraud overhead
```

При сильном wagering многие игроки делают forfeit → marketing cost << face value.

**Edge referral:**

```
E[cost]/wagered = house_edge × referrer_rate
```

Если edge 2% и rate 10%, referral стоит **0.2% of turnover** — легко бюджетировать, опасно, если стакается с 10% rakeback + 25% affiliate EV share на той же базе без exclusions.

**Cashback:**

```
E[cost] ≈ cashback_rate × E[net_losses_eligible]
```

Иронично, стоимость cashback растёт, когда игроки проигрывают — он смягчает churn, но выплачивается в проигрывающих когортах. Cap за период.

**Free spins:**

```
E[cost] ≈ spins × bet × (1 − RTP)   // theoretical
+ wagering conversion leakage on wins
+ jackpot tail if not excluded
```

Max cashout необходим.

---

# SECTION 7 — Flexibility & Rapid Experimentation

## 7.1 What Product Managers Must Do Without Deploys

Отраслевой CRM/bonus tooling существует именно для того, чтобы маркетологи могли:

1. **Launch** — опубликовать offer version + schedule.  
2. **Modify** — новая версия для будущих игроков; никогда не мутировать активные grants.  
3. **Disable** — остановить eligibility; существующие grants продолжаются по snapshot.  
4. **Schedule** — окна start/end, dayparting, timezone.  
5. **A/B test** — несколько вариантов оффера с allocation weights; измерять FTD, clearance, NGR, bonus cost, retention.  
6. **Expire** — естественное окончание + budget kill.  
7. **Reuse templates** — клонировать welcome → geo variant → VIP variant.

Ментальная модель SOFTSWISS Motion — правильная продуктовая абстракция: **Trigger → Condition → Action**.

---

## 7.2 Experimentation Guardrails

Без guardrails гибкость становится неограниченным liability:

- parameter bounds на templates (max match %, min wagering, max cashout required),
- обязательный risk review выше порогов,
- budget hard stops,
- автоматическое anomaly detection (всплеск clearance rate, multi-account cluster),
- holdouts для causal measurement,
- finance dashboard: granted vs converted vs expired vs outstanding liability.

---

## 7.3 Template Library (MVP Product Surface)

Рекомендуемые first-class templates (только configuration):

1. Deposit Match (варианты sticky/non-sticky)  
2. Reload Match  
3. Loss Cashback  
4. Promo Code → Bonus / Spins  
5. Free Spins Pack  
6. Daily Login Reward  
7. Wager Mission  
8. Player Referral Edge Share  
9. Affiliate CPA / RevShare / Hybrid (admin, не player CRM)

Tournaments могут подождать, пока contribution + leaderboard settlement стабилизируются.

---

# SECTION 8 — Final Recommendations

## 8.1 Major Design Decisions

### Decision 1 — One Promotion Engine, Many Templates

| | |
|---|---|
| **Why** | Избежать N параллельных бонусных систем, которые математически расходятся. |
| **Alternatives** | Отдельные micro-products для bonus / referral / affiliate. |
| **Trade-offs** | Стоимость абстракции заранее vs скорость в долгую. |
| **Industry** | Единый BonusEngine EveryMatrix; унифицированный bonus + automation SOFTSWISS. |
| **MVP** | Один engine + 5–8 templates. |
| **Scale** | Добавлять adapters (provider free spins, sports free bets) без новых cores. |

### Decision 2 — Immutable Grant Snapshots

| | |
|---|---|
| **Why** | Корректность, споры, регулируемые нормы fairness, audit. |
| **Alternatives** | Live-bind к последнему offer config (опасно). |
| **Trade-offs** | Сложность storage/version vs юридическая/финансовая безопасность. |
| **Industry** | Стандартная практика; UKGC запрещает вредные mid-flight изменения. |
| **MVP** | Snapshot всех коммерческих полей при grant. |
| **Scale** | Добавить T&Cs hash, версии contribution set, migration workflows. |

### Decision 3 — Non-Sticky Default for Deposit Bonuses

| | |
|---|---|
| **Why** | Лучше доверие; всё ещё полностью контролируемо через wagering / caps / contribution. |
| **Alternatives** | Sticky merged balance. |
| **Trade-offs** | Немного выше player optionality EV vs ниже нагрузка на support. |
| **Industry** | Существуют оба; адвокаты игроков сильно предпочитают non-sticky. |
| **MVP** | Non-sticky + forfeit on withdraw. |
| **Scale** | Опциональный sticky template для конкретных кампаний при необходимости. |

### Decision 4 — Player Referral on Theoretical Edge, Not NGR

| | |
|---|---|
| **Why** | Crypto-native предсказуемость; нет драмы NCO; лёгкий forecast liability. |
| **Alternatives** | NGR share; только flat FTD bounty. |
| **Trade-offs** | Оператор сохраняет variance; нужно поддерживать edge tables; важен game-mix. |
| **Industry** | Паттерны стиля Stake/Rollbit/Gamdom. |
| **MVP** | Edge share + real-wager-only + FTD gate + fraud holds. |
| **Scale** | Tiered rates, category edge overrides, caps. |

### Decision 5 — Affiliates as Separate Commercial Layer

| | |
|---|---|
| **Why** | Contracts, CPA clawbacks, определения NGR, порталы отличаются от consumer referral. |
| **Alternatives** | Одна система «partners» для всех. |
| **Trade-offs** | Дополнительная продуктовая поверхность vs более чистые границы риска. |
| **Industry** | Affilka/NetRefer/Income Access существуют, потому что это отдельный домен. |
| **MVP** | Manual/hybrid deals + shared attribution; простой RevShare-on-EV или CPA. |
| **Scale** | Partner portal, SubIDs, автоматизированные statements, политики NCO. |

### Decision 6 — NGR/EV Base for B2B; Never Pay on Bonus Wager

| | |
|---|---|
| **Why** | Не платить партнёрам за активность, которую вы сами субсидировали. |
| **Alternatives** | Простота GGR. |
| **Trade-offs** | Бремя прозрачности deductions. |
| **Industry** | NGR — стандарт; EV растёт в crypto. |
| **MVP** | Определить deduction policy письменно в день один. |
| **Scale** | Per-partner deduction overrides. |

### Decision 7 — Configuration-First, Code-Rare

| | |
|---|---|
| **Why** | MVP будет меняться еженедельно; deploys не могут быть release train для промо. |
| **Alternatives** | Захардкоженные кампании. |
| **Trade-offs** | Нужна безопасная система rules/template на раннем этапе. |
| **Industry** | Бэк-офисы Motion / Bonus API / BonusEngine. |
| **MVP** | Templates + versioned offers + eligibility rules + budgets. |
| **Scale** | CRM triggers, no-code automation, personalization API. |

### Decision 8 — Explicit Stacking Graph

| | |
|---|---|
| **Why** | Total giveback должен оставаться < устойчивого edge после всех программ. |
| **Alternatives** | Ad-hoc exclusions в каждой фиче. |
| **Trade-offs** | Требует продуктовой дисциплины. |
| **Industry** | Dependency/exclusion logic, подчёркнутая EveryMatrix. |
| **MVP** | Глобальные mutexes: один активный wagering bonus; exclusive attribution owner. |
| **Scale** | Полный boolean dependency graph по сегментам. |

### Decision 9 — Optimize for Flexibility & Correctness, Not Micro-Perf

| | |
|---|---|
| **Why** | Ваша заявленная реальность MVP. Неверная экономика стоит дороже, чем медленные queries. |
| **Alternatives** | Преждевременная сложность event-sourcing. |
| **Trade-offs** | Позже может понадобиться рефакторинг throughput settlement. |
| **Industry** | Сначала modular monolith (нарратив SOFTSWISS): hot paths выделять позже. |
| **MVP** | Ясные ledgers + snapshots + batch settlement — OK. |
| **Scale** | Разделять contribution pipeline / tournament services, когда нагрузка потребует. |

---

## 8.2 MVP Economics Policy Pack (Recommended Starting Point)

**Deposit welcome**

- Non-sticky  
- 50–100% match  
- Max bonus hard cap  
- Wagering 30–40× **bonus only** (прозрачно)  
- Max bet low absolute  
- Slots 100%; table/originals сильно снижены или исключены  
- Expiry 7–14 дней  
- Manual или явный opt-in claim  
- Max cashout опционален, но рекомендуется для первой итерации  

**Player referral**

- Lifetime attribution  
- Commission = % от theoretical edge на **real-money** eligible wagers  
- FTD + minimum real wager qualification  
- Daily accrual, claim с задержкой  
- Fraud graph checks  
- Нет комиссии на bonus stakes  

**Affiliate (early)**

- Hybrid или pure EV-RevShare  
- No NCO изначально  
- Ясный deduction list  
- Exclusive vs referral attribution  
- Weekly settlement  

**Engine**

- Templates + versioned offers  
- Immutable grant snapshots  
- Budget kill switch  
- Stacking mutexes  
- Liability report: granted / outstanding / converted / expired / voided  

---

## 8.3 What “Done Right” Looks Like in 12 Months

1. Product может запускать новую кампанию за часы из templates.  
2. Finance может ежедневно объяснять outstanding promotional liability.  
3. Risk может void grants с reason codes без engineering.  
4. Изменение wagering с 35× на 40× никогда не меняет in-flight grants.  
5. Stacking referral + affiliate + rakeback спроектирован намеренно, а не случайно.  
6. A/B tests относят стоимость бонуса к incremental NGR, а не к vanity claim rates.  
7. Новый инструмент (например, seasonal mission) поставляется как configuration + возможно небольшой settlement strategy plugin — не как новая усадьба микросервисов.

---

## 8.4 Explicit Non-Goals (For Now)

- Полный partner portal, конкурентоспособный с Affilka  
- Multi-brand enterprise bonus federation  
- Real-time millisecond contribution на глобальном масштабе  
- Полностью no-code expression language для произвольной математики  
- Retroactive tier upgrades  

Это фичи масштаба. Примитивы выше делают их additive позже.

---

## Appendix A — Key Formulas Cheat Sheet

```
GGR = stakes − winnings

NGR = GGR − bonuses − taxes − PSP − chargebacks − jackpot_contrib − …

Bonus grant = min(deposit × match_pct, max_bonus)

Wager target = wager_base × multiplier
Progress += stake × contribution_rate

Sticky withdrawable ≈ max(0, balance − bonus_principal)  [subject to max cashout]

Edge commission = Σ stake_real × game_edge × rate

Player EV (approx) ≈ bonus − (effective_wager × edge)   [then apply max cashout]

Total giveback rate ≈ rakeback + referral + affiliate + expected_bonus_cost
Must remain comfortably below blended house edge after operating costs.
```

## Appendix B — Research Sources (Public Industry)

- Sticky vs non-sticky bonus economics (BonusCheckr, ClearCasinos, Casino.Guru, ProvablySmart)  
- Wagering, contribution, max bet, max cashout guides (Wager Bureau, BonusesOnline, industry T&Cs norms)  
- UKGC unfair promotion variation rules (opt-in / commenced play protections)  
- Affiliate models: NetRefer, Scaleo, Track360, iRev (CPA / RevShare / Hybrid / NGR / NCO)  
- Crypto programs: Stake, BC.Game, Rollbit, Gamdom public referral/affiliate commentary (edge share vs NGR)  
- Platform architecture: SOFTSWISS Bonus API & Motion; EveryMatrix BonusEngine detachment & exclusion logic  
- Bonus abuse operator playbooks (Track360, SEON, ACGCS)

---

## Appendix C — Decision Checklist Before Any New Promotion

1. Какой instrument выдаётся?  
2. Каковы grant-time EV / expected cost?  
3. Каково worst-case liability (uncapped jackpot path)?  
4. Какой abuse graph это открывает?  
5. Что попадает в snapshot?  
6. С чем это стакается?  
7. Какой budget его убивает?  
8. Как finance видит outstanding liability?  
9. Может ли PM launch/disable без deploy?  
10. Оставляет ли total giveback маржу после edge?

Если любой ответ неизвестен, промоакция не готова — независимо от маркетинговой срочности.

---

*Конец документа.*
