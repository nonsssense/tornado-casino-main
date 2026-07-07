from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message
from log_manager import log

router = Router()


@router.message(CommandStart())
async def start(message: Message):
    user_id = message.from_user.id if message.from_user else None
    log.info(f"Received /start command (router) | telegram_id={user_id}")
    await message.answer(
        "Добро пожаловать!"
    )
