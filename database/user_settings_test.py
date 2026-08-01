"""Tests for user preference settings defaults and upsert semantics."""

import unittest
from unittest.mock import patch

from database import user_settings as settings_mod


class _FakeResult:
    def __init__(self, row=None):
        self._row = row

    def mappings(self):
        return self

    def first(self):
        return self._row


class _FakeConnection:
    def __init__(self):
        self.row = None
        self.writes = []

    def execute(self, stmt):
        sql = str(stmt)
        if "INSERT" in sql.upper() or hasattr(stmt, "table"):
            # Treat insert/update as write; select returns current row.
            compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
            if "INSERT" in compiled.upper():
                self.writes.append(("insert", stmt))
                # Simulate stored row after insert via values inspection is hard;
                # tests patch get_user_settings / use in-memory row.
                return _FakeResult(None)
            if "UPDATE" in compiled.upper():
                self.writes.append(("update", stmt))
                return _FakeResult(None)
        return _FakeResult(self.row)


class UserSettingsTests(unittest.TestCase):
    def test_default_settings_when_row_missing(self):
        self.assertEqual(
            settings_mod._row_to_settings(None),
            {"sound_enabled": True, "haptic_enabled": True},
        )

    def test_row_to_settings_reads_booleans(self):
        self.assertEqual(
            settings_mod._row_to_settings(
                {"sound_enabled": False, "haptic_enabled": True}
            ),
            {"sound_enabled": False, "haptic_enabled": True},
        )

    def test_update_preserves_unspecified_fields(self):
        conn = object()

        with patch.object(
            settings_mod,
            "get_user_settings",
            return_value={"sound_enabled": True, "haptic_enabled": True},
        ), patch.object(settings_mod, "ensure_user_settings_schema"), patch.object(
            settings_mod,
            "engine",
        ) as engine:
            # Drive update through conn path with a minimal fake connection.
            class _Conn:
                def __init__(self):
                    self.ops = []

                def execute(self, stmt):
                    compiled = str(
                        stmt.compile(compile_kwargs={"literal_binds": True})
                    ).upper()
                    self.ops.append(compiled)
                    if "SELECT" in compiled and "USER_ID" in compiled:
                        return _FakeResult({"user_id": 7})
                    return _FakeResult(None)

            fake = _Conn()
            result = settings_mod.update_user_settings(
                7,
                sound_enabled=False,
                haptic_enabled=None,
                conn=fake,
            )

            self.assertEqual(
                result,
                {"sound_enabled": False, "haptic_enabled": True},
            )
            self.assertTrue(any("UPDATE" in op for op in fake.ops))
            engine.begin.assert_not_called()


if __name__ == "__main__":
    unittest.main()
