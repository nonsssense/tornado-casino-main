# API — Wallet & payments

## GET `/api/wallet/balance`

Возвращает REAL и BONUS. Auth: session.

## GET `/api/wallet/history`

История транзакций. Auth: session.

## POST `/api/wallet/deposit`

| | |
|---|---|
| **Зачем** | Получить адрес пополнения |
| **Auth** | session |
| **Эффект** | row `deposit` + BlockBee address |
| **Далее** | webhook |

## GET `/api/wallet/deposit/status?deposit_id=`

Поллинг статуса депозита.

## POST `/api/payment/webhook`

| | |
|---|---|
| **Auth** | подпись BlockBee (`verifier`) |
| **Эффект** | `completeDeposit` → REAL + promo |

## POST `/api/wallet/withdraw`

| | |
|---|---|
| **Зачем** | Создать вывод |
| **Auth** | session |
| **Эффект** | REAL→PENDING hold + `withdraws` PENDING |
| **Errors** | insufficient / already pending |
