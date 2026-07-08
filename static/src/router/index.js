/**
 * Client-side router.
 */

import {
  ROUTES,
  ROUTE_NAMES,
  DEFAULT_ROUTE,
  NAV_ROUTE_MAP,
} from './routes.js';
import { initOverlayManager, overlayManager } from '../overlays/index.js';

/** @type {object|null} */
let shell = null;

/** @type {string|null} */
let currentRoute = null;

/** @type {string} */
let activeNavId = 'casino';

/**
 * @param {object} appShell
 */
function updateBottomNav(navId) {
  activeNavId = navId;
  if (!shell?.updateBottomNavigation) return;
  shell.updateBottomNavigation(navId, navigateByNavId);
}

/**
 * @param {string} navId
 */
function restoreNavHighlight(navId) {
  updateBottomNav(navId);
}

/**
 * @param {string} navId
 */
export function navigateByNavId(navId) {
  if (navId === 'wallet') {
    if (overlayManager.isOpen('wallet')) {
      void overlayManager.close();
      return;
    }

    overlayManager.openWallet({ previousNavId: activeNavId, highlightNav: true });
    return;
  }

  if (navId === 'profile') {
    if (overlayManager.isOpen('profile')) {
      void overlayManager.close();
      return;
    }

    overlayManager.openProfile({ previousNavId: activeNavId, highlightNav: true });
    return;
  }

  if (overlayManager.isOpen()) {
    void overlayManager.close();
  }

  const routeName = NAV_ROUTE_MAP[navId];

  if (!routeName) {
    return;
  }

  navigate(routeName);
}

/**
 * @param {string} routeName
 */
export function navigate(routeName) {
  if (!shell) return;

  const route = ROUTES[routeName];
  if (!route) return;

  if (currentRoute === routeName) {
    updateBottomNav(route.navId);
    return;
  }

  if (overlayManager.isOpen()) {
    void overlayManager.close();
  }

  shell.setPageTransition('enter');

  requestAnimationFrame(() => {
    const page = route.render();
    shell.setPageContent(page);
    currentRoute = routeName;
    updateBottomNav(route.navId);

    requestAnimationFrame(() => {
      shell.setPageTransition('active');
    });
  });
}

function wireHeaderActions() {
  if (!shell?.root) return;

  const depositButton = shell.root.querySelector('.balance__add');
  if (depositButton && !depositButton.dataset.wired) {
    depositButton.dataset.wired = 'true';
    depositButton.addEventListener('click', () => {
      if (overlayManager.isOpen('wallet')) {
        void overlayManager.close();
        return;
      }

      overlayManager.openDeposit({ previousNavId: activeNavId });
    });
  }

  const balanceButton = shell.root.querySelector('.balance__pill');
  if (balanceButton && !balanceButton.dataset.wired) {
    balanceButton.dataset.wired = 'true';
    balanceButton.addEventListener('click', () => {
      if (overlayManager.isOpen('balance')) {
        void overlayManager.close();
        return;
      }

      overlayManager.openBalance({ previousNavId: activeNavId });
    });
  }
}

/**
 * @param {object} appShell
 */
export function initRouter(appShell) {
  shell = appShell;
  initOverlayManager(shell, restoreNavHighlight, navigateByNavId);
  wireHeaderActions();
  updateBottomNav(ROUTES[DEFAULT_ROUTE].navId);
  navigate(DEFAULT_ROUTE);
}

/**
 * @returns {string|null}
 */
export function getCurrentRoute() {
  return currentRoute;
}

export const router = {
  init: initRouter,
  navigate,
  navigateByNavId,
  getCurrentRoute,
};
