import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from database.crash import CrashDatabase, format_crash_player_name
from games.crash import crash_game
from games.crash.router import CrashCashoutRequest


class _FakeTransaction:
    def __enter__(self):
        return object()

    def __exit__(self, exc_type, exc_value, traceback):
        return False


class _FakeEngine:
    def begin(self):
        return _FakeTransaction()


class _FakeWebSocketManager:
    def __init__(self):
        self.messages = []

    async def broadcast(self, message):
        self.messages.append(message)


class _FakeWallet:
    def __init__(self, user_id):
        self.user_id = user_id

    def ensureWallet(self):
        return self.user_id + 1000

    def hasEnoughBalance(self, wallet_id, amount, balance_type, conn=None):
        return True

    def getRealBalance(self, wallet_id, conn=None):
        return 1000.0

    def updateRealBalance(self, conn, balance):
        return None

    def apply_balance_deltas(self, conn, wallet_id, real_delta=0, bonus_delta=0, pending_delta=0):
        return {
            "real_balance": 1000.0 + float(real_delta),
            "bonus_balance": float(bonus_delta),
            "pending_balance": float(pending_delta),
        }


def _fake_lock_wallet(conn, user_id, wallet_id):
    return {"id": wallet_id, "user_id": user_id, "real_balance": 1000.0}


class _FakeTransactionManager:
    next_id = 1

    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def postTransaction(self, conn):
        transaction_id = self.next_id
        type(self).next_id += 1
        return transaction_id


class _FakeBet:
    next_id = 101

    def __init__(self, user_id, bet_transaction_id, balance_type):
        self.user_id = user_id

    def createBet(self, conn, game, amount, result, profit):
        bet_id = self.next_id
        type(self).next_id += 1
        return bet_id


class _FakeCrashDatabase:
    next_stats_id = 1001
    next_crash_id = 501
    inserted_rounds = []
    revealed_rounds = []

    @classmethod
    def insert_crash_round(cls, game_seed_used, hash_server_seed_used, nonce_used, conn=None):
        crash_id = cls.next_crash_id
        cls.next_crash_id += 1
        cls.inserted_rounds.append(
            {
                "crash_id": crash_id,
                "game_seed_used": game_seed_used,
                "hash_server_seed_used": hash_server_seed_used,
                "nonce_used": nonce_used,
            }
        )
        return crash_id

    @classmethod
    def reveal_crash_round(cls, crash_id, multipier_result, instant_crash, conn=None):
        cls.revealed_rounds.append(
            {
                "crash_id": crash_id,
                "multipier_result": multipier_result,
                "instant_crash": instant_crash,
            }
        )
        return 1

    @classmethod
    def insert_active_bet(cls, crash_id, user_id, bet_id, conn=None):
        stats_id = cls.next_stats_id
        cls.next_stats_id += 1
        return stats_id

    @staticmethod
    def get_user_display_names(user_ids, conn=None):
        return {user_id: f"Player {user_id}" for user_id in user_ids}

    @staticmethod
    def update_bet_outcome(**kwargs):
        return 1

    @staticmethod
    def cashout_bet(**kwargs):
        return 1

    @staticmethod
    def finish_active_bet(**kwargs):
        return 1


class CrashGameLoopRuntimeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _FakeBet.next_id = 101
        _FakeCrashDatabase.next_stats_id = 1001
        _FakeCrashDatabase.next_crash_id = 501
        _FakeCrashDatabase.inserted_rounds = []
        _FakeCrashDatabase.revealed_rounds = []
        _FakeTransactionManager.next_id = 1

        self.patchers = [
            patch.object(crash_game, "engine", _FakeEngine()),
            patch.object(crash_game, "WalletManager", _FakeWallet),
            patch.object(crash_game, "TransactionManager", _FakeTransactionManager),
            patch.object(crash_game, "Bet", _FakeBet),
            patch.object(crash_game, "CrashDatabase", _FakeCrashDatabase),
            patch.object(crash_game, "lock_wallet", _fake_lock_wallet),
        ]
        for patcher in self.patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

        manager = SimpleNamespace(
            server_seed_hash="hash",
            game_seed="game-seed",
            last_nonce_used=1,
            last_instant_crash=False,
            returnGameResult=lambda: 2.5,
        )
        self.loop = crash_game.CrashGameLoop(manager)
        self.loop.current_round = 1
        self.loop.crash_id = 10
        self.loop.BETTING_TIME = 0
        self.loop.ROUND_END_DELAY = 0
        self.loop.FLYING_TICK = 0.001

    async def test_run_round_defers_multiplier_persist_until_crash(self):
        self.loop.ws_manager = _FakeWebSocketManager()

        await self.loop._run_round()

        self.assertEqual(len(_FakeCrashDatabase.inserted_rounds), 1)
        self.assertNotIn("multipier_result", _FakeCrashDatabase.inserted_rounds[0])
        self.assertEqual(
            _FakeCrashDatabase.revealed_rounds,
            [
                {
                    "crash_id": 501,
                    "multipier_result": 250,
                    "instant_crash": False,
                }
            ],
        )
        self.assertEqual(self.loop.ws_manager.messages[0]["event"], "ROUND_OPEN")
        self.assertNotIn("crash_multiplier", self.loop.ws_manager.messages[0])
        self.assertEqual(self.loop.ws_manager.messages[1]["event"], "ROUND_START")
        self.assertNotIn("crash_multiplier", self.loop.ws_manager.messages[1])
        self.assertEqual(self.loop.ws_manager.messages[-1]["event"], "ROUND_END")
        self.assertEqual(self.loop.ws_manager.messages[-1]["crash_multiplier"], 2.5)

    async def test_get_state_hides_multiplier_while_flying(self):
        self.loop.state = self.loop.STATE_FLYING
        self.loop.round_start_time = time.time()
        self.loop.current_crash = 7.77

        state = self.loop.get_state(viewer_user_id=7)

        self.assertIsNone(state["crash_multiplier"])
        self.assertEqual(state["start_time"], self.loop.round_start_time)

    def test_cashout_request_requires_positive_bet_id(self):
        self.assertEqual(CrashCashoutRequest(bet_id=123).bet_id, 123)

        with self.assertRaises(ValidationError):
            CrashCashoutRequest(bet_id=0)

    def test_player_display_name_prefers_trimmed_first_name(self):
        self.assertEqual(format_crash_player_name(4182, "  John  "), "John")

    def test_player_display_name_uses_stable_four_digit_fallback(self):
        self.assertEqual(format_crash_player_name(4182, None), "Player 4182")
        self.assertEqual(format_crash_player_name(137, "   "), "Player 0137")
        self.assertEqual(format_crash_player_name(19021, ""), "Player 9021")

    def test_display_name_query_ignores_telegram_username(self):
        rows = [
            {"id": 7, "first_name": "Alice", "username": "not_displayed"},
            {"id": 137, "first_name": "  ", "username": "also_hidden"},
        ]

        class _Rows:
            def mappings(self):
                return rows

        class _Connection:
            def execute(self, _stmt):
                return _Rows()

        self.assertEqual(
            CrashDatabase.get_user_display_names([7, 137], conn=_Connection()),
            {7: "Alice", 137: "Player 0137"},
        )

    async def test_place_bet_enforces_min_max_and_combined_total(self):
        with self.assertRaises(HTTPException) as raised:
            await self.loop.place_bet(user_id=7, amount=0.05)
        self.assertEqual(raised.exception.status_code, 400)

        with self.assertRaises(HTTPException) as raised:
            await self.loop.place_bet(user_id=7, amount=5.0)
        self.assertEqual(raised.exception.status_code, 400)

        first = await self.loop.place_bet(user_id=7, amount=4.9)
        self.assertEqual(first["amount"], 4.9)

        with self.assertRaises(HTTPException) as raised:
            await self.loop.place_bet(user_id=7, amount=0.2)
        self.assertEqual(raised.exception.status_code, 400)

        second = await self.loop.place_bet(user_id=7, amount=0.1)
        self.assertEqual(second["amount"], 0.1)

    async def test_allows_two_bets_and_rejects_third(self):
        first = await self.loop.place_bet(user_id=7, amount=1)
        second = await self.loop.place_bet(user_id=7, amount=2)

        self.assertEqual(set(self.loop.active_bets), {first["bet_id"], second["bet_id"]})
        self.assertEqual(
            self.loop.user_bets[7],
            {first["bet_id"], second["bet_id"]},
        )

        with self.assertRaises(HTTPException) as raised:
            await self.loop.place_bet(user_id=7, amount=0.1)

        self.assertEqual(raised.exception.status_code, 409)

    async def test_cashout_by_bet_id_removes_only_selected_bet(self):
        first = await self.loop.place_bet(user_id=7, amount=1)
        second = await self.loop.place_bet(user_id=7, amount=2)
        self.loop.state = self.loop.STATE_FLYING
        self.loop.round_start_time = time.time()
        self.loop.current_crash = 10.0
        self.loop.get_current_multiplier = lambda: 2.0
        self.loop.ws_manager = _FakeWebSocketManager()

        result = await self.loop.cashout(first["bet_id"], user_id=7)

        self.assertEqual(result["bet"], 1.0)
        self.assertEqual(result["bet_id"], first["bet_id"])
        self.assertNotIn(first["bet_id"], self.loop.active_bets)
        self.assertIn(second["bet_id"], self.loop.active_bets)
        self.assertEqual(self.loop.user_bets[7], {second["bet_id"]})
        self.assertEqual(
            self.loop.ws_manager.messages[-1]["bet_id"],
            first["bet_id"],
        )

        with self.assertRaises(HTTPException) as raised:
            await self.loop.cashout(first["bet_id"], user_id=7)

        self.assertEqual(raised.exception.status_code, 404)

    async def test_cashout_validates_ownership_and_current_round(self):
        first = await self.loop.place_bet(user_id=7, amount=1)
        self.loop.state = self.loop.STATE_FLYING
        self.loop.round_start_time = time.time()
        self.loop.current_crash = 10.0

        with self.assertRaises(HTTPException) as raised:
            await self.loop.cashout(first["bet_id"], user_id=8)

        self.assertEqual(raised.exception.status_code, 404)

        self.loop.crash_id = 11
        with self.assertRaises(HTTPException) as raised:
            await self.loop.cashout(first["bet_id"], user_id=7)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertIn(first["bet_id"], self.loop.active_bets)

    async def test_state_exposes_stable_plural_and_compatibility_bets(self):
        first = await self.loop.place_bet(user_id=7, amount=1)
        second = await self.loop.place_bet(user_id=7, amount=2)

        state = self.loop.get_state(viewer_user_id=7)
        empty_state = self.loop.get_state(viewer_user_id=8)

        self.assertEqual(
            [bet["bet_id"] for bet in state["my_bets"]],
            [first["bet_id"], second["bet_id"]],
        )
        self.assertEqual(state["my_bet"], state["my_bets"][0])
        self.assertEqual(empty_state["my_bets"], [])
        self.assertIsNone(empty_state["my_bet"])
        self.assertEqual(
            [bet["bet_id"] for bet in state["active_bets"]],
            [first["bet_id"], second["bet_id"]],
        )
        self.assertIn("server_time", state)
        self.assertEqual(state["my_settled"], [])
        self.assertFalse(state["can_cashout"])

        self.loop.state = self.loop.STATE_FLYING
        self.loop.round_start_time = time.time()
        self.loop.current_crash = 10.0
        flying = self.loop.get_state(viewer_user_id=7)
        self.assertTrue(flying["can_cashout"])

    async def test_state_includes_settled_cashout_for_reconnect(self):
        first = await self.loop.place_bet(user_id=7, amount=1)
        self.loop.state = self.loop.STATE_FLYING
        self.loop.round_start_time = time.time() - 1
        self.loop.current_crash = 10.0

        await self.loop.cashout(first["bet_id"], user_id=7)
        state = self.loop.get_state(viewer_user_id=7)

        self.assertEqual(state["my_bets"], [])
        self.assertFalse(state["can_cashout"])
        self.assertEqual(len(state["my_settled"]), 1)
        self.assertEqual(state["my_settled"][0]["bet_id"], first["bet_id"])
        self.assertEqual(state["my_settled"][0]["status"], "cashed_out")
        self.assertGreater(state["my_settled"][0]["payout"], 0)

    async def test_loss_settlement_cleans_both_indexes(self):
        await self.loop.place_bet(user_id=7, amount=1)
        await self.loop.place_bet(user_id=7, amount=2)

        await self.loop._resolve_lost_bets()

        self.assertEqual(self.loop.active_bets, {})
        self.assertEqual(self.loop.user_bets, {})


class CrashHistorySecrecyTests(unittest.TestCase):
    """Unrevealed in-progress rounds must never appear in public history."""

    def test_get_recent_multipliers_excludes_unrevealed_placeholder(self):
        executed = []

        class _Scalars:
            def all(self):
                return [250, 180]

        class _Result:
            def scalars(self):
                return _Scalars()

        class _Connection:
            def execute(self, stmt):
                executed.append(stmt)
                return _Result()

        items = CrashDatabase.get_recent_multipliers(limit=10, conn=_Connection())

        self.assertEqual(items, [2.5, 1.8])
        self.assertEqual(len(executed), 1)
        compiled = str(executed[0].compile(compile_kwargs={"literal_binds": True}))
        self.assertIn("multipier_result", compiled)
        self.assertIn(">", compiled)
        self.assertIn("0", compiled)

    def test_insert_crash_round_stores_unrevealed_placeholder_only(self):
        inserted = {}

        class _Result:
            def scalar_one(self):
                return 42

        class _Connection:
            def execute(self, stmt):
                inserted["stmt"] = stmt
                return _Result()

        crash_id = CrashDatabase.insert_crash_round(
            game_seed_used="game-seed",
            hash_server_seed_used="server-hash",
            nonce_used=3,
            conn=_Connection(),
        )

        self.assertEqual(crash_id, 42)
        compiled = str(inserted["stmt"].compile(compile_kwargs={"literal_binds": True}))
        self.assertIn("0", compiled)
        self.assertNotIn("152", compiled)

    def test_reveal_crash_round_rejects_placeholder_multiplier(self):
        with self.assertRaises(ValueError):
            CrashDatabase.reveal_crash_round(
                crash_id=1,
                multipier_result=0,
                instant_crash=False,
                conn=object(),
            )


if __name__ == "__main__":
    unittest.main()
