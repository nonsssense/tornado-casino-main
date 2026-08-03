# Архитектура фронтенда Tornado

**Для кого:** владелец проекта (не обязательно фронтенд‑разработчик).  
**Цель:** понять, как устроен интерфейс Mini App, где что лежит, какие есть скрытые процессы, и уверенно ориентироваться в коде.  
**Стек:** Vanilla JavaScript (без React/Vue), CSS, Vite, Telegram WebApp SDK.  
**Точка входа:** `index.html` → `static/src/app/main.js`.

> Документ описывает **текущее** состояние репозитория. Планируемые, но не работающие вещи помечены как *заготовка*.

---

## 1. Обзор фронтенда

### Что это за приложение

Tornado — **SPA (Single Page Application)** внутри Telegram Mini App.

- Пользователь открывает приложение из Telegram.
- Браузер один раз загружает HTML‑оболочку.
- Дальше JavaScript сам меняет экраны **без полной перезагрузки страницы**.
- Все запросы к серверу идут на тот же домен (`/api/...`, `/crash/...`).

### Стек

| Часть | Технология | Простыми словами |
|---|---|---|
| Язык UI | JavaScript (ES modules) | Обычный JS, без фреймворка |
| Сборка | Vite | Собирает файлы для продакшена |
| Стили | CSS (foundation + страницы) | Дизайн‑токены и компоненты |
| Telegram | `telegram-web-app.js` | Официальный SDK Mini App |
| Связь с сервером | `fetch` + cookie | Сессия в HttpOnly cookie |
| Crash live | WebSocket | Живой мультипликатор раунда |

### Модель отрисовки

Фронтенд **сам создаёт HTML через JavaScript** (`createElement`), а не через шаблоны React.

Слои ответственности:

```
Экраны / оверлеи (DOM)
        ↓ вызывают
Сервисы (состояние + бизнес‑оркестрация)
        ↓ вызывают
API‑слой (только HTTP)
        ↓
Бэкенд FastAPI
```

**Важно:** деньги, ставки, бонусы и выводы **считает сервер**. Фронтенд показывает UI и отправляет запросы.

### Жизненный цикл (кратко)

1. Загрузка `index.html`
2. Подключение Telegram SDK
3. Запуск `bootstrap()` в `main.js`
4. Сразу рисуется «оболочка» приложения (шапка + нижнее меню)
5. Тихая авторизация через Telegram `initData`
6. Подгрузка баланса и настроек
7. Пользователь видит Home и может открывать игры / кошелёк / профиль

Splash‑экран с маркетинговыми текстами **удалён** — приложение стартует сразу в обычный UI.

---

## 2. Карта папок

### Корень фронтенда

```
casinobot/
├── index.html                 # HTML‑оболочка (точка входа браузера)
├── vite.config.js             # Настройки сборки / dev‑прокси
├── package.json               # Скрипты npm (dev/build)
├── assets/                    # Картинки бренда и иконок (отдаёт бэкенд)
├── banners/                   # Баннеры игр
├── soundeffects/              # Звуки выигрыша
└── static/
    ├── src/                   # ★ Весь живой фронтенд‑код
    ├── styles/                # ★ Все CSS
    ├── scripts/               # Старый код (не точка входа)
    └── assets/                # Доп. статика (редко используется)
```

### `static/src/` — что где лежит

| Папка | Назначение | Что туда кладут | Чего там быть не должно |
|---|---|---|---|
| `app/` | Старт приложения | bootstrap, оболочка, Telegram‑мост, ошибки auth | Логика игр / кошелька |
| `router/` | Навигация по экранам | маршруты, history, контроллеры страниц | Прямые HTTP‑запросы |
| `pages/` | Полноэкранные страницы | Home, Dice, Plinko, Crash, Bonuses | Долгая бизнес‑логика (её в services) |
| `overlays/` | Всплывающие панели | Wallet, Profile, Referrals, Balance | Отдельные «скрытые» страницы без UI |
| `features/` | Крупные фичи UI | wallet views, referrals modal, welcome | Низкоуровневый fetch |
| `components/` | Переиспользуемые кирпичи | Button, Input, Header, Toast | Знание о конкретном API |
| `services/` | Оркестрация | auth, balance, wallet, crash, bonus… | Создание DOM |
| `api/` | HTTP‑клиенты | функции `fetchDeposit`, `rollDice`… | UI и анимации |
| `games/` | Игровые движки UI | dice/plinko/crash визуал + управление | Прямой доступ к cookie |
| `i18n/` | Переводы | `ru.js`, `en.js` | Секреты / токены |
| `utils/` | Утилиты | format, dom, assets paths | Скрытая бизнес‑логика |
| `animations/` | Простые переходы | fade / layer helpers | Сеть / платежи |
| `legacy/` | Старый код | архив предыдущей версии | **Не используется живым приложением** |

### `static/styles/`

| Папка / файл | Назначение |
|---|---|
| `foundation.css` | Главный вход стилей (импортируется из `main.js`) |
| `tokens.css` | Цвета, отступы, шрифты |
| `base.css` / `utilities.css` | Базовая разметка |
| `components/*.css` | Стили кнопок, модалок, шапки, меню |
| `pages/*.css` | Стили конкретных экранов (home, dice, wallet…) |
| `main.css` | Старые ambient‑стили (не основной вход) |

### Медиа

| Папка | Назначение |
|---|---|
| `/assets/` | Логотипы, иконки монет, баннеры бонусов |
| `/banners/` | Карточки игр на Home |
| `/soundeffects/` | WAV для Dice / Plinko |

---

## 3. Точки входа — кто кого вызывает

### Порядок запуска

```
1. Браузер открывает index.html
2. Подключается Telegram SDK (telegram.org)
3. Inline‑скрипт: Telegram.WebApp.ready()  (если есть сессия)
4. Загружается module: static/src/app/main.js
5. main.js сразу вызывает bootstrap()
6. bootstrap:
     notifyTelegramReady()
     initDisableDoubleTapZoom()
     initDismissKeyboardOnOutsideTap()
     initI18n()
     mountShellFirst()  → shell + router.init()
     hydrateAfterAuth() → initAuth() → баланс/настройки/welcome
```

### Файлы‑стартеры

| Файл | Роль |
|---|---|
| `index.html` | Пустой `#app-root`, шрифты, Telegram SDK, вход в `main.js` |
| `static/src/app/main.js` | Единственный живой bootstrap |
| `static/src/app/shell.js` | Рисует каркас: шапка + контент + нижнее меню |
| `static/src/router/index.js` | Решает, какую страницу показать |
| `static/src/app/telegram.js` | Достаёт `initData`, BackButton, haptic |
| `static/src/services/auth.service.js` | Тихий логин `POST /api/auth` |

**Кто первый:** HTML → Telegram SDK → `main.js` → оболочка → auth → данные.

---

## 4. Полный поток запуска

```
  Браузер / Telegram WebView
              │
              ▼
         index.html
              │
              ├── Telegram SDK (telegram-web-app.js)
              │         └── early WebApp.ready()
              │
              ▼
     static/src/app/main.js
              │
              ▼
          bootstrap()
              │
     ┌────────┴────────┐
     ▼                 ▼
 Telegram ready    i18n + title
     │
     ▼
 mountAppShell()  ← сразу виден каркас UI
     │
     ▼
 router.init()    ← Home (или ?route=…)
     │
     ▼
 initAuth()
     │  Telegram initData
     ▼
 POST /api/auth  → cookie session_token
     │
     ├─→ GET /api/settings   (фоном)
     ├─→ GET /api/wallet/balance (фоном)
     └─→ Welcome modal (если сервер сказал show=true)
              │
              ▼
        Приложение готово
```

Если auth не удался:

```
initAuth() упал
   → показать экран ошибки (auth-error.js)
   → кнопка «Повторить» снова вызывает bootstrap()
```

Если сессия истекла (HTTP 401):

```
request.js → событие session:expired
   → сброс shell
   → экран ошибки auth
```

---

## 5. Ответственности папок (детали)

### `static/src/app/`

| Файл | Зачем |
|---|---|
| `main.js` | Старт всего приложения |
| `shell.js` | Каркас UI |
| `telegram.js` | Мост к Telegram |
| `auth-error.js` | Экран «не удалось войти» |
| `config.js` | Константа `apiBasePath: '/api'` (почти пустой конфиг) |
| `disable-double-tap-zoom.js` | Блокирует дабл‑тап зум на iOS |
| `dismiss-keyboard.js` | Скрывает клавиатуру по тапу вне поля |

### `static/src/router/`

| Файл | Зачем |
|---|---|
| `index.js` | Навигация, history, привязка кнопок шапки/меню |
| `routes.js` | Список маршрутов + lazy‑import страниц |
| `route-names.js` | Имена: `home`, `dice`, `plinko`, `crash`, `bonuses`… |
| `route-controller.js` | Контракт страницы: load/activate/deactivate/destroy |

**Маршруты (страницы):** Home, Dice, Plinko, Crash, Bonuses, Bonus Detail.  
**Не маршруты, а оверлеи:** Wallet, Profile, Referrals, Balance.

### `static/src/api/`

Только HTTP. Не рисует UI.

### `static/src/services/`

Держат кэш/подписки и вызывают `api/`. Не рисуют DOM.

### `static/src/pages/` vs `features/` vs `overlays/`

- **pages** — полноэкранный экран, которым управляет router.
- **overlays** — выезжающая панель поверх текущего экрана.
- **features** — содержимое фичи (например вкладки депозита), которое вставляют оверлеи/страницы.

---

## 6. Карта модулей

### Кошелёк (Wallet)

| Что | Где |
|---|---|
| Открытие | Нижнее меню «Wallet» → `overlayManager.openWallet()` |
| UI | `features/wallet/*`, `overlays/wallet.overlay.js` |
| Сервис | `services/wallet.service.js`, `balance.service.js` |
| API | `/api/wallet/deposit`, `/withdraw`, `/balance`, `/history`, статусы |

Экраны внутри: **Deposit / Withdraw / History**.  
Есть переключатель метода **Cryptocurrency | Bank** (Bank — «скоро»).

### Игры

| Игра | Страница | Движок UI | API |
|---|---|---|---|
| Dice | `pages/dice.page.js` | `games/dice/` | `POST /api/games/rolldice` |
| Plinko | `pages/plinko.page.js` | `games/plinko/` | `POST /api/games/plinco` (+ batch, config) |
| Crash | `pages/crash.page.js` | `games/crash/` | `/crash/state`, `/bet`, `/cashout` + WS `/crash/ws` |
| Roulette | `games/roulette/` | *заготовка* | **не подключена к router** |

### Профиль

Оверлей `overlays/profile.overlay.js` → `features/profile/profile.modal.js`.  
Данные собирает `profile.service.js` из auth + balance + referrals.

### Рефералы

Оверлей `referrals` + детали статуса.  
API: `/api/referrals/summary`, `/status`, `/claim`.  
Контакт партнёрки: `https://t.me/TornadoSupport`.

### Бонусы

- Страницы `bonuses` / `bonus-detail` (из профиля).
- Депозитные офферы внутри Wallet (`bonus.service.js`).
- Каталог: `/api/bonuses/catalog`.
- Кампании: `/api/campaigns`.

### Welcome

После первого входа сервер может вернуть `welcome.show=true`.  
`welcome.modal.js` показывает модалку; «Claim» открывает депозит.

### Настройки / звук / haptic

`settings.service.js` ↔ `/api/settings`.  
`sound.service.js` проигрывает `/soundeffects/*.wav`.  
Haptic — через Telegram API, с учётом настройки пользователя.

### Локализация

`i18n/` — русский по умолчанию, английский.  
Выбор языка хранится в `localStorage` ключе `tornado.locale`.

### Навигация

Нижнее меню:

| Кнопка | Что открывает |
|---|---|
| Casino | страница Home |
| Wallet | оверлей кошелька |
| Profile | оверлей профиля |
| Referrals | оверлей рефералов |

---

## 7. API‑слой фронтенда

Все запросы идут через `static/src/api/request.js`:

- `credentials: 'include'` (cookie сессии),
- JSON,
- при **401** — событие `session:expired`.

### Список эндпоинтов

| Функция (файл) | Метод | URL | Зачем | Когда |
|---|---|---|---|---|
| `authenticate` (`auth.js`) | POST | `/api/auth` | Войти по Telegram initData | Старт приложения |
| `dismissWelcome` (`welcome.js`) | POST | `/api/welcome/dismiss` | Закрыть welcome | После welcome |
| `fetchBalance` (`wallet.js`) | GET | `/api/wallet/balance` | Балансы | После auth, после игр/депозитов |
| `createDeposit` | POST | `/api/wallet/deposit` | Адрес депозита | Выбор сети в Deposit |
| `fetchDepositMinimum` | GET | `/api/wallet/deposit/minimum` | Мин. сумма | Deposit |
| `fetchDepositStatus` | GET | `/api/wallet/deposit/status` | Статус платежа | Polling после создания адреса |
| `fetchWithdrawMinimum` | GET | `/api/wallet/withdraw/minimum` | Мин. вывод | Withdraw |
| `submitWithdraw` | POST | `/api/wallet/withdraw` | Заявка на вывод | Кнопка вывода |
| `fetchHistory` | GET | `/api/wallet/history` | История | Вкладка History |
| `rollDice` (`games.js`) | POST | `/api/games/rolldice` | Ставка Dice | Play |
| `playPlinko` | POST | `/api/games/plinco` | Ставка Plinko | Play |
| `playPlinkoBatch` | POST | `/api/games/plinco/batch` | Пачка шаров | Auto/batch |
| `fetchPlinkoConfig` | GET | `/api/games/plinco/config` | Таблицы множителей | Открытие Plinko |
| `fetchCrashState` (`crash.js`) | GET | `/crash/state` | Состояние раунда | Вход в Crash |
| `fetchCrashHistory` | GET | `/crash/history` | История крашей | Crash UI |
| `placeCrashBet` | POST | `/crash/bet` | Ставка | Crash |
| `cashoutCrash` | POST | `/crash/cashout` | Кешаут | Crash |
| WebSocket (`crash.service`) | WS | `/crash/ws` | Live multiplier | Пока открыт Crash |
| `fetchBonusOffers` (`bonus.js`) | GET | `/api/bonus/offers` | Офферы депозита | Deposit bonus UI |
| `fetchActiveBonuses` | GET | `/api/bonus/active` | Активные бонусы | Bonus UI |
| `selectBonusOffer` | POST | `/api/bonus/select` | Выбор оффера | Deposit |
| `fetchBonusCatalog` | GET | `/api/bonuses/catalog` | Каталог «Мои бонусы» | Страница bonuses |
| `fetchBonusCatalogItem` | GET | `/api/bonuses/catalog/{id}` | Карточка бонуса | bonus-detail |
| `fetchCampaigns` | GET | `/api/campaigns` | Кампании | Bonuses board |
| `fetchCampaignDetail` | GET | `/api/campaigns/{id}` | Детали кампании | По необходимости |
| `fetchReferralSummary` | GET | `/api/referrals/summary` | Сводка рефералов | Referrals overlay |
| `fetchReferralStatus` | GET | `/api/referrals/status` | Статусы/тиражи | Status info |
| `claimReferralEarnings` | POST | `/api/referrals/claim` | Забрать награды | Кнопка claim |
| `fetchSettings` / `updateSettings` | GET/PUT | `/api/settings` | Звук/haptic | Старт / смена настроек |
| `trackClientEvent` (`events.js`) | POST | `/api/events` | Аналитика событий | app_open / page_nav / game_open/close |

### Заготовки (HTTP пока нет)

- `api/profile.js` — будущий `GET /api/profile`
- `api/freebet.js` — будущие freebet‑эндпоинты

### Внешние URL (не ваш бэкенд)

| URL | Где | Зачем |
|---|---|---|
| `https://telegram.org/js/telegram-web-app.js` | `index.html` | SDK |
| Google Fonts | `index.html` | Шрифт Inter |
| `https://api.qrserver.com/...` | Deposit QR | Картинка QR по адресу |
| `https://t.me/TornadoSupport` | Support / Referrals | Связь с поддержкой |
| `mailto:support@tornado.casino` | SupportModal | Почта поддержки |

---

## 8. Управление состоянием

Фронтенд **без Redux/MobX**. Состояние — модульные синглтоны в `services/`.

```
┌─────────────────── В браузере ───────────────────┐
│                                                  │
│  auth.service        authUser, welcomePayload    │
│  balance.service     кэш балансов + анимация     │
│  settings.service    sound/haptic                │
│  bonus.service       офферы / выбранный бонус    │
│  referral.service    summary/status cache        │
│  crash.service       WebSocket + reconnect       │
│  sound.service       аудио‑буферы                │
│                                                  │
│  localStorage        tornado.locale              │
│                      crash.panel-assignments.v1  │
│  sessionStorage      Telegram __telegram__…      │
│                      (пишет SDK Telegram)        │
│  cookie              session_token (HttpOnly,    │
│                      ставит СЕРВЕР, не JS)       │
└──────────────────────────────────────────────────┘
```

### Что важно владельцу

1. **Секрет сессии недоступен JavaScript** (HttpOnly cookie).
2. Баланс на экране — кэш; истина на сервере.
3. Игры могут «ставить на паузу» отображение баланса на время анимации, затем показывают подтверждённый результат.
4. При уходе со вкладки staged‑баланс сбрасывается в актуальное значение.

---

## 9. Типовые пользовательские потоки

### Вход (Login)

```
Открытие Mini App
 → getTelegramContext() достаёт initData
 → POST /api/auth
 → сервер ставит cookie
 → рисуется Home + баланс
```

Нет формы логина/пароля.

### Депозит

```
Меню Wallet → вкладка Deposit
 → выбор монеты/сети
 → POST /api/wallet/deposit
 → показать адрес + QR
 → polling GET .../deposit/status
 → при успехе обновить баланс / бонус
```

### Вывод

```
Wallet → Withdraw
 → ввод суммы и адреса
 → POST /api/wallet/withdraw
 → Toast об успехе/ошибке
```

### Dice / Plinko

```
Home → карточка игры → route dice/plinko
 → пользователь жмёт Play
 → game.service → POST /api/games/...
 → анимация
 → balance.service показывает новый баланс
 → (опционально) звук / haptic
```

### Crash

```
route crash
 → crash.service.connect() → WebSocket /crash/ws
 → live multiplier на экране
 → bet / cashout через HTTP
 → при уходе со страницы сокет отключается
```

### Профиль / Рефералы

```
Нижнее меню → overlay
 → сервис тянет данные API
 → UI показывает карточки / кнопки
 → copy link / claim / открыть поддержку
```

---

## 10. Как общаются компоненты

```
BottomNavigation click
        │
        ▼
  router / overlayManager
        │
        ▼
  page или feature (DOM)
        │ callback / await
        ▼
     service.method()
        │
        ▼
     api.function()
        │ fetch
        ▼
      Backend
        │ JSON
        ▼
 service обновляет кэш
        │ notify listeners
        ▼
  Header / Modal перерисовывает цифры
```

Способы связи:

| Способ | Пример |
|---|---|
| Прямой import | page импортирует service |
| Callbacks | `onSelect`, `onClaim` в модалках |
| CustomEvent | `session:expired` |
| Подписки | `balanceService.subscribeReal(...)` |
| Dynamic import | игры и оверлеи грузятся лениво |
| DOM events | click/touch на кнопках |

---

## 11. Поиск скрытой логики (security‑oriented)

Ниже — всё автоматическое / потенциально «подозрительное» и **зачем оно нужно**.

### Запускается само при старте

| Что | Где | Зачем |
|---|---|---|
| `bootstrap()` | `main.js` | Нормальный старт приложения |
| `Telegram.WebApp.ready()` | `index.html` + `telegram.js` | Сказать Telegram, что UI готов |
| Слушатель `session:expired` | `main.js` | Показать ошибку при 401 |
| Double‑tap zoom block | `disable-double-tap-zoom.js` | UX в iOS WebView |
| Dismiss keyboard | `dismiss-keyboard.js` | UX ввода суммы |

### Таймеры / интервалы

| Где | Зачем |
|---|---|
| `telegram.js` poll 50ms до 5s | Дождаться позднего `initData` из hash |
| `wallet.service` deposit poll | Узнать, пришли ли деньги |
| `crash.service` reconnect timeout | Переподключить WS |
| `crash.game` betting timer | UI таймер фазы ставок |
| Toast / bottom‑sheet / анимации | Короткий UX‑тайминг |
| `crash.live-bets.mock.js` | Визуальный mock ленты ставок (*не серверные деньги*) |

### Слушатели событий

Обычные UI‑слушатели click/touch/keydown на кнопках, оверлеях, селекторах монет.  
Глобальные:

| Событие | Где | Зачем |
|---|---|---|
| `popstate` | router | Кнопка «Назад» браузера |
| `hashchange` | telegram.js | Поздний Telegram hash |
| `visibilitychange` / `pagehide` | balance / crash | Не оставлять «зависший» UI баланс / сокет |
| `session:expired` | main.js | Разлогин по 401 |

### Сокеты

| Что | Где | Зачем |
|---|---|---|
| `WebSocket /crash/ws` | `crash.service.js` | Live Crash — **единственный сокет** |

### Popups / навигация

| API | Где | Зачем |
|---|---|---|
| `window.open` | SupportModal, referrals | Открыть t.me поддержки/ссылку |
| `location.href = mailto:` | SupportModal | Написать на почту |
| `history.pushState/replaceState` | router | SPA‑навигация `?route=` |

### Хранилище

| Хранилище | Ключ / что | Зачем |
|---|---|---|
| localStorage | `tornado.locale` | Язык интерфейса |
| localStorage | `crash.panel-assignments.v1` | Раскладка панелей Crash UI |
| sessionStorage | `__telegram__initParams` | Пишет SDK Telegram (чтение initData) |
| cookie | `session_token` | Ставит **сервер**, JS только отправляет |

### Clipboard

Копирование: адрес депозита, реферальная ссылка, контакты поддержки.  
Пользователь сам нажимает «Copy».

### Dynamic import

Ленивая загрузка тяжёлых кусков: игры, оверлеи, welcome‑модалка.  
Это оптимизация размера бандла, не скрытый код.

### Чего **нет**

| Технология | Статус |
|---|---|
| `eval` / `new Function` | Не найдено в живом `static/src` |
| Service Worker | Нет |
| Web Worker | Нет |
| BroadcastChannel | Нет |
| `postMessage` (кросс‑окно) | Нет |
| iframe | Нет в прод‑UI |
| MutationObserver / IntersectionObserver | Не используются для скрытой логики |
| `navigator.permissions` | Нет |
| Скрытые admin‑страницы во фронте | Нет |

### Legacy / мёртвый код (важно для аудита)

Эти папки **не подключены** к `index.html` / `main.js`, но лежат в репозитории:

| Путь | Комментарий |
|---|---|
| `static/src/legacy/` | Старое SPA |
| `static/scripts/` | Ещё более старый монолит |
| `scripts/app.js`, `scripts/api.js`… | Dev/preview копии |
| `games/roulette/` | Заготовка, нет маршрута |
| `api/freebet.js`, `api/profile.js` | Пустые заготовки |
| `balance-type.service.js`, `freebet.service.js` | Подготовлены, но не влияют на серверные ставки |

Рекомендация владельцу: позже решить, удалять legacy или оставить как архив — **на работу Mini App они не влияют**, пока вход остаётся через `main.js`.

---

## 12. Аудит секретов на фронтенде

### Проверено поиском

| Категория | Результат |
|---|---|
| Private keys / mnemonic / seed phrase | **Нет** (слова `seed` на бэкенде = Provably Fair, не seed‑фразы кошелька) |
| API secrets / BOT_TOKEN во фронте | **Нет** |
| Hardcoded passwords / admin credentials | **Нет** |
| Debug backdoors / скрытые admin pages | **Нет** |
| Feature flags‑ловушки | Только пустой `APP_CONFIG.apiBasePath` |

### Что есть публично (это нормально, не секреты)

- Публичные URL поддержки (`t.me/TornadoSupport`, `support@tornado.casino`)
- Пути к картинкам `/assets/...`
- Имена API‑путей `/api/...`

### Что НЕ должно попасть во фронт (и не попало)

Секреты BlockBee, `BOT_TOKEN`, строки БД — живут в `.env` / Python `config.py`, отдаются только серверу.

### Legacy caution

`static/src/legacy/api.js` содержит `http://localhost:8000/api/event` — это **старый неиспользуемый** код, не продакшен‑вход.

---

## 13. Архитектурная диаграмма

```
┌──────────────┐     initData / UI     ┌─────────────────────┐
│   Telegram   │◄─────────────────────►│  Browser / WebView  │
│   (клиент)   │                        │  index.html         │
└──────────────┘                        └──────────┬──────────┘
                                                   │
                                                   ▼
                                        ┌─────────────────────┐
                                        │  Frontend SPA       │
                                        │  static/src         │
                                        │                     │
                                        │  app/main.js        │
                                        │    ├─ shell         │
                                        │    ├─ router        │
                                        │    ├─ overlays      │
                                        │    ├─ pages/games │
                                        │    ├─ services      │
                                        │    └─ api/request   │
                                        └──────────┬──────────┘
                              HTTPS same-origin    │
                     /api/*  /crash/*  /assets/*   │
                                                   ▼
                                        ┌─────────────────────┐
                                        │  FastAPI backend    │
                                        │  main.py + crash    │
                                        └──────────┬──────────┘
                                                   │
                                                   ▼
                                        ┌─────────────────────┐
                                        │  PostgreSQL         │
                                        └─────────────────────┘

Внешние сервисы (с сервера, не из браузера UI-логики):
  BlockBee (платежи), Binance rates (конвертация)
Внешние из браузера:
  Telegram SDK, Google Fonts, QR Server, t.me links
```

---

## 14. Гид «Хочу изменить…»

| Хочу изменить… | Откройте сначала |
|---|---|
| Старт приложения / порядок загрузки | `index.html`, `static/src/app/main.js` |
| Шапка / нижнее меню | `app/shell.js`, `components/shared/Header.js`, `BottomNavigation.js`, `router/index.js` |
| Home (карточки игр) | `pages/home.page.js`, `styles/pages/home.css` |
| Dice | `pages/dice.page.js`, `games/dice/`, `api/games.js`, `services/game.service.js` |
| Plinko | `pages/plinko.page.js`, `games/plinko/`, `api/games.js`, `api/plinko.config.js` |
| Crash | `pages/crash.page.js`, `games/crash/`, `api/crash.js`, `services/crash.service.js` |
| Депозит | `features/wallet/deposit.view.js`, `services/wallet.service.js`, `api/wallet.js` |
| Вывод | `features/wallet/withdraw.view.js` |
| История операций | `features/wallet/history.view.js` |
| Баланс в шапке | `services/balance.service.js`, `components/shared/Balance.js` |
| Профиль | `overlays/profile.overlay.js`, `features/profile/profile.modal.js` |
| Рефералы | `features/referrals/`, `services/referral.service.js` |
| Бонусы (страница) | `pages/bonuses.page.js`, `features/bonuses/`, `services/bonus-catalog.service.js` |
| Бонус на депозите | `features/wallet/deposit.bonus-*.js`, `services/bonus.service.js` |
| Welcome после регистрации | `features/welcome/welcome.modal.js`, `services/auth.service.js` |
| Поддержка | `components/shared/SupportModal.js` |
| Тексты / перевод | `i18n/locales/ru.js`, `en.js` |
| Тема / цвета | `styles/tokens.css` |
| Кнопки / инпуты | `components/base/Button.js`, `Input.js` + CSS в `styles/components/` |
| Модалки / bottom sheet | `overlays/bottom-sheet.js`, `components/base/Modal.js` |
| Авторизация | `services/auth.service.js`, `api/auth.js`, `app/telegram.js` |
| Любой HTTP‑запрос | `api/request.js` + нужный файл в `api/` |
| Звук | `services/sound.service.js`, `soundeffects/` |
| Настройки звука/вибрации | `services/settings.service.js` |

---

## 15. Инвентарь фронтенда

### Главные входы

- `index.html`
- `static/src/app/main.js`
- `vite.config.js`

### Главные модули

- Auth, Shell, Router
- Wallet (deposit/withdraw/history)
- Games: Dice, Plinko, Crash
- Profile, Referrals, Bonuses, Welcome
- i18n, Settings, Sound, Tracking

### Главные сервисы

`auth`, `balance`, `wallet`, `game`, `crash`, `profile`, `bonus`, `bonus-catalog`, `campaign`, `referral`, `settings`, `sound`, `tracking`, (+ заготовки `freebet`, `balance-type`)

### Главные утилиты

`utils/dom.js`, `format.js`, `assets.js`, `wallet.constants.js`, `hydrate.js`, `constants.js`

### Стили

`styles/foundation.css` → tokens/base/components/pages

### Ассеты

`/assets/*`, `/banners/*`, `/soundeffects/*`

### Не использовать как живой код

`static/src/legacy/**`, `static/scripts/**`, корневые `scripts/app.js` и аналоги

---

## 16. Trust Report (отчёт доверия)

### Можно ли владельцу понять фронтенд по этому документу?

**Да**, для целей навигации, аудита и контроля «нет ли сюрпризов».  
Документ покрывает вход, папки, API, состояние, автопроцессы и секреты.

### Есть ли файлы с неясной целью?

| Файл / зона | Вердикт |
|---|---|
| `app/config.js` | Почти пустой конфиг — безвреден |
| `games/roulette/` | Заготовка, не в меню |
| `api/freebet.js`, `api/profile.js` | Пустые заготовки |
| `balance-type.service.js` | Подготовка UI типа баланса, на сервер не влияет |
| `crash.live-bets.mock.js` | Визуальный mock ленты, не платёжный бэкдор |
| `static/src/legacy/**` | Старый код — **стоит позже удалить или явно пометить архивом** |

### Подозрительные модули?

**Отдельного вредоносного модуля не найдено.**  
Самые «чувствительные» легитимные места:

1. Кошелёк (адреса, QR, clipboard)
2. Crash WebSocket
3. Support/Referral `window.open` на Telegram
4. Внешний QR‑сервис

### Неожиданные автоматические процессы?

Только ожидаемые:

- авто‑login через Telegram,
- фоновая подгрузка баланса/настроек,
- polling статуса депозита,
- reconnect Crash WS,
- аналитические `POST /api/events`.

Нет скрытых редиректов, нет service worker, нет eval, нет скрытых iframe.

### Скрытая бизнес‑логика?

Критические правила денег (мин. депозит, бонусы, выплаты, fairness) — **на бэкенде**.  
Фронтенд может показывать UX‑ограничения, но не является источником истины.

### Что проверить позже (техдолг, не инцидент)

1. Удалить или изолировать `legacy/` и старые `static/scripts/`.
2. Решить судьбу Roulette / freebet заготовок.
3. По возможности генерировать QR на своём домене (сейчас `api.qrserver.com`).
4. Не путать docs‑упоминания «Provably Fair» с splash‑маркетингом (splash уже удалён).

---

## Краткий вывод для владельца

```
Живой фронтенд = index.html + static/src/** (кроме legacy) + static/styles/**
Всё остальное в static/scripts и legacy — архив.

Старт прозрачный: HTML → Telegram → bootstrap → shell → auth → UI.
Деньги и ставки подтверждает сервер.
Секретов во фронтенде нет.
Скрытых admin/backdoor путей нет.
```

Если нужно углубиться в **бэкенд** (кошелёк, платежи, сессии), смотрите `docs/architecture.md`, `docs/backend.md` и разделы в `docs/README.md`.
