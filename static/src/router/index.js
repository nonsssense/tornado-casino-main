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

  // Native Telegram BackButton (Bot API 6.1+) replaces in-app Back on games.
  // Unsupported clients keep the existing in-app Back only.
  const useNativeBack = isTelegramBackButtonSupported();
  header?.classList.toggle('app-header--native-back', useNativeBack && immersive);
  setTelegramBackButtonVisible(useNativeBack && immersive);
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
      page = await route.render();
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

  // Native Back → Home. No-op bind when unsupported (browser / old clients).
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

  pageCache.clear();

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
