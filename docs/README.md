# Tornado — внутренняя Wiki

**Язык:** русский  
**Назначение:** единая точка входа в документацию проекта.  
**Правило:** здесь описано **текущее** поведение. Планы помечены как *Planned* / *Future extension*.

---

## Что такое Tornado

Tornado — Telegram Mini App казино (crypto): игрок открывает приложение в Telegram, авторизуется через `initData`, играет в **Dice**, **Plinko**, **Crash**, пополняет и выводит баланс в крипте (BlockBee).

Цели MVP:

- честные (provably fair) игры;
- раздельные балансы REAL / BONUS;
- депозитные бонусы и клиентский реферал;
- безопасные мутации кошелька;
- задел под Campaign Engine и будущую Admin Panel.

---

## С чего начать чтение

| Кто вы | Читайте сначала |
|---|---|
| Новый разработчик | этот файл → [architecture/system.md](architecture/system.md) → модуль, с которым работаете в `backend/` |
| Backend / security | [security/overview.md](security/overview.md), [backend/wallet.md](backend/wallet.md) |
| Promo / кампании | [promotion/overview.md](promotion/overview.md), [campaign-engine-lifecycle-ru.md](campaign-engine-lifecycle-ru.md) |
| Product / маркетинг / affiliate | раздел [marketing/](marketing/README.md) — **без кода** |
| Интеграция API | [api/overview.md](api/overview.md) |

---

## Высокоуровневая архитектура

```
Telegram Mini App (static/)
        │  HTTP / WebSocket
        ▼
FastAPI (main.py) + Crash router
        │
        ├── Auth / Sessions
        ├── Wallet / Payments (BlockBee)
        ├── Games (Dice, Plinko, Crash)
        └── PromotionManager
                ├── BonusManager / ReferralManager   ← награды
                └── CampaignManager                  ← учёт кампаний (observe)
        │
        ▼
PostgreSQL
```

---

## Главные модули

| Модуль | Папка / файлы | Роль |
|---|---|---|
| Auth & sessions | `database/auth.py`, `session.py` | Telegram auth, cookie-сессия |
| Wallet | `database/wallet.py`, `transactions.py` | Балансы, lock, ledger |
| Payments | `payments/` | Депозит / вывод |
| Games | `games/` | Dice, Plinko, Crash |
| Bonus | `database/bonus.py` | BONUS-инстансы, отыгрыш |
| Referral | `database/referral.py` | FTD, bounty, RevShare |
| Campaign | `database/campaign.py` | Кампании и participation |
| Promotion | `promo/promo_manager.py` | Оркестрация наград + observe |
| Frontend | `static/src/` | Mini App UI |

---

## Структура репозитория (кратко)

```
casinobot/
  main.py              # FastAPI app, большинство API
  config.py            # секреты + экономика (seeds)
  database/            # SQL-слой и менеджеры
  payments/            # BlockBee deposit/withdraw
  games/               # Dice, Plinko, Crash
  promo/               # PromotionManager
  static/              # фронтенд Mini App
  docs/                # ← эта Wiki (+ старые аудиты/спеки)
```

Старые документы (аудиты, economics specs) остаются в `docs/` рядом с Wiki — они исторические/исследовательские; актуальная Wiki — папки `architecture/`, `backend/`, `marketing/` и т.д.

---

## Карта Wiki

| Раздел | Содержание |
|---|---|
| [architecture/](architecture/system.md) | Система целиком |
| [database/](database/tables.md) | Таблицы |
| [backend/](backend/README.md) | Модули бэкенда |
| [api/](api/overview.md) | HTTP / WS API |
| [games/](games/README.md) | Dice, Plinko, Crash |
| [promotion/](promotion/overview.md) | Бонусы, реферал, Campaign Engine |
| [security/](security/overview.md) | Сессии, кошелёк, антифрод |
| [marketing/](marketing/README.md) | Возможности платформы без кода |

---

## Что уже есть vs Planned

| Есть сейчас | Planned / Future |
|---|---|
| Dice, Plinko, Crash | Слоты, турниры, лидерборды |
| Deposit bonus (3 тира) | Reload / cashback как live-кампании |
| Customer referral FTD + edge share | Affiliate product, Admin CRUD кампаний |
| Campaign Engine (трекинг) | Сегментация, grant из кампании, Promotions UI |
| Wallet FOR UPDATE + pending hold | Горизонтальный multi-worker Crash |

Подробнее для бизнеса: [marketing/capabilities.md](marketing/capabilities.md).
