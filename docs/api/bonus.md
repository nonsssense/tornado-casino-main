# API — Bonus

## GET `/api/bonus/offers`

Каталог депозитных тиров из config (+ состояние пользователя).

## GET `/api/bonus/active`

Активные `bonus_instances` (wager progress и т.д.).  
Фронт частично загружает, **полоса отыгрыша в UI почти не показана**.

## POST `/api/bonus/select`

Сохраняет `wallet.selected_bonus_source`.  
**Факт grant** при депозите идёт по `deposit_index`, не по выбору игрока (UI/логика расходятся — известно).

## Нет API

Campaign list, referral claim, freebet, welcome grant.
