from aiogram import F
from aiogram.types import Message

from admin_panel.access import OWNER_ADMIN, STAFF, has_role
from admin_panel.helpers import clip, require_roles
from admin_panel.keyboards import (
    btn,
    campaign_actions,
    main_menu,
    player_actions,
    players_menu,
    promo_menu,
    with_nav,
    withdraw_actions,
)
from admin_panel.services import payments as pay_svc
from admin_panel.services import players as player_svc
from admin_panel.services import promotions as promo_svc
from admin_panel.services import search as search_svc
from admin_panel.state import clear_pending, get_pending


def register(dp):
    @dp.message(F.text)
    @require_roles(*STAFF)
    async def pending_text(message: Message):
        if message.text and message.text.startswith("/"):
            return

        pending = get_pending(message.from_user.id)
        if not pending:
            return

        action = pending.get("action")

        if action == "player_search":
            clear_pending(message.from_user.id)
            player = player_svc.find_player(message.text)
            if player is None:
                await message.answer("Player not found.", reply_markup=players_menu())
                return
            profile = player_svc.build_player_profile(player["id"])
            await message.answer(
                clip(player_svc.format_player_profile(profile)),
                reply_markup=player_actions(player["id"]),
            )
            return

        if action in {"add_balance", "remove_balance"}:
            if not has_role(message.from_user.id, *OWNER_ADMIN):
                clear_pending(message.from_user.id)
                await message.answer("Access denied.", reply_markup=main_menu())
                return
            try:
                amount = float(message.text.replace(",", ".").strip())
            except ValueError:
                await message.answer("Invalid amount. Send a number.")
                return
            if amount <= 0:
                await message.answer("Amount must be > 0.")
                return
            if action == "remove_balance":
                amount = -amount
            user_id = int(pending["user_id"])
            clear_pending(message.from_user.id)
            result = player_svc.adjust_real_balance(
                user_id, amount, admin_tg_id=message.from_user.id
            )
            if not result.get("ok"):
                await message.answer(
                    f"Failed: {result.get('error')}",
                    reply_markup=player_actions(user_id),
                )
                return
            bal = result["balances"]
            await message.answer(
                f"Done. Real balance: ${float(bal['real_balance']):.2f}",
                reply_markup=player_actions(user_id),
            )
            return

        if action == "grant_bonus":
            if not has_role(message.from_user.id, *OWNER_ADMIN):
                clear_pending(message.from_user.id)
                await message.answer("Access denied.", reply_markup=main_menu())
                return
            parts = [p.strip() for p in message.text.split("|")]
            try:
                principal = float(parts[0].replace(",", "."))
                wager_mult = float(parts[1].replace(",", ".")) if len(parts) > 1 else 1.0
            except ValueError:
                await message.answer("Invalid format. Example: 10|5")
                return
            user_id = int(pending["user_id"])
            clear_pending(message.from_user.id)
            result = player_svc.grant_bonus(user_id, principal, wager_mult)
            if not result.get("ok"):
                await message.answer(
                    f"Failed: {result.get('error')}",
                    reply_markup=player_actions(user_id),
                )
                return
            await message.answer(
                f"Bonus granted. instance_id={result.get('instance_id')} "
                f"principal={principal}",
                reply_markup=player_actions(user_id),
            )
            return

        if action == "create_campaign":
            if not has_role(message.from_user.id, *OWNER_ADMIN):
                clear_pending(message.from_user.id)
                await message.answer("Access denied.", reply_markup=main_menu())
                return
            clear_pending(message.from_user.id)
            result = promo_svc.create_campaign_from_text(
                message.text,
                created_by=f"tg:{message.from_user.id}",
            )
            if not result.get("ok"):
                await message.answer(
                    f"Failed: {result.get('error')}",
                    reply_markup=promo_menu(),
                )
                return
            campaign = result["campaign"]
            detail = promo_svc.get_campaign_detail(campaign.id)
            await message.answer(
                clip(promo_svc.format_campaign_detail(detail)),
                reply_markup=campaign_actions(campaign.id),
            )
            return

        if action == "universal_search":
            clear_pending(message.from_user.id)
            result = search_svc.universal_search(message.text)
            kind = result.get("kind")
            if kind == "player":
                profile = player_svc.build_player_profile(result["player"]["id"])
                await message.answer(
                    clip(player_svc.format_player_profile(profile)),
                    reply_markup=player_actions(result["player"]["id"]),
                )
                return
            if kind == "deposit":
                d = result["deposit"]
                kb = with_nav(
                    [btn("👤 View Player", f"op:p:view:{d['user_id']}")],
                    back="op:home",
                )
                await message.answer(search_svc.format_deposit(d), reply_markup=kb)
                return
            if kind == "withdraw":
                w = result["withdraw"]
                await message.answer(
                    pay_svc.format_withdraw_detail(w),
                    reply_markup=withdraw_actions(w["id"], w["user_id"]),
                )
                return
            if kind == "transaction":
                tx = result["transaction"]
                kb = with_nav(
                    [btn("👤 View Player", f"op:p:view:{tx['user_id']}")],
                    back="op:home",
                )
                await message.answer(
                    search_svc.format_transaction(tx), reply_markup=kb
                )
                return
            await message.answer(
                result.get("error") or "Nothing found.",
                reply_markup=main_menu(),
            )
            return
