/**
 * Crash route controller — live session; runtime never survives deactivate.
 */

import { createElement } from '../utils/dom.js';
import { CrashGame } from '../games/crash/index.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import {
  createRouteController,
  defineRoutePolicy,
} from '../router/route-controller.js';
import '../../styles/pages/crash.css';

/**
 * @returns {import('../router/route-controller.js').RouteController}
 */
export function createCrashController() {
  return createRouteController({
    name: ROUTE_NAMES.CRASH,
    policy: defineRoutePolicy({
      retainController: true,
      retainDom: true,
      immersive: true,
      showRouteSkeleton: true,
    }),
    createRoot() {
      return createElement('div', {
        className: 'game-page game-page--crash route-root',
        attrs: { 'data-page': 'crash', 'data-route': ROUTE_NAMES.CRASH },
      });
    },
    activate(root, ctx) {
      if (ctx.signal?.aborted) return;
      CrashGame.mount(root, { signal: ctx.signal });
    },
    deactivate(root) {
      CrashGame.unmount();
      // Keep shell; drop heavy session DOM (canvas / panels).
      root.replaceChildren();
    },
    destroy(root) {
      CrashGame.unmount();
      root.replaceChildren();
    },
  });
}

/**
 * @deprecated Use createCrashController
 * @returns {HTMLElement}
 */
export function renderCrashPage() {
  const controller = createCrashController();
  void controller.load();
  void controller.activate({
    reason: 'navigate',
    fromRoute: null,
    signal: new AbortController().signal,
  });
  return controller.getRoot();
}
