# База данных — таблицы

## Что это

Справочник основных таблиц PostgreSQL, которые использует бэкенд.

## Общие правила

- Денежные изменения кошелька идут через `WalletManager` + ledger `transactions`.
- Часть схем создаётся идемпотентно (`ensure_*_schema`), не только миграциями.
- Таблицы `fraud_signals`, `user_trust_score` отражены в metadata, но **промо-движком не используются**.

---

## Пользователи и сессии

### `users`
| | |
|---|---|
| **Назначение** | Игрок (Telegram) |
| **Ключевые поля** | id, telegram id/имя, `referrer_id` (write-once) |
| **Кто пишет** | `auth`, `user_db.referrerIdUpdate` |
| **Кто читает** | почти все модули |
| **Жизненный цикл** | создаётся при первом `/api/auth` |

### `user_sessions`
| | |
|---|---|
| **Назначение** | Cookie-сессии Mini App |
| **Ключевые поля** | token, user_id, expiry / idle |
| **Кто пишет** | `session.py` при auth |
| **Кто читает** | `prepareRequest` на каждом API |

### `user_settings`
| | |
|---|---|
| **Назначение** | sound / haptic |
| **API** | `GET/PUT /api/settings` |

### `user_events`
| | |
|---|---|
| **Назначение** | UI/lifecycle события (`app_open`, `game_open`, …) |
| **API** | `POST /api/events` |

---

## Кошелёк и ledger

### `wallet`
| | |
|---|---|
| **Назначение** | Балансы игрока |
| **Поля** | `real_balance`, `bonus_balance`, `pending_balance`, `selected_bonus_source` |
| **Инварианты** | CHECK ≥ 0 (ensure schema); UNIQUE user_id |
| **Мутации** | только `apply_balance_deltas` под `SELECT FOR UPDATE` |
| **Модули** | wallet, games, deposit, withdraw, bonus, referral |

### `transactions`
| | |
|---|---|
| **Назначение** | Ledger всех движений |
| **Поля** | user_id, wallet_id, balance_type, type, amount, balance_after, status, refs |
| **Кто пишет** | `TransactionManager` |

---

## Платежи

### `deposit`
| | |
|---|---|
| **Назначение** | Крипто-депозиты BlockBee |
| **Статусы** | pending → completed (идемпотентно под lock) |
| **После complete** | REAL credit + `on_deposit_confirmed` |

### `withdraws`
| | |
|---|---|
| **Назначение** | Заявки на вывод |
| **Статусы** | PENDING / PROCESSING / … |
| **Защита** | partial unique: один active PENDING/PROCESSING на user |
| **Hold** | при создании: REAL→PENDING |

### `withdrawal_addresses`
| | |
|---|---|
| **Назначение** | Сохранённые адреса вывода |

---

## Ставки и игры

### `bets`
| | |
|---|---|
| **Назначение** | Универсальная ставка (game, amount, result, profit) |
| **Игры** | dice, plinco, crash, … |

### `dice`
| | |
|---|---|
| **Назначение** | Детали раунда Dice + PF nonce |
| **Модуль** | `database/dice_db.py` |

### `plinco`
| | |
|---|---|
| **Назначение** | Раунды Plinko |

### `plinco_batches`
| | |
|---|---|
| **Назначение** | Идемпотентность batch-запросов Plinko |

### `crash`
| | |
|---|---|
| **Назначение** | Раунд Crash (seed hash, nonce; multiplier reveal после crash) |
| **Секрет** | multipier не публичен до ROUND_END |

### `crash_stats`
| | |
|---|---|
| **Назначение** | Ставка игрока в Crash-раунде (связка bet_id, result) |

---

## Бонусы и freebet

### `bonus_instances`
| | |
|---|---|
| **Назначение** | Выданный бонус (principal, wager, caps, status, expires) |
| **Sources сейчас** | в основном `deposit_tier_1/2/3` (live); welcome/promo/cashback — методы есть, **не wired** |
| **Модуль** | `BonusManager` |

### `frebet_grants` / `freebet_tickets`
| | |
|---|---|
| **Назначение** | Freebet-инфраструктура |
| **Статус** | код есть; **HTTP grant/play не открыт** → *Planned product* |

---

## Реферал

### `referral_profiles`
| | |
|---|---|
| **Назначение** | Профиль реферера (key, tier %, earnings, bounty day, freeze) |

### `referrals`
| | |
|---|---|
| **Назначение** | Связь referrer↔referred; `referred_id` UNIQUE; `qualified_at` |

### `referral_commissions`
| | |
|---|---|
| **Назначение** | Начисления edge-share (pending → available → claimed) |

---

## Campaign Engine

### `campaign`
| | |
|---|---|
| **Назначение** | Определение кампании |
| **Поля** | code, name, type, version, enabled, priority, start/ends, trigger, **config JSONB**, budget/spent |
| **Кто пишет** | `CampaignManager.create/update…` (пока без Admin UI) |

### `campaign_participations`
| | |
|---|---|
| **Назначение** | Участие игрока в кампании |
| **Поля** | status, progress, metadata, reward_id, timestamps |
| **Уникальность** | (campaign_id, user_id) |
| **Кто пишет** | `CampaignManager.handleEvent` (observe из PromotionManager) |

---

## Неиспользуемое / задел

| Таблица | Статус |
|---|---|
| `fraud_signals` | есть в schema reflection; промо не пишет |
| `user_trust_score` | то же |

---

## Связи (упрощённо)

```
users 1──1 wallet
users 1──* sessions, deposits, withdraws, bets, bonus_instances
users 1──1 referral_profiles (если реферер)
users *──* referrals (как referrer / referred)
campaign 1──* campaign_participations *──1 users
crash 1──* crash_stats *──1 bets
```
