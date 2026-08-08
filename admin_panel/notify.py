from __future__ import annotations

from config import white_ids
from log_manager import log

# Roles that should receive operational alerts (withdrawals, payment problems, …).
NOTIFY_ROLES = ("owner", "admin")


def _notify_targets() -> list[int]:
    """Telegram ids of staff who should receive admin alerts."""
    return [int(tg_id) for tg_id, role in white_ids.items() if role in NOTIFY_ROLES]


async def notify_admins(text: str) -> None:
    """Fire-and-forget Telegram alert to owner/admin staff via the admin bot.

    Never raises: notifications are best-effort and must not break the flow that
    triggered them (deposit/withdraw creation, monitors, …).
    """
    # Lazy import keeps this module free of aiogram/bot import cycles.
    from admin_bot import admin_bot
    from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError

    for tg_id in _notify_targets():
        try:
            await admin_bot.send_message(tg_id, text)
        except (TelegramBadRequest, TelegramForbiddenError) as exc:
            # Benign & expected: the recipient never pressed /start on this bot
            # ("chat not found") or blocked it. Log at WARNING (not ERROR) so the
            # alert log-handler doesn't forward it back and loop.
            log.warning(f"notify_admins skipped | tg_id={tg_id} | {exc}")
        except Exception as exc:
            log.warning(f"notify_admins failed | tg_id={tg_id} | {exc}")
