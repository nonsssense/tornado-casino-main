/**
 * Event tracking service — thin wrapper over /api/events.
 */

import { trackClientEvent } from '../api/events.js';
import { ROUTE_NAMES } from '../router/route-names.js';

const GAME_ROUTES = new Set([
  ROUTE_NAMES.DICE,
  ROUTE_NAMES.PLINKO,
  ROUTE_NAMES.CRASH,
]);

export const trackingService = {
  appOpen() {
    return trackClientEvent('app_open');
  },

  pageNav() {
    return trackClientEvent('page_nav');
  },

  /**
   * @param {string|null|undefined} routeName
   */
  gameOpen(routeName) {
    if (!GAME_ROUTES.has(routeName)) return Promise.resolve(null);
    return trackClientEvent('game_open');
  },

  /**
   * @param {string|null|undefined} routeName
   */
  gameClose(routeName) {
    if (!GAME_ROUTES.has(routeName)) return Promise.resolve(null);
    return trackClientEvent('game_close');
  },

  isGameRoute(routeName) {
    return GAME_ROUTES.has(routeName);
  },
};
