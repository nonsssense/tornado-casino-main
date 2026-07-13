from database.db_config import engine, bonus_instances_table, deposit_table
from database.transactions import TransactionManager
from database.wallet import WalletManager, BALANCE_REAL, BALANCE_BONUS
import sqlalchemy as sa
from datetime import datetime, timedelta
from log_manager import log

BONUS_STATUS_ACTIVE = "active"
BONUS_STATUS_UNLOCKED = "unlocked"
BONUS_STATUS_EXPIRED = "expired"
BONUS_STATUS_FORFEITED = "forfeited"

# Offer / instance states exposed to the API (frontend renders only).
BONUS_STATE_AVAILABLE = "available"
BONUS_STATE_ACTIVE = "active"
BONUS_STATE_COMPLETED = "completed"
BONUS_STATE_EXPIRED = "expired"
BONUS_STATE_FORFEITED = "forfeited"
BONUS_STATE_UPCOMING = "upcoming"

# Sources that may be granted at most once per user.
ONCE_ONLY_SOURCES = frozenset({
    "welcome",
    "deposit_tier_1",
    "deposit_tier_2",
    "deposit_tier_3",
})

STATUS_TO_OFFER_STATE = {
    BONUS_STATUS_ACTIVE: BONUS_STATE_ACTIVE,
    BONUS_STATUS_UNLOCKED: BONUS_STATE_COMPLETED,
    BONUS_STATUS_EXPIRED: BONUS_STATE_EXPIRED,
    BONUS_STATUS_FORFEITED: BONUS_STATE_FORFEITED,
}

# Shared deposit-bonus rules (first 3 deposits).
DEPOSIT_BONUS_WAGER_MULTIPLIER = 50
DEPOSIT_BONUS_EXPIRES_DAYS = 5
DEPOSIT_BONUS_EDGE_BASIS = 0.025
DEPOSIT_BONUS_MAX_BET_PERCENT = 0.02
DEPOSIT_BONUS_MAX_BET_ABSOLUTE = 2.5
DEPOSIT_BONUS_MAX_WIN_STAKE_MULTIPLIER = 50
DEPOSIT_BONUS_MAX_WIN_ABSOLUTE = 50.0
DEPOSIT_BONUS_ELIGIBLE_GAMES = {
    "dice": True,
    "crash": True,
    "plinco": {"risk_modes": ["low"]},
}

# First three deposits — one tier per deposit index.
DEPOSIT_BONUS_OFFERS = (
    {
        "id": "deposit_tier_1",
        "source": "deposit_tier_1",
        "deposit_index": 1,
        "name": "Deposit Bonus Tier 1",
        "percent": 50,
        "description": "50% match on your 1st deposit",
        "wager_multiplier": DEPOSIT_BONUS_WAGER_MULTIPLIER,
        "expires_days": DEPOSIT_BONUS_EXPIRES_DAYS,
        "edge_basis": DEPOSIT_BONUS_EDGE_BASIS,
        "max_bet_percent_of_bonus": DEPOSIT_BONUS_MAX_BET_PERCENT,
        "max_bet_absolute": DEPOSIT_BONUS_MAX_BET_ABSOLUTE,
        "max_win_stake_multiplier": DEPOSIT_BONUS_MAX_WIN_STAKE_MULTIPLIER,
        "max_win_absolute": DEPOSIT_BONUS_MAX_WIN_ABSOLUTE,
        "eligible_games": DEPOSIT_BONUS_ELIGIBLE_GAMES,
    },
    {
        "id": "deposit_tier_2",
        "source": "deposit_tier_2",
        "deposit_index": 2,
        "name": "Deposit Bonus Tier 2",
        "percent": 75,
        "description": "75% match on your 2nd deposit",
        "wager_multiplier": DEPOSIT_BONUS_WAGER_MULTIPLIER,
        "expires_days": DEPOSIT_BONUS_EXPIRES_DAYS,
        "edge_basis": DEPOSIT_BONUS_EDGE_BASIS,
        "max_bet_percent_of_bonus": DEPOSIT_BONUS_MAX_BET_PERCENT,
        "max_bet_absolute": DEPOSIT_BONUS_MAX_BET_ABSOLUTE,
        "max_win_stake_multiplier": DEPOSIT_BONUS_MAX_WIN_STAKE_MULTIPLIER,
        "max_win_absolute": DEPOSIT_BONUS_MAX_WIN_ABSOLUTE,
        "eligible_games": DEPOSIT_BONUS_ELIGIBLE_GAMES,
    },
    {
        "id": "deposit_tier_3",
        "source": "deposit_tier_3",
        "deposit_index": 3,
        "name": "Deposit Bonus Tier 3",
        "percent": 150,
        "description": "150% match on your 3rd deposit",
        "wager_multiplier": DEPOSIT_BONUS_WAGER_MULTIPLIER,
        "expires_days": DEPOSIT_BONUS_EXPIRES_DAYS,
        "edge_basis": DEPOSIT_BONUS_EDGE_BASIS,
        "max_bet_percent_of_bonus": DEPOSIT_BONUS_MAX_BET_PERCENT,
        "max_bet_absolute": DEPOSIT_BONUS_MAX_BET_ABSOLUTE,
        "max_win_stake_multiplier": DEPOSIT_BONUS_MAX_WIN_STAKE_MULTIPLIER,
        "max_win_absolute": DEPOSIT_BONUS_MAX_WIN_ABSOLUTE,
        "eligible_games": DEPOSIT_BONUS_ELIGIBLE_GAMES,
    },
)

_OFFERS_BY_ID = {offer["id"]: offer for offer in DEPOSIT_BONUS_OFFERS}
_OFFERS_BY_SOURCE = {offer["source"]: offer for offer in DEPOSIT_BONUS_OFFERS}
_OFFERS_BY_INDEX = {offer["deposit_index"]: offer for offer in DEPOSIT_BONUS_OFFERS}

_selection_column_ready = False


def compute_deposit_bonus_principal(deposit_amount, percent):
    return float(deposit_amount) * (float(percent) / 100.0)


def compute_deposit_bonus_max_bet(bonus_principal):
    return min(
        float(bonus_principal) * DEPOSIT_BONUS_MAX_BET_PERCENT,
        DEPOSIT_BONUS_MAX_BET_ABSOLUTE,
    )


def compute_deposit_bonus_max_win_cap(_bonus_principal=None):
    return DEPOSIT_BONUS_MAX_WIN_ABSOLUTE


def _ensure_selection_column():
    global _selection_column_ready
    if _selection_column_ready:
        return
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "ALTER TABLE wallet "
                "ADD COLUMN IF NOT EXISTS selected_bonus_source VARCHAR(32)"
            )
        )
    _selection_column_ready = True
    log.info("Wallet selected_bonus_source column ensured")


class BonusManager:
    def __init__(self, user_id):
        self.user_id = user_id
        self.wallet = WalletManager(user_id)

    @staticmethod
    def getOfferCatalog():
        return [dict(offer) for offer in DEPOSIT_BONUS_OFFERS]

    @staticmethod
    def getOfferById(offer_id):
        offer = _OFFERS_BY_ID.get(offer_id)
        return dict(offer) if offer else None

    @staticmethod
    def getOfferBySource(source):
        offer = _OFFERS_BY_SOURCE.get(source)
        return dict(offer) if offer else None

    @staticmethod
    def getOfferByDepositIndex(deposit_index):
        offer = _OFFERS_BY_INDEX.get(int(deposit_index))
        return dict(offer) if offer else None

    def countCompletedDeposits(self, conn=None):
        stmt = (
            sa.select(sa.func.count())
            .select_from(deposit_table)
            .where(
                deposit_table.c.user_id == self.user_id,
                deposit_table.c.status == "Completed",
            )
        )
        if conn is not None:
            return int(conn.execute(stmt).scalar_one() or 0)
        with engine.begin() as new_conn:
            return int(new_conn.execute(stmt).scalar_one() or 0)

    def getNextDepositIndex(self, conn=None):
        return self.countCompletedDeposits(conn=conn) + 1

    def getInstancesBySource(self, source, conn=None):
        stmt = (
            sa.select(bonus_instances_table)
            .where(
                bonus_instances_table.c.user_id == self.user_id,
                bonus_instances_table.c.source == source,
            )
            .order_by(bonus_instances_table.c.created_at.desc(), bonus_instances_table.c.id.desc())
        )
        if conn is not None:
            return conn.execute(stmt).mappings().all()
        with engine.begin() as new_conn:
            return new_conn.execute(stmt).mappings().all()

    def getLatestInstanceBySource(self, source, conn=None):
        rows = self.getInstancesBySource(source, conn=conn)
        return rows[0] if rows else None

    def hasReceivedSource(self, source, conn=None):
        """True if any bonus_instances row exists for this source (any status)."""
        return self.getLatestInstanceBySource(source, conn=conn) is not None

    def getReceivedSourcesSummary(self, conn=None):
        return {
            "welcome": self.hasReceivedSource("welcome", conn=conn),
            "deposit_tier_1": self.hasReceivedSource("deposit_tier_1", conn=conn),
            "deposit_tier_2": self.hasReceivedSource("deposit_tier_2", conn=conn),
            "deposit_tier_3": self.hasReceivedSource("deposit_tier_3", conn=conn),
            "reload": self.hasReceivedSource("reload", conn=conn),
            "cashback": self.hasReceivedSource("cashback", conn=conn),
        }

    def listInstancesByStatus(self, status, conn=None):
        stmt = (
            sa.select(bonus_instances_table)
            .where(
                bonus_instances_table.c.user_id == self.user_id,
                bonus_instances_table.c.status == status,
            )
            .order_by(bonus_instances_table.c.created_at.desc())
        )
        if conn is not None:
            rows = conn.execute(stmt).mappings().all()
        else:
            with engine.begin() as new_conn:
                rows = new_conn.execute(stmt).mappings().all()
        return [self._serializeInstance(row) for row in rows]

    def resolveDepositTierOfferState(self, offer, completed_deposits, conn=None):
        """
        Deterministic tier state from bonus_instances + completed deposit count.
        Instance status always wins when a grant exists.
        """
        instance = self.getLatestInstanceBySource(offer["source"], conn=conn)
        if instance is not None:
            return STATUS_TO_OFFER_STATE.get(instance["status"], BONUS_STATE_COMPLETED), instance

        next_index = completed_deposits + 1
        deposit_index = offer["deposit_index"]

        if deposit_index == next_index:
            return BONUS_STATE_AVAILABLE, None
        if deposit_index > next_index:
            return BONUS_STATE_UPCOMING, None

        # Deposit slot already passed without a grant record (legacy / missed grant).
        # Not claimable; not "completed" (completed = unlocked instance).
        return BONUS_STATE_EXPIRED, None

    def getEligibleDepositOffer(self, conn=None, completed_deposits=None):
        if completed_deposits is None:
            completed_deposits = self.countCompletedDeposits(conn=conn)
        next_index = completed_deposits + 1
        offer = self.getOfferByDepositIndex(next_index)
        if offer is None:
            return None
        state, _ = self.resolveDepositTierOfferState(offer, completed_deposits, conn=conn)
        if state != BONUS_STATE_AVAILABLE:
            return None
        return offer

    def listDepositOffers(self):
        """Deterministic deposit-tier states for the selector (backend is source of truth)."""
        wallet_id = self.wallet.ensureWallet()
        self.expireDueBonuses(wallet_id)

        completed = self.countCompletedDeposits()
        next_index = completed + 1
        eligible = self.getEligibleDepositOffer(completed_deposits=completed)
        selected = self.getSelectedOfferId(
            default_offer_id=eligible["id"] if eligible else None,
            completed_deposits=completed,
        )

        offers = []
        for offer in DEPOSIT_BONUS_OFFERS:
            state, instance = self.resolveDepositTierOfferState(offer, completed)
            selectable = state == BONUS_STATE_AVAILABLE
            is_selected = bool(selectable and selected and offer["id"] == selected)
            item = dict(offer)
            item["state"] = state
            item["selectable"] = selectable
            item["selected"] = is_selected
            item["instance_id"] = instance["id"] if instance else None
            item["instance_status"] = instance["status"] if instance else None
            offers.append(item)

        if selected and not any(o["selected"] for o in offers) and eligible:
            selected = eligible["id"]
            for item in offers:
                item["selected"] = item["id"] == selected and item["selectable"]

        active = [self._serializeInstance(row) for row in self.getActiveInstances()]

        return {
            "offers": offers,
            "selected_offer_id": selected if eligible else None,
            "completed_deposits": completed,
            "next_deposit_index": next_index if next_index <= 3 else None,
            "received": self.getReceivedSourcesSummary(),
            "active": active,
            "unlocked": self.listInstancesByStatus(BONUS_STATUS_UNLOCKED),
            "expired": self.listInstancesByStatus(BONUS_STATUS_EXPIRED),
            "forfeited": self.listInstancesByStatus(BONUS_STATUS_FORFEITED),
            "rules": {
                "wager_multiplier": DEPOSIT_BONUS_WAGER_MULTIPLIER,
                "expires_days": DEPOSIT_BONUS_EXPIRES_DAYS,
                "edge_basis": DEPOSIT_BONUS_EDGE_BASIS,
                "max_bet_percent_of_bonus": DEPOSIT_BONUS_MAX_BET_PERCENT,
                "max_bet_absolute": DEPOSIT_BONUS_MAX_BET_ABSOLUTE,
                "max_win_stake_multiplier": DEPOSIT_BONUS_MAX_WIN_STAKE_MULTIPLIER,
                "max_win_absolute": DEPOSIT_BONUS_MAX_WIN_ABSOLUTE,
                "eligible_games": DEPOSIT_BONUS_ELIGIBLE_GAMES,
                "expire_burns_bonus_and_winnings": True,
            },
        }

    def getSelectedOfferId(self, default_offer_id=None, completed_deposits=None):
        _ensure_selection_column()
        with engine.begin() as conn:
            source = conn.execute(
                sa.text(
                    "SELECT selected_bonus_source FROM wallet WHERE user_id = :user_id"
                ),
                {"user_id": self.user_id},
            ).scalar_one_or_none()

        eligible = self.getEligibleDepositOffer(completed_deposits=completed_deposits)

        if source and source in _OFFERS_BY_SOURCE:
            offer = _OFFERS_BY_SOURCE[source]
            if eligible and offer["id"] == eligible["id"]:
                return offer["id"]

        if default_offer_id:
            return default_offer_id

        return eligible["id"] if eligible else None

    def selectDepositOffer(self, offer_id):
        offer = self.getOfferById(offer_id)
        if offer is None:
            raise ValueError("Unknown bonus offer")

        eligible = self.getEligibleDepositOffer()
        if eligible is None or offer["id"] != eligible["id"]:
            raise ValueError("This deposit bonus tier is not available")

        self.wallet.ensureWallet()
        _ensure_selection_column()
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    "UPDATE wallet SET selected_bonus_source = :source "
                    "WHERE user_id = :user_id"
                ),
                {"source": offer["source"], "user_id": self.user_id},
            )

        log.info(
            f"Deposit bonus offer selected | user_id={self.user_id} | "
            f"offer_id={offer_id} | source={offer['source']}"
        )
        return self.listDepositOffers()

    def clearSelectedBonusSource(self, conn=None):
        """Clear wallet selection after a deposit bonus grant."""
        _ensure_selection_column()
        stmt = sa.text(
            "UPDATE wallet SET selected_bonus_source = NULL WHERE user_id = :user_id"
        )
        params = {"user_id": self.user_id}
        if conn is not None:
            conn.execute(stmt, params)
            return
        with engine.begin() as new_conn:
            new_conn.execute(stmt, params)

    @staticmethod
    def _is_game_eligible(eligible_games, game, risk_mode=None):
        if not eligible_games:
            return True
        entry = eligible_games.get(game)
        if entry is None:
            return False
        if entry is True:
            return True
        if isinstance(entry, dict):
            modes = entry.get("risk_modes")
            if modes is None:
                return True
            if risk_mode is None:
                return False
            allowed = {str(mode).lower() for mode in modes}
            return str(risk_mode).lower() in allowed
        return bool(entry)

    def getPrimaryActiveInstance(self, conn=None):
        instances = self.getActiveInstances(conn=conn)
        return instances[0] if instances else None

    def canPlaceBonusBet(self, stake, game, conn=None, risk_mode=None):
        try:
            self.validateBonusBet(stake, game, conn=conn, risk_mode=risk_mode)
            return True
        except ValueError:
            return False

    def validateBonusBet(self, stake, game, conn=None, risk_mode=None):
        """
        Enforce bonus_instances / catalog rules for a BONUS-balance bet.
        Crash must not call this — Crash is REAL-only for MVP.
        """
        if conn is not None:
            return self._validateBonusBet(stake, game, conn, risk_mode=risk_mode)
        with engine.begin() as new_conn:
            return self._validateBonusBet(stake, game, new_conn, risk_mode=risk_mode)

    def _validateBonusBet(self, stake, game, conn, risk_mode=None):
        self.expireDueBonuses(self.wallet.ensureWallet(), conn=conn)
        instance = self.getPrimaryActiveInstance(conn=conn)
        if instance is None:
            raise ValueError("No active bonus available for this bet")

        stake = float(stake)
        offer = self.getOfferBySource(instance["source"]) or {}
        eligible_games = offer.get("eligible_games") or {}

        if not self._is_game_eligible(eligible_games, game, risk_mode=risk_mode):
            if game == "plinco":
                raise ValueError(
                    "Deposit Bonus can only be used on Plinko LOW risk mode"
                )
            raise ValueError(f"Bonus balance cannot be used on {game}")

        if instance.get("requires_deposit_gate"):
            if self.countCompletedDeposits(conn=conn) < 1:
                raise ValueError("A completed deposit is required before using this bonus")

        max_bet = instance.get("max_bet")
        if max_bet is not None and stake > float(max_bet) + 1e-12:
            raise ValueError(
                f"Bet exceeds bonus max bet of {float(max_bet):.4f}"
            )

        max_win_cap = instance.get("max_win_cap")
        if max_win_cap is not None and stake > float(max_win_cap) + 1e-12:
            raise ValueError(
                f"Bet exceeds bonus max win cap of {float(max_win_cap):.4f}"
            )

        return instance

    def capBonusWin(self, stake, payout_amount, conn=None):
        """
        Cap BONUS win credit using the primary active instance max_win_cap.
        payout_amount is the full credit (stake return + profit, or plinko payout).
        """
        instance = self.getPrimaryActiveInstance(conn=conn)
        if instance is None:
            return float(payout_amount)

        max_win_cap = instance.get("max_win_cap")
        if max_win_cap is None:
            return float(payout_amount)

        stake = float(stake)
        payout_amount = float(payout_amount)
        max_win_cap = float(max_win_cap)
        # Profit capped; stake portion of credit is preserved when payout >= stake.
        profit = max(0.0, payout_amount - stake)
        if profit <= max_win_cap:
            return payout_amount
        return stake + max_win_cap

    def listActiveBonuses(self):
        self.expireDueBonuses(self.wallet.ensureWallet())
        instances = self.getActiveInstances()
        return [self._serializeInstance(row) for row in instances]

    def _serializeInstance(self, row):
        source = row.get("source")
        offer = self.getOfferBySource(source) or {}
        wager_required = float(row.get("wager_required") or 0)
        wager_progress = float(row.get("wager_progress") or 0)
        principal = float(row.get("principal") or 0)
        expires_at = row.get("expires_at")
        status = row.get("status")
        return {
            "id": row.get("id"),
            "source": source,
            "name": offer.get("name") or source,
            "percent": offer.get("percent"),
            "description": offer.get("description"),
            "principal": principal,
            "wager_required": wager_required,
            "wager_progress": wager_progress,
            "wager_remaining": max(0.0, wager_required - wager_progress),
            "max_bet": float(row["max_bet"]) if row.get("max_bet") is not None else None,
            "max_win_cap": float(row["max_win_cap"]) if row.get("max_win_cap") is not None else None,
            "status": status,
            "state": STATUS_TO_OFFER_STATE.get(status, status),
            "expires_at": expires_at.isoformat() if expires_at else None,
            "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
            "eligible_games": offer.get("eligible_games"),
        }

    def createInstance(
        self,
        conn,
        wallet_id,
        source,
        principal,
        wager_required,
        expires_at=None,
        max_bet=None,
        max_win_cap=None,
        requires_deposit_gate=False,
    ):
        existing = self.getLatestInstanceBySource(source, conn=conn)
        if existing is not None:
            if source in ONCE_ONLY_SOURCES:
                log.info(
                    f"Idempotent grant skip | user_id={self.user_id} | source={source} | "
                    f"existing_id={existing['id']} | status={existing['status']}"
                )
                return existing["id"]
            if existing["status"] == BONUS_STATUS_ACTIVE:
                log.info(
                    f"Idempotent grant skip active | user_id={self.user_id} | source={source} | "
                    f"existing_id={existing['id']}"
                )
                return existing["id"]

        post_stmt = (
            sa.insert(bonus_instances_table)
            .values(
                user_id=self.user_id,
                source=source,
                principal=principal,
                wager_required=wager_required,
                wager_progress=0,
                status=BONUS_STATUS_ACTIVE,
                max_bet=max_bet,
                max_win_cap=max_win_cap,
                requires_deposit_gate=requires_deposit_gate,
                expires_at=expires_at,
                created_at=datetime.now(),
            )
            .returning(bonus_instances_table.c.id)
        )
        instance_id = conn.execute(post_stmt).scalar_one()

        bonus_balance = self.wallet.getBonusBalance(wallet_id, conn=conn)
        balance_after = bonus_balance + principal
        self.wallet.updateBonusBalance(conn, balance_after)

        TransactionManager(
            user_id=self.user_id,
            wallet_id=wallet_id,
            balance_type=BALANCE_BONUS,
            transaction_type=f"bonus grant {source}",
            amount=principal,
            balance_after=balance_after,
            status="Done",
            bonus_instance_id=instance_id,
        ).postTransaction(conn)

        log.info(
            f"Bonus instance created | user_id={self.user_id} | instance_id={instance_id} | "
            f"source={source} | principal={principal}"
        )
        return instance_id

    def grantWelcomeBonus(self, wallet_id, principal, wager_multiplier=1, expires_days=7, conn=None):
        wager_required = principal * wager_multiplier
        expires_at = datetime.now() + timedelta(days=expires_days)

        if conn is not None:
            return self.createInstance(
                conn,
                wallet_id,
                source="welcome",
                principal=principal,
                wager_required=wager_required,
                expires_at=expires_at,
            )

        with engine.begin() as new_conn:
            return self.grantWelcomeBonus(
                wallet_id, principal, wager_multiplier, expires_days, conn=new_conn
            )

    def grantDepositBonus(
        self,
        wallet_id,
        deposit_amount,
        offer_id=None,
        deposit_index=None,
        conn=None,
    ):
        """
        Grant the first-three-deposits tier bonus.
        Idempotent per tier source via createInstance.
        """
        if offer_id is not None:
            offer = self.getOfferById(offer_id)
        elif deposit_index is not None:
            offer = self.getOfferByDepositIndex(deposit_index)
        else:
            completed = self.countCompletedDeposits(conn=conn)
            # When called after marking deposit Completed, pass deposit_index explicitly.
            offer = self.getOfferByDepositIndex(completed)

        if offer is None:
            log.info(
                f"No deposit bonus tier to grant | user_id={self.user_id} | "
                f"offer_id={offer_id} | deposit_index={deposit_index}"
            )
            return None

        if self.hasReceivedSource(offer["source"], conn=conn):
            existing = self.getLatestInstanceBySource(offer["source"], conn=conn)
            log.info(
                f"Deposit bonus already granted | user_id={self.user_id} | "
                f"source={offer['source']} | instance_id={existing['id']}"
            )
            self.clearSelectedBonusSource(conn=conn)
            return existing["id"]

        principal = compute_deposit_bonus_principal(deposit_amount, offer["percent"])
        if principal <= 0:
            return None

        wager_multiplier = offer.get("wager_multiplier", DEPOSIT_BONUS_WAGER_MULTIPLIER)
        expires_days = offer.get("expires_days", DEPOSIT_BONUS_EXPIRES_DAYS)
        wager_required = principal * wager_multiplier
        expires_at = datetime.now() + timedelta(days=expires_days) if expires_days else None
        max_bet = compute_deposit_bonus_max_bet(principal)
        max_win_cap = compute_deposit_bonus_max_win_cap(principal)

        if conn is not None:
            instance_id = self.createInstance(
                conn,
                wallet_id,
                source=offer["source"],
                principal=principal,
                wager_required=wager_required,
                expires_at=expires_at,
                max_bet=max_bet,
                max_win_cap=max_win_cap,
                requires_deposit_gate=True,
            )
            self.clearSelectedBonusSource(conn=conn)
            return instance_id

        with engine.begin() as new_conn:
            return self.grantDepositBonus(
                wallet_id,
                deposit_amount,
                offer_id=offer["id"],
                deposit_index=deposit_index,
                conn=new_conn,
            )

    def grantReloadBonus(
        self, wallet_id, principal, wager_multiplier=1, expires_days=7, conn=None
    ):
        wager_required = principal * wager_multiplier
        expires_at = datetime.now() + timedelta(days=expires_days)

        if conn is not None:
            return self.createInstance(
                conn,
                wallet_id,
                source="reload",
                principal=principal,
                wager_required=wager_required,
                expires_at=expires_at,
            )

        with engine.begin() as new_conn:
            return self.grantReloadBonus(
                wallet_id, principal, wager_multiplier, expires_days, conn=new_conn
            )

    def grantPromoBonus(
        self, wallet_id, principal, wager_required, expires_at=None, conn=None
    ):
        if conn is not None:
            return self.createInstance(
                conn,
                wallet_id,
                source="promo",
                principal=principal,
                wager_required=wager_required,
                expires_at=expires_at,
            )

        with engine.begin() as new_conn:
            return self.grantPromoBonus(wallet_id, principal, wager_required, expires_at, conn=new_conn)

    def grantCashbackBonus(self, wallet_id, principal, wager_multiplier=1, conn=None):
        wager_required = principal * wager_multiplier

        if conn is not None:
            return self.createInstance(
                conn,
                wallet_id,
                source="cashback",
                principal=principal,
                wager_required=wager_required,
            )

        with engine.begin() as new_conn:
            return self.grantCashbackBonus(wallet_id, principal, wager_multiplier, conn=new_conn)

    def grantFromFreebetWin(self, wallet_id, win_amount, wager_multiplier=1, conn=None):
        wager_required = win_amount * wager_multiplier

        if conn is not None:
            return self.createInstance(
                conn,
                wallet_id,
                source="freebet",
                principal=win_amount,
                wager_required=wager_required,
            )

        with engine.begin() as new_conn:
            return self.grantFromFreebetWin(wallet_id, win_amount, wager_multiplier, conn=new_conn)

    def getActiveInstances(self, conn=None):
        stmt = (
            sa.select(bonus_instances_table)
            .where(
                bonus_instances_table.c.user_id == self.user_id,
                bonus_instances_table.c.status == BONUS_STATUS_ACTIVE,
            )
            .order_by(bonus_instances_table.c.created_at.asc())
        )

        if conn is not None:
            return conn.execute(stmt).mappings().all()

        with engine.begin() as new_conn:
            return new_conn.execute(stmt).mappings().all()

    def recordWagerProgress(self, wallet_id, amount, conn=None):
        if conn is not None:
            return self._recordWagerProgress(wallet_id, amount, conn)

        with engine.begin() as new_conn:
            return self._recordWagerProgress(wallet_id, amount, new_conn)

    def _recordWagerProgress(self, wallet_id, amount, conn):
        instances = self.getActiveInstances(conn=conn)
        if not instances:
            return

        remaining = amount
        for instance in instances:
            if remaining <= 0:
                break

            progress = float(instance["wager_progress"] or 0)
            required = float(instance["wager_required"] or 0)
            room = required - progress
            if room <= 0:
                continue

            applied = min(remaining, room)
            new_progress = progress + applied
            remaining -= applied

            conn.execute(
                sa.update(bonus_instances_table)
                .where(bonus_instances_table.c.id == instance["id"])
                .values(wager_progress=new_progress)
            )

            if new_progress >= required:
                self.unlockBonus(instance["id"], wallet_id, conn=conn)

    def unlockBonus(self, instance_id, wallet_id, conn=None):
        if conn is not None:
            return self._unlockBonus(instance_id, wallet_id, conn)

        with engine.begin() as new_conn:
            return self._unlockBonus(instance_id, wallet_id, new_conn)

    def _unlockBonus(self, instance_id, wallet_id, conn):
        instance = conn.execute(
            sa.select(bonus_instances_table).where(bonus_instances_table.c.id == instance_id)
        ).mappings().first()

        if instance is None or instance["status"] != BONUS_STATUS_ACTIVE:
            return

        principal = float(instance["principal"])
        bonus_balance = self.wallet.getBonusBalance(wallet_id, conn=conn)
        real_balance = self.wallet.getRealBalance(wallet_id, conn=conn)

        unlock_amount = min(principal, bonus_balance)
        if unlock_amount > 0:
            bonus_after = bonus_balance - unlock_amount
            real_after = real_balance + unlock_amount

            self.wallet.updateBonusBalance(conn, bonus_after)
            self.wallet.updateRealBalance(conn, real_after)

            TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_BONUS,
                transaction_type="bonus unlock",
                amount=-unlock_amount,
                balance_after=bonus_after,
                status="Done",
                bonus_instance_id=instance_id,
            ).postTransaction(conn)

            TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_REAL,
                transaction_type="bonus unlock",
                amount=unlock_amount,
                balance_after=real_after,
                status="Done",
                bonus_instance_id=instance_id,
            ).postTransaction(conn)

        # Always mark unlocked once wager is complete — never leave permanently active.
        conn.execute(
            sa.update(bonus_instances_table)
            .where(bonus_instances_table.c.id == instance_id)
            .values(status=BONUS_STATUS_UNLOCKED)
        )

        log.info(
            f"Bonus unlocked | user_id={self.user_id} | instance_id={instance_id} | "
            f"amount={unlock_amount}"
        )

    def expireBonus(self, instance_id, wallet_id, conn=None):
        if conn is not None:
            return self._expireBonus(instance_id, wallet_id, conn)

        with engine.begin() as new_conn:
            return self._expireBonus(instance_id, wallet_id, new_conn)

    def _expireBonus(self, instance_id, wallet_id, conn):
        instance = conn.execute(
            sa.select(bonus_instances_table).where(bonus_instances_table.c.id == instance_id)
        ).mappings().first()

        if instance is None or instance["status"] != BONUS_STATUS_ACTIVE:
            return

        # Incomplete wager at expiry: burn remaining bonus balance + winnings on BONUS.
        bonus_balance = self.wallet.getBonusBalance(wallet_id, conn=conn)
        remove_amount = bonus_balance
        bonus_after = 0.0

        if remove_amount > 0:
            self.wallet.updateBonusBalance(conn, bonus_after)
            TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_BONUS,
                transaction_type="bonus expire",
                amount=-remove_amount,
                balance_after=bonus_after,
                status="Done",
                bonus_instance_id=instance_id,
            ).postTransaction(conn)

        conn.execute(
            sa.update(bonus_instances_table)
            .where(bonus_instances_table.c.id == instance_id)
            .values(status=BONUS_STATUS_EXPIRED)
        )

        log.info(
            f"Bonus expired | user_id={self.user_id} | instance_id={instance_id} | "
            f"burned={remove_amount}"
        )

    def forfeitBonus(self, instance_id, wallet_id, conn=None):
        if conn is not None:
            return self._forfeitBonus(instance_id, wallet_id, conn)

        with engine.begin() as new_conn:
            return self._forfeitBonus(instance_id, wallet_id, new_conn)

    def _forfeitBonus(self, instance_id, wallet_id, conn):
        instance = conn.execute(
            sa.select(bonus_instances_table).where(bonus_instances_table.c.id == instance_id)
        ).mappings().first()

        if instance is None or instance["status"] != BONUS_STATUS_ACTIVE:
            return

        principal = float(instance["principal"])
        bonus_balance = self.wallet.getBonusBalance(wallet_id, conn=conn)
        remove_amount = min(principal, bonus_balance)
        bonus_after = bonus_balance - remove_amount

        if remove_amount > 0:
            self.wallet.updateBonusBalance(conn, bonus_after)
            TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_BONUS,
                transaction_type="bonus forfeit",
                amount=-remove_amount,
                balance_after=bonus_after,
                status="Done",
                bonus_instance_id=instance_id,
            ).postTransaction(conn)

        conn.execute(
            sa.update(bonus_instances_table)
            .where(bonus_instances_table.c.id == instance_id)
            .values(status=BONUS_STATUS_FORFEITED)
        )

        log.info(f"Bonus forfeited | user_id={self.user_id} | instance_id={instance_id}")

    def expireDueBonuses(self, wallet_id, conn=None):
        now = datetime.now()
        instances = self.getActiveInstances(conn=conn)

        for instance in instances:
            expires_at = instance.get("expires_at")
            if expires_at is not None and expires_at <= now:
                self.expireBonus(instance["id"], wallet_id, conn=conn)
