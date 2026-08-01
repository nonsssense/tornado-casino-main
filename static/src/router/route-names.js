/**
 * Route name constants and navigation map.
 * Kept separate from routes.js to avoid circular imports with page modules.
 */

export const ROUTE_NAMES = {
  HOME: 'home',
  DICE: 'dice',
  PLINKO: 'plinko',
  CRASH: 'crash',
  BONUSES: 'bonuses',
  BONUS_DETAIL: 'bonus-detail',
};

export const DEFAULT_ROUTE = ROUTE_NAMES.HOME;

/**
 * Screen types drive chrome (bottom nav / back button).
 * - app: main application flow — bottom nav visible
 * - standalone: full-screen page that replaces the main view — bottom nav hidden
 *
 * Overlays are not routes; they never change this chrome and keep the nav
 * of the underlying app screen.
 */
export const SCREEN_TYPES = Object.freeze({
  APP: 'app',
  STANDALONE: 'standalone',
});

/**
 * Maps bottom navigation ids to route names.
 * null = handled separately (wallet opens deposit overlay).
 * @type {Record<string, string|null>}
 */
export const NAV_ROUTE_MAP = {
  wallet: null,
  referrals: null,
  casino: ROUTE_NAMES.HOME,
  profile: null,
};

export const NAV_ROUTES = Object.keys(NAV_ROUTE_MAP);
