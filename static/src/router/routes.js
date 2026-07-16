/**
 * Route definitions — registry of RouteController factories.
 *
 * Adding a future game (Mines, Roulette, …):
 * 1. Add ROUTE_NAMES entry
 * 2. Add a ROUTES entry with createController factory
 * No router logic changes required.
 */

import { createHomeController } from '../pages/home.page.js';
import {
  ROUTE_NAMES,
  DEFAULT_ROUTE,
  NAV_ROUTE_MAP,
  NAV_ROUTES,
} from './route-names.js';

export { ROUTE_NAMES, DEFAULT_ROUTE, NAV_ROUTE_MAP, NAV_ROUTES };

/**
 * @typedef {object} RouteDefinition
 * @property {string} navId
 * @property {() => (import('./route-controller.js').RouteController | Promise<import('./route-controller.js').RouteController>)} createController
 */

/**
 * Registered application routes.
 * @type {Record<string, RouteDefinition>}
 */
export const ROUTES = {
  [ROUTE_NAMES.HOME]: {
    navId: 'casino',
    createController: createHomeController,
  },
  [ROUTE_NAMES.DICE]: {
    navId: 'casino',
    async createController() {
      const { createDiceController } = await import('../pages/dice.page.js');
      return createDiceController();
    },
  },
  [ROUTE_NAMES.PLINKO]: {
    navId: 'casino',
    async createController() {
      const { createPlinkoController } = await import('../pages/plinko.page.js');
      return createPlinkoController();
    },
  },
  [ROUTE_NAMES.CRASH]: {
    navId: 'casino',
    async createController() {
      const { createCrashController } = await import('../pages/crash.page.js');
      return createCrashController();
    },
  },
};
