# Tornado MVP Economics — Final Launch Specification

**Роль этого документа:** Бриф Lead Product Architect по финализации экономики перед запуском  
**Цель:** Как можно быстрее проверить бизнес-гипотезу  
**Ограничение:** Расширять то, что уже есть — не перепроектировать backend, не заменять `BonusManager` / `ReferralManager`  
**Базовый снимок кодовой базы:** Dual REAL/BONUS wallet · бонусы на первые 3 депозита · только attribution рефералов · очередь withdraw в admin · Dice / Crash / Plinko  

---

## 1. Executive Summary

### Что у вас уже есть (сильные стороны)

| Область | Реальность | Почему это важно для запуска |
|---|---|---|
| Dual wallet | `real_balance` + `bonus_balance` + tagged transactions | Корректный non-sticky фундамент — оставить |
| Deposit bonuses | Tiers 1–3 работают end-to-end | Не перестраивать — подстроить числа + закрыть пробелы |
| Bonus instances | `principal`, `wager_*`, `max_bet`, `max_win_cap`, status | Уже snapshot grant — расширять это |
| Referral attribution | Write-once `referrer_id` + invite row + Bronze profile | Прочный каркас — добавить только settlement |
| Payments | BlockBee deposit → REAL + bonus grant; withdraw approval | Достаточно ops-safe для MVP |
| Bet limits | Централизованы в `config.py` | Хороший risk floor |

### Чего не хватает для запуска (слабые стороны)

| Пробел | Влияние |
|---|---|
| Referral RevShare никогда не выплачивается | Канал роста декоративный |
| Нет FTD / real-wager qualification | Нельзя безопасно платить рефералам |
| Нет max bonus / min deposit для match | Риск whale и dust abuse |
| Crash в каталоге eligible, но REAL-only | Сломанное UX-обещание |
| Admin finance/bonus/referral в основном TODO | Вы будете лететь вслепую |
| Константы бонусов захардкожены в `bonus.py` | Маркетинговые изменения = code deploy |
| `edge_basis` хранится, но не используется | Нужен для referral math |
| Forfeit/opt-out не выставлены | Игроки в ловушке; нагрузка на support |
| Expire сжигает весь `bonus_balance` | Опасно, если позже появится несколько instruments |

### Launch thesis (одно предложение)

**Сохранить текущую архитектуру bonus + wallet, перенастроить числа под низкий friction первого депозита на казахстанском Telegram-рынке, подключить edge-based settlement клиентских рефералов к `ReferralManager`, держать Affiliate как отдельный коммерческий продукт, вынести числа офферов и per-game edges в config и дать admin bot ежедневный P&L / risk dashboard.**

Не строить Affilka-class partner portals, VIP, cashback automation или универсальный rule language до первой выручки. Не переиспользовать клиентские реферальные tiers для affiliates.

### Assumption revisions (пересмотрено)

| Previous assumption | Problem | Revised premise |
|---|---|---|
| Min deposit **$10** for welcome + FTD | Слишком высокий friction для неизвестного Telegram crypto-бренда в Казахстане; замедляет валидацию гипотезы | Предпочтительнее **$5** (диапазон $3–$5 разобран ниже) |
| Single global house edge **≈ 2.5%** | Dice ≈ 2.5%, но Crash ≈ 3%, а Plinko охватывает ~2.5–4.0% по risk/rows | **Per-game configurable edge**; planning blend ≈ **3–3.5%** |
| One progression table for “referrals” | Смешивает вирусные player invites с B2B traffic partners | **Customer Referral** и **Affiliate** — отдельные продукты |

---

## 2. Bonus Economics

### 2.1 Current implementation (baseline)

| Parameter | Live today |
|---|---|
| Structure | Первые 3 депозита: **50% / 75% / 150%** |
| Wager | **50× bonus principal** (база bonus-only) |
| Expiry | **5 days** |
| Max bet | `min(2% of principal, $2.50)` |
| Max win (profit cap) | **$50 absolute** |
| Sticky | **Non-sticky balances**; unlock переводит **до principal** BONUS→REAL |
| Spend order | Prefer BONUS when eligible |
| Contribution | 100% of BONUS stakes only; REAL не продвигает wagering |
| Eligible | Dice ✓ · Plinko low ✓ · Crash listed, но не играется на BONUS |
| Welcome / reload / cashback | Methods существуют, **не выдаются** |

### 2.2 Mathematical health check (per-game edge, не один global %)

**Не планировать бонусы и комиссии от единого универсального house edge.**  
Текущие поверхности продукта (приблизительные теоретические / структурные edges):

| Game | Edge source in product | Approx. house edge |
|---|---|---|
| Dice | payout factor `97.5 / chance` | **~2.5%** |
| Crash | instant-bust `300 / 10000` | **~3.0%** |
| Plinko | multiplier tables by risk × rows | **~2.5%–4.0%** (low часто ~2.5–3.7%; high часто ~3.0–4.0%) |

Для **грубого планирования clearance**, когда game mix неизвестен, использовать **blend ~3.0–3.5%**, а не 2.5%.  
Для **settlement** всегда использовать **configured edge игры (и risk mode), в которую играли**.

Аппроксимация стоимости clearance (planning blend 3.5%):

```
E[house take on clear] ≈ wager_target × game_edge
wager_target = bonus_principal × wager_multiplier
# planning example with 40× and 3.5% blend:
# E[take] ≈ principal × 40 × 0.035 = principal × 1.40
```

| Deposit | Match | Bonus | Wager target (40×) | E[house @ 2.5%] | E[house @ 3.5%] | Notes |
|---|---|---|---|---|---|---|
| $20 | 50% | $10 | $400 | $10.00 | $14.00 | Более высокий edge → более house-safe, чем старая модель 2.5% |
| $20 | 75% | $15 | $600 | $15.00 | $21.00 | То же |
| $20 | 100% | $20 | $800 | $20.00 | $28.00 | То же |
| $5 | 50% | $2.50 | $100 | $2.50 | $3.50 | Низкий min deposit → крошечное liability на grant |

\*Игнорируя max-win cap, expiry forfeiture и game mix. **Max win $50** обрезает upside — критическая защита.

**Verdict:** Структура остаётся house-safe. При blended edge **3–3.5%** прежний wagering **40×** **ещё более** защищает дом, чем при старом допущении 2.5% — поэтому **оставить 40×** по-прежнему оправдано (нет нужды поднимать множитель ради «математической чистоты»). Проблемы к исправлению остаются операционными (честность eligibility, caps, opt-out, mismatch каталога Crash).

### 2.3 Minimum deposit — анализ экономического trade-off

**Question:** Не слишком ли агрессивен **$10** для неизвестного Telegram crypto-казино с фокусом на Казахстан?

**Context:** Приоритет MVP — **friction первого депозита** и **валидация гипотезы**, а не теоретическая оптимизация CAC. Локальная покупательная способность и friction crypto-онбординга важнее офшорных «отраслевых дефолтов».

| Min deposit | Acquisition effect | Abuse / cost effect | Ops effect |
|---|---|---|---|
| **$10** | Более высокий intent FTD; меньше депозитов; медленнее обучение | Сильнее фильтрует dust; дорого фармить FTD под referral bounties | Меньше tiny payments; чище cohorts |
| **$5** | Существенно ниже friction; больше FTD; быстрее валидация | Фарм всё ещё стоит $5 + network; bonus principal при 50% = **$2.50** — мало | Приемлемый payment noise; всё ещё реальный stake |
| **$3** | Самый низкий friction среди опций; максимум early volume | Самые дешёвые multi-account FTD farms; bounty-экономика слабеет; больше dust wallets | Больше micro-депозитов, support и conversion noise |

**Математика welcome liability при 50% match (до max_bonus):**

| Min dep | Grant principal | 40× wager | E[house @ 3.5%] if cleared |
|---|---|---|---|
| $3 | $1.50 | $60 | ~$2.10 |
| $5 | $2.50 | $100 | ~$3.50 |
| $10 | $5.00 | $200 | ~$7.00 |

Итак, снижение пола с $10 → $5 **не** создаёт крупного per-player bonus liability. Реальный риск — **объём junk FTD** и **referral bounty farming**, а не размер одного grant.

**Recommendation for MVP: минимальный депозит `$5` для welcome/deposit bonuses.** (Customer Referral «qualified FTD» установлен ниже, на `$3` — см. ниже.)

| Why not $10 | Why not $3 (default) |
|---|---|
| Переоптимизирует качество до появления трафика; замедляет единственное, что MVP должен узнать | Делает **$1 FTD bounty** слишком привлекательным относительно стоимости фарма; заливает метрики шумом |

**Если** ранние данные покажут сильное farm pressure на $5 — поднять до $7–$10 **через config**, не хардкодить высокий пол в день один.  
**Если** конверсия всё ещё слабая — можно тестировать **$3** как experiment variant (Section A/B), с уменьшенным или отключённым FTD bounty на время теста.

**Customer Referral «qualified FTD» установлен в `$3`** (ниже bonus min deposit $5), чтобы максимизировать объём квалификации вирусного цикла — приглашённый друг, внёсший даже $3, засчитывается, даже если этого первого депозита мало для получения welcome-бонуса. **Affiliate «qualified FTD» установлен в `$5`** — намеренно выше клиентского порога для защиты качества партнёров/CPA (см. Section 3.5). Это независимые config-ключи; bonus min deposit остаётся **$5**.

### 2.4 Recommended MVP bonus package

Сохранить **лестницу первых 3 депозитов**. Не добавлять отдельный welcome cash grant для запуска (лишнее liability + поверхность abuse). Использовать лестницу как welcome package.

#### Final numbers

| Parameter | MVP value | Why |
|---|---|---|
| **Welcome** | = Deposit Tier pack (без отдельного welcome cash) | Самый быстрый путь; уже построено; одна поверхность abuse |
| **Tier 1 match** | **50%** | Оставить — конкурентный headline без раздувания CAC |
| **Tier 2 match** | **75%** | Оставить — вознаграждает второй депозит (activation) |
| **Tier 3 match** | **100%** (change from 150%) | 150% — маркетинговый сахар с сильным abuse magnet и support-драмой; 100% всё ещё сильно для crypto MVP |
| **Wager multiplier** | **40×** (change from 50×) | 50× + 5 дней враждебно; при blend **~3–3.5%** 40× даёт ~**120–140%** principal в expected take при clear — устойчиво без повышения множителя |
| **Wager base** | **Bonus principal only** (keep) | Прозрачно; уже реализовано; D+B тихо удваивает нагрузку |
| **Min deposit for bonus** | **$5** | Низкий Telegram/KZ friction; крошечное per-grant liability; лучше $10 для валидации; безопаснее $3 для bounty farming (см. §2.3) |
| **Max bonus (cap)** | **$50** per tier grant | Жёсткий whale ceiling: `$100 deposit × 50%` останавливается на $50; останавливает uncapped liability |
| **Max cashout / max win** | **$50 profit cap** (keep absolute) | Уже live; ограничивает jackpot path на бонусных средствах |
| **Max bet while bonus** | Keep `min(2% principal, $2.50)` | Согласовано с Dice max $5 и предотвращает one-spin extract |
| **Expiration** | **7 days** (from 5) | Достаточно, чтобы clear 40× на низких ставках; всё ещё короткое окно liability |
| **Contribution** | Keep 100% BONUS stake; **eligible: Dice + Plinko low only** | Убрать Crash из каталога, пока BONUS crash не существует |
| **Sticky / non-sticky** | **Non-sticky** (keep separate balances) | Соответствует wallet; REAL withdrawable |
| **Bonus priority** | Prefer BONUS when active (keep) | Быстрее сжигает liability |
| **Unlock rule** | Keep: convert up to **principal** BONUS→REAL | Уже sticky-like на conversion — защищает дом |
| **On expiry** | Сжечь оставшиеся бонусные средства, привязанные к этому instance (исправить позже при необходимости) | Сегодня сжигает весь `bonus_balance` — приемлемо только пока enforced один active deposit bonus |
| **Opt-out / forfeit** | **Expose forfeit** (API + UI): forfeit active bonus, keep REAL | Trust + regulatory hygiene; method существует, подключить |
| **Claim** | Keep auto-grant on completed deposit by index | Минимальный friction для Telegram Mini App |
| **One active wagering bonus** | Enforce mutex (уже в основном верно через tiers) | Предотвратить stacking chaos |

#### Principal formula (keep + add cap)

```
principal = min(deposit × match_pct/100, MAX_BONUS)
wager_required = principal × 40
max_bet = min(principal × 0.02, 2.50)
max_win_cap = 50.0   # profit
expires_at = now + 7 days
```

#### Example player journey ($20 / $20 / $20)

| Deposit | Match | Principal (capped) | Wager | E[house @ 3.5% if clears] |
|---|---|---|---|---|
| 1st $20 | 50% | $10 | $400 | $14.00 |
| 2nd $20 | 75% | $15 | $600 | $21.00 |
| 3rd $20 | 100% | $20 | $800 | $28.00 |
| **Total face bonus** | | **$45** | | **~$63 expected take if all cleared @ 3.5%** |

Маркетинговая стоимость при идеальном clear всех по-прежнему ограничена max-win и expiry; expected house take on clearance теперь **превышает** face value при пересмотренном edge blend — **приемлемо**. Реальная стоимость намного ниже из-за expiry, max-win и частичной игры. Для запуска предпочитать **100%** (не 150%) на tier 3, чтобы ограничить привлекательность abuse.

#### Example at the recommended min deposit ($5 first deposit)

| Deposit | Match | Principal | Wager | E[house @ 3.5%] |
|---|---|---|---|---|
| 1st $5 | 50% | $2.50 | $100 | ~$3.50 |

Низкое абсолютное liability — подтверждает, что при этом полу связывающее ограничение — **acquisition friction**, а не размер grant.

#### Business impact

- Attractive: «50% / 75% / 100% on first 3 deposits» от **$5** — ясно и с низким friction для холодного Telegram-трафика.
- Sustainable: caps + 40× + max win $50 + более высокий realized edge ограничивают liability.
- Editable later: вынести эти константы и **per-game edges** в config (Section 5).

#### Implementation complexity

**Low.** Изменить константы в catalog / config; подключить forfeit endpoint; починить флаг eligibility Crash; добавить min deposit + max bonus в путь `grantDepositBonus`.

#### Explicitly defer

- Separate welcome no-deposit cash
- Reload / cashback automation
- Sticky merged balance
- Per-game contribution % matrix
- Deposit+bonus wager base

---

## 3. Distribution Economics — Customer Referral vs Affiliate

### 3.0 Why these must be separate products

| | **Customer Referral** | **Affiliate Program** |
|---|---|---|
| Who | Обычные игроки, приглашающие друзей | Media buyers, influencers, affiliate managers, traffic partners |
| Goal | Вирусный engagement, social proof, дешёвые organic FTD | Масштабируемая paid / partner distribution |
| Progression | Достижимо с несколькими друзьями | Volume / quality gates; negotiated или tiered по partner FTD |
| Economics | Скромный % от **per-game theoretical edge** | Более высокая доля edge (или позже NGR); CPA / Hybrid возможны |
| Product surface | In-app referral screen + `ReferralManager` | Отдельное partner agreement + admin deals (portal позже) |
| MVP build | Расширить существующий `ReferralManager` | **Коммерческие правила в этом документе**; сначала лёгкий admin tracking — не Affilka |

**Не переиспользовать Bronze/Silver/Gold player-referral thresholds для affiliates.**  
**Не платить оба программы по одному и тому же игроку** — exclusive attribution: affiliate XOR customer referrer.

### 3.1 Per-game house edge (foundation for both programs)

Commission и planning должны читать **configurable expected edge per game (и Plinko risk mode)**, никогда не хардкод 2.5%.

| Key (config) | Seed | Notes |
|---|---|---|
| `game_edges.dice` | `0.025` | Matches `97.5 / chance` |
| `game_edges.crash` | `0.030` | Matches `HOUSE_EDGE / 10000` |
| `game_edges.plinko.low` | `0.030` | Flattened seed внутри наблюдаемого диапазона ~2.5–3.7% |
| `game_edges.plinko.medium` | `0.030` | Flattened seed внутри ~2.7–3.6% |
| `game_edges.plinko.high` | `0.035` | Flattened seed внутри ~3.0–4.0% |
| `game_edges.planning_blend` | `0.035` | **Только reporting / bonus EV** — никогда не используется отдельно для settlement |

```
commission = Σ (real_stake × game_edge[game, risk] × partner_rate/100)
```

**Только REAL stakes.** BONUS stakes = $0 commission для обеих программ.

### 3.2 Current customer-referral implementation

| Piece | Status |
|---|---|
| `ReferralManager` | Profiles, keys, links, invites, `total_invites` |
| Tiers in code | Bronze **30%** / Silver **35%** / Gold **45%** stored — **никогда не используются для payout** |
| Attribution | Lifetime first-touch write-once |
| Settlement | **Missing** |
| FTD / real wager gates | **Missing** |
| User API / UI | **Missing** (только mock) |
| Affiliate product | **Not present** — нельзя прикрутить к той же tier table |

### 3.3 Critical interpretation of coded 30 / 35 / 45

Эти ставки, если оставлять, должны означать **% от theoretical house edge на REAL eligible wagers**, а не % от NGR/GGR.

| Interpretation @ $1,000 REAL wager | Cost if edge = 2.5% | Cost if edge = 3.5% | Verdict |
|---|---|---|---|
| **30% of edge** | $7.50 (0.75% TO) | $10.50 (1.05% TO) | Viable mid-tier для *player* referral (Silver) |
| 30% of GGR/NGR | Highly variable | Highly variable | Wrong для in-app player referral |

**Decision for Customer Referral:** трактовать `revshare_percent` как **edge share %**. Запускать игроков на **25 / 30 / 35** (рядом с coded table, но capped ниже affiliate territory). Affiliate rates стартуют с **40%** и выше — это жёсткое коммерческое разделение.

### 3.4 Customer Referral Program (ordinary players)

**Goal:** достижимая progression, engagement, вирусный рост, низкие FTD thresholds, простые rewards.

#### Commission model

```
commission = Σ (real_stake × game_edge[game, risk] × revshare_percent/100)
```

**Только REAL balance stakes.** BONUS = $0.  
**Why:** Вы уже субсидируете bonus play; платить за него — double-pay.

#### Tiers (player labels — independent of Affiliate)

| Tier | RevShare (% of edge) | Unlock condition | Why |
|---|---|---|---|
| **Bronze** | **25%** | Default on profile create | Конкурентный viral seed; всё ещё явно ниже affiliate Starter (40%) |
| **Silver** | **30%** | **3 qualified FTDs** | Совпадает с coded mid value; достижимо после нескольких реальных друзей |
| **Gold** | **35%** | **10 qualified FTDs** | Top player rate; аспирационно, но capped под affiliate ladder |

> Coded table была **30 / 35 / 45**. Launch использует **25 / 30 / 35** — достаточно близко для простой product-истории, но Gold останавливается на **35%**, чтобы player referral никогда не пересекался с affiliate **40%+** (см. §3.5). Мигрировать в config; не хардкодить навсегда.

**Progression:** Только prospective. Без ретроактивного backpay.  
**Why:** Ретроактивные tiers взрывают liability.

#### Qualification (customer)

| Term | MVP rule | Why |
|---|---|---|
| **Invite** | Registration with valid referral key | Уже работает |
| **Qualified FTD** | First completed deposit **≥ $3** + basic trust OK | Намеренно ниже bonus min deposit — максимизирует вирусную квалификацию; всё ещё реальный crypto-stake |
| **Commissionable wager** | REAL stake after FTD | Реальная экономическая активность |
| **Self-referral** | Same payment / device cluster → no pay | Лёгкое использование существующих fraud tables |

#### Rewards (keep minimal)

| Reward | MVP | Why |
|---|---|---|
| **Referrer ongoing** | Edge share (above) | Core loop |
| **Referrer FTD bonus** | **$0.50** REAL when invitee makes qualified FTD; cap **$25/day** | Дофамин без того, чтобы $3 FTD farms были прибыльны |
| **Invitee reward** | No extra cash — deposit ladder already | Избежать stacking CAC |
| **VIP transfer bounty** | Defer | Abuse + ops |

При клиентском полу FTD **$3** bounty **обязана** оставаться сильно ниже депозита ($1 bounty на $3 FTD — это farm bait) → **$0.50** с дневным cap — более безопасный seed (настраивается через config). Если появится фарм — сначала срезать bounty, а не поднимать FTD-пол: низкий пол и есть цель.

#### Settlement (customer)

| Stage | Rule | Why |
|---|---|---|
| Accrual | On settled REAL bet (or hourly batch) | Видимый progress |
| Hold | **48 hours** | Окно review |
| Payout | Claim to **REAL** (min **$1**) | Существующий wallet |
| Tier recount | Daily on qualified FTD count | Дёшево |

#### Lifetime attribution

**Оставить lifetime first-touch** для customer referral (уже реализовано).  
Сдерживать стоимость через **player rates capped under affiliate** + REAL-only + per-game edges — не через обрезку attribution.

#### Long-term cost model (customer)

```
Referral cost / REAL turnover ≈ game_edge × revshare
# Bronze @ 3.5% edge: 0.035 × 0.25 = 0.875% of turnover
# Gold   @ 3.5% edge: 0.035 × 0.35 = 1.225% of turnover
```

#### Implementation complexity

**Medium.** Расширить только `ReferralManager` — accrual ledger, hooks после settlement REAL bet, claim, tier updater. **Не** перегружать его affiliate CPA logic.

#### Business impact

Превращает мёртвый referral UI в organic CAC для Telegram — достаточно конкурентно, чтобы мотивировать sharing, всё ещё дешевле affiliate **40%+** rates.

---

### 3.5 Affiliate Program (media / influencers / partners)

**Goal:** другая экономика, progression, RevShare и qualification.  
**MVP stance:** определить **коммерческую модель и config surface** сейчас; реализовать как **admin-managed partner deals** (ручные или лёгкий tracking). Полный partner portal = post-validation. **Архитектура BonusManager / wallet / Promotion Engine без изменений.**

#### Why not reuse customer tiers

| Customer Referral | Affiliate |
|---|---|
| 3 / 10 FTDs | Десятки FTD / month или negotiated volume |
| **25–35% of edge** | **40 / 50 / 60% of edge** (до **70%** для individual partnerships) |
| In-app share link | Tracked partner links / codes, SubIDs later |
| Social motivation | Revenue motivation; нужен reporting trust |

#### Affiliate commission models (choose per partner)

| Model | When to use | Seed economics |
|---|---|---|
| **Edge RevShare** | Default для crypto volume partners | **40% / 50% / 60%** of per-game edge by partner tier (FTD unlock) |
| **Hybrid** | Influencers, которым нужен cashflow | **$5–$15 CPA** on qualified FTD + **25–35%** edge RevShare (ниже pure RevShare, т.к. CPA платит upfront) |
| **CPA-only** | Pure media buyers с неизвестным LTV | **$8–$20** per qualified FTD — только после появления LTV data; осторожно на MVP |
| **Individual deal** | Strategic / exclusive partners | Negotiated до **70%** of edge — admin override, не public tier |

**Qualified FTD (affiliate)** — намеренно строже, чем customer referral:

| Rule | Seed | Why |
|---|---|---|
| Min deposit (qualified FTD) | **$5** (edge RevShare); **$10–$15** для CPA deals | Выше клиентского пола $3 для защиты качества партнёров; CPA требует более строгого пола, т.к. платит upfront |
| Min REAL wager after FTD | **$20** within 7 days (for CPA fire) | Гарантирует activity, не deposit-withdraw |
| Hold before CPA | **7 days** | Окно chargeback / multi-account |
| Negative carryover | **No NCO** on edge model (edge share cannot go negative the same way) | Простая MVP-история |
| Min monthly FTDs for payout | **3** (partner-level) | Избежать выплат dust partners |

#### Affiliate tiers (separate ladder — FTD unlock seeds)

| Partner tier | Edge RevShare | Typical unlock | Why |
|---|---|---|---|
| **Starter** | **40%** | Approved partner, &lt; 10 FTD / month | Entry явно выше player Gold (35%) |
| **Growth** | **50%** | **25** qualified FTDs / rolling 30 days | Mid-volume media / creators |
| **Pro** | **60%** | **75** qualified FTDs / rolling 30 days | Serious buyers; потолок публичной лестницы |

**Individual partnerships:** согласовать до **70%** of edge через admin config override per partner — не player-visible tier, не auto-unlock по FTD count. Только для exclusive Telegram channels / strategic buyers.

#### Cost model (affiliate)

```
# Example: $1,000 REAL wager on Crash (3% edge), Pro 60%
commission = 1000 × 0.03 × 0.60 = $18.00   # 1.8% of turnover
# Individual deal @ 70%: 1000 × 0.03 × 0.70 = $21.00
```

При edges **3–3.5%** affiliate giveback **40–60% of edge** стоит примерно **1.2–2.1% of turnover** (до ~**2.45%** при 70%) — агрессивно, но конкурентно для paid Telegram distribution; **не** стакать ещё и customer referral на того же пользователя.

#### MVP implementation depth

| Must before / at launch | Can wait |
|---|---|
| Written rule: exclusive attribution vs customer referral | Full Affilka-style portal |
| Admin ability to mark user as `affiliate_owned` and set custom rate (вкл. до **70%**) | Automated SubID reporting |
| Config seeds for partner tiers **40 / 50 / 60** | CPA automation at scale |
| Manual weekly partner settlement spreadsheet OK | Self-serve invoices |

#### Business impact

Позволяет нанимать Telegram influencers / buyers с **достоверными B2B-числами** (40–60%, до 70% negotiated), не превращая каждого игрока в партнёра на affiliate-rate.

---

### 3.6 Shared rules (both programs)

1. Per-game (per-risk) **configurable** edges — никогда одна global constant в settlement.  
2. **REAL wager only.**  
3. **Exclusive attribution** — один commercial owner на игрока.  
4. Kill switches независимы: `referral.enabled` vs `affiliate.enabled`.  
5. Все rates и thresholds в **config** для быстрых экспериментов.

#### Implementation note

Customer path = расширить `ReferralManager`.  
Affiliate path = отдельные partner records / admin deals (даже если позже физически рядом в коде). **Не** делить одни и те же Bronze/Silver/Gold unlock thresholds.

---

## 4. Promotion Engine MVP

### 4.1 Principle

У вас уже есть mini promotion engine:

```
Offer catalog (DEPOSIT_BONUS_OFFERS)
  → Grant (bonus_instances row)
    → Fund BONUS wallet
      → Contribution (BONUS stakes → wager_progress)
        → Unlock / Expire / Forfeit
```

**Не изобретать новый microservice.** Обобщить этот паттерн тонко.

### 4.2 Lifecycle (same for all future promos)

```
Draft offer (config)
  → Publish version
    → Eligibility check
      → Create grant (immutable snapshot fields on bonus_instances / future tables)
        → Fund instrument
          → Progress events
            → Settle (unlock / pay / expire / forfeit)
```

### 4.3 Templates for MVP (only these)

| Template ID | Maps to today | Status |
|---|---|---|
| `deposit_match` | `deposit_tier_1/2/3` | Live — config-ize |
| `referral_edge_share` | New settlement on `ReferralManager` | Build settlement only |
| `referral_ftd_bounty` | New **$0.50** REAL credit (customer) | Tiny grant helper |
| `affiliate_deal` | Admin-managed partner rates (separate product) | Light tracking / manual settle at MVP |
| `freebet_pack` | `FreebetManager` exists | Defer grants to post-launch |
| `cashback` / `reload` / `welcome_cash` | Stubs in BonusManager | **After launch** |

### 4.4 Snapshots (immutable at grant)

Уже частично хранятся на `bonus_instances`. **Требовать в момент grant:**

| Field | Immutable? |
|---|---|
| `source` / offer id + **offer_version** | Yes (add version) |
| `principal` | Yes |
| `wager_required` | Yes |
| `max_bet` | Yes |
| `max_win_cap` | Yes |
| `expires_at` | Yes |
| `wager_multiplier` used | Yes (store or derive) |
| Eligible games snapshot | Yes (JSON on instance or version pointer) |
| Live catalog % / days | **No** — только future grants |

**Rule:** Изменение config никогда не мутирует `active` instances. Соответствует research + UKGC-style fairness.

### 4.5 How to introduce without rewrite

**Phase A (pre-launch, minimal):**

1. Перенести `DEPOSIT_BONUS_*` + offers в `config` / JSON, загружаемый `BonusManager.getOfferCatalog()`.  
2. При grant копировать resolved numbers в `bonus_instances` (уже в основном сделано) + store `offer_version`.  
3. Весь settlement code оставить в `BonusManager`.

**Phase B (post-launch):**

1. Добавить таблицу `promotion_offers` или YAML versions.  
2. CRM/admin edits создают новые versions.  
3. Новые sources вызывают тот же путь `grant*` с template id.

**Phase C (scale):**

1. Trigger → condition → action automation (SOFTSWISS Motion-like).  
2. Не нужно для проверки рынка.

### 4.6 Versioning

```
offer_id = deposit_tier_1
offer_version = 3
grant stores offer_version=3 + numeric snapshot
```

Active players on v2 сохраняют математику v2 навсегда.

**Complexity:** Low–medium. Наибольшая ценность на час eng work после referral settlement.

---

## 5. Configuration Architecture

### 5.1 Move to configuration before / at launch

| Параметр | Где живёт сегодня | Target |
|---|---|---|
| Deposit match % per tier | `bonus.py` | Config |
| Wager multiplier | `bonus.py` | Config |
| Expiry days | `bonus.py` | Config |
| Max bonus | missing | Config |
| Min deposit for bonus | missing | Config (**seed $5**) |
| Max bet % / absolute | `bonus.py` | Config |
| Max win absolute | `bonus.py` | Config |
| Eligible games map | `bonus.py` | Config |
| Customer referral tier % | `referral.py` `refshare_table` | Config (**player seeds 25/30/35** — coded был 30/35/45) |
| Customer FTD thresholds Silver/Gold | missing | Config (**3 / 10**) |
| Customer FTD bounty $ / daily cap | missing | Config (**$0.50 / $25**) |
| Affiliate partner tier % / FTD gates | missing | **Отдельный** config namespace (`affiliate.*`) |
| Affiliate CPA / hybrid seeds | missing | Config (admin deals) |
| Per-game / per-risk edges for settlement | implicit / unused `edge_basis` | **Config map** (обязательно) |
| Planning blend edge (только reporting) | missing | Config (`~0.035`) |
| Min claim referral | missing | Config |
| Bet limits | `config.py` | Keep in `config.py` (already good) |

### 5.2 Keep in code (engine invariants)

- Dual-balance ledger rules  
- Transaction posting  
- Grant state machine (`active` → `unlocked` / `expired` / `forfeited`)  
- Snapshot immutability  
- Write-once attribution  
- REAL-only withdraw  
- Idempotent deposit completion  
- Правило «BONUS stakes don’t earn referral or affiliate commission»
- Exclusive attribution: customer referral XOR affiliate owner
- Settlement всегда использует per-game (per-risk) configured edge — никогда один global HE constant  

### 5.3 Editable from admin bot later (not all day-one)

Безопасно редактировать live после запуска (с audit log):

- Match % / wager / expiry для **future** grants  
- Customer referral tier % and FTD thresholds  
- Affiliate partner rates (per deal)  
- Per-game edge table (с крайней осторожностью + confirmation)  
- FTD bounty amount / caps  
- Kill switch: disable new bonus grants  
- Kill switch: freeze customer referral accruals  
- Kill switch: freeze affiliate accruals  

Никогда не live-edit: ledger math, attribution exclusivity, snapshot fields на active grants.

### 5.4 Complexity

**Low**, если начать с одного `economics_config.py` или JSON, импортируемого `BonusManager` / `ReferralManager`. Избегать построения полного CMS.

---

## Promotion Engine Future-Proofing

Этот раздел расширяет Section 4 (Promotion Engine MVP) и Section 5 (Configuration Architecture).  
Он **не** меняет BonusManager, ReferralManager, dual wallet или launch economics, уже принятые выше.

**Goal:** Сделать возможным следующий год экспериментов с промо через **config + thin eligibility helpers**, а не backend rewrites.

Integration spine (без изменений):

```
Config offer version
  → Eligibility (segment + conditions + limits + priority)
    → Optional experiment assignment (A/B)
      → BonusManager / ReferralManager grant path (existing)
        → Immutable snapshot on grant
```

---

### 1. A/B Testing

#### Design principle

Лёгкая experiment-обёртка вокруг **offer versions**, а не параллельная promotion system.  
Игроки по-прежнему получают grants через существующий `BonusManager` / referral settlement. Эксперимент только выбирает, **какую published offer version** они видят.

#### What should be testable (MVP-safe)

| Testable | Почему | Not testable at MVP |
|---|---|---|
| Deposit match % | Главный acquisition lever | Sticky vs non-sticky (wallet rewrite) |
| Wager multiplier | Trade-off clearance vs cost | New instrument types mid-flight |
| Expiry days | Forfeiture vs UX | Ledger / spend-order changes |
| Max bonus / min deposit | Abuse vs conversion | REAL vs BONUS commission rules |
| FTD bounty amount | Мотивация referral invite | Attribution model |
| Referral edge % (только future cohorts) | Growth cost | Retroactive rate changes |

#### How promotions are versioned for experiments

Reuse Section 4.6 versioning:

```
offer_id = deposit_tier_1
offer_version = A | B   (or numeric 3 / 4)
experiment_id = welcome_match_apr
variant_id = control | treatment
```

- **Control** = текущая published version  
- **Treatment** = альтернативная published version с другими commercial numbers  
- Grant stores `offer_version` + optional `experiment_id` / `variant_id` на instance snapshot  

Изменение эксперимента никогда не мутирует active grants.

#### Percentage rollout

| Field | MVP default | Почему |
|---|---|---|
| `traffic_percent` | 10–50% into treatment | Ограничить риск, пока учимся |
| Remainder | Control | Безопасный baseline |
| Ramp | Manual (admin / config) | Auto-optimizer не нужен |

Пример: `control 80% / treatment 20%` только на следующих eligible deposit-bonus grants.

#### Player assignment

| Rule | MVP choice | Почему |
|---|---|---|
| Sticky assignment | Hash(`user_id + experiment_id`) → variant | Один и тот же игрок всегда видит один и тот же variant |
| Assignment moment | First eligibility evaluation for that experiment | Избежать mid-funnel switching |
| Reassignment | Never within experiment lifetime | Чистый measurement |
| Already-granted players | Excluded from new assignment | Snapshot integrity |

No ML. No multi-arm bandit. Deterministic hash достаточно.

#### Experiment lifetime

| Field | Guidance |
|---|---|
| `starts_at` / `ends_at` | Жёсткое окно в config |
| Min runtime | ≥ 7 days или ≥ N FTDs (что наступит раньше) до объявления winner |
| Max runtime | Cap (например, 21–30 days), чтобы мёртвые тесты не зависали |
| Post-end behavior | New grants используют winning version (или control, если inconclusive) |

#### Success metrics

Трекать per variant (admin / simple SQL достаточно):

| Metric | Почему это важно |
|---|---|
| FTD rate (eligible → deposited) | Acquisition |
| Bonus grant rate / average principal | Cost exposure |
| Clearance / unlock rate | Realized liability |
| Bonus cost unlocked to REAL | Cash cost |
| Day-7 retained players | Quality, не vanity claims |
| Net deposits − withdraws (cohort) | Business truth |
| (Referral experiments) Qualified FTD / invite | Channel quality |

**Primary decision metric for deposit offers:** incremental FTDs и качество net deposit vs unlocked bonus cost.  
Не объявлять winner только по claim rate.

#### Automatic vs manual ending

| Mode | MVP |
|---|---|
| Auto-end on `ends_at` | **Yes** — config clock |
| Auto-promote winner | **No** — manual |
| Emergency kill | **Yes** — disable treatment traffic → 100% control |
| Statistical auto-stop | Defer to scale |

Manual winner selection предотвращает false positives на тонком Telegram volume.

#### Admin visibility

| View | Purpose |
|---|---|
| Active experiments list | Что live |
| Variant split + counts assigned | Integrity |
| Per-variant FTD / grant / unlock / cost | Decision |
| Kill treatment button | Risk |

#### Integration with existing Promotion Engine

1. Catalog уже имеет versioned offers (Section 4).  
2. Eligibility layer выбирает offer version (control/treatment) **до** `grantDepositBonus`.  
3. `BonusManager` остаётся не в курсе экспериментов за пределами snapshot fields.  
4. Referral experiments влияют только на **future** accrual rate config для newly qualified cohorts — никогда не переписывают past commissions.

**Complexity:** Low–medium после появления config + `offer_version`.  
**Launch need:** Optional. Сначала ship kill switches; добавить A/B, когда будет достаточно FTDs для обучения.

---

### 2. Segments

#### Design principle

Segments — это **boolean flags / дешёвые derived labels**, оцениваемые в момент eligibility.  
Не CDP. Не real-time ML. Хранятся как computed attributes или проверяются on the fly из существующих таблиц (`users`, `deposit`, `referrals`, wallet activity).

#### Launch segment set

| Segment | Definition (MVP) | Почему существует | Typical promotions | Implement difficulty |
|---|---|---|---|---|
| **New Players** | Completed deposits = 0, or account age &lt; 7 days | Защитить welcome ladder; наивысшая CAC sensitivity | Deposit tiers 1–3 only; no reload/cashback | **Low** — deposit count существует |
| **Returning Depositors** | ≥ 1 completed deposit, active in last 14 days | Retention surface после исчерпания welcome | Reload / promo codes (post-launch) | **Low** |
| **Inactive Players** | No bet/deposit in 14–30 days | Win-back без сжигания actives | Small reload or freebet later | **Low** — last activity timestamp |
| **Referral Players** | `users.referrer_id` is set | Измерять канал; избегать double acquisition gifts | Same deposit ladder; no extra invitee cash | **Low** — уже на user |
| **Organic Players** | No `referrer_id` | Baseline cohort для A/B и CAC | Same ladder; later organic-only tests | **Low** |
| **Country / Geo** | Telegram `language_code` or payment geo proxy | Regulatory / FX / abuse by region | Enable/disable offers by geo | **Low–Med** — начать с language или allowlist |
| **VIP** | Manual flag or top wager percentile (defer automation) | High-touch retention | VIP bonus / higher limits later | **Low** if manual flag; **High** if auto-tier |
| **Referrers (active)** | Has ≥ 1 qualified FTD invite | Growth partners внутри продукта | Tier UX, bounty eligibility | **Low** once FTD logic exists |

#### What to enable at launch vs later

| At launch | Later |
|---|---|
| New Players | VIP auto-tiers |
| Referral vs Organic | Device-risk segments |
| Inactive (для kill/analytics, даже если promo ещё нет) | Value bands (whale / minnow) |
| Country allow/deny list | CRM behavioral segments |

#### Extendability

Добавлять segments как named predicates в config:

```
segment_id = inactive_14d
rule = last_bet_at < now-14d AND deposits_completed >= 1
```

Offers ссылаются на `allowed_segments` / `denied_segments`.  
Нет изменений wallet или grant settlement — только eligibility.

**Complexity:** Low для launch set. Держать VIP manual, пока объём не оправдает иное.

---

### 3. Promotion Priority

#### Design principle

Engine должен всегда разрешать **один ясный outcome**, когда применимы несколько offers.  
Предпочитать **mutex groups + simple priority integers** тяжёлому rules engine.

#### Priority order (global, lowest number wins when mutex conflicts)

| Priority | Promotion family | Notes |
|---|---|---|
| 1 | **Deposit Bonus** (welcome ladder tiers) | Ядро acquisition — никогда не проигрывать vanity promos |
| 2 | **Promo Code** (match / spins) | Перекрывает default только если явно compatible |
| 3 | **VIP Bonus** | Manual / flagged; редко |
| 4 | **Reload Bonus** | Post-welcome retention |
| 5 | **Cashback** | Period settlement; обычно не стакается ни с одним из wagering bonuses |
| 6 | **Free Spins / Freebets** | Отдельный instrument; может сосуществовать, если нет wagering-bonus mutex |
| 7 | **Referral FTD bounty** (referrer side) | Платит referrer REAL — не player wagering bonus |
| 8 | **Referral edge share** | Continuous accrual — не «offer claim» |

Referral rewards **не** конкурирующие deposit offers; они settle по другому пути (`ReferralManager`) и не потребляют deposit-bonus mutex.

#### Stacking rules (MVP)

| Rule | Detail |
|---|---|
| One active **wagering bonus** | Max one `active` deposit/reload/promo wagering instance per user |
| Deposit ladder exclusivity | Только текущий deposit index tier может grant |
| Cashback vs wagering | Cashback accrues on REAL net loss only; не выдавать cashback, пока clear deposit bonus (отложить cashback product, пока это не enforced) |
| Free spins | Allowed alongside REAL play; если wins создают BONUS with wager, подпадают под one-active-wagering-bonus rule |
| Referral edge share | Always on for REAL stakes; независимо от deposit bonus |
| Referral FTD bounty | Stacks with invitee’s deposit bonus (стоимость invitee уже принята) |

#### Mutually exclusive groups

| Mutex group | Members | Почему |
|---|---|---|
| `wagering_bonus` | Deposit match, reload, promo-code bonus money, VIP bonus money | Предотвратить double unlock liability |
| `welcome_package` | Deposit tiers 1–3 as a package path | Уже once-only sources |
| `acquisition_code` | Promo welcome codes vs default tier-1 | Избежать 50% + code 100% на одном FTD |

#### Bonus compatibility matrix

|  | Deposit | Promo code | Reload | Cashback | VIP | Free spins | Ref FTD bounty | Ref edge |
|---|---|---|---|---|---|---|---|---|
| **Deposit** | — | XOR in `acquisition_code` | XOR `wagering_bonus` | No (defer) | XOR `wagering_bonus` | Careful* | Yes (referrer) | Yes |
| **Promo code** | XOR | — | XOR | No | XOR | Careful* | Yes | Yes |
| **Reload** | XOR | XOR | — | No | XOR | Careful* | Yes | Yes |
| **Cashback** | No | No | No | — | Maybe later | Yes | Yes | Yes |
| **VIP** | XOR | XOR | XOR | Maybe later | — | Careful* | Yes | Yes |
| **Free spins** | Careful* | Careful* | Careful* | Yes | Careful* | — | Yes | Yes |
| **Ref FTD bounty** | Yes | Yes | Yes | Yes | Yes | Yes | — | Yes |
| **Ref edge** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | — |

\*Careful = разрешено только если free-spin winnings не создают второй параллельный wagering bonus, пока один active (направить wins в существующие rules или block).

#### Implementation without rewrite

- Config: `priority`, `mutex_group`, `stacks_with[]` on each offer.  
- Eligibility helper runs **before** `BonusManager.grant*`.  
- Settlement code unchanged.

**Complexity:** Low. Большая часть уже подразумевается once-only deposit tiers; записать это, чтобы будущие promos не изобретали конфликты.

---

### 4. Promotion Limits

Каждая published offer version должна поддерживать следующие configurable limits.  
MVP нужно enforced только подмножество; остальное — поля, зарезервированные в config, чтобы не перепроектировать позже.

| Limit | Meaning | Почему существует | Enforce at launch? |
|---|---|---|---|
| **Start date** | Offer becomes grantable | Планировать campaigns без deploys | **Yes** (или implicit «published») |
| **End date** | Stop new grants | Ограничить campaign liability | **Yes** для experiments / seasonal; deposit ladder может быть open-ended |
| **Claim deadline** | Time to claim after becoming eligible | Останавливает zombie offers | Should (deposit auto-grant может skip) |
| **Total budget** | Max USD principal (or cost) grantable | Жёсткий company risk cap | **Should** soon after launch |
| **Daily budget** | Max cost per UTC day | Останавливает один viral day от опустошения treasury | **Should** |
| **Maximum grants** | Global grant count cap | Inventory control для codes/spins | Yes for promo codes; optional for ladder |
| **Per-player limit** | Max grants per user for this offer | Anti-farm | **Yes** (once-only sources уже есть) |
| **Lifetime limit** | Max across all versions of a family | Останавливает version-churn abuse | **Should** |
| **Per-player cooldown** | Min time between grants | Reload pacing | Later (reload product) |
| **Concurrent active cap** | Max active grants in mutex group | Equals «one wagering bonus» | **Yes** |

#### How limits interact with snapshots

- Limits gate **только new grants**.  
- Already granted instances завершаются под своим snapshot.  
- Hitting budget mid-day → eligibility возвращает unavailable; admin видит «budget exhausted».

#### Integration

```
is_within_schedule?
  → segment/conditions pass?
    → priority/mutex free?
      → budgets/counters available?
        → grant via BonusManager / referral helper
          → increment counters atomically
```

Counters можно начать как simple DB aggregates или маленькую таблицу `promotion_counters` позже — не требуется перезапускать wallet logic.

**Complexity:** Low для schedule + per-player once-only (в основном существует). Medium для global/daily budgets (добавить counters).

---

### 5. Promotion Conditions

#### Design principle

Conditions — это **predicates, оцениваемые в момент eligibility**.  
Они не settle деньги. Они только отвечают: *может ли этот user получить эту offer version сейчас?*

Generic shape (config):

```
all_of: [condition...]
any_of: [condition...]   # optional, rare at MVP
not: [condition...]
```

#### Condition catalog

| Condition | MVP required? | Почему | Data source today |
|---|---|---|---|
| **Minimum Deposit** | **Yes** | Quality FTD + bonus economics | Deposit amount at grant |
| **Deposit Count / Index** | **Yes** | Tier 1/2/3 ladder | `countCompletedDeposits` |
| **FTD** (is / is not first deposit) | **Yes** for referral bounty | Anti-empty-account | Completed deposits == 1 |
| **Account Age** | Should | Block instant farm alts | `users.created_at` |
| **Referral Status** (has referrer / is referrer) | **Yes** for referral products | Channel logic | `referrer_id`, invites |
| **Player Segment** | Should | Targets win-back / new | Segment helper (выше) |
| **Country / Geo** | Should | Risk + compliance | Language / allowlist |
| **Real Wager** (lifetime or period ≥ X) | Later | Reload/VIP qualification | Bets aggregate |
| **Telegram Age** | Later | Слабый anti-abuse signal | If exposed; else skip |
| **VIP Level** | Later | Нет VIP product at launch | Manual flag first |
| **Referral Tier** (Bronze/Silver/Gold) | Later | Tier-gated referrer perks | `referral_profiles.status` |
| **No active wagering bonus** | **Yes** | Mutex | `bonus_instances` active |
| **Offer not yet received** | **Yes** | Once-only sources | Existing `hasReceivedSource` |

#### MVP vs later

| Phase | Conditions to implement |
|---|---|
| **MVP Launch** | Min deposit, deposit index, once-only source, no active wagering bonus, referral status for bounty/edge |
| **First Growth** | Segment flags, geo allowlist, account age, schedule windows |
| **Scale** | Real wager thresholds, VIP level, Telegram age, boolean expression builder in admin |

#### Connection to existing engine

```
listDepositOffers / grantDepositBonus path:
  load offer version from config
  → evaluate conditions (new thin helper)
  → evaluate limits + priority
  → call existing BonusManager grant
  → snapshot includes resolved offer_version
```

Referral path:

```
on REAL bet settle / on qualified FTD:
  → conditions (REAL only, FTD min, not frozen)
  → existing/extended ReferralManager accrual or bounty credit
```

**No change** к transaction posting, wallet balances или wager progress math.

**Complexity:** Low для MVP required set — несколько checks уже живут внутри BonusManager; постепенно поднимать их в named config conditions.

---

## Promotion Engine Roadmap

Всё ниже сохраняет BonusManager, ReferralManager и текущий wallet.  
Каждая фаза только добавляет config, eligibility и counters вокруг существующего grant/settlement spine.

### Phase 1 — MVP Launch

| Capability | Priority | Business impact | Complexity |
|---|---|---|---|
| Config-ized deposit + referral numbers | Must | Менять economics без deploys | Low |
| `offer_version` snapshot on grant | Must | Safe iteration / dispute defense | Low |
| Mutex: one active wagering bonus + once-only tiers | Must | Предотвратить liability stacking | Low |
| Core conditions (min deposit, deposit index, referral status) | Must | Sustainable grants | Low |
| Schedule start/end for experimental offers | Should | Controlled tests | Low |
| Kill switches (bonus grants / referral accrual) | Must | Пережить abuse spikes | Low |
| Segments: New / Referral / Organic (read-only ok) | Should | Analytics + future targeting | Low |
| A/B framework | Optional | Учить match % только после volume | Low–Med |

**Outcome:** Запуск с tunable offers и conflict-free grants. Проверить acquisition + referral hypothesis.

### Phase 2 — First Growth

| Capability | Priority | Business impact | Complexity |
|---|---|---|---|
| A/B on match % / wager / expiry with admin metrics | High | Улучшать CAC scientifically | Med |
| Inactive + Returning segments → first reload template | High | Retention после окончания welcome | Med |
| Global + daily budgets / max grants counters | High | Жёсткая treasury protection | Med |
| Geo allow/deny + account-age conditions | Med | Резать очевидные farm geos | Low–Med |
| Promo codes as versioned offers in mutex `acquisition_code` | Med | Influencer / campaign bursts | Med |
| Compatibility matrix enforced in eligibility helper | High | Добавлять products without panic | Low |
| Freebet grants with careful stacking rules | Med | Engagement campaigns | Med (provider/path существует) |

**Outcome:** Marketing может запускать campaigns и tests еженедельно. Bonus cost остаётся budget-capped.

### Phase 3 — Scale

| Capability | Priority | Business impact | Complexity |
|---|---|---|---|
| Admin/CMS offer editor + experiment UI | High | Non-eng campaign ops | Med–High |
| Full condition expression builder | Med | Complex journeys | High |
| VIP auto-segments + VIP bonus template | Med | Whale retention | Med |
| Cashback template with REAL-loss conditions | Med | Soft retention | Med |
| Trigger → condition → action automation (Motion-like) | Med | Lifecycle marketing | High |
| Multi-variant bandits / auto-winner | Low | Marginal vs manual A/B | High |
| Affiliate B2B layer (separate from player referral) | Strategic | Paid distribution | High (separate product) |

**Outcome:** Promotion catalog становится growth platform. Всё ещё тот же core grant → snapshot → settle.

#### Roadmap rule

Если идея Phase 3 требует изменения wallet semantics, sticky merge или замены BonusManager/ReferralManager — **отклонить**. Выразить её как новый template + conditions + limits на текущем spine.

---

## 6. Admin Bot Improvements

Существует: role gate + **withdraw approve/reject** (working). Statistics / Players / System / Bonuses = stubs.

### 6.1 Daily Monitoring (Must)

| Feature | Почему | Complexity |
|---|---|---|
| Deposits today (count, USD) | Revenue pulse | Low |
| Withdraws pending + paid today | Cash risk | Low (extend queue) |
| GGR proxy today (stakes − wins) | Edge health | Medium |
| Active bonus liability (sum bonus_balance + active principals) | Open risk | Low |
| New users / FTDs today | Funnel | Low |
| Referral commissions accrued today | Growth cost | Low once ledger exists |

### 6.2 Finance

| Feature | Priority |
|---|---|
| Net deposits − withdraws (day/week) | Must |
| Bonus unlocked to REAL today | Must |
| Referral paid / pending | Must after settlement |
| Simple house estimate: Σ (turnover_by_game × game_edge) | Should |

### 6.3 Bonuses

| Feature | Priority |
|---|---|
| Count active / unlocked / expired today | Must |
| Manual forfeit user bonus | Should |
| Disable new deposit bonus grants (kill switch) | Must |
| Edit future offer % (post-config) | Should |

### 6.4 Referrals

| Feature | Priority |
|---|---|
| Top referrers by FTD / earnings | Must |
| Freeze user referral payouts | Must |
| Qualified FTD list for a referrer | Should |
| Tier distribution Bronze/Silver/Gold | Should |

### 6.5 Payments

| Feature | Priority |
|---|---|
| Withdraw queue (exists) | Must — keep |
| Large withdraw alert threshold (e.g. ≥ $100) | Must |
| Failed payout retry visibility | Should |

### 6.6 Risk

| Feature | Priority |
|---|---|
| Users with ≥3 accounts same signal (manual list) | Should |
| Referrer earning > $100/day alert | Must early |
| Bonus unlock + withdraw same day flag | Should |

### 6.7 Player Activity

| Feature | Priority |
|---|---|
| Lookup user by Telegram ID: balances, bonuses, referrer | Must |
| Recent bets / deposits | Should |

### 6.8 System Health

| Feature | Priority |
|---|---|
| Bot + API heartbeat | Should |
| Last deposit webhook time | Must |
| Pending withdraw count badge | Must |

### Admin-editable parameters (launch+)

1. Bonus grants enabled on/off  
2. Referral accruals enabled on/off  
3. FTD bounty on/off + amount  
4. Withdraw auto-alert threshold  
5. (Later) Offer version numbers  

**Do not** редактировать wager math из Telegram без audit + копира «affects future grants only».

---

## 7. Referral Analytics (User App)

Показывать только метрики, которые двигают sharing behavior. Избегать clutter affiliate-портала.

### Recommended UI metrics

| Metric | Show? | Почему |
|---|---|---|
| **Referral link / share button** | Must | Core action |
| **Current Tier** + next tier progress (e.g. 3/5 FTDs) | Must | Progression dopamine |
| **Your RevShare %** | Must | Clarity of earn rate |
| **Qualified FTDs** | Must | Определяет progression; учит quality > spam |
| **Total Invites** | Must | Vanity + social proof |
| **Today’s Earnings** | Must | Daily habit loop |
| **Pending Earnings** (in hold) | Must | Trust / снижает «where is my money?» |
| **Claimable / Claim CTA** | Must | Monetization moment |
| **Total Earnings (lifetime)** | Must | Long-term motivation |
| **Friends’ Real Wager (lifetime)** | Should | Показывает, что engine fair/active |
| **Conversion %** (FTD / invites) | Should | Учит quality inviting |
| **Leaderboard position** (weekly top 10) | After launch | Competitive growth; не требуется для проверки core loop |
| Per-friend P&L detail | Defer | Support/privacy noise |
| NGR / GGR jargon | Never in UI | Путает игроков; использовать «earnings from friends’ play» |

### Copy guidance

- «You earn a share of the house edge on friends’ **real-money** bets.»  
- «Bonus play does not count.»  
- «Different games have different edges — your % applies to each game’s edge.»  
- «Earnings become claimable after 48 hours.»

### Complexity

**Medium frontend + thin API** поверх settlement ledger. Не строить charts для MVP — numbers + progress bar + claim button.

---

## 8. MVP Launch Checklist

### Must implement before launch

| # | Item | Reason | Complexity |
|---|---|---|---|
| 1 | Finalize bonus numbers (40×, 7d, max bonus $50, min dep **$5**, tier3 **100%**, Crash off catalog) | Low-friction sustainable acquisition | Low |
| 2 | Wire **forfeit/opt-out** for active bonus | Trust / support | Low |
| 3 | Enforce one conceptual active deposit bonus + fix expire scope if needed | Accounting safety | Low–Med |
| 4 | Customer referral **edge accrual** on REAL bets using **per-game edges** | Growth hypothesis | Med |
| 5 | Customer qualified FTD ≥ **$3** (affiliate ≥ **$5**) + player tier thresholds **3 / 10**; rates **25/30/35** | Anti-abuse + achievable progression | Med |
| 6 | Referral claim to REAL + 48h hold | Settlement | Med |
| 7 | Optional **$0.50** FTD bounty + **$25/day** cap | Invite motivation without farm bait | Low |
| 8 | Move bonus + customer referral + **game_edges** into **config module** | Fast iteration | Low |
| 9 | Snapshot `offer_version` on grant | Future-proof | Low |
| 10 | Admin: daily deposits/withdraws/FTDs/bonus liability/referral accrued | Operate safely | Med |
| 11 | Admin: freeze referral + kill bonus grants | Kill switches | Low |
| 12 | User referral screen (link, tier, earnings, claim) | Make channel real | Med |
| 13 | Align product copy with REAL-only commission + per-game edge | Expectation management | Low |
| 14 | Document Affiliate as **separate** product; admin mark `affiliate_owned` + manual rates | Avoid mixing B2B with player viral loop | Low–Med |

### Should implement after launch (week 1–4)

| Item | Почему ждать |
|---|---|
| Leaderboard | Nice growth layer, не core validation |
| Admin offer % editor | Config file edits достаточно сначала |
| Conversion % analytics in app | After volume exists |
| Plinko edge by risk mode for referral | Flat 3% fine initially |
| Soft fraud graph automation | Manual freeze first |
| Freebet acquisition campaigns | Bonus ladder достаточно |
| Prefer-REAL client balance selector | Optional UX |

### Can wait until scale

| Item | Почему |
|---|---|
| Full Promotion Engine CMS / Motion-like automation | Premature |
| Affiliate B2B portal / CPA automation at scale | Separate product; rules defined, full portal premature |
| Cashback / reload / VIP / missions / tournaments | Dilutes focus |
| Per-game contribution matrix | Не нужно при узкой eligibility |
| Sticky bonuses | Противоположно текущему wallet |
| Retroactive tiers | Liability bomb |
| Multi-brand / enterprise PAM | Out of scope |
| Single global house edge constant for settlement | Явно отклонено — использовать per-game config |

---

## 9. Future Evolution

Когда гипотеза подтверждена (stable FTD, controlled bonus cost, referral CAC < LTV):

1. **Config UI** в admin bot для offer versions.  
2. **Reload / cashback** как новые templates на том же grant pipeline.  
3. **Contribution weights**, если открыть больше games для BONUS.  
4. **Affiliate layer** как отдельный продукт (shared attribution exclusivity с customer referral).  
5. Extract hot paths только если load потребует (modular monolith остаётся).

Всегда: **new promo = new template + config**, а не новый settlement rewrite.  
Всегда: **customer referral ≠ affiliate** — отдельные rates, FTD gates и surfaces.

---

## Appendix A — Decision Summary (trade-offs)

| Decision | Choice | Alternative rejected | Почему for MVP |
|---|---|---|---|
| Bonus architecture | Keep `BonusManager` | Rebuild engine | Уже ships value |
| Customer referral | Extend `ReferralManager` | Replace / Affilka | Attribution done |
| Affiliate | Separate commercial product + admin deals | Same tiers as players | Different goals and rates |
| Match ladder | 50/75/100 + caps | Keep 150% uncapped | Abuse + liability |
| Bonus min deposit | **$5** | $10 (too much friction) / $3 (farmier for bonus) | KZ Telegram validation vs abuse |
| Customer qualified FTD | **$3** | $5 (fewer qualifying friends) | Maximise viral loop; decoupled from bonus floor |
| Affiliate qualified FTD | **$5** (CPA $10–15) | Same $3 as players | Protect CPA / partner quality |
| Wager | 40× bonus-only | 50× or D+B | Clearable; safer still at 3–3.5% blend |
| Settlement edge | **Per-game / per-risk config** | Single 2.5% global | Matches real Dice/Crash/Plinko |
| Customer RevShare | **25/30/35** of edge @ 3/10 FTD | Coded 30/35/45 or 15/20/25 | Competitive viral; still below affiliate 40%+ |
| Affiliate RevShare | **40/50/60** of edge @ partner FTD volume; up to **70%** individual deals | Player Gold (35%) or old 30/35/40 | B2B economics |
| Attribution | Lifetime + exclusive owner | Dual pay referral+affiliate | Margin protection |
| Promo engine | Snapshot + config thin layer | Enterprise engine | Speed |
| Admin | Metrics + kill switches | Full CMS | Enough to not die |

---

## Appendix B — One-week engineering sequence (suggested)

1. **Day 1–2:** Config extract + bonus number changes + Crash eligibility fix + forfeit API.  
2. **Day 2–4:** Referral ledger + accrual hook on REAL bets + FTD qualification + claim.  
3. **Day 4–5:** Referral UI + admin daily stats + kill switches.  
4. **Day 6:** Soft launch internal + abuse checklist.  
5. **Day 7:** Public launch.

---

## Appendix C — Success metrics (first 14 days)

| Metric | Healthy signal |
|---|---|
| Bonus unlocked $ / deposit $ | < 30% early (many expire) |
| Referral cost / REAL GGR | < 40% of theoretical edge share budget |
| Qualified FTD / invite | > 15% |
| Chargeback-like / multi-account freezes | Manual, rising slower than FTDs |
| Time-to-first-deposit | Falling week over week |

Если bonus cost взрывается: поднять wager до 45–50× или срезать tier3 до 75% через **config** — без rewrite.

---

*Конец MVP Economics Launch Specification.*
