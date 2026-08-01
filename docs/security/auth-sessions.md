# Auth и сессии

## Authentication

- Mini App передаёт Telegram `initData`.
- Сервер проверяет HMAC с bot token.
- Создаётся/находится `users` row.
- Выдаётся `session_token` cookie.

## Sessions

- Проверка на каждом API через `prepareRequest`.
- Idle/expiry — `database/session.py`.

## Crash WS

Может работать анонимно (публичный state). Личные `my_bets` требуют auth.

## Planned

Внешний OAuth, 2FA, device binding — нет.
