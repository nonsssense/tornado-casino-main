from database.db_config import engine, bonus_instances_table, deposit_table
from database.transactions import TransactionManager
from database.wallet import WalletManager, BALANCE_REAL, BALANCE_BONUS, lock_wallet
import sqlalchemy as sa
from datetime import datetime, timedelta
from log_manager import log
from config import (
    DEPOSIT_BONUS_WAGER_MULTIPLIER,
    DEPOSIT_BONUS_EXPIRES_DAYS,
    DEPOSIT_BONUS_EDGE_BASIS,
    DEPOSIT_BONUS_MQB_PERCENT,
    DEPOSIT_BONUS_MQB_ABSOLUTE,
    DEPOSIT_BONUS_MAX_BET_PERCENT,
    DEPOSIT_BONUS_MAX_BET_ABSOLUTE,
    DEPOSIT_BONUS_MAX_WIN_STAKE_MULTIPLIER,
    DEPOSIT_BONUS_MAX_WIN_ABSOLUTE,
    DEPOSIT_BONUS_MIN_DEPOSIT,
    DEPOSIT_BONUS_MAX_BONUS,
    DEPOSIT_BONUS_ELIGIBLE_GAMES,
    DEPOSIT_BONUS_OFFERS as _CONFIG_DEPOSIT_BONUS_OFFERS,
)

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

_RECEIVED_SUMMARY_SOURCES = (
    "welcome",
    "deposit_tier_1",
    "deposit_tier_2",
    "deposit_tier_3",
    "reload",
    "cashback",
)

# Sentinel: resolveDepositTierOfferState looks up instance unless caller passes one.
_INSTANCE_LOOKUP = object()

STATUS_TO_OFFER_STATE = {
    BONUS_STATUS_ACTIVE: BONUS_STATE_ACTIVE,
    BONUS_STATUS_UNLOCKED: BONUS_STATE_COMPLETED,
    BONUS_STATUS_EXPIRED: BONUS_STATE_EXPIRED,
    BONUS_STATUS_FORFEITED: BONUS_STATE_FORFEITED,
}

# Commercial numbers live in config.py — managers only read them.
DEPOSIT_BONUS_OFFERS = _CONFIG_DEPOSIT_BONUS_OFFERS

_OFFERS_BY_ID = {offer["id"]: offer for offer in DEPOSIT_BONUS_OFFERS}
_OFFERS_BY_SOURCE = {offer["source"]: offer for offer in DEPOSIT_BONUS_OFFERS}
_OFFERS_BY_INDEX = {offer["deposit_index"]: offer for offer in DEPOSIT_BONUS_OFFERS}

_selection_column_ready = False


def compute_deposit_bonus_principal(deposit_amount, percent):
    principal = float(deposit_amount) * (float(percent) / 100.0)
    return min(principal, float(DEPOSIT_BONUS_MAX_BONUS))


def compute_deposit_bonus_mqb(bonus_principal):
    """Max qualifying bet — contribution cap only (larger bets allowed)."""
    return min(
        float(bonus_principal) * float(DEPOSIT_BONUS_MQB_PERCENT),
        float(DEPOSIT_BONUS_MQB_ABSOLUTE),
    )


# Back-compat alias: max_bet column stores MQB snapshot.
compute_deposit_bonus_max_bet = compute_deposit_bonus_mqb


def compute_deposit_bonus_wager_required(deposit_amount, bonus_principal, wager_multiplier=None):
    """Rulebook: wager_required = m × (Deposit + Bonus)."""
    mult = float(
        DEPOSIT_BONUS_WAGER_MULTIPLIER if wager_multiplier is None else wager_multiplier
    )
    return mult * (float(deposit_amount) + float(bonus_principal))


def compute_deposit_bonus_max_win_cap(_bonus_principal=None):
    return DEPOSIT_BONUS_MAX_WIN_ABSOLUTE


WELCOME_SOURCES = frozenset({
    "welcome",
    "deposit_tier_1",
    "deposit_tier_2",
    "deposit_tier_3",
})

SKIP_ACTIVE_WELCOME = "active_welcome"
SKIP_BELOW_MIN = "below_min"
SKIP_NO_TIER = "no_tier"
SKIP_ALREADY_GRANTED = "already_granted"


def ensure_bonus_selection_schema():
    """Ensure wallet.selected_bonus_source exists (idempotent).

    Must only run at process startup — never mid-request while another
    connection holds locks on `wallet` (e.g. deposit completeDeposit).
    """
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


# Back-compat alias for existing call sites (no-op after startup flag is set).
_ensure_selection_column = ensure_bonus_selection_schema


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

    def getLatestInstancesBySources(self, sources, conn=None):
        """Latest instance per source for this user — one query."""
        source_list = [str(s) for s in sources if s]
        if not source_list:
            return {}

        stmt = (
            sa.select(bonus_instances_table)
            .where(
                bonus_instances_table.c.user_id == self.user_id,
                bonus_instances_table.c.source.in_(source_list),
            )
            .order_by(
                bonus_instances_table.c.created_at.desc(),
                bonus_instances_table.c.id.desc(),
            )
        )
        if conn is not None:
            rows = conn.execute(stmt).mappings().all()
        else:
            with engine.begin() as new_conn:
                rows = new_conn.execute(stmt).mappings().all()

        latest = {}
        for row in rows:
            source = row["source"]
            if source not in latest:
                latest[source] = row
        return latest

    def listAllInstances(self, conn=None):
        """All bonus instances for this user (newest first)."""
        stmt = (
            sa.select(bonus_instances_table)
            .where(bonus_instances_table.c.user_id == self.user_id)
            .order_by(
                bonus_instances_table.c.created_at.desc(),
                bonus_instances_table.c.id.desc(),
            )
        )
        if conn is not None:
            return conn.execute(stmt).mappings().all()
        with engine.begin() as new_conn:
            return new_conn.execute(stmt).mappings().all()

    def hasReceivedSource(self, source, conn=None):
        """True if any bonus_instances row exists for this source (any status)."""
        return self.getLatestInstanceBySource(source, conn=conn) is not None

    def getReceivedSourcesSummary(self, conn=None, *, known_sources=None):
        """
        Presence flags for known promo sources.

        One DISTINCT query (or derived from a preloaded source set) instead of
        six per-source lookups.
        """
        if known_sources is not None:
            present = set(known_sources)
        else:
            stmt = (
                sa.select(sa.distinct(bonus_instances_table.c.source))
                .where(
                    bonus_instances_table.c.user_id == self.user_id,
                    bonus_instances_table.c.source.in_(_RECEIVED_SUMMARY_SOURCES),
                )
            )
            if conn is not None:
                rows = conn.execute(stmt).all()
            else:
                with engine.begin() as new_conn:
                    rows = new_conn.execute(stmt).all()
            present = {row[0] for row in rows if row[0]}

        return {source: source in present for source in _RECEIVED_SUMMARY_SOURCES}

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

    def hasActiveWelcomeBonus(self, conn=None):
        """True if any active welcome / deposit-tier bonus instance exists."""
        for row in self.getActiveInstances(conn=conn):
            if row.get("source") in WELCOME_SOURCES:
                return True
        return False

    def getNextUnusedDepositOffer(self, conn=None):
        """Lowest deposit tier that has never been granted to this user."""
        for offer in DEPOSIT_BONUS_OFFERS:
            if not self.hasReceivedSource(offer["source"], conn=conn):
                return dict(offer)
        return None

    def forfeitActiveWelcomeBonuses(self, wallet_id, conn=None):
        """
        Forfeit every active welcome/deposit-tier bonus before a real withdraw.
        Burns remaining bonus_balance for each instance (rulebook: full remaining).
        """
        if conn is not None:
            return self._forfeitActiveWelcomeBonuses(wallet_id, conn)
        with engine.begin() as new_conn:
            return self._forfeitActiveWelcomeBonuses(wallet_id, new_conn)

    def _forfeitActiveWelcomeBonuses(self, wallet_id, conn):
        forfeited = []
        for instance in list(self.getActiveInstances(conn=conn)):
            if instance.get("source") not in WELCOME_SOURCES:
                continue
            self._forfeitBonus(instance["id"], wallet_id, conn, burn_all=True)
            forfeited.append(instance["id"])
        return forfeited

    def qualifyWagerCredit(self, stake, conn=None):
        """Contribution credit = min(stake, MQB) for the primary active instance."""
        instance = self.getPrimaryActiveInstance(conn=conn)
        if instance is None:
            return 0.0
        stake = float(stake)
        mqb = instance.get("max_bet")
        if mqb is None:
            return stake
        return min(stake, float(mqb))

    def resolveDepositTierOfferState(
        self, offer, completed_deposits, conn=None, *, instance=_INSTANCE_LOOKUP
    ):
        """
        Deterministic tier state from bonus_instances + next-unused grant policy.
        Instance status always wins when a grant exists.
        """
        if instance is _INSTANCE_LOOKUP:
            instance = self.getLatestInstanceBySource(offer["source"], conn=conn)
        if instance is not None:
            return STATUS_TO_OFFER_STATE.get(instance["status"], BONUS_STATE_COMPLETED), instance

        next_offer = self.getNextUnusedDepositOffer(conn=conn)
        if next_offer is None:
            return BONUS_STATE_EXPIRED, None

        if offer["id"] == next_offer["id"]:
            # Next unused tier is claimable only when no welcome is already active.
            if self.hasActiveWelcomeBonus(conn=conn):
                return BONUS_STATE_UPCOMING, None
            return BONUS_STATE_AVAILABLE, None

        # Later tiers wait behind the next unused one.
        if int(offer["deposit_index"]) > int(next_offer["deposit_index"]):
            return BONUS_STATE_UPCOMING, None

        return BONUS_STATE_EXPIRED, None

    def getEligibleDepositOffer(
        self, conn=None, completed_deposits=None, *, latest_by_source=None
    ):
        if self.hasActiveWelcomeBonus(conn=conn):
            return None
        offer = self.getNextUnusedDepositOffer(conn=conn)
        if offer is None:
            return None
        instance = _INSTANCE_LOOKUP
        if latest_by_source is not None:
            instance = latest_by_source.get(offer["source"])
        state, _ = self.resolveDepositTierOfferState(
            offer,
            completed_deposits if completed_deposits is not None else 0,
            conn=conn,
            instance=instance,
        )
        if state != BONUS_STATE_AVAILABLE:
            return None
        return offer

    def listDepositOffers(self):
        """Deterministic deposit-tier states for the selector (backend is source of truth)."""
        wallet_id = self.wallet.ensureWallet()
        self.expireDueBonuses(wallet_id)

        with engine.begin() as conn:
            completed = self.countCompletedDeposits(conn=conn)
            next_index = completed + 1
            all_rows = self.listAllInstances(conn=conn)

            latest_by_source = {}
            for row in all_rows:
                source = row["source"]
                if source not in latest_by_source:
                    latest_by_source[source] = row

            eligible = self.getEligibleDepositOffer(
                conn=conn,
                completed_deposits=completed,
                latest_by_source=latest_by_source,
            )
            selected = self.getSelectedOfferId(
                default_offer_id=eligible["id"] if eligible else None,
                completed_deposits=completed,
                conn=conn,
                latest_by_source=latest_by_source,
            )

            offers = []
            for offer in DEPOSIT_BONUS_OFFERS:
                state, instance = self.resolveDepositTierOfferState(
                    offer,
                    completed,
                    conn=conn,
                    instance=latest_by_source.get(offer["source"]),
                )
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

            active_rows = sorted(
                [row for row in all_rows if row["status"] == BONUS_STATUS_ACTIVE],
                key=lambda row: (row.get("created_at") or datetime.min, row.get("id") or 0),
            )
            unlocked_rows = [
                row for row in all_rows if row["status"] == BONUS_STATUS_UNLOCKED
            ]
            expired_rows = [
                row for row in all_rows if row["status"] == BONUS_STATUS_EXPIRED
            ]
            forfeited_rows = [
                row for row in all_rows if row["status"] == BONUS_STATUS_FORFEITED
            ]

            return {
                "offers": offers,
                "selected_offer_id": selected if eligible else None,
                "completed_deposits": completed,
                "next_deposit_index": next_index if next_index <= 3 else None,
                "received": self.getReceivedSourcesSummary(
                    known_sources=latest_by_source.keys()
                ),
                "active": [self._serializeInstance(row) for row in active_rows],
                "unlocked": [self._serializeInstance(row) for row in unlocked_rows],
                "expired": [self._serializeInstance(row) for row in expired_rows],
                "forfeited": [self._serializeInstance(row) for row in forfeited_rows],
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

    def getSelectedOfferId(
        self,
        default_offer_id=None,
        completed_deposits=None,
        conn=None,
        *,
        latest_by_source=None,
    ):
        _ensure_selection_column()

        def _run(connection):
            source = connection.execute(
                sa.text(
                    "SELECT selected_bonus_source FROM wallet WHERE user_id = :user_id"
                ),
                {"user_id": self.user_id},
            ).scalar_one_or_none()

            eligible = self.getEligibleDepositOffer(
                conn=connection,
                completed_deposits=completed_deposits,
                latest_by_source=latest_by_source,
            )

            if source and source in _OFFERS_BY_SOURCE:
                offer = _OFFERS_BY_SOURCE[source]
                if eligible and offer["id"] == eligible["id"]:
                    return offer["id"]

            if default_offer_id:
                return default_offer_id

            return eligible["id"] if eligible else None

        if conn is not None:
            return _run(conn)
        with engine.begin() as new_conn:
            return _run(new_conn)

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
        """Soft checks when bonus funds are part of a stake (all games eligible)."""
        if conn is not None:
            return self._validateBonusBet(stake, game, conn, risk_mode=risk_mode)
        with engine.begin() as new_conn:
            return self._validateBonusBet(stake, game, new_conn, risk_mode=risk_mode)

    def _validateBonusBet(self, stake, game, conn, risk_mode=None):
        """
        Soft checks when bonus funds are part of a stake.
        MQB is a contribution cap — not a hard bet size block.
        All catalog games are eligible under the MVP rulebook.
        """
        self.expireDueBonuses(self.wallet.ensureWallet(), conn=conn)
        instance = self.getPrimaryActiveInstance(conn=conn)
        if instance is None:
            raise ValueError("No active bonus available for this bet")

        stake = float(stake)
        offer = self.getOfferBySource(instance["source"]) or {}
        eligible_games = offer.get("eligible_games") or DEPOSIT_BONUS_ELIGIBLE_GAMES

        if not self._is_game_eligible(eligible_games, game, risk_mode=risk_mode):
            raise ValueError(f"Bonus balance cannot be used on {game}")

        if instance.get("requires_deposit_gate"):
            if self.countCompletedDeposits(conn=conn) < 1:
                raise ValueError("A completed deposit is required before using this bonus")

        return instance

    def capBonusWin(self, stake, payout_amount, conn=None, bonus_part=None):
        """
        Cap BONUS-path win credit using max_win_cap ($50 absolute MVP).
        When bonus_part is set, only that stake portion's profit is capped.
        """
        instance = self.getPrimaryActiveInstance(conn=conn)
        if instance is None:
            return float(payout_amount)

        max_win_cap = instance.get("max_win_cap")
        if max_win_cap is None:
            return float(payout_amount)

        payout_amount = float(payout_amount)
        max_win_cap = float(max_win_cap)
        stake_basis = float(bonus_part if bonus_part is not None else stake)
        profit = max(0.0, payout_amount - stake_basis)
        if profit <= max_win_cap:
            return payout_amount
        return stake_basis + max_win_cap

    def listActiveBonuses(self):
        self.expireDueBonuses(self.wallet.ensureWallet())
        instances = self.getActiveInstances()
        return [self._serializeInstance(row) for row in instances]

    def listBonusCatalog(self):
        """
        Full My Bonuses catalog — Bonus Cards for every registered entry.

        Frontend filters by `categories` and renders status/progress/button
        exactly as returned. Deposit tiers are live; future types plug in here.
        """
        from database.bonus_catalog import (
            list_catalog_entries,
            build_deposit_bonus_card,
            catalog_filters,
            catalog_hero,
        )

        self.expireDueBonuses(self.wallet.ensureWallet())
        completed = self.countCompletedDeposits()
        cards = []

        deposit_sources = []
        for entry in list_catalog_entries():
            if entry.get("type") == "deposit" and entry.get("offer_id"):
                offer = self.getOfferById(entry["offer_id"])
                if offer is not None:
                    deposit_sources.append(offer["source"])

        latest_by_source = self.getLatestInstancesBySources(deposit_sources)

        for entry in list_catalog_entries():
            if entry.get("type") == "deposit" and entry.get("offer_id"):
                offer = self.getOfferById(entry["offer_id"])
                if offer is None:
                    continue
                state, instance = self.resolveDepositTierOfferState(
                    offer,
                    completed,
                    instance=latest_by_source.get(offer["source"]),
                )
                serialized = self._serializeInstance(instance) if instance else None
                cards.append(
                    build_deposit_bonus_card(
                        entry,
                        state=state,
                        instance=serialized,
                        completed_deposits=completed,
                    )
                )
            # Future: welcome / cashback / reload / promocode / referral builders.

        cards.sort(key=lambda card: (card.get("order", 0), card.get("id") or ""))
        return {
            "hero": catalog_hero(),
            "filters": catalog_filters(),
            "bonuses": cards,
            "completed_deposits": completed,
        }

    def getBonusCard(self, bonus_id: str):
        """Single Bonus Card by id (for detail deep-links)."""
        catalog = self.listBonusCatalog()
        for card in catalog["bonuses"]:
            if card.get("id") == bonus_id:
                return card
        return None

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
            "mqb": float(row["max_bet"]) if row.get("max_bet") is not None else None,
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

        # Prefer locked relative credit (caller may already hold FOR UPDATE).
        if lock_wallet(conn, self.user_id, wallet_id) is None:
            raise RuntimeError(f"Wallet not found | user_id={self.user_id}")
        balances = self.wallet.apply_balance_deltas(
            conn, wallet_id, bonus_delta=float(principal)
        )
        balance_after = balances["bonus_balance"]

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
        Grant the next unused first-three-deposits tier bonus.
        Returns dict: {instance_id, granted, skipped_reason} for deposit UX.
        Idempotent per tier source via createInstance.
        One active welcome at a time — later deposits credit REAL only.
        """
        def _result(instance_id=None, granted=False, skipped_reason=None):
            return {
                "instance_id": instance_id,
                "granted": bool(granted),
                "skipped_reason": skipped_reason,
            }

        if float(deposit_amount) < float(DEPOSIT_BONUS_MIN_DEPOSIT):
            log.info(
                f"Deposit below bonus min | user_id={self.user_id} | "
                f"amount={deposit_amount} | min={DEPOSIT_BONUS_MIN_DEPOSIT}"
            )
            return _result(skipped_reason=SKIP_BELOW_MIN)

        if self.hasActiveWelcomeBonus(conn=conn):
            log.info(
                f"Deposit bonus skipped — active welcome | user_id={self.user_id} | "
                f"amount={deposit_amount}"
            )
            return _result(skipped_reason=SKIP_ACTIVE_WELCOME)

        if offer_id is not None:
            offer = self.getOfferById(offer_id)
        elif deposit_index is not None:
            # Legacy callers may still pass index; prefer unused-tier policy.
            offer = self.getNextUnusedDepositOffer(conn=conn)
            indexed = self.getOfferByDepositIndex(deposit_index)
            if offer is None:
                offer = indexed
            elif indexed is not None and indexed["id"] != offer["id"]:
                # Ignore stale index; always grant next unused.
                pass
        else:
            offer = self.getNextUnusedDepositOffer(conn=conn)

        if offer is None:
            log.info(
                f"No deposit bonus tier to grant | user_id={self.user_id} | "
                f"offer_id={offer_id} | deposit_index={deposit_index}"
            )
            return _result(skipped_reason=SKIP_NO_TIER)

        if self.hasReceivedSource(offer["source"], conn=conn):
            existing = self.getLatestInstanceBySource(offer["source"], conn=conn)
            log.info(
                f"Deposit bonus already granted | user_id={self.user_id} | "
                f"source={offer['source']} | instance_id={existing['id']}"
            )
            self.clearSelectedBonusSource(conn=conn)
            return _result(
                instance_id=existing["id"] if existing else None,
                skipped_reason=SKIP_ALREADY_GRANTED,
            )

        principal = compute_deposit_bonus_principal(deposit_amount, offer["percent"])
        if principal <= 0:
            return _result(skipped_reason=SKIP_NO_TIER)

        wager_multiplier = offer.get("wager_multiplier", DEPOSIT_BONUS_WAGER_MULTIPLIER)
        expires_days = offer.get("expires_days", DEPOSIT_BONUS_EXPIRES_DAYS)
        wager_required = compute_deposit_bonus_wager_required(
            deposit_amount, principal, wager_multiplier
        )
        expires_at = datetime.now() + timedelta(days=expires_days) if expires_days else None
        mqb = compute_deposit_bonus_mqb(principal)
        max_win_cap = compute_deposit_bonus_max_win_cap(principal)

        def _grant(c):
            instance_id = self.createInstance(
                c,
                wallet_id,
                source=offer["source"],
                principal=principal,
                wager_required=wager_required,
                expires_at=expires_at,
                max_bet=mqb,
                max_win_cap=max_win_cap,
                requires_deposit_gate=True,
            )
            self.clearSelectedBonusSource(conn=c)
            return _result(instance_id=instance_id, granted=True)

        if conn is not None:
            return _grant(conn)

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
        # Welcome MVP: do not merge freebet wins into an active welcome wager path.
        if self.hasActiveWelcomeBonus(conn=conn):
            log.info(
                f"Freebet win grant blocked — active welcome | user_id={self.user_id}"
            )
            return None

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

        if lock_wallet(conn, self.user_id, wallet_id) is None:
            return

        # Rulebook: convert entire remaining bonus_balance to REAL on completion.
        bonus_balance = self.wallet.getBonusBalance(wallet_id, conn=conn)
        unlock_amount = float(bonus_balance)
        if unlock_amount > 0:
            balances = self.wallet.apply_balance_deltas(
                conn,
                wallet_id,
                bonus_delta=-unlock_amount,
                real_delta=unlock_amount,
            )

            TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_BONUS,
                transaction_type="bonus unlock",
                amount=-unlock_amount,
                balance_after=balances["bonus_balance"],
                status="Done",
                bonus_instance_id=instance_id,
            ).postTransaction(conn)

            TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_REAL,
                transaction_type="bonus unlock",
                amount=unlock_amount,
                balance_after=balances["real_balance"],
                status="Done",
                bonus_instance_id=instance_id,
            ).postTransaction(conn)

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
        if lock_wallet(conn, self.user_id, wallet_id) is None:
            return
        bonus_balance = self.wallet.getBonusBalance(wallet_id, conn=conn)
        remove_amount = bonus_balance

        if remove_amount > 0:
            balances = self.wallet.apply_balance_deltas(
                conn, wallet_id, bonus_delta=-remove_amount
            )
            TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_BONUS,
                transaction_type="bonus expire",
                amount=-remove_amount,
                balance_after=balances["bonus_balance"],
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

    def forfeitBonus(self, instance_id, wallet_id, conn=None, burn_all=True):
        if conn is not None:
            return self._forfeitBonus(instance_id, wallet_id, conn, burn_all=burn_all)

        with engine.begin() as new_conn:
            return self._forfeitBonus(
                instance_id, wallet_id, new_conn, burn_all=burn_all
            )

    def _forfeitBonus(self, instance_id, wallet_id, conn, burn_all=True):
        instance = conn.execute(
            sa.select(bonus_instances_table).where(bonus_instances_table.c.id == instance_id)
        ).mappings().first()

        if instance is None or instance["status"] != BONUS_STATUS_ACTIVE:
            return

        if lock_wallet(conn, self.user_id, wallet_id) is None:
            return
        bonus_balance = self.wallet.getBonusBalance(wallet_id, conn=conn)
        if burn_all:
            remove_amount = float(bonus_balance)
        else:
            remove_amount = min(float(instance["principal"]), bonus_balance)

        if remove_amount > 0:
            balances = self.wallet.apply_balance_deltas(
                conn, wallet_id, bonus_delta=-remove_amount
            )
            TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_BONUS,
                transaction_type="bonus forfeit",
                amount=-remove_amount,
                balance_after=balances["bonus_balance"],
                status="Done",
                bonus_instance_id=instance_id,
            ).postTransaction(conn)

        conn.execute(
            sa.update(bonus_instances_table)
            .where(bonus_instances_table.c.id == instance_id)
            .values(status=BONUS_STATUS_FORFEITED)
        )

        log.info(
            f"Bonus forfeited | user_id={self.user_id} | instance_id={instance_id} | "
            f"burned={remove_amount}"
        )

    def expireDueBonuses(self, wallet_id, conn=None):
        now = datetime.now()
        instances = self.getActiveInstances(conn=conn)

        for instance in instances:
            expires_at = instance.get("expires_at")
            if expires_at is not None and expires_at <= now:
                self.expireBonus(instance["id"], wallet_id, conn=conn)

    @staticmethod
    def stats_summary(conn=None):
        """Read-only bonus aggregates for admin dashboards."""
        stmt = sa.text(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'active') AS active_count,
                COUNT(*) FILTER (WHERE status = 'unlocked') AS unlocked_count,
                COUNT(*) FILTER (WHERE status = 'expired') AS expired_count,
                COUNT(*) FILTER (WHERE status = 'forfeited') AS forfeited_count,
                COALESCE(SUM(principal) FILTER (WHERE status = 'active'), 0) AS active_liability,
                COALESCE(SUM(principal) FILTER (WHERE status = 'unlocked'), 0) AS unlocked_total
            FROM bonus_instances
            """
        )
        if conn is not None:
            row = conn.execute(stmt).mappings().one()
        else:
            with engine.begin() as new_conn:
                row = new_conn.execute(stmt).mappings().one()
        return dict(row)
