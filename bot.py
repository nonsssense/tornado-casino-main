from aiogram import Bot, Dispatcher
from aiogram.types import Message, FSInputFile
from aiogram.filters import CommandStart
from config import bot_token
from log_manager import log

if bot_token is None:
    log.error("Bot token is not configured")
else:
    casino_bot = Bot(token=bot_token)
    log.info("Telegram bot instance created")

casino_dp = Dispatcher()


@casino_dp.message(CommandStart())
async def start(message: Message):
    user_id = message.from_user.id if message.from_user else None
    log.info(f"Received /start command | telegram_id={user_id}")

    banner = FSInputFile("tg_static/main tornado banner.png")

    text = (
        "🌪 <b>Добро пожаловать в Tornado!</b>\n\n"
        "Tornado создан для тех, кто ценит скорость, простоту и честную игру. "
        "Здесь игра начинается уже через несколько секунд.\n\n"

        "<b>Почему Tornado — это другой игровой опыт?</b>\n\n"

        "⚡ <b>Скорость во всём</b> — начинай играть уже через несколько секунд.\n\n"

        "🎮 <b>Максимум простоты</b> — минимум действий, максимум игры.\n\n"

        "🔒 <b>Честность, которую можно проверить</b> — если захочешь убедиться "
        "в результате, ты сможешь сделать это самостоятельно.\n\n"

        "🤝 <b>Доверие в каждой детали</b> — если возникнет вопрос, мы всегда поможем разобраться.\n\n"

        "🎁 <b>Большой приветственный бонус</b> — чтобы начать игру было ещё интереснее.\n\n"

        "🎉 <b>Подарки и приятные сюрпризы</b> — для новых игроков и тех, кто остаётся с нами.\n\n"

        "Заходи и закручивай <b>Tornado</b> вместе с нами. 🌪"
    )

    try:
        await message.answer_photo(
            photo=banner,
            caption=text,
            parse_mode="HTML"
        )
    except Exception:
        log.exception(f"Failed to send /start response | telegram_id={user_id}")
        raise
