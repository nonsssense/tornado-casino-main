from pathlib import Path

from dotenv import load_dotenv
import os

white_ids = {
    5478327492: "owner",
    1200219142: "owner",
    #456123789: "investor",
    #741852963: "support",
}

# Always resolve .env from the project root (this file's directory), not process cwd.
# Otherwise WEB_DEFENCE defaults to True and browser/dev auth breaks after restart.
_ENV_FILE = Path(__file__).resolve().parent / '.env'
load_dotenv(_ENV_FILE)

bot_token = os.getenv('BOT_TOKEN')
admin_bot_token = os.getenv('ADMIN_BOT_TOKEN')
db_url = os.getenv('DB_URL')

BLOCKBEE_API_KEY = os.getenv('API_BLOCKBEE')
DOMEN = os.getenv('DOMEN')
BLOCKBEE_PUBLIC_KEY_PATH = Path(os.getenv("BLOCKBEE_PUBLIC_KEY_PATH"))
binance_api_url = os.getenv('BINANCE_API')

# Production default: True. Set WEB_DEFENCE=False in .env for local browser UI work.
# Prefer is_web_defence_enabled() at the auth gate so .env can be toggled without a full rewrite.


def is_web_defence_enabled() -> bool:
    """Reload WEB_DEFENCE from project .env on each call (toggle without code changes)."""
    load_dotenv(_ENV_FILE, override=True)
    value = os.getenv('WEB_DEFENCE', 'True')
    return value.strip().lower() in ('1', 'true', 'yes', 'on')




# -------------------------- Plinco Multipier Schemes ---------------------------
plinko_tables = {
    "high": {
        8: [
            25, 4, 1.6, 0.3, 0.2,
            0.3, 1.6, 4, 25
        ],
        10: [
            55, 12, 2.5, 1, 0.3,
            0.2, 0.3, 1, 2.5, 12, 55
        ],
        12: [
            140, 28, 5, 2, 0.8,
            0.3, 0.2, 0.3, 0.8, 2,
            5, 28, 140
        ],
        14: [
            340, 58, 10, 3.5, 1.6,
            0.7, 0.4, 0.2, 0.4, 0.7,
            1.6, 3.5, 10, 58, 340
        ],
        16: [
            900, 120, 20, 6, 3,
            1.2, 0.8, 0.4, 0.2, 0.4,
            0.8, 1.2, 3, 6, 20,
            120, 900
        ]
    },

    "medium": {
        8: [
            10.971, 3.092, 1.297, 0.688, 0.389,
            0.688, 1.297, 3.092, 10.971
        ],
        10: [
            18.962, 6.786, 2.295, 1.098, 0.629,
            0.339, 0.629, 1.098, 2.295, 6.786, 18.962
        ],
        12: [
            34.538, 14.221, 3.86, 1.828, 1.016,
            0.589, 0.335, 0.589, 1.016, 1.828,
            3.86, 14.221, 34.538
        ],
        14: [
            60.598, 27.269, 6.262, 3.131, 1.717,
            1.01, 0.505, 0.313, 0.505, 1.01,
            1.717, 3.131, 6.262, 27.269, 60.598
        ],
        16: [
            110.033, 50.015, 10.003, 4.501, 2.901,
            1.5, 1.1, 0.4, 0.3, 0.4,
            1.1, 1.5, 2.901, 4.501, 10.003,
            50.015, 110.033
        ]
    },

    "low": {
        8: [
            5.457, 2.084, 1.091, 0.972, 0.486,
            0.972, 1.091, 2.084, 5.457
        ],
        10: [
            7.318, 3.208, 1.504, 1.103, 0.942,
            0.471, 0.942, 1.103, 1.504, 3.208, 7.318
        ],
        12: [
            9.834, 4.866, 1.825, 1.217, 1.115,
            0.963, 0.466, 0.963, 1.115, 1.217,
            1.825, 4.866, 9.834
        ],
        14: [
            13.094, 6.749, 2.015, 1.511, 1.209,
            1.108, 0.977, 0.433, 0.977, 1.108,
            1.209, 1.511, 2.015, 6.749, 13.094
        ],
        16: [
            16.001, 9.001, 2.0, 1.7, 1.3,
            1.2, 1.1, 1.0, 0.4, 1.0,
            1.1, 1.2, 1.3, 1.7, 2.0,
            9.001, 16.001
        ]
    }
}
#---------------------------------------------------------------------------------------