/**
 * Client-side router.
 */

import {
  ROUTES,
  DEFAULT_ROUTE,
  NAV_ROUTE_MAP,
  ROUTE_NAMES,
} from './routes.js';
import { initOverlayManager, overlayManager } from '../overlays/index.js';
import { DURATION, wait, waitFrames } from '../animations/transitions.js';

/** @type {object|null} */
let shell = null;

/** @type {string|null} */
let currentRoute = null;

/** @type {string} */
let activeNavId = 'casino';

/** @type {boolean} */
let hasNavigatedOnce = false;

/** @type {boolean} */
let isNavigating = false;

/** @type {Map<string, HTMLElement>} */
const pageCache = new Map();

/** @type {Map<string, number>} */
const scrollPositions = new Map();

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
  activeNavId = navId;
  if (!shell?.updateBottomNavigation) return;
  shell.updateBottomNavigation(navId, navigateByNavId);
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

  const routeName = NAV_ROUTE_MAP[navId];

  if (!routeName) {
    return;
  }

  void navigate(routeName);
}

/**
 * @param {string} routeName
 */
function updateRouteChrome(routeName) {
  if (!shell?.root) return;

  const immersive =
    routeName === ROUTE_NAMES.DICE
    || routeName === ROUTE_NAMES.PLINKO
    || routeName === ROUTE_NAMES.CRASH;
  shell.root.classList.toggle('t-app--game-immersive', immersive);

  const header = shell.root.querySelector('.app-header');
  header?.classList.toggle('app-header--game', immersive);
}

/**
 * @param {string} routeName
 */
export async function navigate(routeName) {
  if (!shell || isNavigating) return;

  const route = ROUTES[routeName];
  if (!route) return;

  const hadOverlay = overlayManager.isOpen();

  if (hadOverlay) {
    await overlayManager.close({ restoreNavId: route.navId });
  }

  if (currentRoute === routeName) {
    updateBottomNav(route.navId);
    updateRouteChrome(routeName);
    return;
  }

  isNavigating = true;

  try {
    if (currentRoute && shell.pageContainer) {
      scrollPositions.set(currentRoute, shell.pageContainer.scrollTop);
    }

    const shouldAnimate = hasNavigatedOnce && currentRoute !== null && !hadOverlay;

    if (shouldAnimate) {
      shell.setPageTransition('exit');
      await wait(DURATION.fast);
    }

    let page = pageCache.get(routeName);
    if (!page) {
      page = route.render();
      pageCache.set(routeName, page);
    }

    shell.setPageContent(page);
    currentRoute = routeName;
    hasNavigatedOnce = true;

    shell.pageContainer.scrollTop = scrollPositions.get(routeName) ?? 0;

    updateBottomNav(route.navId);
    updateRouteChrome(routeName);

    if (shouldAnimate) {
      shell.setPageTransition('enter');
      await waitFrames(2);
      shell.setPageTransition('active');
    } else {
      shell.setPageTransition('active');
    }
  } finally {
    isNavigating = false;
  }
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

  const profileButton = shell.root.querySelector('.app-header__profile');
  if (profileButton && !profileButton.dataset.wired) {
    profileButton.dataset.wired = 'true';
    profileButton.addEventListener('click', () => {
      navigateByNavId('profile');
    });
  }

  const logoButton = shell.root.querySelector('.app-header__logo');
  if (logoButton && !logoButton.dataset.wired) {
    logoButton.dataset.wired = 'true';
    logoButton.addEventListener('click', () => {
      navigateByNavId('casino');
    });
    logoButton.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigateByNavId('casino');
      }
    });
  }

  const backButton = shell.root.querySelector('.app-header__back');
  if (backButton && !backButton.dataset.wired) {
    backButton.dataset.wired = 'true';
    backButton.addEventListener('click', () => {
      void navigate(ROUTE_NAMES.HOME);
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
  void navigate(DEFAULT_ROUTE);
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
