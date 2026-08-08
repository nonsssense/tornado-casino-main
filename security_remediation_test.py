"""Security regression tests for the P0/P1 remediation.

Covers the newly added controls in isolation (no schema writes):
  * Trusted-proxy client IP extraction (M-1)
  * In-process rate limiter (H-3)
  * Crash single-worker (loop-owner) fail-closed guard (H-1)
  * Crash public broadcasts no longer leak internal user_id (M-6)
  * Crash WebSocket connection limits + counter cleanup (H-3)
  * Withdrawal confirmation payload binding (H-... step-up)
  * Production DEBUG / SQL echo fail-closed (M-5) — via subprocess

Run: python -m unittest security_remediation_test -v
"""

import asyncio
import os
import subprocess
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException


class _FakeRequest:
    def __init__(self, headers=None, host="203.0.113.9"):
        self.headers = headers or {}
        self.client = SimpleNamespace(host=host)


class TrustedProxyIpTests(unittest.TestCase):
    def _ip(self, headers, host="203.0.113.9", proxies=1):
        import config
        import handler_helpers
        with patch.object(config, "TRUSTED_PROXY_COUNT", proxies):
            return handler_helpers.getIpAddress(_FakeRequest(headers, host))

    def test_spoofed_left_xff_is_ignored_rightmost_wins(self):
        # Attacker prepends a fake IP; nginx appends the real peer on the right.
        ip = self._ip({"X-Forwarded-For": "1.2.3.4, 198.51.100.7"}, proxies=1)
        self.assertEqual(ip, "198.51.100.7")

    def test_single_xff_value(self):
        self.assertEqual(self._ip({"X-Forwarded-For": "198.51.100.7"}), "198.51.100.7")

    def test_two_trusted_proxies_take_second_from_right(self):
        ip = self._ip(
            {"X-Forwarded-For": "1.2.3.4, 198.51.100.7, 10.0.0.1"}, proxies=2
        )
        self.assertEqual(ip, "198.51.100.7")

    def test_zero_proxies_uses_socket_peer_only(self):
        ip = self._ip({"X-Forwarded-For": "1.2.3.4"}, host="10.9.9.9", proxies=0)
        self.assertEqual(ip, "10.9.9.9")

    def test_x_real_ip_fallback_when_no_xff(self):
        ip = self._ip({"X-Real-IP": "198.51.100.7"}, proxies=1)
        self.assertEqual(ip, "198.51.100.7")


class RateLimiterTests(unittest.TestCase):
    def setUp(self):
        import rate_limit
        rate_limit.reset_for_tests()

    def test_enforce_blocks_after_limit(self):
        from rate_limit import enforce
        for _ in range(3):
            enforce("t", "user1", 3, 60.0)
        with self.assertRaises(HTTPException) as raised:
            enforce("t", "user1", 3, 60.0)
        self.assertEqual(raised.exception.status_code, 429)
        self.assertIn("Retry-After", raised.exception.headers)

    def test_buckets_and_identities_are_independent(self):
        from rate_limit import enforce
        for _ in range(3):
            enforce("a", "u", 3, 60.0)
        # Different bucket → independent budget.
        enforce("b", "u", 3, 60.0)
        # Different identity → independent budget.
        enforce("a", "u2", 3, 60.0)


class CrashLoopOwnerGuardTests(unittest.TestCase):
    def test_guard_fails_closed_when_not_loop_owner(self):
        from games.crash.crash_game import crash_loop
        from games.crash.router import _ensure_crash_owner

        original = crash_loop._loop_owner
        try:
            crash_loop._loop_owner = False
            with self.assertRaises(HTTPException) as raised:
                _ensure_crash_owner()
            self.assertEqual(raised.exception.status_code, 503)

            crash_loop._loop_owner = True
            _ensure_crash_owner()  # must not raise
        finally:
            crash_loop._loop_owner = original


class _FakeCrashDatabaseNames:
    @staticmethod
    def get_user_display_names(user_ids, conn=None):
        return {uid: f"Player {uid}" for uid in user_ids}


class CrashPublicSerializationTests(unittest.TestCase):
    """Public payloads must never expose internal user_id (M-6)."""

    def _make_loop(self):
        from games.crash import crash_game
        manager = SimpleNamespace(
            server_seed_hash="hash", game_seed="g", last_nonce_used=1,
            last_instant_crash=False, returnGameResult=lambda: 2.0,
        )
        loop = crash_game.CrashGameLoop(manager)
        return loop

    def test_serialize_active_bets_has_no_user_id(self):
        from games.crash import crash_game
        loop = self._make_loop()
        loop.active_bets = {
            101: {"user_id": 7, "amount": 1.0, "wallet_id": 1},
            102: {"user_id": 8, "amount": 2.0, "wallet_id": 2},
        }
        with patch.object(crash_game, "CrashDatabase", _FakeCrashDatabaseNames):
            rows = loop._serialize_active_bets()
        self.assertTrue(rows)
        for row in rows:
            self.assertNotIn("user_id", row)
            self.assertIn("username", row)
            self.assertIn("bet_id", row)
            self.assertIn("amount", row)

    def test_place_bet_and_cashout_broadcasts_have_no_user_id(self):
        from games.crash import crash_game
        from games.crash.crash_game_test import (
            _FakeEngine, _FakeWallet, _FakeTransactionManager, _FakeBet,
            _FakeCrashDatabase, _fake_lock_wallet, _FakePromotionManager,
            _FakeWebSocketManager,
        )

        _FakeBet.next_id = 101
        _FakeCrashDatabase.next_stats_id = 1001
        _FakeCrashDatabase.next_crash_id = 501
        _FakeTransactionManager.next_id = 1

        patchers = [
            patch.object(crash_game, "engine", _FakeEngine()),
            patch.object(crash_game, "WalletManager", _FakeWallet),
            patch.object(crash_game, "TransactionManager", _FakeTransactionManager),
            patch.object(crash_game, "Bet", _FakeBet),
            patch.object(crash_game, "CrashDatabase", _FakeCrashDatabase),
            patch.object(crash_game, "lock_wallet", _fake_lock_wallet),
            patch.object(crash_game, "PromotionManager", _FakePromotionManager),
        ]
        for p in patchers:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in patchers])

        loop = self._make_loop()
        loop.current_round = 1
        loop.crash_id = 10
        loop.ws_manager = _FakeWebSocketManager()

        async def scenario():
            placed = await loop.place_bet(user_id=7, amount=1.0)
            loop.state = loop.STATE_FLYING
            import time as _t
            loop.round_start_time = _t.time()
            loop.current_crash = 10.0
            loop.get_current_multiplier = lambda: 2.0
            await loop.cashout(placed["bet_id"], user_id=7)

        asyncio.run(scenario())

        events = [m for m in loop.ws_manager.messages if m.get("event") in ("PLAYER_BET", "PLAYER_CASHOUT")]
        self.assertTrue(events)
        for msg in events:
            self.assertNotIn("user_id", msg)


class _FakeWS:
    def __init__(self, host):
        self.client = SimpleNamespace(host=host)
        self.headers = {}
        self.accepted = False
        self.close_code = None

    async def accept(self):
        self.accepted = True

    async def close(self, code=None):
        self.close_code = code


class CrashWebSocketLimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_per_ip_cap_and_cleanup(self):
        from games.crash import websocketCrash
        mgr = websocketCrash.CrashWebSocketManager()
        with patch.object(websocketCrash, "CRASH_WS_MAX_PER_IP", 2), \
             patch.object(websocketCrash, "CRASH_WS_MAX_TOTAL", 100):
            a, b, c = _FakeWS("9.9.9.9"), _FakeWS("9.9.9.9"), _FakeWS("9.9.9.9")
            self.assertTrue(await mgr.connect(a))
            self.assertTrue(await mgr.connect(b))
            # Third from same IP rejected + closed.
            self.assertFalse(await mgr.connect(c))
            self.assertEqual(c.close_code, websocketCrash._WS_CLOSE_POLICY)
            # Freeing one slot lets a new one in.
            mgr.disconnect(a)
            d = _FakeWS("9.9.9.9")
            self.assertTrue(await mgr.connect(d))

    async def test_total_cap(self):
        from games.crash import websocketCrash
        mgr = websocketCrash.CrashWebSocketManager()
        with patch.object(websocketCrash, "CRASH_WS_MAX_TOTAL", 1), \
             patch.object(websocketCrash, "CRASH_WS_MAX_PER_IP", 100):
            self.assertTrue(await mgr.connect(_FakeWS("1.1.1.1")))
            over = _FakeWS("2.2.2.2")
            self.assertFalse(await mgr.connect(over))
            self.assertEqual(over.close_code, websocketCrash._WS_CLOSE_TRY_LATER)


class WithdrawConfirmationHashTests(unittest.TestCase):
    def test_payload_hash_binds_identity_amount_coin_address(self):
        from payments.withdraw import _confirmation_payload_hash
        base = _confirmation_payload_hash(7, 42, 10.0, "BTC", "addrA")
        self.assertEqual(base, _confirmation_payload_hash(7, 42, 10.0, "BTC", "addrA"))
        # Any field change must change the hash (invalidates confirmation).
        self.assertNotEqual(base, _confirmation_payload_hash(8, 42, 10.0, "BTC", "addrA"))
        self.assertNotEqual(base, _confirmation_payload_hash(7, 43, 10.0, "BTC", "addrA"))
        self.assertNotEqual(base, _confirmation_payload_hash(7, 42, 10.5, "BTC", "addrA"))
        self.assertNotEqual(base, _confirmation_payload_hash(7, 42, 10.0, "ETH", "addrA"))
        self.assertNotEqual(base, _confirmation_payload_hash(7, 42, 10.0, "BTC", "addrB"))


class ProductionDebugFailClosedTests(unittest.TestCase):
    def test_debug_true_is_ignored_in_production(self):
        env = dict(os.environ)
        env["APP_ENV"] = "production"
        env["DEBUG"] = "true"
        code = (
            "import config;"
            "print('DEBUG=', config.DEBUG);"
            "assert config.DEBUG is False, 'DEBUG must be forced off in production';"
            "assert config.SESSION_COOKIE_SECURE is True;"
            "print('OK')"
        )
        proc = subprocess.run(
            [sys.executable, "-c", code],
            env=env, capture_output=True, text=True,
            cwd=os.path.dirname(os.path.abspath(__file__)),
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr)
        self.assertIn("OK", proc.stdout)


if __name__ == "__main__":
    unittest.main()
