"""Server-side bet amount limits — single enforcement path for all games."""

from __future__ import annotations

import math

from fastapi import HTTPException

from config import (
    BET_MIN,
    CRASH_BET_MAX_PER_SLOT,
    CRASH_BET_MAX_TOTAL,
    DICE_BET_MAX,
    PLINKO_BET_MAX_BY_RISK,
)


def _to_cents(amount: float) -> int:
    return int(round(float(amount) * 100))


def _parse_amount(amount) -> float:
    try:
        value = float(amount)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid bet amount") from exc
    if not math.isfinite(value):
        raise HTTPException(status_code=400, detail="Invalid bet amount")
    return value


def _reject_below_min(amount_cents: int) -> None:
    if amount_cents < _to_cents(BET_MIN):
        raise HTTPException(
            status_code=400,
            detail=f"Minimum bet is ${BET_MIN:.2f}",
        )


def _reject_above_max(amount_cents: int, maximum: float) -> None:
    if amount_cents > _to_cents(maximum):
        raise HTTPException(
            status_code=400,
            detail=f"Maximum bet is ${maximum:.2f}",
        )


def validate_dice_bet(amount) -> float:
    value = _parse_amount(amount)
    cents = _to_cents(value)
    _reject_below_min(cents)
    _reject_above_max(cents, DICE_BET_MAX)
    return value


def validate_plinko_bet(amount, risk_mode) -> float:
    value = _parse_amount(amount)
    mode = str(risk_mode or "").strip().lower()
    maximum = PLINKO_BET_MAX_BY_RISK.get(mode)
    if maximum is None:
        raise HTTPException(status_code=400, detail="Invalid Plinko risk mode")

    cents = _to_cents(value)
    _reject_below_min(cents)
    _reject_above_max(cents, maximum)
    return value


def validate_crash_bet(amount, existing_total: float = 0.0) -> float:
    """Validate one Crash slot against per-slot and combined round totals."""
    value = _parse_amount(amount)
    cents = _to_cents(value)
    _reject_below_min(cents)
    _reject_above_max(cents, CRASH_BET_MAX_PER_SLOT)

    existing = _parse_amount(existing_total)
    if existing < 0:
        existing = 0.0

    combined_cents = _to_cents(existing) + cents
    if combined_cents > _to_cents(CRASH_BET_MAX_TOTAL):
        remaining = max(0.0, CRASH_BET_MAX_TOTAL - existing)
        raise HTTPException(
            status_code=400,
            detail=(
                f"Crash bets may not exceed ${CRASH_BET_MAX_TOTAL:.2f} total "
                f"(${remaining:.2f} remaining)"
            ),
        )
    return value
