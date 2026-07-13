from database.db_config import engine
from database.wallet import WalletManager, BALANCE_REAL, BALANCE_BONUS
from database.transactions import TransactionManager
from database.bet import Bet
from database.bonus import BonusManager
from database.freebet import FreebetManager
from database.plinco_db import postPlinco
from games.Dice.dice import getDiceResult
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
        wallet_id = self.wallet.ensureWallet()

        if freebet_ticket_id is not None:
            return self._playDiceFreebet(json, wallet_id, freebet_ticket_id)

        with engine.begin() as conn:
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

            bet_tx_id = self._debit(conn, wallet_id, balance_type, json.bid, "dice bet")

        result = getDiceResult(json, self.user_id)
        won = bool(result.get("result"))
        result["result_of_game"] = won

        with engine.begin() as conn:
            bet = Bet(self.user_id, bet_tx_id, balance_type)

            if won:
                win_amount = json.bid + result["payout"]
                win_tx_id, credited = self._credit_game_win(
                    conn,
                    wallet_id,
                    balance_type,
                    json.bid,
                    win_amount,
                    "dice win",
                )
                profit = max(0.0, credited - json.bid)
                bet_id = bet.createBet(conn, "dice", json.bid, "Win", profit)
                bet.updateWinTransaction(conn, win_tx_id, bet_id)
            else:
                bet.createBet(conn, "dice", json.bid, "Lose", result["payout"])

            self._notify_wager_progress(wallet_id, json.bid, balance_type, conn)

        return result

    def _playDiceFreebet(self, json, wallet_id, ticket_id):
        with engine.begin() as conn:
            ticket = self.freebet.consumeTicket(ticket_id, "dice", conn=conn)
            if ticket is None:
                raise HTTPException(status_code=409, detail="Freebet ticket not available")

        bid = float(ticket["bet_size"])
        json.bid = bid

        result = getDiceResult(json, self.user_id)
        won = bool(result.get("result"))
        result["result_of_game"] = won

        if won:
            win_amount = bid + result["payout"]
            with engine.begin() as conn:
                self.freebet.recordWin(ticket_id, wallet_id, win_amount, conn=conn)

        return result

    def playPlinco(self, json, freebet_ticket_id=None):
        wallet_id = self.wallet.ensureWallet()

        if freebet_ticket_id is not None:
            return self._playPlincoFreebet(json, wallet_id, freebet_ticket_id)

        risk_mode = getattr(json, "risk_mode", None)

        with engine.begin() as conn:
            balance_type = self._resolve_balance_type(
                wallet_id,
                json.bid,
                conn,
                game="plinco",
                risk_mode=risk_mode,
            )
            if balance_type is None:
                # Prefer a clear validation error when BONUS exists but rules block it
                # and REAL cannot cover the stake.
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
                conn, wallet_id, balance_type, json.bid, "plinco bet"
            )

        result = getPlincoResult(json, self.user_id)

        with engine.begin() as conn:
            bet = Bet(self.user_id, bet_tx_id, balance_type)
            win_tx_id, credited = self._credit_game_win(
                conn,
                wallet_id,
                balance_type,
                json.bid,
                result["payout"],
                "plinco win",
            )
            bet_id = bet.createBet(
                conn, "plinco", json.bid, "Win", credited - json.bid
            )
            bet.updateWinTransaction(conn, win_tx_id, bet_id)
            self._notify_wager_progress(wallet_id, json.bid, balance_type, conn)

        postPlinco(self.user_id, bet_id, json, result)
        return result

    def _playPlincoFreebet(self, json, wallet_id, ticket_id):
        with engine.begin() as conn:
            ticket = self.freebet.consumeTicket(ticket_id, "plinco", conn=conn)
            if ticket is None:
                raise HTTPException(status_code=409, detail="Freebet ticket not available")

        bid = float(ticket["bet_size"])
        json.bid = bid

        result = getPlincoResult(json, self.user_id)
        win_amount = result["payout"]

        if win_amount > 0:
            with engine.begin() as conn:
                self.freebet.recordWin(ticket_id, wallet_id, win_amount, conn=conn)

        return result
