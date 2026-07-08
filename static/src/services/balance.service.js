/**
 * Balance service.
 *
 * Responsibility:
 * - Display backend-provided balance values.
 * - Refresh balance after games, deposits, and withdrawals.
 * - Never compute winnings or modify balance locally.
 */

import { fetchBalance } from '../api/wallet.js';
import { formatCryptoAmount } from '../utils/format.js';

/** @type {Set<function>} */
const listeners = new Set();

export const balanceService = {
  /**
   * @returns {Promise<number>}
   */
  async fetchBalance() {
    const data = await fetchBalance();
    const balance = Number(data?.balance ?? 0);
    this.notify(balance);
    return balance;
  },

  /**
   * @param {number} balance
   */
  notify(balance) {
    const formatted = formatCryptoAmount(balance);
    listeners.forEach((listener) => listener(formatted, balance));
  },

  /**
   * @param {function(string, number): void} callback
   * @returns {function(): void}
   */
  subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
};
