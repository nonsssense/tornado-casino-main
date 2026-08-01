"""SQL layer for per-user preference settings.

Schema is created idempotently via ensure_user_settings_schema().
Defaults: sound_enabled=true, haptic_enabled=true.
"""

from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa

from database.db_config import engine, metadata
from log_manager import log

user_settings_table = sa.Table(
    "user_settings",
    metadata,
    sa.Column("user_id", sa.Integer, primary_key=True),
    sa.Column("sound_enabled", sa.Boolean, nullable=False, server_default=sa.true()),
    sa.Column("haptic_enabled", sa.Boolean, nullable=False, server_default=sa.true()),
    sa.Column("updated_at", sa.DateTime, nullable=False),
    extend_existing=True,
)

_schema_ready = False

DEFAULT_SETTINGS = {
    "sound_enabled": True,
    "haptic_enabled": True,
}


def ensure_user_settings_schema():
    """Create `user_settings` if missing (idempotent)."""
    global _schema_ready
    if _schema_ready:
        return

    with engine.begin() as conn:
        conn.execute(
            sa.text(
                """
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id INTEGER PRIMARY KEY,
                    sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    haptic_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                    updated_at TIMESTAMP NOT NULL
                )
                """
            )
        )

    _schema_ready = True
    log.info("User settings schema ensured")


def _row_to_settings(row) -> dict:
    if not row:
        return dict(DEFAULT_SETTINGS)
    return {
        "sound_enabled": bool(row["sound_enabled"]),
        "haptic_enabled": bool(row["haptic_enabled"]),
    }


def get_user_settings(user_id: int, conn=None) -> dict:
    """Return settings for user; missing row → defaults (both enabled)."""
    ensure_user_settings_schema()

    def _run(connection):
        row = (
            connection.execute(
                sa.select(user_settings_table).where(
                    user_settings_table.c.user_id == int(user_id)
                )
            )
            .mappings()
            .first()
        )
        return _row_to_settings(row)

    if conn is not None:
        return _run(conn)
    with engine.begin() as connection:
        return _run(connection)


def update_user_settings(user_id: int, sound_enabled=None, haptic_enabled=None, conn=None) -> dict:
    """Upsert provided preference fields. Unspecified fields keep current/default values."""
    ensure_user_settings_schema()

    def _run(connection):
        current = get_user_settings(user_id, conn=connection)
        next_sound = (
            bool(sound_enabled) if sound_enabled is not None else current["sound_enabled"]
        )
        next_haptic = (
            bool(haptic_enabled) if haptic_enabled is not None else current["haptic_enabled"]
        )
        now = datetime.now()

        existing = connection.execute(
            sa.select(user_settings_table.c.user_id).where(
                user_settings_table.c.user_id == int(user_id)
            )
        ).first()

        if existing is None:
            connection.execute(
                sa.insert(user_settings_table).values(
                    user_id=int(user_id),
                    sound_enabled=next_sound,
                    haptic_enabled=next_haptic,
                    updated_at=now,
                )
            )
        else:
            connection.execute(
                sa.update(user_settings_table)
                .where(user_settings_table.c.user_id == int(user_id))
                .values(
                    sound_enabled=next_sound,
                    haptic_enabled=next_haptic,
                    updated_at=now,
                )
            )

        return {
            "sound_enabled": next_sound,
            "haptic_enabled": next_haptic,
        }

    if conn is not None:
        return _run(conn)
    with engine.begin() as connection:
        return _run(connection)
