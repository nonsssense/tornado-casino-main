# Wallet Transaction Safety — Implementation Report

**Pre-change audit:** `docs/wallet-transaction-safety-audit.md`  
**Date:** 2026-07-27

---

## 1. Files changed

| File | Change |
|---|---|
| `database/wallet.py` | `ensure_wallet_schema`, `lock_wallet`, `apply_balance_deltas` (single relative UPDATE); absolute setters wrap deltas |
| `database/dice_db.py` | Re-exports `lock_wallet` from wallet (canonical) |
| `payments/deposit.py` | Lock wallet after deposit lock; credit via `apply_balance_deltas` |
| `payments/withdraw.py` | Hold model: real→pending at create; reject releases; approve clears pending only (no second real debit); unique active withdraw |
| `games/game_manager.py` | `_debit` / `_credit` use locked relative deltas |
| `games/crash/crash_game.py` | Lock wallet on bet/cashout; relative deltas; advisory singleton lock; boot refund of unresolved Pending crash bets |
| `database/bonus.py` | Grant / unlock / expire / forfeit use lock + relative deltas; unlock is one multi-field UPDATE |
| `database/referral.py` | Bounty/claim lock wallet; atomic FTD qualify; claim locks profile |
| `main.py` | `ensure_wallet_schema()` on startup |
| `docs/wallet-transaction-safety-audit.md` | Pre-change audit |
| `docs/wallet-transaction-safety-report.md` | This report |

---

## 2. Race conditions fixed — why each is now impossible

### Deposit credit vs live bets (P0)
**Was unsafe:** deposit row locked, wallet absolute SET unlocked → lost update.  
**Now:** same TX: lock deposit → `lock_wallet` → `real_balance = real_balance + amount` with non-neg WHERE. Concurrent Dice/Crash writers block on the same wallet row until commit. **Impossible** to overwrite each other’s absolute snapshot.

### Withdraw spend-then-approve (P0)
**Was unsafe:** PENDING did not reserve; approve paid on-chain then debited real.  
**Now:** create does `real -= amount, pending += amount` under `FOR UPDATE`. Games debit only `real_balance`, so reserved funds cannot be spent. Approve only clears `pending`. **Impossible** to spend held funds in games after create.

### Parallel PENDING withdraws (P0)
**Was unsafe:** unlocked check-then-insert.  
**Now:** wallet lock + `_has_active_withdraw` + `pending_balance > 0` guard + partial unique index `withdraws_one_active_per_user`. Second insert fails uniqueness. **Impossible** to have two active PENDING/PROCESSING rows per user.

### Crash ↔ Dice lost update (P0)
**Was unsafe:** Crash absolute RMW without lock.  
**Now:** Crash place/cashout `lock_wallet` + relative delta (same as Dice/Plinko). Serializes with all other wallet writers. **Impossible** for Crash and Dice to apply absolute SETs on stale reads.

### Reject / approve hold bugs
**Was unsafe:** `WalletManager()` without user_id; approve double-debited real after hold.  
**Now:** reject releases `pending → real` under lock; approve never touches real again. FX/BlockBee failure before chain releases hold.

### Bonus unlock split update
**Was unsafe:** two absolute SETs.  
**Now:** one `UPDATE` with `bonus_delta` and `real_delta` together.

### Referral FTD double-qualify / claim race
**Was unsafe:** non-atomic qualify; unlocked claim.  
**Now:** `UPDATE … WHERE qualified_at IS NULL`; claim `FOR UPDATE` on profile + wallet lock + relative credit.

### Crash restart orphan debits
**Was unsafe:** in-memory bets lost on restart; stake gone.  
**Now:** on loop start, refund DB Pending crash bets to REAL and mark `Refund`.  
**Remaining architecture limit:** live round still in RAM (documented); multi-worker blocked by advisory lock.

---

## 3. Standard mutation flow (enforced)

```
BEGIN
  SELECT wallet FOR UPDATE          -- lock_wallet()
  validate
  UPDATE wallet SET
    real_balance = real_balance + :real_delta,
    bonus_balance = bonus_balance + :bonus_delta,
    pending_balance = pending_balance + :pending_delta
  WHERE id = :wallet_id
    AND all resulting balances >= 0
  RETURNING …
  INSERT ledger
COMMIT
```

DB protections added:
- `pending_balance` column
- `CHECK (real_balance >= 0)`, `bonus_balance >= 0`, `pending_balance >= 0`
- `UNIQUE (user_id) WHERE status IN ('PENDING','PROCESSING')` on withdraws  
(Existing `UNIQUE(user_id)` on wallet kept.)

---

## 4. Bonus integrity (verified / tightened)

| Source | Idempotency |
|---|---|
| Deposit tiers | `ONCE_ONLY_SOURCES` + `hasReceivedSource` + createInstance skip |
| Deposit webhook | status + uuid + deposit `FOR UPDATE` (unchanged, still good) |
| Referral FTD | atomic `qualified_at IS NULL` |
| Referral bounty | after successful qualify only; daily cap |
| Freebet / welcome / promo / cashback | still source-level createInstance rules; **still lack product caps** (economy abuse, not wallet race) — wait until those APIs ship |

---

## 5. Remaining risks (post-MVP / accepted)

| Risk | Why deferred |
|---|---|
| Crash in-memory round state | Architecture kept; mitigated by singleton advisory lock + boot refund |
| Freebet ungoverened caps (B1 from abuse audit) | Not a concurrency bug; product fix when freebet API enabled |
| Dust tier-climbing (B3) | Economy logic, not wallet race |
| Sybil FTD farming | Business anti-abuse, not TX safety |
| On-chain paid but pending-clear fails | Extremely rare ops edge; logged FAILED for reconcile |
| `notEnoughBalance()` is HTTPException factory | Pre-existing pattern; works with `raise notEnoughBalance()` |
| Absolute `updateRealBalance` still callable | Now implemented via deltas; prefer `apply_balance_deltas` |

---

## 6. Why concurrent balance corruption is no longer possible (wallet layer)

1. **Every writer** of real/bonus/pending goes through `apply_balance_deltas` or locks then calls it.  
2. **Every path** that mutates money takes `SELECT … FOR UPDATE` on that wallet row first (deposit, withdraw, dice, plinko, crash, bonus, referral).  
3. Updates are **relative** in SQL, so even a mistaken unlocked caller cannot apply a stale absolute overwrite through the preferred API.  
4. Overdraft is rejected by `WHERE … + delta >= 0` (and CHECKs).  
5. Multi-field moves (hold, unlock) are **one statement**, so partial wallet state cannot commit.

---

## 7. Suggested manual test checklist

1. Deposit while spamming Dice bets — balance = sum of credits − stakes.  
2. Create withdraw → confirm REAL drops and pending rises → play Dice → cannot spend held amount.  
3. Reject withdraw → REAL restored, pending 0.  
4. Approve withdraw → pending cleared, REAL unchanged at approve time.  
5. Two parallel withdraw creates → one fails.  
6. Restart server with Pending crash bet → refund logged.  
7. Second uvicorn worker → Crash loop refuses (advisory lock).
