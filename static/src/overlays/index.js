/**
 * Overlay manager.
 *
 * Responsibility:
 * - Open/close overlays without route navigation.
 * - Preserve underlying page context (continuous flow principle).
 * - Bottom navigation stays in the shell footer at all times.
 *
 * Wallet / Profile / Balance overlay modules are lazy-loaded on first open.
 */

import { OVERLAY_NAMES } from '../utils/constants.js';

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

/** @type {string|null} */
let closeRestoreNavId = null;

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

function teardownOverlay() {
  const root = getOverlayRoot();
  activeOverlay = null;
  activeOverlayKind = null;

  if (root) {
    root.replaceChildren();
    root.setAttribute('aria-hidden', 'true');
  }

  if (closeRestoreNavId !== null) {
    if (onNavRestore) {
      onNavRestore(closeRestoreNavId);
    }
    closeRestoreNavId = null;
    navIdBeforeOverlay = null;
  } else {
    restoreNavHighlight();
  }
}

/**
 * @param {'wallet'|'profile'|'balance'} kind
 * @param {(options: object) => object | Promise<object>} createOverlay
 * @param {object} props
 */
function mountOverlay(kind, createOverlay, props = {}) {
  if (activeOverlayKind === kind) return;

  const launch = async () => {
    const root = getOverlayRoot();
    if (!root) return;

    navIdBeforeOverlay = props.previousNavId ?? 'casino';

    if (props.highlightNav) {
      highlightNav(kind === 'balance' ? 'wallet' : kind);
    }

    const overlay = await createOverlay({
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
    activeOverlay.close().then(() => {
      void launch();
    });
    return;
  }

  void launch();
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
    mountOverlay('balance', async (options) => {
      const { createBalanceOverlay } = await import('./balance.overlay.js');
      return createBalanceOverlay({
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
      });
    }, props);
  },

  openDeposit(props = {}) {
    this.openWallet({ ...props, initialTab: 'deposit' });
  },

  openWithdraw(props = {}) {
    this.openWallet({ ...props, initialTab: 'withdraw' });
  },

  openWallet(props = {}) {
    mountOverlay('wallet', async (options) => {
      const { createWalletOverlay } = await import('./wallet.overlay.js');
      return createWalletOverlay({
        initialTab: props.initialTab ?? 'deposit',
        onClose: options.onClose,
        onBeforeRemove: options.onBeforeRemove,
      });
    }, props);
  },

  openProfile(props = {}) {
    mountOverlay('profile', async (options) => {
      const { createProfileOverlay } = await import('./profile.overlay.js');
      return createProfileOverlay({
        onClose: options.onClose,
        onBeforeRemove: options.onBeforeRemove,
        // onMenuAction: wire profile menu items here when flows are ready.
      });
    }, props);
  },

  close(options = {}) {
    if (!activeOverlay) return Promise.resolve();

    if (options.restoreNavId !== undefined) {
      closeRestoreNavId = options.restoreNavId;
    }

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
