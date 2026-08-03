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

  guest: {
    name: 'Guest',
    actions: {
      openTelegram: 'Open Telegram',
    },
    modal: {
      title: 'Telegram sign-in required',
      message: 'To place bets and use your balance, open Tornado through Telegram.',
    },
    notice: {
      default: 'Sign in through Telegram to use this feature.',
    },
    deposit: {
      message: 'To get a deposit address, open Tornado through Telegram.',
    },
    withdraw: {
      message: 'To withdraw funds, open Tornado through Telegram.',
    },
    history: {
      message: 'History is available after signing in through Telegram.',
    },
    profile: {
      message: 'Sign in through Telegram to access your profile.',
    },
    referrals: {
      message: 'Your referral link and earnings are available after signing in through Telegram.',
      linkPlaceholder: 'Sign in through Telegram',
    },
    balance: {
      locked: '—',
      message: 'Balance is available after signing in through Telegram.',
    },
    bonuses: {
      message: 'Bonuses are available after signing in through Telegram.',
    },
    crash: {
      placeholder: 'Live Crash is available in the Telegram Mini App.',
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
    withdrawable: {
      title: 'Withdrawable',
    },
    wagerRemaining: {
      title: 'Remaining Wager',
    },
    welcome: {
      active: 'Welcome Bonus in progress',
      expires: 'Expires {date}',
      progress: '{percent}% done',
      none: 'No active Welcome Bonus',
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
    settings: {
      title: 'Game settings',
      aria: 'Open game settings',
      sound: 'Sound Effects',
      haptic: 'Tactile Feedback',
      on: 'On',
      off: 'Off',
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
    pages: {
      deposit: 'Deposit',
      withdraw: 'Withdraw',
      history: 'History',
    },
    method: {
      ariaLabel: 'Payment method',
      crypto: 'Cryptocurrency',
      bank: 'Bank',
      comingSoon: 'Coming Soon',
      comingSoonHint: 'Bank transfers will be available in a future update.',
    },
    pair: {
      currency: 'Currency',
      network: 'Network',
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
        below_minimum: 'Below minimum — not credited',
      },
      disclaimer: 'Amounts below the minimum deposit will not be credited. Contact support to recover funds.',
      belowMinimumToast: 'Deposit is below the minimum and was not credited. Contact support to recover funds.',
      bonusSkippedActive: 'Deposit added to your Real Balance. Finish your current Welcome Bonus — or let it expire — before the next one unlocks.',
      getAddress: 'Get address',
      validation: {
        amount: 'Enter a valid deposit amount',
        belowMinimum: 'Minimum deposit is {amount}',
      },
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
        minimumUnavailable: 'Unable to resolve the minimum deposit for this network.',
      },
      toast: {
        completed: 'Deposit completed',
        addressCopied: 'Address copied',
        copyFailed: 'Failed to copy address',
        qrUnavailable: 'QR code not available yet',
      },
    },
    withdraw: {
      addressLabel: 'Address',
      addressPlaceholder: 'Enter your crypto wallet address',
      submit: 'Withdraw',
      minAmount: 'min amount: {amount} · Withdrawing real funds cancels remaining Welcome Bonus',
      validation: {
        amount: 'Enter a valid amount',
        belowMinimum: 'Minimum withdrawal is {amount}',
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
      filtersAria: 'History categories',
      filters: {
        all: 'All',
        deposits: 'Deposits',
        withdrawals: 'Withdrawals',
        game_bets: 'Game Bets',
        game_wins: 'Game Wins',
        referrals: 'Referrals',
        bonuses: 'Bonuses',
        rewards: 'Rewards',
        system: 'System',
      },
      items: {
        deposit: 'Deposit',
        deposit_desc: 'Balance topped up',
        withdraw: 'Withdrawal',
        withdraw_desc: 'Funds sent to your wallet',
        withdraw_hold: 'Withdrawal hold',
        withdraw_hold_desc: 'Amount reserved for payout',
        withdraw_release: 'Withdrawal released',
        withdraw_release_desc: 'Reserved funds returned',
        dice_bet: 'Dice bet',
        dice_bet_desc: 'Stake placed in Dice',
        dice_win: 'Dice win',
        dice_win_desc: 'Payout from Dice',
        plinko_bet: 'Plinko bet',
        plinko_bet_desc: 'Stake placed in Plinko',
        plinko_win: 'Plinko win',
        plinko_win_desc: 'Payout from Plinko',
        crash_bet: 'Crash bet',
        crash_bet_desc: 'Stake placed in Crash',
        crash_win: 'Crash win',
        crash_win_desc: 'Cashout from Crash',
        game_bet: 'Game bet',
        game_win: 'Game win',
        referral: 'Referral',
        referral_bounty: 'Referral bounty',
        referral_bounty_desc: 'FTD partner reward',
        referral_claim: 'Referral claim',
        referral_claim_desc: 'Referral earnings claimed',
        bonus: 'Bonus',
        bonus_grant: 'Bonus granted',
        bonus_grant_desc: 'Promotional credit added',
        bonus_unlock: 'Bonus unlocked',
        bonus_unlock_desc: 'Wagering completed',
        bonus_expire: 'Bonus expired',
        bonus_forfeit: 'Bonus cancelled',
        bonus_forfeit_desc: 'Welcome Bonus removed on withdrawal',
        reward: 'Reward',
        system: 'System',
        system_desc: 'Account adjustment',
      },
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
        forfeited: 'Cancelled',
        upcoming: 'Upcoming',
        selected: 'Selected',
        none: 'None',
      },
      wager: '{n}× (Deposit + Bonus)',
      expires: {
        none: 'No expiry',
        days: '{n} days',
      },
      tier: {
        generic: 'Welcome Bonus',
        nth: 'Deposit #{n}',
      },
      games: {
        all: 'All Games',
        allLow: 'All Games',
        dice: 'Dice',
        crash: 'Crash',
        plinko: 'Plinko',
        plinkoRisk: 'Plinko',
      },
      maxBet: {
        pctCap: 'Up to {pct}% of your bonus (max {amount} counts toward wagering)',
        upTo: 'Up to {amount} counts toward wagering',
        terms: 'See bonus details',
      },
      card: {
        loading: 'Loading bonus…',
        availableTitle: '{percent} BONUS',
        activeTitle: '{percent} BONUS',
        autoActivate: 'Added with your deposit',
        activeHint: 'Active on your account',
        learnMore: 'Learn More',
      },
      info: {
        title: 'Bonus details',
        back: 'Back to deposit',
      },
      collapsed: {
        title: 'Welcome Bonus',
        tap: 'Tap to choose',
        loading: 'Loading bonuses…',
        unavailable: 'No Welcome Bonus available',
        locked: 'Complete your current bonus first',
      },
      empty: 'No Welcome Bonus is available for your next deposit yet.',
      listAria: 'Welcome Bonus tiers',
      detail: {
        bonus: 'Bonus',
        who: 'Who',
        wager: 'Wager',
        expires: 'Expires',
        maxBet: 'Qualifying bet',
        games: 'Games',
        note: 'Note',
        noteValue: 'Play any game. Bigger bets are fine — only up to 10% of your bonus (max $5) counts toward wagering. Withdrawing real funds cancels the remaining bonus.',
        whoPlayers: 'Players making their {ordinal} deposit',
        title: '{pct}% Welcome Bonus',
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
        tierUnavailable: 'This Welcome Bonus is not available right now.',
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

  bonuses: {
    overlay: { title: 'Bonuses' },
    hero: {
      alt: 'Bonuses banner',
      title: 'Claim bonuses',
      subtitleHtml: 'Get <strong>personal offers</strong>, <strong>cashback</strong> and exclusive rewards',
    },
    filters: {
      aria: 'Bonus filters',
      yours: 'Your bonuses',
      all: 'All bonuses',
      promo: 'Promo codes',
      deposit: 'Welcome Bonuses',
    },
    sections: {
      yours: 'Your bonuses',
      all: 'All bonuses',
    },
    empty: {
      yours: 'No bonuses in this category yet',
      all: 'No available bonuses',
    },
    card: {
      untitled: 'Bonus',
      principal: 'Amount: ${amount}',
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
      forfeited: 'Cancelled',
    },
    actions: {
      claim: 'Claim Bonus',
      claimed: 'Bonus claimed',
      locked: 'Locked',
      in_progress: 'In progress',
      expired: 'Expired',
      learnMore: 'Learn More',
    },
    detail: {
      title: 'Bonus details',
      back: '← Back',
      status: 'Status',
      description: 'Description',
      reward: 'Bonus',
      deposit: 'Deposit',
      minDeposit: 'Min deposit',
      maxBonus: 'Max bonus',
      wager: 'Wager',
      maxBet: 'Qualifying bet',
      maxBetValue: 'Up to {pct} of your bonus (max {amount} counts toward wagering)',
      wagerBase: 'Wager',
      wagerBaseValue: '{n}× (Deposit + Bonus)',
      remainingWager: 'Remaining wager',
      expiresAt: 'Expires',
      gamesAll: 'All Games',
      games: 'Games',
      progress: 'Progress',
      expires: 'Duration',
      expiresDays: '{n} days',
      conditions: 'Note',
      lockedHint: 'Finish your current Welcome Bonus to unlock the next one.',
    },
  },

  referrals: {
    overlay: { title: 'Referrals' },
    hero: {
      alt: 'Referral banner',
      titleHtml: 'GET UP TO <strong>70%</strong> FOR FRIENDS YOU INVITE',
    },
    metrics: {
      invites: 'Total invites',
      ftd: 'FTD',
      status: 'Status',
      today: 'Today income',
      alltime: 'All-time income',
      revshare: 'Rev-share',
      pending: 'Pending',
      available: 'Available',
      withdrawable: 'Withdrawable',
    },
    more: {
      label: 'more',
      comingSoon: 'Detailed player stats — coming soon',
    },
    link: {
      label: 'Link',
      copy: 'Copy link',
      copied: 'Link copied',
      copyFailed: 'Failed to copy link',
    },
    actions: {
      claim: 'Claim earnings',
    },
    tiers: {
      youGet: 'You receive:',
      friendGets: 'Your friend receives:',
      revshare: 'RevShare',
      ftdRange: '{min}–{max} FTD',
      ftdPlus: '{min}+ FTD',
    },
    rewards: {
      freeSpins: '{spins} Free Spins at ${value}',
      exclusive: 'Access to exclusive promotions',
    },
    statusInfo: {
      label: 'Status info',
      open: 'Open status info',
      learnMore: 'Learn More',
      title: 'Referral status tiers',
      back: '← Back',
      revshare: '{percent}% RevShare',
      friendReward: 'Friend: {spins} Free Spins at ${value} + exclusive promos',
    },
    partner: {
      title: 'Partner program',
      description: 'Individual terms for high-traffic partners: higher RevShare, personal cabinet and a dedicated manager.',
      blurb: 'Up to {percent}% RevShare · individual terms · personal cabinet · manager',
      bannerAlt: 'Partnership banner',
      bannerTitle: 'WANT MORE THAN REFERRALS?',
      bannerSub: 'JOIN THE PARTNERSHIP PROGRAM',
      bannerMeta: 'Individual conditions • Up to {percent}% RevShare',
      cta: 'Become a partner',
      features: {
        revshare: 'Up to {percent}% RevShare',
        terms: 'Individual terms',
        cabinet: 'Personal cabinet',
        manager: 'Personal manager',
      },
    },
    history: {
      title: 'Earnings history',
      empty: 'No earnings yet',
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
      less: 'Less',
      more: 'More',
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
    balls: 'Balls',
    ballsDecrease: 'Use fewer balls',
    ballsIncrease: 'Use more balls',
    batchResult: 'Plinko · {count} balls',
    batchReceived: 'Received {usd} · {count} balls',
    riskLevel: {
      easy: 'Easy',
      medium: 'Medium',
      high: 'High',
    },
    toast: {
      winMeta: 'Plinko · {mult}×',
      received: 'Received {usd} · {mult}×',
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
    activity: {
      onlineAria: 'Players online',
      bets: 'Bets',
      betsAria: 'Active bets',
      feedAria: 'Live cashouts',
      cashout: 'cashout',
      player: 'Player',
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
      reconnecting: 'Reconnecting to Crash…',
    },
    reconnect: {
      message: 'Reconnecting…',
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

  support: {
    title: 'Technical Support',
    subtitle: 'Need help? Contact Tornado Support.',
    cta: 'Message Support',
    emailLabel: 'Or email us',
    emailCta: 'Send Email',
    toast: {
      copied: 'Copied to clipboard',
      emailCopied: 'Email copied',
      copyFailed: 'Failed to copy',
    },
  },

  welcome: {
    campaigns: {
      launch_v1: {
        bannerAlt: 'Welcome Bonus',
        cta: {
          claim: 'Claim Bonus',
        },
      },
    },
  },

  toast: {
    win: {
      title: 'You won',
    },
    dismiss: 'Dismiss notification',
  },
};
