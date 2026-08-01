"""Lightweight pending-input state for operator flows (no FSM package required)."""

from __future__ import annotations

_pending: dict[int, dict] = {}


def set_pending(admin_tg_id: int, action: str, **payload) -> None:
    _pending[int(admin_tg_id)] = {"action": action, **payload}


def get_pending(admin_tg_id: int) -> dict | None:
    return _pending.get(int(admin_tg_id))


def clear_pending(admin_tg_id: int) -> None:
    _pending.pop(int(admin_tg_id), None)
