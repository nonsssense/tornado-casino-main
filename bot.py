from aiogram import Bot, Dispatcher, F
from aiogram.types import (
    Message,
    FSInputFile,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
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


# --------------------------- Withdrawal step-up confirmation -------------------
# A withdrawal is created in a security-UNCONFIRMED state; the account owner must
# confirm it here, from their own Telegram account, before an admin can pay it out.

_CONFIRM_ERRORS = {
    "not_found": "⚠️ This withdrawal was not found.",
    "not_pending": "⚠️ This withdrawal is no longer pending and cannot be confirmed.",
    "already_confirmed": "✅ This withdrawal was already confirmed.",
    "expired": "⌛ This confirmation has expired. Please create a new withdrawal.",
    "changed": "⚠️ Withdrawal details changed — confirmation is no longer valid.",
    "invalid": "⚠️ This confirmation link is invalid.",
}


async def send_withdraw_confirmation(tg_id, withdraw_id, token, amount, coin, address):
    """Send the withdrawal confirmation prompt to the user's Telegram account.

    Returns True when delivered, False otherwise (e.g. the user has not started the
    bot / blocked it). The caller releases the hold when delivery fails.
    """
    if casino_bot is None or not tg_id or not token:
        return False

    short_addr = address if len(address) <= 24 else f"{address[:12]}…{address[-8:]}"
    text = (
        "🔐 <b>Confirm your withdrawal</b>\n\n"
        f"Amount: <b>${float(amount):.2f}</b>\n"
        f"Asset: <b>{coin}</b>\n"
        f"Address: <code>{short_addr}</code>\n\n"
        "Only confirm if you requested this. If this wasn't you, tap Cancel and "
        "review your account security."
    )
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(
                text="✅ Confirm",
                callback_data=f"wd:c:{withdraw_id}:{token}",
            ),
            InlineKeyboardButton(
                text="❌ Cancel",
                callback_data=f"wd:x:{withdraw_id}:{token}",
            ),
        ]]
    )
    try:
        await casino_bot.send_message(
            chat_id=int(tg_id), text=text, parse_mode="HTML", reply_markup=keyboard
        )
        return True
    except Exception:
        log.exception(f"Withdraw confirmation send failed | tg_id={tg_id} | wd={withdraw_id}")
        return False


def _parse_withdraw_callback(data: str):
    parts = (data or "").split(":", 3)
    if len(parts) != 4:
        return None, None
    try:
        return int(parts[2]), parts[3]
    except (TypeError, ValueError):
        return None, None


@casino_dp.callback_query(F.data.startswith("wd:c:"))
async def confirm_withdraw_callback(callback: CallbackQuery):
    from database.user_db import get_user_id_by_telegram_id
    from payments.withdraw import WithdrawManager

    withdraw_id, token = _parse_withdraw_callback(callback.data or "")
    tg_id = callback.from_user.id if callback.from_user else None
    user_id = get_user_id_by_telegram_id(tg_id)

    if withdraw_id is None or token is None or user_id is None:
        await callback.answer("Invalid request", show_alert=True)
        return

    result = WithdrawManager(user_id).confirmWithdraw(withdraw_id, token)

    if result.get("ok"):
        try:
            await callback.message.edit_text(
                "✅ Withdrawal confirmed. It is now queued for manual review and payout."
            )
        except Exception:
            pass
        await callback.answer("Confirmed")
        await _notify_admins_withdraw(withdraw_id)
    else:
        msg = _CONFIRM_ERRORS.get(result.get("error"), "⚠️ Could not confirm this withdrawal.")
        try:
            await callback.message.edit_text(msg)
        except Exception:
            pass
        await callback.answer()


@casino_dp.callback_query(F.data.startswith("wd:x:"))
async def cancel_withdraw_callback(callback: CallbackQuery):
    from database.user_db import get_user_id_by_telegram_id
    from payments.withdraw import WithdrawManager

    withdraw_id, token = _parse_withdraw_callback(callback.data or "")
    tg_id = callback.from_user.id if callback.from_user else None
    user_id = get_user_id_by_telegram_id(tg_id)

    if withdraw_id is None or user_id is None:
        await callback.answer("Invalid request", show_alert=True)
        return

    result = WithdrawManager(user_id).cancelWithdrawByUser(withdraw_id)
    text = (
        "❌ Withdrawal cancelled and funds released back to your balance."
        if result.get("ok")
        else "⚠️ This withdrawal can no longer be cancelled."
    )
    try:
        await callback.message.edit_text(text)
    except Exception:
        pass
    await callback.answer()


async def _notify_admins_withdraw(withdraw_id):
    """Alert staff that a confirmed withdrawal is ready for manual payout."""
    try:
        from admin_panel.notify import notify_admins
        from admin_panel.services import payments as pay_svc
        from payments.withdraw import WithdrawManager

        row = WithdrawManager.getWithdraw(withdraw_id)
        if row is not None:
            await notify_admins(pay_svc.build_withdraw_alert(dict(row)))
    except Exception:
        log.exception(f"Withdraw admin alert failed | withdraw_id={withdraw_id}")
