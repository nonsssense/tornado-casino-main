/**
 * Plinko route controller — retain DOM on success; discard after failed activate.
 */

import { createElement } from '../utils/dom.js';
import { PlinkoGame } from '../games/plinko/index.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import {
  createRouteController,
  defineRoutePolicy,
} from '../router/route-controller.js';
import '../../styles/pages/plinko.css';

/**
 * @returns {import('../router/route-controller.js').RouteController}
 */
export function createPlinkoController() {
  let activateFailed = false;

  return createRouteController({
    name: ROUTE_NAMES.PLINKO,
    policy: defineRoutePolicy({
      retainController: true,
      retainDom: true,
      immersive: true,
      showRouteSkeleton: true,
    }),
    createRoot() {
      return createElement('div', {
        className: 'game-page game-page--plinko route-root',
        attrs: { 'data-page': 'plinko', 'data-route': ROUTE_NAMES.PLINKO },
      });
    },
    async activate(root, ctx) {
      if (ctx.signal?.aborted) return;
      activateFailed = false;
      const ok = await PlinkoGame.mount(root, { signal: ctx.signal });
      if (ctx.signal?.aborted) {
        PlinkoGame.unmount({ keepDom: false });
        return;
      }
      activateFailed = ok === false;
    },
    deactivate() {
      PlinkoGame.unmount({ keepDom: !activateFailed });
    },
    destroy(root) {
      PlinkoGame.unmount({ keepDom: false });
      activateFailed = false;
      root.replaceChildren();
    },
    shouldDiscardAfterDeactivate() {
      return activateFailed;
    },
  });
}

/**
 * @deprecated Use createPlinkoController
 * @returns {HTMLElement}
 */
export function renderPlinkoPage() {
  const controller = createPlinkoController();
  void controller.load();
  void controller.activate({
    reason: 'navigate',
    fromRoute: null,
    signal: new AbortController().signal,
  });
  return controller.getRoot();
}
