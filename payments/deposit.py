# payments/blockbee.py

import httpx
from config import BLOCKBEE_API_KEY, DOMEN as DOMAIN
from database.transactions import TransactionManager
from database.db_config import deposit_table, engine
import sqlalchemy as sa
from datetime import datetime
from log_manager import log

# Official BlockBee path tickers for Custom Payment Flow:
# GET https://api.blockbee.io/{ticker}/create/
# Docs: https://docs.blockbee.io/get-started/tickers
# Source of truth: BlockBee /info endpoint + create-payment-address docs.
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

# Legacy frontend aliases → official BlockBee tickers.
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
    

def coins_match(stored_ticker: str, webhook_coin: str) -> bool:
    """Match stored BlockBee path ticker to webhook coin field.

    Path create ticker uses slash (trc20/usdt); webhook coin uses underscore (trc20_usdt).
    """
    if not stored_ticker or not webhook_coin:
        return False

    stored = stored_ticker.strip().lower()
    received = webhook_coin.strip().lower()

    return stored == received or stored.replace("/", "_") == received


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
            stmt = (
                sa.update(deposit_table)
                .where(deposit_table.c.id == deposit["id"])
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
                f"deposit_id={deposit['id']} | uuid={webhook.get('uuid')}"
            )

    def completeDeposit(self, deposit, webhook):

        with engine.begin() as conn:
            transaction = TransactionManager(
                user_id=deposit["user_id"],
                wallet_id=deposit["wallet_id"],
                type="deposit",
                amount=float(webhook["value_forwarded_coin"]),
                status="Completed",
                reference_id=webhook["uuid"],
            )
            transaction_id = transaction.postTransaction(conn)
            log.info(
                f"Deposit transaction created | user_id={deposit['user_id']} | "
                f"deposit_id={deposit['id']} | transaction_id={transaction_id}"
            )

            self.finishDeposit(deposit, webhook, transaction_id, conn)

    def finishDeposit(self, deposit, webhook, transaction_id, conn):
        log.info(
            f"Finalizing deposit | user_id={deposit['user_id']} | deposit_id={deposit['id']} | "
            f"transaction_id={transaction_id}"
        )
        update_stmt = sa.update(deposit_table).where(deposit_table.c.id==deposit["id"]).values(transaction_id=transaction_id,
                                                                                       address_in=webhook["address_in"],
                                                                                       received_amount=webhook["value_forwarded_coin"],
                                                                                       uuid=webhook["uuid"],
                                                                                       txid_in=webhook["txid_in"],
                                                                                       txid_out=webhook["txid_out"],
                                                                                       confirmations=webhook["confirmations"],
                                                                                       status="Completed",
                                                                                       fee_coin=webhook["fee_coin"],
                                                                                       confirmed_at=datetime.now()
                                                                                       )
        conn.execute(update_stmt)
        log.info(
            f"Deposit UPDATE to completed | user_id={deposit['user_id']} | deposit_id={deposit['id']} | "
            f"transaction_id={transaction_id} | amount={webhook.get('value_forwarded_coin')}"
        )


    def postPreDeposit(self, wallet_id, ticker, status):
        log.info(
            f"Creating pre-deposit | user_id={self.user_id} | wallet_id={wallet_id} | "
            f"ticker={ticker} | status={status}"
        )
        with engine.begin() as conn:
            
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
            minimum = int(float(minimum))
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
