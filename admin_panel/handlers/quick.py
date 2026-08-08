"""Reply-keyboard launcher: maps the persistent bottom buttons to sections.

Registered BEFORE the pending-input router so these exact labels take priority;
any other text still falls through to input_router.
"""

from aiogram import F
from aiogram.types import Message

from admin_panel.access import STAFF, get_role
from admin_panel.helpers import clip, require_roles
from admin_panel.keyboards import (
    BTN_ANALYTICS,
    BTN_DASH,
    BTN_MENU,
    BTN_PAYMENTS,
    BTN_PLAYERS,
    BTN_PROMO,
    BTN_SEARCH,
    BTN_SETTINGS,
    main_menu,
    payments_menu,
    players_menu,
    promo_menu,
    settings_menu,
    with_nav,
)
from admin_panel.services.analytics import format_analytics, get_analytics
from admin_panel.services.dashboard import format_dashboard, get_dashboard_stats
from admin_panel.state import clear_pending, set_pending


def register(dp):
    @dp.message(F.text == BTN_DASH)
    @require_roles(*STAFF)
    async def q_dashboard(message: Message):
        clear_pending(message.from_user.id)
        await message.answer(
            clip(format_dashboard(get_dashboard_stats())),
            reply_markup=with_nav(back="op:home"),
        )

    @dp.message(F.text == BTN_ANALYTICS)
    @require_roles(*STAFF)
    async def q_analytics(message: Message):
        clear_pending(message.from_user.id)
        await message.answer(
            clip(format_analytics(get_analytics())),
            reply_markup=with_nav(back="op:home"),
        )

    @dp.message(F.text == BTN_PLAYERS)
    @require_roles(*STAFF)
    async def q_players(message: Message):
        clear_pending(message.from_user.id)
        await message.answer("👤 Players", reply_markup=players_menu())

    @dp.message(F.text == BTN_PAYMENTS)
    @require_roles(*STAFF)
    async def q_payments(message: Message):
        clear_pending(message.from_user.id)
        await message.answer(
            "💳 Payments\n\nDeposits and withdrawals.",
            reply_markup=payments_menu(),
        )

    @dp.message(F.text == BTN_PROMO)
    @require_roles(*STAFF)
    async def q_promo(message: Message):
        clear_pending(message.from_user.id)
        await message.answer("🎁 Promotions", reply_markup=promo_menu())

    @dp.message(F.text == BTN_SETTINGS)
    @require_roles(*STAFF)
    async def q_settings(message: Message):
        clear_pending(message.from_user.id)
        await message.answer("⚙ Settings", reply_markup=settings_menu())

    @dp.message(F.text == BTN_SEARCH)
    @require_roles(*STAFF)
    async def q_search(message: Message):
        set_pending(message.from_user.id, "universal_search")
        await message.answer(
            "🔍 Universal Search\n\n"
            "Send one of:\n"
            "• Telegram ID / User ID / @username / referral code\n"
            "• Deposit ID (or d:123)\n"
            "• Withdrawal ID (or w:123)\n"
            "• Transaction ID (or t:123)\n\n"
            "/cancel to abort.",
            reply_markup=with_nav(back="op:home"),
        )

    @dp.message(F.text == BTN_MENU)
    @require_roles(*STAFF)
    async def q_menu(message: Message):
        clear_pending(message.from_user.id)
        role = get_role(message.from_user.id)
        await message.answer(
            f"Tornado Operator Panel\n\nRole: {str(role).upper()}",
            reply_markup=main_menu(),
        )
