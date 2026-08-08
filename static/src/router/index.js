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
  isStandaloneRoute,
} from './routes.js';
import { ROUTE_NAMES } from './route-names.js';
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
import { trackingService } from '../services/tracking.service.js';

/** @type {object|null} */
let shell = null;

/** @type {string|null} */
let currentRoute = null;

/** @type {Record<string, string>|null} */
let currentParams = null;

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

/** Skip pushState while applying a popstate-driven navigation. */
let syncingFromHistory = false;

/** True after the first history entry for this SPA session is seeded. */
let historySeeded = false;

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

  if (navId === 'referrals') {
    if (overlayManager.isOpen('referrals')) {
      void overlayManager.close();
      return;
    }

    overlayManager.openReferrals({ previousNavId: activeNavId, highlightNav: true });
    return;
  }

  const routeName = NAV_ROUTE_MAP[navId];

  if (!routeName) {
    return;
  }

  void navigate(routeName);
}

/**
 * Single owner for bottom-nav / standalone chrome visibility.
 * Driven only by route screenType (app vs standalone) — never by overlay
 * open/close, and never by per-page exception lists.
 * @param {boolean} standalone
 * @param {string|null} routeName
 */
function applyStandaloneChrome(standalone, routeName = null) {
  if (!shell?.root) return;

  const next = Boolean(standalone);
  shell.root.classList.toggle('t-app--standalone', next);
  // Legacy alias kept while any cached CSS may still reference the old name.
  shell.root.classList.toggle('t-app--game-immersive', next);

  const footer = shell.root.querySelector('.t-app__footer');
  if (footer) {
    footer.hidden = next;
    footer.setAttribute('aria-hidden', next ? 'true' : 'false');
  }

  const header = shell.root.querySelector('.app-header');
  // "game" header mode (hides logo, shows back control fallback) should only
  // apply to actual game routes. Standalone non-game pages keep the normal
  // header with Tornado logo for direct return to Casino.
  const currentIsGameStandalone = routeName === ROUTE_NAMES.DICE
    || routeName === ROUTE_NAMES.PLINKO
    || routeName === ROUTE_NAMES.CRASH;
  header?.classList.toggle('app-header--game', next && currentIsGameStandalone);

  const useNativeBack = isTelegramBackButtonSupported();
  header?.classList.toggle('app-header--native-back', useNativeBack && next);
  setTelegramBackButtonVisible(useNativeBack && next);
}

/**
 * @param {import('./route-controller.js').RouteController|null} _controller
 * @param {string} routeName
 */
function updateRouteChrome(_controller, routeName) {
  applyStandaloneChrome(isStandaloneRoute(routeName), routeName);
}

/**
 * @param {string} routeName
 */
function applyChromeForRoute(routeName) {
  applyStandaloneChrome(isStandaloneRoute(routeName), routeName);
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
 * Read optional route params from the URL (currently: bonus id for detail page).
 * @returns {Record<string, string>}
 */
function readParamsFromUrl() {
  const params = {};
  const bonusId = new URLSearchParams(window.location.search).get('bonus');
  if (bonusId) params.bonusId = bonusId;
  return params;
}

/**
 * @param {Record<string, string>|null|undefined} a
 * @param {Record<string, string>|null|undefined} b
 * @returns {boolean}
 */
function paramsEqual(a, b) {
  const left = a || {};
  const right = b || {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

/**
 * Keep `?route=` + history.state in sync with the active RouteController.
 * @param {string} routeName
 * @param {{ replace?: boolean, params?: Record<string, string>|null }} [options]
 */
function syncBrowserHistory(routeName, options = {}) {
  if (typeof window === 'undefined' || !window.history?.pushState) return;

  const params = options.params || {};
  const url = new URL(window.location.href);
  if (routeName === DEFAULT_ROUTE) {
    url.searchParams.delete('route');
  } else {
    url.searchParams.set('route', routeName);
  }

  if (params.bonusId) {
    url.searchParams.set('bonus', params.bonusId);
  } else {
    url.searchParams.delete('bonus');
  }

  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const state = { route: routeName, params };

  if (options.replace || !historySeeded) {
    window.history.replaceState(state, '', nextHref);
    historySeeded = true;
    return;
  }

  const currentState =
    window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : null;
  const currentStateRoute = currentState?.route ?? null;
  const currentStateParams = currentState?.params || {};
  if (currentStateRoute === routeName && paramsEqual(currentStateParams, params)) {
    window.history.replaceState(state, '', nextHref);
    return;
  }

  window.history.pushState(state, '', nextHref);
}

/**
 * Leave a standalone route (game / bonuses) via history when possible.
 */
function goBack() {
  if (!currentRoute || currentRoute === DEFAULT_ROUTE) {
    return;
  }

  if (window.history.state?.route === currentRoute && window.history.length > 1) {
    window.history.back();
    return;
  }

  void navigate(DEFAULT_ROUTE, { replace: true });
}

/**
 * @param {PopStateEvent} event
 */
function onPopState(event) {
  const stateRoute =
    event.state && typeof event.state === 'object' && typeof event.state.route === 'string'
      ? event.state.route
      : null;
  const nextRoute = stateRoute && ROUTES[stateRoute] ? stateRoute : DEFAULT_ROUTE;
  const nextParams =
    event.state && typeof event.state === 'object' && event.state.params
      ? event.state.params
      : readParamsFromUrl();

  if (nextRoute === currentRoute && paramsEqual(nextParams, currentParams)) return;

  syncingFromHistory = true;
  void navigate(nextRoute, { fromPopState: true, params: nextParams }).finally(() => {
    syncingFromHistory = false;
  });
}

/**
 * @param {string} routeName
 * @param {{ replace?: boolean, fromPopState?: boolean, params?: Record<string, string>|null }} [options]
 */
export async function navigate(routeName, options = {}) {
  if (!shell) return;

  const route = ROUTES[routeName];
  if (!route) return;

  const params = options.params || {};
  const generation = ++navigationGeneration;
  activeNavigationAbort?.abort();
  const abortController = new AbortController();
  activeNavigationAbort = abortController;
  const { signal } = abortController;

  const isStale = () => generation !== navigationGeneration || signal.aborted;

  const hadOverlay = overlayManager.isOpen();

  // Apply chrome for the *target* route immediately so visibility never depends
  // on the previous page, async controller load, or which CSS chunk is present.
  applyChromeForRoute(routeName);

  if (hadOverlay) {
    await overlayManager.close({ restoreNavId: route.navId });
    if (isStale()) return;
  }

  if (currentRoute === routeName && currentController) {
    updateBottomNav(route.navId);
    updateRouteChrome(currentController, routeName);

    if (!paramsEqual(params, currentParams)) {
      currentParams = params;
      if (!options.fromPopState && !syncingFromHistory) {
        syncBrowserHistory(routeName, {
          replace: Boolean(options.replace),
          params,
        });
      }
      await currentController.activate({
        reason: 'navigate',
        fromRoute: routeName,
        signal,
        params,
      });
      return;
    }

    if (!options.fromPopState && !syncingFromHistory) {
      syncBrowserHistory(routeName, {
        replace: Boolean(options.replace),
        params,
      });
    }
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
      void trackingService.gameClose(previousRoute);
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
        currentParams = null;
      }
    }

    if (isStale()) return;

    // 3–4. Load next controller if necessary
    const nextController = await ensureController(routeName);
    if (isStale()) return;

    // 5. Attach next page
    shell.setPageContent(nextController.getRoot());
    currentRoute = routeName;
    currentParams = params;
    currentController = nextController;
    hasNavigatedOnce = true;

    shell.pageContainer.scrollTop = scrollPositions.get(routeName) ?? 0;

    updateBottomNav(route.navId);
    updateRouteChrome(nextController, routeName);

    if (!options.fromPopState && !syncingFromHistory) {
      syncBrowserHistory(routeName, {
        replace: Boolean(options.replace) || previousRoute == null,
        params,
      });
    }

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
      params,
    });

    void trackingService.pageNav();
    void trackingService.gameOpen(routeName);

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
      goBack();
    });
  }
}

/**
 * @param {object} appShell
 */
export function initRouter(appShell) {
  shell = appShell;
  initOverlayManager(shell, restoreNavHighlight, navigateByNavId, navigate);
  wireHeaderActions();

  ensureTelegramReady();
  bindTelegramBackButton(() => {
    goBack();
  });
  setTelegramBackButtonVisible(false);

  window.removeEventListener('popstate', onPopState);
  window.addEventListener('popstate', onPopState);

  const routeParam = new URLSearchParams(window.location.search).get('route');
  const startRoute = routeParam && ROUTES[routeParam] ? routeParam : DEFAULT_ROUTE;
  const startParams = readParamsFromUrl();
  updateBottomNav(ROUTES[startRoute].navId);
  void navigate(startRoute, { replace: true, params: startParams });
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
  const routeParams = currentParams || {};
  if (!routeName || !ROUTES[routeName]) return;

  currentRoute = null;
  currentParams = null;
  await navigate(routeName, { params: routeParams });
}

export const router = {
  init: initRouter,
  navigate,
  navigateByNavId,
  getCurrentRoute,
  refreshForLocale,
};
