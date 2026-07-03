from fastapi import HTTPException

def notEnoughBalance():
    return HTTPException(
        status_code=409,
        detail={
            "code": "NOT_ENOUGH_BALANCE",
            "title": "Insufficient balance",
            "message": "Please top up your balance."
        }
    )

def notActualWallet():
    return HTTPException(
        status_code=409,
        detail={
            'code': 'NOT_ACTUAL_BALANCE',
            'title': 'The wallet has not been created',
            'message': 'Please top up your balance'
        }
    )