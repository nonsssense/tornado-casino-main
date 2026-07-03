# payments/blockbee.py

import httpx
from urllib.parse import quote
from config import BLOCKBEE_API_KEY, DOMAIN
from database.transactions import TransactionManager
from database.db_config import deposit_table, engine
import sqlalchemy as sa
from datetime import datetime

class BlockBeeClient:

    BASE_URL = "https://api.blockbee.io"

    async def create_payment_address(
        self,
        ticker: str,
        user_id: int,
        wallet_id: int,
        deposit_id: int
    ):

        callback = self.create_callback(
            user_id=user_id,
            wallet_id=wallet_id,
            deposit_id=deposit_id
        )

        url = f"{self.BASE_URL}/{ticker}/create/"

        params = {
            "apikey": BLOCKBEE_API_KEY,
            "callback": callback,
            "pending": 1,
            "confirmations": 1,
            "json": 1
        }

        # BlockBee answer ( status of payment and other)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params=params,
                timeout=30
            )

        response.raise_for_status()

        data = response.json()

        return {
            "address": data["address_in"],
            "minimum": data["minimum_transaction_coin"],
            "callback": data["callback_url"]
        }

    def create_callback(
        self,
        user_id: int,
        wallet_id: int,
        deposit_id: int
    ):

        callback = (
            f"{DOMAIN}/api/payment/webhook"
            f"?user_id={user_id}"
            f"&wallet_id={wallet_id}"
            f"&deposit_id={deposit_id}"
        )

        return quote(callback, safe="")
    

class DepositManager:

    def __init__(self, user_id):
        self.user_id = int(user_id)

    def processWebhook(self, deposit, webhook):
        # data = response from blockbee with update status in blockchain, constain uuid, and others

        if not self.validateDeposit(deposit, webhook):
            return

        if int(webhook["pending"]) == 1:
            self.markPending(deposit,webhook)
            return

        self.completeDeposit(deposit,webhook)

    def markPending(self, deposit, webhook):
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

    def completeDeposit(self, deposit, webhook):

        with engine.begin() as conn:
            transaction = TransactionManager(user_id = deposit["user_id"],wallet_id = deposit["wallet_id"],type = "deposit", amount = webhook["value_forwarded_coin"],status = "Completed", reference_id = webhook["uuid"])
            transaction_id = transaction.postTransaction(conn)

            self.finishDeposit(deposit, webhook, transaction_id, conn)

    def finishDeposit(self, deposit, webhook, transaction_id, conn):
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


    def postPreDeposit(self, wallet_id, ticker, status):
        with engine.begin() as conn:
            
            deposit_id = self.findOpenDeposit(wallet_id, ticker)
            if deposit_id is not None:
                return deposit_id

            post_stmt = sa.insert(deposit_table).values(user_id=self.user_id, wallet_id=wallet_id, coin=ticker, status=status, created_at=datetime.now()).returning(deposit_table.c.id)
            deposit_id = conn.execute(post_stmt).scalar_one()

            return deposit_id
        
    def updateAddressDeposit(self, deposit_id, address, minimum):
        with engine.begin() as conn:
            update_stmt = sa.update(deposit_table).where(deposit_table.c.id==deposit_id).values(address_in=address, minimum=minimum)
            conn.execute(update_stmt)

    def findOpenDeposit(self, wallet_id, ticker):
        with engine.begin() as conn:
            get_stmt = sa.select(deposit_table.c.id).where(deposit_table.c.user_id==self.user_id, deposit_table.c.wallet_id==wallet_id, deposit_table.c.coin==ticker, deposit_table.c.status=='Open deposit window').limit(1)
            result = conn.scalar(get_stmt)
            
            if result is not None:
                # if deposit created return result
                return result
            return None
        
    def getDeposit(self, deposit_id):
        with engine.begin() as conn:
            stmt = (
                sa.select(deposit_table)
                .where(deposit_table.c.id == deposit_id)
            )

            return conn.execute(stmt).mappings().first()
    
    def validateDeposit(self, deposit, webhook):
        if deposit["status"] != "Open deposit window" and deposit["status"] != "Pending":
            return False

        if deposit["uuid"] is not None and deposit["uuid"] != webhook["uuid"]:
            return False

        if deposit["address_in"] != webhook["address_in"]:
            return False

        if deposit["coin"] != webhook["coin"]:
            return False

        return True
