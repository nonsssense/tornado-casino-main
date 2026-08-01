"""Integration tests for session mint + idle sweeper."""

from __future__ import annotations

import datetime
import secrets
import unittest
import uuid

import sqlalchemy as sa

from database.db_config import engine, user_session_table, users_table
from database.session import (
    SESSION_IDLE_MINUTES,
    SessionManager,
    closeIdleSessions,
    getActiveSessionUserId,
)


def _count_active(user_id: int) -> int:
    with engine.connect() as conn:
        return conn.execute(
            sa.select(sa.func.count())
            .select_from(user_session_table)
            .where(
                user_session_table.c.user_id == user_id,
                user_session_table.c.active_status == True,
            )
        ).scalar_one()


def _active_tokens(user_id: int) -> list[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            sa.select(user_session_table.c.session_token).where(
                user_session_table.c.user_id == user_id,
                user_session_table.c.active_status == True,
            )
        ).fetchall()
        return [r[0] for r in rows]


class SessionExpirationFixTests(unittest.TestCase):
    def setUp(self):
        tg_id = -(10_000_000 + uuid.uuid4().int % 1_000_000)
        with engine.begin() as conn:
            values = {
                "tg_id": tg_id,
                "username": f"session_test_{uuid.uuid4().hex[:8]}",
                "client_seed": secrets.token_hex(8),
                "status": "real",
                "nonce": 1,
            }
            if "server_seed" in users_table.c:
                values["server_seed"] = secrets.token_hex(16)
            if "hash_server_seed" in users_table.c:
                values["hash_server_seed"] = secrets.token_hex(16)
            row = conn.execute(
                sa.insert(users_table).values(**values).returning(users_table.c.id)
            ).first()
            self.user_id = int(row[0])

    def tearDown(self):
        with engine.begin() as conn:
            conn.execute(
                sa.delete(user_session_table).where(
                    user_session_table.c.user_id == self.user_id
                )
            )
            conn.execute(
                sa.delete(users_table).where(users_table.c.id == self.user_id)
            )

    def test_mint_closes_prior_active_sessions(self):
        first = secrets.token_urlsafe(16)
        second = secrets.token_urlsafe(16)

        SessionManager(self.user_id, first).createSession()
        self.assertEqual(_count_active(self.user_id), 1)

        SessionManager(self.user_id, second).createSession()
        active = _active_tokens(self.user_id)
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0], second)

        with engine.connect() as conn:
            prior = conn.execute(
                sa.select(user_session_table).where(
                    user_session_table.c.session_token == first
                )
            ).mappings().first()
        self.assertIsNotNone(prior)
        self.assertFalse(prior["active_status"])
        self.assertIsNotNone(prior["close_at"])

    def test_check_session_status_mint_leaves_one_active(self):
        SessionManager(self.user_id, secrets.token_urlsafe(16)).createSession()
        SessionManager(self.user_id, secrets.token_urlsafe(16)).createSession()

        token = SessionManager(self.user_id, None).checkSessionStatus()
        active = _active_tokens(self.user_id)
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0], token)
        self.assertEqual(getActiveSessionUserId(token), self.user_id)

    def test_idle_sweeper_closes_orphans(self):
        token = secrets.token_urlsafe(16)
        SessionManager(self.user_id, token).createSession()

        stale = datetime.datetime.now() - datetime.timedelta(
            minutes=SESSION_IDLE_MINUTES + 1
        )
        with engine.begin() as conn:
            conn.execute(
                sa.update(user_session_table)
                .where(user_session_table.c.session_token == token)
                .values(last_activity=stale)
            )

        closed = closeIdleSessions()
        self.assertGreaterEqual(closed, 1)

        with engine.connect() as conn:
            row = conn.execute(
                sa.select(user_session_table).where(
                    user_session_table.c.session_token == token
                )
            ).mappings().first()
        self.assertFalse(row["active_status"])
        self.assertIsNotNone(row["close_at"])
        self.assertIsNone(getActiveSessionUserId(token))

    def test_fresh_session_survives_sweeper(self):
        token = secrets.token_urlsafe(16)
        SessionManager(self.user_id, token).createSession()
        closeIdleSessions()
        self.assertEqual(getActiveSessionUserId(token), self.user_id)
        self.assertEqual(_count_active(self.user_id), 1)


if __name__ == "__main__":
    unittest.main()
