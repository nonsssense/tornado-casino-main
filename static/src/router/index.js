/**
 * Client-side router — lifecycle-aware navigation via RouteControllers.
 *
 * Owns: navigation, controller cache, attachment, lifecycle, transitions.
 * Does not own: game/WebSocket/RAF specifics (controllers do).
 */

import {
  ROUTES,
  DEFAULT_ROUTE,
  NAV_ROUTE_MAP,
  ROUTE_NAMES,
} from './routes.js';
import { initOverlayManager, overlayManager } from '../overlays/index.js';
import { DURATION, wait, waitFrames } from '../animations/transitions.js';
import { t } from '../i18n/index.js';
import { BOTTOM_NAV_ITEMS } from '../utils/constants.js';
import {
  bindTelegramBackButton,
  isTelegramBackButtonSupported,
  setTelegramBackButtonVisible,
  ensureTelegramReady,
} from '../app/telegram.js';

/** @type {object|null} */
let shell = null;

/** @type {string|null} */
let currentRoute = null;

/** @type {import('./route-controller.js').RouteController|null} */
let currentController = null;

/** @type {string} */
let activeNavId = 'casino';

/** @type {boolean} */
let hasNavigatedOnce = false;

/** @type {Map<string, import('./route-controller.js').RouteController>} */
const controllerCache = new Map();

/** @type {Map<string, number>} */
const scrollPositions = new Map();

/** @type {number} */
let navigationGeneration = 0;

/** @type {AbortController|null} */
let activeNavigationAbort = null;

/**
 * @param {string} navId
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
 * @param {import('./route-controller.js').RouteController|null} controller
 * @param {string} routeName
 */
function updateRouteChrome(controller, routeName) {
  if (!shell?.root) return;

  const immersive = Boolean(controller?.policy?.immersive);
  shell.root.classList.toggle('t-app--game-immersive', immersive);

  const header = shell.root.querySelector('.app-header');
  header?.classList.toggle('app-header--game', immersive);

  const useNativeBack = isTelegramBackButtonSupported();
  header?.classList.toggle('app-header--native-back', useNativeBack && immersive);
  setTelegramBackButtonVisible(useNativeBack && immersive);

  void routeName;
}

/**
 * @param {string} routeName
 * @returns {Promise<import('./route-controller.js').RouteController>}
 */
async function ensureController(routeName) {
  const cached = controllerCache.get(routeName);
  if (cached) {
    return cached;
  }

  const definition = ROUTES[routeName];
  if (!definition?.createController) {
    throw new Error(`Unknown route: ${routeName}`);
  }

  const controller = await definition.createController();
  await controller.load();

  if (controller.policy.retainController) {
    controllerCache.set(routeName, controller);
  }

  return controller;
}

/**
 * @param {string} routeName
 * @param {import('./route-controller.js').RouteController} controller
 */
async function discardController(routeName, controller) {
  controllerCache.delete(routeName);
  await controller.destroy();
}

/**
 * @param {string} routeName
 */
export async function navigate(routeName) {
  if (!shell) return;

  const route = ROUTES[routeName];
  if (!route) return;

  const generation = ++navigationGeneration;
  activeNavigationAbort?.abort();
  const abortController = new AbortController();
  activeNavigationAbort = abortController;
  const { signal } = abortController;

  const isStale = () => generation !== navigationGeneration || signal.aborted;

  const hadOverlay = overlayManager.isOpen();

  if (hadOverlay) {
    await overlayManager.close({ restoreNavId: route.navId });
    if (isStale()) return;
  }

  if (currentRoute === routeName && currentController) {
    updateBottomNav(route.navId);
    updateRouteChrome(currentController, routeName);
    return;
  }

  const previousRoute = currentRoute;
  const previousController = currentController;

  try {
    if (previousRoute && shell.pageContainer) {
      scrollPositions.set(previousRoute, shell.pageContainer.scrollTop);
    }

    const shouldAnimate = hasNavigatedOnce && previousRoute !== null && !hadOverlay;

    if (shouldAnimate) {
      shell.setPageTransition('exit');
      await wait(DURATION.fast);
      if (isStale()) return;
    }

    // 1–2. Deactivate previous (stops all page-owned runtime)
    if (previousController) {
      await previousController.deactivate({
        reason: 'navigate',
        toRoute: routeName,
      });
      if (isStale()) return;

      if (
        typeof previousController.shouldDiscardAfterDeactivate === 'function'
        && previousController.shouldDiscardAfterDeactivate()
      ) {
        await discardController(previousRoute, previousController);
      } else if (!previousController.policy.retainController) {
        await discardController(previousRoute, previousController);
      }

      // Clear current pointers after leave so aborted navigations cannot
      // treat a deactivated controller as still active.
      if (currentController === previousController) {
        currentController = null;
        currentRoute = null;
      }
    }

    if (isStale()) return;

    // 3–4. Load next controller if necessary
    const nextController = await ensureController(routeName);
    if (isStale()) return;

    // 5. Attach next page
    shell.setPageContent(nextController.getRoot());
    currentRoute = routeName;
    currentController = nextController;
    hasNavigatedOnce = true;

    shell.pageContainer.scrollTop = scrollPositions.get(routeName) ?? 0;

    updateBottomNav(route.navId);
    updateRouteChrome(nextController, routeName);

    if (shouldAnimate) {
      shell.setPageTransition('enter');
      await waitFrames(2);
      if (isStale()) return;
      shell.setPageTransition('active');
    } else {
      shell.setPageTransition('active');
    }

    // 6. Activate next controller
    await nextController.activate({
      reason: 'navigate',
      fromRoute: previousRoute,
      signal,
    });

    if (isStale()) {
      // Superseded during activate — tear down live work; newer nav owns the UI.
      await nextController.deactivate({
        reason: 'navigate',
        toRoute: null,
      });
      return;
    }

    if (
      typeof nextController.shouldDiscardAfterDeactivate === 'function'
      && nextController.shouldDiscardAfterDeactivate()
    ) {
      // Failed activate (e.g. Plinko config) — do not keep a poisoned controller.
      // Keep it until leave so user sees the error; discard flag applies on leave.
    }
  } catch (error) {
    if (!isStale()) {
      console.error('[router] navigate failed', routeName, error);
    }
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

  ensureTelegramReady();
  bindTelegramBackButton(() => {
    void navigate(ROUTE_NAMES.HOME);
  });
  setTelegramBackButtonVisible(false);

  const routeParam = new URLSearchParams(window.location.search).get('route');
  const startRoute = routeParam && ROUTES[routeParam] ? routeParam : DEFAULT_ROUTE;
  updateBottomNav(ROUTES[startRoute].navId);
  void navigate(startRoute);
}

/**
 * @returns {string|null}
 */
export function getCurrentRoute() {
  return currentRoute;
}

/**
 * Re-render chrome + current page after a locale change (no full reload).
 */
export async function refreshForLocale() {
  if (!shell) return;

  const controllers = [...controllerCache.entries()];
  controllerCache.clear();
  currentController = null;

  await Promise.all(controllers.map(([, controller]) => controller.destroy()));

  const nav = shell.bottomNav;
  if (nav) {
    BOTTOM_NAV_ITEMS.forEach((item) => {
      const label = nav.querySelector(`[data-nav="${item.id}"] .bottom-nav__label`);
      if (label) label.textContent = t(`nav.${item.id}`);
    });
    nav.setAttribute('aria-label', t('nav.ariaLabel'));
  }

  const header = shell.root?.querySelector('.app-header');
  if (header) {
    const logo = header.querySelector('.app-header__logo');
    if (logo) {
      logo.setAttribute('alt', t('brand.name'));
      logo.setAttribute('aria-label', t('header.home'));
    }
    header.querySelector('.app-header__back')?.setAttribute('aria-label', t('header.back'));
    header.querySelector('.app-header__profile')?.setAttribute('aria-label', t('header.profile'));

    const pill = header.querySelector('.balance__pill');
    if (pill) {
      const loading = pill.classList.contains('balance__pill--loading');
      pill.setAttribute('aria-label', loading ? t('balance.aria.loading') : t('balance.aria.open'));
    }
    header.querySelector('.balance__add')?.setAttribute('aria-label', t('balance.aria.deposit'));
  }

  const routeName = currentRoute;
  if (!routeName || !ROUTES[routeName]) return;

  currentRoute = null;
  await navigate(routeName);
}

export const router = {
  init: initRouter,
  navigate,
  navigateByNavId,
  getCurrentRoute,
  refreshForLocale,
};
