import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from games.game_manager import GameManager
from main import PlincoBatchRequest
from pydantic import ValidationError


class _Transaction:
    def __init__(self):
        self.conn = object()

    def __enter__(self):
        return self.conn

    def __exit__(self, exc_type, exc_value, traceback):
        return False


class _Engine:
    def __init__(self):
        self.transaction = _Transaction()

    def begin(self):
        return self.transaction


class _Bet:
    def __init__(self, user_id, bet_transaction_id, balance_type):
        self.outcomes = []

    def createBet(self, conn, game, amount, result, profit):
        return 201

    def updateOutcome(self, conn, bet_id, result, profit, win_transaction_id=None):
        self.outcomes.append(
            {
                "bet_id": bet_id,
                "result": result,
                "profit": profit,
                "win_transaction_id": win_transaction_id,
            }
        )


class _BatchBet(_Bet):
    next_id = 401

    def createBet(self, conn, game, amount, result, profit):
        bet_id = type(self).next_id
        type(self).next_id += 1
        return bet_id


class PlincoSettlementTest(unittest.TestCase):
    def setUp(self):
        self.request = SimpleNamespace(bid=1.0, rows=8, risk_mode="low")
        self.fairness = {
            "server_seed": "server",
            "client_seed": "client",
            "hash_server_seed": "hash",
            "nonce": 17,
        }

    def test_canonical_helper_uses_explicit_nonce_and_returns_legacy_fields(self):
        manager = GameManager.__new__(GameManager)
        manager.user_id = 7
        manager._credit_game_win = Mock(return_value=(301, 1.5))
        manager._notify_wager_progress = Mock()
        bet = _Bet(7, 101, "REAL")
        evaluator_result = {
            "payout": 1.5,
            "multiplier": 1.5,
            "basket": 3,
            "path": [0, 1, 0, 1, 0, 1, 0, 0],
            "nonce": 22,
            "nonce_used": 22,
            "client_seed_used": "client",
        }

        with (
            patch(
                "games.game_manager.getPlincoResult",
                return_value=evaluator_result.copy(),
            ) as evaluate,
            patch("games.game_manager.insert_plinco_round") as insert_round,
        ):
            result = manager._settlePlincoBall(
                object(),
                json=self.request,
                wallet_id=11,
                balance_type="REAL",
                bet=bet,
                bet_id=201,
                fairness=self.fairness,
                nonce=22,
            )

        evaluate.assert_called_once_with(self.request, "server", "client", 22)
        insert_round.assert_called_once()
        self.assertEqual(insert_round.call_args.kwargs["nonce_used"], 22)
        self.assertEqual(result["bet_id"], 201)
        self.assertEqual(result["balance_type"], "REAL")
        self.assertTrue(result["result_of_game"])
        self.assertEqual(result["payout"], 1.5)
        self.assertEqual(result["hash_server_seed"], "hash")
        self.assertEqual(result["server_seed_hash"], "hash")
        self.assertEqual(bet.outcomes[0]["profit"], 0.5)

    def test_legacy_play_delegates_to_canonical_helper(self):
        engine = _Engine()
        manager = GameManager(7)
        manager.wallet.ensureWallet = Mock(return_value=11)
        manager._resolve_balance_type = Mock(return_value="REAL")
        manager._debit = Mock(return_value=101)
        expected = {
            "path": [0] * 8,
            "basket": 0,
            "multiplier": 1.0,
            "payout": 1.0,
            "bet_id": 201,
            "balance_type": "REAL",
            "result_of_game": True,
        }
        manager._settlePlincoBall = Mock(return_value=expected)

        with (
            patch("games.game_manager.ensure_dice_schema"),
            patch("games.game_manager.engine", engine),
            patch("games.game_manager.lock_wallet", return_value={"id": 11}),
            patch("games.game_manager.Bet", _Bet),
            patch("games.game_manager.lock_user_fairness", return_value=self.fairness),
            patch("games.game_manager.increment_nonce") as increment,
        ):
            result = manager.playPlinco(self.request)

        self.assertEqual(result, expected)
        manager._settlePlincoBall.assert_called_once()
        call = manager._settlePlincoBall.call_args.kwargs
        self.assertEqual(call["nonce"], 17)
        self.assertEqual(call["bet_id"], 201)
        increment.assert_called_once_with(engine.transaction.conn, 7)

    def test_batch_uses_wallet_then_fairness_lock_and_contiguous_nonces(self):
        engine = _Engine()
        manager = GameManager(7)
        manager.wallet.ensureWallet = Mock(return_value=11)
        manager.wallet.getRealBalance = Mock(
            side_effect=[97.0, 98.2, 98.2, 101.6, 101.6]
        )
        manager.wallet.getBonusBalance = Mock(return_value=0.0)
        manager._resolve_balance_type = Mock(return_value="REAL")
        manager._debit = Mock(side_effect=[101, 102, 103])
        credited = [1.2, 0.0, 3.4]
        settlement_nonces = []

        def settle(*args, **kwargs):
            index = len(settlement_nonces)
            nonce = kwargs["nonce"]
            settlement_nonces.append(nonce)
            return {
                "path": [index % 2] * 8,
                "basket": index,
                "multiplier": credited[index],
                "payout": credited[index],
                "nonce": nonce,
                "nonce_used": nonce,
                "bet_id": kwargs["bet_id"],
                "balance_type": "REAL",
                "result_of_game": credited[index] > 0,
            }

        manager._settlePlincoBall = Mock(side_effect=settle)
        events = []
        request = SimpleNamespace(
            bid=1.0,
            count=3,
            rows=8,
            risk_mode="low",
            idempotency_key="test-batch-key-0001",
        )

        with (
            patch("games.game_manager.ensure_dice_schema"),
            patch("games.game_manager.ensure_plinko_batch_schema"),
            patch("games.game_manager.engine", engine),
            patch(
                "games.game_manager.lock_wallet",
                side_effect=lambda *args: events.append("wallet") or {"id": 11},
            ),
            patch("games.game_manager.Bet", _BatchBet),
            patch(
                "games.game_manager.lock_user_fairness",
                side_effect=lambda *args: events.append("user") or self.fairness,
            ),
            patch("games.game_manager.increment_nonce_by") as increment_by,
            patch("games.game_manager.get_plinko_batch_response", return_value=None),
            patch("games.game_manager.insert_plinko_batch_response") as insert_batch,
        ):
            result = manager.playPlincoBatch(request)

        self.assertEqual(events, ["wallet", "user"])
        self.assertEqual(settlement_nonces, [17, 18, 19])
        self.assertEqual(manager._debit.call_count, 3)
        self.assertEqual(result["count"], 3)
        self.assertEqual(result["total_bid"], 3.0)
        self.assertEqual(result["total_payout"], 4.6)
        self.assertEqual(result["balance_after_debit"]["real"], 97.0)
        self.assertEqual(result["balances"]["real"], 101.6)
        self.assertEqual(
            [ball["credited_amount"] for ball in result["results"]],
            credited,
        )
        increment_by.assert_called_once_with(engine.transaction.conn, 7, 3)
        insert_batch.assert_called_once()

    def test_batch_request_rejects_invalid_count_rows_risk_and_bid(self):
        valid = {
            "bid": 1.0,
            "count": 10,
            "rows": 16,
            "risk_mode": "high",
            "idempotency_key": "test-batch-key-0001",
        }
        self.assertEqual(PlincoBatchRequest(**valid).count, 10)

        for invalid in (
            {**valid, "count": 0},
            {**valid, "count": 11},
            {**valid, "rows": 9},
            {**valid, "risk_mode": "extreme"},
            {**valid, "bid": 0},
            {**valid, "bid": float("inf")},
        ):
            with self.assertRaises(ValidationError):
                PlincoBatchRequest(**invalid)

    def test_batch_retry_returns_persisted_response_without_second_debit(self):
        engine = _Engine()
        manager = GameManager(7)
        manager.wallet.ensureWallet = Mock(return_value=11)
        manager._debit = Mock()
        request = SimpleNamespace(
            bid=1.0,
            count=2,
            rows=8,
            risk_mode="low",
            idempotency_key="test-batch-key-0002",
        )
        persisted = {"count": 2, "results": [{"bet_id": 401}, {"bet_id": 402}]}

        with (
            patch("games.game_manager.ensure_dice_schema"),
            patch("games.game_manager.ensure_plinko_batch_schema"),
            patch("games.game_manager.engine", engine),
            patch("games.game_manager.lock_wallet", return_value={"id": 11}),
            patch(
                "games.game_manager.get_plinko_batch_response",
                return_value=persisted,
            ),
            patch("games.game_manager.lock_user_fairness") as lock_fairness,
        ):
            result = manager.playPlincoBatch(request)

        self.assertEqual(result, persisted)
        manager._debit.assert_not_called()
        lock_fairness.assert_not_called()


if __name__ == "__main__":
    unittest.main()
