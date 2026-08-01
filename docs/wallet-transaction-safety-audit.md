# Wallet Transaction-Safety Audit (pre-change)

**Date:** 2026-07-27  
**Goal:** No concurrent balance corruption. Correctness over micro-optimizations.

---

## 1. Every balance mutation site

| # | Location | Fields | Lock today? | Mutation style | Unsafe? |
|---|---|---|---|---|---|
| 1 | `database/wallet.py` `updateRealBalance` | real | caller-dependent | absolute SET | **YES** — lost update if unlocked |
| 2 | `database/wallet.py` `updateBonusBalance` | bonus | caller-dependent | absolute SET | **YES** |
| 3 | `database/wallet.py` `updatePendingBalance` | pending | caller-dependent | relative `+=` | Better, but pending col missing in DB |
| 4 | `payments/deposit.py` `completeDeposit` | real (+ bonus via promo) | deposit row only | absolute SET | **YES — P0** |
| 5 | `payments/withdraw.py` `createWithdrawRequest` | real + pending | wallet FOR UPDATE | absolute real SET + pending += | Partially fixed; bugs remain |
| 6 | `payments/withdraw.py` `rejectWithdraw` | pending | none | broken `WalletManager()` / set 0 | **YES** |
| 7 | `payments/withdraw.py` `approveWithdraw` | real | lock after payout | absolute SET **after** on-chain | **YES — P0** double-debit vs hold |
| 8 | `games/game_manager.py` `_debit`/`_credit` | real or bonus | `lock_wallet` (Dice/Plinko) | absolute SET | Safer with lock; still absolute |
| 9 | `games/crash/crash_game.py` `_debit_real`/`_credit_real` | real | **NO** | absolute SET | **YES — P0** |
| 10 | `database/bonus.py` grant | bonus | none (inside caller TX) | absolute SET | **YES** if no wallet lock |
| 11 | `database/bonus.py` unlock | bonus + real | none | two absolute SETs | **YES** split update |
| 12 | `database/bonus.py` expire/forfeit | bonus | none | absolute SET | **YES** if unlocked |
| 13 | `database/referral.py` FTD bounty | real | none | absolute SET | **YES** |
| 14 | `database/referral.py` claim | real | none | absolute SET | **YES** |

**Not found as live writers:** cashback grant path, promo grant path, admin balance edit (no direct wallet mutate).

---

## 2. Why each critical path is unsafe (before fix)

### Deposit
Locks deposit, then `getRealBalance` + `UPDATE real_balance = :after` without wallet `FOR UPDATE`. Concurrent Dice debit can overwrite deposit credit (or vice versa).

### Withdraw create (current partial attempt)
Locks wallet and tries to move real→pending, but:
- `_checkWitdrawExist` operator precedence is broken (`and`/`or`) and is called without required args.
- `pending_balance` column **does not exist** in PostgreSQL yet → create will fail or was never tested.
- Still uses absolute `updateRealBalance`.
- No partial unique index on PENDING/PROCESSING.

### Withdraw approve
Still pays BlockBee **then** debits `real_balance`. If create already held funds in pending, approve would **double-charge** real. If hold failed, old spend-then-approve race remains.

### Reject
`WalletManager()` without `user_id`; sets pending to `0` instead of releasing the reserved amount back to real.

### Crash
No `lock_wallet`; absolute RMW. Concurrent with Dice/deposit → lost update.

### Bonus unlock
Two separate absolute updates (bonus then real) — not one atomic multi-field UPDATE (though same TX + lock would help).

---

## 3. Standard to implement

```
BEGIN
  SELECT wallet FOR UPDATE
  Validate
  UPDATE wallet SET
    real_balance = real_balance + :real_delta,
    bonus_balance = bonus_balance + :bonus_delta,
    pending_balance = pending_balance + :pending_delta
    WHERE id = :wallet_id
      AND real_balance + :real_delta >= 0
      AND bonus_balance + :bonus_delta >= 0
      AND pending_balance + :pending_delta >= 0
  INSERT ledger
COMMIT
```

One SQL statement for multi-field moves (e.g. unlock, withdraw hold).

---

## 4. Implementation plan (this task)

1. Add `pending_balance` column + CHECKs + withdraw partial unique index.  
2. `WalletManager.apply_balance_deltas` + `lock_wallet` in `wallet.py`.  
3. Rewire deposit, withdraw (hold model), game_manager, crash, bonus, referral.  
4. Crash: lock wallet on bet/cashout; recover Pending on boot; document single-worker.  
5. Bonus: keep existing idempotency; ensure grants run only under locked wallet.
