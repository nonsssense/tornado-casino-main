import httpx
from config import BLOCKBEE_API_KEY, DOMEN as DOMAIN, DEPOSIT_MIN_USD
from database.transactions import TransactionManager
from database.wallet import WalletManager, BALANCE_REAL, lock_wallet
from database.bonus import BonusManager
from promo.promo_manager import PromotionManager
from database.db_config import deposit_table, transaction_table, engine
import sqlalchemy as sa
from datetime import datetime
from log_manager import log
from database.event_treck import Event
from payments.convert import crypto_to_usd, usd_to_crypto

SUPPORTED_BLOCKBEE_TICKERS = frozenset({
    "btc",
    "eth",
    "trx",
    "sol/sol",
    "trc20/usdt",
    "erc20/usdt",
    "bep20/usdt",
    "sol/usdt",
    "erc20/usdc",
    "bep20/usdc",
    "sol/usdc",
})

_deposit_schema_ready = False


def ensure_deposit_schema():
    """Add bonus grant result columns for deposit status UX (idempotent)."""
    global _deposit_schema_ready
    if _deposit_schema_ready:
        return
    with engine.begin() as conn:
        for col, typ in (
            ("bonus_granted", "BOOLEAN"),
            ("bonus_skipped_reason", "VARCHAR(64)"),
        ):
            conn.execute(
                sa.text(
                    f"ALTER TABLE deposit ADD COLUMN IF NOT EXISTS {col} {typ}"
                )
            )
    for col, typ in (
        ("bonus_granted", sa.Boolean),
        ("bonus_skipped_reason", sa.String(64)),
    ):
        try:
            deposit_table.append_column(
                sa.Column(col, typ, nullable=True),
                replace_existing=True,
            )
        except Exception:
            pass
    _deposit_schema_ready = True
    log.info("Deposit schema ensured (bonus_granted + bonus_skipped_reason)")


LEGACY_TICKER_ALIASES = {
    "USDT_TRC20": "trc20/usdt",
    "USDC": "erc20/usdc",
    "BTC": "btc",
    "ETH": "eth",
    "TRX": "trx",
    "SOL": "sol/sol",
    "sol": "sol/sol",
}


def normalize_blockbee_ticker(ticker: str) -> str:
    if not ticker:
        raise ValueError("ticker is required")

    raw = ticker.strip()
    mapped = LEGACY_TICKER_ALIASES.get(raw, raw.lower())

    if mapped not in SUPPORTED_BLOCKBEE_TICKERS:
        raise ValueError(f"Unsupported deposit ticker: {ticker}")

    return mapped


class BlockBeeClient:

    BASE_URL = "https://api.blockbee.io"

    async def create_payment_address(
        self,
        ticker: str,
        user_id: int,
        wallet_id: int,
        deposit_id: int
    ):
        log.info(
            f"Creating BlockBee payment address | user_id={user_id} | wallet_id={wallet_id} | "
            f"deposit_id={deposit_id} | ticker={ticker}"
        )

        callback = self.create_callback(
            user_id=user_id,
            wallet_id=wallet_id,
            deposit_id=deposit_id
        )

        blockbee_ticker = normalize_blockbee_ticker(ticker)
        url = f"{self.BASE_URL}/{blockbee_ticker}/create/"

        params = {
            "apikey": BLOCKBEE_API_KEY,
            "callback": callback,
            "pending": 1,
            "confirmations": 1,
            "json": 1
        }

        # BlockBee answer ( status of payment and other)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    params=params,
                    timeout=30
                )

            response.raise_for_status()

            data = response.json()

            if data.get("status") != "success":
                raise ValueError(data.get("error") or "BlockBee returned non-success status")

            log.info(
                f"BlockBee payment address created | user_id={user_id} | deposit_id={deposit_id} | "
                f"ticker={ticker} | blockbee_ticker={blockbee_ticker} | address={data.get('address_in')}"
            )

            return {
                "address": data["address_in"],
                "minimum": data["minimum_transaction_coin"],
                "callback": data["callback_url"],
                "ticker": blockbee_ticker,
            }
        except Exception:
            log.exception(
                f"Failed to create BlockBee payment address | user_id={user_id} | "
                f"deposit_id={deposit_id} | ticker={ticker}"
            )
            raise

    async def get_ticker_info(self, ticker: str):
        """Fetch BlockBee ticker info (minimums) without creating a payment address."""
        blockbee_ticker = normalize_blockbee_ticker(ticker)
        url = f"{self.BASE_URL}/{blockbee_ticker}/info/"
        params = {"apikey": BLOCKBEE_API_KEY}

        log.info(f"Fetching BlockBee ticker info | ticker={blockbee_ticker}")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            if data.get("status") != "success":
                raise ValueError(data.get("error") or "BlockBee info returned non-success status")

            minimum = float(data.get("minimum_transaction_coin") or 0)
            log.info(
                f"BlockBee ticker info | ticker={blockbee_ticker} | "
                f"minimum_transaction_coin={minimum}"
            )
            return {
                "ticker": blockbee_ticker,
                "minimum": minimum,
            }
        except Exception:
            log.exception(f"Failed to fetch BlockBee ticker info | ticker={ticker}")
            raise

    def create_callback(
        self,
        user_id: int,
        wallet_id: int,
        deposit_id: int
    ):
        log.info(
            f"Building BlockBee callback URL | user_id={user_id} | wallet_id={wallet_id} | "
            f"deposit_id={deposit_id}"
        )

        return (
            f"{DOMAIN}/api/payment/webhook"
            f"?user_id={user_id}"
            f"&wallet_id={wallet_id}"
            f"&deposit_id={deposit_id}"
        )

    async def send_payout(self, ticker: str, address: str, amount: float):
        blockbee_ticker = normalize_blockbee_ticker(ticker)
        amount_value = format(amount, "f").rstrip("0").rstrip(".") or "0"

        log.info(
            f"Sending BlockBee payout | ticker={blockbee_ticker} | address={address} | "
            f"amount={amount_value}"
        )

        try:
            async with httpx.AsyncClient() as client:
                create_url = f"{self.BASE_URL}/{blockbee_ticker}/payout/request/create/"
                create_response = await client.get(
                    create_url,
                    params={
                        "apikey": BLOCKBEE_API_KEY,
                        "address": address,
                        "value": amount_value,
                    },
                    timeout=30,
                )
                create_response.raise_for_status()
                create_data = create_response.json()

                if create_data.get("status") != "success":
                    raise ValueError(create_data.get("error") or "Failed to create payout request")

                request_id = create_data["request_id"]

                payout_create_response = await client.post(
                    f"{self.BASE_URL}/payout/create/",
                    params={"apikey": BLOCKBEE_API_KEY},
                    data={"payout_request_ids": request_id},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=30,
                )
                payout_create_response.raise_for_status()
                payout_create_data = payout_create_response.json()

                if payout_create_data.get("status") != "success":
                    raise ValueError(payout_create_data.get("error") or "Failed to create payout")

                payout_info = payout_create_data.get("payout_info") or {}
                payout_id = payout_info.get("id")
                if payout_id is None:
                    raise ValueError("BlockBee did not return payout id")

                process_response = await client.post(
                    f"{self.BASE_URL}/payout/process/",
                    params={"apikey": BLOCKBEE_API_KEY},
                    data={"payout_id": payout_id},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=60,
                )
                process_response.raise_for_status()
                process_data = process_response.json()

                if process_data.get("status") != "success":
                    raise ValueError(process_data.get("error") or "Failed to process payout")

                process_info = process_data.get("payout_info") or {}
                payout_status = (process_info.get("status") or "").lower()

                if payout_status in ("error", "rejected"):
                    raise ValueError(process_info.get("error") or f"Payout {payout_status}")

                log.info(
                    f"BlockBee payout sent | request_id={request_id} | payout_id={payout_id} | "
                    f"status={payout_status}"
                )

                return {
                    "request_id": request_id,
                    "payout_id": payout_id,
                    "txid": process_info.get("txid") or "",
                    "status": payout_status,
                }
        except Exception:
            log.exception(
                f"BlockBee payout failed | ticker={blockbee_ticker} | address={address} | "
                f"amount={amount_value}"
            )
            raise

def coins_match(stored_ticker: str, webhook_coin: str) -> bool:
    """Match stored BlockBee path ticker to webhook coin field.

    Path create ticker uses slash (trc20/usdt); webhook coin uses underscore (trc20_usdt).
    """
    if not stored_ticker or not webhook_coin:
        return False

    stored = stored_ticker.strip().lower()
    received = webhook_coin.strip().lower()

    return stored == received or stored.replace("/", "_") == received


def resolve_effective_deposit_minimum(ticker: str, blockbee_minimum) -> dict:
    """Effective deposit minimum = max(product USD floor, BlockBee minimum).

    Returns coin + USD fields so UI and create validation share one rule.
    """
    bb_min_coin = float(blockbee_minimum or 0)
    product_min_usd = float(DEPOSIT_MIN_USD)

    try:
        product_min_coin, _ = usd_to_crypto(ticker, product_min_usd)
    except Exception:
        log.exception(
            f"Failed to convert product deposit min to crypto | ticker={ticker} | "
            f"min_usd={product_min_usd}"
        )
        product_min_coin = product_min_usd

    try:
        bb_min_usd, _ = crypto_to_usd(ticker, bb_min_coin) if bb_min_coin > 0 else (0.0, 0.0)
    except Exception:
        log.exception(
            f"Failed to convert BlockBee min to USD | ticker={ticker} | "
            f"bb_min={bb_min_coin}"
        )
        bb_min_usd = 0.0

    if bb_min_usd + 1e-9 >= product_min_usd:
        effective_coin = bb_min_coin
        effective_usd = round(bb_min_usd, 2)
    else:
        effective_coin = float(product_min_coin)
        effective_usd = round(product_min_usd, 2)

    return {
        "minimum": effective_coin,
        "minimum_usd": effective_usd,
        "blockbee_minimum": bb_min_coin,
        "blockbee_minimum_usd": round(bb_min_usd, 2),
        "product_minimum_usd": product_min_usd,
    }


# Back-compat alias used by older call sites.
def resolve_product_deposit_minimum(ticker: str, blockbee_minimum) -> float:
    return float(resolve_effective_deposit_minimum(ticker, blockbee_minimum)["minimum"])


class DepositManager:

    def __init__(self, user_id):
        self.user_id = int(user_id)
        log.info(f"DepositManager initialized | user_id={self.user_id}")

    def processWebhook(self, deposit, webhook):
        log.info(
            f"Processing deposit webhook | user_id={self.user_id} | deposit_id={deposit.get('id')} | "
            f"pending={webhook.get('pending')}"
        )
        # data = response from blockbee with update status in blockchain, constain uuid, and others

        if not self.validateDeposit(deposit, webhook):
            log.warning(
                f"Deposit webhook validation failed | user_id={self.user_id} | "
                f"deposit_id={deposit.get('id')}"
            )
            return

        if int(webhook["pending"]) == 1:
            log.info(
                f"Deposit marked as pending | user_id={self.user_id} | deposit_id={deposit.get('id')}"
            )
            self.markPending(deposit,webhook)
            return

        log.info(
            f"Completing deposit | user_id={self.user_id} | deposit_id={deposit.get('id')} | "
            f"amount={webhook.get('value_forwarded_coin')}"
        )
        self.completeDeposit(deposit,webhook)

    def markPending(self, deposit, webhook):
        log.info(f"Updating deposit to pending | user_id={self.user_id} | deposit_id={deposit['id']}")
        with engine.begin() as conn:
            locked = conn.execute(
                sa.select(deposit_table)
                .where(deposit_table.c.id == deposit["id"])
                .with_for_update()
            ).mappings().first()

            if locked is None:
                return

            if locked["status"] not in ("Open deposit window", "Pending"):
                log.info(
                    f"Deposit not open for pending mark | user_id={self.user_id} | "
                    f"deposit_id={locked['id']} | status={locked['status']}"
                )
                return

            stmt = (
                sa.update(deposit_table)
                .where(deposit_table.c.id == locked["id"])
                .values(
                    status="Pending",
                    uuid=webhook["uuid"],
                    txid_in=webhook["txid_in"],
                    confirmations=webhook["confirmations"]
                )
            )
            conn.execute(stmt)
            log.info(
                f"Deposit UPDATE to pending completed | user_id={self.user_id} | "
                f"deposit_id={locked['id']} | uuid={webhook.get('uuid')}"
            )

    def completeDeposit(self, deposit, webhook):
        try:
            crypto_amount = float(webhook["value_forwarded_coin"])
            payment_uuid = webhook.get("uuid")
            # Custom payment flow uses `coin`; checkout-style payloads may use `paid_coin`.
            coin = webhook.get("coin") or webhook.get("paid_coin") or deposit.get("coin")
        except (TypeError, ValueError, KeyError):
            log.warning(
                f"Problems with parsing webhook data | user_id={self.user_id} | "
                f"deposit_id={deposit.get('id')}"
            )
            return

        if not coin:
            log.warning(
                f"Deposit webhook missing coin | user_id={self.user_id} | "
                f"deposit_id={deposit.get('id')}"
            )
            return

        with engine.begin() as conn:
            locked = conn.execute(
                sa.select(deposit_table)
                .where(deposit_table.c.id == deposit["id"])
                .with_for_update()
            ).mappings().first()

            if locked is None:
                log.warning(
                    f"Deposit not found for complete | user_id={self.user_id} | "
                    f"deposit_id={deposit.get('id')}"
                )
                return

            if locked["status"] not in ("Open deposit window", "Pending"):
                log.info(
                    f"Deposit already finalized, skip complete | user_id={self.user_id} | "
                    f"deposit_id={locked['id']} | status={locked['status']}"
                )
                return

            if locked.get("transaction_id") is not None:
                log.info(
                    f"Deposit already has transaction, skip complete | user_id={self.user_id} | "
                    f"deposit_id={locked['id']} | transaction_id={locked['transaction_id']}"
                )
                return

            if payment_uuid:
                existing_tx = conn.execute(
                    sa.select(transaction_table.c.id)
                    .where(
                        transaction_table.c.user_id == locked["user_id"],
                        transaction_table.c.reference_id == payment_uuid,
                        transaction_table.c.type == "deposit",
                    )
                    .limit(1)
                ).scalar_one_or_none()
                if existing_tx is not None:
                    log.info(
                        f"Deposit payment uuid already credited, skip | user_id={self.user_id} | "
                        f"deposit_id={locked['id']} | transaction_id={existing_tx}"
                    )
                    self.finishDeposit(locked, webhook, existing_tx, conn)
                    return

            # Defensive safety net only — create path must already enforce effective min.
            coin_for_convert = locked.get("coin") or coin
            usd_amount, convert_rate = crypto_to_usd(coin_for_convert, crypto_amount)

            stored_min_coin = float(locked.get("minimum") or 0)
            product_min_usd = float(DEPOSIT_MIN_USD)
            below_stored = stored_min_coin > 0 and crypto_amount + 1e-12 < stored_min_coin
            below_product = usd_amount + 1e-9 < product_min_usd

            if below_stored or below_product:
                log.warning(
                    f"Deposit below minimum (webhook safety) | user_id={self.user_id} | "
                    f"deposit_id={locked['id']} | usd_amount={usd_amount} | "
                    f"crypto_amount={crypto_amount} | stored_min={stored_min_coin} | "
                    f"product_min_usd={product_min_usd} | coin={coin_for_convert}"
                )
                self.finishDeposit(
                    locked,
                    webhook,
                    None,
                    conn,
                    crypto_amount=crypto_amount,
                    usd_amount=usd_amount,
                    convert_rate=convert_rate,
                    status="Below minimum",
                )
                return

            # P0: lock wallet in the same TX before any credit (deposit lock already held).
            wallet = WalletManager(locked["user_id"])
            wallet_row = lock_wallet(conn, locked["user_id"], locked["wallet_id"])
            if wallet_row is None:
                log.error(
                    f"Wallet missing on deposit complete | user_id={locked['user_id']} | "
                    f"wallet_id={locked['wallet_id']}"
                )
                return

            balances = wallet.apply_balance_deltas(
                conn, locked["wallet_id"], real_delta=usd_amount
            )
            balance_after = balances["real_balance"]

            transaction = TransactionManager(
                user_id=locked["user_id"],
                wallet_id=locked["wallet_id"],
                balance_type=BALANCE_REAL,
                transaction_type="deposit",
                amount=usd_amount,
                balance_after=balance_after,
                status="Completed",
                reference_id=payment_uuid,
            )
            transaction_id = transaction.postTransaction(conn)
            log.info(
                f"Deposit transaction created | user_id={locked['user_id']} | "
                f"deposit_id={locked['id']} | transaction_id={transaction_id} | "
                f"coin={coin_for_convert} | received_amount={crypto_amount} | "
                f"convert_rate={convert_rate} | usd_amount={usd_amount}"
            )

            # Commercial side effects go through PromotionManager (bonus + referral FTD).
            # Wallet row remains locked for the rest of this transaction.
            ensure_deposit_schema()
            deposit_index = BonusManager(locked["user_id"]).countCompletedDeposits(
                conn=conn
            ) + 1
            grant_result = PromotionManager(locked["user_id"]).on_deposit_confirmed(
                user_id=locked["user_id"],
                wallet_id=locked["wallet_id"],
                amount_usd=usd_amount,
                deposit_index=deposit_index,
                conn=conn,
            ) or {}

            self.finishDeposit(
                locked,
                webhook,
                transaction_id,
                conn,
                crypto_amount=crypto_amount,
                usd_amount=usd_amount,
                convert_rate=convert_rate,
                bonus_granted=bool(grant_result.get("granted")),
                bonus_skipped_reason=grant_result.get("skipped_reason"),
            )

    def finishDeposit(
        self,
        deposit,
        webhook,
        transaction_id,
        conn,
        crypto_amount=None,
        usd_amount=None,
        convert_rate=None,
        status="Completed",
        bonus_granted=None,
        bonus_skipped_reason=None,
    ):
        log.info(
            f"Finalizing deposit | user_id={deposit['user_id']} | deposit_id={deposit['id']} | "
            f"transaction_id={transaction_id} | status={status}"
        )
        if crypto_amount is None:
            crypto_amount = webhook.get("value_forwarded_coin")

        values = {
            "address_in": webhook["address_in"],
            "received_amount": crypto_amount,
            "uuid": webhook["uuid"],
            "txid_in": webhook["txid_in"],
            "txid_out": webhook["txid_out"],
            "confirmations": webhook["confirmations"],
            "status": status,
            "fee_coin": webhook["fee_coin"],
            "confirmed_at": datetime.now(),
        }
        if transaction_id is not None:
            values["transaction_id"] = transaction_id
        if usd_amount is not None:
            values["usd_amount"] = usd_amount
        if convert_rate is not None:
            values["convert_rate"] = convert_rate
        if bonus_granted is not None:
            values["bonus_granted"] = bool(bonus_granted)
        if bonus_skipped_reason is not None:
            values["bonus_skipped_reason"] = str(bonus_skipped_reason)

        update_stmt = (
            sa.update(deposit_table)
            .where(deposit_table.c.id == deposit["id"])
            .values(**values)
        )
        conn.execute(update_stmt)
        log.info(
            f"Deposit UPDATE finalized | user_id={deposit['user_id']} | "
            f"deposit_id={deposit['id']} | transaction_id={transaction_id} | "
            f"status={status} | coin={deposit.get('coin')} | "
            f"received_amount={crypto_amount} | convert_rate={convert_rate} | "
            f"usd_amount={usd_amount}"
        )


    def postPreDeposit(self, wallet_id, ticker, status):
        log.info(
            f"Creating pre-deposit | user_id={self.user_id} | wallet_id={wallet_id} | "
            f"ticker={ticker} | status={status}"
        )

        event = Event(user_id=self.user_id, event_type=status)
        with engine.begin() as conn:
            # Deposit window open is already a tracked user_events type.
            event.postEvent(touch_session=False)
            deposit_id = self.findOpenDeposit(wallet_id, ticker)
            if deposit_id is not None:
                log.info(
                    f"Open deposit already exists | user_id={self.user_id} | "
                    f"deposit_id={deposit_id} | ticker={ticker}"
                )
                return deposit_id

            post_stmt = sa.insert(deposit_table).values(user_id=self.user_id, wallet_id=wallet_id, coin=ticker, status=status, created_at=datetime.now()).returning(deposit_table.c.id)
            deposit_id = conn.execute(post_stmt).scalar_one()
            log.info(
                f"Pre-deposit INSERT completed | user_id={self.user_id} | deposit_id={deposit_id} | "
                f"ticker={ticker}"
            )

            return deposit_id
        
    def updateAddressDeposit(self, deposit_id, address, minimum):
        log.info(
            f"Updating deposit address | user_id={self.user_id} | deposit_id={deposit_id} | "
            f"minimum={minimum}"
        )
        if minimum is not None:
            minimum = float(minimum)
        with engine.begin() as conn:
            update_stmt = sa.update(deposit_table).where(deposit_table.c.id==deposit_id).values(address_in=address, minimum=minimum)
            conn.execute(update_stmt)
            log.info(
                f"Deposit address UPDATE completed | user_id={self.user_id} | deposit_id={deposit_id}"
            )

    def findOpenDeposit(self, wallet_id, ticker):
        log.info(
            f"Searching for open deposit | user_id={self.user_id} | wallet_id={wallet_id} | "
            f"ticker={ticker}"
        )
        with engine.begin() as conn:
            get_stmt = sa.select(deposit_table.c.id).where(deposit_table.c.user_id==self.user_id, deposit_table.c.wallet_id==wallet_id, deposit_table.c.coin==ticker, deposit_table.c.status=='Open deposit window').limit(1)
            result = conn.scalar(get_stmt)
            
            if result is not None:
                log.info(
                    f"Open deposit found | user_id={self.user_id} | deposit_id={result} | "
                    f"ticker={ticker}"
                )
                return result
            log.info(f"No open deposit found | user_id={self.user_id} | ticker={ticker}")
            return None
        
    def getDeposit(self, deposit_id):
        log.info(f"Fetching deposit | user_id={self.user_id} | deposit_id={deposit_id}")
        with engine.begin() as conn:
            stmt = (
                sa.select(deposit_table)
                .where(deposit_table.c.id == deposit_id)
            )

            deposit = conn.execute(stmt).mappings().first()
            if deposit is None:
                log.warning(
                    f"Deposit not found | user_id={self.user_id} | deposit_id={deposit_id}"
                )
            else:
                log.info(
                    f"Deposit found | user_id={self.user_id} | deposit_id={deposit_id} | "
                    f"status={deposit.get('status')}"
                )
            return deposit
    
    def validateDeposit(self, deposit, webhook):
        if deposit["status"] != "Open deposit window" and deposit["status"] != "Pending":
            log.warning(
                f"Invalid deposit status for webhook | user_id={self.user_id} | "
                f"deposit_id={deposit.get('id')} | status={deposit.get('status')}"
            )
            return False

        if deposit["uuid"] is not None and deposit["uuid"] != webhook["uuid"]:
            log.warning(
                f"Deposit UUID mismatch | user_id={self.user_id} | deposit_id={deposit.get('id')}"
            )
            return False

        if deposit["address_in"] != webhook["address_in"]:
            log.warning(
                f"Deposit address mismatch | user_id={self.user_id} | deposit_id={deposit.get('id')}"
            )
            return False

        if not coins_match(deposit["coin"], webhook["coin"]):
            log.warning(
                f"Deposit coin mismatch | user_id={self.user_id} | deposit_id={deposit.get('id')} | "
                f"expected={deposit.get('coin')} | received={webhook.get('coin')}"
            )
            return False

        log.info(
            f"Deposit webhook validated | user_id={self.user_id} | deposit_id={deposit.get('id')}"
        )
        return True
