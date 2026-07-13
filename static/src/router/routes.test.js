/**

 * Route definitions.

 */



export const ROUTE_NAMES = {
  HOME: 'home',
  DICE: 'dice',
  PLINKO: 'plinko',
};

export const DEFAULT_ROUTE = ROUTE_NAMES.HOME;

import {
  ROUTE_NAMES,

  DEFAULT_ROUTE,

  NAV_ROUTE_MAP,

  NAV_ROUTES,

} from './route-names.js';



export { ROUTE_NAMES, DEFAULT_ROUTE, NAV_ROUTE_MAP, NAV_ROUTES };



/**

 * Registered application routes.
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


 * @type {Record<string, { navId: string, render: () => HTMLElement }>}

 */

export const ROUTES = {

  [ROUTE_NAMES.HOME]: {

    navId: 'casino',

    render: renderHomePage,

  },

  [ROUTE_NAMES.DICE]: {

    navId: 'casino',

    render: renderDicePage,

  },

  [ROUTE_NAMES.PLINKO]: {

    navId: 'casino',

    render: renderPlinkoPage,

  },

};

