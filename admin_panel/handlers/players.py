from aiogram import F
from aiogram.types import CallbackQuery

from admin_panel.access import OWNER_ADMIN, STAFF
from admin_panel.helpers import clip, edit_or_answer, require_roles
from admin_panel.keyboards import btn, player_actions, players_menu, with_nav
from admin_panel.services import players as player_svc
from admin_panel.state import clear_pending, set_pending


def _player_list_keyboard(rows: list[dict], back: str):
    lines = []
    for row in rows[:20]:
        uid = row["id"]
        label = f"#{uid} @{row.get('username') or '—'} tg={row.get('tg_id')}"
        lines.append([btn(label[:60], f"op:p:view:{uid}")])
    return with_nav(*lines, back=back)


def register(dp):
    @dp.callback_query(F.data == "op:players")
    @require_roles(*STAFF)
    async def players_root(callback: CallbackQuery):
        clear_pending(callback.from_user.id)
        await edit_or_answer(
            callback.message,
            "👤 Players\n\nSearch or browse player lists.",
            reply_markup=players_menu(),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:players:search")
    @require_roles(*STAFF)
    async def players_search(callback: CallbackQuery):
        set_pending(callback.from_user.id, "player_search")
        await edit_or_answer(
            callback.message,
            "🔍 Search Player\n\nSend Telegram ID, User ID, @username, or referral code.\n"
            "/cancel to abort.",
            reply_markup=with_nav(back="op:players"),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:players:online")
    @require_roles(*STAFF)
    async def players_online(callback: CallbackQuery):
        rows = player_svc.list_online_players()
        text = "🟢 Online Players\n\n" + (
            "\n".join(
                f"#{r['id']} @{r.get('username') or '—'} | {r.get('last_activity')}"
                for r in rows
            )
            or "Nobody online."
        )
        await edit_or_answer(
            callback.message,
            clip(text),
            reply_markup=_player_list_keyboard(rows, "op:players"),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:players:top")
    @require_roles(*STAFF)
    async def players_top(callback: CallbackQuery):
        rows = player_svc.list_top_players()
        text = "⭐ Top Players\n\n" + (
            "\n".join(
                f"#{r['id']} @{r.get('username') or '—'} | "
                f"real=${float(r.get('real_balance') or 0):.2f}"
                for r in rows
            )
            or "No players."
        )
        await edit_or_answer(
            callback.message,
            clip(text),
            reply_markup=_player_list_keyboard(rows, "op:players"),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:players:banned")
    @require_roles(*STAFF)
    async def players_banned(callback: CallbackQuery):
        rows = player_svc.list_banned_players()
        text = "🚫 Banned Players\n\n" + (
            "\n".join(
                f"#{r['id']} @{r.get('username') or '—'} tg={r.get('tg_id')}"
                for r in rows
            )
            or "No banned players."
        )
        await edit_or_answer(
            callback.message,
            clip(text),
            reply_markup=_player_list_keyboard(rows, "op:players"),
        )
        await callback.answer()

    @dp.callback_query(F.data.startswith("op:p:view:"))
    @require_roles(*STAFF)
    async def player_view(callback: CallbackQuery):
        user_id = int(callback.data.split(":")[-1])
        profile = player_svc.build_player_profile(user_id)
        if profile is None:
            await callback.answer("Player not found", show_alert=True)
            return
        await edit_or_answer(
            callback.message,
            clip(player_svc.format_player_profile(profile)),
            reply_markup=player_actions(user_id),
        )
        await callback.answer()

    @dp.callback_query(F.data.startswith("op:p:add:"))
    @require_roles(*OWNER_ADMIN)
    async def player_add(callback: CallbackQuery):
        user_id = int(callback.data.split(":")[-1])
        set_pending(callback.from_user.id, "add_balance", user_id=user_id)
        await edit_or_answer(
            callback.message,
            f"➕ Add Balance to user #{user_id}\n\nSend amount in USD.\n/cancel to abort.",
            reply_markup=with_nav(back=f"op:p:view:{user_id}"),
        )
        await callback.answer()

    @dp.callback_query(F.data.startswith("op:p:rem:"))
    @require_roles(*OWNER_ADMIN)
    async def player_rem(callback: CallbackQuery):
        user_id = int(callback.data.split(":")[-1])
        set_pending(callback.from_user.id, "remove_balance", user_id=user_id)
        await edit_or_answer(
            callback.message,
            f"➖ Remove Balance from user #{user_id}\n\nSend amount in USD.\n/cancel to abort.",
            reply_markup=with_nav(back=f"op:p:view:{user_id}"),
        )
        await callback.answer()

    @dp.callback_query(F.data.startswith("op:p:bonus:"))
    @require_roles(*OWNER_ADMIN)
    async def player_bonus(callback: CallbackQuery):
        user_id = int(callback.data.split(":")[-1])
        set_pending(callback.from_user.id, "grant_bonus", user_id=user_id)
        await edit_or_answer(
            callback.message,
            f"🎁 Grant Bonus to user #{user_id}\n\n"
            "Send: principal  OR  principal|wager_multiplier\n"
            "Example: 10|5\n/cancel to abort.",
            reply_markup=with_nav(back=f"op:p:view:{user_id}"),
        )
        await callback.answer()

    @dp.callback_query(F.data.startswith("op:p:ban:"))
    @require_roles(*OWNER_ADMIN)
    async def player_ban(callback: CallbackQuery):
        user_id = int(callback.data.split(":")[-1])
        result = player_svc.set_ban_status(user_id, True)
        if not result.get("ok"):
            await callback.answer(result.get("error", "Failed"), show_alert=True)
            return
        await callback.answer("Banned", show_alert=True)
        profile = player_svc.build_player_profile(user_id)
        await edit_or_answer(
            callback.message,
            clip(player_svc.format_player_profile(profile)),
            reply_markup=player_actions(user_id),
        )

    @dp.callback_query(F.data.startswith("op:p:unban:"))
    @require_roles(*OWNER_ADMIN)
    async def player_unban(callback: CallbackQuery):
        user_id = int(callback.data.split(":")[-1])
        result = player_svc.set_ban_status(user_id, False)
        if not result.get("ok"):
            await callback.answer(result.get("error", "Failed"), show_alert=True)
            return
        await callback.answer("Unbanned", show_alert=True)
        profile = player_svc.build_player_profile(user_id)
        await edit_or_answer(
            callback.message,
            clip(player_svc.format_player_profile(profile)),
            reply_markup=player_actions(user_id),
        )
