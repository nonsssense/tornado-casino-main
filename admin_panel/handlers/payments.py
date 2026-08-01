from aiogram import F
from aiogram.types import CallbackQuery

from admin_panel.access import OWNER_ADMIN
from admin_panel.helpers import clip, edit_or_answer, require_roles
from admin_panel.keyboards import payments_menu, with_nav, withdraw_actions
from admin_panel.services import payments as pay_svc
from admin_panel.state import clear_pending


def _withdraw_list_keyboard(rows: list[dict], back: str):
    lines = []
    for w in rows[:20]:
        lines.append(
            [btn(f"#{w['id']} ${float(w.get('amount') or 0):.2f}", f"op:wd:view:{w['id']}")]
        )
    return with_nav(*lines, back=back)


def register(dp):
    @dp.callback_query(F.data == "op:pay")
    @require_roles(*OWNER_ADMIN)
    async def pay_root(callback: CallbackQuery):
        clear_pending(callback.from_user.id)
        await edit_or_answer(
            callback.message,
            "💳 Payments\n\nDeposits and withdrawals.",
            reply_markup=payments_menu(),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:pay:dep")
    @require_roles(*OWNER_ADMIN)
    async def pay_deposits(callback: CallbackQuery):
        rows = pay_svc.list_deposits(limit=25)
        await edit_or_answer(
            callback.message,
            clip(pay_svc.format_deposits(rows)),
            reply_markup=with_nav(back="op:pay"),
        )
        await callback.answer()

    @dp.callback_query(F.data == "op:pay:wd")
    @require_roles(*OWNER_ADMIN)
    async def pay_withdraws_all(callback: CallbackQuery):
        # Default view: pending queue (ops priority).
        rows = pay_svc.list_withdraws("PENDING")
        await edit_or_answer(
            callback.message,
            clip(pay_svc.format_withdraws(rows, "Pending Withdrawals")),
            reply_markup=_withdraw_list_keyboard(rows, "op:pay"),
        )
        await callback.answer()

    @dp.callback_query(F.data.startswith("op:pay:wd:"))
    @require_roles(*OWNER_ADMIN)
    async def pay_withdraws_by_status(callback: CallbackQuery):
        status = callback.data.split(":")[-1]
        rows = pay_svc.list_withdraws(status)
        await edit_or_answer(
            callback.message,
            clip(pay_svc.format_withdraws(rows, f"{status} Withdrawals")),
            reply_markup=_withdraw_list_keyboard(rows, "op:pay"),
        )
        await callback.answer()

    @dp.callback_query(F.data.startswith("op:wd:view:"))
    @require_roles(*OWNER_ADMIN)
    async def wd_view(callback: CallbackQuery):
        wid = int(callback.data.split(":")[-1])
        w = pay_svc.get_withdraw(wid)
        if w is None:
            await callback.answer("Not found", show_alert=True)
            return
        await edit_or_answer(
            callback.message,
            pay_svc.format_withdraw_detail(w),
            reply_markup=withdraw_actions(wid, w["user_id"]),
        )
        await callback.answer()

    @dp.callback_query(F.data.startswith("op:wd:ok:"))
    @require_roles(*OWNER_ADMIN)
    async def wd_approve(callback: CallbackQuery):
        wid = int(callback.data.split(":")[-1])
        result = await pay_svc.approve_withdraw(wid, callback.from_user.id)
        if result.get("ok"):
            await callback.answer("Approved", show_alert=True)
        else:
            await callback.answer(result.get("error", "Failed"), show_alert=True)
        w = pay_svc.get_withdraw(wid)
        if w:
            await edit_or_answer(
                callback.message,
                pay_svc.format_withdraw_detail(w),
                reply_markup=withdraw_actions(wid, w["user_id"]),
            )

    @dp.callback_query(F.data.startswith("op:wd:no:"))
    @require_roles(*OWNER_ADMIN)
    async def wd_reject(callback: CallbackQuery):
        wid = int(callback.data.split(":")[-1])
        result = pay_svc.reject_withdraw(wid, callback.from_user.id)
        if result.get("ok"):
            await callback.answer("Rejected", show_alert=True)
        else:
            await callback.answer(result.get("error", "Failed"), show_alert=True)
        w = pay_svc.get_withdraw(wid)
        if w:
            await edit_or_answer(
                callback.message,
                pay_svc.format_withdraw_detail(w),
                reply_markup=withdraw_actions(wid, w["user_id"]),
            )
