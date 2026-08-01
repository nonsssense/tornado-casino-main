# Tornado — Financial Abuse Audit

**Adversary model:** bonus abuser, affiliate/referral farmer, payment fraudster, advantage player  
**Scope:** business logic, races, economy — not XSS/SQLi/CSRF unless they mint money  
**Source:** live code (wallet, deposit, withdraw, bonus, referral, promo, games, admin, config)

---

## Bottom line

The real money-loss path **today** is:

1. **Withdraw without hold** + **payout before debit**
2. Amplified by **unlocked wallet RMW** (Crash / deposit) and **parallel PENDING withdraws**

Referral/bonus abuse is mostly **Sybil economics** and **latent freebet** — deposit-bonus idempotency itself is solid.

---

## Priority counts

| Priority | Count | Meaning |
|---|---|---|
| **P0** | 6 | Fix before real volume |
| **P1** | 9 | Before referral cash-out / freebet / more promos |
| **P2** | 3 | Correctness / UX / future |

---

## Kill chain that loses money today

```
Parallel PENDING withdraw (W2)
  → spend REAL in Crash/Dice (WL1 unlocked)
  → admin approves
  → W1 pays on-chain BEFORE debit
```

Parallel path:

```
Sybil FTD farming (R1) → REAL bounty
+ dust deposits climb bonus tier index (B3)
```

---

## P0 — fix before scale

### W1 — Withdraw pays on-chain before debit

| | |
|---|---|
| **Exploit** | Create PENDING withdraw for full REAL balance, then spend/lose that balance in games. Admin approves → BlockBee payout runs **before** wallet debit. Code marks FAILED after money already left. |
| **Impact** | Direct house loss = full withdrawal amount. Comment in `approveWithdraw` acknowledges funds already sent. |
| **Likelihood** | High |
| **Evidence** | `payments/withdraw.py` — `send_payout` then later `lock_wallet` + debit |
| **Mitigation** | Reserve/debit REAL at **request** time (hold). Never call `send_payout` before reserved funds. |
| **Priority** | P0 |

### W2 — Parallel PENDING withdraws

| | |
|---|---|
| **Exploit** | Two concurrent `createWithdrawRequest` calls: pending check + balance read without `FOR UPDATE` → multiple PENDING rows up to 2× balance. |
| **Impact** | Double on-chain payout if both approved (esp. with W1). |
| **Likelihood** | High |
| **Mitigation** | Wallet `FOR UPDATE` on create; partial `UNIQUE(user_id) WHERE status IN ('PENDING','PROCESSING')`. |
| **Priority** | P0 |

### WL1 — Absolute balance SET without row lock

| | |
|---|---|
| **Exploit** | `updateRealBalance` / `updateBonusBalance` set absolute balances with no lock. Crash `_debit_real` / `_credit_real` and deposit credits skip `lock_wallet`. Concurrent Crash↔Dice/deposit → lost-update mint or wipe. |
| **Impact** | Phantom REAL credit or vanished funds. |
| **Likelihood** | High |
| **Evidence** | `database/wallet.py`; `games/crash/crash_game.py`; `payments/deposit.py` |
| **Mitigation** | All money mutations: `lock_wallet` then RMW, or relative `UPDATE … WHERE balance >= debit`. Add `CHECK (balance >= 0)`. |
| **Priority** | P0 |

### D1 — Deposit credit without wallet lock

| | |
|---|---|
| **Exploit** | `completeDeposit` locks deposit row but credits wallet unlocked — races with live bets (amplifies WL1). |
| **Impact** | Lost deposit credit or inflated REAL. |
| **Likelihood** | High |
| **Mitigation** | `lock_wallet` in same TX before credit + bonus grant. |
| **Priority** | P0 |

### CR1 — Crash state in RAM / multi-worker

| | |
|---|---|
| **Exploit** | Crash loop / `active_bets` are in-process memory. Multi-worker uvicorn or restart mid-round leaves Pending bets debited with no settlement. |
| **Impact** | Stuck stakes, failed cashouts, split truth across workers. |
| **Likelihood** | High (if >1 worker) |
| **Mitigation** | Single Crash worker or DB/Redis-backed round state; recover Pending on boot. |
| **Priority** | P0 |

### B1 — Ungoverned bonus sources (latent freebet)

| | |
|---|---|
| **Exploit** | Non-deposit grants (`freebet` / welcome / promo / cashback) create instances with `max_bet=None`, `max_win_cap=None`, empty `eligible_games` → validation treats empty as **all games allowed**. Freebet default `wager_multiplier=1`. |
| **Impact** | When freebet is wired: BONUS on Plinko HIGH uncapped, 1× unlock to REAL. |
| **Likelihood** | Med (API not passing `freebet_ticket_id` yet) |
| **Mitigation** | Never treat missing offer as unrestricted. Always set caps + eligible games + product wager on every source. Treat as **P0 before enabling freebet API**. |
| **Priority** | P0 |

---

## P1 — before referral cash-out / freebet / more promos

### B2 — Validation only on oldest active bonus

| | |
|---|---|
| **Exploit** | `validateBonusBet` / `capBonusWin` use oldest active instance; `recordWagerProgress` fills **all** actives. Mix sources → bypass younger caps. |
| **Impact** | Max-bet / game / win-cap bypass with ≥2 different sources. |
| **Likelihood** | Med |
| **Mitigation** | Validate against most restrictive of all actives. |
| **Priority** | P1 |

### B3 — Dust deposits climb bonus tier index

| | |
|---|---|
| **Exploit** | Deposits &lt; $5 skip grant but still mark `Completed` → index climbs. Two dust deposits then large deposit lands on **Tier 3 (100%)** instead of Tier 1 (50%). |
| **Impact** | Up to ~2× bonus principal on first real deposit (still capped at $50 max_bonus). |
| **Likelihood** | Med |
| **Mitigation** | Only count deposits ≥ `DEPOSIT_BONUS_MIN_DEPOSIT` toward tier index. |
| **Priority** | P1 |

### R1 — Sybil FTD farming

| | |
|---|---|
| **Exploit** | Many Telegram accounts under one invite. Each deposits ≥ $3 → $0.50 REAL bounty (cap $25/day/referrer) with **zero wager**. Spec cluster checks unwired. |
| **Impact** | Up to $25/day/referrer REAL + edge share; alts may also take deposit bonuses if ≥ $5. |
| **Likelihood** | High |
| **Mitigation** | Wire `fraud_signals` / `user_trust_score`; device/IP/payment clustering; delay bounty until REAL wager; clawback; invite/earn caps. |
| **Priority** | P1 |

### R2 — Uncapped edge accrual + FTD qualify race

| | |
|---|---|
| **Exploit** | Edge accrual has no daily/lifetime cap. Concurrent FTD qualify lacks `WHERE qualified_at IS NULL` + profile lock → double bounty possible. |
| **Impact** | Unbounded referral liability; double bounty under burst completes. |
| **Likelihood** | Med |
| **Mitigation** | Atomic qualify update; lock profile; unique bounty per `referred_id`; `max_daily_earn` + auto-freeze. |
| **Priority** | P1 |

### R3 — Claim race (latent)

| | |
|---|---|
| **Exploit** | `claim_earnings` RMW without `FOR UPDATE`. Double claim when endpoint ships. |
| **Impact** | Duplicated REAL payout. |
| **Likelihood** | Low (no claim API yet) |
| **Mitigation** | `SELECT … FOR UPDATE` before claim API. |
| **Priority** | P1 |

### FB1 — Freebet ticket consume race

| | |
|---|---|
| **Exploit** | `consumeTicket` has no `FOR UPDATE` / ownership / expiry. Concurrent play with same ticket double-settles. |
| **Impact** | Double free play + feeds B1. |
| **Likelihood** | Low until API wired |
| **Mitigation** | `UPDATE … WHERE status='available' AND user_id=:uid RETURNING`. |
| **Priority** | P1 |

### PF1 — Provably fair seed lifecycle

| | |
|---|---|
| **Exploit** | Dice/Plinko `server_seed` stored plaintext for account life; Crash seeds created once at import, never rotated/revealed. Leak → predict all future outcomes. |
| **Impact** | Full prediction until restart/rotate. |
| **Likelihood** | Med (ops leak) / catastrophic if exposed |
| **Mitigation** | Commit-hash only publicly; rotate+reveal; never return plaintext; Crash per-round seeds. |
| **Priority** | P1 |

### A1 — Single-admin irreversible payout

| | |
|---|---|
| **Exploit** | One owner/admin Telegram approves → immediate on-chain send. No dual control. |
| **Impact** | Full withdraw queue drain on compromised admin TG. |
| **Likelihood** | Med |
| **Mitigation** | Dual approval above threshold; re-confirm address; hold+balance check before payout. |
| **Priority** | P1 |

### MON1 — Investigation blind spots

| | |
|---|---|
| **Exploit** | No correlation id across deposit/bet/referral; ledger has no `UNIQUE(reference_id)`; `fraud_signals` / `user_trust_score` unused; no config audit (who/when/old/new). |
| **Impact** | Cannot investigate farms, double pays, or admin mistakes after the fact. |
| **Likelihood** | High |
| **Mitigation** | Correlation id per request; unique ledger keys; wire fraud tables; config change audit log. |
| **Priority** | P1 |

---

## P2 — correctness / UX / future

### CFG1 — max_bet &lt; BET_MIN

$5 dep × 50% → principal $2.50 → max_bet $0.05 &lt; BET_MIN $0.10 → bonus unplayable, expires/burns.  
**Fix:** `max_bet = max(computed, BET_MIN)` or raise effective min deposit.

### PR1 — Future promotion stacking

PromotionManager is thin (bonus+referral only). Before cashback/reload/VIP: mutex groups, per-user limits, budget.

### AUTH1 — Session / attribution notes

`referrer_id` write-once + same-TG self-ref blocked (good). Cookie `secure=False` → session theft → withdraw **requests** (payout still admin-gated). Multi-account Sybil remains R1.

---

## Verified NOT vulnerable

- Deposit webhook: RSA body signature + deposit `FOR UPDATE` + status/uuid gate
- Deposit bonus grant: once-only sources + `hasReceivedSource` idempotent
- Bonus unlock/expire/forfeit: `status == active` guards
- Crash listed `False` for BONUS; Crash code REAL-only
- WS Crash cashout: REST-only settle + DB pending guard (no reconnect double credit)
- Referral self-ref same TG + `createInvite` UNIQUE(`referred_id`)
- Withdraw REAL-only (bonus not directly cashable)
- Dice/Plinko paid path: wallet `FOR UPDATE` + fairness lock + atomic TX
- Plinko batch: idempotency key + wallet lock serialization

---

## Recommended fix order

1. **W1 + W2** — withdraw hold; never payout before debit; one PENDING per user  
2. **WL1 + D1** — `lock_wallet` on every REAL/BONUS mutation (Crash + deposit)  
3. **CR1** — single Crash worker or durable round state  
4. **B1** — default caps on all bonus sources before freebet  
5. **B3 + R1/R2** — tier index only for ≥min deposits; Sybil/trust before referral claims  
6. **MON1** — correlation IDs + fraud tables so farms are investigable  

---

## Coverage vs checklist

**Concrete findings:** wallet races, withdraw hold/payout order, deposit credit lock, ungoverened bonuses, tier climbing, referral Sybil/bounty/claim, freebet consume, Crash memory + wallet lock, PF seeds, admin single-click payout, config max_bet&lt;BET_MIN, monitoring gaps, future promo stacking.

**Low residual:** webhook query `user_id` not bound (address match still blocks theft); reject withdraw TOCTOU (ops integrity); instant crash is house edge not player mint; A/B/segment/budget are future-only. No infinite money loop beyond race+withdraw kill chain and Sybil bounty.
