/**
 * Route name constants and navigation map.
 * Kept separate from routes.js to avoid circular imports with page modules.
 */

export const ROUTE_NAMES = {
  HOME: 'home',
  DICE: 'dice',
  PLINKO: 'plinko',
  CRASH: 'crash',
};

export const DEFAULT_ROUTE = ROUTE_NAMES.HOME;

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
