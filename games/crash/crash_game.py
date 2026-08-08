"""Crash provably-fair manager and continuous game loop."""

from __future__ import annotations

import asyncio
import heapq
import math
import time
from typing import TypedDict

from fastapi import HTTPException

from database.bet import Bet
from database.bonus import BonusManager
from database.crash import CrashDatabase, format_crash_player_name
from database.db_config import engine
from database.transactions import TransactionManager
from database.wallet import (
    BALANCE_REAL,
    BALANCE_BONUS,
    WalletManager,
    lock_wallet,
    allocate_cash_first_stake,
    split_payout_pro_rata,
    balance_type_for_parts,
)
from exceptions import notEnoughBalance
from games.bet_limits import validate_crash_bet
from games.provably_fair import ProvablyFair
from promo.promo_manager import PromotionManager
from log_manager import log
import sqlalchemy as sa


# Soft growth curve shared with the frontend animation.
# multiplier = floor(100 * e^(GROWTH_RATE * elapsed_ms^GROWTH_POWER)) / 100
# POWER < 1 reduces late-round acceleration (Aviator-like readability).
# Provably Fair crash points are independent of this curve.
# GROWTH_RATE scaled by 1.5^GROWTH_POWER so wall-clock time to any
# multiplier is ~1.5x shorter (provably fair crash points unchanged).
GROWTH_RATE = 0.00084311
GROWTH_POWER = 0.75


class ActiveCrashBet(TypedDict, total=False):
    user_id: int
    crash_id: int
    amount: float
    bet_tx_id: int
    bet_id: int
    crash_stats_id: int
    wallet_id: int
    placed_at: float
    auto_cashout_multiplier: float | None


def normalize_auto_cashout_multiplier(value) -> float | None:
    """Optional auto-cashout target. None = disabled. Must be > 1.00x."""
    if value is None:
        return None
    try:
        multiplier = float(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid auto cashout multiplier",
        ) from exc
    if not math.isfinite(multiplier):
        raise HTTPException(
            status_code=400,
            detail="Invalid auto cashout multiplier",
        )
    if multiplier <= 1.0:
        raise HTTPException(
            status_code=400,
            detail="Auto cashout must be greater than 1.00x",
        )
    if multiplier > 1_000_000:
        raise HTTPException(
            status_code=400,
            detail="Auto cashout multiplier is too high",
        )
    # Match crash display precision (2 decimal places).
    return math.floor(multiplier * 100 + 1e-9) / 100


class CrashManager:
    """Provably Fair crash-point generation (HMAC, nonce, house edge)."""

    HOUSE_EDGE = 300
    HOUSE_EDGE_SCALE = 10000

    def __init__(self):
        self.provably_fair = ProvablyFair()

        self.server_seed = None
        self.server_seed_hash = None
        self.game_seed = None
        self.nonce = 0

        self.last_instant_crash = False
        self.last_nonce_used = None

    def createCrash(self):
        self.server_seed = self.provably_fair.generateServerSeed()
        self.server_seed_hash = self.provably_fair.getServerSeedHash(self.server_seed)
        self.game_seed = self.provably_fair.generateClientSeed()
        self.nonce = 0

    def returnGameResult(self):
        digest = self.provably_fair.getHmac(self.server_seed, self.game_seed, self.nonce)
        hmac_hex = digest.hex()

        r = int(hmac_hex[:13], 16)
        e = 2**52

        crash_multiplier = self.instantCrash(hmac_hex)

        if crash_multiplier is None:
            self.last_instant_crash = False
            multiplier = (100 * e - r) / (e - r)
            crash_multiplier = math.floor(multiplier) / 100
        else:
            self.last_instant_crash = True

        self.last_nonce_used = self.nonce
        self.nonce += 1
        return crash_multiplier

    def instantCrash(self, hmac_hex):
        instant_value = int(hmac_hex[-8:], 16)
        if instant_value % self.HOUSE_EDGE_SCALE < self.HOUSE_EDGE:
            return 1.00
        return None

    def returnGameData(self):
        return self.server_seed_hash, self.game_seed, self.nonce


class CrashGameLoop:
    """
    Owns round lifecycle, timers, active bets, and websocket broadcasts.

    Backend does NOT tick the multiplier to clients. Frontend animates from
    ROUND_START.start_time using the same growth formula. Backend is
    authoritative for start_time, crash_multiplier, and cashout checks.
    """

    BETTING_TIME = 8
    ROUND_END_DELAY = 3
    FLYING_TICK = 0.02  # short poll interval while waiting for crash_time

    STATE_BETTING = "BETTING"
    STATE_FLYING = "FLYING"
    STATE_CRASHED = "CRASHED"

    def __init__(self, crash_manager: CrashManager, ws_manager=None):
        self.manager = crash_manager
        self.ws_manager = ws_manager

        self.state = self.STATE_BETTING
        self.current_round = 0
        self.crash_id = None
        self.current_crash = None
        self.round_start_time = None
        self.betting_ends_at = None

        # Canonical runtime storage is bet_id -> bet payload.
        self.active_bets: dict[int, ActiveCrashBet] = {}
        # Secondary ownership index used for per-user limits and compatibility APIs.
        self.user_bets: dict[int, set[int]] = {}
        # Current-round settlements (cashed out / lost) for reconnect snapshots.
        # Cleared on each ROUND_OPEN. Not durable across process restart.
        self.round_settlements: dict[int, dict] = {}
        # Auto-cashout index: min-heap of (target, bet_id) + pending map for
        # O(log n) scheduling. Lazy deletion when a bet is removed manually.
        self._auto_cashout_heap: list[tuple[float, int]] = []
        self._auto_cashout_pending: dict[int, float] = {}
        # Highest multiplier fully scanned for auto cashouts this round.
        # Targets are due when watermark < target <= reached (never equality-only).
        self._auto_cashout_watermark: float = 1.0
        self.phase_ends_at = None
        self._lock = asyncio.Lock()
        self._running = False
        # True only in the process that owns the singleton advisory lock and runs
        # the authoritative round loop. HTTP bet/cashout handlers must refuse to
        # mutate financial state unless they run in THIS process (see is_loop_owner).
        self._loop_owner = False

    def set_ws_manager(self, ws_manager):
        self.ws_manager = ws_manager

    def is_loop_owner(self) -> bool:
        """Whether this process owns the authoritative in-memory Crash state.

        In a (misconfigured) multi-worker deployment only ONE process acquires the
        PostgreSQL advisory lock and runs the round loop; its in-memory active_bets
        are the only source of truth. Any other worker returns False here so its
        HTTP handlers fail closed instead of debiting wallets for bets the loop will
        never see.
        """
        return self._loop_owner

    # ------------------------------------------------------------------
    # Shared growth formula (must match frontend)
    # ------------------------------------------------------------------

    @staticmethod
    def calculate_multiplier(elapsed_seconds: float) -> float:
        elapsed_ms = max(0.0, elapsed_seconds) * 1000.0
        if elapsed_ms <= 0:
            return 1.0
        value = math.exp(GROWTH_RATE * (elapsed_ms**GROWTH_POWER))
        return max(1.0, math.floor(100 * value) / 100)

    @staticmethod
    def time_to_crash(crash_multiplier: float) -> float:
        """Seconds from takeoff until the given crash multiplier."""
        if crash_multiplier <= 1.0:
            return 0.0
        elapsed_ms = (math.log(crash_multiplier) / GROWTH_RATE) ** (1.0 / GROWTH_POWER)
        return elapsed_ms / 1000.0

    def get_current_multiplier(self) -> float:
        if self.state != self.STATE_FLYING or self.round_start_time is None:
            return 1.0
        elapsed = time.time() - self.round_start_time
        return self.calculate_multiplier(elapsed)

    # ------------------------------------------------------------------
    # Public state for REST sync
    # ------------------------------------------------------------------

    def get_state(self, viewer_user_id=None) -> dict:
        now = time.time()
        payload = {
            "state": self.state,
            "round_id": self.current_round,
            "crash_id": self.crash_id,
            "server_time": now,
            "time_left": None,
            "start_time": None,
            "phase_ends_at": None,
            "crash_multiplier": None,
            "server_seed_hash": self.manager.server_seed_hash,
            "active_bets": self._serialize_active_bets(),
            "active_bet_count": len(self.active_bets),
            "my_bets": [],
            "my_bet": None,
            "my_settled": [],
            "can_cashout": False,
        }

        if self.state == self.STATE_BETTING and self.betting_ends_at is not None:
            payload["time_left"] = max(0.0, self.betting_ends_at - now)
            payload["phase_ends_at"] = self.betting_ends_at

        if self.state == self.STATE_FLYING:
            payload["start_time"] = self.round_start_time

        if self.state == self.STATE_CRASHED:
            payload["crash_multiplier"] = self.current_crash
            payload["start_time"] = self.round_start_time
            if self.phase_ends_at is not None:
                payload["phase_ends_at"] = self.phase_ends_at

        if viewer_user_id is not None:
            mine_ids = self._get_user_bet_ids(viewer_user_id)
            my_bets = []
            for bet_id in mine_ids:
                mine = self.active_bets[bet_id]
                my_bets.append(
                    {
                        "amount": mine["amount"],
                        "bet_id": mine["bet_id"],
                        "auto_cashout_multiplier": mine.get(
                            "auto_cashout_multiplier"
                        ),
                    }
                )
            payload["my_bets"] = my_bets
            # Temporary compatibility for clients that still consume one bet.
            payload["my_bet"] = my_bets[0] if my_bets else None
            payload["my_settled"] = self._serialize_my_settled(viewer_user_id)
            payload["can_cashout"] = (
                self.state == self.STATE_FLYING and len(my_bets) > 0
            )

        return payload

    def _serialize_my_settled(self, viewer_user_id: int) -> list:
        rows = []
        for bet_id in sorted(self.round_settlements):
            row = self.round_settlements[bet_id]
            if row.get("user_id") != viewer_user_id:
                continue
            rows.append(
                {
                    "bet_id": row["bet_id"],
                    "amount": row["amount"],
                    "status": row["status"],
                    "multiplier": row.get("multiplier"),
                    "payout": row.get("payout", 0),
                    "profit": row.get("profit", 0),
                }
            )
        return rows

    def _record_settlement(
        self,
        *,
        bet_id: int,
        user_id: int,
        amount: float,
        status: str,
        multiplier: float | None,
        payout: float,
        profit: float,
    ) -> None:
        self.round_settlements[bet_id] = {
            "bet_id": bet_id,
            "user_id": user_id,
            "amount": float(amount),
            "status": status,
            "multiplier": multiplier,
            "payout": float(payout),
            "profit": float(profit),
        }

    def _serialize_active_bets(self) -> list:
        if not self.active_bets:
            return []

        user_ids = {bet["user_id"] for bet in self.active_bets.values()}
        names = CrashDatabase.get_user_display_names(user_ids)
        rows = []
        for bet_id, bet in sorted(self.active_bets.items()):
            user_id = bet["user_id"]
            # Public row: expose only display name + amount + bet_id (bet_id is a
            # per-round bet handle, not a user/account identifier). Internal
            # database user_id is intentionally NOT broadcast to other players.
            rows.append(
                {
                    "username": names.get(
                        user_id,
                        format_crash_player_name(user_id),
                    ),
                    "amount": bet["amount"],
                    "bet_id": bet_id,
                }
            )
        return rows

    def _get_user_bet_ids(self, user_id: int) -> tuple[int, ...]:
        """Return this user's active bet IDs in deterministic order."""
        return tuple(
            bet_id
            for bet_id in sorted(self.user_bets.get(user_id, set()))
            if bet_id in self.active_bets
        )

    def _remove_active_bet(self, bet_id: int) -> ActiveCrashBet | None:
        """Remove a bet from canonical storage and its ownership index."""
        bet = self.active_bets.pop(bet_id, None)
        if bet is None:
            return None

        user_id = bet["user_id"]
        owned_bets = self.user_bets.get(user_id)
        if owned_bets is not None:
            owned_bets.discard(bet_id)
            if not owned_bets:
                self.user_bets.pop(user_id, None)

        self._unregister_auto_cashout(bet_id)
        return bet

    def _clear_auto_cashouts(self) -> None:
        self._auto_cashout_heap.clear()
        self._auto_cashout_pending.clear()
        self._auto_cashout_watermark = 1.0

    def _register_auto_cashout(self, bet_id: int, target: float) -> None:
        self._auto_cashout_pending[bet_id] = target
        heapq.heappush(self._auto_cashout_heap, (target, bet_id))

    def _unregister_auto_cashout(self, bet_id: int) -> None:
        self._auto_cashout_pending.pop(bet_id, None)

    def _compact_auto_cashout_heap(self) -> None:
        """Drop stale heap entries when lazy deletions accumulate."""
        if len(self._auto_cashout_heap) <= max(8, 2 * len(self._auto_cashout_pending)):
            return
        rebuilt = [
            (target, bet_id)
            for target, bet_id in self._auto_cashout_heap
            if self._auto_cashout_pending.get(bet_id) == target
        ]
        heapq.heapify(rebuilt)
        self._auto_cashout_heap = rebuilt

    # ------------------------------------------------------------------
    # Betting / cashout (called from router)
    # ------------------------------------------------------------------

    async def place_bet(
        self,
        user_id: int,
        amount: float,
        auto_cashout_multiplier=None,
    ) -> dict:
        auto_cashout = normalize_auto_cashout_multiplier(auto_cashout_multiplier)

        async with self._lock:
            if self.state != self.STATE_BETTING:
                raise HTTPException(status_code=409, detail="Bets are closed")

            if self.crash_id is None:
                raise HTTPException(status_code=409, detail="Round not ready")
            crash_id = self.crash_id

            user_bet_ids = self._get_user_bet_ids(user_id)
            if len(user_bet_ids) >= 2:
                raise HTTPException(
                    status_code=409,
                    detail="Maximum of two active bets reached",
                )

            existing_total = sum(
                float(self.active_bets[bet_id]["amount"]) for bet_id in user_bet_ids
            )
            amount = validate_crash_bet(amount, existing_total=existing_total)

            wallet = WalletManager(user_id)
            wallet_id = wallet.ensureWallet()

            with engine.begin() as conn:
                locked = lock_wallet(conn, user_id, wallet_id)
                if locked is None:
                    raise notEnoughBalance()

                real_bal = float(locked["real_balance"] or 0)
                bonus_bal = float(locked.get("bonus_balance") or 0)
                try:
                    real_part, bonus_part = allocate_cash_first_stake(
                        real_bal, bonus_bal, amount
                    )
                except Exception:
                    raise notEnoughBalance() from None

                if bonus_part > 0:
                    try:
                        BonusManager(user_id).validateBonusBet(
                            amount, "crash", conn=conn
                        )
                    except ValueError as exc:
                        raise HTTPException(status_code=400, detail=str(exc)) from exc

                bet_tx_id, balance_type = self._debit_split(
                    conn, wallet, user_id, wallet_id, real_part, bonus_part, "crash bet"
                )

                bet_row = Bet(user_id, bet_tx_id, balance_type)
                bet_id = bet_row.createBet(
                    conn,
                    "crash",
                    amount,
                    "Pending",
                    0,
                    real_part=real_part,
                    bonus_part=bonus_part,
                )

                crash_stats_id = CrashDatabase.insert_active_bet(
                    crash_id=self.crash_id,
                    user_id=user_id,
                    bet_id=bet_id,
                    conn=conn,
                )

            self.active_bets[bet_id] = {
                "user_id": user_id,
                "crash_id": crash_id,
                "amount": float(amount),
                "real_part": float(real_part),
                "bonus_part": float(bonus_part),
                "balance_type": balance_type,
                "bet_tx_id": bet_tx_id,
                "bet_id": bet_id,
                "crash_stats_id": crash_stats_id,
                "wallet_id": wallet_id,
                "placed_at": time.time(),
                "auto_cashout_multiplier": auto_cashout,
            }
            self.user_bets.setdefault(user_id, set()).add(bet_id)
            if auto_cashout is not None:
                self._register_auto_cashout(bet_id, auto_cashout)

            names = CrashDatabase.get_user_display_names([user_id])
            username = names.get(
                user_id,
                format_crash_player_name(user_id),
            )

            log.info(
                f"Crash bet placed | round={self.current_round} | "
                f"user_id={user_id} | amount={amount} | bet_id={bet_id} | "
                f"crash_stats_id={crash_stats_id} | "
                f"auto_cashout={auto_cashout}"
            )

            await self._broadcast(
                {
                    "event": "PLAYER_BET",
                    "username": username,
                    "bet": float(amount),
                    "bet_id": bet_id,
                    "active_bet_count": len(self.active_bets),
                }
            )

            return {
                "round_id": self.current_round,
                "amount": float(amount),
                "bet_id": bet_id,
                "user_id": user_id,
                "username": username,
                "auto_cashout_multiplier": auto_cashout,
            }

    async def cashout(self, bet_id: int, user_id: int) -> dict:
        """Cash out one specific bet while verifying ownership."""
        async with self._lock:
            return await self._cashout_bet_locked(
                bet_id=bet_id,
                expected_user_id=user_id,
            )

    async def _cashout_bet_locked(
        self,
        bet_id: int,
        expected_user_id: int,
        settlement_multiplier: float | None = None,
    ) -> dict:
        if self.state != self.STATE_FLYING:
            raise HTTPException(status_code=409, detail="Round is not flying")

        bet = self.active_bets.get(bet_id)
        if bet is None:
            raise HTTPException(status_code=404, detail="No active bet")

        user_id = bet["user_id"]
        if user_id != expected_user_id:
            raise HTTPException(status_code=404, detail="No active bet")

        if bet["crash_id"] != self.crash_id:
            raise HTTPException(
                status_code=409,
                detail="Bet does not belong to the current round",
            )

        if self.round_start_time is None or self.current_crash is None:
            raise HTTPException(status_code=409, detail="Round not ready")

        if settlement_multiplier is None:
            current_multiplier = self.get_current_multiplier()
            # Manual cashout: must still be strictly before the crash point.
            if current_multiplier >= self.current_crash:
                raise HTTPException(status_code=409, detail="Already crashed")
        else:
            current_multiplier = float(settlement_multiplier)
            if not math.isfinite(current_multiplier) or current_multiplier < 1.0:
                raise HTTPException(status_code=409, detail="Invalid cashout multiplier")
            # Auto cashout may settle at exactly the crash point when the target
            # was crossed on the tick that reached the crash (range crossing).
            if current_multiplier > self.current_crash + 1e-12:
                raise HTTPException(status_code=409, detail="Already crashed")

        amount = bet["amount"]
        real_part = float(bet.get("real_part") or amount)
        bonus_part = float(bet.get("bonus_part") or 0)
        balance_type = bet.get("balance_type") or BALANCE_REAL
        payout = round(amount * current_multiplier, 2)
        profit = round(payout - amount, 2)

        wallet = WalletManager(user_id)
        with engine.begin() as conn:
            if lock_wallet(conn, user_id, bet["wallet_id"]) is None:
                raise HTTPException(status_code=409, detail="Wallet not found")
            real_credit, bonus_credit = split_payout_pro_rata(
                payout, real_part, bonus_part
            )
            win_tx_id = self._credit_split(
                conn,
                wallet,
                user_id,
                bet["wallet_id"],
                real_credit,
                bonus_credit,
                "crash win",
                stake=amount,
                bonus_part=bonus_part,
            )
            CrashDatabase.update_bet_outcome(
                bet_id=bet_id,
                result="Win",
                profit=profit,
                win_transaction_id=win_tx_id,
                conn=conn,
            )
            CrashDatabase.cashout_bet(
                crash_stats_id=bet["crash_stats_id"],
                profit=profit,
                conn=conn,
            )
            PromotionManager(user_id).on_bet_settled(
                user_id=user_id,
                wallet_id=bet["wallet_id"],
                stake=amount,
                balance_type=balance_type,
                game="crash",
                conn=conn,
                real_part=real_part,
                bonus_part=bonus_part,
            )

        self._remove_active_bet(bet_id)
        self._record_settlement(
            bet_id=bet_id,
            user_id=user_id,
            amount=amount,
            status="cashed_out",
            multiplier=current_multiplier,
            payout=payout,
            profit=profit,
        )

        names = CrashDatabase.get_user_display_names([user_id])
        username = names.get(
            user_id,
            format_crash_player_name(user_id),
        )

        event = {
            "event": "PLAYER_CASHOUT",
            "username": username,
            "bet_id": bet_id,
            "bet": amount,
            "multiplier": current_multiplier,
            "profit": profit,
            "payout": payout,
            "active_bet_count": len(self.active_bets),
        }
        await self._broadcast(event)

        log.info(
            f"Crash cashout | round={self.current_round} | user_id={user_id} | "
            f"bet_id={bet_id} | multiplier={current_multiplier} | profit={profit}"
        )

        return {
            "round_id": self.current_round,
            "user_id": user_id,
            "bet_id": bet_id,
            "bet": amount,
            "multiplier": current_multiplier,
            "payout": payout,
            "profit": profit,
        }

    async def _process_auto_cashouts(self, up_to_multiplier: float | None = None) -> None:
        """Cash out bets whose auto targets were crossed up to a multiplier.

        Uses a min-heap of targets so each tick only pops due entries — not a
        full scan of every active bet. Range detection is watermark-based:
        a target fires when watermark < target <= reached (never requires an
        exact landing on the target). Caps at the crash point so targets above
        the crash never win.
        """
        async with self._lock:
            await self._process_auto_cashouts_locked(up_to_multiplier)

    async def _process_auto_cashouts_locked(
        self,
        up_to_multiplier: float | None = None,
    ) -> None:
        if self.state != self.STATE_FLYING:
            return
        if self.round_start_time is None or self.current_crash is None:
            return
        if not self._auto_cashout_pending and not self._auto_cashout_heap:
            if up_to_multiplier is not None:
                self._auto_cashout_watermark = max(
                    self._auto_cashout_watermark,
                    min(float(up_to_multiplier), float(self.current_crash)),
                )
            return

        live_multiplier = self.get_current_multiplier()
        if up_to_multiplier is None:
            reached = live_multiplier
        else:
            reached = float(up_to_multiplier)

        # Never settle auto cashouts above the authoritative crash point.
        crash_point = float(self.current_crash)
        reached = min(reached, crash_point)

        if reached <= self._auto_cashout_watermark + 1e-12:
            return

        # Pay at the live server multiplier, clamped to the crash point so a
        # tick that jumps past crash still settles crossed targets safely.
        settlement = min(live_multiplier, crash_point)

        due: list[tuple[int, int, float]] = []
        while self._auto_cashout_heap:
            target, bet_id = self._auto_cashout_heap[0]
            if target > reached + 1e-12:
                break
            heapq.heappop(self._auto_cashout_heap)

            pending_target = self._auto_cashout_pending.get(bet_id)
            if pending_target is None or abs(pending_target - target) > 1e-12:
                continue
            if bet_id not in self.active_bets:
                self._unregister_auto_cashout(bet_id)
                continue
            if target <= self._auto_cashout_watermark + 1e-12:
                continue

            due.append((bet_id, self.active_bets[bet_id]["user_id"], target))

        for bet_id, user_id, target in due:
            if bet_id not in self.active_bets:
                self._unregister_auto_cashout(bet_id)
                continue
            try:
                result = await self._cashout_bet_locked(
                    bet_id=bet_id,
                    expected_user_id=user_id,
                    settlement_multiplier=settlement,
                )
                log.info(
                    f"Crash auto cashout | round={self.current_round} | "
                    f"user_id={user_id} | bet_id={bet_id} | "
                    f"target={target} | multiplier={result['multiplier']}"
                )
            except HTTPException as exc:
                log.info(
                    f"Crash auto cashout skipped | bet_id={bet_id} | "
                    f"status={exc.status_code} | detail={exc.detail}"
                )
            except Exception:
                log.exception(
                    f"Crash auto cashout failed | bet_id={bet_id} | "
                    f"user_id={user_id}"
                )

        self._auto_cashout_watermark = reached
        self._compact_auto_cashout_heap()

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def crashLoop(self):
        if self._running:
            return
        self._running = True
        log.info("Crash game loop started")

        # Single-worker guard: advisory lock held for process lifetime.
        # A second worker will fail to acquire and refuse to run the loop.
        if not self._acquire_singleton_lock():
            log.error(
                "Crash loop refused: another worker holds the crash singleton lock. "
                "Run Crash with exactly one process/worker."
            )
            self._running = False
            return

        # This process is now the single authoritative Crash owner. Only now may
        # HTTP bet/cashout handlers in this process mutate financial state.
        self._loop_owner = True

        self.recover_unsettled_bets_on_boot()

        while True:
            try:
                await self._run_round()
            except Exception:
                log.exception("Crash game loop round failed; restarting after delay")
                await asyncio.sleep(1)

    def _acquire_singleton_lock(self) -> bool:
        """PostgreSQL session-level advisory lock held for process lifetime."""
        try:
            raw = engine.raw_connection()
            cur = raw.cursor()
            cur.execute("SELECT pg_try_advisory_lock(%s)", (87421001,))
            got = cur.fetchone()[0]
            if not got:
                cur.close()
                raw.close()
                return False
            self._lock_conn = raw
            self._lock_cur = cur
            log.info("Crash singleton advisory lock acquired")
            return True
        except Exception:
            log.exception("Crash singleton advisory lock failed")
            return False

    def recover_unsettled_bets_on_boot(self):
        """
        After restart, refund any crash bets still Pending / unresolved in DB.

        Architecture limit remains: in-memory active_bets cannot survive restart;
        this recovery prevents permanently lost debits.
        """
        from database.crash.crash_db import crash_stats_table
        from database.db_config import bet_table

        try:
            with engine.begin() as conn:
                rows = conn.execute(
                    sa.select(
                        crash_stats_table.c.id,
                        crash_stats_table.c.bet_id,
                        crash_stats_table.c.user_id,
                        bet_table.c.bet_amount,
                    )
                    .select_from(
                        crash_stats_table.join(
                            bet_table, bet_table.c.id == crash_stats_table.c.bet_id
                        )
                    )
                    .where(
                        crash_stats_table.c.bet_result.is_(None),
                        bet_table.c.result == "Pending",
                        bet_table.c.game == "crash",
                    )
                ).mappings().all()

                for row in rows:
                    user_id = row["user_id"]
                    amount = float(row["bet_amount"])
                    bet_id = row["bet_id"]
                    stats_id = row["id"]
                    wallet = WalletManager(user_id)
                    wallet_id = wallet.ensureWallet()
                    if lock_wallet(conn, user_id, wallet_id) is None:
                        log.error(
                            f"Crash recovery skip — wallet missing | user_id={user_id}"
                        )
                        continue
                    balances = wallet.apply_balance_deltas(
                        conn, wallet_id, real_delta=amount
                    )
                    TransactionManager(
                        user_id=user_id,
                        wallet_id=wallet_id,
                        balance_type=BALANCE_REAL,
                        transaction_type="crash restart refund",
                        amount=amount,
                        balance_after=balances["real_balance"],
                        status="Done",
                        reference_id=str(bet_id),
                    ).postTransaction(conn)
                    CrashDatabase.update_bet_outcome(
                        bet_id=bet_id,
                        result="Refund",
                        profit=0,
                        conn=conn,
                    )
                    conn.execute(
                        sa.update(crash_stats_table)
                        .where(
                            crash_stats_table.c.id == stats_id,
                            crash_stats_table.c.bet_result.is_(None),
                        )
                        .values(bet_result="Refund", result=0)
                    )
                    log.warning(
                        f"Crash boot refund | user_id={user_id} | bet_id={bet_id} | "
                        f"amount={amount}"
                    )
        except Exception:
            log.exception("Crash unsettled-bet recovery failed")

    async def _run_round(self):
        # -------------------- BETTING (crash_id ready for stats INSERT) --------------------
        async with self._lock:
            if self.active_bets:
                unresolved_user_ids = sorted(
                    {bet["user_id"] for bet in self.active_bets.values()}
                )
                log.error(
                    f"Starting round with unresolved active bets | "
                    f"count={len(self.active_bets)} | "
                    f"bet_ids={list(self.active_bets.keys())} | "
                    f"user_ids={unresolved_user_ids}"
                )

            self.current_round += 1
            self.state = self.STATE_BETTING
            self.round_start_time = None
            self.round_settlements.clear()
            self._clear_auto_cashouts()
            self.betting_ends_at = time.time() + self.BETTING_TIME
            self.phase_ends_at = self.betting_ends_at

            # Generate crash point in memory only. Persist an unrevealed crash
            # row so place_bet can INSERT crash_stats — the multiplier must not
            # be readable (history API / DB public reads) until ROUND_END.
            crash_multiplier = self.manager.returnGameResult()
            self.current_crash = crash_multiplier
            self.crash_id = CrashDatabase.insert_crash_round(
                game_seed_used=self.manager.game_seed,
                hash_server_seed_used=self.manager.server_seed_hash,
                nonce_used=self.manager.last_nonce_used,
            )

            round_id = self.current_round
            time_left = self.BETTING_TIME

        await self._broadcast(
            {
                "event": "ROUND_OPEN",
                "round_id": round_id,
                "time_left": time_left,
                "active_bet_count": len(self.active_bets),
            }
        )

        await asyncio.sleep(self.BETTING_TIME)

        # -------------------- FLYING --------------------
        async with self._lock:
            self.state = self.STATE_FLYING
            self.round_start_time = time.time()
            self.phase_ends_at = None
            start_time = self.round_start_time
            crash_delay = self.time_to_crash(self.current_crash)
            crash_time = self.round_start_time + crash_delay

        await self._broadcast(
            {
                "event": "ROUND_START",
                "round_id": round_id,
                "start_time": start_time,
            }
        )

        while time.time() < crash_time:
            await self._process_auto_cashouts()
            remaining = crash_time - time.time()
            if remaining <= 0:
                break
            await asyncio.sleep(min(self.FLYING_TICK, remaining))

        # -------------------- CRASHED --------------------
        async with self._lock:
            # Settle every auto target <= crash_point before marking losses,
            # even if the last poll jumped from below the target past the crash.
            await self._process_auto_cashouts_locked(
                up_to_multiplier=self.current_crash
            )
            self.state = self.STATE_CRASHED
            self.phase_ends_at = time.time() + self.ROUND_END_DELAY
            await self._resolve_lost_bets()
            final_crash = self.current_crash
            multipier_int = int(round(final_crash * 100))
            try:
                # Persist only after the round has crashed so /history cannot
                # expose the future multiplier to mid-round joiners.
                CrashDatabase.reveal_crash_round(
                    crash_id=self.crash_id,
                    multipier_result=multipier_int,
                    instant_crash=self.manager.last_instant_crash,
                )
            except Exception:
                log.exception(
                    f"Failed to reveal crash round in DB | crash_id={self.crash_id} | "
                    f"multipier={multipier_int}"
                )

        await self._broadcast(
            {
                "event": "ROUND_END",
                "round_id": round_id,
                "crash_multiplier": final_crash,
                "active_bet_count": len(self.active_bets),
            }
        )

        await asyncio.sleep(self.ROUND_END_DELAY)

    async def _resolve_lost_bets(self):
        """
        Settle every remaining active bet as Lose.

        Only successfully settled bets are removed from active_bets.
        Failures stay in memory for visibility / later retry — never discarded.
        """
        failed_bet_ids: list[int] = []

        for bet_id, bet in list(self.active_bets.items()):
            user_id = bet["user_id"]
            amount = bet["amount"]
            real_part = float(bet.get("real_part") or amount)
            bonus_part = float(bet.get("bonus_part") or 0)
            balance_type = bet.get("balance_type") or BALANCE_REAL
            try:
                with engine.begin() as conn:
                    CrashDatabase.update_bet_outcome(
                        bet_id=bet_id,
                        result="Lose",
                        profit=-amount,
                        conn=conn,
                    )
                    CrashDatabase.finish_active_bet(
                        crash_stats_id=bet["crash_stats_id"],
                        bet_amount=amount,
                        conn=conn,
                    )
                    PromotionManager(user_id).on_bet_settled(
                        user_id=user_id,
                        wallet_id=bet["wallet_id"],
                        stake=amount,
                        balance_type=balance_type,
                        game="crash",
                        conn=conn,
                        real_part=real_part,
                        bonus_part=bonus_part,
                    )
                self._remove_active_bet(bet_id)
                self._record_settlement(
                    bet_id=bet_id,
                    user_id=user_id,
                    amount=amount,
                    status="lost",
                    multiplier=self.current_crash,
                    payout=0,
                    profit=-amount,
                )
            except Exception:
                failed_bet_ids.append(bet_id)
                log.exception(
                    f"Failed to settle lost crash bet | crash_id={self.crash_id} | "
                    f"user_id={user_id} | bet_id={bet_id} | "
                    f"crash_stats_id={bet.get('crash_stats_id')}"
                )

        if failed_bet_ids:
            log.error(
                f"Unresolved crash bets remain in active_bets | "
                f"crash_id={self.crash_id} | failed_bet_ids={failed_bet_ids} | "
                f"remaining_bet_ids={list(self.active_bets.keys())}"
            )
        elif self.active_bets:
            log.error(
                f"active_bets not empty after resolve with no recorded failures | "
                f"crash_id={self.crash_id} | "
                f"remaining_bet_ids={list(self.active_bets.keys())}"
            )

    async def _broadcast(self, message: dict):
        if self.ws_manager is None:
            return
        await self.ws_manager.broadcast(message)

    # ------------------------------------------------------------------
    # Wallet helpers — cash-first split (Welcome Bonus MVP)
    # ------------------------------------------------------------------

    def _debit_split(
        self, conn, wallet, user_id, wallet_id, real_part, bonus_part, tx_type
    ):
        balance_type = balance_type_for_parts(real_part, bonus_part)
        primary_tx_id = None
        if real_part > 0:
            balances = wallet.apply_balance_deltas(
                conn, wallet_id, real_delta=-float(real_part)
            )
            primary_tx_id = TransactionManager(
                user_id=user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_REAL,
                transaction_type=tx_type,
                amount=-float(real_part),
                balance_after=balances["real_balance"],
            ).postTransaction(conn)
        if bonus_part > 0:
            balances = wallet.apply_balance_deltas(
                conn, wallet_id, bonus_delta=-float(bonus_part)
            )
            tx_id = TransactionManager(
                user_id=user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_BONUS,
                transaction_type=tx_type,
                amount=-float(bonus_part),
                balance_after=balances["bonus_balance"],
            ).postTransaction(conn)
            if primary_tx_id is None:
                primary_tx_id = tx_id
        return primary_tx_id, balance_type

    def _credit_split(
        self,
        conn,
        wallet,
        user_id,
        wallet_id,
        real_credit,
        bonus_credit,
        tx_type,
        stake=None,
        bonus_part=None,
    ):
        win_tx_id = None
        credited_real = float(real_credit or 0)
        credited_bonus = float(bonus_credit or 0)
        if credited_bonus > 0:
            credited_bonus = BonusManager(user_id).capBonusWin(
                stake if stake is not None else credited_bonus,
                credited_bonus,
                conn=conn,
                bonus_part=bonus_part if bonus_part is not None else credited_bonus,
            )
        if credited_real > 0:
            balances = wallet.apply_balance_deltas(
                conn, wallet_id, real_delta=credited_real
            )
            win_tx_id = TransactionManager(
                user_id=user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_REAL,
                transaction_type=tx_type,
                amount=credited_real,
                balance_after=balances["real_balance"],
            ).postTransaction(conn)
        if credited_bonus > 0:
            balances = wallet.apply_balance_deltas(
                conn, wallet_id, bonus_delta=credited_bonus
            )
            tx_id = TransactionManager(
                user_id=user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_BONUS,
                transaction_type=tx_type,
                amount=credited_bonus,
                balance_after=balances["bonus_balance"],
            ).postTransaction(conn)
            if win_tx_id is None:
                win_tx_id = tx_id
        return win_tx_id

    def _debit_real(self, conn, wallet, user_id, wallet_id, amount, tx_type):
        # Legacy helper kept for boot-refund path (REAL-only restores).
        balances = wallet.apply_balance_deltas(
            conn, wallet_id, real_delta=-float(amount)
        )
        return TransactionManager(
            user_id=user_id,
            wallet_id=wallet_id,
            balance_type=BALANCE_REAL,
            transaction_type=tx_type,
            amount=-float(amount),
            balance_after=balances["real_balance"],
        ).postTransaction(conn)

    def _credit_real(self, conn, wallet, user_id, wallet_id, amount, tx_type):
        balances = wallet.apply_balance_deltas(
            conn, wallet_id, real_delta=float(amount)
        )
        return TransactionManager(
            user_id=user_id,
            wallet_id=wallet_id,
            balance_type=BALANCE_REAL,
            transaction_type=tx_type,
            amount=float(amount),
            balance_after=balances["real_balance"],
        ).postTransaction(conn)


crash_manager = CrashManager()
crash_manager.createCrash()
crash_loop = CrashGameLoop(crash_manager)
