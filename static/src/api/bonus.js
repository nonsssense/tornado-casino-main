/**
 * Bonus API.
 *
 * Responsibility:
 * - GET /api/bonus/offers — deposit-selectable campaigns from BonusManager
 * - GET /api/bonus/active — active bonus instances
 * - POST /api/bonus/select — persist selected deposit offer
 */

import { request } from './request.js';

/**
 * @returns {Promise<{ offers: Array<object>, selected_offer_id: string|null }>}
 */
export async function fetchBonusOffers() {
  return request('/api/bonus/offers');
}

/**
 * @returns {Promise<{ bonuses: Array<object> }>}
 */
export async function fetchActiveBonuses() {
  return request('/api/bonus/active');
}

/**
 * @param {string} offerId
 * @returns {Promise<{ offers: Array<object>, selected_offer_id: string|null }>}
 */
export async function selectBonusOffer(offerId) {
  return request('/api/bonus/select', {
    method: 'POST',
    body: JSON.stringify({ offer_id: offerId }),
  });
}
