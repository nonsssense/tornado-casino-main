/**
 * Wallet service.
 *
 * Responsibility:
 * - Deposit, withdraw, and transaction history orchestration.
 * - Poll deposit status when backend endpoint is available.
 * - Trust backend balance — never calculate or cache balance long-term.
 */

import {
  createDeposit,
  submitWithdraw,
  fetchDepositStatus,
  fetchHistory,
} from '../api/wallet.js';

/**
 * @typedef {object} DepositResponse
 * @property {string} address
 * @property {string} minimum
 * @property {string} [qr_code]
 * @property {string} ticker
 * @property {number} deposit_id
 */

const POLL_INTERVAL_MS = 5000;

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

  /**
   * @param {number} depositId
   * @returns {Promise<{ deposit_id: number, status: string }>}
   */
  async getDepositStatus(depositId) {
    return fetchDepositStatus(depositId);
  },

  /**
   * Poll deposit status until completed or stopped.
   * @param {number} depositId
   * @param {{ onStatus?: function(string): void, onComplete?: function(): void }} [callbacks]
   * @returns {function(): void} stop polling
   */
  pollDepositStatus(depositId, callbacks = {}) {
    const { onStatus, onComplete } = callbacks;
    let stopped = false;

    const poll = async () => {
      if (stopped) return;

      try {
        const data = await fetchDepositStatus(depositId);
        const status = data?.status || 'pending';

        if (onStatus) onStatus(status);

        if (status === 'completed') {
          if (onComplete) onComplete();
          return;
        }
      } catch {
        // keep polling on transient errors
      }

      if (!stopped) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      stopped = true;
    };
  },

  /**
   * @returns {Promise<Array<{ id: number, type: string, amount: number, status: string, balance_after: number }>>}
   */
  async fetchHistory() {
    const data = await fetchHistory();
    return data?.transactions ?? [];
  },
};
