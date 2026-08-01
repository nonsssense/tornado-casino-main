# Promotion Engine — Production Architecture & Security Audit

**Date:** 2026-07-27  
**Scope:** Read-only. No code changes.  
**Lens:** Long-term real-money casino promotion platform, not MVP checklist.

---

## Executive verdict

The current system is a **solid MVP promotion spine**, not a production promotion **platform**.

What exists is a thin orchestrator (`PromotionManager`) coordinating two independent managers (`BonusManager`, `ReferralManager`), with commercial numbers in `config.py`, wallet-safe grants, and real deposit-tier + customer-referral economics wired into register / deposit / Dice+Plinko settle.

What does **not** exist is the entity model of a casino promo engine: **campaigns**, **versions**, **segmentation**, **stacking/mutex**, **budgets**, **promo codes**, **admin CRUD**, **schedulers**, and **full player UX**. Adding “Weekly cashback” or “VIP birthday” today means **editing Python business logic and redeploying**, not configuring a campaign.

**Long-term foundation?** Partially. The **separation of Bonus vs Referral + thin orchestrator** is the right seed. The **data model and rule engine are not**. Treat this as a good MVP kernel that must grow a campaign layer before it can honestly support continuous product growth.

---

## 1. Architecture overview

### 1.1 Component map

```
┌─────────────────────────────────────────────────────────────────┐
│ Entry points                                                     │
│  auth.py | deposit.py | game_manager.py | admin_bot (metrics)    │
│  main.py (/api/bonus/* reads only)                               │
└───────────────────────────────┬─────────────────────────────────┘
                                │ side-effects
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ PromotionManager  (promo/promo_manager.py)                       │
│  Thin orchestrator — does not own money or rules persistence     │
└───────────────┬─────────────────────────────┬───────────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────────┐
│ BonusManager              │   │ ReferralManager                 │
│  bonus_instances          │   │  referral_profiles / invites    │
│  BONUS wallet             │   │  commissions / REAL bounty      │
│  freebet → bonus (infra)  │   │  claim_earnings (no HTTP)       │
└───────────────────────────┘   └─────────────────────────────────┘
                │
                ▼
┌───────────────────────────┐
│ config.py commercial seeds│  ← NOT a campaign store
└───────────────────────────┘
```

**Constraint (intentional):** `BonusManager` and `ReferralManager` do not import each other. Only `PromotionManager` sequences them. That is architecturally healthy for MVP.

### 1.2 Entry points

| Entry | Hook | Wired? |
|---|---|---|
| User register | `on_user_registered` | Yes (`database/auth.py`) |
| Deposit confirmed | `on_deposit_confirmed` | Yes (`payments/deposit.py`, same TX) |
| Bet settled | `on_bet_settled` | Yes Dice/Plinko only (`game_manager.py`) |
| Crash settled | — | **No** |
| Withdrawal completed | `on_withdrawal_completed` | Stub / unwired |
| Daily reset | `on_daily_reset` | Implemented / **not scheduled** |
| Admin action | `on_admin_action` | Implemented / **unwired** |
| HTTP grant/claim | — | Bonus reads only; referral claim **no API** |

### 1.3 Promotion types (actual vs stubs)

| Type | Status | Notes |
|---|---|---|
| Deposit match (3 tiers) | **Live** | Config catalog → `bonus_instances` |
| Customer referral FTD bounty | **Live** | REAL credit + daily cap |
| Customer referral edge RevShare | **Live** | Dice/Plinko REAL only; Crash missing |
| Welcome bonus | Method only | Not called |
| Reload | Method only | Not called |
| Promo code bonus | Method only | No code entity |
| Cashback | Method only | No accrual engine |
| Freebets / free spins | Infra tables + GameManager paths | **No grant entry / no HTTP** |
| Affiliate RevShare | Config seeds only | `AFFILIATE_ENABLED=False`, unused |
| Tournament / VIP / birthday / manual admin | Absent | — |

### 1.4 Lifecycle (as implemented)

There is **no campaign lifecycle**. There is a **bonus instance lifecycle** and a **referral invite lifecycle**.

```
Campaign (MISSING)
  create → schedule → activate → qualify → reward → expire → cancel

What exists instead:

Attribution
  register + invite_key → write-once referrer_id → invite row

Activation / grant
  deposit confirmed → grantDepositBonus(source=deposit_tier_N)
  (selection UI exists but grant is by deposit_index, not player choice)

Qualification (referral)
  deposit ≥ FTD min → atomic qualified_at → optional bounty

Reward
  BONUS credit on grant; REAL bounty; pending commissions on REAL bets

Wagering
  BONUS bets → recordWagerProgress → unlock (BONUS→REAL ≤ principal)

Expiration
  Lazy expireDueBonuses on list/validate; burn remaining BONUS
  Batch via on_daily_reset (unscheduled)

Cancellation / forfeit
  forfeitBonus + on_admin_action('forfeit_bonus') — no admin UI wiring
```

### 1.5 Key files

| Path | Role |
|---|---|
| `promo/promo_manager.py` | Orchestrator |
| `database/bonus.py` | Bonus instances, wagering, caps |
| `database/referral.py` | FTD, bounty, accrual, claim |
| `database/freebet.py` | Freebet grants/tickets |
| `config.py` | Commercial seeds |
| `games/game_manager.py` | BONUS play + settle notify |
| `games/crash/crash_game.py` | REAL-only; promo unwired |
| `main.py` | `/api/bonus/offers|active|select` |
| `static/src/features/wallet/deposit.bonus-selector.js` | Offer UI |
| `docs/promotion-engine-implementation-architecture.md` | Intended MVP shape |

---

## 2. Strengths

1. **Clean MVP separation** — orchestrator vs money managers; managers do not cross-import.
2. **Commercial numbers centralized** in `config.py` (easy for engineers to tune without hunting magic numbers).
3. **Wallet-safe money paths** (post wallet transaction-safety work): grants/unlock/expire/forfeit/bounty/claim use locks + relative deltas.
4. **Real anti-abuse primitives for referral attribution**: write-once `referrer_id`, unique `referred_id`, self-referral skip, atomic FTD qualify, daily bounty cap, `payout_frozen`, claim `FOR UPDATE`.
5. **Deposit bonus once-only sources** (`deposit_tier_1/2/3`) with soft idempotency.
6. **Game enforcement for deposit BONUS** on Dice/Plinko: max bet, eligibility, win cap, auto-prefer BONUS when eligible.
7. **Crash cannot spend BONUS** — cannot bypass wagering by cashing out bonus on Crash.
8. **Bonus not withdrawable** (withdraw holds REAL only).

---

## 3. Weaknesses (structural)

1. **No campaign entity** — cannot represent start/end, budget, priority, stacking, audience, or version history.
2. **Rules are code + config constants**, not data — Admin Panel cannot manage campaigns without a new store + engine.
3. **Grant methods proliferate by name** (`grantWelcomeBonus`, `grantReloadBonus`, `grantPromoBonus`, `grantCashbackBonus`) instead of a single `grant(campaign_id, context)`.
4. **No segmentation engine** — eligibility is deposit index + min amount + game allowlist.
5. **No stacking / mutex / priority** beyond “one active non-once source” soft skip.
6. **Hooks incomplete** — Crash settle, withdraw, daily job, admin actions unwired.
7. **Frontend far behind backend** — wager progress, referrals, freebets, cashback mostly absent or dead nav.
8. **Freebet / welcome / promo / cashback are footguns** — callable without product caps, schedules, or unique constraints.
9. **`offer_version` not snapshotted on grant** — changing config mutates the meaning of historical offers retroactively in catalog reads.
10. **Empty `eligible_games` means all games allowed** — non-deposit sources inherit weak defaults.

---

## 4. Extensibility audit

### Can new promotion types be added without rewriting existing code?

**Mostly no.** Pattern today:

| New type | Typical change surface |
|---|---|
| Reload bonus | Wire caller + possibly tighten `createInstance` idempotency; may edit `PromotionManager` |
| Weekly cashback | New accrual job, new source rules, new config, new hook on settle/period — **new subsystem** |
| Lossback | Needs loss ledger + period windows — **not modeled** |
| Free spins | Freebet-like tickets + slot engine — **new product** |
| Promo codes | New table + redemption API + fraud — **greenfield** |
| Tournament rewards | Tournament domain — **outside engine** |
| VIP / birthday | Segmentation + scheduler — **missing** |
| Manual admin bonus | Admin API + audit log — partial (`on_admin_action` stub) |

### Where adding a campaign forces editing existing business logic

| Location | Why |
|---|---|
| `promo/promo_manager.py` | New lifecycle events / sequencing |
| `database/bonus.py` | New `grantX` method or branch in `createInstance` / `ONCE_ONLY_SOURCES` |
| `config.py` | New constants / offer tuples |
| `payments/deposit.py` / `game_manager.py` / Crash | New triggers |
| `main.py` + frontend | Exposure |
| Eligibility helpers (`_is_game_eligible`, deposit index) | Hardcoded assumptions |

**Reusable today:** wallet credit patterns, wager progress FIFO, referral commission ledger shape.  
**Not reusable as a campaign framework:** offer catalog, qualification, segmentation, stacking.

**Modularity score intent:** good kernel, poor product platform.

---

## 5. Configurability audit (Admin Panel readiness)

| Parameter | Today | Admin-ready? |
|---|---|---|
| Active/inactive | Code deploy / `REFERRAL_ENABLED` | No |
| Start/end dates | Absent | No |
| Currencies | USD-assumed | No |
| Games / risk modes | `config` dict | Engineer-only |
| Bonus % / amounts | `DEPOSIT_BONUS_OFFERS` | Engineer-only |
| Wager requirements | Config | Engineer-only |
| Max win / max bet | Config (stake× max win **not applied** in cap math) | Partial / inconsistent |
| Claim period | Referral hold hours in config | Engineer-only |
| Expiration | Config days | Engineer-only |
| Eligible users | None (all) | No |
| Cooldowns / repeatability | Once-only set in code | No |
| Deposit requirements | Config min | Engineer-only |
| Priority / stacking | Absent | No |

**Hardcoded in code (not even config):** referral bot deep-link URL, key alphabet/length, default welcome/reload multipliers, expire-burns-full-bonus behavior, unlock-up-to-principal, source string enums, empty-eligibility=allow-all.

**To make campaigns fully configurable** (order-of-magnitude):

1. `campaigns` + `campaign_versions` + `campaign_rules` JSON/columns  
2. `campaign_participations` / redemptions with unique constraints  
3. Rule evaluator (qualify → reward → limits)  
4. Admin CRUD + audit log  
5. Scheduler for start/end/expire/cashback periods  
6. Snapshot rules onto grants at issue time  

**Estimate:** 6–12 engineer-weeks for a credible v1 campaign layer (not including full frontend or fraud ML).

---

## 6. Segmentation audit

**Support today:** none.

| Segment | Supported? |
|---|---|
| Country / language | No |
| VIP level | No |
| Registration age | No |
| FTD status | Implicit only via referral `qualified_at` / deposit count |
| Total deposits / lifetime wager | Count used for tier index only |
| Last activity / inactive | No |
| Affiliate / source | Attribution key only; no segment rules |
| Custom tags / risk level | Tables `fraud_signals` / `user_trust_score` exist but **unused** |

**Adding segments without rewrite:** not possible with current engine. Would need a pluggable predicate layer evaluated at activation/qualification time. Unused trust tables are a hint that fraud/segment intent existed and stalled.

---

## 7. Anti-fraud audit

| # | Issue | Exploit | Impact | Severity | Recommended fix |
|---|---|---|---|---|---|
| F1 | Soft once-only grant (no UNIQUE) | Parallel deposit completions race `hasReceivedSource` → double insert same tier | Double BONUS principal | **P0** | `UNIQUE(user_id, source)` for once-only sources **or** advisory lock / `INSERT … ON CONFLICT` |
| F2 | Freebet `createGrant` ungoverened | Any future caller can mint unlimited tickets | Free EV / bonus farm | **P0** (latent) | Do not expose until caps + unique `(user_id, day_index)` + promo orchestration |
| F3 | Welcome/promo/cashback grants weak defaults | Grant without max_bet / empty eligibility → all Dice/Plinko | Oversized bonus play | **P0** (latent) | Require snapshotted limits; deny empty eligibility for money grants |
| F4 | Sybil FTD farming | Many accounts via one invite ≥ $3 | Bounty drain (mitigated by $25/day cap) | **P1** | Device/IP clustering, trust score, progressive FTD, KYC gates |
| F5 | Crash not in referral accrual | Honest gap / edge inconsistency | Underpay referrers; product inconsistency | **P1** | Wire `on_bet_settled` from Crash REAL settles |
| F6 | Deposit bonus ignores player selection | UX selects tier; grant uses `deposit_index` | Confusion; not direct theft | **P2** | Either remove selection or grant selected eligible offer |
| F7 | `MAX_WIN_STAKE_MULTIPLIER` not in cap math | Config advertises rule not enforced | Terms mismatch; milder than absolute $50 cap | **P1** | Apply `min(stake×mult, absolute)` consistently in `capBonusWin` |
| F8 | Expire burns **entire** BONUS wallet | Multiple sources / orphan funds interaction | Player loss / support load | **P1** | Expire by instance principal only; never cross-burn |
| F9 | No promo budget / global spend ceiling | Marketing misconfig | Unbounded liability | **P1** | Campaign budget counters with atomic decrement |
| F10 | Webhook deposit replay | Already mitigated by deposit row lock + status (wallet pass) | — | Mitigated | Keep; add grant idempotency key tied to `deposit_id` |
| F11 | Self-referral | Blocked | — | Mitigated | Keep |
| F12 | Duplicate referral invite | UNIQUE `referred_id` | — | Mitigated | Keep |
| F13 | Double FTD qualify | Atomic `qualified_at IS NULL` | — | Mitigated | Keep |
| F14 | Claim race | Profile `FOR UPDATE` + wallet lock | — | Mitigated | Expose HTTP carefully with same TX |
| F15 | Multi-account same payment source | Untreated | Bonus + bounty abuse | **P1** | Payment fingerprint / withdraw link graph |
| F16 | Freebet ticket consume race | Check-then-update without `FOR UPDATE` (likely) | Double use ticket | **P1** (when enabled) | `UPDATE … WHERE status=available RETURNING` |
| F17 | Admin forfeit/freeze unwired | No controlled kill-switch UX | Slow incident response | **P1** | Wire admin tools + audit log |

---

## 8. Frontend / backend consistency

| Capability | Backend | Frontend |
|---|---|---|
| Deposit offer catalog | Yes | Yes (selector) |
| Select offer | Yes | Yes (but grant ignores selection) |
| Active bonuses + wager progress | Yes (`/api/bonus/active`) | Fetched, **not displayed** |
| Bonus balance | Yes | Yes (amount only) |
| Unlock / expire status UX | Partial | No |
| Referral link / stats / claim | Logic yes; **HTTP missing** | Nav placeholders dead |
| Freebets | Infra | Stub |
| Promo codes | No | No |
| Cashback | Method only | Unused prop |
| Campaign availability / eligibility | No | Banner image only |
| Error handling | Game validation messages | Basic toasts |

**Inconsistent states:** player can “select” a tier that is not what will be granted; active wager meter invisible while BONUS balance shows; referrals nav does nothing; legacy `/api/bonus/claim` / `/api/referrals/summary` referenced in dead legacy JS.

---

## 9. Bonus execution audit (games)

| Check | Dice | Plinko | Crash | Future slots |
|---|---|---|---|---|
| Uses BONUS | Yes (auto if eligible) | Yes (low risk only for deposit) | **Never** | Not present |
| `validateBonusBet` | Yes | Yes | N/A | Must add |
| Wager contribution | Yes via `on_bet_settled` | Yes | **No** | Must wire |
| Freebet path | Code exists, HTTP closed | Same | No | TBD |
| Mixed balances | Auto BONUS-first; client cannot force REAL when BONUS eligible | Same | REAL only | Need explicit policy |
| Win cap | `capBonusWin` | Same | N/A | Required |
| Max bet | Enforced | Enforced (unit stake in batch) | N/A | Required |
| Expiration mid-play | Lazy on validate/list | Same | N/A | Need settle-time check |
| Bypass limits via Crash | **No** (cannot spend BONUS) | — | — | — |
| Bypass via client payload | **No** (`preferred_balance` / ticket id not on HTTP models) | Same | — | Guard when adding fields |

**Bonus locking:** instance status + primary active selection; not a separate “locked wager pool” ledger beyond `bonus_balance` + instance progress.

**Cannot bypass deposit bonus limits on Dice/Plinko** under current HTTP surface. Residual risk is **granting weak non-deposit sources**.

---

## 10. Data model audit

### Present
- `bonus_instances` (per-user grant)
- `wallet.selected_bonus_source`, `bonus_balance`
- `frebet_grants` / `freebet_tickets`
- `referral_profiles`, `referrals`, `referral_commissions`
- `users.referrer_id`
- Unused: `fraud_signals`, `user_trust_score`

### Missing for production platform
| Entity | Why needed |
|---|---|
| `campaigns` | First-class promo |
| `campaign_versions` / rule snapshots | Immutable history |
| `campaign_participations` / redemptions | Qualification + unique claims |
| `promo_codes` / redemptions | Code product |
| `bonus_ledger` / contribution events | Audit wagering |
| `campaign_budgets` | Liability control |
| `segment_definitions` / assignments | Targeting |
| `admin_audit_log` | Compliance |
| `offer_version` on `bonus_instances` | Historical truth |
| `deposit_id` on bonus grant | Idempotency |

**Thousands of campaigns:** current model cannot store them; config tuples do not scale past a handful.

---

## 11. Scalability (product maintainability)

| Volume | Assessment |
|---|---|
| **~10 promotions** | Painful but workable with more `grantX` methods + config |
| **~100 promotions** | **Unmaintainable** without campaign DB + generic grant |
| **~1000 promotions** | Impossible on current design; needs rule engine, indexing, admin tooling, observability |

Runtime performance for current volume is fine. The bottleneck is **engineering throughput and correctness**, not QPS.

---

## 12. Production readiness scores (1–10)

| Dimension | Score | Comment |
|---|---|---|
| Architecture | **6** | Good MVP kernel; not a promo platform |
| Flexibility | **3** | New types require code changes |
| Configurability | **3** | Engineer `config.py` only |
| Scalability (product) | **3** | Breaks well before 100 campaigns |
| Maintainability | **5** | Clear modules; growing grant sprawl risk |
| Security | **6** | Wallet paths improved; grant races/latent freebet remain |
| Anti-fraud | **5** | Solid attribution basics; weak Sybil/budget/grant uniqueness |
| Frontend consistency | **3** | Large capability gap |
| Backend consistency | **5** | Hooks incomplete (Crash, jobs, APIs) |
| Bonus execution | **7** | Deposit BONUS on Dice/Plinko solid; Crash/referral gap |
| Future Admin Panel readiness | **2** | Needs new data model first |

**Weighted overall (production promo platform): ~4/10**  
**As MVP deposit+referral spine: ~6.5/10**

---

## 13. Critical issues (P0)

1. **No campaign abstraction** — cannot grow product safely past a few hardwired offers.  
2. **Once-only bonus grant race** — missing DB uniqueness on `(user_id, source)`.  
3. **Latent ungoverened grant APIs** (freebet / welcome / promo / cashback) without product controls.  
4. **Expire may burn unrelated BONUS** — dangerous if multiple sources ever coexist.  
5. **Admin Panel impossible** on current schema — any “configurable campaigns” promise is false until model rewrite.

---

## 14. High priority (P1)

1. Snapshot `offer_version` + rule fields onto `bonus_instances` at grant.  
2. Wire Crash → `on_bet_settled` for referral (and document Crash BONUS policy).  
3. Schedule `on_daily_reset`; wire admin forfeit/freeze with audit log.  
4. Expose referral summary + claim HTTP with same locking.  
5. Player UI: wager progress, active bonus status, referrals.  
6. Enforce `MAX_WIN_STAKE_MULTIPLIER` or remove from public terms.  
7. Unique idempotency key: bonus grant per `deposit_id`.  
8. Deny empty eligibility for monetary grants; require caps.  
9. Sybil / payment fingerprint controls for FTD bounty.  
10. Align deposit selector with actual grant logic.

---

## 15. Medium (P2)

1. Withdrawal hook (bonus forfeit on withdraw policy if desired).  
2. Contribution ledger for support disputes.  
3. Affiliate product path (config already seeded).  
4. Public cashout/promo history APIs.  
5. Feature-flag matrix per game for bonus.  
6. Clean dead nav / legacy endpoints.  
7. Budget counters even for the three deposit tiers.

---

## 16. Estimated effort (to a credible production foundation)

| Workstream | Effort |
|---|---|
| P0 grant uniqueness + expire-by-instance + freeze latent grants | 3–5 days |
| Campaign + version + participation schema + generic grant | 3–5 weeks |
| Rule evaluator (eligibility, stacking, limits) | 2–4 weeks |
| Admin CRUD + audit + scheduler | 3–5 weeks |
| Segmentation v1 | 1–2 weeks |
| Player promo center UI | 2–3 weeks |
| Wire Crash/jobs/referral APIs + fraud basics | 1–2 weeks |
| **Total to “real promo platform v1”** | **~3–5 months** (small team) |

Hardening **only** the current MVP (no campaign platform): **~1–2 weeks**.

---

## 17. Final architectural judgment

**Is this a good long-term foundation for a production casino?**

**As a kernel: yes, with caveats.** Keep:

- Thin `PromotionManager`
- Independent `BonusManager` / `ReferralManager`
- Config-driven commercial seeds (until DB campaigns exist)
- Instance-based wagering + wallet separation

**As a platform: no, not yet.** Do not stretch `grantX` methods and `config.py` tuples to dozens of live promos. Before continuous growth, introduce:

1. Campaign as first-class data  
2. Immutable rule snapshots on every grant  
3. Idempotent participation constraints  
4. Segmentation + stacking policy  
5. Admin + scheduler + player promo UX  
6. Explicit game contribution matrix (including Crash / future slots)

Until then, market this honestly as an **MVP deposit-match + customer-referral engine**, not a full Promotion Engine.

---

*Audit only — no implementation performed.*
