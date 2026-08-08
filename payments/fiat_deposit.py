import asyncio
import json
import os
import secrets
from datetime import datetime, timedelta

import httpx
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from config import (
    DOMEN as DOMAIN,
    NIRVANA_API_PUBLIC_KEY as pb_key,
    NIRVANA_API_PRIVATE_KEY as pv_key,
    FIAT_DEPOSIT_MIN_KZT,
)
from database.db_config import engine, deposit_table, transaction_table
from database.wallet import lock_wallet, WalletManager, BALANCE_REAL
from database.transactions import TransactionManager
from database.bonus import BonusManager
from promo.promo_manager import PromotionManager
from payments.convert import fiat_to_usd
from log_manager import log

from database.db_config import engine, deposit_table, transaction_table 
from database.wallet import lock_wallet, WalletManager, BALANCE_REAL
from database.transactions import TransactionManager
from database.bonus import BonusManager
from promo.promo_manager import PromotionManager
from payments.convert import fiat_to_usd


NIRVANA_WHITELIST_IPS = json.loads(os.getenv("NIRVANA_CALLBACK_IPS", "[]"))
FIAT_CURRENCY = "KZT"
FIAT_DEPOSIT_MAX_KZT = 600000
# KZ pay-in methods from the NirvanaPay tariff sheet. `token` must match what
# Nirvana expects BYTE-FOR-BYTE (the UZS example used "Humo UZS" = method+currency),
# TODO(nirvana): confirm exact spelling / whether a " KZT" suffix is required.
FIAT_TOKENS_KZT = frozenset({"Kaspi", "Berek"})
FIAT_ORDER_TTL_MINUTES = int(os.getenv("FIAT_ORDER_TTL_MINUTES", "30") or 30)
FIAT_RECONCILE_INTERVAL_SECONDS = 60
PROVIDER_NIRVANA = "nirvana"

FIAT_STATUS_CREATING = "creating"            # row written, create/in not confirmed
FIAT_STATUS_AWAITING = "awaiting_payment"    # requisites issued, waiting for pay
FIAT_STATUS_PAID = "paid"                    # provider SUCCESS, ready to credit
FIAT_STATUS_MISMATCH = "amount_mismatch"     # received < ordered (under-payment)
FIAT_STATUS_FAILED = "failed"                # create/in or provider ERROR
FIAT_STATUS_EXPIRED = "expired"              # TTL elapsed unpaid
_ACTIVE_STATUSES = (FIAT_STATUS_CREATING, FIAT_STATUS_AWAITING)

NIRVANA_CREATED = "CREATED"
NIRVANA_SUCCESS = "SUCCESS"
NIRVANA_ERROR = "ERROR"

class FiatProviderError(Exception):
    """Nirvana returned an error / non-standard response for a fiat order."""


_fiat_schema_ready = False


def ensure_fiat_deposit_schema():
    global _fiat_schema_ready
    if _fiat_schema_ready:
        return

    columns_ddl = (
        ("provider", "VARCHAR(16)"),
        ("external_id", "VARCHAR(64)"),
        ("token", "VARCHAR(64)"),
        ("currency", "VARCHAR(8)"),
        ("amount_kzt", "NUMERIC"),
        ("amount_fiat_received", "NUMERIC"),
        ("receiver", "VARCHAR(128)"),
        ("recipient_name", "VARCHAR(128)"),
        ("bank_name", "VARCHAR(64)"),
        ("tracker_id", "VARCHAR(128)"),
        ("provider_rate", "NUMERIC"),
        ("amount_crypto", "NUMERIC"),
        ("nirvana_status", "VARCHAR(16)"),
        ("last_status_checked_at", "TIMESTAMP"),
    )
    with engine.begin() as conn:
        for col, typ in columns_ddl:
            conn.execute(sa.text(
                f"ALTER TABLE deposit ADD COLUMN IF NOT EXISTS {col} {typ}"
            ))
        # Unguessable external id must be unique across fiat rows.
        conn.execute(sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_deposit_external_id "
            "ON deposit (external_id) WHERE external_id IS NOT NULL"
        ))
        # Enforce one active Nirvana order per user at the DB level.
        conn.execute(sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_deposit_active_nirvana "
            "ON deposit (user_id) "
            "WHERE provider = 'nirvana' AND status IN ('creating', 'awaiting_payment')"
        ))

    column_types = (
        ("provider", sa.String(16)),
        ("external_id", sa.String(64)),
        ("token", sa.String(64)),
        ("currency", sa.String(8)),
        ("amount_kzt", sa.Numeric),
        ("amount_fiat_received", sa.Numeric),
        ("receiver", sa.String(128)),
        ("recipient_name", sa.String(128)),
        ("bank_name", sa.String(64)),
        ("tracker_id", sa.String(128)),
        ("provider_rate", sa.Numeric),
        ("amount_crypto", sa.Numeric),
        ("nirvana_status", sa.String(16)),
        ("last_status_checked_at", sa.DateTime),
    )
    for col, typ in column_types:
        try:
            deposit_table.append_column(
                sa.Column(col, typ, nullable=True),
                replace_existing=True,
            )
        except Exception:
            pass

    _fiat_schema_ready = True
    log.info("Fiat deposit schema ensured (Nirvana columns on `deposit`)")


def _to_number(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _load_order_row(external_id):
    with engine.begin() as conn:
        return conn.execute(
            sa.select(deposit_table).where(
                deposit_table.c.external_id == external_id
            )
        ).mappings().first()


def _list_active_orders():
    with engine.begin() as conn:
        return conn.execute(
            sa.select(deposit_table).where(
                deposit_table.c.provider == PROVIDER_NIRVANA,
                deposit_table.c.status.in_(_ACTIVE_STATUSES),
            )
        ).mappings().all()


class FiatDeposit:
    "NirvanaPay pay-in (deposit) client + DB skeleton for a single user."

    PAYIN_URL = "https://api.nirvanapay.pro/create/in"
    PAYOUT_URL = "https://api.nirvanapay.pro/create/out"
    STATUS_URL = "https://api.nirvanapay.pro/transaction/status"
    BALANCE_URL = "https://api.nirvanapay.pro/client/balance"

    HTTP_TIMEOUT = 30

    def __init__(self, user_id):
        self.user_id = int(user_id)
        log.info(f"FiatDeposit initialized | user_id={self.user_id}")

    # ------------------------------------------------------------- helpers ---

    @staticmethod
    def _headers():
        # TODO(nirvana): confirm api.nirvanapay.pro auth. The AUTHORIZATION
        # section says ApiPublic/ApiPrivate for every request (with a typo that
        # duplicates the public key). We send the real private key here.
        return {
            "ApiPublic": pb_key or "",
            "ApiPrivate": pv_key or "",
        }

    @staticmethod
    def _callback_url(external_id):
        # One canonical callback; Nirvana calls it as GET with our ?id=.
        return f"{DOMAIN}/api/fiatpayment/webhook?id={external_id}"

    def _synthetic_email(self):
        # Deterministic per-user synthetic email (Telegram players have none).
        return f"user{self.user_id}@players.local"

    @staticmethod
    def _new_external_id():
        return secrets.token_hex(16)

    @staticmethod
    def validate_amount(amount_kzt):
        # KZT has no minor units in practice — operate in whole tenge.
        amount = int(round(float(amount_kzt)))
        if amount < int(FIAT_DEPOSIT_MIN_KZT):
            raise ValueError(f"Minimum deposit is {int(FIAT_DEPOSIT_MIN_KZT)} KZT")
        if amount > FIAT_DEPOSIT_MAX_KZT:
            raise ValueError(f"Maximum deposit is {FIAT_DEPOSIT_MAX_KZT} KZT")
        return amount

    @staticmethod
    def validate_token(token):
        token = (token or "").strip()
        if token not in FIAT_TOKENS_KZT:
            raise ValueError("Unsupported payment method")
        return token

    @staticmethod
    def _order_public(row):
        """Shape returned to the frontend (Mini App requisites card)."""
        if row is None:
            return None
        return {
            "external_id": row.get("external_id"),
            "status": row.get("status"),
            "currency": row.get("currency"),
            "amount_kzt": _to_number(row.get("amount_kzt")),
            "token": row.get("token"),
            "receiver": row.get("receiver"),
            "recipient_name": row.get("recipient_name"),
            "bank_name": row.get("bank_name"),
        }

    #DB writes

    def find_active_order(self):
        with engine.begin() as conn:
            return conn.execute(
                sa.select(deposit_table).where(
                    deposit_table.c.user_id == self.user_id,
                    deposit_table.c.provider == PROVIDER_NIRVANA,
                    deposit_table.c.status.in_(_ACTIVE_STATUSES),
                ).limit(1)
            ).mappings().first()

    def _get_or_create_pre_order(self, wallet_id, amount_kzt, token, external_id):

        with engine.begin() as conn:
            if lock_wallet(conn, self.user_id, wallet_id) is None:
                raise ValueError("Wallet not found")

            existing = conn.execute(
                sa.select(deposit_table).where(
                    deposit_table.c.user_id == self.user_id,
                    deposit_table.c.provider == PROVIDER_NIRVANA,
                    deposit_table.c.status.in_(_ACTIVE_STATUSES),
                ).with_for_update().limit(1)
            ).mappings().first()
            if existing is not None:
                return existing, False

            try:
                inserted = conn.execute(
                    sa.insert(deposit_table).values(
                        user_id=self.user_id,
                        wallet_id=wallet_id,
                        # `coin` is NOT NULL on the shared deposit table (crypto legacy).
                        # Fiat rows carry the fiat currency here as the "coin" marker.
                        coin=FIAT_CURRENCY,
                        provider=PROVIDER_NIRVANA,
                        external_id=external_id,
                        currency=FIAT_CURRENCY,
                        amount_kzt=amount_kzt,
                        token=token,
                        status=FIAT_STATUS_CREATING,
                        created_at=datetime.now(),
                    ).returning(deposit_table)
                ).mappings().first()
            except IntegrityError as exc:
                # Only the partial unique index (one active Nirvana order per user)
                # should land here now that required columns are populated.
                log.warning(
                    f"Fiat pre-order insert conflict | user_id={self.user_id} | "
                    f"external_id={external_id} | {getattr(exc, 'orig', exc)}"
                )
                raise ValueError("You already have an active deposit order") from None

            log.info(
                f"Fiat pre-order INSERT | user_id={self.user_id} | "
                f"external_id={external_id} | amount_kzt={amount_kzt} | token={token}"
            )
            return inserted, True

    def _apply_create_response(self, external_id, data):
        extra = data.get("extra") or {}
        values = {
            "receiver": data.get("receiver"),
            "tracker_id": data.get("trackerID"),
            "recipient_name": extra.get("recipientName"),
            "bank_name": extra.get("bankName"),
            "amount_crypto": _to_number(data.get("amountCrypto")),
            "provider_rate": _to_number(data.get("rate")),
            "nirvana_status": NIRVANA_CREATED,
            "status": FIAT_STATUS_AWAITING,
        }
        with engine.begin() as conn:
            row = conn.execute(
                sa.update(deposit_table)
                .where(
                    deposit_table.c.external_id == external_id,
                    deposit_table.c.status == FIAT_STATUS_CREATING,
                )
                .values(**values)
                .returning(deposit_table)
            ).mappings().first()
        log.info(
            f"Fiat order requisites stored | user_id={self.user_id} | "
            f"external_id={external_id} | tracker_id={data.get('trackerID')}"
        )
        return row

    def _mark_failed(self, external_id, reason=None):
        with engine.begin() as conn:
            conn.execute(
                sa.update(deposit_table)
                .where(
                    deposit_table.c.external_id == external_id,
                    deposit_table.c.status.in_(_ACTIVE_STATUSES),
                )
                .values(status=FIAT_STATUS_FAILED, nirvana_status=NIRVANA_ERROR)
            )
        log.info(
            f"Fiat order marked failed | user_id={self.user_id} | "
            f"external_id={external_id} | reason={reason}"
        )
        from admin_panel.alerts import send_alert
        send_alert(
            f"Fiat deposit FAILED | user #{self.user_id} | reason={reason}",
            category="psp_error",
        )

    # --------------------------------------------------------- order flow ---

    async def create_order(self, wallet_id, amount_kzt, token, ip, user_agent):
        """Validate → write-ahead row → create/in → store requisites.

        Reuse policy: never two parallel orders per user — an existing active
        order is returned as-is instead of creating a new one.
        """
        amount_kzt = self.validate_amount(amount_kzt)
        token = self.validate_token(token)

        existing = self.find_active_order()
        if existing is not None:
            log.info(
                f"Reusing active fiat order | user_id={self.user_id} | "
                f"external_id={existing.get('external_id')} | status={existing.get('status')}"
            )
            return self._order_public(existing)

        external_id = self._new_external_id()
        row, created = self._get_or_create_pre_order(
            wallet_id, amount_kzt, token, external_id
        )
        if not created:
            return self._order_public(row)

        try:
            data = await self._call_create_in(
                external_id=external_id,
                amount_kzt=amount_kzt,
                token=token,
                ip=ip,
                user_agent=user_agent,
            )
        except Exception:
            log.exception(
                f"Nirvana create/in request failed | user_id={self.user_id} | "
                f"external_id={external_id}"
            )
            self._mark_failed(external_id, "provider_request_failed")
            raise FiatProviderError("Payment provider is unavailable")

        status = (data.get("status") or "").upper()
        receiver = data.get("receiver")
        if status != NIRVANA_CREATED or not receiver:
            reason = data.get("reason") or "no_receiver"
            log.warning(
                f"Nirvana create/in rejected | user_id={self.user_id} | "
                f"external_id={external_id} | status={status} | reason={reason}"
            )
            self._mark_failed(external_id, str(reason)[:64])
            raise FiatProviderError(str(reason))

        updated = self._apply_create_response(external_id, data)
        return self._order_public(updated)

    async def _call_create_in(self, external_id, amount_kzt, token, ip, user_agent):
        payload = {
            "clientID": external_id,
            "amount": int(amount_kzt),
            "token": token,
            "currency": FIAT_CURRENCY,
            "callbackUrl": self._callback_url(external_id),
            "userInfo": {
                "ip": ip or "",
                "ua": user_agent or "",
                "email": "",
                "id": str(self.user_id),
            },
        }
        log.info(
            f"Nirvana create/in request | user_id={self.user_id} | "
            f"external_id={external_id} | amount_kzt={amount_kzt} | token={token}"
        )
        # TODO(nirvana): confirm HTTP method — assuming POST JSON.
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.PAYIN_URL,
                json=payload,
                headers=self._headers(),
                timeout=self.HTTP_TIMEOUT,
            )
        response.raise_for_status()
        data = response.json()
        log.info(
            f"Nirvana create/in response | user_id={self.user_id} | "
            f"external_id={external_id} | status={data.get('status')} | "
            f"trackerID={data.get('trackerID')}"
        )
        return data

    # ------------------------------------------------------ status / recon ---

    async def fetch_status(self, external_id):
        """Query Nirvana transaction/status by clientID (our external_id)."""
        payload = {"clientID": external_id}
        # TODO(nirvana): confirm HTTP method — assuming POST JSON.
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.STATUS_URL,
                json=payload,
                headers=self._headers(),
                timeout=self.HTTP_TIMEOUT,
            )
        response.raise_for_status()
        data = response.json()
        log.info(
            f"Nirvana status | user_id={self.user_id} | external_id={external_id} | "
            f"status={data.get('status')} | received={data.get('amountFiatReceived')}"
        )
        return data

    async def reconcile(self, external_id):
        row = _load_order_row(external_id)
        if row is None:
            log.warning(f"Fiat reconcile: order not found | external_id={external_id}")
            return
        if row.get("status") not in _ACTIVE_STATUSES:
            log.info(
                f"Fiat reconcile: order not active, skip | external_id={external_id} | "
                f"status={row.get('status')}"
            )
            return

        try:
            data = await self.fetch_status(external_id)
        except Exception:
            log.exception(f"Fiat status fetch failed | external_id={external_id}")
            return

        nirvana_status = (data.get("status") or "").upper()
        received = _to_number(data.get("amountFiatReceived"))
        ordered = _to_number(data.get("amountFiatOrdered"))

        if nirvana_status == NIRVANA_SUCCESS:
            self._mark_confirmed(external_id, received, ordered, data)
        elif nirvana_status == NIRVANA_ERROR:
            self._mark_failed(external_id, "provider_error")
        else:
            self._touch_status(external_id, nirvana_status)
            self._maybe_expire(row)

    def _mark_confirmed(self, external_id, received, ordered, data):
        tracker_id = data.get("trackerID")
        reference_id = str(tracker_id or external_id)
        mismatch = (
            received is not None and ordered is not None and received + 1e-9 < ordered
        )

        with engine.begin() as conn:
            locked = conn.execute(
                sa.select(deposit_table)
                .where(deposit_table.c.external_id == external_id)
                .with_for_update()
            ).mappings().first()

            if locked is None:
                return
            # Already finalized (Completed / failed / expired) → idempotent no-op.
            if locked["status"] not in _ACTIVE_STATUSES:
                return
            if locked.get("transaction_id") is not None:
                return

            # Credit exactly what ARRIVED; fall back to ordered/requested if the
            # provider didn't report a received amount on SUCCESS.
            credit_kzt = received or ordered or _to_number(locked.get("amount_kzt"))
            if not credit_kzt or credit_kzt <= 0:
                log.error(
                    f"Fiat confirm without a positive amount | external_id={external_id}"
                )
                return

            # Defensive dedupe (in case a prior run posted the tx but failed to link).
            existing_tx = conn.execute(
                sa.select(transaction_table.c.id).where(
                    transaction_table.c.user_id == locked["user_id"],
                    transaction_table.c.reference_id == reference_id,
                    transaction_table.c.type == "deposit",
                ).limit(1)
            ).scalar_one_or_none()

            usd_amount, convert_rate = fiat_to_usd(FIAT_CURRENCY, credit_kzt)

            wallet = WalletManager(locked["user_id"])
            if lock_wallet(conn, locked["user_id"], locked["wallet_id"]) is None:
                log.error(
                    f"Wallet missing on fiat credit | user_id={locked['user_id']} | "
                    f"external_id={external_id}"
                )
                return

            if existing_tx is not None:
                transaction_id = existing_tx
            else:
                balances = wallet.apply_balance_deltas(
                    conn, locked["wallet_id"], real_delta=usd_amount
                )
                transaction_id = TransactionManager(
                    user_id=locked["user_id"],
                    wallet_id=locked["wallet_id"],
                    balance_type=BALANCE_REAL,
                    transaction_type="deposit",
                    amount=usd_amount,
                    balance_after=balances["real_balance"],
                    status="Completed",
                    reference_id=reference_id,
                ).postTransaction(conn)

                # deposit_index counts Completed rows; current row is not Completed
                # yet, so +1 is correct. Fires deposit bonus + referral FTD.
                deposit_index = BonusManager(
                    locked["user_id"]
                ).countCompletedDeposits(conn=conn) + 1
                PromotionManager(locked["user_id"]).on_deposit_confirmed(
                    user_id=locked["user_id"],
                    wallet_id=locked["wallet_id"],
                    amount_usd=usd_amount,
                    deposit_index=deposit_index,
                    conn=conn,
                )

            conn.execute(
                sa.update(deposit_table)
                .where(deposit_table.c.id == locked["id"])
                .values(
                    status="Completed",
                    nirvana_status=NIRVANA_SUCCESS,
                    amount_fiat_received=received,
                    usd_amount=usd_amount,
                    convert_rate=convert_rate,
                    tracker_id=tracker_id,
                    transaction_id=transaction_id,
                    confirmed_at=datetime.now(),
                    last_status_checked_at=datetime.now(),
                )
            )

        log.info(
            f"Fiat deposit credited | user_id={self.user_id} | external_id={external_id} | "
            f"kzt={credit_kzt} | usd={usd_amount} | rate={convert_rate} | "
            f"tx={transaction_id} | mismatch={mismatch}"
        )
        from admin_panel.alerts import send_alert
        send_alert(
            f"Fiat deposit credited | user #{self.user_id} | "
            f"{credit_kzt:g} KZT → ${usd_amount:.2f}"
            + (" | ⚠ under-payment" if mismatch else ""),
            category="deposit",
        )

    def _touch_status(self, external_id, nirvana_status):
        with engine.begin() as conn:
            conn.execute(
                sa.update(deposit_table)
                .where(deposit_table.c.external_id == external_id)
                .values(
                    nirvana_status=nirvana_status,
                    last_status_checked_at=datetime.now(),
                )
            )

    def _maybe_expire(self, row):
        created = row.get("created_at")
        if created is None:
            return
        if datetime.now() - created < timedelta(minutes=FIAT_ORDER_TTL_MINUTES):
            return
        with engine.begin() as conn:
            conn.execute(
                sa.update(deposit_table)
                .where(
                    deposit_table.c.external_id == row.get("external_id"),
                    deposit_table.c.status == FIAT_STATUS_AWAITING,
                )
                .values(status=FIAT_STATUS_EXPIRED)
            )
        log.info(
            f"Fiat order expired locally (TTL) | external_id={row.get('external_id')}"
        )

    @classmethod
    async def reconcile_external(cls, external_id):
        """Entry point for the callback: resolve the owner and reconcile."""
        row = _load_order_row(external_id)
        if row is None:
            log.warning(
                f"Fiat callback: unknown external_id | external_id={external_id}"
            )
            return
        await cls(row["user_id"]).reconcile(external_id)


async def fiat_deposit_reconcile_loop(interval_seconds=FIAT_RECONCILE_INTERVAL_SECONDS):
    """Safety net: reconcile active Nirvana orders even if a callback is lost."""
    log.info(
        f"Fiat deposit reconcile loop started | interval_seconds={interval_seconds}"
    )
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            orders = await asyncio.to_thread(_list_active_orders)
            for order in orders:
                try:
                    await FiatDeposit(order["user_id"]).reconcile(order["external_id"])
                except Exception:
                    log.exception(
                        f"Fiat reconcile loop item failed | "
                        f"external_id={order.get('external_id')}"
                    )
        except asyncio.CancelledError:
            log.info("Fiat deposit reconcile loop cancelled")
            raise
        except Exception:
            log.exception("Fiat deposit reconcile loop pass failed")
