/**
 * Bonus catalog API — My Bonuses board + detail.
 */

import { request } from './request.js';

/**
 * @returns {Promise<{ hero: object, filters: object[], bonuses: object[], completed_deposits?: number }>}
 */
export async function fetchBonusCatalog() {
  return request('/api/bonuses/catalog');
}

/**
 * @param {string} bonusId
 * @returns {Promise<object>}
 */
export async function fetchBonusCatalogItem(bonusId) {
  return request(`/api/bonuses/catalog/${encodeURIComponent(bonusId)}`);
}
