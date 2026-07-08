/**
 * Wallet feature utilities.
 */

import { WALLET_COINS, WALLET_NETWORKS } from '../../utils/wallet.constants.js';

/**
 * @param {string} coinId
 * @returns {Array<object>}
 */
export function getNetworksForCoin(coinId) {
  return WALLET_NETWORKS[coinId] ?? [];
}

/**
 * @param {string} coinId
 * @param {string} [networkId]
 * @returns {{ coin: object, network: object, networks: object[] } | null}
 */
export function getCoinNetwork(coinId, networkId) {
  const coin = WALLET_COINS.find((item) => item.id === coinId);
  const networks = getNetworksForCoin(coinId);

  if (!coin || !networks.length) {
    return null;
  }

  const network = networks.find((item) => item.id === networkId) || networks[0];

  return { coin, network, networks };
}

/**
 * @param {string} coinId
 * @returns {string}
 */
export function getDefaultNetworkId(coinId) {
  return getNetworksForCoin(coinId)[0]?.id ?? '';
}

/**
 * @param {string} coinId
 * @returns {string}
 */
export function getCoinSymbol(coinId) {
  const coin = WALLET_COINS.find((item) => item.id === coinId);
  return coin?.symbol ?? coin?.label ?? '';
}
