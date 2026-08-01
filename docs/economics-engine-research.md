# Casino Economics Engine — Technical Design Research

**Document type:** Architecture & product-economics research  
**Audience:** Backend architects, product, finance, risk  
**Scope:** Promotion, bonus, referral, and affiliate systems  
**Constraint:** Design principles and industry mathematics only — no code, no schemas, no implementation recipes  
**Status:** Foundation specification for a flexible Promotion Engine  

---

## Executive Summary

Professional iGaming platforms do not treat bonuses, referrals, and affiliates as separate products. They treat them as **economic instruments** that create, transform, and settle **liability** against player activity.

Three truths dominate industry architecture:

1. **Liability must be priced before it is granted.** Every promotion has an expected cost. If you cannot estimate EV at grant time, you cannot control margin.
2. **Rules must be data, not code.** Platforms that hardcode promotion logic cannot iterate. SOFTSWISS (Bonus API + Motion), EveryMatrix (detached BonusEngine), Affilka/NetRefer/Income Access all converge on: *configurable instruments + immutable grant snapshots + generic settlement engines*.
3. **Variance allocation is a business decision.** Crypto casinos (Stake, Rollbit, BC.Game, Gamdom) often pay partners on **theoretical house edge / EV**, not realized NGR, because crypto volume + bonuses + jackpots make realized P&L too noisy. Traditional iGaming still defaults to **NGR RevShare** with explicit negative-carryover policy.

**MVP design thesis:** Build one **Promotion Engine** that understands *offers → grants → wallets/ledgers → contribution → conversion → settlement → expiry*. Deposit bonuses, cashback, referrals, affiliates, free spins, missions, and tournaments are **configurations of the same economic primitives**, not separate systems.

---

## Industry Context (Why These Systems Exist)

| Actor type | Examples | Economic role |
|---|---|---|
| Crypto casinos | Stake, BC.Game, Rollbit, Shuffle, Gamdom, Roobet, Duelbits | High volume, fast settlement, often house-edge / EV commission, aggressive VIP & referral |
| Platform providers | SOFTSWISS, EveryMatrix | Bonus engines, PAM, wallet, CRM automation, API-driven personalization |
| Game studios | Pragmatic Play (and peers) | Free spins / tournament integrations; contribution & eligibility constraints |
| Affiliate platforms | NetRefer, Income Access, Affilka | CPA / RevShare / Hybrid, NGR formulas, settlement, partner portals |

**Why promotions exist (business):**

- **Acquisition:** CAC often exceeds first-deposit margin; bonuses buy first session and learning curve.
- **Activation:** Depositors who do not bet churn; free spins / free bets force product discovery.
- **Retention:** Cashback, reload, VIP, missions reduce churn of high-LTV players.
- **Acquisition channel economics:** Affiliates and referrals are paid distribution; their commission model must match traffic quality and variance tolerance.
- **Competitive signaling:** Crypto brands compete on visible generosity (rakeback, referral %, VIP). The math must still leave house edge intact after all givebacks.

**Why constraints exist (mathematics):**

House edge alone does **not** protect you if players can:

- clear bonuses on low-edge games,
- bet oversized to convert bonus into cash with low variance,
- multi-account farm FTDs for CPA / referral,
- withdraw principal while keeping bonus EV,
- force you to pay partners on unprofitable cohorts.

Every “annoying” bonus parameter below exists to close one of these holes.

---

# SECTION 1 — Deposit Bonus Mathematics

A deposit bonus is not “free money.” It is a **contingent liability** whose expected cost is:

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

Rough operator intuition used industry-wide:

```
Clearance EV for skilled player ≈
  BonusValue
  − (EffectiveWagering × HouseEdge)
  − friction(max_bet, expiry, contribution)
  capped by MaxCashout
```

If EffectiveWagering × HouseEdge > BonusValue (and no cashout cap), the bonus is **negative EV** for the player and cheap for the house — marketing theater.  
If the reverse, the bonus is a real cost center and attracts hunters.

UKGC now caps wagering at **10×** in that market (2026), which is a structural reminder: **wagering is a regulated economic lever**, not only a product knob.

---

## 1.1 Bonus Percentage

| Aspect | Detail |
|---|---|
| **Controls** | Match rate on deposit (e.g. 100% → deposit $100 → bonus $100). |
| **Why exposed** | Marketing headline; competitive comparison; segment differentiation (welcome vs reload). |
| **Financial impact** | Linear in grant size. Doubling % doubles liability before caps. |
| **Abuse** | High % + low wagering = positive EV farm. |
| **Math** | `bonus = min(deposit × pct, max_bonus)` subject to min/max deposit gates. |
| **Industry defaults** | Welcome: 50–200% (crypto often higher headline). Reload: 25–100%. |
| **Configurable?** | **Yes — always.** Core commercial lever. |

---

## 1.2 Maximum Bonus Amount

| Aspect | Detail |
|---|---|
| **Controls** | Hard ceiling on grant regardless of deposit size. |
| **Why** | Caps whale liability; prevents $100k deposit → $100k bonus disasters. |
| **Financial impact** | Truncates right-tail cost. Dominant risk control for high rollers. |
| **Abuse** | Without max, large deposits amplify bonus EV. |
| **Defaults** | Welcome often $100–$5,000 depending on brand tier; crypto can be higher with tighter wagering. |
| **Configurable?** | **Yes — mandatory.** |

---

## 1.3 Minimum Deposit

| Aspect | Detail |
|---|---|
| **Controls** | Smallest deposit that qualifies. |
| **Why** | Filters dust accounts; ensures KYC/payment cost << bonus cost; raises quality of FTD for CPA. |
| **Financial impact** | Reduces micro-abuse; may reduce conversion of low-intent players. |
| **Abuse** | Tiny deposits + multi-accounts to farm bonuses / referral CPA. |
| **Defaults** | $10–$20 common; crypto sometimes lower ($1–$5) which increases abuse surface. |
| **Configurable?** | **Yes.** |

---

## 1.4 Maximum Deposit (for bonus eligibility)

| Aspect | Detail |
|---|---|
| **Controls** | Upper deposit bound that still earns bonus (distinct from max bonus). |
| **Why** | Sometimes used to exclude whales from mass offers (VIP handled separately). |
| **Financial impact** | Segments product: mass promo vs VIP desk. |
| **Abuse** | Less about abuse, more about offer design. |
| **Configurable?** | Optional but useful. |

---

## 1.5 Wager Multiplier

| Aspect | Detail |
|---|---|
| **Controls** | How many times the wager base must be turned over before conversion/withdrawal. |
| **Why** | Primary EV throttle. Forces exposure to house edge. |
| **Financial impact** | Expected house take ≈ `wager_target × edge × contribution_adjusted`. Higher multiplier → lower player EV → lower operator cost (until offer stops converting). |
| **Abuse** | Low multiplier + high RTP games = bleed. |
| **Defaults** | Offshore/crypto: often 30–60×. Player-friendly: 20–35×. Regulated UK: ≤10×. |
| **Configurable?** | **Yes — primary.** |

**Math consequence:**  
`required_turnover = wager_base × multiplier`  
Effective clearance cost rises inversely with contribution rate (see §1.11).

---

## 1.6 Wager Base (Bonus-only vs Deposit+Bonus)

| Aspect | Detail |
|---|---|
| **Controls** | What the multiplier multiplies. |
| **Why** | Quietly doubles (or more) real difficulty without changing headline “35×”. |
| **Financial impact** | `deposit+bonus` at 100% match ≈ **2×** turnover of bonus-only. Huge EV reduction. |
| **Abuse** | Players misread “35×” and accept worse deals — dispute risk if unclear. |
| **Defaults** | Both common; transparent operators state base explicitly. |
| **Configurable?** | **Yes — critical.** |

Example: $100 deposit, 100% bonus, 35×  
- Bonus-only: $3,500 turnover  
- D+B: $7,000 turnover  

Same marketing number, double economic burden.

---

## 1.7 Max Cashout

| Aspect | Detail |
|---|---|
| **Controls** | Cap on withdrawable winnings from bonus-derived funds. |
| **Why** | Bounds liability when variance goes against the house (esp. free spins / no-deposit). |
| **Financial impact** | Truncates player upside; makes rare jackpot-on-bonus survivable. |
| **Abuse** | Without cap, one lucky run converts cheap bonus into large cash liability. |
| **Defaults** | No-deposit / free spins: often 5–50× bonus or fixed $50–$500. Deposit match: sometimes uncapped or high cap. |
| **Configurable?** | **Yes — especially for free / high-variance instruments.** |

---

## 1.8 Max Bet While Wagering

| Aspect | Detail |
|---|---|
| **Controls** | Maximum stake per bet/spin while bonus active. |
| **Why** | Prevents “one-spin clearance” and low-sample variance extraction. |
| **Financial impact** | Forces many independent trials → law of large numbers → house edge realizes. |
| **Abuse** | Oversized bets on bonus funds can convert EV into cash with high success probability in short run. |
| **Defaults** | Classic fiat: ~€/$5. Crypto: often % of bonus or absolute crypto equivalent. Industry guidance: ~10–15% of bonus as softer rule of thumb for design, but absolute caps remain common. |
| **Configurable?** | **Yes — mandatory anti-abuse.** Violation typically voids bonus + winnings. |

---

## 1.9 Expiration

| Aspect | Detail |
|---|---|
| **Controls** | Time window to clear wagering / claim / convert. |
| **Why** | Limits open liability duration; creates urgency; reduces long-lived accounting debt. |
| **Financial impact** | Shorter expiry → more forfeiture → lower realized cost, but worse UX and complaints. |
| **Abuse** | Long windows allow patient hunters and slow arbitrage. |
| **Defaults** | 7 days common; 14 generous; 30 for VIP/reload. Claim windows sometimes shorter than clear windows. |
| **Configurable?** | **Yes.** Separate *claim expiry* vs *wagering expiry* vs *converted-funds expiry* if needed. |

---

## 1.10 Auto-Claim vs Manual Claim vs Opt-Out

| Mode | Why it exists | Economics / ops |
|---|---|---|
| **Auto-claim** | Maximizes take-rate of offer; reduces friction. | Higher liability realization; players may feel “tricked” if sticky. |
| **Manual claim** | Informed consent; regulatory friendliness; opt-in hygiene. | Lower take-rate; better dispute posture. |
| **Opt-out** | Lets engaged players refuse bad EV offers. | Reduces forced sticky lock-in; improves trust; may lower bonus cost. |

**Configurable?** Yes. Regulated markets lean opt-in/manual. Crypto often auto with forfeit-on-withdraw semantics.

---

## 1.11 Bonus Priority / Real Balance Priority / Spend Order

| Policy | Meaning | Why |
|---|---|---|
| **Real-first (non-sticky / parachute)** | Cash spends before bonus; bonus activates when cash hits ~0. | Protects deposit; player can withdraw cash winnings by forfeiting bonus. |
| **Bonus-first** | Bonus depletes first. | Faster bonus burn; different EV path. |
| **Proportional / merged (sticky)** | Combined pot; withdrawal blocked until wagering done. | Locks deposit behind wagering wall. |

**Financial impact:** Sticky + (D+B) wagering is the most house-protective common structure and the most player-hostile. Non-sticky is friendlier and still controllable via wagering, max bet, contribution, cashout caps.

**Industry note:** Crypto brands vary; traditional operators often use non-sticky with forfeit. Product choice is brand positioning as much as math.

**Configurable?** **Yes — fundamental instrument type.**

---

## 1.12 Game Contribution Weighting

| Aspect | Detail |
|---|---|
| **Controls** | Fraction of each bet that counts toward wagering (slots 100%, blackjack 5–10%, etc.). |
| **Why** | Low-edge games can clear bonuses with tiny expected loss. Contribution restores house EV. |
| **Math** | `progress += stake × contribution_rate`  
`effective_turnover_needed = required_turnover / contribution_rate` |
| **Defaults** | Slots ~100%; roulette ~10–20%; blackjack/video poker ~0–10%; some originals/high RTP excluded. |
| **Abuse** | Weighting gaps (game misclassified) are classic hunter exploits. |
| **Configurable?** | **Yes — by category and by title.** Must be snapshot at grant. |

---

## 1.13 Excluded Games

Absolute 0% contribution or hard block while bonus active. Used for:

- high RTP / low variance titles,
- games with bonus buy features that distort bet sizing,
- provider titles with free-spin conflicts,
- crash / dice / originals where edge is known and farmable.

**Configurable?** Yes. Exclusion lists change often → must be versioned.

---

## 1.14 Loss Contribution

Some cashback / wagering systems credit **net losses** rather than turnover.

| Aspect | Detail |
|---|---|
| **Controls** | Whether progress tracks stakes, settled losses, or both. |
| **Why** | Cashback is loss-based by nature; some “wagering” variants use net loss to prevent churning without risk. |
| **Abuse** | Pure turnover can be gamed with hedged / near-certain bets; loss-based resists that. |
| **Configurable?** | Yes for cashback-like instruments; usually no for classic deposit match (turnover is standard). |

---

## 1.15 Conversion Rules / Partial Conversion / Progressive Unlock

| Rule | Meaning | Why |
|---|---|---|
| **All-or-nothing conversion** | Bonus becomes cash only when full wagering met. | Simple accounting; common. |
| **Partial conversion** | Pro-rata unlock as wagering progresses. | Better UX; more complex ledger; can increase early withdrawal leakage. |
| **Progressive unlock** | Milestones (25/50/75/100%) unlock fractions. | Retention mechanic; reduces cliff frustration. |
| **Winnings-only conversion** | Sticky: bonus principal never withdrawable; only surplus above bonus may cash out. | Classic sticky math: `withdrawable = max(0, balance − bonus_principal)`. |

**Math consequence of sticky principal handling:**  
Player ending at $380 after $200 sticky bonus withdraws $180. Grinding slowly can produce **negative net vs deposit** even after “successful” play — intentional house protection.

---

## 1.16 Sticky vs Non-Sticky (Deep Dive)

| | Sticky | Non-sticky |
|---|---|---|
| Balance model | Merged / locked | Separate cash + bonus |
| Withdraw before clear | No (or only after forfeit of everything associated) | Yes on cash (forfeit bonus) |
| Player risk | Deposit trapped | Deposit protected |
| Operator liability profile | Lower player EV, higher dispute risk | Higher player EV optionality, lower lock-in |
| Marketing | Looks bigger / simpler | Requires education |

**Recommendation for modern crypto MVP:** Prefer **non-sticky** with clear forfeit, strong max-bet, contribution, and cashout controls. Sticky is a blunt instrument that damages trust and support load. Use sticky only for specific high-match VIP instruments if ever.

---

## 1.17 Principal Handling & Surplus Handling

After successful wagering:

1. **Principal (deposit):** always cash (unless sticky locked it).  
2. **Bonus principal:** either converts to cash (cashable/non-sticky cleared) or is deducted (sticky).  
3. **Surplus (winnings above principal):** subject to max cashout; remainder forfeited or moved to bonus void.

**Expired balance handling (industry patterns):**

- Forfeit remaining bonus + associated winnings.
- Convert unused portion to zero; keep real cash.
- Rare: convert remainder to low-value locked funds (bad practice — accounting mess).

**Configurable?** Policy enums: `on_expiry`, `on_forfeit`, `on_withdraw_request`, `on_violation`.

---

## 1.18 Parameter Configurability Verdict

| Parameter | Configurable? | Snapshot at grant? |
|---|---|---|
| %, min/max deposit, max bonus | Yes | Yes |
| wager multiplier & base | Yes | Yes |
| max bet / max cashout / expiry | Yes | Yes |
| sticky policy / spend order | Yes | Yes |
| contribution & exclusions | Yes | Yes (critical) |
| conversion / unlock schedule | Yes | Yes |
| claim mode | Yes | Yes |
| house edge of games | Usually from game catalog, not promo | Catalog version referenced |
| wallet double-entry mechanics | No — engine invariant | N/A |

---

# SECTION 2 — Referral Program Mathematics

Distinguish carefully:

| Program | Who | Typical crypto pattern |
|---|---|---|
| **Player referral** | User invites friend | Lifetime % of house edge / wager commission (Stake ~10% of edge; Gamdom 10–20% of edge; BC.Game wager-% + VIP transfer bounties) |
| **Affiliate** | Commercial partner | CPA / NGR RevShare / Hybrid via Affilka-class platforms |

They share attribution infrastructure but **different risk, KYC, contracts, and settlement**.

---

## 2.1 Lifetime Attribution

**What:** First-touch referrer owns the player forever (common in crypto).  
**Why:** Simple; strong incentive to recruit.  
**Math:** Creates **perpetual liability** = `Σ_t commission_rate_t × commission_base_t`.  
**Trade-off:** Lifetime is generous; without quality gates, you pay forever on bonus-abusing cohorts.  
**Alternative:** Time-boxed attribution (12–24 months) — rare in crypto, common in some traditional deals.

**MVP recommendation:** Lifetime for player referral, but commission base must be **edge-based or NGR-after-bonus**, never raw deposits.

---

## 2.2 FTD Qualification

**What:** Referral reward starts (or unlocks) only after First Time Deposit.  
**Why:** Filters fake signups; aligns with acquisition value.  
**Math:** Without FTD gate, referral farming of empty accounts costs support/infra with zero GGR.  
**Configurable:** Min FTD amount, payment method quality, KYC completed.

---

## 2.3 Referral Qualification Beyond FTD

Common additional gates:

- minimum real-money wager (not bonus wager),
- cooling period,
- same IP / device / payment fingerprint exclusion,
- geo eligibility,
- referrer account age / wager history (anti-self-referral rings).

**Why:** FTD alone is gamed by deposit-withdraw cycles and multi-accounting.

---

## 2.4 Real Wager vs Bonus Wager

| Base | Meaning | Consequence |
|---|---|---|
| All wager | Includes bonus-funded bets | You pay commission on activity you subsidized |
| Real-money wager only | Excludes bonus stakes | Correct for margin |
| Edge on real wager | Theoretical EV share | Crypto-standard, stable |

**Industry crypto standard:** Commission on **house edge of eligible real wagers** (or close variants). Paying on bonus wager is an accounting self-own.

---

## 2.5 Revenue Share Calculation (Referral)

Three mathematical families:

### A) Theoretical Edge Share (crypto-native)

```
commission = Σ (stake × house_edge × referrer_rate)
```

Example: stake $1,000, edge 2%, rate 10% → $2.

**Pros:** No negative carryover; predictable operator cost as % of theoretical win.  
**Cons:** Game-mix risk on partner; must maintain accurate edge table; player wins do not reduce commission (operator keeps variance).

Used conceptually by Stake/Rollbit/Gamdom-style programs.

### B) Realized NGR Share

```
NGR = GGR − bonuses − fees − …  
commission = NGR × rate
```

**Pros:** Aligns with profit.  
**Cons:** Variance, disputes, NCO politics — usually overkill for *player* referral.

### C) Flat bounty

```
pay $X on qualified FTD / VIP transfer
```

BC.Game-style VIP transfer bounties (up to large fixed amounts) are acquisition CPA dressed as referral.

---

## 2.6 Payout Timing — Batch vs Real-Time

| Mode | Why | Trade-offs |
|---|---|---|
| **Real-time / near-real-time accrual** | Dopamine; crypto UX | Harder fraud reversal; ledger noise |
| **Daily batch** | Balance UX and ops | Good MVP default |
| **Weekly / monthly settlement** | Affiliate-grade controls | Too slow for consumer referral UX |

**Recommendation:** Accrue continuously (visible balance), **settle/claim** on schedule with clawback window for fraud.

---

## 2.7 Tier Progression & Retroactive Tiers

| Policy | Meaning | Math |
|---|---|---|
| Prospective tiers | Higher rate applies to future activity only | Predictable liability |
| Retroactive tiers | Higher rate reapplies to past period | Exploding liability; affiliate-friendly, operator-dangerous |
| Volume tiers by FTDs / wager | BC.Game-like FTD ladders for affiliates | Encourages quality volume |

**MVP:** Prospective only. Retroactive is a contract feature for strategic affiliates, not player referral.

---

## 2.8 Referral Abuse, Self-Play, Fraud

Primary attack graph:

1. Self-referral (same person two accounts).  
2. Collusive rings (shared devices, VPN farms).  
3. Bonus-funded wager loops generating edge commission.  
4. Deposit-min + withdraw to trigger FTD bounties.  
5. Referrer incentivizing friends with off-platform kickbacks + bonus stacking.

**Controls (product-level, not implementation):**

- device / payment / KYC graph exclusion,
- real-wager thresholds before accrual,
- exclude bonus stakes from commission base,
- commission delay / hold,
- lifetime caps per referrer early on,
- geo + velocity rules.

---

## 2.9 Long-Term Liability

Lifetime edge share is a **liability annuity**. Finance must model:

```
Referral_LTV_cost ≈ LTV_wager × avg_edge × rate × survival
```

If VIP rakeback + referral + affiliate can stack on the same wager, **total giveback** can exceed sustainable margin. Architecture must define **stacking / priority / exclusion** between:

- player rakeback,
- referrer commission,
- affiliate commission.

**Industry pattern:** Usually affiliate XOR player-referral attribution (one owner). Rakeback may still stack on player side — must be deducted from NGR/EV base when paying B2B affiliates.

---

# SECTION 3 — Affiliate Program

Professional affiliate economics (NetRefer, Income Access, Affilka, Scaleo-class thinking):

## 3.1 CPA

**Definition:** Fixed payout per qualified acquisition (usually FTD, sometimes FTD + wager).  

**Why:** Paid media needs predictable cashflow. Operator buys players at known CAC.

**Math:**

```
CPA_ROI = Player_LTV_NGR − CPA − bonus_cost − payment_cost − fraud_cost
```

**Risk:** Paying CPA on bonus abusers / one-deposit churners.  
**Mitigation:** Qualification (min deposit, min wager, KYC, no multi-account), delayed CPA, clawbacks.

**Industry standard:** Yes, especially for media buyers. Rates vary wildly by geo and vertical.

---

## 3.2 RevShare

**Definition:** Ongoing % of revenue from referred players.

**Bases:**

| Base | Operator view | Affiliate view |
|---|---|---|
| **GGR** | Expensive; ignores bonus/tax/fees | Attractive, simple |
| **NGR** | Industry default for traditional | Must trust deductions |
| **House edge / EV** | Crypto-friendly; variance retained by operator | Stable income; game-mix risk |

**Standard RevShare rates (traditional):** ~25–45% of NGR; median often ~30–35% in operator data discussions.  
**Crypto:** Published rates vary; negotiation common (Stake-like opacity vs BC.Game published tiers).

---

## 3.3 Hybrid

**Definition:** Reduced CPA + reduced RevShare.

**Why:** New programs with unknown traffic quality; influencers with spiky campaigns; affiliates needing cashflow + upside.

**Industry standard:** Strong default for launching programs.

---

## 3.4 GGR vs NGR (Deep)

```
GGR = stakes − winnings
NGR = GGR − bonuses − taxes − PSP fees − chargebacks − jackpot contributions − (sometimes) provider fees
```

NGR can be **30–65% lower** than GGR depending on bonus intensity and jurisdiction.  
Headline “35% RevShare” on NGR may equal ~15–20% of GGR effectively.

**Operator recommendation:** Pay on **NGR or EV**, never raw GGR, unless rate is drastically lower and deductions are impossible to define (early crypto MVPs sometimes use edge share instead).

---

## 3.5 Negative Carry-Over (NCO)

| Policy | Meaning | Who likes it |
|---|---|---|
| **NCO on** | Negative month carries as deficit against future commissions | Operators with jackpot variance |
| **No NCO** | Month resets to zero; operator absorbs negative | Affiliates (recruitment magnet) |
| **Capped NCO** | Carry 1–2 periods then reset | Compromise |
| **Per-player NCO** | One whale does not infect whole portfolio | Fairness upgrade |

**Industry reality:** NCO is the #1 affiliate complaint. Crypto brands often advertise **no NCO** or avoid it structurally via edge models (Rollbit-style per-bet edge share cannot go negative the same way).

**MVP recommendation:**

- Player referral: edge model → NCO irrelevant.  
- B2B affiliates: start **No NCO** or capped NCO to recruit; move to stricter terms only with premium partners and clear reporting.

---

## 3.6 Lifetime Attribution & Revenue Delay

- **Lifetime** common in iGaming affiliates.  
- **Revenue delay / hold:** 7–30 days to allow chargebacks, bonus abuse review, KYC fails.  
- **Settlement periods:** weekly (crypto) to monthly (traditional).  

---

## 3.7 Partner Obligations & Liabilities

Typical contract economics (conceptual):

- no incentivized traffic without disclosure,
- no brand bidding,
- fraud / multi-accounting clawbacks,
- creative compliance,
- geo restrictions,
- sub-affiliate visibility (SubIDs),
- right to change unpublished rates with notice for future players (not always past).

**Partner liability:** Usually limited to traffic quality; operator carries game variance unless EV model shifts risk.

---

## 3.8 What Is Industry Standard?

| Decision | Standard |
|---|---|
| RevShare base | NGR (traditional); edge/EV (many crypto) |
| CPA | Common for paid traffic |
| Hybrid | Common launch default |
| Lifetime | Common |
| NCO | Contested; disclose clearly |
| Transparent deductions | Required for trust |
| Player referral ≠ affiliate | Separate products, shared attribution service |

---

# SECTION 4 — Promotion Engine Architecture

## 4.1 Design Goal

Support today’s and tomorrow’s promotions **without changing backend business logic**:

Deposit / reload / cashback / VIP / referral / affiliate / promo codes / free bets / free spins / daily-weekly rewards / seasonal / missions / tournaments / unknown future.

## 4.2 Core Insight from Industry Platforms

| Platform pattern | Lesson |
|---|---|
| EveryMatrix BonusEngine detached from PAM | Bonus logic is its own domain; wallet is a dependency |
| SOFTSWISS Bonus API + Motion (trigger → condition → action) | CRM launches promotions as configuration + automation, not deploys |
| Affilka / NetRefer / Income Access | Settlement & partner rules are configuration + reporting |
| Pragmatic free spins | External award instruments need adapters, same grant lifecycle |

**Architectural principle:**  
Separate **Offer Catalog** (what can be given) from **Grant Lifecycle** (what was given) from **Settlement** (how value moves) from **Eligibility Automation** (who gets offered).

---

## 4.3 Economic Primitives (The Only Backend Concepts)

A flexible engine needs a small set of primitives. New promotion types are **compositions**, not new engines.

### Primitive A — Instrument Types

Logical award classes:

1. **Bonus Money** (wagering-bound balance)  
2. **Cash Credit** (real balance, possibly with mild restrictions)  
3. **Free Spins / Free Bets** (provider-linked or internal)  
4. **Cashback Accrual** (period loss → payout)  
5. **Commission Accrual** (referral/affiliate)  
6. **Points / XP / Mission Progress** (non-cash, convertible by rules)  
7. **Tournament Score** (competitive ranking → prize pool)  
8. **Entitlement** (fee skip, higher limits, VIP flag)

### Primitive B — Offer

A versioned commercial product definition: eligibility, schedule, caps, instrument template, stacking rules, budget.

### Primitive C — Grant (Instance)

An immutable snapshot of rules applied to a specific player at claim/award time + mutable progress state (wagering remaining, spins left, status).

### Primitive D — Contribution Event

Normalized gameplay/payment events that update grant progress or commission bases.

### Primitive E — Settlement Action

Ledger movements: convert, expire, forfeit, pay commission, unlock cashout, award prize.

### Primitive F — Attribution Edge

Who owns a player for referral/affiliate purposes (exclusive owner recommended).

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

Missions and tournaments use the same spine: grant = enrollment; contribution = qualified actions; settlement = reward table.

---

## 4.5 How Future Promotions Fit Without New Logic

| Future idea | Composition |
|---|---|
| “Deposit 3 days in a row” | Mission progress instrument + cash/bonus settlement |
| “Wager $10k this week for raffle ticket” | Mission + lottery entitlement |
| “Lossback 10% on crash only” | Cashback accrual filtered by game tag |
| “Streamer drop codes” | Promo code offer → free spins grant |
| “Dynamic personalized match %” | Offer template + eligibility service supplies parameters into snapshot |

Backend logic stays: eligibility → grant → contribute → settle.  
Product changes stay: offer configuration + reward tables.

---

## 4.6 Stacking, Priority, Exclusion

EveryMatrix emphasizes **dependency and exclusion logic** between bonus programs. This is mandatory.

Engine must support declarative rules such as:

- welcome XOR reload,
- max one active wagering bonus,
- cashback stacks with VIP rakeback or not,
- affiliate-attributed players excluded from referral,
- promo code cannot combine with welcome package,
- priority order when multiple cashbacks exist.

**Why:** Uncontrolled stacking is how total giveback exceeds house edge.

---

## 4.7 Budgets & Kill Switches

Professional systems treat promotions as **budgeted campaigns**:

- global budget,
- per-segment budget,
- per-player cap,
- daily issuance cap,
- auto-disable on budget exhaustion,
- manual kill switch without redeploy.

This is how product experiments stay safe.

---

## 4.8 Recommended Logical Architecture (Conceptual Layers)

1. **Catalog & Configuration Layer** — offers, templates, schedules, A/B variants  
2. **Decision / Eligibility Layer** — who qualifies (can be rules + CRM triggers)  
3. **Grant & Snapshot Layer** — immutable commercial terms per award  
4. **Wallet / Ledger Layer** — balances and accounting (PAM concern)  
5. **Contribution Pipeline** — bets, deposits, losses → progress  
6. **Settlement Engine** — conversions, payouts, expiries, forfeits  
7. **Partner Economics Layer** — referral/affiliate accrual & statements  
8. **Risk / Abuse Layer** — velocity, graphs, void reasons  
9. **Reporting / Liability Layer** — outstanding bonus liability, accrued commissions  

No layer should hardcode “welcome bonus math.” Welcome bonus is an offer template using Bonus Money + wagering settlement policy.

---

# SECTION 5 — Configuration System

## 5.1 What Belongs in Configuration

Anything a product manager or CRM marketer changes weekly:

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

Rarely changed; correctness-critical:

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

**Industry + regulatory answer:** Once a player has opted in / deposited expecting a bonus / commenced play, terms must not change for that grant.

UKGC unfair-terms guidance is explicit: operators must not vary or discontinue a promotion for consumers who already opted in / deposited / started play, except for fraud prevention.

**Therefore professional platforms snapshot:**

- all numeric terms,
- contribution map version,
- conversion policy,
- max bet / cashout,
- expiry timestamps,
- T&Cs document version hash,
- currency & FX policy used at grant.

Active grants **keep original rules** after catalog edits. Catalog edits affect **future grants only**.

This is also why silent T&C edits are an industry trust problem: without snapshots, disputes are unwinnable.

---

## 5.4 Rule Versioning Model (Conceptual)

1. **Offer Template vN** — editable draft.  
2. **Published Offer Version** — immutable commercial revision.  
3. **Grant Snapshot** — copy of published version (+ resolved personalized params).  
4. **Catalog references** — game contribution set version ID stored on snapshot.

**Can you “hotfix” an active grant?**  
Only via explicit **migration policy**: player consent, or fraud void, or beneficial change with audit. Never silent tightening.

---

## 5.5 Configuration vs Personalization

SOFTSWISS Bonus API pattern: back-office defaults + API-driven personalized awards.

Clean split:

- **Template** defines allowed parameter ranges and instrument type.  
- **Decisioning** (CRM/Motion-like) picks eligible players and may fill parameters within ranges.  
- **Engine** validates ranges, snapshots, grants.

This prevents CRM from inventing unsafe instruments outside risk bounds.

---

# SECTION 6 — Mathematical Liability by Promotion Type

Risk scale: **L** low / **M** medium / **H** high / **C** critical  

| Type | Expected cost driver | EV character | Liability shape | Abuse potential | Risk | Ops complexity |
|---|---|---|---|---|---|---|
| Deposit match | Grant × clearance rate × (1 − house take on wagering) | Tunable via wagering/caps | Open bonus balances + potential cashout | H | H | M |
| Reload | Same, smaller, repeat | Usually lower than welcome | Recurring | M | M | M |
| Cashback | % of net losses in period | Often negative EV for player if wagered; positive if cash | Accrued payable | M (multi-account loss shaping) | M | M |
| VIP bonus | Discretionary / tier tables | Relationship cost | Negotiated | L–M | M | H (human) |
| Player referral | Edge × rate × lifetime wager | Annuity | Perpetual accrued commissions | H (rings) | H | M |
| Affiliate CPA | Flat × qualified FTD | CAC | Near-term payable | H | H | M |
| Affiliate RevShare | % NGR/EV lifetime | Profit share | Long-tail | M–H | H | H |
| Promo codes | Same as underlying instrument | Depends | Campaign-capped | H (leakage) | M | L–M |
| Free bets | Stake not returned; winnings may be bonus | Sports matched-betting sensitive | Short | H | H | M |
| Free spins | Spins × stake × RTP path + wagering on wins | High variance | Short + wagering tail | H | H | M (provider) |
| Daily/weekly rewards | Calendar grant value | Habit loop | Predictable if capped | M | L–M | L |
| Seasonal | Campaign budget | Marketing | Budget-capped | M | M | M |
| Missions | Reward table × completion rate | Controlled | Low if rewards small | M | L–M | M |
| Tournaments | Prize pool (+ fee opt.) | Pool is hard cap | Prize pool liability | M (collusion) | M | H |

### Operator cost heuristics

**Deposit bonus (simplified):**

```
E[cost] ≈ P(clear) × E[converted_value | clear] + P(forfeit) × 0
         + support/fraud overhead
```

With strong wagering, many players forfeit → marketing cost << face value.

**Edge referral:**

```
E[cost]/wagered = house_edge × referrer_rate
```

If edge 2% and rate 10%, referral costs **0.2% of turnover** — easy to budget, dangerous if stacked with 10% rakeback + 25% affiliate EV share on same base without exclusions.

**Cashback:**

```
E[cost] ≈ cashback_rate × E[net_losses_eligible]
```

Ironically, cashback cost rises when players lose — it cushions churn but pays out in losing cohorts. Cap per period.

**Free spins:**

```
E[cost] ≈ spins × bet × (1 − RTP)   // theoretical
+ wagering conversion leakage on wins
+ jackpot tail if not excluded
```

Max cashout is essential.

---

# SECTION 7 — Flexibility & Rapid Experimentation

## 7.1 What Product Managers Must Do Without Deploys

Industry CRM/bonus tooling exists specifically so marketers can:

1. **Launch** — publish offer version + schedule.  
2. **Modify** — new version for future players; never mutate active grants.  
3. **Disable** — stop eligibility; existing grants continue under snapshot.  
4. **Schedule** — start/end windows, dayparting, timezone.  
5. **A/B test** — multiple offer variants with allocation weights; measure FTD, clearance, NGR, bonus cost, retention.  
6. **Expire** — natural end + budget kill.  
7. **Reuse templates** — clone welcome → geo variant → VIP variant.

SOFTSWISS Motion’s mental model is the right product abstraction: **Trigger → Condition → Action**.

---

## 7.2 Experimentation Guardrails

Without guardrails, flexibility becomes unlimited liability:

- parameter bounds on templates (max match %, min wagering, max cashout required),
- mandatory risk review above thresholds,
- budget hard stops,
- automatic anomaly detection (clearance rate spike, multi-account cluster),
- holdouts for causal measurement,
- finance dashboard: granted vs converted vs expired vs outstanding liability.

---

## 7.3 Template Library (MVP Product Surface)

Suggested first-class templates (configuration only):

1. Deposit Match (sticky/non-sticky variants)  
2. Reload Match  
3. Loss Cashback  
4. Promo Code → Bonus / Spins  
5. Free Spins Pack  
6. Daily Login Reward  
7. Wager Mission  
8. Player Referral Edge Share  
9. Affiliate CPA / RevShare / Hybrid (admin, not player CRM)

Tournaments can wait until contribution + leaderboard settlement is stable.

---

# SECTION 8 — Final Recommendations

## 8.1 Major Design Decisions

### Decision 1 — One Promotion Engine, Many Templates

| | |
|---|---|
| **Why** | Avoid N parallel bonus systems that diverge mathematically. |
| **Alternatives** | Separate bonus / referral / affiliate micro-products. |
| **Trade-offs** | Upfront abstraction cost vs long-term speed. |
| **Industry** | EveryMatrix single BonusEngine; SOFTSWISS unified bonus + automation. |
| **MVP** | One engine + 5–8 templates. |
| **Scale** | Add adapters (provider free spins, sports free bets) without new cores. |

### Decision 2 — Immutable Grant Snapshots

| | |
|---|---|
| **Why** | Correctness, disputes, regulated fairness norms, audit. |
| **Alternatives** | Live-bind to latest offer config (dangerous). |
| **Trade-offs** | Storage/version complexity vs legal/financial safety. |
| **Industry** | Standard practice; UKGC forbids harmful mid-flight changes. |
| **MVP** | Snapshot all commercial fields at grant. |
| **Scale** | Add T&Cs hash, contribution set versions, migration workflows. |

### Decision 3 — Non-Sticky Default for Deposit Bonuses

| | |
|---|---|
| **Why** | Better trust; still fully controllable via wagering/ caps / contribution. |
| **Alternatives** | Sticky merged balance. |
| **Trade-offs** | Slightly higher player optionality EV vs lower support load. |
| **Industry** | Both exist; player advocates strongly prefer non-sticky. |
| **MVP** | Non-sticky + forfeit on withdraw. |
| **Scale** | Optional sticky template for specific campaigns if needed. |

### Decision 4 — Player Referral on Theoretical Edge, Not NGR

| | |
|---|---|
| **Why** | Crypto-native predictability; no NCO drama; easy liability forecasting. |
| **Alternatives** | NGR share; flat FTD bounty only. |
| **Trade-offs** | Operator keeps variance; must maintain edge tables; game-mix matters. |
| **Industry** | Stake/Rollbit/Gamdom-style patterns. |
| **MVP** | Edge share + real-wager-only + FTD gate + fraud holds. |
| **Scale** | Tiered rates, category edge overrides, caps. |

### Decision 5 — Affiliates as Separate Commercial Layer

| | |
|---|---|
| **Why** | Contracts, CPA clawbacks, NGR definitions, portals differ from consumer referral. |
| **Alternatives** | One “partners” system for all. |
| **Trade-offs** | Extra product surface vs cleaner risk boundaries. |
| **Industry** | Affilka/NetRefer/Income Access exist because this is a domain. |
| **MVP** | Manual/hybrid deals + shared attribution; simple RevShare-on-EV or CPA. |
| **Scale** | Partner portal, SubIDs, automated statements, NCO policies. |

### Decision 6 — NGR/EV Base for B2B; Never Pay on Bonus Wager

| | |
|---|---|
| **Why** | Prevent paying partners for activity you subsidized. |
| **Alternatives** | GGR simplicity. |
| **Trade-offs** | Deduction transparency burden. |
| **Industry** | NGR standard; EV rising in crypto. |
| **MVP** | Define deduction policy in writing on day one. |
| **Scale** | Per-partner deduction overrides. |

### Decision 7 — Configuration-First, Code-Rare

| | |
|---|---|
| **Why** | MVP will change weekly; deploys cannot be the release train for promos. |
| **Alternatives** | Hardcoded campaigns. |
| **Trade-offs** | Need a safe rules/template system early. |
| **Industry** | Motion / Bonus API / BonusEngine back-offices. |
| **MVP** | Templates + versioned offers + eligibility rules + budgets. |
| **Scale** | CRM triggers, no-code automation, personalization API. |

### Decision 8 — Explicit Stacking Graph

| | |
|---|---|
| **Why** | Total giveback must remain < sustainable edge after all programs. |
| **Alternatives** | Ad-hoc exclusions in each feature. |
| **Trade-offs** | Requires product discipline. |
| **Industry** | Dependency/exclusion logic called out by EveryMatrix. |
| **MVP** | Global mutexes: one active wagering bonus; exclusive attribution owner. |
| **Scale** | Full boolean dependency graph per segment. |

### Decision 9 — Optimize for Flexibility & Correctness, Not Micro-Perf

| | |
|---|---|
| **Why** | Your stated MVP reality. Wrong economics cost more than slow queries. |
| **Alternatives** | Premature event-sourcing complexity. |
| **Trade-offs** | May refactor settlement throughput later. |
| **Industry** | Modular monolith first (SOFTSWISS narrative): extract hot paths later. |
| **MVP** | Clear ledgers + snapshots + batch settlement OK. |
| **Scale** | Split contribution pipeline / tournament services when load demands. |

---

## 8.2 MVP Economics Policy Pack (Recommended Starting Point)

**Deposit welcome**

- Non-sticky  
- 50–100% match  
- Max bonus hard cap  
- Wagering 30–40× **bonus only** (transparent)  
- Max bet low absolute  
- Slots 100%; table/originals heavily reduced or excluded  
- Expiry 7–14 days  
- Manual or explicit opt-in claim  
- Max cashout optional but recommended for first iteration  

**Player referral**

- Lifetime attribution  
- Commission = % of theoretical edge on **real-money** eligible wagers  
- FTD + minimum real wager qualification  
- Daily accrual, claim with delay  
- Fraud graph checks  
- No commission on bonus stakes  

**Affiliate (early)**

- Hybrid or pure EV-RevShare  
- No NCO initially  
- Clear deduction list  
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

1. Product can launch a new campaign in hours from templates.  
2. Finance can explain outstanding promotional liability daily.  
3. Risk can void grants with reason codes without engineering.  
4. Changing wagering from 35× to 40× never alters in-flight grants.  
5. Referral + affiliate + rakeback stacking is intentionally designed, not accidental.  
6. A/B tests attribute bonus cost to incremental NGR, not vanity claim rates.  
7. New instrument (e.g., seasonal mission) ships as configuration + maybe a small settlement strategy plugin — not a new microservice estate.

---

## 8.4 Explicit Non-Goals (For Now)

- Full Affilka-competitive partner portal  
- Multi-brand enterprise bonus federation  
- Real-time millisecond contribution at global scale  
- Fully no-code expression language for arbitrary math  
- Retroactive tier upgrades  

These are scale features. The primitives above make them additive later.

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

1. What instrument is granted?  
2. What is the grant-time EV / expected cost?  
3. What is the worst-case liability (uncapped jackpot path)?  
4. What abuse graph does this open?  
5. What is snapshotted?  
6. What does it stack with?  
7. What budget kills it?  
8. How does finance see outstanding liability?  
9. Can PM launch/disable without deploy?  
10. Does total giveback still leave margin after edge?

If any answer is unknown, the promotion is not ready — regardless of marketing urgency.

---

*End of document.*
