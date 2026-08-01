/**
 * Dice route controller — retain DOM; never retain active roll RAF.
 */

import { createElement } from '../utils/dom.js';
import { DiceGame } from '../games/dice/index.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import {
  createRouteController,
  defineRoutePolicy,
} from '../router/route-controller.js';
import '../../styles/pages/dice.css';

/**
 * @returns {import('../router/route-controller.js').RouteController}
 */
export function createDiceController() {
  return createRouteController({
    name: ROUTE_NAMES.DICE,
    policy: defineRoutePolicy({
      retainController: true,
      retainDom: true,
      screenType: 'standalone',
      showRouteSkeleton: true,
    }),
    createRoot() {
      return createElement('div', {
        className: 'game-page game-page--dice route-root',
        attrs: { 'data-page': 'dice', 'data-route': ROUTE_NAMES.DICE },
      });
    },
    activate(root, ctx) {
      if (ctx.signal?.aborted) return;
      DiceGame.mount(root);
    },
    deactivate() {
      DiceGame.unmount({ keepDom: true });
    },
    destroy(root) {
      DiceGame.unmount({ keepDom: false });
      root.replaceChildren();
    },
  });
}

/**
 * @deprecated Use createDiceController
 * @returns {HTMLElement}
 */
export function renderDicePage() {
  const controller = createDiceController();
  void controller.load();
  void controller.activate({
    reason: 'navigate',
    fromRoute: null,
    signal: new AbortController().signal,
  });
  return controller.getRoot();
}
