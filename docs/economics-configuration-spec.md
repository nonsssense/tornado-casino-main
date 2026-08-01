# Tornado Economics Configuration Specification

**Role of this document:** Lead Product Architect specification for the Economics Configuration Layer  
**Objective:** Make every commercial parameter data-driven so the MVP can iterate without backend changes  
**Explicit non-goal:** Finding optimal numbers. There is no production data. Every value here is a **starting hypothesis**  
**Preserved architecture:** `BonusManager`, `ReferralManager`, dual REAL/BONUS wallet, existing Promotion Engine spine  
**Companion documents:** `economics-engine-research.md` (industry research), `mvp-economics-launch-spec.md` (launch economics + Promotion Engine)

---

## 0. Design Principles

### 0.1 The core split

| Layer | Contains | Change frequency | Who changes it |
|---|---|---|---|
| **Configuration** | Commercial numbers, eligibility, limits, toggles | Weekly or daily | Product / marketing |
| **Business logic** | Ledger, state machine, settlement, attribution | Rarely | Engineering |
| **Snapshots** | Resolved values copied onto a grant | Never after creation | Nobody |

**Rule:** if a number could appear in a marketing message, it belongs in configuration.  
**Rule:** if changing a number could corrupt the ledger, it belongs in business logic.

### 0.2 Resolution order

```
engine defaults (safe fallbacks in code)
  → config file (economics_config)
    → optional DB override (post-launch, admin-edited)
      → experiment variant override (A/B)
        → RESOLVED VALUES
          → written into the grant snapshot (immutable)
```

Every layer is optional. If config is missing a key, the engine default applies and logs a warning. This guarantees the system never fails to grant because of a config typo.

### 0.3 Scope vocabulary (used in every table below)

| Code | Meaning |
|---|---|
| **F** | **Future grants only.** Active grants keep their snapshot. Safe to change anytime. |
| **I** | **Immediate.** Applies system-wide on next evaluation. No grant snapshot involved (kill switches, budgets, eligibility gates). |
| **N** | **New version required.** Structural change — publish a new offer version rather than editing in place. |
| **X** | **Never changes for active grants.** Snapshot-protected by definition. |

### 0.4 Admin editability vocabulary

| Level | Meaning |
|---|---|
| **Safe** | Editable from the admin bot anytime, single tap, audit-logged |
| **Confirm** | Editable but requires an explicit confirmation step showing before/after |
| **Version** | Not editable in place — creates a new offer version (old version keeps serving active grants) |
| **Code** | Not configurable — engine invariant |

### 0.5 Additive changes required (non-breaking)

The configuration layer needs three additive changes. None of them rewrite existing modules.

| Change | Type | Why |
|---|---|---|
| `offer_version` on `bonus_instances` | New nullable column | Snapshot which config produced the grant |
| Referral accrual ledger (table or typed `transactions` rows) | Additive | Referral settlement has no storage today |
| Config audit log (who changed what, when, old → new) | New table | Experiment comparison is impossible without it |

Optional later: `experiment_id` / `variant_id` columns for A/B cohorts, and a `promotion_counters` table for budgets.

---

## Section 1 — Bonus Configuration

### 1.1 Current state in code

| What | Where today | Problem |
|---|---|---|
| `DEPOSIT_BONUS_WAGER_MULTIPLIER = 50` | `database/bonus.py` | Code deploy to change |
| `DEPOSIT_BONUS_EXPIRES_DAYS = 5` | `database/bonus.py` | Code deploy |
| `DEPOSIT_BONUS_MAX_BET_PERCENT / _ABSOLUTE` | `database/bonus.py` | Code deploy |
| `DEPOSIT_BONUS_MAX_WIN_ABSOLUTE = 50.0` | `database/bonus.py` | Code deploy |
| `DEPOSIT_BONUS_OFFERS` tuple (50 / 75 / 150%) | `database/bonus.py` | Code deploy |
| `DEPOSIT_BONUS_EDGE_BASIS = 0.025` | `database/bonus.py` | Declared, unused |
| No max bonus, no min deposit | Missing | Uncapped liability |

`createInstance()` already snapshots `principal`, `wager_required`, `max_bet`, `max_win_cap`, `expires_at`, `requires_deposit_gate`. **The snapshot mechanism exists — only the source of the numbers must move.**

### 1.2 Global bonus engine settings

```
bonus.enabled
bonus.deposit_bonuses_enabled
bonus.one_active_wagering_bonus
bonus.grant_on_deposit_index_only
bonus.opt_out_enabled
bonus.forfeit_on_withdraw
bonus.expiry_scope
bonus.unlock_policy
bonus.min_stake_counts_toward_wagering
```

| Key | Default | Range | Admin | Scope |
|---|---|---|---|---|
| `bonus.enabled` | `true` | bool | Safe | I |
| `bonus.deposit_bonuses_enabled` | `true` | bool | Safe | I |
| `bonus.one_active_wagering_bonus` | `true` | bool | Confirm | I |
| `bonus.grant_on_deposit_index_only` | `true` | bool | Confirm | I |
| `bonus.opt_out_enabled` | `true` | bool | Safe | I |
| `bonus.forfeit_on_withdraw` | `false` | bool | Confirm | F |
| `bonus.expiry_scope` | `instance` | `instance` \| `all_bonus_balance` | Confirm | F |
| `bonus.unlock_policy` | `up_to_principal` | `up_to_principal` \| `full_balance` | Version | X |
| `bonus.min_stake_counts_toward_wagering` | `0.10` | 0.01–1.00 | Confirm | F |

**Parameter notes**

- **`bonus.enabled` / `bonus.deposit_bonuses_enabled`** — Master kill switches. *Business:* stop all promotional liability within seconds during an abuse incident or treasury scare. *Math:* sets expected promotional cost to zero for new grants; active grants continue under snapshot. This is the single highest-value config key in the system.
- **`bonus.one_active_wagering_bonus`** — Enforces the mutex from the Promotion Engine section. *Business:* prevents future reload/promo products from silently stacking. *Math:* bounds concurrent liability per player to one instance; without it, worst-case exposure multiplies by the number of concurrent offers.
- **`bonus.grant_on_deposit_index_only`** — Keeps the ladder tied to deposit count rather than player selection. *Business:* protects the welcome package from being farmed out of order. *Math:* guarantees each once-only source is granted at most once.
- **`bonus.opt_out_enabled`** — Exposes forfeit. *Business:* trust, lower support load, fewer disputes. *Math:* increases forfeiture rate, which **reduces** realized bonus cost.
- **`bonus.forfeit_on_withdraw`** — Whether requesting a withdrawal while a bonus is active voids it. *Business:* stricter, protects against deposit-and-run with bonus EV; costs goodwill. *Math:* removes the free option value players currently hold (withdraw REAL, keep BONUS running). Default off for MVP because the wallet is non-sticky and the option value is small at these caps.
- **`bonus.expiry_scope`** — Today expiry burns the whole `bonus_balance`. That is only safe while exactly one bonus can be active. *Business:* wrong scope becomes a support disaster the day a second instrument ships. *Math:* with `instance` scope, expiry destroys only funds attributable to that grant.
- **`bonus.unlock_policy`** — How much BONUS converts to REAL on completion. *Business:* `up_to_principal` is the conservative industry-standard behavior already implemented. *Math:* `full_balance` would convert surplus winnings too, materially raising expected cost. Marked **Version** because it changes the economic identity of the product.
- **`bonus.min_stake_counts_toward_wagering`** — Ignores dust bets. *Business:* blocks scripted micro-bet wagering farms. *Math:* raises the effective time cost of clearing without changing the headline multiplier.

### 1.3 Per-offer settings (deposit match template)

Each offer is a versioned config block. `deposit_tier_1/2/3` are three instances of the same template.

```
offers.deposit_tier_1:
  enabled
  version
  template: deposit_match
  percent
  min_deposit
  max_deposit
  max_bonus
  wager_multiplier
  wager_base
  wager_counts_balance
  expires_days
  claim_deadline_hours
  max_bet_percent_of_bonus
  max_bet_absolute
  max_win_absolute
  max_win_stake_multiplier
  eligible_games
  contribution_weights
  spend_order
  stickiness
  claim_mode
  priority
  mutex_group
  once_only
  deposit_index
```

| Key | Default (seed) | Range | Admin | Scope |
|---|---|---|---|---|
| `enabled` | `true` | bool | Safe | I |
| `version` | `1` | int | Version | X |
| `percent` | tier 1 `50`, tier 2 `75`, tier 3 `100` | 0–300 | Version | X |
| `min_deposit` | `10.00` | 1–100 | Confirm | F |
| `max_deposit` | `null` (no cap) | null / 50–10000 | Confirm | F |
| `max_bonus` | `50.00` | 5–1000 | Version | X |
| `wager_multiplier` | `40` | 10–60 | Version | X |
| `wager_base` | `bonus_only` | `bonus_only` \| `deposit_plus_bonus` | Version | X |
| `wager_counts_balance` | `bonus_only` | `bonus_only` \| `bonus_and_real` | Version | X |
| `expires_days` | `7` | 1–30 | Version | X |
| `claim_deadline_hours` | `null` (auto-grant) | null / 1–168 | Confirm | F |
| `max_bet_percent_of_bonus` | `0.02` | 0.01–0.20 | Version | X |
| `max_bet_absolute` | `2.50` | 0.50–10.00 | Version | X |
| `max_win_absolute` | `50.00` | 10–1000 | Version | X |
| `max_win_stake_multiplier` | `null` (reserved) | null / 10–500 | Version | X |
| `eligible_games` | `dice`, `plinko: [low]` | game map | Version | X |
| `contribution_weights` | `1.0` all eligible | 0.0–1.0 per game | Version | X |
| `spend_order` | `prefer_bonus` | `prefer_bonus` \| `prefer_real` | Confirm | F |
| `stickiness` | `non_sticky` | `non_sticky` only (MVP) | Code | X |
| `claim_mode` | `auto_on_deposit` | `auto_on_deposit` \| `manual` | Confirm | F |
| `priority` | `1` | 1–99 | Confirm | I |
| `mutex_group` | `wagering_bonus` | string | Version | I |
| `once_only` | `true` | bool | Version | I |
| `deposit_index` | `1` / `2` / `3` | 1–10 | Version | X |

**Parameter notes**

- **`percent`** — The headline. *Business:* primary acquisition lever and the number every competitor comparison uses. *Math:* linear in grant size; `principal = deposit × percent/100` before caps, so it scales expected cost and abuse attractiveness one-for-one. **Version** scope because it defines the product a player accepted.
- **`min_deposit`** — Quality gate. *Business:* filters dust accounts and raises FTD quality for the referral program, which shares this threshold. *Math:* removes the tail of grants where payment/support cost exceeds the bonus itself.
- **`max_deposit`** — Upper eligibility bound, distinct from `max_bonus`. *Business:* lets you route whales to manual VIP treatment instead of mass promos later. *Math:* no effect while `max_bonus` binds first; kept as a reserved lever.
- **`max_bonus`** — Hard ceiling on grant size. *Business:* the single most important protection against a whale converting a mass-market offer into a five-figure liability. *Math:* truncates the right tail: `principal = min(deposit × pct, max_bonus)`.
- **`wager_multiplier`** — Primary EV throttle. *Business:* too high and the offer stops converting; too low and it becomes a farm. *Math:* `wager_required = principal × multiplier`; expected house take on a full clear ≈ `wager_required × blended_edge`. At ~2.5% edge, 40× returns roughly the bonus face value in expected take.
- **`wager_base`** — What the multiplier multiplies. *Business:* changing `bonus_only` → `deposit_plus_bonus` roughly doubles real difficulty while the headline number stays identical. *Math:* at 100% match, turnover requirement doubles. Powerful and easy to abuse against players — keep transparent, keep **Version**.
- **`wager_counts_balance`** — Whether REAL stakes also progress wagering. Today only BONUS stakes count. *Business:* counting REAL makes the offer far friendlier and is a strong retention experiment. *Math:* dramatically shortens time-to-clear and raises realized bonus cost; treat as a major product variant, not a tweak.
- **`expires_days`** — Liability window. *Business:* short expiry frustrates; long expiry invites patient hunters. *Math:* directly drives forfeiture rate, the largest single reducer of realized cost.
- **`claim_deadline_hours`** — Separate from wagering expiry; relevant only if `claim_mode = manual`. *Business:* stops zombie offers sitting in the UI. *Math:* raises unclaimed rate, lowering cost.
- **`max_bet_percent_of_bonus` / `max_bet_absolute`** — Anti one-shot clearance, applied as `min(percent × principal, absolute)`. *Business:* the cheapest anti-abuse control you own. *Math:* forces many independent trials so the house edge actually realizes instead of being decided by a single high-variance bet.
- **`max_win_absolute`** — Profit cap on bonus-derived play. *Business:* makes a lucky run survivable. *Math:* truncates the upper tail of payout distribution; without it, a single outlier can exceed a month of bonus budget.
- **`max_win_stake_multiplier`** — Declared in code but unused. Keep as a reserved alternative cap expressed relative to stake rather than an absolute figure. *Business:* useful when bet sizes vary widely. *Math:* caps per-bet payout instead of per-instance profit.
- **`eligible_games`** — Which games may be played with BONUS funds. *Business:* must match reality — Crash is currently listed but is REAL-only, which is a broken promise in the UI. *Math:* determines the blended edge applied to `wager_required`; adding a low-edge game silently lowers expected take.
- **`contribution_weights`** — Fraction of each stake counted toward wagering, per game. Not needed while eligibility is narrow, but reserving the key now avoids a schema change later. *Math:* `effective_turnover = wager_required / weight`.
- **`spend_order`** — Which balance is consumed first. *Business:* `prefer_bonus` burns promotional liability faster and matches current behavior. *Math:* changes the sequencing of exposure but not total expected cost.
- **`stickiness`** — Locked to `non_sticky` in MVP. *Business:* matches the dual-wallet product and industry trust norms. *Math:* switching to sticky would require wallet semantics changes — explicitly **Code**, not config, so nobody tries it from an admin panel.
- **`claim_mode`** — Auto-grant on completed deposit vs manual opt-in. *Business:* auto maximizes take-rate in a Telegram Mini App; manual gives cleaner consent. *Math:* auto raises grant volume and therefore total liability.
- **`priority` / `mutex_group` / `once_only`** — Conflict resolution from the Promotion Engine section. *Business:* prevents future promos from colliding with the welcome ladder. *Math:* bounds concurrent grants per player.

### 1.4 Additional parameters worth adding

| Key | Default | Why it should exist |
|---|---|---|
| `bonus.grant_cooldown_hours` | `0` | Reload/promo pacing later; prevents rapid re-grant loops |
| `bonus.max_active_instances_per_user` | `1` | Explicit numeric form of the mutex; easier to relax for freebets |
| `offers.*.geo_allow` / `geo_deny` | `[]` | Region-level risk control without code |
| `offers.*.segments_allow` / `segments_deny` | `[]` | Connects offers to the segmentation model |
| `offers.*.experiment` | `null` | Slot for A/B variant assignment |
| `bonus.alert_liability_threshold` | `1000.00` | Admin alert when outstanding bonus liability crosses a line |

---

## Section 2 — Referral Configuration

### 2.1 Current state in code

`refshare_table = {'Bronze': 30, 'Silver': 35, 'Gold': 45}` lives in `database/referral.py` and is copied onto `referral_profiles.revshare_percent` at profile creation. Nothing multiplies it by anything — there is no settlement. Tier is always Bronze; there is no upgrade path.

**Consequence:** every referral number is both hardcoded *and* inert. This section defines the full configurable surface.

### 2.2 Engine and attribution

```
referral.enabled
referral.attribution_mode
referral.attribution_window_days
referral.commission_base
referral.count_bonus_wager
referral.game_edges
referral.retroactive_tiers
```

| Key | Default (seed) | Range | Admin | Scope |
|---|---|---|---|---|
| `referral.enabled` | `true` | bool | Safe | I |
| `referral.attribution_mode` | `lifetime` | `lifetime` \| `window` | Version | X |
| `referral.attribution_window_days` | `null` | null / 30–730 | Version | X |
| `referral.commission_base` | `theoretical_edge` | `theoretical_edge` \| `ngr` \| `wager_percent` | Version | X |
| `referral.count_bonus_wager` | `false` | bool | Confirm | F |
| `referral.game_edges.dice` | `0.025` | 0.005–0.10 | Confirm | F |
| `referral.game_edges.crash` | `0.030` | 0.005–0.10 | Confirm | F |
| `referral.game_edges.plinko` | `0.030` | 0.005–0.10 | Confirm | F |
| `referral.retroactive_tiers` | `false` | bool | Code | X |

**Parameter notes**

- **`referral.enabled`** — Global accrual kill switch. *Business:* stops a farming incident instantly without touching player balances. *Math:* freezes new liability; already-accrued balances remain owed.
- **`referral.attribution_mode`** — Lifetime first-touch (already implemented) vs a time-boxed window. *Business:* lifetime is the crypto expectation and costs nothing to keep. *Math:* lifetime creates a perpetual annuity: `Σ_t rate × base_t`. A window caps the tail but weakens the pitch.
- **`referral.commission_base`** — The most consequential referral decision. *Business:* `theoretical_edge` gives predictable cost and no negative-carryover conversations. *Math:* `commission = stake_real × edge × rate`, i.e. a fixed fraction of turnover, independent of whether the referred player won or lost. NGR-based instead would inject full variance into the payout.
- **`referral.count_bonus_wager`** — Must stay `false`. *Business:* paying commission on stakes you already subsidized is a double payment. *Math:* would add `bonus_turnover × edge × rate` of pure incremental cost with zero incremental revenue.
- **`referral.game_edges`** — The theoretical edge table used for commission. *Business:* must be maintained honestly; it is effectively the price list. *Math:* commission scales linearly with these values, so a wrong edge silently over- or under-pays every referrer. Dice is ~2.5% by construction; Crash uses a 3% instant-bust; Plinko varies by risk mode and is flattened for MVP.
- **`referral.retroactive_tiers`** — Marked **Code** and permanently `false`. *Business:* affiliates love it, operators go bankrupt from it. *Math:* a tier upgrade would retroactively reprice all historical activity, creating an unbounded and unbudgeted liability.

### 2.3 Tiers and progression

```
referral.tiers:
  - id: bronze   | revshare_percent | min_qualified_ftd
  - id: silver   | revshare_percent | min_qualified_ftd
  - id: gold     | revshare_percent | min_qualified_ftd
referral.tier_recalc_interval_hours
referral.tier_downgrade_enabled
```

| Key | Default (seed) | Range | Admin | Scope |
|---|---|---|---|---|
| `tiers.bronze.revshare_percent` | `25` | 5–50 | Confirm | F |
| `tiers.bronze.min_qualified_ftd` | `0` | 0 | Confirm | I |
| `tiers.silver.revshare_percent` | `30` | 5–60 | Confirm | F |
| `tiers.silver.min_qualified_ftd` | `5` | 1–50 | Confirm | I |
| `tiers.gold.revshare_percent` | `35` | 5–70 | Confirm | F |
| `tiers.gold.min_qualified_ftd` | `20` | 5–200 | Confirm | I |
| `tier_recalc_interval_hours` | `24` | 1–168 | Safe | I |
| `tier_downgrade_enabled` | `false` | bool | Confirm | I |

**Parameter notes**

- **`revshare_percent`** — Share of the theoretical edge paid to the referrer. *Business:* the growth throttle; this is what a user screenshots and shares. *Math:* cost as a fraction of referred turnover is `edge × rate` — at 2.5% edge and 25%, that is 0.625% of everything the referred player wagers, forever.
- **`min_qualified_ftd`** — Tier unlock thresholds. *Business:* converts a passive reward into a progression game, which is the actual growth mechanic. *Math:* gates the higher cost rates behind proven volume, so blended payout rate stays near Bronze until real acquisition happens.
- **`tier_recalc_interval_hours`** — How often tiers are recomputed. *Business:* daily feels responsive enough and keeps the job cheap. *Math:* no cost effect; purely operational.
- **`tier_downgrade_enabled`** — Whether inactivity drops a tier. *Business:* downgrades feel punitive and generate support tickets. *Math:* would reduce long-run cost slightly; not worth the trust hit at MVP.
- **Scope note:** rate changes are **F** — they apply to future accrual only. Never recompute accrued commission at a new rate.

### 2.4 Qualification and anti-abuse

| Key | Default (seed) | Range | Admin | Scope |
|---|---|---|---|---|
| `qualification.min_ftd_amount` | `10.00` | 1–100 | Confirm | I |
| `qualification.require_completed_deposit` | `true` | bool | Code | I |
| `qualification.min_real_wager_before_accrual` | `0.00` | 0–100 | Confirm | I |
| `antiabuse.block_self_referral` | `true` | bool | Code | I |
| `antiabuse.max_daily_earn_per_referrer` | `100.00` | 10–5000 | Safe | I |
| `antiabuse.max_invites_per_day` | `50` | 5–500 | Safe | I |
| `antiabuse.review_threshold_daily_earn` | `50.00` | 10–1000 | Safe | I |
| `antiabuse.freeze_enabled` | `true` | bool | Safe | I |

**Parameter notes**

- **`min_ftd_amount`** — Deliberately equal to `bonus.min_deposit`. *Business:* one number to explain, one threshold to game. *Math:* sets the floor cost of manufacturing a "qualified" referral, which must exceed the FTD bounty by a wide margin.
- **`min_real_wager_before_accrual`** — Optional extra gate before commission starts. *Business:* kills deposit-and-withdraw referral farming. *Math:* forces the referred account to accept real edge exposure before generating payout.
- **`max_daily_earn_per_referrer`** — Circuit breaker. *Business:* converts an unbounded overnight loss into a bounded one. *Math:* caps worst-case daily referral cost at `cap × active_referrers`.
- **`review_threshold_daily_earn`** — Alert, not a block. *Business:* lets a human look before money leaves.
- **`freeze_enabled`** — Per-user payout freeze from the admin bot. *Business:* the practical alternative to building fraud ML for launch.

### 2.5 Rewards, settlement and payout

| Key | Default (seed) | Range | Admin | Scope |
|---|---|---|---|---|
| `ftd_bounty.enabled` | `true` | bool | Safe | I |
| `ftd_bounty.amount` | `1.00` | 0–25 | Confirm | F |
| `ftd_bounty.max_per_day_per_referrer` | `50.00` | 5–500 | Safe | I |
| `ftd_bounty.max_lifetime_per_referrer` | `null` | null / 50–10000 | Confirm | I |
| `invitee_reward.enabled` | `false` | bool | Confirm | I |
| `invitee_reward.amount` | `0.00` | 0–25 | Confirm | F |
| `settlement.mode` | `accrual_on_settle` | `accrual_on_settle` \| `hourly_batch` \| `daily_batch` | Confirm | F |
| `settlement.hold_hours` | `48` | 0–168 | Confirm | F |
| `payout.target_balance` | `real` | `real` \| `bonus` | Version | F |
| `payout.claim_mode` | `manual_claim` | `manual_claim` \| `auto_credit` | Confirm | F |
| `payout.min_claim_amount` | `1.00` | 0.10–50 | Safe | I |

**Parameter notes**

- **`ftd_bounty`** — A small fixed reward when an invitee makes a qualified first deposit. *Business:* provides the immediate dopamine that percentage-based rewards cannot; percentages feel abstract until real volume exists. *Math:* this is a pure CPA line item — `bounty × qualified_FTDs` — with no revenue linkage, so caps matter more than the amount.
- **`invitee_reward`** — Default off. *Business:* the invitee already receives the deposit bonus ladder; adding cash stacks two acquisition costs on one player. *Math:* would raise blended CAC by the full amount with no additional retention mechanism attached.
- **`settlement.mode`** — When accrual is computed. *Business:* per-bet accrual makes the referral screen feel alive; batch is cheaper. *Math:* identical totals, different write volume and reversal difficulty.
- **`settlement.hold_hours`** — Delay before accrued commission becomes claimable. *Business:* the window in which you can reverse fraud without clawing back paid funds. *Math:* converts irreversible payouts into reversible accruals for the hold duration — the highest-leverage anti-abuse lever in the referral system.
- **`payout.target_balance`** — Paying to REAL keeps the promise honest. Paying to BONUS would reduce cost but turn the program into a bonus scheme and destroy trust. Marked **Version** because it redefines the product.
- **`payout.min_claim_amount`** — Batching threshold. *Business:* prevents thousands of 3-cent claims. *Math:* small float benefit, meaningful ops relief.

---

## Section 3 — Promotion Configuration (Generic)

These keys apply to **every** promotion regardless of template. They implement the Promotion Engine sections on priority, limits, segments and conditions.

### 3.1 Identity and lifecycle

| Key | Default | Range | Admin | Scope |
|---|---|---|---|---|
| `promotion.id` | — | string | Version | X |
| `promotion.template` | — | `deposit_match` \| `referral_edge_share` \| `referral_ftd_bounty` \| `freebet_pack` \| `reload` \| `cashback` | Version | X |
| `promotion.version` | `1` | int | Version | X |
| `promotion.enabled` | `false` | bool | Safe | I |
| `promotion.starts_at` | `null` | ISO timestamp | Safe | I |
| `promotion.ends_at` | `null` | ISO timestamp | Safe | I |
| `promotion.description` | — | string | Safe | I |

**Notes** — `enabled` defaults to `false` so a half-configured promotion can never leak into production. `starts_at` / `ends_at` are **Safe** because stopping a promotion early is always a safe direction; extending it is equally reversible since active grants are snapshot-protected either way.

### 3.2 Priority and compatibility

| Key | Default | Range | Admin | Scope |
|---|---|---|---|---|
| `priority` | `50` | 1–99 (lower wins) | Confirm | I |
| `mutex_group` | `null` | string | Version | I |
| `stacks_with` | `[]` | list of promotion ids | Confirm | I |
| `blocks` | `[]` | list of promotion ids | Confirm | I |

**Notes** — *Business:* this is how you add a promo code campaign in month two without accidentally letting a player claim it on top of the welcome tier. *Math:* mutex membership is what bounds total concurrent giveback per player; without it, expected cost is the sum over all simultaneously claimable offers rather than the maximum.

### 3.3 Targeting

| Key | Default | Range | Admin | Scope |
|---|---|---|---|---|
| `segments_allow` | `[]` (all) | list | Confirm | I |
| `segments_deny` | `[]` | list | Confirm | I |
| `geo_allow` | `[]` (all) | list | Confirm | I |
| `geo_deny` | `[]` | list | Safe | I |
| `conditions.all_of` | `[]` | condition list | Confirm | I |
| `conditions.any_of` | `[]` | condition list | Confirm | I |
| `conditions.not` | `[]` | condition list | Confirm | I |

Supported MVP conditions: `min_deposit`, `deposit_index`, `is_ftd`, `has_referrer`, `is_referrer`, `no_active_wagering_bonus`, `source_not_received`, `account_age_days`.  
Reserved for later: `real_wager_total`, `vip_level`, `referral_tier`, `telegram_age_days`, `segment`.

**Notes** — *Business:* targeting is what turns one bonus into ten campaigns. *Math:* narrowing a segment reduces grant volume proportionally, which is the cheapest way to cut promotional spend without changing the offer's attractiveness.

### 3.4 Limits and budget

| Key | Default | Range | Admin | Scope |
|---|---|---|---|---|
| `limits.total_budget` | `null` | null / 100–1000000 | Safe | I |
| `limits.daily_budget` | `null` | null / 50–100000 | Safe | I |
| `limits.max_grants` | `null` | null / 1–1000000 | Safe | I |
| `limits.per_user_limit` | `1` | 1–100 | Confirm | I |
| `limits.lifetime_limit` | `1` | 1–100 | Confirm | I |
| `limits.concurrent_active_cap` | `1` | 1–10 | Confirm | I |
| `limits.cooldown_hours` | `0` | 0–720 | Confirm | I |
| `limits.claim_deadline_hours` | `null` | null / 1–168 | Confirm | F |

**Notes**

- **`total_budget` / `daily_budget`** — *Business:* the difference between a viral day being a success and being an incident. *Math:* converts an unbounded cost distribution into a hard-capped one; expected cost becomes `min(organic_demand, budget)`.
- **`per_user_limit` / `lifetime_limit`** — *Business:* the lifetime variant survives version churn, so republishing an offer as v2 does not hand every existing player a second grant. *Math:* bounds per-player exposure across the whole offer family.
- **`concurrent_active_cap`** — Numeric expression of the mutex, kept per-promotion so freebets can later be exempted.
- **All limits gate new grants only.** A budget exhausted mid-day never touches grants already issued.

### 3.5 Snapshot declaration

| Key | Default | Admin | Scope |
|---|---|---|---|
| `snapshot_fields` | template default list | Version | X |

Declares which resolved values are copied onto the grant. For `deposit_match` this is: `percent`, `principal`, `wager_multiplier`, `wager_required`, `wager_base`, `max_bet`, `max_win_cap`, `expires_at`, `eligible_games`, `contribution_weights`, `offer_version`.

**Notes** — *Business:* this is your dispute defense and your experiment integrity in one field. *Math:* guarantees that the numbers used to compute a player's obligation can never drift after the fact.

### 3.6 Experiment binding

| Key | Default | Range | Admin | Scope |
|---|---|---|---|---|
| `experiment.id` | `null` | string | Confirm | I |
| `experiment.variant` | `control` | `control` \| `treatment_a` \| `treatment_b` | Version | X |
| `experiment.traffic_percent` | `0` | 0–100 | Safe | I |
| `experiment.min_runtime_days` | `7` | 3–60 | Confirm | I |
| `experiment.max_runtime_days` | `30` | 7–90 | Confirm | I |

---

## Section 4 — Admin Configuration

The existing Telegram admin bot already has a role gate and a working withdraw queue. Configuration editing extends that surface — it does not replace it.

### 4.1 Safe to edit anytime

Reversible, cannot corrupt an active grant, and always moves risk in a controllable direction.

| Parameter | Why it is safe |
|---|---|
| `bonus.enabled`, `bonus.deposit_bonuses_enabled` | Kill switches only reduce exposure; active grants unaffected |
| `referral.enabled` | Freezes new accrual; owed balances preserved |
| `promotion.enabled`, `starts_at`, `ends_at` | Scheduling affects future grants only |
| `limits.total_budget`, `daily_budget`, `max_grants` | Pure ceilings; lowering them stops new spend immediately |
| `antiabuse.*` caps and thresholds | Tightening is always safe; loosening is bounded by other caps |
| `payout.min_claim_amount` | Operational batching only |
| `ftd_bounty.enabled`, daily caps | Bounded cost switch |
| `tier_recalc_interval_hours` | No economic effect |
| `experiment.traffic_percent` | Rolling a test back to 0% is the standard rollback |
| Alert thresholds (liability, large withdrawal, referrer earnings) | Monitoring only |

**Requirement:** every edit writes an audit entry (actor, key, old, new, timestamp). Without this, Section 6 comparison is impossible.

### 4.2 Requires confirmation

Real economic consequences, but no snapshot corruption. The bot must show a before/after diff and state explicitly which grants are affected.

| Parameter | Why confirmation |
|---|---|
| `referral.tiers.*.revshare_percent` | Directly changes ongoing payout cost per turnover unit |
| `referral.tiers.*.min_qualified_ftd` | Moves players between rates; can promote many users at once |
| `referral.game_edges.*` | Silently reprices every future commission |
| `ftd_bounty.amount` | Direct CPA change |
| `settlement.hold_hours` | Shrinking the hold reduces fraud reversibility |
| `qualification.min_ftd_amount` | Changes who counts as acquired |
| `bonus.min_deposit`, `max_deposit` | Alters eligible population |
| `bonus.forfeit_on_withdraw`, `expiry_scope` | Changes player-facing outcomes |
| `spend_order`, `claim_mode` | Affects UX and liability burn rate |
| `priority`, `stacks_with`, `blocks` | Can unintentionally open stacking |
| Segment and condition lists | Can widen a targeted offer to everyone |

**Confirmation copy must state:** *"This affects future grants only. Active bonuses keep their original terms."*

### 4.3 Requires a new promotion version

Anything that defines the commercial identity of an offer a player has already accepted. Editing in place would break the snapshot contract.

| Parameter | Why a new version |
|---|---|
| `percent` | The headline the player accepted |
| `wager_multiplier`, `wager_base`, `wager_counts_balance` | Defines the obligation |
| `max_bonus`, `max_win_absolute`, `max_bet_*` | Defines the caps |
| `expires_days` | Defines the deadline |
| `eligible_games`, `contribution_weights` | Defines where the obligation can be discharged |
| `unlock_policy` | Defines what completion pays |
| `payout.target_balance` (referral) | Redefines what "earnings" means |
| `commission_base`, `attribution_mode` | Redefines the referral product |
| `experiment.variant` | Variants must be distinct versions to compare cleanly |

**Mechanic:** publishing v2 leaves v1 serving all active grants. New grants reference v2. Both remain queryable for reporting.

### 4.4 Never editable from the bot

`bonus.stickiness`, `bonus.unlock_policy` internals, `referral.retroactive_tiers`, `qualification.require_completed_deposit`, `antiabuse.block_self_referral`, ledger and state-machine behavior. These are engine invariants — see Section 0.1.

### 4.5 Admin surface requirements

| Capability | Priority |
|---|---|
| View current effective config (resolved values) | Must |
| Edit Safe-tier keys inline | Must |
| Confirm-tier edits with before/after diff | Must |
| Publish new offer version (clone + edit + activate) | Should |
| Config audit log (last 50 changes) | Must |
| One-tap global kill: bonuses / referral | Must |
| Rollback last change | Should |

---

## Section 5 — Metrics

There is no production data. The purpose of day-one instrumentation is to **make the first configuration change an informed one** rather than another guess.

### 5.1 The non-negotiable rule: stamp every event with its cohort keys

Every economic event must carry:

```
user_id
timestamp (UTC)
offer_id + offer_version        (bonus events)
experiment_id + variant_id      (if assigned)
segment(s) at time of event
referrer_id (if any)
balance_type (REAL | BONUS)
game_id + risk_mode (bet events)
```

**Why this dominates everything else in this section:** aggregate metrics without cohort keys cannot answer "did the change work?". You can always recompute a metric later from well-stamped events; you can never recover a dimension that was never recorded. If only one thing from Section 5 ships, ship this.

### 5.2 Bonus metrics

| Metric | Definition | Why it exists |
|---|---|---|
| Grants issued | Count + sum of principal, by offer version | Volume and gross liability created |
| Activation rate | Grants that placed ≥1 BONUS bet / grants | Detects offers players ignore |
| Completion (unlock) rate | Unlocked / granted | The single best predictor of realized cost |
| Expiration rate | Expired / granted | The main cost reducer; if it collapses, cost spikes |
| Forfeit rate | Forfeited / granted | Signals offers players actively dislike |
| Average bonus cost | Sum unlocked to REAL / grants | Actual cash cost per grant |
| Bonus-funded turnover | Sum of BONUS stakes | Denominator for realized edge on bonus play |
| Average time-to-clear | Hours from grant to unlock | Tells you whether `expires_days` is binding |
| Outstanding liability | Sum of active `bonus_balance` + unfinished principals | Daily risk position |
| Max-bet violations blocked | Count | Validates the anti-abuse cap is doing work |
| Bonus ROI | (Net deposits from bonused cohort − unlocked cost) / unlocked cost | The only number that says whether bonuses are worth running |

### 5.3 Referral metrics

| Metric | Definition | Why it exists |
|---|---|---|
| Invitations (link opens / registrations) | Count | Top of the growth funnel |
| Registrations per referrer | Distribution, not just mean | Reveals whether growth is broad or one power user |
| FTD conversion | Qualified FTDs / registrations | Traffic quality; the number that separates real growth from noise |
| Average referred deposit | Mean and median | Feeds LTV estimates |
| Average referred real wager | Per referred player | The commission base itself |
| Commission accrued / paid / pending | By tier | Cost tracking and hold-window health |
| Earnings per referrer | Distribution | Detects farming concentration |
| Active referrers | ≥1 commissionable bet from an invitee this week | The real size of the channel |
| Referral CAC | (Commission + bounties) / qualified FTDs | Compare directly against bonus CAC |
| Tier distribution | Bronze / Silver / Gold counts | Validates threshold placement |
| Frozen referrers / blocked accruals | Count | Abuse pressure signal |

### 5.4 Economics metrics

| Metric | Definition | Why it exists |
|---|---|---|
| Deposits / withdrawals (count, sum, net) | Daily | The business pulse |
| GGR proxy | Stakes − wins, by game and balance type | Revenue before promo cost |
| Promotional cost | Bonus unlocked + referral paid + bounties | Total giveback |
| Net margin | GGR − promotional cost | Are you actually making money |
| **Realized vs theoretical edge** | Actual hold ÷ turnover, per game, vs configured edge | Validates game math *and* the `referral.game_edges` price list. A persistent gap means you are mispaying referrals or your RTP tables are wrong |
| Total giveback rate | Promo cost / total turnover | Must stay comfortably below blended edge |
| Average deposit / average wager | Mean and median | Segmentation input |
| ARPPU | Net margin / paying players | LTV foundation |
| Player LTV (cohort) | Cumulative net margin by signup week | Needed before any CAC decision is meaningful |
| D1 / D7 / D30 retention | By cohort and by bonus/no-bonus | Distinguishes acquisition from retention effects |
| Deposit conversion | Registrations → FTD | Funnel health |
| Time to first deposit | Median hours | Onboarding friction |

### 5.5 Additional metrics worth collecting from day one

| Metric | Why it is required despite not being requested |
|---|---|
| **Config change log with timestamps** | Every metric shift must be attributable to a change. Without this, all A/B conclusions are guesses |
| **Bonus-funded vs real-funded turnover split** | The two have completely different margins; blending them makes GGR uninterpretable |
| **Unlock-to-withdrawal latency** | Short latency across many accounts is the classic bonus-abuse fingerprint |
| **Deposit → withdraw round-trip without wagering** | Detects payment-cycling and referral farming |
| **Withdrawal rejection / freeze counts** | Ops load and risk pressure |
| **Concurrent active grants per user** | Verifies the mutex actually holds |
| **Referrer/invitee overlap signals** | Cheap self-referral detection without building fraud ML |
| **Config fallback warnings** | Silent fallback to engine defaults means your config is not doing what you think |

### 5.6 Minimum viable reporting

Daily admin digest is sufficient for launch — no BI stack required:

```
Deposits · Withdrawals · Net
New users · FTDs · FTD conversion
Bonus: granted / unlocked / expired / outstanding liability
Referral: accrued / paid / pending / active referrers
GGR proxy · promo cost · net margin
Alerts: liability > threshold, referrer > threshold, large withdrawal
```

---

## Section 6 — Experimentation Workflow

Assumption: during the first months, every commercial number changes frequently. The workflow must make changes cheap **and** attributable.

### 6.1 Change classes

| Class | Examples | Mechanism | Turnaround |
|---|---|---|---|
| **Instant** | Kill switches, budgets, traffic %, alert thresholds, `enabled`, schedule | Edit value → next evaluation uses it | Seconds |
| **Confirmed** | Referral rates, tier thresholds, game edges, min deposit, bounty amount | Edit with diff confirmation → applies to future accrual/grants | Minutes |
| **Versioned** | Match %, wager, expiry, caps, eligible games, commission base | Clone offer → edit → publish v(N+1) | Minutes |
| **Never** | Any field on an active grant snapshot | Not possible by design | — |

### 6.2 What can change instantly

Anything that only **restricts** or **schedules**: disabling an offer, lowering a budget, cutting experiment traffic, tightening an abuse cap, ending a campaign early. These directions are always safe because they reduce exposure and never alter an obligation a player already holds.

### 6.3 What requires a new promotion version

Anything a player would describe as "the deal I took": the match percentage, the wagering requirement and its base, the expiry, the caps, and which games count. Publishing a new version is deliberately cheap — clone, edit, activate — so there is no incentive to edit in place.

### 6.4 What must never change for active promotions

Every field in `snapshot_fields`. The engine reads these from the grant row, not from config, so this is enforced structurally rather than by policy. This is simultaneously a fairness guarantee, a dispute defense, and the precondition for clean experiment measurement — a cohort whose terms mutated mid-flight produces meaningless data.

### 6.5 How to compare experiments

1. **Define the primary metric before launching.** For deposit offers: net deposits per eligible player over 14 days. For referral changes: qualified FTDs per active referrer. Never claim rate alone — claim rate optimizes for giving money away.
2. **Assign deterministically and stickily.** `hash(user_id + experiment_id)` → variant, decided at first eligibility evaluation, never reassigned.
3. **Compare cohorts, not calendar periods.** Before/after comparisons on a growing product are confounded by traffic mix; concurrent control/treatment is the only trustworthy design.
4. **Respect minimum runtime.** `min_runtime_days` (7) or a pre-declared FTD count, whichever comes later. Telegram traffic is spiky; three good days prove nothing.
5. **Watch guardrails alongside the primary metric:** unlock rate, promo cost per FTD, outstanding liability, D7 retention. A variant that wins on FTDs while doubling bonus cost is a loss.
6. **Decide manually.** No auto-promotion at MVP volumes — the false-positive rate would exceed the learning rate.
7. **Record the decision in the audit log**, including the losing variant. Future you will re-propose the same failed idea otherwise.

### 6.6 Safe rollback

| Situation | Rollback action | Effect on active grants |
|---|---|---|
| Treatment underperforming | `experiment.traffic_percent → 0` | None — existing grants finish under their snapshot |
| Bad offer version published | `enabled → false` on v2; v1 resumes | None |
| Abuse incident | `bonus.enabled → false` and/or `referral.enabled → false` | None — no new grants or accrual |
| Budget overrun | Lower `daily_budget` to current spend | None |
| Bad referral rate | Restore previous rate (applies to future accrual) | Accrued amounts already earned remain owed |
| Config file corrupted | Engine defaults apply, warning logged | None |

**The rollback guarantee:** because every grant carries its own terms, *no rollback ever requires touching player balances*. That property is what makes rapid experimentation safe, and it is the reason snapshots are non-negotiable.

### 6.7 Weekly operating rhythm

```
Monday    — review last week's cohorts, decide winners
Tuesday   — publish new offer versions / adjust rates
Wed–Sun   — observe, guardrails only, no mid-flight edits
Anytime   — kill switches if an incident occurs
```

Resisting mid-experiment edits is the hardest discipline and the one that determines whether any of this data is usable.

---

## Section 7 — Default Values

> **These are starting hypotheses, not recommendations derived from data.**  
> No production data exists at the time of writing. Every value below is expected to change — probably within the first month — once real player behaviour is observed. They are chosen to be *safe to be wrong about*: caps are conservative, kill switches are present, and nothing here is difficult to reverse.

### 7.1 Bonus seeds

| Key | Current in code | Seed value | Rationale for the seed |
|---|---|---|---|
| `deposit_tier_1.percent` | `50` | `50` | Keep; unchanged from live behaviour |
| `deposit_tier_2.percent` | `75` | `75` | Keep |
| `deposit_tier_3.percent` | `150` | `100` | 150% is a large uncapped magnet before any abuse data exists |
| `wager_multiplier` | `50` | `40` | 50× with a 5-day window is likely unclearable; start friendlier and tighten if cost runs hot |
| `wager_base` | bonus only | `bonus_only` | Keep; transparent |
| `wager_counts_balance` | BONUS only | `bonus_only` | Keep current behaviour as the control arm |
| `max_bonus` | none | `50.00` | Any cap beats no cap before whale behaviour is known |
| `min_deposit` | none | `10.00` | Shared with referral qualification |
| `expires_days` | `5` | `7` | Gives 40× a realistic clearing window |
| `max_bet_percent_of_bonus` | `0.02` | `0.02` | Keep |
| `max_bet_absolute` | `2.50` | `2.50` | Keep |
| `max_win_absolute` | `50.00` | `50.00` | Keep |
| `eligible_games` | dice, crash, plinko-low | dice, plinko-low | Crash cannot actually be played with BONUS today |
| `spend_order` | prefer bonus | `prefer_bonus` | Keep |
| `stickiness` | non-sticky | `non_sticky` | Matches the wallet |
| `opt_out_enabled` | not exposed | `true` | Method exists, needs wiring |

### 7.2 Referral seeds

| Key | Current in code | Seed value | Rationale for the seed |
|---|---|---|---|
| `commission_base` | none | `theoretical_edge` | Predictable cost, no negative-carryover mechanics needed |
| `tiers.bronze.revshare_percent` | `30` | `25` | Competitive viral seed; still below affiliate Starter (40%) |
| `tiers.silver.revshare_percent` | `35` | `30` | Mid player rate; matches coded mid value |
| `tiers.gold.revshare_percent` | `45` | `35` | Top player rate; capped under affiliate ladder (40%+) |
| `tiers.silver.min_qualified_ftd` | none | `5` | Reachable enough to prove the loop works |
| `tiers.gold.min_qualified_ftd` | none | `20` | Aspirational without being decorative |
| `game_edges.dice` | `0.025` declared | `0.025` | Matches `97.5 / chance` payout construction |
| `game_edges.crash` | none | `0.030` | Matches the 3% instant-bust parameter |
| `game_edges.plinko` | none | `0.030` | Flattened across risk modes for MVP simplicity |
| `count_bonus_wager` | n/a | `false` | Never pay commission on subsidized stakes |
| `qualification.min_ftd_amount` | none | `10.00` | Equal to `bonus.min_deposit` |
| `settlement.hold_hours` | none | `48` | Enough time for a human to catch farming |
| `payout.min_claim_amount` | none | `1.00` | Avoids dust claims |
| `ftd_bounty.amount` | none | `1.00` | Small enough that farming it is unprofitable against a $10 FTD floor |
| `ftd_bounty.max_per_day_per_referrer` | none | `50.00` | Bounded worst case |
| `invitee_reward.enabled` | none | `false` | Invitee already receives the bonus ladder |
| `attribution_mode` | lifetime | `lifetime` | Already implemented; costs nothing to keep |

### 7.2b Affiliate seeds (separate product)

| Key | Seed value | Rationale |
|---|---|---|
| `affiliate.tiers.starter.revshare_percent` | `40` | Entry clearly above player Gold (35%) |
| `affiliate.tiers.growth.revshare_percent` | `50` | Mid-volume media / creators |
| `affiliate.tiers.pro.revshare_percent` | `60` | Public ladder ceiling |
| `affiliate.individual_deal_max_percent` | `70` | Negotiated override for strategic partners only — not auto-unlocked |
| `affiliate.qualification.min_ftd_amount` | `5.00` | Higher than customer $3 FTD floor |

### 7.3 Promotion and limit seeds

| Key | Seed value | Rationale |
|---|---|---|
| `promotion.enabled` | `false` on create | Nothing leaks to production half-configured |
| `limits.per_user_limit` | `1` | Matches once-only sources |
| `limits.concurrent_active_cap` | `1` | One active wagering bonus |
| `limits.daily_budget` | `null` at launch, set in week 2 | You cannot size a budget before you see demand |
| `antiabuse.max_daily_earn_per_referrer` | `100.00` | Bounded overnight worst case |
| `antiabuse.review_threshold_daily_earn` | `50.00` | Human review before payout, not after |
| `bonus.alert_liability_threshold` | `1000.00` | Arbitrary but present; tune after week 1 |
| `experiment.traffic_percent` | `0` | Experiments start dark |
| `experiment.min_runtime_days` | `7` | Below this, Telegram traffic noise dominates |

### 7.4 Explicit expectations for change

| Parameter | Likely direction after data | Trigger to act |
|---|---|---|
| `wager_multiplier` | Up, if unlock rate is high and cost runs hot | Unlock rate > ~40% with negative net margin |
| `expires_days` | Down, if clears are trivially easy | Median time-to-clear far below the window |
| `max_bonus` | Up, if deposits cluster above the cap | Large share of grants hitting the cap |
| `tiers.*.revshare_percent` | Up, if referral CAC beats bonus CAC | Referral CAC materially below bonus CAC |
| `min_qualified_ftd` | Adjusted to actual invite distributions | Almost nobody or almost everybody reaching Silver |
| `ftd_bounty.amount` | Up or off, depending on farming | Bounty cost per real FTD out of line |
| `game_edges.*` | Corrected to realized hold | Realized vs theoretical edge diverging persistently |

**Do not tune more than one or two parameters per cycle.** With MVP traffic, simultaneous changes are indistinguishable from each other and destroy the attribution that Sections 5 and 6 exist to protect.

---

## Section 8 — Implementation Notes (Non-Breaking)

### 8.1 What changes

| Module | Change | Type |
|---|---|---|
| New `economics_config` | Holds all keys in this document with engine defaults | Additive |
| `database/bonus.py` | Read catalog values from config instead of module constants; write `offer_version` into the grant | In-place, behaviour-preserving |
| `database/referral.py` | Read `refshare_table` and thresholds from config | In-place, behaviour-preserving |
| Eligibility helper | New thin function evaluating segments, conditions, limits, priority before existing `grant*` calls | Additive |
| `admin_bot.py` | Config view / edit / audit screens | Additive |
| Metrics | Stamp cohort keys on economic events | Additive |

### 8.2 What must not change

`createInstance()` semantics, transaction posting, wallet balance arithmetic, the grant state machine (`active` → `unlocked` / `expired` / `forfeited`), write-once referral attribution, REAL-only withdrawals, idempotent deposit completion.

### 8.3 Migration order

1. Introduce `economics_config` with values **identical to today's constants** — verify zero behaviour change.
2. Add `offer_version` to grants; start stamping.
3. Move referral rates into config (still inert until settlement ships).
4. Add cohort stamping to events and the config audit log.
5. Add limits and eligibility helper.
6. Add admin editing, Safe tier first.
7. Only then start changing values.

**Step 1 is the whole trick:** ship the configuration layer as a no-op, confirm nothing moved, and only afterwards begin experimenting. A config layer that changes behaviour on the day it lands is indistinguishable from a bug.

---

*End of Tornado Economics Configuration Specification.*
