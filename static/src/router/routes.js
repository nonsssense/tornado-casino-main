/**
 * Route definitions.
 */

import { renderHomePage } from '../pages/home.page.js';

export const ROUTE_NAMES = {
  HOME: 'home',
};

export const DEFAULT_ROUTE = ROUTE_NAMES.HOME;

/**
 * Registered application routes.
 * @type {Record<string, { navId: string, render: () => HTMLElement }>}
 */
export const ROUTES = {
  [ROUTE_NAMES.HOME]: {
    navId: 'casino',
    render: renderHomePage,
  },
};

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
