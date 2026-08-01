from log_manager import log
from database.bonus import BonusManager, SKIP_BELOW_MIN
from database.referral import ReferralManager, getUserByKey
from database.user_db import referrerIdUpdate
from database.wallet import WalletManager, BALANCE_REAL, BALANCE_MIXED
from database.campaign import (
    CampaignManager,
    EVENT_BET_SETTLED,
    EVENT_BONUS_COMPLETED,
    EVENT_BONUS_EXPIRED,
    EVENT_DEPOSIT,
    EVENT_REGISTER,
    EVENT_WITHDRAW,
)
from config import (
    REFERRAL_ENABLED,
    DEPOSIT_BONUS_MIN_DEPOSIT,
    REFERRAL_QUALIFIED_FTD_MIN,
)


def can_receive_deposit_bonus(deposit_amount):
    return float(deposit_amount) >= float(DEPOSIT_BONUS_MIN_DEPOSIT)


def is_qualified_customer_ftd(deposit_amount):
    return float(deposit_amount) >= float(REFERRAL_QUALIFIED_FTD_MIN)


def is_commissionable_stake(balance_type, real_part=None):
    """Referral edge share accrues only on REAL-funded stake portion."""
    if real_part is not None:
        return float(real_part or 0) > 0
    return balance_type in (BALANCE_REAL, BALANCE_MIXED)


class PromotionManager:
    """
    Thin orchestrator: sequences BonusManager and ReferralManager for rewards.

    CampaignManager is observation-only here — tracks participation/progress,
    never issues bonuses or referral payouts.
    """

    def __init__(self, user_id=None, campaign_manager=None):
        self.user_id = user_id
        self.campaigns = campaign_manager or CampaignManager()

    def _track_campaign_event(self, user_id, event, context=None, conn=None):
        """Best-effort campaign tracking — must never break live reward flows."""
        try:
            self.campaigns.handleEvent(
                user_id=user_id,
                event=event,
                context=context or {},
                conn=conn,
            )
        except Exception:
            log.exception(
                f"Campaign track failed (ignored) | user_id={user_id} | event={event}"
            )

    def on_user_registered(self, user_id, invite_key=None, conn=None):
        try:
            referred = ReferralManager(user_id, conn)
            if referred.verifyReferral() is None:
                referred.createReferralProfile(conn)

            if not invite_key:
                log.info(f"Promotion register | user_id={user_id} | no invite key")
                return

            referrer_id = getUserByKey(invite_key, conn)
            if referrer_id is None:
                log.warning(
                    f"Promotion register | user_id={user_id} | invite_key={invite_key} | "
                    f"referrer not found"
                )
                return
            if referrer_id == user_id:
                return

            referrer = ReferralManager(referrer_id, conn)
            if referrerIdUpdate(user_id, referrer_id, conn):
                if referrer.createInvite(user_id):
                    referrer.updateTotalInvites()
                log.info(
                    f"Promotion register attributed | referred_id={user_id} | "
                    f"referrer_id={referrer_id}"
                )
        finally:
            self._track_campaign_event(
                user_id,
                EVENT_REGISTER,
                {"invite_key": invite_key},
                conn=conn,
            )

    def on_deposit_confirmed(
        self,
        user_id,
        wallet_id,
        amount_usd,
        deposit_index=None,
        conn=None,
    ):
        """
        Always assumes REAL was already credited.
        Returns grant result dict for deposit status UX.
        """
        bonus = BonusManager(user_id)
        grant_result = {
            "instance_id": None,
            "granted": False,
            "skipped_reason": None,
        }

        try:
            if can_receive_deposit_bonus(amount_usd):
                raw = bonus.grantDepositBonus(
                    wallet_id,
                    amount_usd,
                    deposit_index=deposit_index,
                    conn=conn,
                )
                if isinstance(raw, dict):
                    grant_result = raw
                elif raw is not None:
                    grant_result = {
                        "instance_id": raw,
                        "granted": True,
                        "skipped_reason": None,
                    }
                log.info(
                    f"Promotion deposit bonus | user_id={user_id} | "
                    f"deposit_index={deposit_index} | result={grant_result}"
                )
            else:
                grant_result["skipped_reason"] = SKIP_BELOW_MIN
                log.info(
                    f"Promotion deposit bonus skipped | user_id={user_id} | "
                    f"amount={amount_usd} < min"
                )

            if not REFERRAL_ENABLED:
                return grant_result

            if not is_qualified_customer_ftd(amount_usd):
                log.info(
                    f"Promotion FTD skip | user_id={user_id} | amount={amount_usd}"
                )
                return grant_result

            referrer_probe = ReferralManager(user_id, conn)
            referrer_id = referrer_probe.get_referrer_id_for_user(user_id, conn=conn)
            if referrer_id is None:
                return grant_result

            referrer = ReferralManager(referrer_id, conn)
            newly_qualified = referrer.mark_qualified_ftd(
                referred_id=user_id,
                deposit_amount=amount_usd,
                conn=conn,
            )
            if newly_qualified:
                referrer_wallet_id = WalletManager(referrer_id).ensureWallet()
                referrer.maybe_grant_ftd_bounty(referrer_wallet_id, conn=conn)
            return grant_result
        finally:
            self._track_campaign_event(
                user_id,
                EVENT_DEPOSIT,
                {
                    "amount_usd": amount_usd,
                    "deposit_index": deposit_index,
                    "wallet_id": wallet_id,
                    "bonus_granted": grant_result.get("granted"),
                    "bonus_skipped_reason": grant_result.get("skipped_reason"),
                },
                conn=conn,
            )

    def on_bet_settled(
        self,
        user_id,
        wallet_id,
        stake,
        balance_type,
        game,
        risk_mode=None,
        conn=None,
        real_part=None,
        bonus_part=None,
    ):
        """
        Welcome wager progress: every settled eligible stake contributes
        min(stake, MQB), regardless of real/bonus funding split.
        Free bets must not call this.
        """
        try:
            bonus = BonusManager(user_id)
            if bonus.getPrimaryActiveInstance(conn=conn) is not None:
                credit = bonus.qualifyWagerCredit(stake, conn=conn)
                if credit > 0:
                    bonus.recordWagerProgress(wallet_id, credit, conn=conn)
                    log.info(
                        f"Promotion wager progress | user_id={user_id} | stake={stake} | "
                        f"credit={credit} | game={game}"
                    )

            commission_stake = float(real_part) if real_part is not None else float(stake)
            if (
                REFERRAL_ENABLED
                and is_commissionable_stake(balance_type, real_part=real_part)
                and commission_stake > 0
            ):
                probe = ReferralManager(user_id, conn)
                referrer_id = probe.get_referrer_id_for_user(user_id, conn=conn)
                if referrer_id is not None:
                    ReferralManager(referrer_id, conn).accrue_edge_share(
                        referred_id=user_id,
                        stake=commission_stake,
                        game=game,
                        risk_mode=risk_mode,
                        conn=conn,
                    )
        finally:
            self._track_campaign_event(
                user_id,
                EVENT_BET_SETTLED,
                {
                    "stake": stake,
                    "balance_type": balance_type,
                    "game": game,
                    "risk_mode": risk_mode,
                    "wallet_id": wallet_id,
                    "real_part": real_part,
                    "bonus_part": bonus_part,
                },
                conn=conn,
            )
            try:
                active = BonusManager(user_id).getActiveInstances(conn=conn)
                if not active:
                    self._track_campaign_event(
                        user_id,
                        EVENT_BONUS_COMPLETED,
                        {"wallet_id": wallet_id, "game": game},
                        conn=conn,
                    )
            except Exception:
                log.exception(
                    f"Campaign BONUS_COMPLETED observe failed | user_id={user_id}"
                )

    def on_withdrawal_requested(self, user_id, wallet_id, conn=None):
        """Forfeit active welcome bonuses before REAL→PENDING hold."""
        forfeited = BonusManager(user_id).forfeitActiveWelcomeBonuses(
            wallet_id, conn=conn
        )
        if forfeited:
            log.info(
                f"Promotion withdraw forfeit | user_id={user_id} | "
                f"instance_ids={forfeited}"
            )
        return forfeited

    def on_withdrawal_completed(self, user_id, conn=None):
        log.info(f"Promotion withdrawal hook | user_id={user_id}")
        self._track_campaign_event(user_id, EVENT_WITHDRAW, {}, conn=conn)

    def on_daily_reset(self, conn=None):
        import sqlalchemy as sa
        from database.db_config import engine, referral_profiles

        def _run(c):
            profile_ids = c.execute(
                sa.select(referral_profiles.c.user_id)
            ).scalars().all()
            for uid in profile_ids:
                ReferralManager(uid, c).release_held_earnings(conn=c)
                wallet_id = WalletManager(uid).ensureWallet()
                BonusManager(uid).expireDueBonuses(wallet_id, conn=c)
                self._track_campaign_event(
                    uid,
                    EVENT_BONUS_EXPIRED,
                    {"wallet_id": wallet_id, "source": "daily_reset"},
                    conn=c,
                )

        if conn is not None:
            _run(conn)
            return
        with engine.begin() as new_conn:
            _run(new_conn)

    def on_admin_action(self, action, user_id, payload=None, conn=None):
        payload = payload or {}
        if action == "forfeit_bonus":
            wallet_id = payload.get("wallet_id") or WalletManager(user_id).ensureWallet()
            instance_id = payload.get("instance_id")
            if instance_id is None:
                raise ValueError("instance_id required")
            BonusManager(user_id).forfeitBonus(instance_id, wallet_id, conn=conn)
            return {"ok": True}
        if action == "freeze_referral":
            import sqlalchemy as sa
            from database.db_config import referral_profiles, engine as _engine

            def _freeze(c):
                c.execute(
                    sa.update(referral_profiles)
                    .where(referral_profiles.c.user_id == user_id)
                    .values(payout_frozen=True)
                )

            if conn is not None:
                _freeze(conn)
            else:
                with _engine.begin() as c:
                    _freeze(c)
            return {"ok": True}
        raise ValueError(f"Unknown admin action: {action}")
