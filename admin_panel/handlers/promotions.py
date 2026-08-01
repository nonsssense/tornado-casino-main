from aiogram import F
from aiogram.types import CallbackQuery

from admin_panel.access import OWNER_ADMIN, STAFF
from admin_panel.helpers import clip, edit_or_answer, require_roles
from admin_panel.keyboards import btn, campaign_actions, promo_menu, with_nav
from admin_panel.services import promotions as promo_svc
from admin_panel.state import clear_pending, set_pending


def _campaign_list_keyboard(campaigns):
    lines = []
    for c in campaigns[:25]:
        flag = "✅" if c.enabled else "⏸"
        lines.append([btn(f"{flag} #{c.id} {c.code}"[:60], f"op:promo:view:{c.id}")])
    return with_nav(*lines, back="op:promo")


def register(dp):
    @dp.callback_query(F.data == "op:promo")
    @require_roles(*STAFF)
    async def promo_root(callback: CallbackQuery):
        clear_pending(callback.from_user.id)
        await edit_or_answer(
            callback.message,
            "🎁 Promotions\n\nCampaign Engine controls.",
            reply_markup=promo_menu(),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:promo:list")
    @require_roles(*STAFF)
    async def promo_list(callback: CallbackQuery):
        campaigns = promo_svc.list_campaigns()
        await edit_or_answer(
            callback.message,
            clip(promo_svc.format_campaign_list(campaigns)),
            reply_markup=_campaign_list_keyboard(campaigns),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:promo:stats")
    @require_roles(*STAFF)
    async def promo_stats(callback: CallbackQuery):
        stats = promo_svc.campaign_stats_summary()
        await edit_or_answer(
            callback.message,
            promo_svc.format_campaign_stats(stats),
            reply_markup=with_nav(back="op:promo"),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:promo:create")
    @require_roles(*OWNER_ADMIN)
    async def promo_create(callback: CallbackQuery):
        set_pending(callback.from_user.id, "create_campaign")
        await edit_or_answer(
            callback.message,
            "➕ Create Campaign\n\n"
            "Send: code|name|type|trigger|[json_config]\n\n"
            "Example:\n"
            "welcome_v1|Welcome Bonus|welcome|REGISTER|{}\n\n"
            "/cancel to abort.",
            reply_markup=with_nav(back="op:promo"),
        )
        await callback.answer()

    @dp.callback_query(F.data.startswith("op:promo:view:"))
    @require_roles(*STAFF)
    async def promo_view(callback: CallbackQuery):
        campaign_id = int(callback.data.split(":")[-1])
        detail = promo_svc.get_campaign_detail(campaign_id)
        if detail is None:
            await callback.answer("Campaign not found", show_alert=True)
            return
        await edit_or_answer(
            callback.message,
            clip(promo_svc.format_campaign_detail(detail)),
            reply_markup=campaign_actions(campaign_id),
        )
        await callback.answer()

    @dp.callback_query(F.data.startswith("op:promo:en:"))
    @require_roles(*OWNER_ADMIN)
    async def promo_enable(callback: CallbackQuery):
        campaign_id = int(callback.data.split(":")[-1])
        campaign = promo_svc.enable_campaign(campaign_id)
        if campaign is None:
            await callback.answer("Not found", show_alert=True)
            return
        await callback.answer("Enabled", show_alert=True)
        detail = promo_svc.get_campaign_detail(campaign_id)
        await edit_or_answer(
            callback.message,
            clip(promo_svc.format_campaign_detail(detail)),
            reply_markup=campaign_actions(campaign_id),
        )

    @dp.callback_query(F.data.startswith("op:promo:dis:"))
    @require_roles(*OWNER_ADMIN)
    async def promo_disable(callback: CallbackQuery):
        campaign_id = int(callback.data.split(":")[-1])
        campaign = promo_svc.disable_campaign(campaign_id)
        if campaign is None:
            await callback.answer("Not found", show_alert=True)
            return
        await callback.answer("Disabled", show_alert=True)
        detail = promo_svc.get_campaign_detail(campaign_id)
        await edit_or_answer(
            callback.message,
            clip(promo_svc.format_campaign_detail(detail)),
            reply_markup=campaign_actions(campaign_id),
        )

    @dp.callback_query(F.data.startswith("op:promo:arch:"))
    @require_roles(*OWNER_ADMIN)
    async def promo_archive(callback: CallbackQuery):
        campaign_id = int(callback.data.split(":")[-1])
        campaign = promo_svc.archive_campaign(campaign_id)
        if campaign is None:
            await callback.answer("Not found", show_alert=True)
            return
        await callback.answer("Archived", show_alert=True)
        detail = promo_svc.get_campaign_detail(campaign_id)
        await edit_or_answer(
            callback.message,
            clip(promo_svc.format_campaign_detail(detail)),
            reply_markup=campaign_actions(campaign_id),
        )
