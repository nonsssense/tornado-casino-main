from database.db_config import engine
from database.wallet import WalletManager, BALANCE_REAL, BALANCE_BONUS
from database.transactions import TransactionManager
from database.bet import Bet
from database.bonus import BonusManager
from database.freebet import FreebetManager
from database.plinco_db import insert_plinco_round
from database.dice_db import (
    ensure_dice_schema,
    lock_wallet,
    lock_user_fairness,
    increment_nonce,
    insert_dice_round,
)
from games.Dice.dice import evaluate_dice
from games.Plinco.plinco import getPlincoResult
from exceptions import notEnoughBalance
from fastapi import HTTPException
from log_manager import log


class GameManager:
    def __init__(self, user_id):
        self.user_id = user_id
        self.wallet = WalletManager(user_id)
        self.bonus = BonusManager(user_id)
        self.freebet = FreebetManager(user_id)

    def _resolve_balance_type(
        self,
        wallet_id,
        amount,
        conn,
        preferred_balance=None,
        game=None,
        risk_mode=None,
    ):
        # Если пользователь явно выбрал баланс
        if preferred_balance is not None:
            if preferred_balance == BALANCE_BONUS:
                if not self.wallet.hasEnoughBalance(
                    wallet_id, amount, BALANCE_BONUS, conn=conn
                ):
                    return None
                if game and not self.bonus.canPlaceBonusBet(
                    amount, game, conn=conn, risk_mode=risk_mode
                ):
                    return None
                return BALANCE_BONUS

            if self.wallet.hasEnoughBalance(
                wallet_id,
                amount,
                preferred_balance,
                conn=conn,
            ):
                return preferred_balance
            return None

        if self.wallet.hasEnoughBalance(
            wallet_id,
            amount,
            BALANCE_BONUS,
            conn=conn,
        ) and (
            not game
            or self.bonus.canPlaceBonusBet(
                amount, game, conn=conn, risk_mode=risk_mode
            )
        ):
            return BALANCE_BONUS

        if self.wallet.hasEnoughBalance(
            wallet_id,
            amount,
            BALANCE_REAL,
            conn=conn,
        ):
            return BALANCE_REAL

        return None

    def _require_bonus_bet(self, stake, game, conn, risk_mode=None):
        try:
            return self.bonus.validateBonusBet(
                stake, game, conn=conn, risk_mode=risk_mode
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    def _get_balance(self, wallet_id, balance_type, conn):
        if balance_type == BALANCE_REAL:
            return self.wallet.getRealBalance(wallet_id, conn=conn)
        return self.wallet.getBonusBalance(wallet_id, conn=conn)

    def _update_balance(self, balance_type, balance_after, conn):
        if balance_type == BALANCE_REAL:
            self.wallet.updateRealBalance(conn, balance_after)
        else:
            self.wallet.updateBonusBalance(conn, balance_after)

    def _debit(self, conn, wallet_id, balance_type, amount, transaction_type):
        balance = self._get_balance(wallet_id, balance_type, conn)
        if balance < amount:
            raise notEnoughBalance()

        balance_after = balance - amount
        self._update_balance(balance_type, balance_after, conn)

        return TransactionManager(
            user_id=self.user_id,
            wallet_id=wallet_id,
            balance_type=balance_type,
            transaction_type=transaction_type,
            amount=-amount,
            balance_after=balance_after,
        ).postTransaction(conn)

    def _credit(self, conn, wallet_id, balance_type, amount, transaction_type):
        balance = self._get_balance(wallet_id, balance_type, conn)
        balance_after = balance + amount
        self._update_balance(balance_type, balance_after, conn)

        return TransactionManager(
            user_id=self.user_id,
            wallet_id=wallet_id,
            balance_type=balance_type,
            transaction_type=transaction_type,
            amount=amount,
            balance_after=balance_after,
        ).postTransaction(conn)

    def _credit_game_win(
        self,
        conn,
        wallet_id,
        balance_type,
        stake,
        payout_amount,
        transaction_type,
    ):
        credit_amount = float(payout_amount)
        if balance_type == BALANCE_BONUS:
            credit_amount = self.bonus.capBonusWin(stake, credit_amount, conn=conn)
        return self._credit(
            conn, wallet_id, balance_type, credit_amount, transaction_type
        ), credit_amount

    def _notify_wager_progress(self, wallet_id, amount, balance_type, conn):
        if balance_type == BALANCE_BONUS:
            self.bonus.recordWagerProgress(wallet_id, amount, conn=conn)

    def playDice(self, json, freebet_ticket_id=None):
        """
        Reference atomic Dice flow — one DB transaction for the full game.

        Lock wallet → debit → bet Pending → PF roll → dice row → settle →
        nonce++ → commit. Any failure rolls back everything.
        """
        ensure_dice_schema()
        wallet_id = self.wallet.ensureWallet()

        if freebet_ticket_id is not None:
            return self._playDiceFreebet(json, wallet_id, freebet_ticket_id)

        with engine.begin() as conn:
            locked_wallet = lock_wallet(conn, self.user_id, wallet_id)
            if locked_wallet is None:
                raise notEnoughBalance()

            balance_type = self._resolve_balance_type(
                wallet_id, json.bid, conn, game="dice"
            )
            if balance_type is None:
                if self.wallet.hasEnoughBalance(
                    wallet_id, json.bid, BALANCE_BONUS, conn=conn
                ):
                    self._require_bonus_bet(json.bid, "dice", conn)
                raise notEnoughBalance()

            if balance_type == BALANCE_BONUS:
                self._require_bonus_bet(json.bid, "dice", conn)

            bet_tx_id = self._debit(
                conn, wallet_id, balance_type, json.bid, "dice_bet"
            )

            bet = Bet(self.user_id, bet_tx_id, balance_type)
            bet_id = bet.createBet(conn, "dice", json.bid, "Pending", 0)

            fairness = lock_user_fairness(conn, self.user_id)
            result = evaluate_dice(
                bid=float(json.bid),
                limit=int(json.limit),
                over=bool(json.over),
                server_seed=fairness["server_seed"],
                client_seed=fairness["client_seed"],
                nonce=fairness["nonce"],
            )
            # Prefer the hash already stored on the user row (public commitment).
            result["hash_server_seed_used"] = fairness["hash_server_seed"]
            won = bool(result["result"])

            if won:
                win_amount = float(json.bid) + float(result["payout"])
                win_tx_id, credited = self._credit_game_win(
                    conn,
                    wallet_id,
                    balance_type,
                    json.bid,
                    win_amount,
                    "dice_win",
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

            self._notify_wager_progress(wallet_id, json.bid, balance_type, conn)
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

    def playPlinco(self, json, freebet_ticket_id=None):
        """
        Atomic Plinko flow — same transaction model as Dice.

        Lock wallet → debit → bet Pending → PF path → plinco row → settle →
        nonce++ → commit. Any failure rolls back everything.
        """
        # server_seed column may be ensured via Dice schema helper (shared users).
        ensure_dice_schema()
        wallet_id = self.wallet.ensureWallet()

        if freebet_ticket_id is not None:
            return self._playPlincoFreebet(json, wallet_id, freebet_ticket_id)

        risk_mode = getattr(json, "risk_mode", None)

        with engine.begin() as conn:
            locked_wallet = lock_wallet(conn, self.user_id, wallet_id)
            if locked_wallet is None:
                raise notEnoughBalance()

            balance_type = self._resolve_balance_type(
                wallet_id,
                json.bid,
                conn,
                game="plinco",
                risk_mode=risk_mode,
            )
            if balance_type is None:
                if self.wallet.hasEnoughBalance(
                    wallet_id, json.bid, BALANCE_BONUS, conn=conn
                ):
                    self._require_bonus_bet(
                        json.bid, "plinco", conn, risk_mode=risk_mode
                    )
                raise notEnoughBalance()

            if balance_type == BALANCE_BONUS:
                self._require_bonus_bet(
                    json.bid, "plinco", conn, risk_mode=risk_mode
                )

            bet_tx_id = self._debit(
                conn, wallet_id, balance_type, json.bid, "plinko_bet"
            )

            bet = Bet(self.user_id, bet_tx_id, balance_type)
            bet_id = bet.createBet(conn, "plinco", json.bid, "Pending", 0)

            fairness = lock_user_fairness(conn, self.user_id)
            result = getPlincoResult(
                json,
                fairness["server_seed"],
                fairness["client_seed"],
                fairness["nonce"],
            )
            # Store the public hash already on the user row.
            result["hash_server_seed"] = fairness["hash_server_seed"]
            result["server_seed_hash"] = fairness["hash_server_seed"]

            gross_payout = float(result["payout"])
            won = gross_payout > 0

            if won:
                win_tx_id, credited = self._credit_game_win(
                    conn,
                    wallet_id,
                    balance_type,
                    json.bid,
                    gross_payout,
                    "plinko_win",
                )
                profit = credited - float(json.bid)
                bet.updateOutcome(
                    conn, bet_id, "Won", profit, win_transaction_id=win_tx_id
                )
                # API keeps gross payout for frontend animation / toast.
                result["payout"] = credited
            else:
                bet.updateOutcome(conn, bet_id, "Lost", -float(json.bid))

            insert_plinco_round(
                conn,
                user_id=self.user_id,
                bet_id=bet_id,
                client_seed_used=fairness["client_seed"],
                hash_server_seed=fairness["hash_server_seed"],
                nonce_used=fairness["nonce"],
                rows=int(json.rows),
                risk_mode=json.risk_mode,
                result=result["multiplier"],
                basket=result["basket"],
            )

            self._notify_wager_progress(wallet_id, json.bid, balance_type, conn)
            increment_nonce(conn, self.user_id)

            result["bet_id"] = bet_id
            result["balance_type"] = balance_type
            result["result_of_game"] = won
            return result

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
