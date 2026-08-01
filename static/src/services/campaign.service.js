/**
 * Campaign service — caches Campaign Engine board for Bonuses UI.
 */

import { fetchCampaigns, fetchCampaignDetail } from '../api/campaigns.js';

/** @type {Set<function>} */
const listeners = new Set();

/** @type {{ yours: object[], available: object[], active_bonuses: object[] }|null} */
let cached = null;

function notify() {
  if (!cached) return;
  listeners.forEach((listener) => listener(cached));
}

export const campaignService = {
  /**
   * @param {{ notify?: boolean }} [options]
   */
  async fetchBoard(options = {}) {
    const { notify: shouldNotify = true } = options;
    const data = await fetchCampaigns();
    cached = {
      yours: Array.isArray(data?.yours) ? data.yours : [],
      available: Array.isArray(data?.available) ? data.available : [],
      active_bonuses: Array.isArray(data?.active_bonuses) ? data.active_bonuses : [],
    };
    if (shouldNotify) notify();
    return cached;
  },

  getBoard() {
    return cached;
  },

  /**
   * @param {number} campaignId
   */
  async fetchDetail(campaignId) {
    return fetchCampaignDetail(campaignId);
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
