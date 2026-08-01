# API — Games (Dice / Plinko)

## POST `/api/games/rolldice`

| | |
|---|---|
| **Сервис** | `GameManager.playDice` |
| **Auth** | session |
| **Эффект** | debit/credit wallet, bets/dice, `on_bet_settled` |
| **BONUS** | авто, если eligible |

## GET `/api/games/plinco/config`

Таблицы выплат / конфиг риска.

## POST `/api/games/plinco`

Один шар. Auth: session. Settle + promo.

## POST `/api/games/plinco/batch`

Пакет шаров; идемпотентность через `plinco_batches`.

## Ограничения request

Нет полей `balance_type` / `freebet_ticket_id` в публичных моделях.
