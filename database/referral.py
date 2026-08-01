from log_manager import log
from database.db_config import (
    engine,
    referrals,
    referral_profiles,
    referral_commissions,
    users_table,
)
from database.wallet import WalletManager, BALANCE_REAL, lock_wallet
from database.transactions import TransactionManager
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
import secrets
import string
from datetime import datetime, timedelta, date
from config import (
    REFERRAL_TIERS,
    REFERRAL_QUALIFIED_FTD_MIN,
    REFERRAL_FTD_BOUNTY,
    REFERRAL_FTD_BOUNTY_DAILY_CAP,
    REFERRAL_HOLD_HOURS,
    REFERRAL_MIN_CLAIM,
    GAME_EDGES,
    REFERRAL_ENABLED,
    AFFILIATE_INDIVIDUAL_MAX_PERCENT,
    BOT_USERNAME,
    MINI_APP_SHORT_NAME,
)

ALPHABET = string.ascii_uppercase + string.digits


def build_referral_startapp_link(referral_key: str) -> str:
    """Build a Telegram Mini App direct link that passes start_param=referral_key."""
    key = str(referral_key or "").strip()
    if not key:
        return f"https://t.me/{BOT_USERNAME}"
    if MINI_APP_SHORT_NAME:
        return f"https://t.me/{BOT_USERNAME}/{MINI_APP_SHORT_NAME}?startapp={key}"
    return f"https://t.me/{BOT_USERNAME}?startapp={key}"


def resolve_game_edge(game, risk_mode=None):
    entry = GAME_EDGES.get(game)
    if entry is None:
        return 0.0
    if isinstance(entry, dict):
        if risk_mode is None:
            return float(next(iter(entry.values()), 0.0))
        return float(entry.get(str(risk_mode).lower(), next(iter(entry.values()), 0.0)))
    return float(entry)


def tier_for_qualified_ftd_count(count):
    ordered = sorted(
        REFERRAL_TIERS.items(),
        key=lambda item: int(item[1].get("min_qualified_ftd", 0)),
    )
    selected = ordered[0][0]
    for name, rules in ordered:
        if int(count) >= int(rules.get("min_qualified_ftd", 0)):
            selected = name
    return selected


class ReferralManager:
    def __init__(self, user_id, conn=None):
        self.user_id = user_id
        self.conn = conn

    def checkConn(self):
        if self.conn is None:
            raise RuntimeError("Connection is required")

    def verifyReferral(self):
        self.checkConn()

        select_stmt = sa.select(referral_profiles.c.id).where(
            referral_profiles.c.user_id == self.user_id
        )
        referral_id = self.conn.execute(select_stmt).scalar_one_or_none()

        if referral_id is None:
            log.info(f'verifyRefferal:{self.user_id} | Not Found')
            return None

        log.info(f'verifyRefferal:{self.user_id} | Found | Return:{referral_id}')
        return referral_id

    def _keyExist(self, key, conn):
        select_stmt = sa.select(referral_profiles.c.referral_key).where(
            referral_profiles.c.referral_key == key
        )
        exists = conn.execute(select_stmt).scalar_one_or_none()
        return exists is not None

    def _getReferralKey(self):
        self.checkConn()
        select_stmt = sa.select(referral_profiles.c.referral_key).where(
            referral_profiles.c.user_id == self.user_id
        )
        key = self.conn.execute(select_stmt).scalar_one_or_none()
        if key is None:
            return False
        return key

    def generateReferralKey(self, conn, length: int = 8) -> str:
        while True:
            referrer_key = ''.join(secrets.choice(ALPHABET) for _ in range(length))
            if not self._keyExist(referrer_key, conn):
                return referrer_key

    def getrevsharePercent(self, status: str):
        tier = REFERRAL_TIERS.get(status) or REFERRAL_TIERS["Bronze"]
        return float(tier["revshare_percent"])

    def createReferralProfile(self, conn):
        self.checkConn()

        existing_id = self.verifyReferral()
        if existing_id is not None:
            return existing_id

        referral_key = self.generateReferralKey(conn)
        referral_link = self._generateReferralLink(referral_key)

        insert_stmt = (
            sa.insert(referral_profiles)
            .values(
                user_id=self.user_id,
                referral_key=referral_key,
                status="Bronze",
                revshare_percent=self.getrevsharePercent("Bronze"),
                referral_link=referral_link,
                created_at=datetime.now(),
            )
            .returning(referral_profiles.c.id)
        )
        try:
            with conn.begin_nested():
                result = conn.execute(insert_stmt)
                referral_id = result.scalar_one()
        except IntegrityError:
            referral_id = self.verifyReferral()
            if referral_id is None:
                raise
            log.info(
                f'createReferralProfile race | user_id:{self.user_id} | existing:{referral_id}'
            )

        return referral_id

    def _generateReferralLink(self, referral_key):
        return build_referral_startapp_link(referral_key)

    def getReferralLink(self):
        self.checkConn()
        select_stmt = sa.select(referral_profiles.c.referral_link).where(
            referral_profiles.c.user_id == self.user_id
        )
        link = self.conn.execute(select_stmt).scalar_one_or_none()
        if link is None:
            return False
        return link

    def createInvite(self, new_id_customer):
        self.checkConn()


        # Сначало проверка записан ли этот пользователь уже как приглашенный ( в случае если в будущем этот же игрок будет еще раз заходить по реферальной ссылке)
        existing = self.conn.execute(
            sa.select(referrals.c.id).where(referrals.c.referred_id == new_id_customer)
        ).scalar_one_or_none()
        if existing is not None:
            log.info(
                f'createInvite skipped | referred_id:{new_id_customer} | existing invite:{existing}'
            )
            return False
        
        insert_stmt = sa.insert(referrals).values(
            referrer_id=self.user_id,
            referred_id=new_id_customer,
            registred_at=datetime.now(),
            status="Bronze",
        )
        try:
            with self.conn.begin_nested():
                self.conn.execute(insert_stmt)
        except IntegrityError:
            log.info(
                f'createInvite integrity skip | referred_id:{new_id_customer} | '
                f'referrer_id:{self.user_id}'
            )
            return False

        return True

    def updateTotalInvites(self):
        select_stmt = (
            sa.select(sa.func.count())
            .select_from(referrals)
            .where(referrals.c.referrer_id == self.user_id)
        )
        total_invites = self.conn.execute(select_stmt).scalar_one()

        if total_invites == 0:
            return

        update_stmt = (
            sa.update(referral_profiles)
            .where(referral_profiles.c.user_id == self.user_id)
            .values(total_invites=total_invites)
        )
        self.conn.execute(update_stmt)

    def get_profile(self, conn=None):
        c = conn if conn is not None else self.conn
        if c is None:
            raise RuntimeError("Connection is required")
        return c.execute(
            sa.select(referral_profiles).where(referral_profiles.c.user_id == self.user_id)
        ).mappings().first()

    def get_referrer_id_for_user(self, user_id, conn=None):
        c = conn if conn is not None else self.conn
        if c is None:
            raise RuntimeError("Connection is required")
        return c.execute(
            sa.select(users_table.c.referrer_id).where(users_table.c.id == user_id)
        ).scalar_one_or_none()

    def mark_qualified_ftd(self, referred_id, deposit_amount, conn=None):
        """Qualify invitee's first deposit for the referrer (customer program)."""
        c = conn if conn is not None else self.conn
        if c is None:
            raise RuntimeError("Connection is required")

        if float(deposit_amount) < float(REFERRAL_QUALIFIED_FTD_MIN):
            return False

        invite = c.execute(
            sa.select(referrals).where(referrals.c.referred_id == referred_id)
        ).mappings().first()
        if invite is None:
            return False
        # Atomic qualify — only one concurrent complete wins.
        result = c.execute(
            sa.update(referrals)
            .where(
                referrals.c.id == invite["id"],
                referrals.c.qualified_at.is_(None),
            )
            .values(qualified_at=datetime.now(), ftd_amount=float(deposit_amount))
        )
        if result.rowcount == 0:
            return False

        referrer_id = invite["referrer_id"]
        profile = c.execute(
            sa.select(referral_profiles).where(referral_profiles.c.user_id == referrer_id)
        ).mappings().first()
        if profile is None:
            return False

        new_count = int(profile.get("qualified_ftd_count") or 0) + 1
        c.execute(
            sa.update(referral_profiles)
            .where(referral_profiles.c.user_id == referrer_id)
            .values(qualified_ftd_count=new_count)
        )

        ReferralManager(referrer_id, c).recalc_tier(conn=c)
        log.info(
            f"Qualified FTD | referrer_id={referrer_id} | referred_id={referred_id} | "
            f"amount={deposit_amount} | count={new_count}"
        )
        return True

    def maybe_grant_ftd_bounty(self, wallet_id, conn=None):
        """Credit referrer REAL bounty for a newly qualified FTD (call after mark)."""
        c = conn if conn is not None else self.conn
        if c is None:
            raise RuntimeError("Connection is required")

        profile = self.get_profile(conn=c)
        if profile is None or profile.get("payout_frozen"):
            return None

        today = date.today()
        bounty_day = profile.get("bounty_day")
        earned_today = float(profile.get("bounty_earned_today") or 0)
        if bounty_day != today:
            earned_today = 0.0

        remaining_cap = float(REFERRAL_FTD_BOUNTY_DAILY_CAP) - earned_today
        if remaining_cap <= 0:
            log.info(f"FTD bounty daily cap hit | referrer_id={self.user_id}")
            return None

        amount = min(float(REFERRAL_FTD_BOUNTY), remaining_cap)
        if amount <= 0:
            return None

        wallet = WalletManager(self.user_id)
        if lock_wallet(c, self.user_id, wallet_id) is None:
            return None
        balances = wallet.apply_balance_deltas(c, wallet_id, real_delta=amount)
        TransactionManager(
            user_id=self.user_id,
            wallet_id=wallet_id,
            balance_type=BALANCE_REAL,
            transaction_type="referral ftd bounty",
            amount=amount,
            balance_after=balances["real_balance"],
            status="Done",
        ).postTransaction(c)

        c.execute(
            sa.update(referral_profiles)
            .where(referral_profiles.c.user_id == self.user_id)
            .values(
                bounty_day=today,
                bounty_earned_today=earned_today + amount,
                lifetime_earned=float(profile.get("lifetime_earned") or 0) + amount,
            )
        )
        log.info(f"FTD bounty granted | referrer_id={self.user_id} | amount={amount}")
        return amount

    def recalc_tier(self, conn=None):
        c = conn if conn is not None else self.conn
        if c is None:
            raise RuntimeError("Connection is required")

        profile = self.get_profile(conn=c)
        if profile is None:
            return None

        count = int(profile.get("qualified_ftd_count") or 0)
        tier = tier_for_qualified_ftd_count(count)
        percent = self.getrevsharePercent(tier)
        if profile.get("status") == tier and float(profile.get("revshare_percent") or 0) == percent:
            return tier

        c.execute(
            sa.update(referral_profiles)
            .where(referral_profiles.c.user_id == self.user_id)
            .values(status=tier, revshare_percent=percent)
        )
        log.info(
            f"Referral tier updated | user_id={self.user_id} | tier={tier} | "
            f"revshare={percent} | ftd_count={count}"
        )
        return tier

    def accrue_edge_share(
        self,
        referred_id,
        stake,
        game,
        risk_mode=None,
        conn=None,
    ):
        """Accrue edge share for this referrer from a referred user's REAL stake."""
        if not REFERRAL_ENABLED:
            return None

        c = conn if conn is not None else self.conn
        if c is None:
            raise RuntimeError("Connection is required")

        profile = self.get_profile(conn=c)
        if profile is None or profile.get("payout_frozen"):
            return None

        invite = c.execute(
            sa.select(referrals).where(
                referrals.c.referrer_id == self.user_id,
                referrals.c.referred_id == referred_id,
            )
        ).mappings().first()
        if invite is None or invite.get("qualified_at") is None:
            return None

        edge = resolve_game_edge(game, risk_mode)
        if edge <= 0 or float(stake) <= 0:
            return None

        revshare = float(profile.get("revshare_percent") or self.getrevsharePercent("Bronze"))
        amount = float(stake) * edge * (revshare / 100.0)
        if amount <= 0:
            return None

        available_at = datetime.now() + timedelta(hours=int(REFERRAL_HOLD_HOURS))
        c.execute(
            sa.insert(referral_commissions).values(
                referrer_id=self.user_id,
                referred_id=referred_id,
                amount=amount,
                stake=float(stake),
                game=game,
                risk_mode=risk_mode,
                edge=edge,
                revshare_percent=revshare,
                status="pending",
                created_at=datetime.now(),
                available_at=available_at,
            )
        )
        c.execute(
            sa.update(referral_profiles)
            .where(referral_profiles.c.user_id == self.user_id)
            .values(
                pending_earnings=float(profile.get("pending_earnings") or 0) + amount
            )
        )
        log.info(
            f"Referral accrued | referrer_id={self.user_id} | referred_id={referred_id} | "
            f"amount={amount:.6f} | game={game}"
        )
        return amount

    def release_held_earnings(self, conn=None):
        """Move pending commissions past hold into available_earnings."""
        c = conn if conn is not None else self.conn
        if c is None:
            raise RuntimeError("Connection is required")

        now = datetime.now()
        rows = c.execute(
            sa.select(referral_commissions).where(
                referral_commissions.c.referrer_id == self.user_id,
                referral_commissions.c.status == "pending",
                referral_commissions.c.available_at <= now,
            )
        ).mappings().all()
        if not rows:
            return 0.0

        total = sum(float(r["amount"]) for r in rows)
        ids = [r["id"] for r in rows]
        c.execute(
            sa.update(referral_commissions)
            .where(referral_commissions.c.id.in_(ids))
            .values(status="available")
        )
        profile = self.get_profile(conn=c)
        pending = max(0.0, float(profile.get("pending_earnings") or 0) - total)
        available = float(profile.get("available_earnings") or 0) + total
        c.execute(
            sa.update(referral_profiles)
            .where(referral_profiles.c.user_id == self.user_id)
            .values(pending_earnings=pending, available_earnings=available)
        )
        return total

    def claim_earnings(self, wallet_id, conn=None):
        c = conn if conn is not None else self.conn
        if c is None:
            raise RuntimeError("Connection is required")

        self.release_held_earnings(conn=c)
        profile = self.get_profile(conn=c)
        if profile is None or profile.get("payout_frozen"):
            return 0.0

        available = float(profile.get("available_earnings") or 0)
        if available < float(REFERRAL_MIN_CLAIM):
            return 0.0

        # Lock profile row then wallet so concurrent claims cannot double-pay.
        c.execute(
            sa.select(referral_profiles.c.id)
            .where(referral_profiles.c.user_id == self.user_id)
            .with_for_update()
        )
        profile = self.get_profile(conn=c)
        available = float(profile.get("available_earnings") or 0)
        if available < float(REFERRAL_MIN_CLAIM):
            return 0.0

        wallet = WalletManager(self.user_id)
        if lock_wallet(c, self.user_id, wallet_id) is None:
            return 0.0
        balances = wallet.apply_balance_deltas(c, wallet_id, real_delta=available)
        TransactionManager(
            user_id=self.user_id,
            wallet_id=wallet_id,
            balance_type=BALANCE_REAL,
            transaction_type="referral claim",
            amount=available,
            balance_after=balances["real_balance"],
            status="Done",
        ).postTransaction(c)

        c.execute(
            sa.update(referral_commissions)
            .where(
                referral_commissions.c.referrer_id == self.user_id,
                referral_commissions.c.status == "available",
            )
            .values(status="claimed", claimed_at=datetime.now())
        )
        c.execute(
            sa.update(referral_profiles)
            .where(referral_profiles.c.user_id == self.user_id)
            .values(
                available_earnings=0,
                lifetime_earned=float(profile.get("lifetime_earned") or 0) + available,
            )
        )
        log.info(f"Referral claimed | user_id={self.user_id} | amount={available}")
        return available

    @staticmethod
    def stats_summary(conn=None):
        """Read-only referral aggregates for admin dashboards."""
        stmt = sa.text(
            """
            SELECT
                (SELECT COUNT(*) FROM referral_profiles) AS profiles,
                (SELECT COUNT(*) FROM referrals) AS invites,
                (SELECT COUNT(*) FROM referrals WHERE qualified_at IS NOT NULL) AS qualified_ftds,
                (SELECT COALESCE(SUM(amount), 0) FROM referral_commissions
                    WHERE status IN ('pending', 'available')) AS unpaid_commissions,
                (SELECT COALESCE(SUM(lifetime_earned), 0) FROM referral_profiles) AS lifetime_earned
            """
        )
        if conn is not None:
            row = conn.execute(stmt).mappings().one()
        else:
            with engine.begin() as new_conn:
                row = new_conn.execute(stmt).mappings().one()
        return dict(row)

    def player_status(self, conn=None):
        """
        Lightweight referral status for Profile and similar surfaces.
        Reuses the same tier source of truth as player_summary().
        """
        def _run(c):
            self.conn = c
            self.createReferralProfile(c)
            profile = self.get_profile(conn=c)
            if profile is None:
                return {"status": "Bronze", "tier": "Bronze"}

            ftd = int(profile.get("qualified_ftd_count") or 0)
            tier_name = tier_for_qualified_ftd_count(ftd)
            if str(profile.get("status") or "") != tier_name:
                rev = self.getrevsharePercent(tier_name)
                c.execute(
                    sa.update(referral_profiles)
                    .where(referral_profiles.c.user_id == self.user_id)
                    .values(status=tier_name, revshare_percent=rev)
                )

            return {
                "status": tier_name,
                "tier": tier_name,
            }

        if conn is not None:
            return _run(conn)
        with engine.begin() as new_conn:
            return _run(new_conn)

    def player_summary(self, conn=None):
        """
        Player-facing referral dashboard payload.
        Creates a profile lazily when missing.
        """
        def _run(c):
            self.conn = c
            self.createReferralProfile(c)
            self.release_held_earnings(conn=c)
            profile = self.get_profile(conn=c)
            if profile is None:
                return None

            ftd = int(profile.get("qualified_ftd_count") or 0)
            tier_name = tier_for_qualified_ftd_count(ftd)
            # Keep DB status in sync with computed tier when FTD crossed a threshold.
            if str(profile.get("status") or "") != tier_name:
                rev = self.getrevsharePercent(tier_name)
                c.execute(
                    sa.update(referral_profiles)
                    .where(referral_profiles.c.user_id == self.user_id)
                    .values(status=tier_name, revshare_percent=rev)
                )
                profile = self.get_profile(conn=c)

            ordered = sorted(
                REFERRAL_TIERS.items(),
                key=lambda item: int(item[1].get("min_qualified_ftd", 0)),
            )
            next_tier = None
            remaining_ftd = None
            for name, rules in ordered:
                min_ftd = int(rules.get("min_qualified_ftd", 0))
                if ftd < min_ftd:
                    next_tier = name
                    remaining_ftd = min_ftd - ftd
                    break

            day_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            today_income = float(
                c.execute(
                    sa.select(sa.func.coalesce(sa.func.sum(referral_commissions.c.amount), 0)).where(
                        referral_commissions.c.referrer_id == self.user_id,
                        referral_commissions.c.created_at >= day_start,
                    )
                ).scalar()
                or 0
            )
            # Include same-day FTD bounty tracked on the profile when present.
            bounty_day = profile.get("bounty_day")
            if bounty_day is not None:
                bounty_day_value = bounty_day.date() if hasattr(bounty_day, "date") else bounty_day
                if bounty_day_value == date.today():
                    today_income += float(profile.get("bounty_earned_today") or 0)

            history = (
                c.execute(
                    sa.select(referral_commissions)
                    .where(referral_commissions.c.referrer_id == self.user_id)
                    .order_by(referral_commissions.c.id.desc())
                    .limit(20)
                )
                .mappings()
                .all()
            )

            invite_rows = (
                c.execute(
                    sa.select(referrals)
                    .where(referrals.c.referrer_id == self.user_id)
                    .order_by(referrals.c.id.desc())
                    .limit(20)
                )
                .mappings()
                .all()
            )

            pending = float(profile.get("pending_earnings") or 0)
            available = float(profile.get("available_earnings") or 0)
            lifetime = float(profile.get("lifetime_earned") or 0)
            revshare = float(profile.get("revshare_percent") or self.getrevsharePercent(tier_name))

            tiers = [
                {
                    "id": name,
                    "name": name,
                    "revshare_percent": float(rules.get("revshare_percent") or 0),
                    "min_qualified_ftd": int(rules.get("min_qualified_ftd") or 0),
                    "current": name == tier_name,
                }
                for name, rules in ordered
            ]

            return {
                "enabled": bool(REFERRAL_ENABLED),
                "referral_key": profile.get("referral_key"),
                # Always rebuild from key so link format stays current (startapp).
                "referral_link": self._generateReferralLink(profile.get("referral_key")),
                "status": tier_name,
                "tier": tier_name,
                "next_tier": next_tier,
                "remaining_ftd": remaining_ftd,
                "revshare_percent": revshare,
                "total_invites": int(profile.get("total_invites") or 0),
                "qualified_ftd": ftd,
                "today_income": round(today_income, 2),
                "lifetime_earned": round(lifetime, 2),
                "pending_earnings": round(pending, 2),
                "available_earnings": round(available, 2),
                "withdrawable_earnings": round(available, 2),
                "min_claim": float(REFERRAL_MIN_CLAIM),
                "can_claim": available >= float(REFERRAL_MIN_CLAIM)
                and not bool(profile.get("payout_frozen")),
                "payout_frozen": bool(profile.get("payout_frozen")),
                "tiers": tiers,
                # Friend rewards / free spins are product copy for now — not granted by engine.
                "friend_rewards": {
                    "Bronze": {"free_spins": 10, "spin_value": 0.10},
                    "Silver": {"free_spins": 15, "spin_value": 0.10},
                    "Gold": {"free_spins": 20, "spin_value": 0.10},
                },
                "affiliate": {
                    "max_revshare_percent": float(AFFILIATE_INDIVIDUAL_MAX_PERCENT),
                    # TODO: affiliate application flow not implemented yet.
                    "apply_available": False,
                },
                "history": [
                    {
                        "id": row["id"],
                        "amount": float(row.get("amount") or 0),
                        "status": row.get("status"),
                        "created_at": row.get("created_at").isoformat()
                        if row.get("created_at")
                        else None,
                        "claimed_at": row.get("claimed_at").isoformat()
                        if row.get("claimed_at")
                        else None,
                    }
                    for row in history
                ],
                "invites": [
                    {
                        "id": row["id"],
                        "referred_id": row.get("referred_id"),
                        "qualified_at": row.get("qualified_at").isoformat()
                        if row.get("qualified_at")
                        else None,
                        "ftd_amount": float(row["ftd_amount"])
                        if row.get("ftd_amount") is not None
                        else None,
                    }
                    for row in invite_rows
                ],
            }

        if conn is not None:
            return _run(conn)
        with engine.begin() as new_conn:
            return _run(new_conn)

    def claim_to_wallet(self):
        """Claim available referral earnings into REAL balance."""
        wallet = WalletManager(self.user_id)
        wallet_id = wallet.ensureWallet()
        with engine.begin() as conn:
            self.conn = conn
            amount = self.claim_earnings(wallet_id, conn=conn)
            return {"ok": True, "claimed": float(amount or 0)}



def getUserByKey(key, conn):
    if key is None or not str(key).strip():
        return None

    select_stmt = sa.select(referral_profiles.c.user_id).where(
        referral_profiles.c.referral_key == str(key).strip()
    )
    referrer_id = conn.execute(select_stmt).scalar_one_or_none()
    if referrer_id is None:
        return None
    return referrer_id
