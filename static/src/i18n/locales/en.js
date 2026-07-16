/**
 * English locale — premium crypto-casino wording (Stake / Rollbit style).
 */

export const en = {
  brand: {
    name: 'Tornado',
  },

  common: {
    retry: 'Retry',
    close: 'Close',
    loading: 'Loading…',
    dialog: 'Dialog',
    emDash: '—',
    usd: 'USD',
    copy: 'Copy',
    player: 'Player',
  },

  app: {
    title: 'Tornado',
  },

  auth: {
    error: {
      title: 'Unable to authenticate',
      subtitle: "Sorry, we couldn't authenticate your account. Please close the application and try again.",
    },
  },

  nav: {
    ariaLabel: 'Main navigation',
    wallet: 'Wallet',
    referrals: 'Referrals',
    casino: 'Casino',
    profile: 'Profile',
  },

  header: {
    home: 'Home',
    back: 'Back to games',
    profile: 'Profile',
  },

  balance: {
    aria: {
      loading: 'Balance loading',
      open: 'Open balance',
      deposit: 'Deposit',
    },
    overlay: {
      title: 'Balance',
    },
    real: {
      title: 'Real Balance',
    },
    bonus: {
      title: 'Bonus Balance',
    },
    actions: {
      deposit: 'deposit',
      withdraw: 'withdraw',
    },
  },

  home: {
    promo: {
      depositBonus: {
        alt: 'Deposit bonus',
      },
    },
    games: {
      ariaLabel: 'Games',
    },
    support: {
      ariaLabel: 'Tornado Support',
    },
    theme: {
      dark: 'Dark theme',
      light: 'Light theme',
    },
    lang: {
      ariaLabel: 'Language',
      ru: 'RU',
      en: 'EN',
    },
  },

  games: {
    dice: { name: 'Dice' },
    plinko: { name: 'Plinko' },
    crash: { name: 'Crash' },
    betAmount: 'Bet Amount',
    bet: {
      min: 'Minimum',
      max: 'Maximum',
    },
    quickBets: {
      aria: 'Quick bet amounts',
    },
    validation: {
      bet: 'Enter a valid bet amount',
    },
    error: {
      insufficient: 'Insufficient balance. Please top up your wallet.',
      generic: 'Unable to complete the game round. Please try again.',
    },
  },

  wallet: {
    overlay: {
      title: 'Wallet',
    },
    tabs: {
      ariaLabel: 'Wallet sections',
      deposit: 'deposit',
      withdraw: 'withdraw',
      history: 'history',
    },
    amount: {
      label: 'Amount',
      placeholder: 'Enter amount',
      max: 'MAX',
      maxAria: 'Use maximum amount',
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
      trc20: { label: 'TRC20', name: 'Tron network' },
      erc20: { label: 'ERC20', name: 'Ethereum network' },
      bep20: { label: 'BEP20', name: 'BNB Smart Chain' },
      solana: { label: 'Solana', name: 'Solana network' },
      btc: { label: 'Bitcoin', name: 'Bitcoin network' },
      ethereum: { label: 'Ethereum', name: 'Ethereum network' },
      tron: { label: 'Tron', name: 'Tron network' },
    },
    deposit: {
      addressLabel: {
        usdt_trc20: 'Permanent Tron (TRC20) address',
        usdt_erc20: 'Permanent Ethereum (ERC20) address',
        usdt_bep20: 'Permanent BNB Smart Chain (BEP20) address',
        usdt_solana: 'Permanent Solana address',
        btc_btc: 'Permanent Bitcoin address',
        eth_ethereum: 'Permanent Ethereum address',
        tron_tron: 'Permanent Tron address',
        sol_solana: 'Permanent Solana address',
        usdc_erc20: 'Permanent Ethereum (ERC20) address',
        usdc_bep20: 'Permanent BNB Smart Chain (BEP20) address',
        usdc_solana: 'Permanent Solana address',
      },
      status: {
        open: 'Open',
        pending: 'Waiting for payment',
        confirming: 'Confirming',
        completed: 'Completed',
      },
      disclaimer: 'Amounts below the minimum deposit will not be credited. Contact support to recover funds.',
      copy: 'Copy',
      qr: 'QR',
      qrAlt: 'Deposit QR code',
      minSum: 'min amount: {amount}',
      minSumEmpty: 'min amount: —',
      statusPrefix: 'Status: {status}',
      error: {
        load: 'Unable to load deposit address.',
        unsupported: 'Unsupported currency.',
        unavailable: 'Deposit service is not available yet.',
        network: 'Selected network is not supported.',
        addressUnavailable: 'Deposit address for this network is unavailable. Try another network.',
        retry: 'Unable to load deposit address. Please try again.',
      },
      toast: {
        completed: 'Deposit completed',
        addressCopied: 'Address copied',
        copyFailed: 'Failed to copy address',
        qrUnavailable: 'QR code not available yet',
      },
    },
    withdraw: {
      addressPlaceholder: 'Enter your crypto wallet address',
      submit: 'Withdraw',
      minAmount: 'min amount: {amount}',
      validation: {
        amount: 'Enter a valid amount',
      },
      toast: {
        success: 'Withdrawal submitted',
      },
      error: {
        generic: 'Unable to submit withdrawal. Please try again.',
        unavailable: 'Withdrawal service is not available yet.',
        insufficient: 'Insufficient balance for this withdrawal.',
      },
    },
    history: {
      emptyTitle: 'Transaction history',
      emptyText: 'No transactions yet',
      error: {
        load: 'Unable to load history.',
        retry: 'Unable to load history. Please try again.',
      },
    },
    bonus: {
      state: {
        available: 'Available',
        active: 'Active',
        done: 'Done',
        expired: 'Expired',
        forfeited: 'Forfeited',
        upcoming: 'Upcoming',
        selected: 'Selected',
        none: 'None',
      },
      wager: '{n}× wager',
      expires: {
        none: 'No expiry',
        days: '{n} days',
      },
      tier: {
        generic: 'Deposit Bonus',
        nth: 'Deposit #{n}',
      },
      games: {
        allLow: 'Dice, Crash, Plinko LOW',
        dice: 'Dice',
        crash: 'Crash',
        plinko: 'Plinko',
        plinkoRisk: 'Plinko ({risk})',
      },
      maxBet: {
        pctCap: '{pct}% of bonus, up to {amount}',
        upTo: 'Up to {amount}',
        terms: 'See bonus terms',
      },
      collapsed: {
        title: 'Deposit bonus',
        tap: 'Tap to choose',
        loading: 'Loading bonuses…',
        unavailable: 'No deposit bonus available',
        locked: 'All tiers used or locked',
      },
      empty: 'No deposit bonus is available for your next deposit.',
      listAria: 'Deposit bonus tiers',
      detail: {
        bonus: 'Bonus',
        who: 'Who',
        wager: 'Wager',
        expires: 'Expires',
        maxBet: 'Max bet',
        games: 'Games',
        note: 'Note',
        noteValue: 'Plinko LOW only. Unused bonus burns on expiry.',
        whoPlayers: 'Players making their {ordinal} deposit',
        title: '{pct}% Deposit Bonus',
      },
      ordinal: {
        next: 'next',
        '1': '1st',
        '2': '2nd',
        '3': '3rd',
        '4': '4th',
        '5': '5th',
        nth: '{n}th',
      },
      aria: {
        show: 'Show bonus details',
        hide: 'Hide bonus details',
        flipBack: 'Flip card back',
      },
      error: {
        tierUnavailable: 'This deposit bonus tier is not available.',
        loadFailed: 'Unable to load bonuses.',
      },
    },
  },

  profile: {
    overlay: {
      title: 'Profile',
    },
    loading: 'Loading profile',
    avatar: {
      ariaLabel: 'Avatar upload area',
    },
    menu: {
      personalData: 'personal data',
      myBonuses: 'my bonuses',
      referrals: 'referrals',
    },
    fields: {
      status: { label: 'Status', placeholder: 'Demo / Real / VIP' },
      nickname: { label: 'Nickname', placeholder: 'Harry' },
      userId: { label: 'User ID', placeholder: '123456789' },
      email: { label: 'Email', placeholder: 'example@email.com' },
    },
  },

  dice: {
    target: 'Target',
    targetAria: 'Target number',
    payout: {
      title: 'Potential Win',
      multiplier: 'Multiplier',
      profit: 'Profit',
      payout: 'Payout',
    },
    direction: {
      over: 'Roll Over',
      under: 'Roll Under',
    },
    play: 'Roll',
    wheel: {
      rollLabel: 'Roll',
    },
    meta: {
      chance: 'Chance ',
      profit: 'Profit ',
    },
    toast: {
      loseWithRoll: 'No win — roll {roll}',
      lose: 'No win this round',
      failed: 'Dice round failed',
    },
  },

  plinko: {
    risk: 'Risk',
    rows: 'Rows',
    play: 'Play',
    riskLevel: {
      easy: 'Easy',
      medium: 'Medium',
      high: 'High',
    },
    toast: {
      winMeta: 'Plinko · {mult}×',
      returned: '{mult}× — {usd} returned',
      failed: 'Plinko round failed',
      configFailed: 'Failed to load Plinko config',
    },
    error: {
      config: 'Unable to load Plinko configuration from server.',
      invalidPath: 'Backend did not return a valid ball path',
    },
  },

  crash: {
    waiting: {
      title: 'Betting open',
      subtitle: 'Next round starts in',
      seconds: '{n} sec',
      secondsZero: '0 sec',
      aria: 'Waiting for round',
    },
    animation: {
      aria: 'Crash animation area',
    },
    betAmount: {
      label: 'Bet amount',
      increase: 'Increase bet',
      decrease: 'Decrease bet',
      quickAria: 'Quick bet amounts',
    },
    action: {
      bet: 'BET',
      cashout: 'CASH OUT',
    },
    autoCashout: {
      auto: 'Auto',
      cashOut: 'Cash Out',
      aria: 'Auto cash out',
    },
    liveBets: {
      title: 'Live Bets',
      empty: 'No bets yet',
      aria: 'Live bets',
    },
    history: {
      aria: 'Recent multipliers',
    },
    panels: {
      aria: 'Betting panels',
    },
    toast: {
      betsClosed: 'Bets are closed',
      alreadyBet: 'You already have an active bet',
      betPlaced: 'Bet placed',
      betFailed: 'Failed to place bet',
      cashoutUnavailable: 'Cash out is not available',
      cashoutFailed: 'Failed to cash out',
      loadFailed: 'Failed to load Crash',
    },
    error: {
      sync: 'Unable to sync Crash state',
      session: 'Session expired. Please reload the app.',
      unreachable: 'Crash API is not reachable. Check that the backend is running.',
      conflict: 'Action not allowed right now.',
      generic: 'Unable to complete Crash action. Please try again.',
      invalidState: 'Invalid crash state response from server',
    },
  },

  toast: {
    win: {
      title: 'You won',
    },
    dismiss: 'Dismiss notification',
  },
};
