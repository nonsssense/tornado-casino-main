# Tornado MVP Economics — Final Launch Specification

**Role of this document:** Lead Product Architect brief to finalize economics before launch  
**Objective:** Validate the business hypothesis as fast as possible  
**Constraint:** Extend what exists — do not redesign backend, do not replace `BonusManager` / `ReferralManager`  
**Codebase baseline:** Dual REAL/BONUS wallet · first-3 deposit bonuses · referral attribution only · admin withdraw queue · Dice / Crash / Plinko  

---

## 1. Executive Summary

### What you already have (strengths)

| Area | Reality | Why it matters for launch |
|---|---|---|
| Dual wallet | `real_balance` + `bonus_balance` + tagged transactions | Correct non-sticky foundation — keep it |
| Deposit bonuses | Tiers 1–3 live end-to-end | Do not rebuild — tune numbers + close gaps |
| Bonus instances | `principal`, `wager_*`, `max_bet`, `max_win_cap`, status | Already a grant snapshot — expand this |
| Referral attribution | Write-once `referrer_id` + invite row + Bronze profile | Solid spine — add settlement only |
| Payments | BlockBee deposit → REAL + bonus grant; withdraw approval | Ops-safe enough for MVP |
| Bet limits | Centralized in `config.py` | Good risk floor |

### What is missing for launch (weaknesses)

| Gap | Impact |
|---|---|
| Referral RevShare never pays | Growth channel is decorative |
| No FTD / real-wager qualification | Cannot safely pay referrals |
| No max bonus / min deposit for match | Whale and dust abuse risk |
| Crash catalog-eligible but REAL-only | Broken UX promise |
| Admin finance/bonus/referral mostly TODO | You will fly blind |
| Bonus constants hardcoded in `bonus.py` | Marketing changes = code deploy |
| `edge_basis` stored but unused | Needed for referral math |
| Forfeit/opt-out not exposed | Players trapped; support load |
| Expire burns entire `bonus_balance` | Dangerous if multiple instruments later |

### Launch thesis (one sentence)

**Keep the current bonus + wallet architecture, retune numbers for low first-deposit friction in the Kazakhstan Telegram market, wire edge-based customer-referral settlement onto `ReferralManager`, keep Affiliate as a separate commercial product, move offer numbers and per-game edges into config, and give the admin bot a daily P&L / risk dashboard.**

Do not build Affilka-class partner portals, VIP, cashback automation, or a generic rule language before first revenue. Do not reuse customer-referral tiers for affiliates.

### Assumption revisions (re-evaluated)

| Previous assumption | Problem | Revised premise |
|---|---|---|
| Min deposit **$10** for welcome + FTD | Too high friction for an unknown Telegram crypto brand in Kazakhstan; slows hypothesis validation | Prefer **$5** (range $3–$5 analysed below) |
| Single global house edge **≈ 2.5%** | Dice is ~2.5%, but Crash is ~3% and Plinko spans ~2.5–4.0% by risk/rows | **Per-game configurable edge**; planning blend ≈ **3–3.5%** |
| One progression table for “referrals” | Mixes viral player invites with B2B traffic partners | **Customer Referral** and **Affiliate** are separate products |

---

## 2. Bonus Economics

### 2.1 Current implementation (baseline)

| Parameter | Live today |
|---|---|
| Structure | First 3 deposits: **50% / 75% / 150%** |
| Wager | **50× bonus principal** (bonus-only base) |
| Expiry | **5 days** |
| Max bet | `min(2% of principal, $2.50)` |
| Max win (profit cap) | **$50 absolute** |
| Sticky | **Non-sticky balances**; unlock moves **up to principal** BONUS→REAL |
| Spend order | Prefer BONUS when eligible |
| Contribution | 100% of BONUS stakes only; REAL does not progress wagering |
| Eligible | Dice ✓ · Plinko low ✓ · Crash listed but not playable on BONUS |
| Welcome / reload / cashback | Methods exist, **not granted** |

### 2.2 Mathematical health check (per-game edge, not one global %)

**Do not plan bonuses or commissions on a single universal house edge.**  
Current project surfaces (approximate theoretical / structural edges):

| Game | Edge source in product | Approx. house edge |
|---|---|---|
| Dice | payout factor `97.5 / chance` | **~2.5%** |
| Crash | instant-bust `300 / 10000` | **~3.0%** |
| Plinko | multiplier tables by risk × rows | **~2.5%–4.0%** (low often ~2.5–3.7%; high often ~3.0–4.0%) |

For **rough clearance planning** when game mix is unknown, use a **blend of ~3.0–3.5%**, not 2.5%.  
For **settlement**, always use the **configured edge of the game (and risk mode) that was played**.

Clearance cost approximation (planning blend 3.5%):

```
E[house take on clear] ≈ wager_target × game_edge
wager_target = bonus_principal × wager_multiplier
# planning example with 40× and 3.5% blend:
# E[take] ≈ principal × 40 × 0.035 = principal × 1.40
```

| Deposit | Match | Bonus | Wager target (40×) | E[house @ 2.5%] | E[house @ 3.5%] | Notes |
|---|---|---|---|---|---|---|
| $20 | 50% | $10 | $400 | $10.00 | $14.00 | Higher edge → more house-safe than old 2.5% model |
| $20 | 75% | $15 | $600 | $15.00 | $21.00 | Same |
| $20 | 100% | $20 | $800 | $20.00 | $28.00 | Same |
| $5 | 50% | $2.50 | $100 | $2.50 | $3.50 | Low min deposit → tiny liability per grant |

\*Ignoring max-win cap, expiry forfeiture, and game mix. **Max win $50** truncates upside — critical protection.

**Verdict:** Structure remains house-safe. At **3–3.5%** blended edge, the previous **40×** wagering is **more** house-protective than under the old 2.5% assumption — so **keeping 40×** is still justified (no need to raise it for “math purity”). Problems to fix remain operational (eligibility honesty, caps, opt-out, Crash catalog mismatch).

### 2.3 Minimum deposit — economic trade-off analysis

**Question:** Is **$10** too aggressive for an unknown Telegram crypto casino targeting Kazakhstan?

**Context:** MVP priority is **first-deposit friction** and **hypothesis validation**, not theoretical CAC optimisation. Local purchasing power and crypto onboarding friction matter more than offshore “industry defaults.”

| Min deposit | Acquisition effect | Abuse / cost effect | Ops effect |
|---|---|---|---|
| **$10** | Higher intent FTD; fewer deposits; slower learning | Stronger dust filter; expensive to farm FTDs for referral bounties | Fewer tiny payments; cleaner cohorts |
| **$5** | Materially lower friction; more FTDs; faster validation | Farming still costs $5 + network; bonus principal at 50% = **$2.50** — small | Acceptable payment noise; still a real stake |
| **$3** | Lowest friction among options; max early volume | Cheapest multi-account FTD farms; bounty economics weaken; more dust wallets | More micro-deposits, support, and conversion noise |

**Math on welcome liability at 50% match (before max_bonus):**

| Min dep | Grant principal | 40× wager | E[house @ 3.5%] if cleared |
|---|---|---|---|
| $3 | $1.50 | $60 | ~$2.10 |
| $5 | $2.50 | $100 | ~$3.50 |
| $10 | $5.00 | $200 | ~$7.00 |

So lowering the floor from $10 → $5 **does not** create large per-player bonus liability. The real risk is **volume of junk FTDs** and **referral bounty farming**, not the size of a single grant.

**Recommendation for MVP: `$5` minimum deposit for welcome/deposit bonuses.** (Customer Referral “qualified FTD” is set lower, at `$3` — see below.)

| Why not $10 | Why not $3 (default) |
|---|---|
| Over-optimises for quality before you have traffic; slows the only thing MVP must learn | Makes a **$1 FTD bounty** too attractive vs cost of farming; floods metrics with noise |

**If** early data shows strong farm pressure at $5, raise to $7–$10 **via config** — do not hardcode a high floor on day one.  
**If** conversion is still weak, you may test **$3** as an experiment variant (Section A/B), with FTD bounty reduced or disabled during that test.

**Customer Referral “qualified FTD” is set to `$3`** (below the $5 bonus min deposit) to maximise viral-loop qualification volume — a referred friend who deposits even $3 counts, even if that first deposit is too small to also claim the welcome bonus. **Affiliate “qualified FTD” is set to `$5`** — deliberately higher than the customer threshold to protect partner/CPA quality (see Section 3.5). These are independent config keys; the bonus min deposit remains **$5**.

### 2.4 Recommended MVP bonus package

Keep the **first-3-deposit ladder**. Do not add a separate welcome cash grant for launch (extra liability + abuse surface). Use the ladder as the welcome package.

#### Final numbers

| Parameter | MVP value | Why |
|---|---|---|
| **Welcome** | = Deposit Tier pack (no separate welcome cash) | Fastest path; already built; one abuse surface |
| **Tier 1 match** | **50%** | Keep — competitive headline without blowing CAC |
| **Tier 2 match** | **75%** | Keep — rewards second deposit (activation) |
| **Tier 3 match** | **100%** (change from 150%) | 150% is marketing sugar with high abuse magnet and support drama; 100% still strong for crypto MVP |
| **Wager multiplier** | **40×** (change from 50×) | 50× + 5 days is hostile; at **~3–3.5%** blend, 40× implies ~**120–140%** of principal in expected take if cleared — sustainable without raising the multiplier |
| **Wager base** | **Bonus principal only** (keep) | Transparent; already implemented; D+B doubles burden silently |
| **Min deposit for bonus** | **$5** | Low Telegram/KZ friction; tiny per-grant liability; better than $10 for validation; safer than $3 for bounty farming (see §2.3) |
| **Max bonus (cap)** | **$50** per tier grant | Hard whale ceiling: `$100 deposit × 50%` stops at $50; stops uncapped liability |
| **Max cashout / max win** | **$50 profit cap** (keep absolute) | Already live; binds jackpot path on bonus funds |
| **Max bet while bonus** | Keep `min(2% principal, $2.50)` | Aligns with Dice max $5 and prevents one-spin extract |
| **Expiration** | **7 days** (from 5) | Enough to clear 40× at low stakes; still short liability window |
| **Contribution** | Keep 100% BONUS stake; **eligible: Dice + Plinko low only** | Remove Crash from catalog until BONUS crash exists |
| **Sticky / non-sticky** | **Non-sticky** (keep separate balances) | Matches wallet; REAL withdrawable |
| **Bonus priority** | Prefer BONUS when active (keep) | Burns liability faster |
| **Unlock rule** | Keep: convert up to **principal** BONUS→REAL | Already sticky-like on conversion — house protective |
| **On expiry** | Burn remaining bonus funds tied to that instance (fix later if needed) | Today burns entire `bonus_balance` — acceptable only while one active deposit bonus is enforced |
| **Opt-out / forfeit** | **Expose forfeit** (API + UI): forfeit active bonus, keep REAL | Trust + regulatory hygiene; method exists, wire it |
| **Claim** | Keep auto-grant on completed deposit by index | Lowest friction for Telegram Mini App |
| **One active wagering bonus** | Enforce mutex (already mostly true via tiers) | Prevent stacking chaos |

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

Marketing cost if everyone clears perfectly is still bounded by max-win and expiry; expected house take on clearance now **exceeds** face value under the revised edge blend — **acceptable**. Real cost much lower due to expiry, max-win, and partial play. Prefer **100%** (not 150%) on tier 3 for launch to limit abuse attractiveness.

#### Example at the recommended min deposit ($5 first deposit)

| Deposit | Match | Principal | Wager | E[house @ 3.5%] |
|---|---|---|---|---|
| 1st $5 | 50% | $2.50 | $100 | ~$3.50 |

Low absolute liability — confirms that **acquisition friction**, not grant size, is the binding constraint at this floor.

#### Business impact

- Attractive: “50% / 75% / 100% on first 3 deposits” from **$5** is clear and low-friction for cold Telegram traffic.
- Sustainable: caps + 40× + max win $50 + higher realized edge bound liability.
- Editable later: move these constants and **per-game edges** to config (Section 5).

#### Implementation complexity

**Low.** Change constants in catalog / config; wire forfeit endpoint; fix Crash eligibility flag; add min deposit + max bonus in `grantDepositBonus` path.

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
| Who | Ordinary players inviting friends | Media buyers, influencers, affiliate managers, traffic partners |
| Goal | Viral engagement, social proof, cheap organic FTDs | Scalable paid / partner distribution |
| Progression | Achievable with a few friends | Volume / quality gates; negotiated or tiered on partner FTDs |
| Economics | Modest % of **per-game theoretical edge** | Higher share of edge (or later NGR); CPA / Hybrid possible |
| Product surface | In-app referral screen + `ReferralManager` | Separate partner agreement + admin deals (portal later) |
| MVP build | Extend existing `ReferralManager` | **Commercial rules in this doc**; light admin tracking first — not Affilka |

**Do not reuse Bronze/Silver/Gold player-referral thresholds for affiliates.**  
**Do not pay both programs on the same player** — exclusive attribution: affiliate XOR customer referrer.

### 3.1 Per-game house edge (foundation for both programs)

Commission and planning must read **configurable expected edge per game (and Plinko risk mode)**, never a hard-coded 2.5%.

| Key (config) | Seed | Notes |
|---|---|---|
| `game_edges.dice` | `0.025` | Matches `97.5 / chance` |
| `game_edges.crash` | `0.030` | Matches `HOUSE_EDGE / 10000` |
| `game_edges.plinko.low` | `0.030` | Flattened seed inside observed ~2.5–3.7% band |
| `game_edges.plinko.medium` | `0.030` | Flattened seed inside ~2.7–3.6% |
| `game_edges.plinko.high` | `0.035` | Flattened seed inside ~3.0–4.0% |
| `game_edges.planning_blend` | `0.035` | **Reporting / bonus EV only** — never used alone for settlement |

```
commission = Σ (real_stake × game_edge[game, risk] × partner_rate/100)
```

**Only REAL stakes.** BONUS stakes = $0 commission for both programs.

### 3.2 Current customer-referral implementation

| Piece | Status |
|---|---|
| `ReferralManager` | Profiles, keys, links, invites, `total_invites` |
| Tiers in code | Bronze **30%** / Silver **35%** / Gold **45%** stored — **never used for payout** |
| Attribution | Lifetime first-touch write-once |
| Settlement | **Missing** |
| FTD / real wager gates | **Missing** |
| User API / UI | **Missing** (mock only) |
| Affiliate product | **Not present** — must not be bolted onto the same tier table |

### 3.3 Critical interpretation of coded 30 / 35 / 45

Those rates, if kept, must mean **% of theoretical house edge on REAL eligible wagers**, not % of NGR/GGR.

| Interpretation @ $1,000 REAL wager | Cost if edge = 2.5% | Cost if edge = 3.5% | Verdict |
|---|---|---|---|
| **30% of edge** | $7.50 (0.75% TO) | $10.50 (1.05% TO) | Viable mid-tier for *player* referral (Silver) |
| 30% of GGR/NGR | Highly variable | Highly variable | Wrong for in-app player referral |

**Decision for Customer Referral:** treat `revshare_percent` as **edge share %**. Launch players at **25 / 30 / 35** (near the coded table, but capped below affiliate territory). Affiliate rates start at **40%** and go up — that is the hard commercial separation.

### 3.4 Customer Referral Program (ordinary players)

**Goal:** achievable progression, engagement, viral growth, low FTD thresholds, simple rewards.

#### Commission model

```
commission = Σ (real_stake × game_edge[game, risk] × revshare_percent/100)
```

**Only REAL balance stakes.** BONUS = $0.  
**Why:** You already subsidize bonus play; paying on it double-pays.

#### Tiers (player labels — independent of Affiliate)

| Tier | RevShare (% of edge) | Unlock condition | Why |
|---|---|---|---|
| **Bronze** | **25%** | Default on profile create | Competitive viral seed; still clearly below affiliate Starter (40%) |
| **Silver** | **30%** | **3 qualified FTDs** | Matches coded mid value; achievable after a few real friends |
| **Gold** | **35%** | **10 qualified FTDs** | Top player rate; aspirational but capped under affiliate ladder |

> Coded table was **30 / 35 / 45**. Launch uses **25 / 30 / 35** — close enough to keep the product story simple, but Gold stops at **35%** so player referral never overlaps affiliate **40%+** (see §3.5). Migrate into config; do not hardcode forever.

**Progression:** Prospective only. No retroactive backpay.  
**Why:** Retroactive tiers explode liability.

#### Qualification (customer)

| Term | MVP rule | Why |
|---|---|---|
| **Invite** | Registration with valid referral key | Already works |
| **Qualified FTD** | First completed deposit **≥ $3** + basic trust OK | Below bonus min deposit on purpose — maximises viral qualification; still a real crypto stake |
| **Commissionable wager** | REAL stake after FTD | Real economic activity |
| **Self-referral** | Same payment / device cluster → no pay | Light use of existing fraud tables |

#### Rewards (keep minimal)

| Reward | MVP | Why |
|---|---|---|
| **Referrer ongoing** | Edge share (above) | Core loop |
| **Referrer FTD bonus** | **$0.50** REAL when invitee makes qualified FTD; cap **$25/day** | Dopamine without making $3 FTD farms profitable |
| **Invitee reward** | No extra cash — deposit ladder already | Avoid stacking CAC |
| **VIP transfer bounty** | Defer | Abuse + ops |

At the **$3** customer FTD floor, the bounty **must** stay well below the deposit (a $1 bounty on a $3 FTD is farm bait) → **$0.50** with a daily cap is the safer seed (tunable via config). If farming appears, cut the bounty before raising the FTD floor — the low floor is the point.

#### Settlement (customer)

| Stage | Rule | Why |
|---|---|---|
| Accrual | On settled REAL bet (or hourly batch) | Visible progress |
| Hold | **48 hours** | Review window |
| Payout | Claim to **REAL** (min **$1**) | Existing wallet |
| Tier recount | Daily on qualified FTD count | Cheap |

#### Lifetime attribution

**Keep lifetime first-touch** for customer referral (already implemented).  
Mitigate cost via **player rates capped under affiliate** + REAL-only + per-game edges — not by cutting attribution.

#### Long-term cost model (customer)

```
Referral cost / REAL turnover ≈ game_edge × revshare
# Bronze @ 3.5% edge: 0.035 × 0.25 = 0.875% of turnover
# Gold   @ 3.5% edge: 0.035 × 0.35 = 1.225% of turnover
```

#### Implementation complexity

**Medium.** Extend `ReferralManager` only — accrual ledger, hooks after REAL bet settlement, claim, tier updater. **Do not** overload it with affiliate CPA logic.

#### Business impact

Turns dead referral UI into organic CAC for Telegram — competitive enough to motivate sharing, still cheaper than affiliate **40%+** rates.

---

### 3.5 Affiliate Program (media / influencers / partners)

**Goal:** different economics, progression, RevShare, and qualification.  
**MVP stance:** define the **commercial model and config surface** now; implement as **admin-managed partner deals** (manual or light tracking). Full partner portal = post-validation. **Architecture of BonusManager / wallet / Promotion Engine unchanged.**

#### Why not reuse customer tiers

| Customer Referral | Affiliate |
|---|---|
| 3 / 10 FTDs | Tens of FTDs / month or negotiated volume |
| **25–35% of edge** | **40 / 50 / 60% of edge** (up to **70%** for individual partnerships) |
| In-app share link | Tracked partner links / codes, SubIDs later |
| Social motivation | Revenue motivation; needs reporting trust |

#### Affiliate commission models (choose per partner)

| Model | When to use | Seed economics |
|---|---|---|
| **Edge RevShare** | Default for crypto volume partners | **40% / 50% / 60%** of per-game edge by partner tier (FTD unlock) |
| **Hybrid** | Influencers needing cashflow | **$5–$15 CPA** on qualified FTD + **25–35%** edge RevShare (lower than pure RevShare because CPA pays upfront) |
| **CPA-only** | Pure media buyers with unknown LTV | **$8–$20** per qualified FTD — only after you have LTV data; cautious at MVP |
| **Individual deal** | Strategic / exclusive partners | Negotiated up to **70%** of edge — admin override, not a public tier |

**Qualified FTD (affiliate)** — intentionally stricter than customer referral:

| Rule | Seed | Why |
|---|---|---|
| Min deposit (qualified FTD) | **$5** (edge RevShare); **$10–$15** for CPA deals | Higher than the $3 customer floor to protect partner quality; CPA needs a stricter floor because it pays upfront |
| Min REAL wager after FTD | **$20** within 7 days (for CPA fire) | Ensures activity, not deposit-withdraw |
| Hold before CPA | **7 days** | Chargeback / multi-account window |
| Negative carryover | **No NCO** on edge model (edge share cannot go negative the same way) | Simple MVP story |
| Min monthly FTDs for payout | **3** (partner-level) | Avoid paying dust partners |

#### Affiliate tiers (separate ladder — FTD unlock seeds)

| Partner tier | Edge RevShare | Typical unlock | Why |
|---|---|---|---|
| **Starter** | **40%** | Approved partner, &lt; 10 FTD / month | Entry clearly above player Gold (35%) |
| **Growth** | **50%** | **25** qualified FTDs / rolling 30 days | Mid-volume media / creators |
| **Pro** | **60%** | **75** qualified FTDs / rolling 30 days | Serious buyers; public ladder ceiling |

**Individual partnerships:** negotiate up to **70%** of edge via admin config override per partner — not a player-visible tier, not auto-unlocked by FTD count. Use for exclusive Telegram channels / strategic buyers only.

#### Cost model (affiliate)

```
# Example: $1,000 REAL wager on Crash (3% edge), Pro 60%
commission = 1000 × 0.03 × 0.60 = $18.00   # 1.8% of turnover
# Individual deal @ 70%: 1000 × 0.03 × 0.70 = $21.00
```

At **3–3.5%** edges, affiliate giveback of **40–60% of edge** costs roughly **1.2–2.1% of turnover** (up to ~**2.45%** at 70%) — aggressive but competitive for paid Telegram distribution; **do not** also stack customer referral on the same user.

#### MVP implementation depth

| Must before / at launch | Can wait |
|---|---|
| Written rule: exclusive attribution vs customer referral | Full Affilka-style portal |
| Admin ability to mark user as `affiliate_owned` and set custom rate (incl. up to **70%**) | Automated SubID reporting |
| Config seeds for partner tiers **40 / 50 / 60** | CPA automation at scale |
| Manual weekly partner settlement spreadsheet OK | Self-serve invoices |

#### Business impact

Lets you recruit Telegram influencers / buyers with **credible B2B numbers** (40–60%, up to 70% negotiated) without turning every player into an affiliate-rate partner.

---

### 3.6 Shared rules (both programs)

1. Per-game (per-risk) **configurable** edges — never one global constant in settlement.  
2. **REAL wager only.**  
3. **Exclusive attribution** — one commercial owner per player.  
4. Kill switches independent: `referral.enabled` vs `affiliate.enabled`.  
5. All rates and thresholds in **config** for rapid experimentation.

#### Implementation note

Customer path = extend `ReferralManager`.  
Affiliate path = separate partner records / admin deals (even if physically adjacent in code later). **Do not** share the same Bronze/Silver/Gold unlock thresholds.

---

## 4. Promotion Engine MVP

### 4.1 Principle

You already have a mini promotion engine:

```
Offer catalog (DEPOSIT_BONUS_OFFERS)
  → Grant (bonus_instances row)
    → Fund BONUS wallet
      → Contribution (BONUS stakes → wager_progress)
        → Unlock / Expire / Forfeit
```

**Do not invent a new microservice.** Generalize this pattern thinly.

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

Already partially stored on `bonus_instances`. **Require at grant time:**

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
| Live catalog % / days | **No** — future grants only |

**Rule:** Changing config never mutates `active` instances. Matches research + UKGC-style fairness.

### 4.5 How to introduce without rewrite

**Phase A (pre-launch, minimal):**

1. Move `DEPOSIT_BONUS_*` + offers into `config` / JSON loaded by `BonusManager.getOfferCatalog()`.  
2. On grant, copy resolved numbers into `bonus_instances` (already mostly done) + store `offer_version`.  
3. Keep all settlement code in `BonusManager`.

**Phase B (post-launch):**

1. Add `promotion_offers` table or YAML versions.  
2. CRM/admin edits create new versions.  
3. New sources call the same `grant*` path with a template id.

**Phase C (scale):**

1. Trigger → condition → action automation (SOFTSWISS Motion-like).  
2. Not needed to validate the market.

### 4.6 Versioning

```
offer_id = deposit_tier_1
offer_version = 3
grant stores offer_version=3 + numeric snapshot
```

Active players on v2 keep v2 math forever.

**Complexity:** Low–medium. Highest value per hour of eng work after referral settlement.

---

## 5. Configuration Architecture

### 5.1 Move to configuration before / at launch

| Parameter | Where it lives today | Target |
|---|---|---|
| Deposit match % per tier | `bonus.py` | Config |
| Wager multiplier | `bonus.py` | Config |
| Expiry days | `bonus.py` | Config |
| Max bonus | missing | Config |
| Min deposit for bonus | missing | Config (**seed $5**) |
| Max bet % / absolute | `bonus.py` | Config |
| Max win absolute | `bonus.py` | Config |
| Eligible games map | `bonus.py` | Config |
| Customer referral tier % | `referral.py` `refshare_table` | Config (**player seeds 25/30/35** — coded was 30/35/45) |
| Customer FTD thresholds Silver/Gold | missing | Config (**3 / 10**) |
| Customer FTD bounty $ / daily cap | missing | Config (**$0.50 / $25**) |
| Affiliate partner tier % / FTD gates | missing | **Separate** config namespace (`affiliate.*`) |
| Affiliate CPA / hybrid seeds | missing | Config (admin deals) |
| Per-game / per-risk edges for settlement | implicit / unused `edge_basis` | **Config map** (required) |
| Planning blend edge (reporting only) | missing | Config (`~0.035`) |
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
- “BONUS stakes don’t earn referral or affiliate commission” rule
- Exclusive attribution: customer referral XOR affiliate owner
- Settlement always uses per-game (per-risk) configured edge — never a single global HE constant  

### 5.3 Editable from admin bot later (not all day-one)

Safe to edit live after launch (with audit log):

- Match % / wager / expiry for **future** grants  
- Customer referral tier % and FTD thresholds  
- Affiliate partner rates (per deal)  
- Per-game edge table (with extreme caution + confirmation)  
- FTD bounty amount / caps  
- Kill switch: disable new bonus grants  
- Kill switch: freeze customer referral accruals  
- Kill switch: freeze affiliate accruals  

Never live-edit: ledger math, attribution exclusivity, snapshot fields on active grants.

### 5.4 Complexity

**Low** if you start with a single `economics_config.py` or JSON imported by `BonusManager` / `ReferralManager`. Avoid building a full CMS.

---

## Promotion Engine Future-Proofing

This section extends Section 4 (Promotion Engine MVP) and Section 5 (Configuration Architecture).  
It does **not** change BonusManager, ReferralManager, the dual wallet, or the launch economics already decided above.

**Goal:** Make the next year of promotion experiments possible through **config + thin eligibility helpers**, not backend rewrites.

Integration spine (unchanged):

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

Lightweight experiment wrapper around **offer versions**, not a parallel promotion system.  
Players still receive grants through existing `BonusManager` / referral settlement. The experiment only chooses **which published offer version** they see.

#### What should be testable (MVP-safe)

| Testable | Why | Not testable at MVP |
|---|---|---|
| Deposit match % | Highest acquisition lever | Sticky vs non-sticky (wallet rewrite) |
| Wager multiplier | Clearance vs cost trade-off | New instrument types mid-flight |
| Expiry days | Forfeiture vs UX | Ledger / spend-order changes |
| Max bonus / min deposit | Abuse vs conversion | REAL vs BONUS commission rules |
| FTD bounty amount | Referral invite motivation | Attribution model |
| Referral edge % (future cohorts only) | Growth cost | Retroactive rate changes |

#### How promotions are versioned for experiments

Reuse Section 4.6 versioning:

```
offer_id = deposit_tier_1
offer_version = A | B   (or numeric 3 / 4)
experiment_id = welcome_match_apr
variant_id = control | treatment
```

- **Control** = current published version  
- **Treatment** = alternate published version with different commercial numbers  
- Grant stores `offer_version` + optional `experiment_id` / `variant_id` on the instance snapshot  

Changing an experiment never mutates active grants.

#### Percentage rollout

| Field | MVP default | Why |
|---|---|---|
| `traffic_percent` | 10–50% into treatment | Bound risk while learning |
| Remainder | Control | Safe baseline |
| Ramp | Manual (admin / config) | No auto-optimizer needed |

Example: `control 80% / treatment 20%` on next eligible deposit-bonus grants only.

#### Player assignment

| Rule | MVP choice | Why |
|---|---|---|
| Sticky assignment | Hash(`user_id + experiment_id`) → variant | Same player always sees same variant |
| Assignment moment | First eligibility evaluation for that experiment | Avoid mid-funnel switching |
| Reassignment | Never within experiment lifetime | Clean measurement |
| Already-granted players | Excluded from new assignment | Snapshot integrity |

No ML. No multi-arm bandit. Deterministic hash is enough.

#### Experiment lifetime

| Field | Guidance |
|---|---|
| `starts_at` / `ends_at` | Hard window in config |
| Min runtime | ≥ 7 days or ≥ N FTDs (whichever first) before calling a winner |
| Max runtime | Cap (e.g. 21–30 days) so dead tests do not linger |
| Post-end behavior | New grants use winning version (or control if inconclusive) |

#### Success metrics

Track per variant (admin / simple SQL is fine):

| Metric | Why it matters |
|---|---|
| FTD rate (eligible → deposited) | Acquisition |
| Bonus grant rate / average principal | Cost exposure |
| Clearance / unlock rate | Realized liability |
| Bonus cost unlocked to REAL | Cash cost |
| Day-7 retained players | Quality, not vanity claims |
| Net deposits − withdraws (cohort) | Business truth |
| (Referral experiments) Qualified FTD / invite | Channel quality |

**Primary decision metric for deposit offers:** incremental FTDs and net deposit quality vs unlocked bonus cost.  
Do not crown a winner on claim rate alone.

#### Automatic vs manual ending

| Mode | MVP |
|---|---|
| Auto-end on `ends_at` | **Yes** — config clock |
| Auto-promote winner | **No** — manual |
| Emergency kill | **Yes** — disable treatment traffic → 100% control |
| Statistical auto-stop | Defer to scale |

Manual winner selection prevents false positives on thin Telegram volume.

#### Admin visibility

| View | Purpose |
|---|---|
| Active experiments list | What is live |
| Variant split + counts assigned | Integrity |
| Per-variant FTD / grant / unlock / cost | Decision |
| Kill treatment button | Risk |

#### Integration with existing Promotion Engine

1. Catalog already has versioned offers (Section 4).  
2. Eligibility layer picks the offer version (control/treatment) **before** `grantDepositBonus`.  
3. `BonusManager` remains unaware of experiments beyond snapshot fields.  
4. Referral experiments only affect **future** accrual rate config for newly qualified cohorts — never rewrite past commissions.

**Complexity:** Low–medium after config + `offer_version` exist.  
**Launch need:** Optional. Ship kill switches first; add A/B when you have enough FTDs to learn.

---

### 2. Segments

#### Design principle

Segments are **boolean flags / cheap derived labels** evaluated at eligibility time.  
Not a CDP. Not real-time ML. Stored as computed attributes or checked on the fly from existing tables (`users`, `deposit`, `referrals`, wallet activity).

#### Launch segment set

| Segment | Definition (MVP) | Why it exists | Typical promotions | Implement difficulty |
|---|---|---|---|---|
| **New Players** | Completed deposits = 0, or account age &lt; 7 days | Protect welcome ladder; highest CAC sensitivity | Deposit tiers 1–3 only; no reload/cashback | **Low** — deposit count exists |
| **Returning Depositors** | ≥ 1 completed deposit, active in last 14 days | Retention surface after welcome is consumed | Reload / promo codes (post-launch) | **Low** |
| **Inactive Players** | No bet/deposit in 14–30 days | Win-back without burning actives | Small reload or freebet later | **Low** — last activity timestamp |
| **Referral Players** | `users.referrer_id` is set | Measure channel; avoid double acquisition gifts | Same deposit ladder; no extra invitee cash | **Low** — already on user |
| **Organic Players** | No `referrer_id` | Baseline cohort for A/B and CAC | Same ladder; later organic-only tests | **Low** |
| **Country / Geo** | Telegram `language_code` or payment geo proxy | Regulatory / FX / abuse by region | Enable/disable offers by geo | **Low–Med** — start with language or allowlist |
| **VIP** | Manual flag or top wager percentile (defer automation) | High-touch retention | VIP bonus / higher limits later | **Low** if manual flag; **High** if auto-tier |
| **Referrers (active)** | Has ≥ 1 qualified FTD invite | Growth partners inside the product | Tier UX, bounty eligibility | **Low** once FTD logic exists |

#### What to enable at launch vs later

| At launch | Later |
|---|---|
| New Players | VIP auto-tiers |
| Referral vs Organic | Device-risk segments |
| Inactive (for kill/analytics even if no promo yet) | Value bands (whale / minnow) |
| Country allow/deny list | CRM behavioral segments |

#### Extendability

Add segments as named predicates in config:

```
segment_id = inactive_14d
rule = last_bet_at < now-14d AND deposits_completed >= 1
```

Offers reference `allowed_segments` / `denied_segments`.  
No change to wallet or grant settlement — only eligibility.

**Complexity:** Low for launch set. Keep VIP manual until volume justifies it.

---

### 3. Promotion Priority

#### Design principle

The engine must always resolve **one clear outcome** when multiple offers could apply.  
Prefer **mutex groups + simple priority integers** over a heavy rules engine.

#### Priority order (global, lowest number wins when mutex conflicts)

| Priority | Promotion family | Notes |
|---|---|---|
| 1 | **Deposit Bonus** (welcome ladder tiers) | Core acquisition — never lose to vanity promos |
| 2 | **Promo Code** (match / spins) | Overrides default only if explicitly compatible |
| 3 | **VIP Bonus** | Manual / flagged; rare |
| 4 | **Reload Bonus** | Post-welcome retention |
| 5 | **Cashback** | Period settlement; usually stacks with none of the wagering bonuses |
| 6 | **Free Spins / Freebets** | Separate instrument; may coexist if no wagering-bonus mutex |
| 7 | **Referral FTD bounty** (referrer side) | Pays referrer REAL — not a player wagering bonus |
| 8 | **Referral edge share** | Continuous accrual — not an “offer claim” |

Referral rewards are **not** competing deposit offers; they settle on a different path (`ReferralManager`) and do not consume the deposit-bonus mutex.

#### Stacking rules (MVP)

| Rule | Detail |
|---|---|
| One active **wagering bonus** | Max one `active` deposit/reload/promo wagering instance per user |
| Deposit ladder exclusivity | Only the current deposit index tier can grant |
| Cashback vs wagering | Cashback accrues on REAL net loss only; do not grant cashback while clearing a deposit bonus (defer cashback product until this is enforced) |
| Free spins | Allowed alongside REAL play; if wins create BONUS with wager, subject to one-active-wagering-bonus rule |
| Referral edge share | Always on for REAL stakes; independent of deposit bonus |
| Referral FTD bounty | Stacks with invitee’s deposit bonus (invitee cost already accepted) |

#### Mutually exclusive groups

| Mutex group | Members | Why |
|---|---|---|
| `wagering_bonus` | Deposit match, reload, promo-code bonus money, VIP bonus money | Prevent double unlock liability |
| `welcome_package` | Deposit tiers 1–3 as a package path | Already once-only sources |
| `acquisition_code` | Promo welcome codes vs default tier-1 | Avoid 50% + code 100% on same FTD |

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

\*Careful = allowed only if free-spin winnings do not create a second parallel wagering bonus while one is active (route wins into existing rules or block).

#### Implementation without rewrite

- Config: `priority`, `mutex_group`, `stacks_with[]` on each offer.  
- Eligibility helper runs **before** `BonusManager.grant*`.  
- Settlement code unchanged.

**Complexity:** Low. Most of this is already implied by once-only deposit tiers; write it down so future promos do not invent conflicts.

---

### 4. Promotion Limits

Every published offer version should support the following configurable limits.  
MVP needs only a subset enforced; the rest are fields reserved in config so you do not redesign later.

| Limit | Meaning | Why it exists | Enforce at launch? |
|---|---|---|---|
| **Start date** | Offer becomes grantable | Schedule campaigns without deploys | **Yes** (or implicit “published”) |
| **End date** | Stop new grants | Bound campaign liability | **Yes** for experiments / seasonal; deposit ladder can be open-ended |
| **Claim deadline** | Time to claim after becoming eligible | Stops zombie offers | Should (deposit auto-grant may skip) |
| **Total budget** | Max USD principal (or cost) grantable | Hard company risk cap | **Should** soon after launch |
| **Daily budget** | Max cost per UTC day | Stops one viral day from draining treasury | **Should** |
| **Maximum grants** | Global grant count cap | Inventory control for codes/spins | Yes for promo codes; optional for ladder |
| **Per-player limit** | Max grants per user for this offer | Anti-farm | **Yes** (once-only sources already) |
| **Lifetime limit** | Max across all versions of a family | Stops version-churn abuse | **Should** |
| **Per-player cooldown** | Min time between grants | Reload pacing | Later (reload product) |
| **Concurrent active cap** | Max active grants in mutex group | Equals “one wagering bonus” | **Yes** |

#### How limits interact with snapshots

- Limits gate **new grants only**.  
- Already granted instances finish under their snapshot.  
- Hitting budget mid-day → eligibility returns unavailable; admin sees “budget exhausted”.

#### Integration

```
is_within_schedule?
  → segment/conditions pass?
    → priority/mutex free?
      → budgets/counters available?
        → grant via BonusManager / referral helper
          → increment counters atomically
```

Counters can start as simple DB aggregates or a small `promotion_counters` table later — not required to relaunch wallet logic.

**Complexity:** Low for schedule + per-player once-only (mostly exists). Medium for global/daily budgets (add counters).

---

### 5. Promotion Conditions

#### Design principle

Conditions are **predicates evaluated at eligibility time**.  
They do not settle money. They only answer: *may this user receive this offer version now?*

Generic shape (config):

```
all_of: [condition...]
any_of: [condition...]   # optional, rare at MVP
not: [condition...]
```

#### Condition catalog

| Condition | MVP required? | Why | Data source today |
|---|---|---|---|
| **Minimum Deposit** | **Yes** | Quality FTD + bonus economics | Deposit amount at grant |
| **Deposit Count / Index** | **Yes** | Tier 1/2/3 ladder | `countCompletedDeposits` |
| **FTD** (is / is not first deposit) | **Yes** for referral bounty | Anti-empty-account | Completed deposits == 1 |
| **Account Age** | Should | Block instant farm alts | `users.created_at` |
| **Referral Status** (has referrer / is referrer) | **Yes** for referral products | Channel logic | `referrer_id`, invites |
| **Player Segment** | Should | Targets win-back / new | Segment helper (above) |
| **Country / Geo** | Should | Risk + compliance | Language / allowlist |
| **Real Wager** (lifetime or period ≥ X) | Later | Reload/VIP qualification | Bets aggregate |
| **Telegram Age** | Later | Weak anti-abuse signal | If exposed; else skip |
| **VIP Level** | Later | No VIP product at launch | Manual flag first |
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

**No change** to transaction posting, wallet balances, or wager progress math.

**Complexity:** Low for MVP required set — several checks already live inside BonusManager; lift them into named config conditions gradually.

---

## Promotion Engine Roadmap

Everything below preserves BonusManager, ReferralManager, and the current wallet.  
Each phase only adds config, eligibility, and counters around the existing grant/settlement spine.

### Phase 1 — MVP Launch

| Capability | Priority | Business impact | Complexity |
|---|---|---|---|
| Config-ized deposit + referral numbers | Must | Change economics without deploys | Low |
| `offer_version` snapshot on grant | Must | Safe iteration / dispute defense | Low |
| Mutex: one active wagering bonus + once-only tiers | Must | Prevent liability stacking | Low |
| Core conditions (min deposit, deposit index, referral status) | Must | Sustainable grants | Low |
| Schedule start/end for experimental offers | Should | Controlled tests | Low |
| Kill switches (bonus grants / referral accrual) | Must | Survive abuse spikes | Low |
| Segments: New / Referral / Organic (read-only ok) | Should | Analytics + future targeting | Low |
| A/B framework | Optional | Learn match % only after volume | Low–Med |

**Outcome:** Launch with tunable offers and conflict-free grants. Validate acquisition + referral hypothesis.

### Phase 2 — First Growth

| Capability | Priority | Business impact | Complexity |
|---|---|---|---|
| A/B on match % / wager / expiry with admin metrics | High | Improve CAC scientifically | Med |
| Inactive + Returning segments → first reload template | High | Retention after welcome ends | Med |
| Global + daily budgets / max grants counters | High | Hard treasury protection | Med |
| Geo allow/deny + account-age conditions | Med | Cut obvious farm geos | Low–Med |
| Promo codes as versioned offers in mutex `acquisition_code` | Med | Influencer / campaign bursts | Med |
| Compatibility matrix enforced in eligibility helper | High | Add products without panic | Low |
| Freebet grants with careful stacking rules | Med | Engagement campaigns | Med (provider/path exists) |

**Outcome:** Marketing can run campaigns and tests weekly. Bonus cost stays budget-capped.

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

**Outcome:** Promotion catalog becomes a growth platform. Still the same grant → snapshot → settle core.

#### Roadmap rule

If a Phase 3 idea requires changing wallet semantics, sticky merge, or replacing BonusManager/ReferralManager — **reject it**. Express it as a new template + conditions + limits on the current spine instead.

---

## 6. Admin Bot Improvements

Existing: role gate + **withdraw approve/reject** (working). Statistics / Players / System / Bonuses = stubs.

### 6.1 Daily Monitoring (Must)

| Feature | Why | Complexity |
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

**Do not** edit wager math from Telegram without audit + “affects future grants only” copy.

---

## 7. Referral Analytics (User App)

Show only metrics that drive sharing behavior. Avoid affiliate-portal clutter.

### Recommended UI metrics

| Metric | Show? | Why |
|---|---|---|
| **Referral link / share button** | Must | Core action |
| **Current Tier** + next tier progress (e.g. 3/5 FTDs) | Must | Progression dopamine |
| **Your RevShare %** | Must | Clarity of earn rate |
| **Qualified FTDs** | Must | Defines progression; educates quality > spam |
| **Total Invites** | Must | Vanity + social proof |
| **Today’s Earnings** | Must | Daily habit loop |
| **Pending Earnings** (in hold) | Must | Trust / reduces “where is my money?” |
| **Claimable / Claim CTA** | Must | Monetization moment |
| **Total Earnings (lifetime)** | Must | Long-term motivation |
| **Friends’ Real Wager (lifetime)** | Should | Shows engine is fair/active |
| **Conversion %** (FTD / invites) | Should | Teaches quality inviting |
| **Leaderboard position** (weekly top 10) | After launch | Competitive growth; not required to validate core loop |
| Per-friend P&L detail | Defer | Support/privacy noise |
| NGR / GGR jargon | Never in UI | Confuses players; use “earnings from friends’ play” |

### Copy guidance

- “You earn a share of the house edge on friends’ **real-money** bets.”  
- “Bonus play does not count.”  
- “Different games have different edges — your % applies to each game’s edge.”  
- “Earnings become claimable after 48 hours.”

### Complexity

**Medium frontend + thin API** on top of settlement ledger. Do not build charts for MVP — numbers + progress bar + claim button.

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

| Item | Why wait |
|---|---|
| Leaderboard | Nice growth layer, not core validation |
| Admin offer % editor | Config file edits enough at first |
| Conversion % analytics in app | After volume exists |
| Plinko edge by risk mode for referral/affiliate | Seeds exist; refine from realized hold |
| Soft fraud graph automation | Manual freeze first |
| Freebet acquisition campaigns | Bonus ladder is enough |
| Prefer-REAL client balance selector | Optional UX |

### Can wait until scale

| Item | Why |
|---|---|
| Full Promotion Engine CMS / Motion-like automation | Premature |
| Affiliate B2B portal / CPA automation at scale | Separate product; rules defined, full portal premature |
| Cashback / reload / VIP / missions / tournaments | Dilutes focus |
| Per-game contribution matrix | Not needed with narrow eligibility |
| Sticky bonuses | Opposite of current wallet |
| Retroactive tiers | Liability bomb |
| Multi-brand / enterprise PAM | Out of scope |
| Single global house edge constant for settlement | Explicitly rejected — use per-game config |

---

## 9. Future Evolution

When the hypothesis is validated (stable FTD, controlled bonus cost, referral CAC < LTV):

1. **Config UI** in admin bot for offer versions.  
2. **Reload / cashback** as new templates on same grant pipeline.  
3. **Contribution weights** if you open more games to BONUS.  
4. **Affiliate layer** as its own product (shared attribution exclusivity with customer referral).  
5. Extract hot paths only if load demands (modular monolith stays).

Always: **new promo = new template + config**, not new settlement rewrite.  
Always: **customer referral ≠ affiliate** — separate rates, FTD gates, and surfaces.

---

## Appendix A — Decision Summary (trade-offs)

| Decision | Choice | Alternative rejected | Why for MVP |
|---|---|---|---|
| Bonus architecture | Keep `BonusManager` | Rebuild engine | Already ships value |
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

If bonus cost explodes: raise wager to 45–50× or cut tier3 to 75% via **config** — no rewrite.

---

*End of MVP Economics Launch Specification.*
