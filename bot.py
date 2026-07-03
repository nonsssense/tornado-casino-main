from aiogram import Bot, Dispatcher
from aiogram.types import Message
from aiogram.filters import CommandStart
import asyncio
from config import bot_token

if bot_token is None:
    print(bot_token)
    #raise ValueError("BOT_TOKEN is not set in the environment variables.")
else:
    bot = Bot(token=bot_token)
dp = Dispatcher()

@dp.message(CommandStart())
async def start(message: Message):
    await message.answer('Hello!')

    