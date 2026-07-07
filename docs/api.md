# API Documentation

## Overview

The frontend communicates with the backend exclusively through the REST API.

All business logic is executed on the backend.

The frontend is responsible only for rendering the UI and sending requests.

Authentication is handled using the `session_token` HTTP-only cookie.

All requests that require authorization must include this cookie automatically.

---

# Authentication

## POST /api/auth

### Description

Authenticates the Telegram Mini App user.

The backend validates Telegram `initData`, creates or loads the user, creates a session and returns the application entry page.

A secure HTTP-only cookie named `session_token` is created automatically.

### Request

```json
{
  "initdata": "<Telegram initData>"
}
```

### Response

Returns the application HTML.

### Side Effects

- validates Telegram user
- creates user if necessary
- creates session
- stores session cookie

---

# Games

## POST /api/games/rolldice

### Description

Creates a Dice bet.

The backend performs:

1. session validation
2. wallet validation
3. balance check
4. bet transaction creation
5. dice result generation
6. bet creation
7. win transaction (if player wins)

The frontend never calculates the game result.

### Request

```json
{
  "bid": 10,
  "limit": 50,
  "over": true
}
```

### Response

Returns the calculated Dice result.

Example:

```json
{
  "result_of_game": true,
  "roll": 82,
  "payout": 19.8
}
```

### Possible Errors

- NotEnoughBalance

---

## POST /api/games/plinco

### Description

Creates a Plinko game.

The backend performs:

1. session validation
2. wallet validation
3. balance check
4. bet transaction
5. Provably Fair calculation
6. Plinko simulation
7. bet creation
8. payout transaction
9. game history storage

### Request

```json
{
  "bid": 10,
  "risk_mode": "high",
  "rows": 16
}
```

### Response

Returns the complete Plinko game result.

Example:

```json
{
    "basket": 15,
    "multiplier": 8,
    "payout": 80,
    "bits": [...]
}
```

### Possible Errors

- NotEnoughBalance

---

# Wallet

## POST /api/wallet/deposit

### Description

Creates a cryptocurrency deposit.

The backend:

- validates session
- creates deposit record
- requests a payment address from BlockBee
- stores the generated address
- returns payment information

### Request

```json
{
  "ticker": "USDT_TRC20"
}
```

### Response

Example:

```json
{
  "address": "...",
  "minimum": "...",
  "qr_code": "...",
  "ticker": "USDT_TRC20"
}
```

---

# Payment Webhook

## POST /api/payment/webhook

### Description

Internal endpoint.

Used only by BlockBee.

Must never be called by the frontend.

The backend verifies the BlockBee signature and processes incoming blockchain payment notifications.

### Authentication

BlockBee Signature Verification.

### Response

Returns:

```
*ok*
```

when the webhook has been processed successfully.

---

# API Design Rules

The frontend must never:

- calculate Dice results;
- calculate Plinko results;
- calculate multipliers;
- modify balances;
- create transactions.

All game logic and financial operations must be performed on the backend.

The frontend is responsible only for:

- displaying UI;
- collecting user input;
- sending API requests;
- rendering backend responses.
