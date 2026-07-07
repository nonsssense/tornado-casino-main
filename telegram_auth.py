import hashlib
import hmac
from urllib.parse import parse_qs

from config import bot_token


def validate_init_data(init_data: str) -> bool:

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