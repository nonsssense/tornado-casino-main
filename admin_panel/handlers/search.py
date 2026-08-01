from aiogram import F
from aiogram.types import CallbackQuery

from admin_panel.access import STAFF
from admin_panel.helpers import edit_or_answer, require_roles
from admin_panel.keyboards import with_nav
from admin_panel.state import set_pending


def register(dp):
    @dp.callback_query(F.data == "op:search")
    @require_roles(*STAFF)
    async def search_start(callback: CallbackQuery):
        set_pending(callback.from_user.id, "universal_search")
        await edit_or_answer(
            callback.message,
            "🔍 Universal Search\n\n"
            "Send one of:\n"
            "• Telegram ID / User ID / @username / referral code\n"
            "• Deposit ID (or d:123)\n"
            "• Withdrawal ID (or w:123)\n"
            "• Transaction ID (or t:123)\n\n"
            "/cancel to abort.",
            reply_markup=with_nav(back="op:home"),
        )
        await callback.answer()
