/**
 * Referral service — player referral dashboard state.
 */

import { fetchReferralSummary, fetchReferralStatus, claimReferralEarnings } from '../api/referrals.js';
import { balanceService } from './balance.service.js';

/** @type {Set<function>} */
const listeners = new Set();

/** @type {object|null} */
let cached = null;

/** @type {{ status: string, tier: string }|null} */
let cachedStatus = null;

function notify() {
  if (!cached) return;
  listeners.forEach((listener) => listener(cached));
}

export const referralService = {
  /**
   * @param {{ notify?: boolean }} [options]
   */
  async fetchSummary(options = {}) {
    const { notify: shouldNotify = true } = options;
    cached = await fetchReferralSummary();
    if (cached?.status) {
      cachedStatus = { status: cached.status, tier: cached.tier || cached.status };
    }
    if (shouldNotify) notify();
    return cached;
  },

  /**
   * Lightweight status for Profile — does not load the full dashboard summary.
   * @returns {Promise<{ status: string, tier: string }>}
   */
  async fetchStatus() {
    cachedStatus = await fetchReferralStatus();
    if (cached && cachedStatus?.status) {
      cached = {
        ...cached,
        status: cachedStatus.status,
        tier: cachedStatus.tier || cachedStatus.status,
      };
      notify();
    }
    return cachedStatus;
  },

  getSummary() {
    return cached;
  },

  getStatus() {
    return cachedStatus?.status
      || cached?.status
      || null;
  },

  async claim() {
    const result = await claimReferralEarnings();
    await Promise.all([
      this.fetchSummary({ notify: true }),
      balanceService.fetchBalances({ notify: true }),
    ]);
    return result;
  },

  /**
   * @param {function} callback
   * @returns {function(): void}
   */
  subscribe(callback) {
    listeners.add(callback);
    if (cached) callback(cached);
    return () => listeners.delete(callback);
  },

  notify,
};
