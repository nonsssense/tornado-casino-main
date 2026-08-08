from aiogram import F
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from admin_panel.access import STAFF, get_role
from admin_panel.helpers import edit_or_answer, require_roles, require_whitelist
from admin_panel.keyboards import main_menu, main_reply_kb
from admin_panel.state import clear_pending


def register(dp):
    @dp.message(Command("start"))
    @require_whitelist
    async def start(message: Message):
        clear_pending(message.from_user.id)
        role = get_role(message.from_user.id)
        # Show the persistent bottom launcher once, then the inline menu.
        await message.answer(
            f"Tornado Operator Panel\n\nRole: {str(role).upper()}",
            reply_markup=main_reply_kb(),
        )
        await message.answer("Choose a section:", reply_markup=main_menu())

    @dp.message(Command("cancel"))
    @require_whitelist
    async def cancel(message: Message):
        clear_pending(message.from_user.id)
        await message.answer("Cancelled.", reply_markup=main_menu())

    @dp.callback_query(F.data == "op:home")
    @require_roles(*STAFF)
    async def home(callback: CallbackQuery):
        clear_pending(callback.from_user.id)
        role = get_role(callback.from_user.id)
        await edit_or_answer(
            callback.message,
            f"Tornado Operator Panel\n\nRole: {str(role).upper()}",
            reply_markup=main_menu(),
        )
        await callback.answer()

    # Keep legacy "menu" callback working.
    @dp.callback_query(F.data == "menu")
    @require_roles(*STAFF)
    async def legacy_menu(callback: CallbackQuery):
        await home(callback)
