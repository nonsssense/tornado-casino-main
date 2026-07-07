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

  return {
    root: shell,
    pageContainer,
    overlayRoot,
    animationRoot,
    header: shell.querySelector('.app-header'),
    bottomNav: shell.querySelector('.bottom-nav'),

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
      if (!footerEl) return;
      footerEl.replaceChildren(BottomNavigation({ activeId, onNavigate }));
    },

    getOverlayRoot() {
      return overlayRoot;
    },

    getAnimationRoot() {
      return animationRoot;
    },
  };
}
