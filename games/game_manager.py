from database.db_config import engine
from database.wallet import (
    WalletManager,
    BALANCE_REAL,
    BALANCE_BONUS,
    allocate_cash_first_stake,
    split_payout_pro_rata,
    balance_type_for_parts,
)
from database.transactions import TransactionManager
from database.bet import Bet
from database.bonus import BonusManager
from database.freebet import FreebetManager
from promo.promo_manager import PromotionManager
from database.plinco_db import (
    ensure_plinko_batch_schema,
    get_plinko_batch_response,
    insert_plinko_batch_response,
    insert_plinco_round,
)
from database.dice_db import (
    ensure_dice_schema,
    lock_wallet,
    lock_user_fairness,
    increment_nonce,
    increment_nonce_by,
    insert_dice_round,
)
from games.Dice.dice import evaluate_dice
from games.Plinco.plinco import getPlincoResult
from games.bet_limits import validate_dice_bet, validate_plinko_bet
from exceptions import notEnoughBalance
from fastapi import HTTPException
from log_manager import log


class GameManager:
    def __init__(self, user_id):
        self.user_id = user_id
        self.wallet = WalletManager(user_id)
        self.bonus = BonusManager(user_id)
        self.freebet = FreebetManager(user_id)

    def _require_bonus_bet(self, stake, game, conn, risk_mode=None):
        try:
            return self.bonus.validateBonusBet(
                stake, game, conn=conn, risk_mode=risk_mode
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    def _allocate_stake(self, wallet_id, amount, conn, game=None, risk_mode=None):
        """Cash-first split. Validates bonus rules when bonus_part > 0."""
        real_bal = self.wallet.getRealBalance(wallet_id, conn=conn)
        bonus_bal = self.wallet.getBonusBalance(wallet_id, conn=conn)
        real_part, bonus_part = allocate_cash_first_stake(real_bal, bonus_bal, amount)
        if bonus_part > 0:
            self._require_bonus_bet(amount, game, conn, risk_mode=risk_mode)
        return real_part, bonus_part, balance_type_for_parts(real_part, bonus_part)

    def _debit_split(self, conn, wallet_id, real_part, bonus_part, transaction_type):
        """Debit cash-first parts; returns (primary_tx_id, balance_type)."""
        balance_type = balance_type_for_parts(real_part, bonus_part)
        primary_tx_id = None

        if real_part > 0:
            balances = self.wallet.apply_balance_deltas(
                conn, wallet_id, real_delta=-float(real_part)
            )
            primary_tx_id = TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_REAL,
                transaction_type=transaction_type,
                amount=-float(real_part),
                balance_after=balances["real_balance"],
            ).postTransaction(conn)

        if bonus_part > 0:
            balances = self.wallet.apply_balance_deltas(
                conn, wallet_id, bonus_delta=-float(bonus_part)
            )
            tx_id = TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_BONUS,
                transaction_type=transaction_type,
                amount=-float(bonus_part),
                balance_after=balances["bonus_balance"],
            ).postTransaction(conn)
            if primary_tx_id is None:
                primary_tx_id = tx_id

        return primary_tx_id, balance_type

    def _credit_split(
        self,
        conn,
        wallet_id,
        real_credit,
        bonus_credit,
        transaction_type,
        stake=None,
        bonus_part=None,
    ):
        """Pro-rata win credits; applies bonus win cap on bonus path."""
        win_tx_id = None
        credited_real = float(real_credit or 0)
        credited_bonus = float(bonus_credit or 0)

        if credited_bonus > 0:
            credited_bonus = self.bonus.capBonusWin(
                stake if stake is not None else credited_bonus,
                credited_bonus,
                conn=conn,
                bonus_part=bonus_part if bonus_part is not None else credited_bonus,
            )

        if credited_real > 0:
            balances = self.wallet.apply_balance_deltas(
                conn, wallet_id, real_delta=credited_real
            )
            win_tx_id = TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_REAL,
                transaction_type=transaction_type,
                amount=credited_real,
                balance_after=balances["real_balance"],
            ).postTransaction(conn)

        if credited_bonus > 0:
            balances = self.wallet.apply_balance_deltas(
                conn, wallet_id, bonus_delta=credited_bonus
            )
            tx_id = TransactionManager(
                user_id=self.user_id,
                wallet_id=wallet_id,
                balance_type=BALANCE_BONUS,
                transaction_type=transaction_type,
                amount=credited_bonus,
                balance_after=balances["bonus_balance"],
            ).postTransaction(conn)
            if win_tx_id is None:
                win_tx_id = tx_id

        return win_tx_id, credited_real + credited_bonus

    def _notify_wager_progress(
        self,
        wallet_id,
        amount,
        balance_type,
        conn,
        game=None,
        risk_mode=None,
        real_part=None,
        bonus_part=None,
    ):
        PromotionManager(self.user_id).on_bet_settled(
            user_id=self.user_id,
            wallet_id=wallet_id,
            stake=amount,
            balance_type=balance_type,
            game=game or "unknown",
            risk_mode=risk_mode,
            conn=conn,
            real_part=real_part,
            bonus_part=bonus_part,
        )

    def playDice(self, json, freebet_ticket_id=None):
        """
        Atomic Dice flow: lock → cash-first debit → settle → wager progress.
        """
        ensure_dice_schema()
        wallet_id = self.wallet.ensureWallet()

        if freebet_ticket_id is not None:
            return self._playDiceFreebet(json, wallet_id, freebet_ticket_id)

        validate_dice_bet(json.bid)

        with engine.begin() as conn:
            locked_wallet = lock_wallet(conn, self.user_id, wallet_id)
            if locked_wallet is None:
                raise notEnoughBalance()

            real_part, bonus_part, balance_type = self._allocate_stake(
                wallet_id, json.bid, conn, game="dice"
            )

            bet_tx_id, balance_type = self._debit_split(
                conn, wallet_id, real_part, bonus_part, "dice_bet"
            )

            bet = Bet(self.user_id, bet_tx_id, balance_type)
            bet_id = bet.createBet(
                conn,
                "dice",
                json.bid,
                "Pending",
                0,
                real_part=real_part,
                bonus_part=bonus_part,
            )

            fairness = lock_user_fairness(conn, self.user_id)
            result = evaluate_dice(
                bid=float(json.bid),
                limit=int(json.limit),
                over=bool(json.over),
                server_seed=fairness["server_seed"],
                client_seed=fairness["client_seed"],
                nonce=fairness["nonce"],
            )
            result["hash_server_seed_used"] = fairness["hash_server_seed"]
            won = bool(result["result"])

            if won:
                win_amount = float(json.bid) + float(result["payout"])
                real_credit, bonus_credit = split_payout_pro_rata(
                    win_amount, real_part, bonus_part
                )
                win_tx_id, credited = self._credit_split(
                    conn,
                    wallet_id,
                    real_credit,
                    bonus_credit,
                    "dice_win",
                    stake=json.bid,
                    bonus_part=bonus_part,
                )
                profit = credited - float(json.bid)
                bet.updateOutcome(
                    conn, bet_id, "Won", profit, win_transaction_id=win_tx_id
                )
                result["payout"] = profit
                dice_payout = credited
            else:
                bet.updateOutcome(conn, bet_id, "Lost", -float(json.bid))
                dice_payout = 0.0

            insert_dice_round(
                conn,
                user_id=self.user_id,
                bet_id=bet_id,
                client_seed_used=result["client_seed_used"],
                hash_server_seed_used=result["hash_server_seed_used"],
                nonce_used=result["nonce_used"],
                roll_result=result["roll"],
                target=int(json.limit),
                is_over=bool(json.over),
                multipier=result["multipier"],
                payout=dice_payout,
            )

            self._notify_wager_progress(
                wallet_id,
                json.bid,
                balance_type,
                conn,
                game="dice",
                real_part=real_part,
                bonus_part=bonus_part,
            )
            increment_nonce(conn, self.user_id)

            result["bet_id"] = bet_id
            result["balance_type"] = balance_type
            return result

    def _playDiceFreebet(self, json, wallet_id, ticket_id):
        ensure_dice_schema()
        with engine.begin() as conn:
            ticket = self.freebet.consumeTicket(ticket_id, "dice", conn=conn)
            if ticket is None:
                raise HTTPException(
                    status_code=409, detail="Freebet ticket not available"
                )

            bid = float(ticket["bet_size"])
            json.bid = bid

            fairness = lock_user_fairness(conn, self.user_id)
            result = evaluate_dice(
                bid=bid,
                limit=int(json.limit),
                over=bool(json.over),
                server_seed=fairness["server_seed"],
                client_seed=fairness["client_seed"],
                nonce=fairness["nonce"],
            )
            won = bool(result["result"])

            if won:
                win_amount = bid + float(result["payout"])
                self.freebet.recordWin(ticket_id, wallet_id, win_amount, conn=conn)

            increment_nonce(conn, self.user_id)
            return result

    def _settlePlincoBall(
        self,
        conn,
        *,
        json,
        wallet_id,
        balance_type,
        bet,
        bet_id,
        fairness,
        nonce,
        real_part,
        bonus_part,
    ):
        """Settle one funded Plinko bet using cash-first / pro-rata accounting."""
        result = getPlincoResult(
            json,
            fairness["server_seed"],
            fairness["client_seed"],
            nonce,
        )
        result["hash_server_seed"] = fairness["hash_server_seed"]
        result["server_seed_hash"] = fairness["hash_server_seed"]

        gross_payout = float(result["payout"])
        won = gross_payout > 0

        if won:
            real_credit, bonus_credit = split_payout_pro_rata(
                gross_payout, real_part, bonus_part
            )
            win_tx_id, credited = self._credit_split(
                conn,
                wallet_id,
                real_credit,
                bonus_credit,
                "plinko_win",
                stake=json.bid,
                bonus_part=bonus_part,
            )
            profit = credited - float(json.bid)
            bet.updateOutcome(
                conn, bet_id, "Won", profit, win_transaction_id=win_tx_id
            )
            result["payout"] = credited
        else:
            bet.updateOutcome(conn, bet_id, "Lost", -float(json.bid))

        insert_plinco_round(
            conn,
            user_id=self.user_id,
            bet_id=bet_id,
            client_seed_used=fairness["client_seed"],
            hash_server_seed=fairness["hash_server_seed"],
            nonce_used=nonce,
            rows=int(json.rows),
            risk_mode=json.risk_mode,
            result=result["multiplier"],
            basket=result["basket"],
        )

        self._notify_wager_progress(
            wallet_id,
            json.bid,
            balance_type,
            conn,
            game="plinco",
            risk_mode=getattr(json, "risk_mode", None),
            real_part=real_part,
            bonus_part=bonus_part,
        )

        result["bet_id"] = bet_id
        result["balance_type"] = balance_type
        result["result_of_game"] = won
        return result

    def playPlinco(self, json, freebet_ticket_id=None):
        """Atomic Plinko flow with cash-first split accounting."""
        ensure_dice_schema()
        wallet_id = self.wallet.ensureWallet()

        if freebet_ticket_id is not None:
            return self._playPlincoFreebet(json, wallet_id, freebet_ticket_id)

        risk_mode = getattr(json, "risk_mode", None)
        validate_plinko_bet(json.bid, risk_mode)

        with engine.begin() as conn:
            locked_wallet = lock_wallet(conn, self.user_id, wallet_id)
            if locked_wallet is None:
                raise notEnoughBalance()

            real_part, bonus_part, balance_type = self._allocate_stake(
                wallet_id,
                json.bid,
                conn,
                game="plinco",
                risk_mode=risk_mode,
            )

            bet_tx_id, balance_type = self._debit_split(
                conn, wallet_id, real_part, bonus_part, "plinko_bet"
            )

            bet = Bet(self.user_id, bet_tx_id, balance_type)
            bet_id = bet.createBet(
                conn,
                "plinco",
                json.bid,
                "Pending",
                0,
                real_part=real_part,
                bonus_part=bonus_part,
            )

            fairness = lock_user_fairness(conn, self.user_id)
            result = self._settlePlincoBall(
                conn,
                json=json,
                wallet_id=wallet_id,
                balance_type=balance_type,
                bet=bet,
                bet_id=bet_id,
                fairness=fairness,
                nonce=fairness["nonce"],
                real_part=real_part,
                bonus_part=bonus_part,
            )
            increment_nonce(conn, self.user_id)
            return result

    def playPlincoBatch(self, json):
        """Atomically fund and settle 1–10 independent Plinko bets."""
        ensure_dice_schema()
        ensure_plinko_batch_schema()
        wallet_id = self.wallet.ensureWallet()
        count = int(json.count)
        unit_bid = float(json.bid)
        total_bid = unit_bid * count
        risk_mode = getattr(json, "risk_mode", None)
        validate_plinko_bet(unit_bid, risk_mode)
        idempotency_key = str(json.idempotency_key)

        with engine.begin() as conn:
            locked_wallet = lock_wallet(conn, self.user_id, wallet_id)
            if locked_wallet is None:
                raise notEnoughBalance()
            prior_response = get_plinko_batch_response(
                conn,
                self.user_id,
                idempotency_key,
            )
            if prior_response is not None:
                return prior_response

            # Validate total funds + bonus rules once, then split each ball cash-first.
            real_bal = self.wallet.getRealBalance(wallet_id, conn=conn)
            bonus_bal = self.wallet.getBonusBalance(wallet_id, conn=conn)
            allocate_cash_first_stake(real_bal, bonus_bal, total_bid)
            if bonus_bal > 0:
                self._require_bonus_bet(
                    unit_bid, "plinco", conn, risk_mode=risk_mode
                )

            funded_bets = []
            last_balance_type = BALANCE_REAL
            for _ in range(count):
                real_part, bonus_part, balance_type = self._allocate_stake(
                    wallet_id,
                    unit_bid,
                    conn,
                    game="plinco",
                    risk_mode=risk_mode,
                )
                bet_tx_id, balance_type = self._debit_split(
                    conn, wallet_id, real_part, bonus_part, "plinko_bet"
                )
                last_balance_type = balance_type
                bet = Bet(self.user_id, bet_tx_id, balance_type)
                bet_id = bet.createBet(
                    conn,
                    "plinco",
                    unit_bid,
                    "Pending",
                    0,
                    real_part=real_part,
                    bonus_part=bonus_part,
                )
                funded_bets.append((bet, bet_id, real_part, bonus_part, balance_type))

            balance_after_debit = {
                "real": self.wallet.getRealBalance(wallet_id, conn=conn),
                "bonus": self.wallet.getBonusBalance(wallet_id, conn=conn),
            }

            fairness = lock_user_fairness(conn, self.user_id)
            nonce_start = int(fairness["nonce"])
            results = []

            for index, (bet, bet_id, real_part, bonus_part, balance_type) in enumerate(
                funded_bets
            ):
                result = self._settlePlincoBall(
                    conn,
                    json=json,
                    wallet_id=wallet_id,
                    balance_type=balance_type,
                    bet=bet,
                    bet_id=bet_id,
                    fairness=fairness,
                    nonce=nonce_start + index,
                    real_part=real_part,
                    bonus_part=bonus_part,
                )
                credited_amount = (
                    float(result["payout"]) if result["result_of_game"] else 0.0
                )
                result["index"] = index
                result["credited_amount"] = credited_amount
                result["balance_after_settlement"] = {
                    "real": self.wallet.getRealBalance(wallet_id, conn=conn),
                    "bonus": self.wallet.getBonusBalance(wallet_id, conn=conn),
                }
                results.append(result)

            increment_nonce_by(conn, self.user_id, count)

            balances = {
                "real": self.wallet.getRealBalance(wallet_id, conn=conn),
                "bonus": self.wallet.getBonusBalance(wallet_id, conn=conn),
            }
            total_payout = sum(float(result["credited_amount"]) for result in results)

            response = {
                "count": count,
                "unit_bid": unit_bid,
                "total_bid": total_bid,
                "total_payout": total_payout,
                "balance_type": last_balance_type,
                "nonce_start": nonce_start,
                "nonce_end": nonce_start + count - 1,
                "balance_after_debit": balance_after_debit,
                "balances": balances,
                "results": results,
            }
            insert_plinko_batch_response(
                conn,
                self.user_id,
                idempotency_key,
                response,
            )
            return response

    def _playPlincoFreebet(self, json, wallet_id, ticket_id):
        ensure_dice_schema()
        with engine.begin() as conn:
            ticket = self.freebet.consumeTicket(ticket_id, "plinco", conn=conn)
            if ticket is None:
                raise HTTPException(
                    status_code=409, detail="Freebet ticket not available"
                )

            bid = float(ticket["bet_size"])
            json.bid = bid

            fairness = lock_user_fairness(conn, self.user_id)
            result = getPlincoResult(
                json,
                fairness["server_seed"],
                fairness["client_seed"],
                fairness["nonce"],
            )
            win_amount = float(result["payout"])

            if win_amount > 0:
                self.freebet.recordWin(ticket_id, wallet_id, win_amount, conn=conn)

            increment_nonce(conn, self.user_id)
            result["result_of_game"] = win_amount > 0
            return result
