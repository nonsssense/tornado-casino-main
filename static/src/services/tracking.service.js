/**
 * Event tracking service — thin wrapper over /api/events.
 * Guest Mode skips network calls (no session to attribute events to).
 */

import { trackClientEvent } from '../api/events.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import { isAuthenticated } from './auth-state.js';

const GAME_ROUTES = new Set([
  ROUTE_NAMES.DICE,
  ROUTE_NAMES.PLINKO,
  ROUTE_NAMES.CRASH,
]);

function trackIfAuthenticated(eventType) {
  if (!isAuthenticated()) return Promise.resolve(null);
  return trackClientEvent(eventType);
}

export const trackingService = {
  appOpen() {
    return trackIfAuthenticated('app_open');
  },

  pageNav() {
    return trackIfAuthenticated('page_nav');
  },

  /**
   * @param {string|null|undefined} routeName
   */
  gameOpen(routeName) {
    if (!GAME_ROUTES.has(routeName)) return Promise.resolve(null);
    return trackIfAuthenticated('game_open');
  },

  /**
   * @param {string|null|undefined} routeName
   */
  gameClose(routeName) {
    if (!GAME_ROUTES.has(routeName)) return Promise.resolve(null);
    return trackIfAuthenticated('game_close');
  },

  isGameRoute(routeName) {
    return GAME_ROUTES.has(routeName);
  },
};
