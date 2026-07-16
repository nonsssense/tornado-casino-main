/**
 * Russian locale — default. Premium crypto-casino wording.
 */

export const ru = {
  brand: {
    name: 'Tornado',
  },

  common: {
    retry: 'Повторить',
    close: 'Закрыть',
    loading: 'Загрузка…',
    dialog: 'Диалог',
    emDash: '—',
    usd: 'USD',
    copy: 'Копировать',
    player: 'Игрок',
  },

  app: {
    title: 'Tornado',
  },

  auth: {
    error: {
      title: 'Не удалось войти',
      subtitle: 'Не получилось подтвердить ваш аккаунт. Закройте приложение и откройте его снова.',
    },
  },

  nav: {
    ariaLabel: 'Основная навигация',
    wallet: 'Кошелёк',
    referrals: 'Рефералы',
    casino: 'Казино',
    profile: 'Профиль',
  },

  header: {
    home: 'Главная',
    back: 'Назад к играм',
    profile: 'Профиль',
  },

  balance: {
    aria: {
      loading: 'Баланс загружается',
      open: 'Открыть баланс',
      deposit: 'Депозит',
    },
    overlay: {
      title: 'Баланс',
    },
    real: {
      title: 'Основной баланс',
    },
    bonus: {
      title: 'Бонусный баланс',
    },
    actions: {
      deposit: 'депозит',
      withdraw: 'вывод',
    },
  },

  home: {
    promo: {
      depositBonus: {
        alt: 'Бонус на депозит',
      },
    },
    games: {
      ariaLabel: 'Игры',
    },
    support: {
      ariaLabel: 'Поддержка Tornado',
    },
    theme: {
      dark: 'Тёмная тема',
      light: 'Светлая тема',
    },
    lang: {
      ariaLabel: 'Язык',
      ru: 'RU',
      en: 'EN',
    },
  },

  games: {
    dice: { name: 'Dice' },
    plinko: { name: 'Plinko' },
    crash: { name: 'Crash' },
    betAmount: 'Сумма ставки',
    bet: {
      min: 'Минимум',
      max: 'Максимум',
    },
    quickBets: {
      aria: 'Быстрый выбор ставки',
    },
    validation: {
      bet: 'Введите корректную сумму ставки',
    },
    error: {
      insufficient: 'Недостаточно средств. Пополните кошелёк.',
      generic: 'Не удалось завершить раунд. Попробуйте ещё раз.',
    },
  },

  wallet: {
    overlay: {
      title: 'Кошелёк',
    },
    tabs: {
      ariaLabel: 'Разделы кошелька',
      deposit: 'депозит',
      withdraw: 'вывод',
      history: 'история',
    },
    amount: {
      label: 'Сумма',
      placeholder: 'Введите сумму',
      max: 'MAX',
      maxAria: 'Использовать максимальную сумму',
    },
    coin: {
      usdt: 'USDT',
      btc: 'Bitcoin',
      eth: 'Ethereum',
      tron: 'Tron',
      sol: 'Solana',
      usdc: 'USDC',
    },
    network: {
      trc20: { label: 'TRC20', name: 'Сеть Tron' },
      erc20: { label: 'ERC20', name: 'Сеть Ethereum' },
      bep20: { label: 'BEP20', name: 'BNB Smart Chain' },
      solana: { label: 'Solana', name: 'Сеть Solana' },
      btc: { label: 'Bitcoin', name: 'Сеть Bitcoin' },
      ethereum: { label: 'Ethereum', name: 'Сеть Ethereum' },
      tron: { label: 'Tron', name: 'Сеть Tron' },
    },
    deposit: {
      addressLabel: {
        usdt_trc20: 'Постоянный адрес Tron (TRC20)',
        usdt_erc20: 'Постоянный адрес Ethereum (ERC20)',
        usdt_bep20: 'Постоянный адрес BNB Smart Chain (BEP20)',
        usdt_solana: 'Постоянный адрес Solana',
        btc_btc: 'Постоянный адрес Bitcoin',
        eth_ethereum: 'Постоянный адрес Ethereum',
        tron_tron: 'Постоянный адрес Tron',
        sol_solana: 'Постоянный адрес Solana',
        usdc_erc20: 'Постоянный адрес Ethereum (ERC20)',
        usdc_bep20: 'Постоянный адрес BNB Smart Chain (BEP20)',
        usdc_solana: 'Постоянный адрес Solana',
      },
      status: {
        open: 'Открыт',
        pending: 'Ожидание оплаты',
        confirming: 'Подтверждение',
        completed: 'Завершён',
      },
      disclaimer: 'Сумма ниже минимального депозита не будет зачислена. Для зачисления средств обратитесь в поддержку.',
      copy: 'Копировать',
      qr: 'QR',
      qrAlt: 'QR-код для депозита',
      minSum: 'мин. сумма: {amount}',
      minSumEmpty: 'мин. сумма: —',
      statusPrefix: 'Статус: {status}',
      error: {
        load: 'Не удалось загрузить адрес депозита.',
        unsupported: 'Валюта не поддерживается.',
        unavailable: 'Сервис депозита временно недоступен.',
        network: 'Выбранная сеть не поддерживается.',
        addressUnavailable: 'Адрес для этой сети недоступен. Выберите другую сеть.',
        retry: 'Не удалось загрузить адрес депозита. Попробуйте ещё раз.',
      },
      toast: {
        completed: 'Депозит зачислен',
        addressCopied: 'Адрес скопирован',
        copyFailed: 'Не удалось скопировать адрес',
        qrUnavailable: 'QR-код пока недоступен',
      },
    },
    withdraw: {
      addressPlaceholder: 'Введите адрес вашего криптокошелька',
      submit: 'Вывод',
      minAmount: 'мин. сумма: {amount}',
      validation: {
        amount: 'Введите корректную сумму',
      },
      toast: {
        success: 'Заявка на вывод отправлена',
      },
      error: {
        generic: 'Не удалось отправить заявку на вывод. Попробуйте ещё раз.',
        unavailable: 'Сервис вывода временно недоступен.',
        insufficient: 'Недостаточно средств для этого вывода.',
      },
    },
    history: {
      emptyTitle: 'История транзакций',
      emptyText: 'Транзакций пока нет',
      error: {
        load: 'Не удалось загрузить историю.',
        retry: 'Не удалось загрузить историю. Попробуйте ещё раз.',
      },
    },
    bonus: {
      state: {
        available: 'Доступен',
        active: 'Активен',
        done: 'Использован',
        expired: 'Истёк',
        forfeited: 'Аннулирован',
        upcoming: 'Скоро',
        selected: 'Выбран',
        none: 'Нет',
      },
      wager: '{n}× отыгрыш',
      expires: {
        none: 'Без срока',
        days: '{n} дн.',
      },
      tier: {
        generic: 'Депозитный бонус',
        nth: 'Депозит №{n}',
      },
      games: {
        allLow: 'Dice, Crash, Plinko LOW',
        dice: 'Dice',
        crash: 'Crash',
        plinko: 'Plinko',
        plinkoRisk: 'Plinko ({risk})',
      },
      maxBet: {
        pctCap: '{pct}% бонуса, до {amount}',
        upTo: 'До {amount}',
        terms: 'См. условия бонуса',
      },
      collapsed: {
        title: 'Депозитный бонус',
        tap: 'Нажмите, чтобы выбрать',
        loading: 'Загрузка бонусов…',
        unavailable: 'Депозитный бонус недоступен',
        locked: 'Все уровни использованы или недоступны',
      },
      empty: 'Для следующего депозита бонус недоступен.',
      listAria: 'Уровни депозитного бонуса',
      detail: {
        bonus: 'Бонус',
        who: 'Кому',
        wager: 'Отыгрыш',
        expires: 'Срок',
        maxBet: 'Макс. ставка',
        games: 'Игры',
        note: 'Примечание',
        noteValue: 'Только Plinko LOW. Неиспользованный бонус сгорает по истечении срока.',
        whoPlayers: 'Игроки при {ordinal} депозите',
        title: 'Бонус {pct}% к депозиту',
      },
      ordinal: {
        next: 'следующем',
        '1': '1-м',
        '2': '2-м',
        '3': '3-м',
        '4': '4-м',
        '5': '5-м',
        nth: '{n}-м',
      },
      aria: {
        show: 'Показать детали бонуса',
        hide: 'Скрыть детали бонуса',
        flipBack: 'Перевернуть карточку',
      },
      error: {
        tierUnavailable: 'Этот уровень депозитного бонуса недоступен.',
        loadFailed: 'Не удалось загрузить бонусы.',
      },
    },
  },

  profile: {
    overlay: {
      title: 'Профиль',
    },
    loading: 'Загрузка профиля',
    avatar: {
      ariaLabel: 'Область аватара',
    },
    menu: {
      personalData: 'личные данные',
      myBonuses: 'мои бонусы',
      referrals: 'рефералы',
    },
    fields: {
      status: { label: 'Статус', placeholder: 'Demo / Real / VIP' },
      nickname: { label: 'Никнейм', placeholder: 'Harry' },
      userId: { label: 'User ID', placeholder: '123456789' },
      email: { label: 'Email', placeholder: 'example@email.com' },
    },
  },

  dice: {
    target: 'Цель',
    targetAria: 'Целевое число',
    payout: {
      title: 'Потенциальный выигрыш',
      multiplier: 'Множитель',
      profit: 'Профит',
      payout: 'Выплата',
    },
    direction: {
      over: 'Больше',
      under: 'Меньше',
    },
    play: 'Крутить',
    wheel: {
      rollLabel: 'Бросок',
    },
    meta: {
      chance: 'Шанс ',
      profit: 'Профит ',
    },
    toast: {
      loseWithRoll: 'Без выигрыша — выпало {roll}',
      lose: 'Без выигрыша в этом раунде',
      failed: 'Раунд Dice не удался',
    },
  },

  plinko: {
    risk: 'Риск',
    rows: 'Ряды',
    play: 'Играть',
    riskLevel: {
      easy: 'Лёгкий',
      medium: 'Средний',
      high: 'Высокий',
    },
    toast: {
      winMeta: 'Plinko · {mult}×',
      returned: '{mult}× — возврат {usd}',
      failed: 'Раунд Plinko не удался',
      configFailed: 'Не удалось загрузить конфигурацию Plinko',
    },
    error: {
      config: 'Не удалось загрузить конфигурацию Plinko с сервера.',
      invalidPath: 'Сервер не вернул корректный путь шара',
    },
  },

  crash: {
    waiting: {
      title: 'Приём ставок',
      subtitle: 'Следующий раунд начнётся через',
      seconds: '{n} сек',
      secondsZero: '0 сек',
      aria: 'Ожидание раунда',
    },
    animation: {
      aria: 'Область анимации Crash',
    },
    betAmount: {
      label: 'Сумма ставки',
      increase: 'Увеличить ставку',
      decrease: 'Уменьшить ставку',
      quickAria: 'Быстрый выбор ставки',
    },
    action: {
      bet: 'СТАВКА',
      cashout: 'ЗАБРАТЬ',
    },
    autoCashout: {
      auto: 'Авто',
      cashOut: 'Кэшаут',
      aria: 'Автокэшаут',
    },
    liveBets: {
      title: 'Живые ставки',
      empty: 'Ставок пока нет',
      aria: 'Живые ставки',
    },
    history: {
      aria: 'Недавние множители',
    },
    panels: {
      aria: 'Панели ставок',
    },
    toast: {
      betsClosed: 'Приём ставок закрыт',
      alreadyBet: 'У вас уже есть активная ставка',
      betPlaced: 'Ставка принята',
      betFailed: 'Не удалось сделать ставку',
      cashoutUnavailable: 'Кэшаут сейчас недоступен',
      cashoutFailed: 'Не удалось сделать кэшаут',
      loadFailed: 'Не удалось загрузить Crash',
    },
    error: {
      sync: 'Не удалось синхронизировать Crash',
      session: 'Сессия истекла. Перезагрузите приложение.',
      unreachable: 'Crash API недоступен. Проверьте, что сервер запущен.',
      conflict: 'Действие сейчас недоступно.',
      generic: 'Не удалось выполнить действие в Crash. Попробуйте ещё раз.',
      invalidState: 'Некорректное состояние Crash с сервера',
    },
  },

  toast: {
    win: {
      title: 'Вы выиграли',
    },
    dismiss: 'Закрыть уведомление',
  },
};
