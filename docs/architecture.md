# Tornado Casino Architecture

## Project Overview

Tornado is a Telegram Mini App cryptocurrency casino.

The project consists of four main parts:

1. Telegram Bot

2. FastAPI Backend

3. Frontend (Vanilla HTML/CSS/JS)

4. PostgreSQL Database

The frontend is served by FastAPI and communicates with the backend using REST API.

The backend contains all business logic, authentication, wallet management, payments, sessions, transactions and games.

The database stores all persistent user information.

---

## High Level Architecture

Telegram

↓

Telegram Bot (Aiogram)

↓

FastAPI

├── Authentication

├── Wallet

├── Payments

├── Games

├── Sessions

├── Events

├── Transactions

↓

PostgreSQL

---

## Main Technologies

Backend

- Python

- FastAPI

- SQLAlchemy

- PostgreSQL

Frontend

- HTML

- CSS

- Vanilla JavaScript

Infrastructure

- Telegram Mini App

- VPS

- Nginx (future)

---

## Project Structure

backend/

games/

payments/

static/

scripts/

---

## Project Principles

Business logic always stays on backend.

Frontend never calculates game results.

Frontend only renders UI and sends API requests.

Game fairness is calculated only on backend.

Balance can only change through backend transactions.

---

## Current State

Completed

- Authentication

- Wallet

- Sessions

- Transactions

- Event Tracking

- Dice

- Plinko

- Provably Fair

Planned

- Crash

- Mines

- Bonuses

- Referral System

- Frontend

- referals logic

- wathdraw logic
