# API — Auth & settings

## POST `/api/auth`

| | |
|---|---|
| **Зачем** | Войти в Mini App |
| **Auth** | Telegram `initData` (HMAC) |
| **Input** | body с initdata (как ожидает handler) |
| **Эффект** | user upsert, session cookie, `on_user_registered` |
| **Errors** | 401 невалидный Telegram |

## GET `/api/settings` · PUT `/api/settings`

| | |
|---|---|
| **Зачем** | sound_enabled / haptic_enabled |
| **Auth** | session |
| **БД** | `user_settings` |

## POST `/api/events`

| | |
|---|---|
| **Зачем** | Запись UI-событий |
| **Auth** | session |
| **БД** | `user_events` |
