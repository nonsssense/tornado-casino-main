/**
 * Wallet feature utilities.
 */

import { WALLET_COINS, WALLET_NETWORKS } from '../../utils/wallet.constants.js';

/**
 * @param {string} coinId
 * @returns {{ coin: object, network: object } | null}
 */
export function getCoinNetwork(coinId) {
  const coin = WALLET_COINS.find((item) => item.id === coinId);
  const networks = WALLET_NETWORKS[coinId];

  if (!coin || !networks?.length) {
    return null;
  }

  return { coin, network: networks[0] };
}

/**
 * @param {string} coinId
 * @returns {string}
 */
export function getCoinSymbol(coinId) {
  const coin = WALLET_COINS.find((item) => item.id === coinId);
  return coin?.symbol ?? coin?.label ?? '';
}
