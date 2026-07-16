/**
 * Route definitions.
 *
 * Games are lazy-loaded so Crash / Dice / Plinko bundles download only when opened.
 * Home stays static for faster first paint after shell boot.
 */

import { renderHomePage } from '../pages/home.page.js';
import {
  ROUTE_NAMES,
  DEFAULT_ROUTE,
  NAV_ROUTE_MAP,
  NAV_ROUTES,
} from './route-names.js';

export { ROUTE_NAMES, DEFAULT_ROUTE, NAV_ROUTE_MAP, NAV_ROUTES };

/**
 * Registered application routes.
 * @type {Record<string, { navId: string, render: () => HTMLElement | Promise<HTMLElement> }>}
 */
export const ROUTES = {
  [ROUTE_NAMES.HOME]: {
    navId: 'casino',
    render: renderHomePage,
  },
  [ROUTE_NAMES.DICE]: {
    navId: 'casino',
    async render() {
      const { renderDicePage } = await import('../pages/dice.page.js');
      return renderDicePage();
    },
  },
  [ROUTE_NAMES.PLINKO]: {
    navId: 'casino',
    async render() {
      const { renderPlinkoPage } = await import('../pages/plinko.page.js');
      return renderPlinkoPage();
    },
  },
  [ROUTE_NAMES.CRASH]: {
    navId: 'casino',
    async render() {
      const { renderCrashPage } = await import('../pages/crash.page.js');
      return renderCrashPage();
    },
  },
};
