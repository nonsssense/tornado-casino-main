# Бонусная система

## Что есть сейчас

**Deposit match** на 1–3 депозит (`DEPOSIT_BONUS_OFFERS` в `config.py`):

- min deposit, % match, cap principal, wager ×40, expiry days;
- max bet / max win caps;
- eligible: Dice + Plinko low; Crash false.

Выдача: `PromotionManager.on_deposit_confirmed` → `BonusManager.grantDepositBonus`.

Отыгрыш: BONUS-ставки → `recordWagerProgress` → unlock BONUS→REAL ≤ principal.

## Методы без live wiring

`grantWelcomeBonus`, `grantReloadBonus`, `grantPromoBonus`, `grantCashbackBonus` — код есть, продуктовых входов нет (*Planned*).

## Freebet

Таблицы + GameManager paths есть; HTTP не открыт (*Planned*).

## Frontend

Селектор офферов на депозите; баланс BONUS в UI.  
Прогресс отыгрыша API есть, UI слабый.
