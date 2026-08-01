from config import white_ids


def get_role(user_id: int) -> str | None:
    return white_ids.get(int(user_id))


def is_whitelisted(user_id: int) -> bool:
    return int(user_id) in white_ids


def has_role(user_id: int, *roles: str) -> bool:
    role = get_role(user_id)
    return role in roles


OWNER_ADMIN = ("owner", "admin")
STAFF = ("owner", "admin", "investor", "support")
OWNER_ONLY = ("owner",)
