/**
 * Wallet UI constants — coins, networks (labels via i18n).
 *
 * Ticker values are official BlockBee path tickers used by:
 * GET https://api.blockbee.io/{ticker}/create/
 */

import { t } from '../i18n/index.js';

export const WALLET_ASSET_BASE = '/assets';

export const WALLET_COINS = [
  {
    id: 'usdt',
    labelKey: 'wallet.coin.usdt',
    symbol: 'USDT',
    icon: `${WALLET_ASSET_BASE}/tether.png`,
  },
  {
    id: 'btc',
    labelKey: 'wallet.coin.btc',
    symbol: 'BTC',
    icon: `${WALLET_ASSET_BASE}/btc%20icon.png`,
  },
  {
    id: 'eth',
    labelKey: 'wallet.coin.eth',
    symbol: 'ETH',
    icon: `${WALLET_ASSET_BASE}/eth%20icon.png`,
  },
  {
    id: 'tron',
    labelKey: 'wallet.coin.tron',
    symbol: 'TRX',
    icon: `${WALLET_ASSET_BASE}/tron%20icon.png`,
  },
  {
    id: 'sol',
    labelKey: 'wallet.coin.sol',
    symbol: 'SOL',
    icon: `${WALLET_ASSET_BASE}/solana%20icon.png`,
  },
  {
    id: 'usdc',
    labelKey: 'wallet.coin.usdc',
    symbol: 'USDC',
    icon: `${WALLET_ASSET_BASE}/usdc%20icon.png`,
  },
];

/**
 * @type {Record<string, Array<{ id: string, labelKey: string, networkKey: string, addressKey: string, icon: string, ticker: string }>>}
 */
export const WALLET_NETWORKS = {
  usdt: [
    {
      id: 'trc20',
      labelKey: 'wallet.network.trc20.label',
      networkKey: 'wallet.network.trc20.name',
      icon: `${WALLET_ASSET_BASE}/tron%20icon.png`,
      ticker: 'trc20/usdt',
      addressKey: 'wallet.deposit.addressLabel.usdt_trc20',
    },
    {
      id: 'erc20',
      labelKey: 'wallet.network.erc20.label',
      networkKey: 'wallet.network.erc20.name',
      icon: `${WALLET_ASSET_BASE}/eth%20icon.png`,
      ticker: 'erc20/usdt',
      addressKey: 'wallet.deposit.addressLabel.usdt_erc20',
    },
    {
      id: 'bep20',
      labelKey: 'wallet.network.bep20.label',
      networkKey: 'wallet.network.bep20.name',
      icon: `${WALLET_ASSET_BASE}/tether.png`,
      ticker: 'bep20/usdt',
      addressKey: 'wallet.deposit.addressLabel.usdt_bep20',
    },
    {
      id: 'solana',
      labelKey: 'wallet.network.solana.label',
      networkKey: 'wallet.network.solana.name',
      icon: `${WALLET_ASSET_BASE}/solana%20icon.png`,
      ticker: 'sol/usdt',
      addressKey: 'wallet.deposit.addressLabel.usdt_solana',
    },
  ],
  btc: [
    {
      id: 'btc',
      labelKey: 'wallet.network.btc.label',
      networkKey: 'wallet.network.btc.name',
      icon: `${WALLET_ASSET_BASE}/btc%20icon.png`,
      ticker: 'btc',
      addressKey: 'wallet.deposit.addressLabel.btc_btc',
    },
  ],
  eth: [
    {
      id: 'ethereum',
      labelKey: 'wallet.network.ethereum.label',
      networkKey: 'wallet.network.ethereum.name',
      icon: `${WALLET_ASSET_BASE}/eth%20icon.png`,
      ticker: 'eth',
      addressKey: 'wallet.deposit.addressLabel.eth_ethereum',
    },
  ],
  tron: [
    {
      id: 'tron',
      labelKey: 'wallet.network.tron.label',
      networkKey: 'wallet.network.tron.name',
      icon: `${WALLET_ASSET_BASE}/tron%20icon.png`,
      ticker: 'trx',
      addressKey: 'wallet.deposit.addressLabel.tron_tron',
    },
  ],
  sol: [
    {
      id: 'solana',
      labelKey: 'wallet.network.solana.label',
      networkKey: 'wallet.network.solana.name',
      icon: `${WALLET_ASSET_BASE}/solana%20icon.png`,
      ticker: 'sol/sol',
      addressKey: 'wallet.deposit.addressLabel.sol_solana',
    },
  ],
  usdc: [
    {
      id: 'erc20',
      labelKey: 'wallet.network.erc20.label',
      networkKey: 'wallet.network.erc20.name',
      icon: `${WALLET_ASSET_BASE}/eth%20icon.png`,
      ticker: 'erc20/usdc',
      addressKey: 'wallet.deposit.addressLabel.usdc_erc20',
    },
    {
      id: 'bep20',
      labelKey: 'wallet.network.bep20.label',
      networkKey: 'wallet.network.bep20.name',
      icon: `${WALLET_ASSET_BASE}/usdc%20icon.png`,
      ticker: 'bep20/usdc',
      addressKey: 'wallet.deposit.addressLabel.usdc_bep20',
    },
    {
      id: 'solana',
      labelKey: 'wallet.network.solana.label',
      networkKey: 'wallet.network.solana.name',
      icon: `${WALLET_ASSET_BASE}/solana%20icon.png`,
      ticker: 'sol/usdc',
      addressKey: 'wallet.deposit.addressLabel.usdc_solana',
    },
  ],
};

/**
 * @param {string} status
 * @returns {string}
 */
export function getDepositStatusLabel(status) {
  const key = `wallet.deposit.status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

/**
 * @returns {string}
 */
export function getDepositDisclaimer() {
  return t('wallet.deposit.disclaimer');
}

/**
 * @returns {string}
 */
export function getWithdrawAddressPlaceholder() {
  return t('wallet.withdraw.addressPlaceholder');
}

/**
 * Compat map — reads live translations.
 * Prefer getDepositStatusLabel(status).
 */
export const DEPOSIT_STATUS_LABELS = new Proxy({}, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined;
    return getDepositStatusLabel(prop);
  },
});

export const DEPOSIT_DISCLAIMER = getDepositDisclaimer;
export const WITHDRAW_ADDRESS_PLACEHOLDER = getWithdrawAddressPlaceholder;
