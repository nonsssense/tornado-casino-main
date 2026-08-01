from __future__ import annotations

from functools import wraps

from aiogram.types import CallbackQuery, Message

from admin_panel.access import has_role, is_whitelisted


def require_whitelist(handler):
    @wraps(handler)
    async def wrapper(event, *args, **kwargs):
        uid = event.from_user.id
        if not is_whitelisted(uid):
            if isinstance(event, CallbackQuery):
                await event.answer("Access denied", show_alert=True)
            else:
                await event.answer("⛔ Access denied.")
            return None
        return await handler(event, *args, **kwargs)

    return wrapper


def require_roles(*roles: str):
    def decorator(handler):
        @wraps(handler)
        async def wrapper(event, *args, **kwargs):
            uid = event.from_user.id
            if not has_role(uid, *roles):
                if isinstance(event, CallbackQuery):
                    await event.answer("Access denied", show_alert=True)
                else:
                    await event.answer("⛔ Access denied.")
                return None
            return await handler(event, *args, **kwargs)

        return wrapper

    return decorator


async def edit_or_answer(message: Message, text: str, reply_markup=None) -> None:
    text = (text or "")[:4000]
    try:
        await message.edit_text(text, reply_markup=reply_markup)
    except Exception:
        await message.answer(text, reply_markup=reply_markup)


def money(value) -> str:
    try:
        return f"{float(value or 0):.2f}"
    except (TypeError, ValueError):
        return "0.00"


def clip(text: str, limit: int = 3500) -> str:
    text = text or ""
    if len(text) <= limit:
        return text
    return text[: limit - 20] + "\n… (truncated)"
