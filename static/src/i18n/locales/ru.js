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

  guest: {
    name: 'Guest',
    actions: {
      openTelegram: 'Открыть Telegram',
    },
    modal: {
      title: 'Требуется вход через Telegram',
      message: 'Чтобы делать ставки и пользоваться балансом, откройте Tornado через Telegram.',
    },
    notice: {
      default: 'Войдите через Telegram, чтобы пользоваться этой функцией.',
    },
    deposit: {
      message: 'Для получения адреса пополнения необходимо открыть Tornado через Telegram.',
    },
    withdraw: {
      message: 'Для вывода средств необходимо открыть Tornado через Telegram.',
    },
    history: {
      message: 'История доступна после входа через Telegram.',
    },
    profile: {
      message: 'Войдите через Telegram для доступа к профилю.',
    },
    referrals: {
      message: 'Реферальная ссылка и начисления доступны после входа через Telegram.',
      linkPlaceholder: 'Войдите через Telegram',
    },
    balance: {
      locked: '—',
      message: 'Баланс доступен после входа через Telegram.',
    },
    bonuses: {
      message: 'Бонусы доступны после входа через Telegram.',
    },
    crash: {
      placeholder: 'Live Crash доступен в Telegram Mini App.',
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
    withdrawable: {
      title: 'К выводу',
    },
    wagerRemaining: {
      title: 'Осталось отыграть',
    },
    welcome: {
      active: 'Welcome Bonus в процессе',
      expires: 'До {date}',
      progress: '{percent}% готово',
      none: 'Нет активного Welcome Bonus',
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
    settings: {
      title: 'Настройки игры',
      aria: 'Открыть настройки игры',
      sound: 'Звуковые эффекты',
      haptic: 'Тактильный отклик',
      on: 'Вкл',
      off: 'Выкл',
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
    pages: {
      deposit: 'Депозит',
      withdraw: 'Вывод',
      history: 'История',
    },
    method: {
      ariaLabel: 'Способ оплаты',
      crypto: 'Криптовалюта',
      bank: 'Банк',
      comingSoon: 'Скоро',
      comingSoonHint: 'Банковские переводы появятся в следующем обновлении.',
    },
    pair: {
      currency: 'Валюта',
      network: 'Сеть',
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
        below_minimum: 'Ниже минимума — не зачислено',
      },
      disclaimer: 'Сумма ниже минимального депозита не будет зачислена. Для зачисления средств обратитесь в поддержку.',
      belowMinimumToast: 'Депозит ниже минимума и не был зачислен. Обратитесь в поддержку для возврата средств.',
      bonusSkippedActive: 'Депозит зачислен на основной баланс. Завершите текущий Welcome Bonus или дождитесь срока — тогда откроется следующий.',
      getAddress: 'Получить адрес',
      validation: {
        amount: 'Введите корректную сумму депозита',
        belowMinimum: 'Минимальный депозит: {amount}',
      },
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
        minimumUnavailable: 'Не удалось определить минимальный депозит для этой сети.',
      },
      toast: {
        completed: 'Депозит зачислен',
        addressCopied: 'Адрес скопирован',
        copyFailed: 'Не удалось скопировать адрес',
        qrUnavailable: 'QR-код пока недоступен',
      },
    },
    withdraw: {
      addressLabel: 'Адрес',
      addressPlaceholder: 'Введите адрес вашего криптокошелька',
      submit: 'Вывод',
      minAmount: 'мин. сумма: {amount} · Вывод реальных средств отменяет оставшийся Welcome Bonus',
      validation: {
        amount: 'Введите корректную сумму',
        belowMinimum: 'Минимальный вывод: {amount}',
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
      filtersAria: 'Категории истории',
      filters: {
        all: 'Все',
        deposits: 'Депозиты',
        withdrawals: 'Выводы',
        game_bets: 'Ставки',
        game_wins: 'Выигрыши',
        referrals: 'Рефералы',
        bonuses: 'Бонусы',
        rewards: 'Награды',
        system: 'Система',
      },
      items: {
        deposit: 'Депозит',
        deposit_desc: 'Баланс пополнен',
        withdraw: 'Вывод',
        withdraw_desc: 'Средства отправлены на кошелёк',
        withdraw_hold: 'Холд вывода',
        withdraw_hold_desc: 'Сумма зарезервирована для выплаты',
        withdraw_release: 'Снятие холда',
        withdraw_release_desc: 'Зарезервированные средства возвращены',
        dice_bet: 'Ставка Dice',
        dice_bet_desc: 'Ставка в Dice',
        dice_win: 'Выигрыш Dice',
        dice_win_desc: 'Выплата по Dice',
        plinko_bet: 'Ставка Plinko',
        plinko_bet_desc: 'Ставка в Plinko',
        plinko_win: 'Выигрыш Plinko',
        plinko_win_desc: 'Выплата по Plinko',
        crash_bet: 'Ставка Crash',
        crash_bet_desc: 'Ставка в Crash',
        crash_win: 'Выигрыш Crash',
        crash_win_desc: 'Кэшаут в Crash',
        game_bet: 'Игровая ставка',
        game_win: 'Игровой выигрыш',
        referral: 'Реферал',
        referral_bounty: 'Реферальный бонус',
        referral_bounty_desc: 'Награда за FTD партнёра',
        referral_claim: 'Вывод реферальных',
        referral_claim_desc: 'Реферальный доход зачислен',
        bonus: 'Бонус',
        bonus_grant: 'Бонус начислен',
        bonus_grant_desc: 'Промо-кредит добавлен',
        bonus_unlock: 'Бонус разблокирован',
        bonus_unlock_desc: 'Отыгрыш завершён',
        bonus_expire: 'Бонус истёк',
        bonus_forfeit: 'Бонус отменён',
        bonus_forfeit_desc: 'Welcome Bonus снят при выводе',
        reward: 'Награда',
        system: 'Система',
        system_desc: 'Служебная операция',
      },
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
      wager: '{n}× (депозит + бонус)',
      expires: {
        none: 'Без срока',
        days: '{n} дн.',
      },
      tier: {
        generic: 'Welcome Bonus',
        nth: 'Депозит №{n}',
      },
      games: {
        all: 'Все игры',
        allLow: 'Все игры',
        dice: 'Dice',
        crash: 'Crash',
        plinko: 'Plinko',
        plinkoRisk: 'Plinko',
      },
      maxBet: {
        pctCap: 'До {pct}% бонуса (макс. {amount} идёт в отыгрыш)',
        upTo: 'До {amount} идёт в отыгрыш',
        terms: 'См. условия бонуса',
      },
      card: {
        loading: 'Загрузка бонуса…',
        availableTitle: 'БОНУС {percent}',
        activeTitle: 'БОНУС {percent}',
        autoActivate: 'Начисляется с депозитом',
        activeHint: 'Сейчас активен на вашем аккаунте',
        learnMore: 'Подробнее',
      },
      info: {
        title: 'Условия бонуса',
        back: 'Назад к депозиту',
      },
      collapsed: {
        title: 'Welcome Bonus',
        tap: 'Нажмите, чтобы выбрать',
        loading: 'Загрузка бонусов…',
        unavailable: 'Welcome Bonus недоступен',
        locked: 'Сначала завершите текущий бонус',
      },
      empty: 'Для следующего депозита Welcome Bonus пока недоступен.',
      listAria: 'Уровни Welcome Bonus',
      detail: {
        bonus: 'Бонус',
        who: 'Кому',
        wager: 'Отыгрыш',
        expires: 'Срок',
        maxBet: 'В отыгрыш',
        games: 'Игры',
        note: 'Важно',
        noteValue: 'Играйте в любые игры. Крупные ставки можно — в отыгрыш идёт до 10% бонуса (макс. $5). Вывод реальных средств отменяет оставшийся бонус.',
        whoPlayers: 'Игроки при {ordinal} депозите',
        title: 'Welcome Bonus {pct}%',
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
        tierUnavailable: 'Этот Welcome Bonus сейчас недоступен.',
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

  bonuses: {
    overlay: { title: 'Бонусы' },
    hero: {
      alt: 'Баннер бонусов',
      title: 'Заберите бонусы',
      subtitleHtml: 'Получайте <strong>персональные акции</strong>, <strong>кэшбэк</strong> и эксклюзивные награды',
    },
    filters: {
      aria: 'Фильтры бонусов',
      yours: 'Your bonuses',
      all: 'all bonuses',
      promo: 'promo codes',
      deposit: 'Welcome Bonus',
    },
    sections: {
      yours: 'Your bonuses',
      all: 'All bonuses',
    },
    empty: {
      yours: 'В этой категории пока нет бонусов',
      all: 'Нет доступных бонусов',
    },
    card: {
      untitled: 'Бонус',
      principal: 'Сумма: ${amount}',
    },
    status: {
      available: 'active',
      active: 'active',
      completed: 'Finished',
      expired: 'Expired',
      claimed: 'Reward Claimed',
      locked: 'Locked',
      rewarded: 'Reward Claimed',
      qualified: 'Active',
      forfeited: 'Отменён',
    },
    actions: {
      claim: 'Claim Bonus',
      claimed: 'Bonus claimed',
      locked: 'Locked',
      in_progress: 'In progress',
      expired: 'Expired',
      learnMore: 'Узнать больше',
    },
    detail: {
      title: 'Условия бонуса',
      back: '← Назад',
      status: 'Статус',
      description: 'Описание',
      reward: 'Бонус',
      deposit: 'Депозит',
      minDeposit: 'Мин. депозит',
      maxBonus: 'Макс. бонус',
      wager: 'Отыгрыш',
      maxBet: 'В отыгрыш',
      maxBetValue: 'До {pct} бонуса (макс. {amount} идёт в отыгрыш)',
      wagerBase: 'Отыгрыш',
      wagerBaseValue: '{n}× (депозит + бонус)',
      remainingWager: 'Осталось отыграть',
      expiresAt: 'Истекает',
      gamesAll: 'Все игры',
      games: 'Игры',
      progress: 'Прогресс',
      expires: 'Срок',
      expiresDays: '{n} дней',
      conditions: 'Важно',
      lockedHint: 'Завершите текущий Welcome Bonus, чтобы открыть следующий.',
    },
  },

  referrals: {
    overlay: { title: 'Рефералы' },
    hero: {
      alt: 'Реферальный баннер',
      titleHtml: 'ПОЛУЧИ ДО <strong>70%</strong> ЗА ПРИГЛАШЕННЫХ ТОБОЙ ДРУЗЕЙ',
    },
    metrics: {
      invites: 'Всего приглашений',
      ftd: 'FTD',
      status: 'Статус',
      today: 'Доход сегодня',
      alltime: 'Доход за всё время',
      revshare: 'Rev-share',
      pending: 'В холде',
      available: 'Доступно',
      withdrawable: 'К выводу',
    },
    more: {
      label: 'ещё',
      comingSoon: 'Подробная статистика — скоро',
    },
    link: {
      label: 'Ссылка',
      copy: 'Скопировать ссылку',
      copied: 'Ссылка скопирована',
      copyFailed: 'Не удалось скопировать ссылку',
    },
    actions: {
      claim: 'Забрать доход',
    },
    tiers: {
      youGet: 'Вы получаете:',
      friendGets: 'Ваш друг получает:',
      revshare: 'RevShare',
      ftdRange: '{min}–{max} FTD',
      ftdPlus: '{min}+ FTD',
    },
    rewards: {
      freeSpins: '{spins} Free Spins по ${value}',
      exclusive: 'Доступ к эксклюзивным акциям',
    },
    statusInfo: {
      label: 'Статус',
      open: 'Открыть статусы',
      learnMore: 'Подробнее',
      title: 'Статусы реферальной программы',
      back: '← Назад',
      revshare: '{percent}% RevShare',
      friendReward: 'Другу: {spins} Free Spins по ${value} + эксклюзивные акции',
    },
    partner: {
      title: 'Партнёрская программа',
      description: 'Индивидуальные условия для партнёров с высоким трафиком: повышенный RevShare, личный кабинет и персональный менеджер.',
      blurb: 'До {percent}% RevShare · индивидуальные условия · личный кабинет · менеджер',
      bannerAlt: 'Партнёрский баннер',
      bannerTitle: 'ХОЧЕШЬ БОЛЬШЕ, ЧЕМ РЕФЕРАЛКА?',
      bannerSub: 'ПОДКЛЮЧАЙ ПАРТНЕРСКУЮ ПРОГРАММУ',
      bannerMeta: 'Индивидуальные условия • До {percent}% RevShare',
      cta: 'Стать партнером',
      features: {
        revshare: 'До {percent}% RevShare',
        terms: 'Индивидуальные условия',
        cabinet: 'Индивидуальный личный кабинет',
        manager: 'Личный менеджер',
      },
    },
    history: {
      title: 'История начислений',
      empty: 'Пока нет начислений',
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
      less: 'Меньше',
      more: 'Больше',
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
    balls: 'Шары',
    ballsDecrease: 'Уменьшить количество шаров',
    ballsIncrease: 'Увеличить количество шаров',
    batchResult: 'Plinko · шаров: {count}',
    batchReceived: 'Получено {usd} · шаров: {count}',
    riskLevel: {
      easy: 'Лёгкий',
      medium: 'Средний',
      high: 'Высокий',
    },
    toast: {
      winMeta: 'Plinko · {mult}×',
      received: 'Получено {usd} · {mult}×',
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
    activity: {
      onlineAria: 'Игроков онлайн',
      bets: 'Ставки',
      betsAria: 'Активные ставки',
      feedAria: 'Живые кэшауты',
      cashout: 'кэшаут',
      player: 'Игрок',
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
      reconnecting: 'Переподключение к Crash…',
    },
    reconnect: {
      message: 'Переподключение…',
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

  support: {
    title: 'Техническая поддержка',
    subtitle: 'Нужна помощь? Свяжитесь с поддержкой Tornado.',
    cta: 'Написать в поддержку',
    emailLabel: 'Или напишите на email',
    emailCta: 'Отправить письмо',
    toast: {
      copied: 'Скопировано в буфер обмена',
      emailCopied: 'Email скопирован',
      copyFailed: 'Не удалось скопировать',
    },
  },

  welcome: {
    campaigns: {
      launch_v1: {
        bannerAlt: 'Welcome Bonus',
        cta: {
          claim: 'Получить бонус',
        },
      },
    },
  },

  toast: {
    win: {
      title: 'Вы выиграли',
    },
    dismiss: 'Закрыть уведомление',
  },
};
