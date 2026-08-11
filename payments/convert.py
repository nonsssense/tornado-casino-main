import time
import requests
from config import binance_api_url
from log_manager import log

# BlockBee coin / path ticker → Binance spot symbol (quoted in USDT ≈ USD).
BINANCE_SYMBOL_BY_COIN = {
    "btc": "BTCUSDT",
    "eth": "ETHUSDT",
    "trx": "TRXUSDT",
    "sol": "SOLUSDT",
    "sol_sol": "SOLUSDT",
}

# Tokens already denominated in USD (1:1, no market lookup).
STABLECOIN_MARKERS = frozenset({"usdt", "usdc"})


def _normalize_coin(coin: str) -> str:
    return coin.strip().lower().replace("/", "_")


def _is_stablecoin(coin_key: str) -> bool:
    if coin_key in STABLECOIN_MARKERS:
        return True
    # e.g. trc20_usdt, erc20_usdc, sol_usdt
    base = coin_key.rsplit("_", 1)[-1]
    return base in STABLECOIN_MARKERS


def resolve_binance_symbol(coin: str) -> str | None:
    """Map a BlockBee coin ticker to a Binance symbol, or None for 1:1 stables."""
    key = _normalize_coin(coin)
    if _is_stablecoin(key):
        return None
    if key in BINANCE_SYMBOL_BY_COIN:
        return BINANCE_SYMBOL_BY_COIN[key]
    base = key.rsplit("_", 1)[-1]
    return BINANCE_SYMBOL_BY_COIN.get(base)


def get_price(symbol_in: str, retries: int = 4, timeout: int = 10) -> float:
    if not binance_api_url:
        log.warning("BINANCE_API is not configured.")
        raise RuntimeError("BINANCE_API is not configured")

    url = binance_api_url + symbol_in

    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()

            data = response.json()

            if "price" not in data:
                raise ValueError(f"Unexpected response: {data}")

            log.info(f"GET convert price: {data['price']}")
            return float(data["price"])

        except Exception as e:
            if attempt == retries - 1:
                raise RuntimeError(
                    f"Failed to get {symbol_in} price after {retries} attempts."
                ) from e

            time.sleep(1)


def convert(symbol_in: str, amount_in: float) -> float:
    price = get_price(symbol_in)
    return round(amount_in * price, 2)


# Fiat currency → Binance spot symbol. Symbol is quoted IN the fiat, i.e. the
# price is "fiat units per 1 USDT" (USDT ≈ USD). e.g. USDTKZT = KZT per 1 USDT.
BINANCE_SYMBOL_BY_FIAT = {
    "KZT": "USDTKZT",
}


def resolve_fiat_symbol(currency: str) -> str | None:
    """Map a fiat currency code to its Binance symbol, or None if unsupported."""
    if not currency:
        return None
    return BINANCE_SYMBOL_BY_FIAT.get(currency.strip().upper())


def fiat_to_usd(currency: str, amount_fiat: float) -> tuple[float, float]:
    amount_fiat = float(amount_fiat)
    if amount_fiat <= 0:
        raise ValueError("Fiat amount must be greater than zero")

    symbol = resolve_fiat_symbol(currency)
    if symbol is None:
        raise RuntimeError(f"No Binance symbol for fiat currency {currency}")

    rate = float(get_price(symbol))  # fiat units per 1 USDT (≈ USD)
    if rate <= 0:
        raise RuntimeError(f"Invalid market rate for {symbol}")

    usd_amount = round(amount_fiat / rate, 2)
    log.info(
        f"Fiat convert | currency={currency} | symbol={symbol} | amount_fiat={amount_fiat} | "
        f"usd={usd_amount} | convert_rate={rate}"
    )
    return usd_amount, rate


def crypto_to_usd(coin: str, amount_in: float) -> tuple[float, float]:
    """Convert a deposited crypto amount to USD.

    Returns (usd_amount, convert_rate) where usd_amount = round(amount * rate, 2).
    Stablecoins (USDT/USDC) use rate 1.0 without calling Binance.
    """
    amount_in = float(amount_in)
    symbol = resolve_binance_symbol(coin)

    if symbol is None:
        rate = 1.0
        usd_amount = round(amount_in * rate, 2)
        log.info(
            f"Stablecoin convert | coin={coin} | amount={amount_in} | "
            f"usd={usd_amount} | convert_rate={rate}"
        )
        return usd_amount, rate

    rate = get_price(symbol)
    usd_amount = round(amount_in * rate, 2)
    log.info(
        f"Crypto convert | coin={coin} | symbol={symbol} | amount={amount_in} | "
        f"usd={usd_amount} | convert_rate={rate}"
    )
    return usd_amount, rate


def usd_to_crypto(coin: str, usd_amount: float) -> tuple[float, float]:
    """Convert a USD wallet debit to on-chain crypto units for BlockBee payout.

    Returns (crypto_amount, convert_rate) where crypto_amount = usd / rate.
    Stablecoins (USDT/USDC) use rate 1.0 without calling Binance.

    Wallet balances are USD. BlockBee payout `value` is native crypto (or token
    units). Never pass a USD amount as BTC/ETH/… `value`.
    """
    usd_amount = float(usd_amount)
    if usd_amount <= 0:
        raise ValueError("USD amount must be greater than zero")

    symbol = resolve_binance_symbol(coin)

    if symbol is None:
        rate = 1.0
        crypto_amount = usd_amount
        log.info(
            f"Stablecoin withdraw convert | coin={coin} | usd={usd_amount} | "
            f"crypto={crypto_amount} | convert_rate={rate}"
        )
        return crypto_amount, rate

    rate = float(get_price(symbol))
    if rate <= 0:
        raise RuntimeError(f"Invalid market rate for {symbol}")

    crypto_amount = usd_amount / rate
    log.info(
        f"Crypto withdraw convert | coin={coin} | symbol={symbol} | usd={usd_amount} | "
        f"crypto={crypto_amount} | convert_rate={rate}"
    )
    return crypto_amount, rate
