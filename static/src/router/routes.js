/**
 * Route definitions — registry of RouteController factories.
 *
 * Adding a future game (Mines, Roulette, …):
 * 1. Add ROUTE_NAMES entry
 * 2. Add a ROUTES entry with createController factory + screenType
 * No router logic changes required.
 *
 * screenType is the single source of truth for bottom-nav visibility:
 * - app → show bottom navigation
 * - standalone → hide bottom navigation (full-screen page)
 * Overlays are not routes and never toggle this chrome.
 */

import { createHomeController } from '../pages/home.page.js';
import {
  ROUTE_NAMES,
  DEFAULT_ROUTE,
  NAV_ROUTE_MAP,
  NAV_ROUTES,
  SCREEN_TYPES,
} from './route-names.js';

export {
  ROUTE_NAMES,
  DEFAULT_ROUTE,
  NAV_ROUTE_MAP,
  NAV_ROUTES,
  SCREEN_TYPES,
};

/**
 * @typedef {object} RouteDefinition
 * @property {string} navId
 * @property {'app'|'standalone'} screenType
 * @property {() => (import('./route-controller.js').RouteController | Promise<import('./route-controller.js').RouteController>)} createController
 */

/**
 * Registered application routes.
 * @type {Record<string, RouteDefinition>}
 */
export const ROUTES = {
  [ROUTE_NAMES.HOME]: {
    navId: 'casino',
    screenType: SCREEN_TYPES.APP,
    createController: createHomeController,
  },
  [ROUTE_NAMES.DICE]: {
    navId: 'casino',
    screenType: SCREEN_TYPES.STANDALONE,
    async createController() {
      const { createDiceController } = await import('../pages/dice.page.js');
      return createDiceController();
    },
  },
  [ROUTE_NAMES.PLINKO]: {
    navId: 'casino',
    screenType: SCREEN_TYPES.STANDALONE,
    async createController() {
      const { createPlinkoController } = await import('../pages/plinko.page.js');
      return createPlinkoController();
    },
  },
  [ROUTE_NAMES.CRASH]: {
    navId: 'casino',
    screenType: SCREEN_TYPES.STANDALONE,
    async createController() {
      const { createCrashController } = await import('../pages/crash.page.js');
      return createCrashController();
    },
  },
  [ROUTE_NAMES.BONUSES]: {
    navId: 'profile',
    screenType: SCREEN_TYPES.STANDALONE,
    async createController() {
      const { createBonusesController } = await import('../pages/bonuses.page.js');
      return createBonusesController();
    },
  },
  [ROUTE_NAMES.PERSONAL_DATA]: {
    navId: 'profile',
    screenType: SCREEN_TYPES.STANDALONE,
    async createController() {
      const { createPersonalDataController } = await import('../pages/personal-data.page.js');
      return createPersonalDataController();
    },
  },
  [ROUTE_NAMES.BONUS_DETAIL]: {
    navId: 'profile',
    screenType: SCREEN_TYPES.STANDALONE,
    async createController() {
      const { createBonusDetailController } = await import('../pages/bonus-detail.page.js');
      return createBonusDetailController();
    },
  },
};

/**
 * @param {string} routeName
 * @returns {boolean}
 */
export function isStandaloneRoute(routeName) {
  return ROUTES[routeName]?.screenType === SCREEN_TYPES.STANDALONE;
}
