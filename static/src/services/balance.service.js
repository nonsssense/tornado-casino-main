/**
 * Balance service.
 *
 * Responsibility:
 * - Display backend-provided balance values (real + bonus).
 * - Refresh balance after games, deposits, and withdrawals.
 * - Never compute winnings or modify balance locally.
 */

import { fetchBalance } from '../api/wallet.js';
import { formatUsd } from '../utils/format.js';

/** @type {Set<function>} */
const listeners = new Set();

/** @type {{ real: number, bonus: number }|null} */
let cachedBalances = null;

export const balanceService = {
  /**
   * @returns {Promise<{ real: number, bonus: number }>}
   */
  async fetchBalances() {
    const data = await fetchBalance();
    const real = Number(data?.real_balance ?? data?.balance ?? 0);
    const bonus = Number(data?.bonus_balance ?? 0);

    cachedBalances = { real, bonus };
    this.notify();
    return cachedBalances;
  },

  /**
   * @returns {Promise<number>}
   */
  async fetchBalance() {
    const balances = await this.fetchBalances();
    return balances.real;
  },

  /**
   * @returns {{ real: number, bonus: number }|null}
   */
  getBalances() {
    return cachedBalances;
  },

  notify() {
    if (!cachedBalances) return;

    const formattedReal = formatUsd(cachedBalances.real);
    const formattedBonus = formatUsd(cachedBalances.bonus);

    listeners.forEach((listener) => {
      listener({
        real: cachedBalances.real,
        bonus: cachedBalances.bonus,
        formattedReal,
        formattedBonus,
      });
    });
  },

  /**
   * @param {function({ real: number, bonus: number, formattedReal: string, formattedBonus: string }): void} callback
   * @returns {function(): void}
   */
  subscribe(callback) {
    listeners.add(callback);

    if (cachedBalances) {
      callback({
        real: cachedBalances.real,
        bonus: cachedBalances.bonus,
        formattedReal: formatUsd(cachedBalances.real),
        formattedBonus: formatUsd(cachedBalances.bonus),
      });
    }

    return () => listeners.delete(callback);
  },

  /**
   * @param {function(string, number): void} callback - legacy header subscriber (real balance only)
   * @returns {function(): void}
   */
  subscribeReal(callback) {
    return this.subscribe(({ formattedReal, real }) => {
      callback(formattedReal, real);
    });
  },
};
