/**
 * Wallet UI constants — coins, networks, and deposit status labels.
 *
 * Ticker values are official BlockBee path tickers used by:
 * GET https://api.blockbee.io/{ticker}/create/
 *
 * Source: BlockBee /info + docs (e.g. btc, eth, trc20/usdt, sol/sol).
 */

export const WALLET_ASSET_BASE = '/assets';

export const WALLET_COINS = [
  {
    id: 'usdt',
    label: 'USDT',
    symbol: 'USDT',
    icon: `${WALLET_ASSET_BASE}/tether.png`,
  },
  {
    id: 'btc',
    label: 'Bitcoin',
    symbol: 'BTC',
    icon: `${WALLET_ASSET_BASE}/btc%20icon.png`,
  },
  {
    id: 'eth',
    label: 'Ethereum',
    symbol: 'ETH',
    icon: `${WALLET_ASSET_BASE}/eth%20icon.png`,
  },
  {
    id: 'tron',
    label: 'Tron',
    symbol: 'TRX',
    icon: `${WALLET_ASSET_BASE}/tron%20icon.png`,
  },
  {
    id: 'sol',
    label: 'Solana',
    symbol: 'SOL',
    icon: `${WALLET_ASSET_BASE}/solana%20icon.png`,
  },
  {
    id: 'usdc',
    label: 'USDC',
    symbol: 'USDC',
    icon: `${WALLET_ASSET_BASE}/usdc%20icon.png`,
  },
];

/**
 * Networks available per coin id.
 * `ticker` MUST be the BlockBee path ticker.
 * @type {Record<string, Array<{ id: string, label: string, networkLabel: string, icon: string, ticker: string, addressLabel: string }>>}
 */
export const WALLET_NETWORKS = {
  usdt: [
    {
      id: 'trc20',
      label: 'TRC20',
      networkLabel: 'Tron network',
      icon: `${WALLET_ASSET_BASE}/tron%20icon.png`,
      ticker: 'trc20/usdt',
      addressLabel: 'Постоянный адрес Tron (TRC20)',
    },
    {
      id: 'erc20',
      label: 'ERC20',
      networkLabel: 'Ethereum network',
      icon: `${WALLET_ASSET_BASE}/eth%20icon.png`,
      ticker: 'erc20/usdt',
      addressLabel: 'Постоянный адрес Ethereum (ERC20)',
    },
    {
      id: 'bep20',
      label: 'BEP20',
      networkLabel: 'BNB Smart Chain',
      icon: `${WALLET_ASSET_BASE}/tether.png`,
      ticker: 'bep20/usdt',
      addressLabel: 'Постоянный адрес BNB Smart Chain (BEP20)',
    },
    {
      id: 'solana',
      label: 'Solana',
      networkLabel: 'Solana network',
      icon: `${WALLET_ASSET_BASE}/solana%20icon.png`,
      ticker: 'sol/usdt',
      addressLabel: 'Постоянный адрес Solana',
    },
  ],
  btc: [
    {
      id: 'btc',
      label: 'Bitcoin',
      networkLabel: 'Bitcoin network',
      icon: `${WALLET_ASSET_BASE}/btc%20icon.png`,
      ticker: 'btc',
      addressLabel: 'Постоянный адрес Bitcoin',
    },
  ],
  eth: [
    {
      id: 'ethereum',
      label: 'Ethereum',
      networkLabel: 'Ethereum network',
      icon: `${WALLET_ASSET_BASE}/eth%20icon.png`,
      ticker: 'eth',
      addressLabel: 'Постоянный адрес Ethereum',
    },
  ],
  tron: [
    {
      id: 'tron',
      label: 'Tron',
      networkLabel: 'Tron network',
      icon: `${WALLET_ASSET_BASE}/tron%20icon.png`,
      ticker: 'trx',
      addressLabel: 'Постоянный адрес Tron',
    },
  ],
  sol: [
    {
      id: 'solana',
      label: 'Solana',
      networkLabel: 'Solana network',
      icon: `${WALLET_ASSET_BASE}/solana%20icon.png`,
      ticker: 'sol/sol',
      addressLabel: 'Постоянный адрес Solana',
    },
  ],
  usdc: [
    {
      id: 'erc20',
      label: 'ERC20',
      networkLabel: 'Ethereum network',
      icon: `${WALLET_ASSET_BASE}/eth%20icon.png`,
      ticker: 'erc20/usdc',
      addressLabel: 'Постоянный адрес Ethereum (ERC20)',
    },
    {
      id: 'bep20',
      label: 'BEP20',
      networkLabel: 'BNB Smart Chain',
      icon: `${WALLET_ASSET_BASE}/usdc%20icon.png`,
      ticker: 'bep20/usdc',
      addressLabel: 'Постоянный адрес BNB Smart Chain (BEP20)',
    },
    {
      id: 'solana',
      label: 'Solana',
      networkLabel: 'Solana network',
      icon: `${WALLET_ASSET_BASE}/solana%20icon.png`,
      ticker: 'sol/usdc',
      addressLabel: 'Постоянный адрес Solana',
    },
  ],
};

export const DEPOSIT_STATUS_LABELS = {
  open: 'Открыт',
  pending: 'Ожидание оплаты',
  confirming: 'Подтверждение',
  completed: 'Завершён',
};

export const DEPOSIT_DISCLAIMER =
  'Сумма ниже минимального депозита не будет зачислена. Для зачисления средств обратитесь в поддержку.';

export const WITHDRAW_ADDRESS_PLACEHOLDER = 'Введите ваш адрес криптокошелька';
