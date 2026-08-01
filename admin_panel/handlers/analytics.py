from aiogram import F
from aiogram.types import CallbackQuery

from admin_panel.access import STAFF
from admin_panel.helpers import clip, edit_or_answer, require_roles
from admin_panel.keyboards import with_nav
from admin_panel.services.analytics import format_analytics, get_analytics


def register(dp):
    @dp.callback_query(F.data == "op:analytics")
    @require_roles(*STAFF)
    async def analytics(callback: CallbackQuery):
        data = get_analytics()
        await edit_or_answer(
            callback.message,
            clip(format_analytics(data)),
            reply_markup=with_nav(back="op:home"),
        )
        await callback.answer()
