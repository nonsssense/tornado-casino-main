/**
 * Wallet UI constants — coins, networks, and deposit status labels.
 * Ticker values align with POST /api/wallet/deposit { ticker }.
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
 * @type {Record<string, Array<{ id: string, label: string, networkLabel: string, icon: string, ticker: string, addressLabel: string }>>}
 */
export const WALLET_NETWORKS = {
  usdt: [
    {
      id: 'trc20',
      label: 'Trc20',
      networkLabel: 'Tron network',
      icon: `${WALLET_ASSET_BASE}/tron%20icon.png`,
      ticker: 'USDT_TRC20',
      addressLabel: 'Постоянный адрес Tron (TRC 20)',
    },
  ],
  btc: [
    {
      id: 'btc',
      label: 'Bitcoin',
      networkLabel: 'Bitcoin network',
      icon: `${WALLET_ASSET_BASE}/btc%20icon.png`,
      ticker: 'BTC',
      addressLabel: 'Постоянный адрес Bitcoin',
    },
  ],
  eth: [
    {
      id: 'erc20',
      label: 'Ethereum',
      networkLabel: 'Ethereum network',
      icon: `${WALLET_ASSET_BASE}/eth%20icon.png`,
      ticker: 'ETH',
      addressLabel: 'Постоянный адрес Ethereum',
    },
  ],
  tron: [
    {
      id: 'trc20',
      label: 'Trc20',
      networkLabel: 'Tron network',
      icon: `${WALLET_ASSET_BASE}/tron%20icon.png`,
      ticker: 'TRX',
      addressLabel: 'Постоянный адрес Tron',
    },
  ],
  sol: [
    {
      id: 'solana',
      label: 'Solana',
      networkLabel: 'Solana network',
      icon: `${WALLET_ASSET_BASE}/solana%20icon.png`,
      ticker: 'SOL',
      addressLabel: 'Постоянный адрес Solana',
    },
  ],
  usdc: [
    {
      id: 'erc20',
      label: 'ERC20',
      networkLabel: 'Ethereum network',
      icon: `${WALLET_ASSET_BASE}/eth%20icon.png`,
      ticker: 'USDC',
      addressLabel: 'Постоянный адрес Ethereum (ERC20)',
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
