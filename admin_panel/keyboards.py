from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton


def btn(text: str, data: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(text=text, callback_data=data)


def rows(*lines: list[InlineKeyboardButton]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=list(lines))


def nav_row(back: str | None = "op:home", home: str = "op:home") -> list[InlineKeyboardButton]:
    items = []
    if back and back != home:
        items.append(btn("⬅ Back", back))
    items.append(btn("🏠 Home", home))
    return items


def with_nav(*lines: list[InlineKeyboardButton], back: str | None = "op:home") -> InlineKeyboardMarkup:
    keyboard = [list(line) for line in lines]
    keyboard.append(nav_row(back=back))
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def main_menu() -> InlineKeyboardMarkup:
    return rows(
        [btn("📊 Dashboard", "op:dash")],
        [btn("👤 Players", "op:players")],
        [btn("🎁 Promotions", "op:promo")],
        [btn("💳 Payments", "op:pay")],
        [btn("📈 Analytics", "op:analytics")],
        [btn("⚙ Settings", "op:settings")],
        [btn("🔍 Universal Search", "op:search")],
    )


def players_menu() -> InlineKeyboardMarkup:
    return with_nav(
        [btn("🔍 Search Player", "op:players:search")],
        [btn("🟢 Online Players", "op:players:online")],
        [btn("⭐ Top Players", "op:players:top")],
        [btn("🚫 Banned Players", "op:players:banned")],
        back="op:home",
    )


def player_actions(user_id: int) -> InlineKeyboardMarkup:
    uid = int(user_id)
    return with_nav(
        [btn("➕ Add Balance", f"op:p:add:{uid}"), btn("➖ Remove Balance", f"op:p:rem:{uid}")],
        [btn("🎁 Grant Bonus", f"op:p:bonus:{uid}")],
        [btn("🚫 Ban", f"op:p:ban:{uid}"), btn("✅ Unban", f"op:p:unban:{uid}")],
        [btn("🔄 Refresh", f"op:p:view:{uid}")],
        back="op:players",
    )


def promo_menu() -> InlineKeyboardMarkup:
    return with_nav(
        [btn("➕ Create Campaign", "op:promo:create")],
        [btn("📋 Campaign List", "op:promo:list")],
        [btn("📊 Campaign Statistics", "op:promo:stats")],
        back="op:home",
    )


def campaign_actions(campaign_id: int) -> InlineKeyboardMarkup:
    cid = int(campaign_id)
    return with_nav(
        [btn("✅ Enable", f"op:promo:en:{cid}"), btn("⏸ Disable", f"op:promo:dis:{cid}")],
        [btn("🗄 Archive", f"op:promo:arch:{cid}")],
        [btn("🔄 Refresh", f"op:promo:view:{cid}")],
        back="op:promo:list",
    )


def payments_menu() -> InlineKeyboardMarkup:
    return with_nav(
        [btn("⬇️ Deposits", "op:pay:dep")],
        [btn("⬆️ Withdrawals", "op:pay:wd")],
        [btn("⏳ Pending WD", "op:pay:wd:PENDING")],
        [btn("✅ Completed WD", "op:pay:wd:COMPLETED")],
        [btn("❌ Failed WD", "op:pay:wd:FAILED")],
        back="op:home",
    )


def withdraw_actions(withdraw_id: int, user_id: int) -> InlineKeyboardMarkup:
    wid = int(withdraw_id)
    uid = int(user_id)
    return with_nav(
        [btn("✅ Approve", f"op:wd:ok:{wid}"), btn("❌ Reject", f"op:wd:no:{wid}")],
        [btn("👤 View Player", f"op:p:view:{uid}")],
        back="op:pay:wd:PENDING",
    )


def settings_menu() -> InlineKeyboardMarkup:
    return with_nav(
        [btn("Referral Settings", "op:set:ref")],
        [btn("Maintenance Mode", "op:set:maint")],
        [btn("Broadcast", "op:set:broadcast")],
        [btn("Admin Users", "op:set:admins")],
        back="op:home",
    )
