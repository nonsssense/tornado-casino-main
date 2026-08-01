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
  fetchDepositMinimum,
  fetchWithdrawMinimum,
  fetchHistory,
} from '../api/wallet.js';

/**
 * @typedef {object} DepositResponse
 * @property {string} address
 * @property {string|number} minimum
 * @property {number} [minimum_usd]
 * @property {string} [qr_code]
 * @property {string} ticker
 * @property {number} deposit_id
 */

const POLL_INTERVAL_MS = 5000;

export const walletService = {
  /**
   * Resolve effective deposit minimum without creating a payment.
   * @param {string} ticker
   */
  async getDepositMinimum(ticker) {
    return fetchDepositMinimum(ticker);
  },

  /**
   * Create a deposit and fetch payment address from backend.
   * Amount is optional — when omitted, address is returned immediately.
   * @param {string} ticker
   * @param {number} [amountUsd]
   * @returns {Promise<DepositResponse>}
   */
  async createDeposit(ticker, amountUsd) {
    return createDeposit(ticker, amountUsd);
  },

  /**
   * Resolve configured withdrawal minimum (USD).
   */
  async getWithdrawMinimum() {
    return fetchWithdrawMinimum();
  },

  /**
   * Submit a withdrawal request.
   * @param {{ ticker: string, address: string, amount: number }} payload
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
    let completed = false;

    const poll = async () => {
      if (stopped || completed) return;

      try {
        const data = await fetchDepositStatus(depositId);
        if (stopped || completed) return;

        const status = data?.status || 'pending';

        if (onStatus) onStatus(status, data);

        if (status === 'completed') {
          completed = true;
          stopped = true;
          try {
            const { balanceService } = await import('./balance.service.js');
            const { campaignService } = await import('./campaign.service.js');
            const { referralService } = await import('./referral.service.js');
            await Promise.allSettled([
              balanceService.fetchBalances({ notify: true }),
              campaignService.fetchBoard({ notify: true }),
              referralService.fetchSummary({ notify: true }),
            ]);
          } catch {
            // best-effort refresh
          }
          if (onComplete) onComplete(data);
          return;
        }

        if (status === 'below_minimum') {
          completed = true;
          stopped = true;
          if (typeof callbacks.onBelowMinimum === 'function') {
            callbacks.onBelowMinimum(data);
          }
          return;
        }
      } catch {
        // keep polling on transient errors
      }

      if (!stopped && !completed) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      stopped = true;
    };
  },

  /**
   * @param {string} [category]
   * @returns {Promise<{ items: Array<object>, transactions: Array<object>, category: string, categories: string[] }>}
   */
  async fetchHistory(category = 'all') {
    const data = await fetchHistory(category);
    const items = Array.isArray(data?.items)
      ? data.items
      : (Array.isArray(data?.transactions) ? data.transactions : []);
    return {
      items,
      transactions: Array.isArray(data?.transactions) ? data.transactions : items,
      category: data?.category || category || 'all',
      categories: Array.isArray(data?.categories) ? data.categories : [],
    };
  },
};
