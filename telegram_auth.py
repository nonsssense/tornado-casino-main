import hashlib
import hmac
import json
from urllib.parse import parse_qs

from config import bot_token


def validate_init_data(init_data: str) -> bool:
    """Original Telegram InitData HMAC verification."""
    if not init_data:
        return False

    parsed = parse_qs(init_data)

    if "hash" not in parsed:
        return False

    received_hash = parsed.pop("hash")[0]

    data_check_string = "\n".join(
        f"{key}={parsed[key][0]}"
        for key in sorted(parsed.keys())
    )

    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode(),
        hashlib.sha256
    ).digest()

    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(calculated_hash, received_hash)


def has_telegram_id(init_data: str) -> bool:
    """True when init_data contains a Telegram user with an id."""
    if not init_data:
        return False

    try:
        parsed = parse_qs(init_data)
        user_raw = parsed.get("user", [None])[0]
        if not user_raw:
            return False
        user = json.loads(user_raw)
        return bool(user.get("id"))
    except Exception:
        return False
