import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs

from config import bot_token

# Reject initData older than this (Telegram recommends checking auth_date freshness).
# Session cookies remain valid independently — this only gates /api/auth HMAC validation.
INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60
# Allow small clock skew between Telegram servers and this host.
INIT_DATA_CLOCK_SKEW_SECONDS = 60


def validate_init_data(init_data: str) -> bool:
    if not init_data or not bot_token:
        return False

    parsed = parse_qs(init_data)

    if "hash" not in parsed:
        return False

    received_hash = parsed.pop("hash")[0]
    data_check_string = "\n".join(f"{key}={parsed[key][0]}" for key in sorted(parsed.keys()))
    secret_key = hmac.new(b"WebAppData",bot_token.encode(),hashlib.sha256).digest()

    calculated_hash = hmac.new(secret_key,data_check_string.encode(),hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        return False

    try:
        auth_date = int(parsed.get("auth_date", [""])[0])
    except (TypeError, ValueError):
        return False

    if auth_date <= 0:
        return False

    now = int(time.time())
    if auth_date > now + INIT_DATA_CLOCK_SKEW_SECONDS:
        return False
    if now - auth_date > INIT_DATA_MAX_AGE_SECONDS:
        return False

    return True

def has_telegram_id(init_data: str) -> bool:
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


def extract_telegram_user(init_data: str):
    """Return the user object from validated initData (caller must validate first)."""
    if not init_data:
        return None

    try:
        parsed = parse_qs(init_data)
        user_raw = parsed.get("user", [None])[0]
        if not user_raw:
            return None
        user = json.loads(user_raw)
        if not isinstance(user, dict) or not user.get("id"):
            return None
        return {
            "id": user.get("id"),
            "username": user.get("username"),
            "first_name": user.get("first_name"),
            "last_name": user.get("last_name"),
            "language_code": user.get("language_code"),
            "is_premium": user.get("is_premium"),
            "photo_url": user.get("photo_url"),
        }
    except Exception:
        return None
