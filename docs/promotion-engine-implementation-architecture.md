# Tornado Promotion Layer — Implementation Plan

**Source of truth:** `docs/mvp-economics-launch-spec.md`  
**Scope:** Plan only — how to wire the existing codebase. Not a redesign.

---

## Absolute constraints

The current project directory layout is **FINAL**.

- Do **not** redesign it.
- Do **not** introduce new top-level packages.
- Do **not** move existing files.
- Do **not** split modules into new folders.
- Do **not** propose a cleaner directory structure.

This plan only adds a thin Promotion Layer **on top of** what already exists.

Create as few new files as possible. If a responsibility fits an existing file, **extend that file**.

Think like an engineer joining production code: smallest diff that integrates Bonus and Referral without reorganizing the repo.

---

## What already exists (use it)

| Existing piece | Role after this work |
|---|---|
| `promo/promo_manager.py` | Fill in `PromotionManager` — thin orchestrator (stub already present) |
| `database/bonus.py` | Keep `BonusManager`; extend settlement/gaps; read numbers from config |
| `database/referral.py` | Keep `ReferralManager`; add FTD/accrual/claim; read numbers from config |
| `config.py` | Add commercial seeds + game edges + flags (same file as bet limits) |
| `database/auth.py` | Call `PromotionManager` on register instead of multi-step referral side effects |
| `payments/deposit.py` | Call `PromotionManager` on deposit confirmed instead of `BonusManager` directly |
| `games/game_manager.py` | Call `PromotionManager` on bet settled instead of only notifying bonus |
| `admin_bot.py` | Add read-only dashboard queries / admin actions via orchestrator or managers |
| `main.py` | Keep calling `BonusManager` / `ReferralManager` for read APIs |

**New files for MVP: none.** Only implement/extend the files above.

---

## PromotionManager — thin orchestrator only

**File:** `promo/promo_manager.py` (already exists)

**Does**
- Receive calls from auth / deposit / game_manager / admin
- Decide order: Bonus vs Referral (and later other managers)
- Pass the caller’s `conn` through so work stays in the same transaction
- Tiny eligibility helpers in **this same file** (min deposit, FTD floors, REAL-only stake)
- Log skip/grant at orchestration level

**Does not**
- Own bonus math, wager unlock, expire, forfeit
- Own referral keys, invites, edge formulas, tier math
- Touch wallet / payments / game RNG directly
- Become a second domain layer

`BonusManager` and `ReferralManager` must **never** import each other. Only `promo_manager.py` imports both.

### Call surface

| Method | Wire from |
|---|---|
| `on_user_registered(..., conn)` | `database/auth.py` |
| `on_deposit_confirmed(..., conn)` | `payments/deposit.py` |
| `on_bet_settled(..., conn)` | `games/game_manager.py` |
| `on_withdrawal_completed(..., conn)` | `payments/withdraw.py` (MVP may no-op) |
| `on_daily_reset(...)` | admin command when needed |
| `on_admin_action(..., conn)` | `admin_bot.py` |

Plain method calls. No bus, no queue, no events framework.

---

## What stays in the existing managers

### `BonusManager` (`database/bonus.py`)

Catalog, grant + snapshot, fund BONUS, `recordWagerProgress`, unlock / expire / forfeit, BONUS bet checks, list/select for API.  
Read offer numbers from `config.py`. Never call Referral.

### `ReferralManager` (`database/referral.py`)

Profile / key / invite (existing), then extend: qualify FTD ($3), bounty, edge accrual on REAL bets, claim/hold, tier 25/30/35.  
Read rates from `config.py`. Never call Bonus.

### Config (`config.py`)

Add in place: bonus seeds, referral seeds, affiliate seeds (for later), `GAME_EDGES`, enable flags.  
Managers import config. Call sites do not hardcode commercial numbers.

### Rules

Small functions in `promo/promo_manager.py` only — e.g. `can_receive_deposit_bonus`, `is_qualified_customer_ftd`, `is_commissionable_stake`.  
Do not add a rules module or package.

### Metrics

Read-only. Prefer `stats_*` / query helpers on `BonusManager` / `ReferralManager`, composed in `admin_bot.py`.  
Or a small read-only helper class in the **same** `promo_manager.py` if composition is awkward.  
Never mutate state from metrics code. Do not add a metrics package.

---

## Event / data flow (integration only)

```
auth | deposit | game_manager | admin
              →  PromotionManager  (promo/promo_manager.py)
                    → BonusManager and/or ReferralManager
                         → Wallet / DB (as today)
```

**Register:** `auth` → `on_user_registered` → Referral attribution (profile/invite as today, sequenced here).

**Deposit confirmed:** `deposit.py` → `on_deposit_confirmed` → grant deposit bonus if eligible; qualify FTD / bounty / tier on referral path.

**Bet settled:** `game_manager` → `on_bet_settled` → BONUS progress and/or REAL edge accrual.

**Reads:** `main.py` may still use managers directly for `/api/bonus/*` (and later referral APIs). Orchestrator is for **side effects**, not a mandatory read façade.

Always reuse the caller’s open transaction (`conn`).

---

## What moves where

| Today | After |
|---|---|
| `deposit.py` calls `BonusManager.grantDepositBonus` | `deposit.py` → `PromotionManager.on_deposit_confirmed` → BonusManager |
| `game_manager._notify_wager_progress` → Bonus only | → `on_bet_settled` → Bonus (+ Referral accrual when REAL) |
| `auth.py` multi-step referral wiring | → `on_user_registered` → ReferralManager |
| Hardcoded bonus/referral constants in manager files | Values in `config.py`; managers read them |

Domain logic does **not** move into `PromotionManager`. Only coordination does.

---

## Implementation order (smallest diffs)

1. Add economics constants to `config.py`; switch `bonus.py` / `referral.py` to read them (same behavior).  
2. Implement thin `on_*` methods in `promo/promo_manager.py` that call existing manager methods.  
3. Rewire `deposit.py`, `game_manager.py`, `auth.py` to the orchestrator.  
4. Extend `referral.py` with settlement (FTD, bounty, accrual, claim, tiers).  
5. Extend `bonus.py` with remaining launch gaps (min deposit, caps, forfeit wiring, eligibility honesty).  
6. Extend `admin_bot.py` with read-only metrics and admin actions through existing managers / orchestrator.

Stop there for MVP. No new directories. No file moves.

---

## Later features (still no layout redesign)

When cashback / VIP / affiliate / missions are needed: add the smallest possible extension — prefer methods on an existing manager or a single new module **only if** it cannot fit without creating a mess. Wire it from `PromotionManager` with a few lines. Do not invent new top-level packages or reorganize `database/`.

Affiliate remains a **separate commercial product** from customer referral (per launch spec): do not reuse Bronze/Silver/Gold player tiers. Until then, keep affiliate numbers in `config.py` only.

---

## Done when

1. Directory tree is unchanged (no new packages; no moved files).  
2. Commercial side effects from register / deposit / bet go through `PromotionManager`.  
3. `BonusManager` ↔ `ReferralManager` have zero imports either way.  
4. Commercial numbers live in `config.py`.  
5. Metrics/admin reporting does not write commercial state.

---

**Bottom line:** Fill in the existing `promo/promo_manager.py`, put numbers in `config.py`, extend `bonus.py` / `referral.py`, and change three call sites. That is the entire Promotion Layer.
