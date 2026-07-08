/**
 * Overlay manager.
 *
 * Responsibility:
 * - Open/close overlays without route navigation.
 * - Preserve underlying page context (continuous flow principle).
 * - Adopt the shell BottomNavigation into the active sheet footer.
 */

import { OVERLAY_NAMES } from '../utils/constants.js';
import { createWalletOverlay } from './wallet.overlay.js';
import { createProfileOverlay } from './profile.overlay.js';
import { createBalanceOverlay } from './balance.overlay.js';

/** @type {object|null} */
let shell = null;

/** @type {{ close: () => Promise<void>, footer?: HTMLElement }|null} */
let activeOverlay = null;

/** @type {'wallet'|'profile'|'balance'|null} */
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

function restoreNavHighlight() {
  if (!onNavRestore || !navIdBeforeOverlay) return;
  onNavRestore(navIdBeforeOverlay);
  navIdBeforeOverlay = null;
}

function releaseBottomNav() {
  shell?.restoreBottomNav?.();
}

function attachBottomNav(overlay) {
  if (!overlay?.footer || !shell?.adoptBottomNav) return;
  shell.adoptBottomNav(overlay.footer);
}

function teardownOverlay() {
  const root = getOverlayRoot();
  activeOverlay = null;
  activeOverlayKind = null;

  if (root) {
    root.replaceChildren();
    root.setAttribute('aria-hidden', 'true');
  }

  restoreNavHighlight();
}

/**
 * @param {'wallet'|'profile'|'balance'} kind
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
      highlightNav(kind === 'balance' ? 'wallet' : kind);
    }

    const overlay = createOverlay({
      onClose: teardownOverlay,
      onBeforeRemove: releaseBottomNav,
      ...props,
    });

    attachBottomNav(overlay);

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

function getHeaderBalanceAmount() {
  return shell?.root?.querySelector?.('.balance__pill')?.textContent?.trim() || undefined;
}

export const overlayManager = {
  /**
   * @param {string} name
   * @param {object} [props]
   */
  open(name, props = {}) {
    if (name === OVERLAY_NAMES.BALANCE || name === 'balance') {
      this.openBalance(props);
      return;
    }

    if (name === OVERLAY_NAMES.DEPOSIT || name === 'deposit') {
      this.openDeposit(props);
      return;
    }

    if (name === OVERLAY_NAMES.PROFILE || name === 'profile') {
      this.openProfile(props);
    }
  },

  openBalance(props = {}) {
    mountOverlay('balance', (options) => createBalanceOverlay({
      amount: props.amount ?? getHeaderBalanceAmount(),
      cashback: props.cashback ?? 0,
      onDeposit: () => {
        this.openDeposit({ previousNavId: props.previousNavId ?? navIdBeforeOverlay ?? 'casino' });
      },
      onWithdraw: () => {
        this.openWithdraw({ previousNavId: props.previousNavId ?? navIdBeforeOverlay ?? 'casino' });
      },
      onClose: options.onClose,
      onBeforeRemove: options.onBeforeRemove,
    }), props);
  },

  openDeposit(props = {}) {
    this.openWallet({ ...props, initialTab: 'deposit' });
  },

  openWithdraw(props = {}) {
    this.openWallet({ ...props, initialTab: 'withdraw' });
  },

  openWallet(props = {}) {
    mountOverlay('wallet', (options) => createWalletOverlay({
      initialTab: props.initialTab ?? 'deposit',
      onClose: options.onClose,
      onBeforeRemove: options.onBeforeRemove,
    }), props);
  },

  openProfile(props = {}) {
    mountOverlay('profile', (options) => createProfileOverlay({
      onClose: options.onClose,
      onBeforeRemove: options.onBeforeRemove,
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
