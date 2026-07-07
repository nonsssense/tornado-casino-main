/**
 * Wallet service.
 *
 * Responsibility:
 * - Deposit, withdraw, and transaction history orchestration.
 * - Poll deposit status when backend endpoint is available.
 * - Trust backend balance — never calculate or cache balance long-term.
 */

import { createDeposit, submitWithdraw } from '../api/wallet.js';

/**
 * @typedef {object} DepositResponse
 * @property {string} address
 * @property {string} minimum
 * @property {string} [qr_code]
 * @property {string} ticker
 */

export const walletService = {
  /**
   * Create a deposit and fetch payment address from backend.
   * @param {string} ticker - e.g. USDT_TRC20
   * @returns {Promise<DepositResponse>}
   */
  async createDeposit(ticker) {
    return createDeposit(ticker);
  },

  /**
   * Submit a withdrawal request.
   * @param {{ ticker: string, address: string }} payload
   */
  async submitWithdraw(payload) {
    return submitWithdraw(payload);
  },

  // TODO: pollDepositStatus when backend endpoint is documented
  // TODO: fetchHistory when history API is documented
};
