/**
 * Campaigns API — Campaign Engine player board.
 */

import { request } from './request.js';

/**
 * @returns {Promise<{ yours: object[], available: object[], active_bonuses: object[] }>}
 */
export async function fetchCampaigns() {
  return request('/api/campaigns');
}

/**
 * @param {number} campaignId
 * @returns {Promise<object>}
 */
export async function fetchCampaignDetail(campaignId) {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}`);
}
