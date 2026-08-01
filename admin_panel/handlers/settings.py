from aiogram import F
from aiogram.types import CallbackQuery

from admin_panel.access import OWNER_ADMIN
from admin_panel.helpers import edit_or_answer, require_roles
from admin_panel.keyboards import settings_menu, with_nav
from config import white_ids


def register(dp):
    @dp.callback_query(F.data == "op:settings")
    @require_roles(*OWNER_ADMIN)
    async def settings_root(callback: CallbackQuery):
        await edit_or_answer(
            callback.message,
            "⚙ Settings\n\nBasic configuration placeholders.",
            reply_markup=settings_menu(),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:set:ref")
    @require_roles(*OWNER_ADMIN)
    async def settings_ref(callback: CallbackQuery):
        await edit_or_answer(
            callback.message,
            "Referral Settings\n\n"
            "Managed by ReferralManager / config constants.\n"
            "Advanced editor — planned.",
            reply_markup=with_nav(back="op:settings"),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:set:maint")
    @require_roles(*OWNER_ADMIN)
    async def settings_maint(callback: CallbackQuery):
        await edit_or_answer(
            callback.message,
            "Maintenance Mode\n\nPlaceholder — not wired yet.",
            reply_markup=with_nav(back="op:settings"),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:set:broadcast")
    @require_roles(*OWNER_ADMIN)
    async def settings_broadcast(callback: CallbackQuery):
        await edit_or_answer(
            callback.message,
            "Broadcast\n\nPlaceholder — not wired yet.",
            reply_markup=with_nav(back="op:settings"),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:set:admins")
    @require_roles(*OWNER_ADMIN)
    async def settings_admins(callback: CallbackQuery):
        lines = ["Admin Users\n"]
        for tg_id, role in sorted(white_ids.items(), key=lambda x: str(x[1])):
            lines.append(f"  {tg_id}: {role}")
        await edit_or_answer(
            callback.message,
            "\n".join(lines) if len(lines) > 1 else "Admin Users\n\n(empty whitelist)",
            reply_markup=with_nav(back="op:settings"),
        )
        await callback.answer()
