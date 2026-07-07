import asyncio

from bot import dp, bot
from log_manager import log

async def main():
    log.info("Bot started, beginning polling...")
    try:
        await dp.start_polling(bot)
    except Exception:
        log.exception("Telegram bot polling failed")
        raise

if __name__ == "__main__":
    asyncio.run(main())

    