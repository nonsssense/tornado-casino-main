/**
 * Bonuses route — My Bonuses catalog as a full application page.
 */

import { createElement } from '../utils/dom.js';
import { createBonusesModal } from '../features/bonuses/bonuses.modal.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import {
  createRouteController,
  defineRoutePolicy,
} from '../router/route-controller.js';
import '../../styles/pages/bonuses.css';

/**
 * @returns {import('../router/route-controller.js').RouteController}
 */
export function createBonusesController() {
  /** @type {{ element: HTMLElement, destroy: () => void }|null} */
  let modal = null;

  return createRouteController({
    name: ROUTE_NAMES.BONUSES,
    policy: defineRoutePolicy({
      retainController: true,
      retainDom: true,
      screenType: 'standalone',
      showRouteSkeleton: false,
    }),
    createRoot() {
      return createElement('div', {
        className: 'route-root route-root--bonuses',
        attrs: { 'data-route': ROUTE_NAMES.BONUSES },
      });
    },
    load(root) {
      if (!modal) {
        modal = createBonusesModal();
      }
      if (modal.element.parentElement !== root) {
        root.replaceChildren(modal.element);
      }
    },
    activate() {
      // Ensure the catalog hero is visible whenever this route is shown.
      const hero = modal?.element?.querySelector?.('.bonuses-hero');
      hero?.removeAttribute('hidden');
    },
    deactivate() {
      // Soft leave — retain DOM/controller for fast return.
    },
    destroy(root) {
      modal?.destroy();
      modal = null;
      root.replaceChildren();
    },
  });
}
