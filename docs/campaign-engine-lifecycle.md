# Campaign Engine — Architectural Reference

**Audience:** new developers (5–10 minutes)  
**Code:** `database/campaign.py`, `promo/promo_manager.py`  
**Rule:** Campaign Engine **tracks**; Bonus/Referral managers **pay**.

---

## 1. Architecture

```
auth / deposit / game_manager / withdraw / daily_reset
                    │
                    ▼
            PromotionManager          ← rewards + observe
           ┌────────┴────────┐
           ▼                 ▼
    BonusManager      CampaignManager   ← OS for campaigns
    ReferralManager          │
                     ┌───────┼───────────────┐
                     ▼       ▼               ▼
              RuleEvaluator  ProgressTracker  SQL tables
                     │
                     ▼
              Campaign / CampaignParticipation
```

There are **no separate Repository classes**. Persistence lives inside `CampaignManager` (same role as a repository layer).

| Class | Owns | Must never |
|---|---|---|
| **Campaign** | One campaign row as a domain object (`config` JSONB, schedule, budget helpers) | Issue money; talk to games |
| **CampaignParticipation** | One user×campaign row (status, progress, metadata) | Grant rewards |
| **CampaignManager** | CRUD, discovery, `handleEvent`, participations, player API | Implement deposit/referral payout math |
| **RuleEvaluator** | Eligibility abstraction (`is_eligible` → segmentation stub + conditions stub) | Hardcode product rules inside PromotionManager |
| **ProgressTracker** | Generic progress math (count / USD / %) → `ProgressSnapshot` | Touch wallets |
| **PromotionManager** | Call Bonus/Referral for **rewards**; then `_track_campaign_event` | Put campaign SQL or eligibility rules inline |
| **BonusManager** | BONUS wallet grants, wagering, unlock/expire | Know about `campaign` tables |
| **ReferralManager** | FTD bounty, edge share, claim | Know about `campaign` tables |

**Tables:** `campaign`, `campaign_participations`  
**Schema ensure:** `ensure_campaign_schema()` (startup + manager init)

---

## 2. Data flow

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
PromotionManager._track_campaign_event  (observe only)
        │
        ├── BonusManager / ReferralManager  (rewards — unchanged)
```

### Player discovery (future Promotions UI)

```
getAvailableCampaigns(user)     # active + RuleEvaluator
        ↓
getUserCampaigns(user)          # cards
        ↓
getCampaignProgress(user, campaign)
```

---

## 3. Event lifecycle

Live entry is **not** `PromotionManager.handleEvent`.  
Hooks stay `on_*`; each ends with best-effort tracking.

### Deposit completed (canonical)

```
deposit.py completeDeposit
    ↓
PromotionManager.on_deposit_confirmed
    ├── BonusManager.grantDepositBonus          # REWARD (unchanged)
    ├── ReferralManager.mark_qualified_ftd…     # REWARD (unchanged)
    └── finally: _track_campaign_event(DEPOSIT)
            ↓
        CampaignManager.handleEvent(user, DEPOSIT, context)
            ↓
        getCampaignByTrigger("DEPOSIT")   # aliases: on_deposit_confirmed
            ↓
        RuleEvaluator.is_eligible(...)
            ↓
        getOrCreateParticipation(...)
            ↓
        ProgressTracker.build_snapshot + metadata_for_snapshot
            ↓
        updateParticipationStatus(...)    # progress + status
            ↓
        STOP  (no grant here)

Future (not implemented):
            ↓
        BonusManager.grantReward(...)     # only after CampaignManager decides
```

`handleEvent` failures are logged and **ignored** — rewards never roll back.

---

## 4. Player lifecycle (call order)

| Moment | Reward path | Campaign observe |
|---|---|---|
| **Registration** | `on_user_registered` → Referral profile / invite | `EVENT_REGISTER` |
| **Login** | *(none wired)* | `EVENT_LOGIN` supported by engine; no PromotionManager hook yet |
| **Deposit** | `on_deposit_confirmed` → deposit bonus + FTD bounty | `EVENT_DEPOSIT` |
| **Game bet settle** | `on_bet_settled` → wager progress + referral accrual | `EVENT_BET_SETTLED` |
| **Bonus fully cleared** | *(after BONUS wager unlock leaves no active instances)* | `EVENT_BONUS_COMPLETED` |
| **Daily bonus expire** | `on_daily_reset` → `expireDueBonuses` | `EVENT_BONUS_EXPIRED` |
| **Withdraw** | `on_withdrawal_completed` (stub) | `EVENT_WITHDRAW` |

### Inside `CampaignManager.handleEvent`

1. Normalize event → trigger aliases  
2. `getCampaignByTrigger`  
3. `RuleEvaluator.is_eligible`  
4. `getOrCreateParticipation`  
5. Skip if terminal status (except COMPLETED/EXPIRED events)  
6. `ProgressTracker` → ratio + metadata  
7. `_next_status_for_event` → `updateParticipationStatus`

---

## 5. Campaign lifecycle

```
Admin / script: CampaignManager.createCampaign(...)
        ↓
Row in campaign (enabled, trigger, config JSONB, schedule, budget)
        ↓
getActiveCampaigns() — enabled + within start_at/ends_at
        ↓
getAvailableCampaigns(user) — + RuleEvaluator (segmentation later)
        ↓
Player event → handleEvent → participation created
        ↓
Progress updated on further events
        ↓
Status → COMPLETED / EXPIRED / CANCELLED
        ↓
Reward today: still issued by Bonus/Referral on their own hooks
Reward later: CampaignManager may orchestrate grant after COMPLETED
```

**Soft delete:** `deleteCampaign` = `disableCampaign` (`enabled=false`). History kept.

**Config JSONB (extensible):** `conditions`, `reward`, `game`, `limits`, `progress`, future `segmentation`.

---

## 6. Participation lifecycle

Canonical field: **`status`**. Booleans (`qualified`, `reward_granted`, `completed`) are derived helpers.

```
AVAILABLE          createParticipation / REGISTER / LOGIN
    ↓
QUALIFIED          DEPOSIT (progress < 100%)
    ↓
ACTIVE             BET_SETTLED (progress < 100%)
    ↓
COMPLETED          progress ratio ≥ 1.0  or  BONUS_COMPLETED
                   (REWARDED flag also set for ACTIVE/COMPLETED paths)

EXPIRED            BONUS_EXPIRED / expireParticipation
CANCELLED          admin / future cancel API
```

| Status | Typical trigger |
|---|---|
| `AVAILABLE` | First touch / register |
| `QUALIFIED` | Deposit toward campaign |
| `REWARDED` | Reserved (flag path when reward_id set; full grant still external) |
| `ACTIVE` | Betting / wager progress |
| `COMPLETED` | Target reached or bonus finished |
| `EXPIRED` | Campaign/bonus expiry event |
| `CANCELLED` | Explicit cancel |

Terminal: `COMPLETED` \| `EXPIRED` \| `CANCELLED` — further events skipped (except expire/complete handlers).

---

## 7. Future extensions (plug-in points)

| Feature | Plug into | Avoid |
|---|---|---|
| VIP / country / affiliate / A/B / manual targeting | `RuleEvaluator._passes_segmentation` + `config.segmentation` | Editing every `on_*` hook |
| Promo codes | New campaign `type` + trigger; redemption → `handleEvent` | New parallel engine |
| Cashback / missions | `ProgressTracker` metrics + `config.progress` | Hardcoding in PromotionManager |
| Leaderboards / tournaments | Separate domain; report progress via `handleEvent` or write participations | Forking CampaignManager API |
| Real rule engine | `RuleEvaluator._evaluate_conditions` | Conditions inside BonusManager |
| Campaign-driven grants | After status→COMPLETED, call Bonus/Referral from PromotionManager | Grants inside CampaignManager SQL |

**Stable API surface to keep:**  
`handleEvent`, `getAvailableCampaigns`, `getUserCampaigns`, `getCampaignProgress`, `createCampaign`.

---

## Quick file map

| Path | Role |
|---|---|
| `database/campaign.py` | Domain + CampaignManager + evaluator + progress + schema |
| `database/campaign_test.py` | Infrastructure / event / player API tests |
| `promo/promo_manager.py` | Rewards + `_track_campaign_event` |
| `main.py` | `ensure_campaign_schema()` on startup |

---

*Campaign Engine = observation + organization today. Reward authority remains BonusManager / ReferralManager until an explicit migration.*
