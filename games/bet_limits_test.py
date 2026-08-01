"""Unit tests for server-side game bet limits."""

import unittest

from fastapi import HTTPException

from games.bet_limits import (
    validate_crash_bet,
    validate_dice_bet,
    validate_plinko_bet,
)


class BetLimitValidationTests(unittest.TestCase):
    def test_dice_rejects_below_min_and_above_max(self):
        with self.assertRaises(HTTPException) as raised:
            validate_dice_bet(0.09)
        self.assertEqual(raised.exception.status_code, 400)

        with self.assertRaises(HTTPException) as raised:
            validate_dice_bet(5.01)
        self.assertEqual(raised.exception.status_code, 400)

        self.assertEqual(validate_dice_bet(0.1), 0.1)
        self.assertEqual(validate_dice_bet(5), 5.0)

    def test_plinko_max_depends_on_risk(self):
        self.assertEqual(validate_plinko_bet(5, "high"), 5.0)
        with self.assertRaises(HTTPException):
            validate_plinko_bet(5.01, "high")

        self.assertEqual(validate_plinko_bet(20, "medium"), 20.0)
        with self.assertRaises(HTTPException):
            validate_plinko_bet(20.01, "medium")

        self.assertEqual(validate_plinko_bet(80, "low"), 80.0)
        with self.assertRaises(HTTPException):
            validate_plinko_bet(80.01, "low")

        with self.assertRaises(HTTPException):
            validate_plinko_bet(1, "extreme")

    def test_crash_enforces_slot_and_total_caps(self):
        with self.assertRaises(HTTPException):
            validate_crash_bet(5.0)

        self.assertEqual(validate_crash_bet(4.9), 4.9)
        self.assertEqual(validate_crash_bet(0.1, existing_total=4.9), 0.1)

        with self.assertRaises(HTTPException) as raised:
            validate_crash_bet(0.2, existing_total=4.9)
        self.assertEqual(raised.exception.status_code, 400)

        with self.assertRaises(HTTPException):
            validate_crash_bet(2.5, existing_total=3.0)


if __name__ == "__main__":
    unittest.main()
