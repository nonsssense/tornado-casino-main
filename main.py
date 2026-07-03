# ----config import-----
from config import bot_token

# ------fastapi import------
from fastapi import FastAPI, Response, Request, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

# --------extra imports--------
import asyncio
from pydantic import BaseModel

# ------ individual imports------
from games.Dice.dice import getDiceResult
from games.Plinco.plinco import getPlincoResult
from handler_helpers import prepareRequest, getUserId, walletCheck, balanceCheck
from bot import dp, bot

# -------database imports------
from database.auth import userValidate
from database.transactions import TransactionManager
from database.wallet import WalletManager
from database.bet import Bet
from database.plinco_db import postPlinco

# -----------exceptions----------
from exceptions import notEnoughBalance

# ----------payments-------------
from payments.deposit import BlockBeeClient, DepositManager

# ---------verifier-------------
from payments.verifier import BlockBeeVerifier



app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

class DiceRequest(BaseModel):
    bid: float
    limit: int
    over: bool

class PlincoRequest(BaseModel):
    bid: float
    risk_mode: str
    rows: int

class UserRequest(BaseModel):
    initdata: str

@app.post("/api/auth")
async def root(response: Response, request:Request, initdata: UserRequest):
    response = FileResponse("index.html")
    event_type = 'Auth'

    # Firslty user validate. Check if user exist
    user_id = userValidate(initdata)

    # Then check session status
    session_token = prepareRequest(request, user_id, event_type)

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="Lax"
    )

    return response


@app.post('/api/games/rolldice')
async def roll_dice(json: DiceRequest, request: Request):
    session_token = prepareRequest(request, "dice")
    user_id = getUserId(session_token)

    wallet_id = walletCheck(user_id)
    wallet = WalletManager(user_id)
    balance = balanceCheck(wallet, wallet_id, json['bid'])
    if balance == 'not enough':
        raise notEnoughBalance()
    
    bet_transaction = TransactionManager(user_id, wallet_id, 'dice bet', json['bid'])
    bet_transaction_id = bet_transaction.postTransaction()

    result = getDiceResult(json)

    bet = Bet(user_id, bet_transaction_id)
    if result['result_of_game']:
        bet_id = bet.createBet('dice', json['bid'], 'Win', result['payout'])

        # after game transaction write
        win_transaction = TransactionManager(user_id, wallet_id, 'plinco ', (result['payout']))
        win_transaction_id = win_transaction.postTransaction()
    else:
        bet_id = bet.createBet('dice', json['bid'], 'Lose', result['payout'])

    if win_transaction:
        bet.updateWinTransaction(win_transaction_id, bet_id)

    


    return result


@app.post("/api/games/plinco")
async def plinco(json: PlincoRequest, request: Request):
    session_token = prepareRequest(request, 'plinco')
    user_id = getUserId(session_token)

    # wallet and balance check
    wallet_id = walletCheck(user_id)
    wallet = WalletManager(user_id)
    balance = balanceCheck(wallet, wallet_id, json['bid'])
    if balance == 'not enough':
        raise notEnoughBalance() 

    # bet transaction
    bet_transaction = TransactionManager(user_id, wallet_id, 'plinco bet', json['bid'])
    bet_transaction_id = bet_transaction.postTransaction()

    # game result
    result = getPlincoResult(json, user_id)

    # bet
    bet = Bet(user_id, bet_transaction_id)
    bet_id = bet.createBet('plinco', json['bid'], 'Win', result['payout'])

    # after game transaction write
    win_transaction = TransactionManager(user_id, wallet_id, 'plinco ', (result['payout']))
    win_transaction_id = win_transaction.postTransaction()

    bet.updateWinTransaction(win_transaction_id, bet_id)

    # game table post
    postPlinco(user_id, bet_id, json, result)


    return result
    
class DepositRequest(BaseModel):
    ticker:str

@app.post("/api/wallet/deposit")
async def create_deposit(json: DepositRequest, request: Request):
    
    # create data about user and prepare request
    session_token = prepareRequest(request, "deposit")
    user_id = getUserId(session_token)
    wallet = WalletManager(user_id)
    wallet_id = wallet.checkWalletStatus()

    client = BlockBeeClient()
    deposit = DepositManager(user_id)
    deposit_id = deposit.postPreDeposit(wallet_id, json.ticker, "Open deposit window")

    payment = await client.create_payment_address(
        ticker=json.ticker,
        user_id=user_id,
        wallet_id=wallet_id,
        deposit_id=deposit_id
    )

    if payment is None:
        raise HTTPException(500)

    deposit.updateAddressDeposit(deposit_id, payment["address"], payment["minimum"])


    return payment


@app.post("/api/payment/webhook")
async def blockbee_webhook(request: Request):

    if not await BlockBeeVerifier().verify(request):
        raise HTTPException(
            status_code=401,
            detail='Invalid BlockBee Signature'
        )
    
    # Получаем JSON от BlockBee
    webhook = await request.json()

    # user_id прилетит в callback URL
    user_id = request.query_params.get("user_id")

    if user_id is None:
        return PlainTextResponse("*ok*", status_code=200)

    deposit = DepositManager(user_id)
    deposit_id = request.query_params.get("deposit_id")
    if deposit_id is None:
        return PlainTextResponse("*ok*", status_code=200)
    deposit_data = deposit.getDeposit(deposit_id)
    if deposit_data is None:
        return PlainTextResponse("*ok*", status_code=200)
    

    deposit.processWebhook(deposit_data, webhook)

    return PlainTextResponse("*ok*", status_code=200)

# tg bot start
async def main(): 
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())

