/**
 * Route definitions.
 */

import { renderHomePage } from '../pages/home.page.js';
import { renderDicePage } from '../pages/dice.page.js';
import { renderPlinkoPage } from '../pages/plinko.page.js';
import { renderCrashPage } from '../pages/crash.page.js';
import {
  ROUTE_NAMES,
  DEFAULT_ROUTE,
  NAV_ROUTE_MAP,
  NAV_ROUTES,
} from './route-names.js';

export { ROUTE_NAMES, DEFAULT_ROUTE, NAV_ROUTE_MAP, NAV_ROUTES };

/**
 * Registered application routes.
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
  [ROUTE_NAMES.CRASH]: {
    navId: 'casino',
    render: renderCrashPage,
  },
};
