from aiogram import F
from aiogram.types import CallbackQuery

from admin_panel.access import STAFF
from admin_panel.helpers import edit_or_answer, require_roles
from admin_panel.keyboards import with_nav
from admin_panel.services.dashboard import format_dashboard, get_dashboard_stats


def register(dp):
    @dp.callback_query(F.data == "op:dash")
    @require_roles(*STAFF)
    async def dashboard(callback: CallbackQuery):
        stats = get_dashboard_stats()
        await edit_or_answer(
            callback.message,
            format_dashboard(stats),
            reply_markup=with_nav(back="op:home"),
        )
        await callback.answer()
