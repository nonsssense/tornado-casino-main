/**
 * Bonus catalog service — caches My Bonuses Bonus Cards from the backend.
 *
 * Filtering is category-based and driven by API filter definitions.
 * The UI must not invent bonus logic — it only renders received cards.
 */

import { fetchBonusCatalog, fetchBonusCatalogItem } from '../api/bonus-catalog.js';

/** @type {Set<function>} */
const listeners = new Set();

/** @type {{ hero: object, filters: object[], bonuses: object[], completed_deposits?: number }|null} */
let cached = null;

function notify() {
  if (!cached) return;
  listeners.forEach((listener) => listener(cached));
}

/**
 * @param {object} card
 * @param {string|null|undefined} category
 * @returns {boolean}
 */
export function cardMatchesCategory(card, category) {
  if (!category) return true;
  const cats = Array.isArray(card?.categories) ? card.categories : [];
  return cats.map((c) => String(c).toLowerCase()).includes(String(category).toLowerCase());
}

/**
 * @param {object[]} bonuses
 * @param {object} filter
 * @returns {object[]}
 */
export function filterBonuses(bonuses, filter) {
  const list = Array.isArray(bonuses) ? bonuses : [];
  const category = filter?.category ?? null;
  return list
    .filter((card) => cardMatchesCategory(card, category))
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export const bonusCatalogService = {
  async fetchCatalog(options = {}) {
    const { notify: shouldNotify = true } = options;
    const data = await fetchBonusCatalog();
    cached = {
      hero: data?.hero && typeof data.hero === 'object' ? data.hero : {},
      filters: Array.isArray(data?.filters) ? data.filters : [],
      bonuses: Array.isArray(data?.bonuses) ? data.bonuses : [],
      completed_deposits: data?.completed_deposits ?? null,
    };
    if (shouldNotify) notify();
    return cached;
  },

  getCatalog() {
    return cached;
  },

  /**
   * @param {string} bonusId
   */
  async fetchDetail(bonusId) {
    return fetchBonusCatalogItem(bonusId);
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
