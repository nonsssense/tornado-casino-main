"""Crash provably-fair manager and continuous game loop."""

from __future__ import annotations

import asyncio
import math
import time

from fastapi import HTTPException

from database.bet import Bet
from database.crash import CrashDatabase
from database.db_config import engine
from database.transactions import TransactionManager
from database.wallet import BALANCE_REAL, WalletManager
from exceptions import notEnoughBalance
from games.provably_fair import ProvablyFair
from log_manager import log


# Soft growth curve shared with the frontend animation.
# multiplier = floor(100 * e^(GROWTH_RATE * elapsed_ms^GROWTH_POWER)) / 100
# POWER < 1 reduces late-round acceleration (Aviator-like readability).
# Provably Fair crash points are independent of this curve.
GROWTH_RATE = 0.00062204
GROWTH_POWER = 0.75


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

        # user_id -> bet payload (includes bet_id + crash_stats_id)
        self.active_bets = {}
        self._lock = asyncio.Lock()
        self._running = False

    def set_ws_manager(self, ws_manager):
        self.ws_manager = ws_manager

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
        payload = {
            "state": self.state,
            "round_id": self.current_round,
            "crash_id": self.crash_id,
            "time_left": None,
            "start_time": None,
            "crash_multiplier": None,
            "server_seed_hash": self.manager.server_seed_hash,
            "active_bets": self._serialize_active_bets(),
            "my_bet": None,
        }

        if self.state == self.STATE_BETTING and self.betting_ends_at is not None:
            payload["time_left"] = max(0.0, self.betting_ends_at - time.time())

        if self.state == self.STATE_FLYING:
            payload["start_time"] = self.round_start_time

        if self.state == self.STATE_CRASHED:
            payload["crash_multiplier"] = self.current_crash
            payload["start_time"] = self.round_start_time

        if viewer_user_id is not None:
            mine = self.active_bets.get(viewer_user_id)
            if mine is not None:
                payload["my_bet"] = {
                    "amount": mine["amount"],
                    "bet_id": mine["bet_id"],
                }

        return payload

    def _serialize_active_bets(self) -> list:
        if not self.active_bets:
            return []

        names = CrashDatabase.get_user_display_names(self.active_bets.keys())
        rows = []
        for user_id, bet in self.active_bets.items():
            rows.append(
                {
                    "user_id": user_id,
                    "username": names.get(user_id, f"Player {user_id}"),
                    "amount": bet["amount"],
                    "bet_id": bet["bet_id"],
                }
            )
        return rows

    # ------------------------------------------------------------------
    # Betting / cashout (called from router)
    # ------------------------------------------------------------------

    async def place_bet(self, user_id: int, amount: float) -> dict:
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Bet amount must be positive")

        async with self._lock:
            if self.state != self.STATE_BETTING:
                raise HTTPException(status_code=409, detail="Bets are closed")

            if self.crash_id is None:
                raise HTTPException(status_code=409, detail="Round not ready")

            if user_id in self.active_bets:
                raise HTTPException(status_code=409, detail="Already have an active bet")

            wallet = WalletManager(user_id)
            wallet_id = wallet.ensureWallet()

            with engine.begin() as conn:
                if not wallet.hasEnoughBalance(
                    wallet_id, amount, BALANCE_REAL, conn=conn
                ):
                    raise notEnoughBalance()

                bet_tx_id = self._debit_real(
                    conn, wallet, user_id, wallet_id, amount, "crash bet"
                )

                bet_row = Bet(user_id, bet_tx_id, BALANCE_REAL)
                bet_id = bet_row.createBet(conn, "crash", amount, "Pending", 0)

                crash_stats_id = CrashDatabase.insert_active_bet(
                    crash_id=self.crash_id,
                    user_id=user_id,
                    bet_id=bet_id,
                    conn=conn,
                )

            self.active_bets[user_id] = {
                "user_id": user_id,
                "amount": float(amount),
                "bet_tx_id": bet_tx_id,
                "bet_id": bet_id,
                "crash_stats_id": crash_stats_id,
                "wallet_id": wallet_id,
                "placed_at": time.time(),
            }

            names = CrashDatabase.get_user_display_names([user_id])
            username = names.get(user_id, f"Player {user_id}")

            log.info(
                f"Crash bet placed | round={self.current_round} | "
                f"user_id={user_id} | amount={amount} | bet_id={bet_id} | "
                f"crash_stats_id={crash_stats_id}"
            )

            await self._broadcast(
                {
                    "event": "PLAYER_BET",
                    "user_id": user_id,
                    "username": username,
                    "bet": float(amount),
                    "bet_id": bet_id,
                }
            )

            return {
                "round_id": self.current_round,
                "amount": float(amount),
                "bet_id": bet_id,
                "user_id": user_id,
                "username": username,
            }

    async def cashout(self, user_id: int) -> dict:
        async with self._lock:
            if self.state != self.STATE_FLYING:
                raise HTTPException(status_code=409, detail="Round is not flying")

            bet = self.active_bets.get(user_id)
            if bet is None:
                raise HTTPException(status_code=404, detail="No active bet")

            if self.round_start_time is None or self.current_crash is None:
                raise HTTPException(status_code=409, detail="Round not ready")

            current_multiplier = self.get_current_multiplier()
            if current_multiplier >= self.current_crash:
                raise HTTPException(status_code=409, detail="Already crashed")

            amount = bet["amount"]
            payout = round(amount * current_multiplier, 2)
            profit = round(payout - amount, 2)

            wallet = WalletManager(user_id)
            with engine.begin() as conn:
                win_tx_id = self._credit_real(
                    conn, wallet, user_id, bet["wallet_id"], payout, "crash win"
                )
                CrashDatabase.update_bet_outcome(
                    bet_id=bet["bet_id"],
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

            del self.active_bets[user_id]

            event = {
                "event": "PLAYER_CASHOUT",
                "user_id": user_id,
                "bet": amount,
                "multiplier": current_multiplier,
                "profit": profit,
            }
            await self._broadcast(event)

            log.info(
                f"Crash cashout | round={self.current_round} | user_id={user_id} | "
                f"multiplier={current_multiplier} | profit={profit}"
            )

            return {
                "round_id": self.current_round,
                "user_id": user_id,
                "bet": amount,
                "multiplier": current_multiplier,
                "payout": payout,
                "profit": profit,
            }

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def crashLoop(self):
        if self._running:
            return
        self._running = True
        log.info("Crash game loop started")

        while True:
            try:
                await self._run_round()
            except Exception:
                log.exception("Crash game loop round failed; restarting after delay")
                await asyncio.sleep(1)

    async def _run_round(self):
        # -------------------- BETTING (crash_id ready for stats INSERT) --------------------
        async with self._lock:
            if self.active_bets:
                log.error(
                    f"Starting round with unresolved active bets | "
                    f"count={len(self.active_bets)} | "
                    f"user_ids={list(self.active_bets.keys())}"
                )

            self.current_round += 1
            self.state = self.STATE_BETTING
            self.round_start_time = None
            self.betting_ends_at = time.time() + self.BETTING_TIME

            # Generate + persist round up front so place_bet can INSERT crash_stats.
            # Multiplier is never broadcast until ROUND_END.
            crash_multiplier = self.manager.returnGameResult()
            self.current_crash = crash_multiplier
            multipier_int = int(round(crash_multiplier * 100))
            self.crash_id = CrashDatabase.insert_crash_round(
                game_seed_used=self.manager.game_seed,
                hash_server_seed_used=self.manager.server_seed_hash,
                nonce_used=self.manager.last_nonce_used,
                multipier_result=multipier_int,
                instant_crash=self.manager.last_instant_crash,
            )

            round_id = self.current_round
            time_left = self.BETTING_TIME

        await self._broadcast(
            {
                "event": "ROUND_OPEN",
                "round_id": round_id,
                "time_left": time_left,
            }
        )

        await asyncio.sleep(self.BETTING_TIME)

        # -------------------- FLYING --------------------
        async with self._lock:
            self.state = self.STATE_FLYING
            self.round_start_time = time.time()
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
            await asyncio.sleep(self.FLYING_TICK)

        # -------------------- CRASHED --------------------
        async with self._lock:
            self.state = self.STATE_CRASHED
            await self._resolve_lost_bets()
            final_crash = self.current_crash

        await self._broadcast(
            {
                "event": "ROUND_END",
                "crash_multiplier": final_crash,
            }
        )

        await asyncio.sleep(self.ROUND_END_DELAY)

    async def _resolve_lost_bets(self):
        """
        Settle every remaining active bet as Lose.

        Only successfully settled bets are removed from active_bets.
        Failures stay in memory for visibility / later retry — never discarded.
        """
        failed = []

        for user_id, bet in list(self.active_bets.items()):
            amount = bet["amount"]
            try:
                with engine.begin() as conn:
                    CrashDatabase.update_bet_outcome(
                        bet_id=bet["bet_id"],
                        result="Lose",
                        profit=-amount,
                        conn=conn,
                    )
                    CrashDatabase.finish_active_bet(
                        crash_stats_id=bet["crash_stats_id"],
                        bet_amount=amount,
                        conn=conn,
                    )
                del self.active_bets[user_id]
            except Exception:
                failed.append(user_id)
                log.exception(
                    f"Failed to settle lost crash bet | crash_id={self.crash_id} | "
                    f"user_id={user_id} | bet_id={bet.get('bet_id')} | "
                    f"crash_stats_id={bet.get('crash_stats_id')}"
                )

        if failed:
            log.error(
                f"Unresolved crash bets remain in active_bets | "
                f"crash_id={self.crash_id} | failed_user_ids={failed} | "
                f"remaining={list(self.active_bets.keys())}"
            )
        elif self.active_bets:
            log.error(
                f"active_bets not empty after resolve with no recorded failures | "
                f"crash_id={self.crash_id} | remaining={list(self.active_bets.keys())}"
            )

    async def _broadcast(self, message: dict):
        if self.ws_manager is None:
            return
        await self.ws_manager.broadcast(message)

    # ------------------------------------------------------------------
    # REAL-balance wallet helpers only
    # ------------------------------------------------------------------

    def _debit_real(self, conn, wallet, user_id, wallet_id, amount, tx_type):
        balance = wallet.getRealBalance(wallet_id, conn=conn)
        if balance < amount:
            raise notEnoughBalance()
        balance_after = balance - amount
        wallet.updateRealBalance(conn, balance_after)
        return TransactionManager(
            user_id=user_id,
            wallet_id=wallet_id,
            balance_type=BALANCE_REAL,
            transaction_type=tx_type,
            amount=-amount,
            balance_after=balance_after,
        ).postTransaction(conn)

    def _credit_real(self, conn, wallet, user_id, wallet_id, amount, tx_type):
        balance = wallet.getRealBalance(wallet_id, conn=conn)
        balance_after = balance + amount
        wallet.updateRealBalance(conn, balance_after)
        return TransactionManager(
            user_id=user_id,
            wallet_id=wallet_id,
            balance_type=BALANCE_REAL,
            transaction_type=tx_type,
            amount=amount,
            balance_after=balance_after,
        ).postTransaction(conn)


crash_manager = CrashManager()
crash_manager.createCrash()
crash_loop = CrashGameLoop(crash_manager)
