from config import admin_bot_token, white_ids

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from payments.withdraw import WithdrawManager
from log_manager import log

admin_bot = Bot(admin_bot_token)
admin_dp = Dispatcher()

def get_role(user_id: int) -> str | None:
    return white_ids.get(user_id)


def is_whitelisted(user_id: int) -> bool:
    return user_id in white_ids


def has_role(user_id: int, *roles: str) -> bool:
    role = get_role(user_id)
    return role in roles

def main_menu():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📊 Statistics",
                    callback_data="statistics"
                )
            ],
            [
                InlineKeyboardButton(
                    text="💸 Withdraws",
                    callback_data="withdraws"
                )
            ],
            [
                InlineKeyboardButton(
                    text="👤 Players",
                    callback_data="players"
                )
            ],
            [
                InlineKeyboardButton(
                    text="⚙️ System",
                    callback_data="system"
                )
            ],
        ]
    )


def withdraw_queue_keyboard(pending):
    buttons = []

    for withdraw in pending:
        withdraw_id = withdraw["id"]
        buttons.append([
            InlineKeyboardButton(
                text=f"✅ Approve #{withdraw_id}",
                callback_data=f"w_approve:{withdraw_id}",
            ),
            InlineKeyboardButton(
                text=f"❌ Reject #{withdraw_id}",
                callback_data=f"w_reject:{withdraw_id}",
            ),
        ])

    buttons.append([
        InlineKeyboardButton(text="🔄 Refresh", callback_data="withdraws"),
        InlineKeyboardButton(text="◀️ Menu", callback_data="menu"),
    ])

    return InlineKeyboardMarkup(inline_keyboard=buttons)


def format_withdraw_queue(pending):
    if not pending:
        return "💸 Withdraw queue\n\nNo pending requests."

    lines = ["💸 Withdraw queue\n"]
    for withdraw in pending:
        lines.append(
            f"#{withdraw['id']} | user {withdraw['user_id']}\n"
            f"{withdraw['amount']} {withdraw['coin']}\n"
            f"{withdraw['address']}\n"
        )

    return "\n".join(lines)


@admin_dp.message(Command("start"))
async def start(message: Message):

    if not is_whitelisted(message.from_user.id):
        await message.answer("⛔ Access denied.")
        return

    role = get_role(message.from_user.id)

    await message.answer(
f"""
<b>Tornado Tech</b>

Role: <b>{role.upper()}</b>
""",
        reply_markup=main_menu(),
    )

@admin_dp.callback_query(F.data == "menu")
async def menu(callback: CallbackQuery):
    if not is_whitelisted(callback.from_user.id):
        await callback.answer("Access denied", show_alert=True)
        return

    role = get_role(callback.from_user.id)
    await callback.message.edit_text(
        f"<b>Tornado Tech</b>\n\nRole: <b>{role.upper()}</b>",
        reply_markup=main_menu(),
    )


@admin_dp.callback_query(F.data == "statistics")
async def statistics(callback: CallbackQuery):

    if not has_role(
        callback.from_user.id,
        "owner",
        "admin",
        "investor",
    ):
        await callback.answer("Access denied", show_alert=True)
        return

    await callback.message.edit_text(
        "📊 Statistics\n\nTODO",
        reply_markup=main_menu()
    )


@admin_dp.callback_query(F.data == "withdraws")
async def withdraws(callback: CallbackQuery):

    if not has_role(
        callback.from_user.id,
        "owner",
        "admin",
    ):
        await callback.answer("Access denied", show_alert=True)
        return

    pending = WithdrawManager.listPendingWithdraws()
    await callback.message.edit_text(
        format_withdraw_queue(pending),
        reply_markup=withdraw_queue_keyboard(pending),
    )


@admin_dp.callback_query(F.data.startswith("w_approve:"))
async def withdraw_approve(callback: CallbackQuery):
    if not has_role(callback.from_user.id, "owner", "admin"):
        await callback.answer("Access denied", show_alert=True)
        return

    withdraw_id = int(callback.data.split(":", 1)[1])
    withdraw = WithdrawManager.getWithdraw(withdraw_id)

    if withdraw is None:
        await callback.answer("Withdraw not found", show_alert=True)
        return

    manager = WithdrawManager(withdraw["user_id"])
    result = await manager.approveWithdraw(withdraw_id, callback.from_user.id)

    if result.get("ok"):
        await callback.answer("Withdraw approved", show_alert=True)
    else:
        await callback.answer(result.get("error", "Approval failed"), show_alert=True)

    pending = WithdrawManager.listPendingWithdraws()
    await callback.message.edit_text(
        format_withdraw_queue(pending),
        reply_markup=withdraw_queue_keyboard(pending),
    )


@admin_dp.callback_query(F.data.startswith("w_reject:"))
async def withdraw_reject(callback: CallbackQuery):
    if not has_role(callback.from_user.id, "owner", "admin"):
        await callback.answer("Access denied", show_alert=True)
        return

    withdraw_id = int(callback.data.split(":", 1)[1])
    withdraw = WithdrawManager.getWithdraw(withdraw_id)

    if withdraw is None:
        await callback.answer("Withdraw not found", show_alert=True)
        return

    manager = WithdrawManager(withdraw["user_id"])
    result = manager.rejectWithdraw(withdraw_id, callback.from_user.id)

    if result.get("ok"):
        await callback.answer("Withdraw rejected", show_alert=True)
    else:
        await callback.answer(result.get("error", "Reject failed"), show_alert=True)

    pending = WithdrawManager.listPendingWithdraws()
    await callback.message.edit_text(
        format_withdraw_queue(pending),
        reply_markup=withdraw_queue_keyboard(pending),
    )


@admin_dp.callback_query(F.data == "players")
async def players(callback: CallbackQuery):

    if not has_role(
        callback.from_user.id,
        "owner",
        "admin",
        "investor",
        "support",
    ):
        await callback.answer("Access denied", show_alert=True)
        return

    await callback.message.edit_text(
        "👤 Players\n\nTODO",
        reply_markup=main_menu()
    )


@admin_dp.callback_query(F.data == "bonuses")
async def bonuses(callback: CallbackQuery):

    if not has_role(
        callback.from_user.id,
        "owner",
        "admin",
    ):
        await callback.answer("Access denied", show_alert=True)
        return

    await callback.message.edit_text(
        "🎁 Bonuses\n\nTODO",
        reply_markup=main_menu()
    )


@admin_dp.callback_query(F.data == "system")
async def system(callback: CallbackQuery):

    if not has_role(
        callback.from_user.id,
        "owner",
    ):
        await callback.answer("Access denied", show_alert=True)
        return

    await callback.message.edit_text(
        "⚙️ System\n\nTODO",
        reply_markup=main_menu()
    )

async def main():
    await admin_dp.start_polling(admin_bot)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
