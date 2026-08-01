/**
 * Bonuses page constants — fallbacks only.
 * Live filters / hero come from GET /api/bonuses/catalog.
 */

export const BONUS_ASSETS = {
  heroFallback: '/assets/bonuses-main-banner.webp',
  detailByTier: {
    deposit_tier_1: '/assets/bonus-info-50.png',
    deposit_tier_2: '/assets/bonus-info-75.png',
    deposit_tier_3: '/assets/bonus-info-100.png',
  },
};

/** Used only before the catalog response arrives. */
export const BONUS_FILTERS_FALLBACK = [
  { id: 'my_bonuses', category: 'my_bonuses', label_key: 'bonuses.filters.yours' },
  { id: 'all', category: null, label_key: 'bonuses.filters.all' },
  { id: 'promocode', category: 'promocode', label_key: 'bonuses.filters.promo' },
  { id: 'deposit', category: 'deposit', label_key: 'bonuses.filters.deposit' },
];
