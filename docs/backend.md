# Tornado Backend Architecture

This document describes how the backend is designed.

Frontend code must respect these rules.

Never invent backend behavior.

Never assume endpoints or business logic that are not documented.

---

# Backend Stack

Framework

- FastAPI

Language

- Python

Database

- PostgreSQL

ORM

- SQLAlchemy Core

Authentication

- Telegram Mini App InitData
- Server Sessions
- HttpOnly Cookies

Payments

- BlockBee

Game Fairness

- Provably Fair

---

# Architecture

The backend is separated into several logical modules.

authentication

↓

session

↓

wallet

↓

transactions

↓

games

↓

payments

↓

database

Each module has a single responsibility.

---

# Authentication

Authentication is based on Telegram Mini Apps.

The frontend sends:

Telegram InitData

↓

Backend validates Telegram user

↓

Creates or loads the user

↓

Creates or refreshes a server session

↓

Returns HttpOnly cookie

The frontend never validates Telegram data itself.

---

# Session

Authentication uses server-side sessions.

The frontend never stores JWT tokens.

The frontend never stores access tokens.

The session is represented by

session_token

stored as

HttpOnly Cookie.

Every authenticated request automatically sends the cookie.

The frontend should never manually attach authentication headers.

---

# Authorization

Current authentication method

Server Session

Cookie

session_token

Future JWT support is possible but not currently used.

Do not implement JWT unless explicitly requested.

---

# Request Lifecycle

Every authenticated request follows the same flow.

Request

↓

Read session_token cookie

↓

Validate session

↓

Refresh session activity

↓

Log user event

↓

Execute endpoint

Never bypass this flow.

---

# Event Tracking

Every important request creates an event.

Examples

Authentication

Deposit

Withdraw

Dice

Plinko

Wallet

Events are used for analytics and auditing.

The frontend does not create events manually.

---

# Wallet

Every user owns one wallet.

Wallet stores:

- balance
- currency
- transactions

Wallet is the source of truth for player balance.

Never calculate balance on the frontend.

Always trust backend values.

---

# Balance

The frontend should always display the backend balance.

Never cache balance for long periods.

Never calculate winnings locally.

---

# Transactions

Every balance change creates a transaction.

Examples

Deposit

Withdraw

Game Bet

Game Win

Bonus

Refund

Balance is updated only through transactions.

Never modify balance directly.

---

# Deposits

Deposits are processed by BlockBee.

Flow

User opens Deposit

↓

Backend creates deposit record

↓

BlockBee returns payment address

↓

Frontend displays address

↓

User sends payment

↓

BlockBee webhook notifies backend

↓

Deposit is validated

↓

Transaction created

↓

Wallet balance updated

The frontend never confirms deposits manually.

---

# Withdrawals

Withdrawals are backend-controlled.

The frontend only submits withdrawal requests.

The backend validates:

- balance
- wallet
- address
- network

The backend performs the withdrawal.

---

# Payment Webhooks

Payment webhooks are internal endpoints.

Frontend must never call them.

BlockBee sends payment updates.

The backend validates signatures before processing payments.

---

# Games

All game logic is executed on the backend.

Frontend never calculates:

- wins
- payouts
- multipliers
- random numbers

Frontend only renders results.

---

# Dice

Dice is server-authoritative.

Frontend sends

- bet
- target
- over/under

Backend:

- validates balance
- creates transaction
- generates result
- calculates payout
- records bet
- updates wallet

Frontend displays the returned result.

---

# Plinko

Plinko uses Provably Fair.

Each game is generated using

- Server Seed
- Client Seed
- Nonce

The backend generates the ball path.

The backend calculates:

- basket
- multiplier
- payout

Frontend only renders the returned path and animation.

---

# Provably Fair

Provably Fair consists of

Server Seed

Client Seed

Nonce

The backend owns all fairness calculations.

The frontend should never attempt to reproduce game results.

Frontend only displays proof information returned by the backend.

---

# Database

Database is the single source of truth.

Main entities include

Users

Sessions

Wallets

Transactions

Deposits

Bets

Plinko Games

Events

Frontend must never assume database structure.

Only use documented API responses.

---

# Business Logic

Business logic always lives in the backend.

Examples

Balance validation

Wallet validation

Bet validation

Deposit processing

Payout calculation

Transaction creation

Provably Fair

Frontend should never duplicate backend logic.

---

# Error Handling

Backend communicates failures through HTTP status codes.

Frontend should display user-friendly messages.

Never guess backend state.

---

# Frontend Rules

The frontend must:

- Use documented API endpoints only.
- Never invent backend functionality.
- Never calculate payouts.
- Never modify balances locally.
- Never bypass authentication.
- Never call internal webhook endpoints.
- Always trust backend responses.
- Treat the backend as the single source of truth.

---

# Goal

The backend is fully authoritative.

The frontend is responsible only for:

- rendering UI
- collecting user input
- calling APIs
- displaying backend responses

All security, validation, financial calculations and game logic belong exclusively to the backend.
