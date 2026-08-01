# API — обзор

Все пути относительно origin бэкенда.  
Auth по умолчанию: cookie `session_token` через `prepareRequest`, если не указано иное.

Подробности по группам:  
[auth.md](auth.md) · [wallet.md](wallet.md) · [games.md](games.md) · [bonus.md](bonus.md) · [crash.md](crash.md)

---

## Сводная таблица

| Method | Path | Auth | Назначение |
|---|---|---|---|
| GET | `/` | — | `index.html` |
| POST | `/api/auth` | Telegram initData | Логин / регистрация |
| GET/PUT | `/api/settings` | session | sound/haptic |
| POST | `/api/events` | session | UI analytics events |
| POST | `/api/debug/telegram` | DEBUG only | Launch probe (requires `DEBUG=true`) |
| POST | `/api/debug/launch` | DEBUG only | Launch timeline (requires `DEBUG=true`) |
| POST | `/api/games/rolldice` | session | Dice |
| GET | `/api/games/plinco/config` | session | Таблицы Plinko |
| POST | `/api/games/plinco` | session | Plinko 1 шар |
| POST | `/api/games/plinco/batch` | session | Plinko batch |
| GET | `/api/bonus/offers` | session | Каталог депозитных офферов |
| GET | `/api/bonus/active` | session | Активные бонусы |
| POST | `/api/bonus/select` | session | Выбор оффера (UI) |
| GET | `/api/wallet/balance` | session | REAL + BONUS |
| GET | `/api/wallet/history` | session | История tx |
| POST | `/api/wallet/deposit` | session | Создать депозит |
| GET | `/api/wallet/deposit/status` | session | Статус депозита |
| POST | `/api/wallet/withdraw` | session | Создать вывод |
| POST | `/api/payment/webhook` | BlockBee sig | Complete deposit |
| POST | `/crash/bet` | session | Ставка Crash |
| POST | `/crash/cashout` | session | Cashout |
| GET | `/crash/state` | session | Snapshot |
| GET | `/crash/history` | session | История множителей |
| WS | `/crash/ws` | optional | Live + STATE_SYNC |

## Чего нет (Planned)

- `/api/referral*` (claim/summary)
- `/api/campaign*` / promotions list
- `/api/freebet*`
- `/api/bonus/claim` (legacy FE мёртв)

Статика: `/static`, `/assets`, `/banners`, `/soundeffects`, `/app`.
