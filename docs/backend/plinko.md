# Plinko (backend)

См. также [../games/plinko.md](../games/plinko.md).

## Entry

- `GET /api/games/plinco/config`
- `POST /api/games/plinco`
- `POST /api/games/plinco/batch` (идемпотентность через `plinco_batches`)

→ `GameManager.playPlinco` / `playPlincoBatch`.

## BONUS

Deposit bonus: только risk **low** (каталог `DEPOSIT_BONUS_ELIGIBLE_GAMES`).

## Promo

`on_bet_settled` после settle (как Dice).
