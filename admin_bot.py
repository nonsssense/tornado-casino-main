"""Tornado Operator Telegram bot (existing admin bot entrypoint)."""

from config import admin_bot_token
from aiogram import Bot, Dispatcher
from admin_panel import register_handlers

admin_bot = Bot(admin_bot_token)
admin_dp = Dispatcher()
register_handlers(admin_dp)


async def main():
    await admin_dp.start_polling(admin_bot)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
