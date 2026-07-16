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
 * @property {boolean} [balanceLoading]
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
    balanceLoading = false,
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

  const bottomNav = BottomNavigation({ activeId: activeNavId });

  const shell = createElement('div', {
    attrs: { id: SHELL_IDS.ROOT },
    className: 't-app',
    children: [
      createElement('div', {
        className: 't-app__header',
        children: [Header({ balanceAmount, balanceLoading })],
      }),
      createElement('main', {
        className: 't-app__main',
        attrs: { id: 't-app-main' },
        children: [pageContainer],
      }),
      createElement('div', {
        className: 't-app__footer',
        children: [bottomNav],
      }),
      overlayRoot,
      animationRoot,
    ],
  });

  mountTarget.replaceChildren(shell);

  /** @type {((navId: string) => void)|null} */
  let navNavigateHandler = null;

  function wireBottomNavItems(nav, onNavigate) {
    if (!nav || !onNavigate) return;

    nav.querySelectorAll('.bottom-nav__item').forEach((item) => {
      const itemId = item.dataset.nav;
      if (!itemId || item.dataset.wired) return;

      item.dataset.wired = 'true';
      item.addEventListener('click', () => onNavigate(itemId));
    });
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
        't-app__page--transition-exit',
      );

      if (state === 'enter') {
        pageContainer.classList.add('t-app__page--transition-enter');
      } else if (state === 'exit') {
        pageContainer.classList.add('t-app__page--transition-exit');
      } else {
        pageContainer.classList.add('t-app__page--transition-active');
      }
    },

    updateBottomNavigation(activeId, onNavigate) {
      if (!bottomNav) return;

      if (onNavigate) {
        navNavigateHandler = onNavigate;
      }

      bottomNav.querySelectorAll('.bottom-nav__item').forEach((item) => {
        const itemId = item.dataset.nav;
        if (!itemId) return;

        const isActive = itemId === activeId;
        item.classList.toggle('bottom-nav__item--active', isActive);

        if (isActive) {
          item.setAttribute('aria-current', 'page');
        } else {
          item.removeAttribute('aria-current');
        }
      });

      wireBottomNavItems(bottomNav, navNavigateHandler);
    },

    getOverlayRoot() {
      return overlayRoot;
    },

    getAnimationRoot() {
      return animationRoot;
    },

    updateBalanceAmount(amount) {
      const pill = shell.querySelector('.balance__pill');
      if (!pill) return;

      const wasLoading = pill.classList.contains('balance__pill--loading');

      pill.textContent = amount;
      pill.classList.remove('balance__pill--loading');

      if (!wasLoading) return;

      pill.classList.add('balance__pill--hydrate', 'balance__pill--hydrate-fade');
      requestAnimationFrame(() => {
        pill.classList.remove('balance__pill--hydrate-fade');
        pill.classList.add('balance__pill--hydrate-visible');
      });
    },
  };
}
