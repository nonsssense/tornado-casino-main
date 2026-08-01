# Sessions и Auth

## Что это

Вход через Telegram Mini App и cookie-сессия для API.

## Flow

```
POST /api/auth
  → проверить initData (HMAC bot token)
  → найти/создать user
  → PromotionManager.on_user_registered (invite start_param)
  → создать session_token cookie
```

Каждый защищённый endpoint: `prepareRequest` → cookie → user_id.

## Модули

- `database/auth.py` — validate/register  
- `database/session.py` — create/check/expiry  
- `telegram_auth.py` / helpers — разбор initData  

## Crash WebSocket

Auth **опционален**: без cookie сокет анонимный (публичный state), `my_bets` пустые.

## Planned

Отдельный OAuth вне Telegram — нет.
