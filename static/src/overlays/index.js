/**
 * Overlay manager.
 *
 * Responsibility:
 * - Open/close overlays without route navigation.
 * - Preserve underlying page context (continuous flow principle).
 */

import { OVERLAY_NAMES } from '../utils/constants.js';
import { createWalletOverlay } from './wallet.overlay.js';
import { createProfileOverlay } from './profile.overlay.js';

/** @type {object|null} */
let shell = null;

/** @type {{ close: () => Promise<void> }|null} */
let activeOverlay = null;

/** @type {'wallet'|'profile'|null} */
let activeOverlayKind = null;

/** @type {string|null} */
let navIdBeforeOverlay = null;

/** @type {function|null} */
let onNavRestore = null;

/** @type {function|null} */
let onNavNavigate = null;

/**
 * @param {object} appShell
 * @param {function} restoreNavCallback
 * @param {function} navigateCallback
 */
export function initOverlayManager(appShell, restoreNavCallback, navigateCallback) {
  shell = appShell;
  onNavRestore = restoreNavCallback;
  onNavNavigate = navigateCallback;
}

function getOverlayRoot() {
  return shell?.getOverlayRoot?.() || null;
}

function highlightNav(navId) {
  if (!shell?.updateBottomNavigation || !onNavNavigate) return;
  shell.updateBottomNavigation(navId, onNavNavigate);
}

function restoreNav() {
  if (!onNavRestore || !navIdBeforeOverlay) return;
  onNavRestore(navIdBeforeOverlay);
  navIdBeforeOverlay = null;
}

function teardownOverlay() {
  const root = getOverlayRoot();
  activeOverlay = null;
  activeOverlayKind = null;

  if (root) {
    root.replaceChildren();
    root.setAttribute('aria-hidden', 'true');
  }

  restoreNav();
}

/**
 * @param {'wallet'|'profile'} kind
 * @param {function} createOverlay
 * @param {object} props
 */
function mountOverlay(kind, createOverlay, props = {}) {
  if (activeOverlayKind === kind) return;

  const launch = () => {
    const root = getOverlayRoot();
    if (!root) return;

    navIdBeforeOverlay = props.previousNavId ?? 'casino';

    if (props.highlightNav) {
      highlightNav(kind);
    }

    const overlay = createOverlay({
      onClose: teardownOverlay,
      ...props,
    });

    activeOverlay = overlay;
    activeOverlayKind = kind;
    root.setAttribute('aria-hidden', 'false');
    root.replaceChildren(overlay.element);
    overlay.open();
  };

  if (activeOverlay) {
    activeOverlay.close().then(launch);
    return;
  }

  launch();
}

export const overlayManager = {
  /**
   * @param {string} name
   * @param {object} [props]
   */
  open(name, props = {}) {
    if (name === OVERLAY_NAMES.DEPOSIT || name === 'deposit') {
      this.openDeposit(props);
      return;
    }

    if (name === OVERLAY_NAMES.PROFILE || name === 'profile') {
      this.openProfile(props);
    }
  },

  openDeposit(props = {}) {
    this.openWallet({ ...props, initialTab: 'deposit' });
  },

  openWallet(props = {}) {
    mountOverlay('wallet', (options) => createWalletOverlay({
      initialTab: props.initialTab ?? 'deposit',
      onClose: options.onClose,
    }), props);
  },

  openProfile(props = {}) {
    mountOverlay('profile', (options) => createProfileOverlay({
      onClose: options.onClose,
    }), props);
  },

  close() {
    if (!activeOverlay) return Promise.resolve();
    return activeOverlay.close();
  },

  /**
   * @param {string} [kind]
   */
  isOpen(kind) {
    if (!activeOverlay) return false;
    if (kind) return activeOverlayKind === kind;
    return true;
  },
};
