/**
 * Application shell — permanent root layout for all screens.
 */

import { createElement } from '../utils/dom.js';
import { SHELL_IDS } from '../utils/constants.js';
import { Header } from '../components/shared/Header.js';
import { BottomNavigation } from '../components/shared/BottomNavigation.js';

/**
 * @typedef {object} AppShellOptions
 * @property {HTMLElement} [mountTarget]
 * @property {string} [activeNavId]
 * @property {string} [balanceAmount]
 */

/**
 * Mount the application shell into the DOM.
 * @param {AppShellOptions} [options]
 * @returns {object} shell references for future router/overlay integration
 */
export function mountAppShell(options = {}) {
  const {
    mountTarget = document.getElementById('app-root'),
    activeNavId = 'casino',
    balanceAmount,
  } = options;

  if (!mountTarget) {
    throw new Error('App shell mount target #app-root not found');
  }

  const pageContainer = createElement('div', {
    attrs: { id: SHELL_IDS.PAGE },
    className: 't-app__page t-app__page--transition-active',
  });

  const overlayRoot = createElement('div', {
    attrs: {
      id: SHELL_IDS.OVERLAY,
      'aria-hidden': 'true',
    },
    className: 't-overlay-root',
  });

  const animationRoot = createElement('div', {
    attrs: {
      id: SHELL_IDS.ANIMATION,
      'aria-hidden': 'true',
    },
    className: 't-animation-root',
  });

  const shell = createElement('div', {
    attrs: { id: SHELL_IDS.ROOT },
    className: 't-app',
    children: [
      createElement('div', {
        className: 't-app__header',
        children: [Header({ balanceAmount })],
      }),
      createElement('main', {
        className: 't-app__main',
        attrs: { id: 't-app-main' },
        children: [pageContainer],
      }),
      createElement('div', {
        className: 't-app__footer',
        children: [BottomNavigation({ activeId: activeNavId })],
      }),
      overlayRoot,
      animationRoot,
    ],
  });

  mountTarget.replaceChildren(shell);

  const footerEl = shell.querySelector('.t-app__footer');
  /** @type {HTMLElement|null} */
  let navHost = footerEl;
  /** @type {HTMLElement|null} */
  let bottomNav = shell.querySelector('.bottom-nav');

  function syncBottomNavRef() {
    bottomNav = navHost?.querySelector?.('.bottom-nav') || null;
  }

  return {
    root: shell,
    pageContainer,
    overlayRoot,
    animationRoot,
    header: shell.querySelector('.app-header'),

    get bottomNav() {
      return bottomNav;
    },

    setPageContent(content) {
      pageContainer.replaceChildren(content);
    },

    setPageTransition(state) {
      pageContainer.classList.remove(
        't-app__page--transition-enter',
        't-app__page--transition-active',
      );
      if (state === 'enter') {
        pageContainer.classList.add('t-app__page--transition-enter');
      } else {
        pageContainer.classList.add('t-app__page--transition-active');
      }
    },

    updateBottomNavigation(activeId, onNavigate) {
      const host = navHost || footerEl;
      if (!host) return;
      host.replaceChildren(BottomNavigation({ activeId, onNavigate }));
      syncBottomNavRef();
    },

    /**
     * Move the existing bottom navigation into an overlay footer slot.
     * @param {HTMLElement} container
     * @returns {HTMLElement|null}
     */
    adoptBottomNav(container) {
      if (!container) return null;

      if (!bottomNav) {
        syncBottomNavRef();
      }

      if (!bottomNav) {
        bottomNav = BottomNavigation({ activeId: 'casino' });
      }

      container.replaceChildren(bottomNav);
      navHost = container;
      syncBottomNavRef();
      return bottomNav;
    },

    /**
     * Return bottom navigation to the shell footer.
     */
    restoreBottomNav() {
      if (!footerEl) return;

      if (!bottomNav || !bottomNav.isConnected || bottomNav.parentElement !== footerEl) {
        const livingNav = navHost?.querySelector?.('.bottom-nav') || bottomNav;
        if (livingNav) {
          footerEl.replaceChildren(livingNav);
        }
      }

      navHost = footerEl;
      syncBottomNavRef();
    },

    getOverlayRoot() {
      return overlayRoot;
    },

    getAnimationRoot() {
      return animationRoot;
    },

    updateBalanceAmount(amount) {
      const pill = shell.querySelector('.balance__pill');
      if (pill) {
        pill.textContent = amount;
      }
    },
  };
}
