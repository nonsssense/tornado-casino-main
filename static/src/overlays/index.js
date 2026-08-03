/**
 * Overlay manager.
 *
 * Responsibility:
 * - Open/close overlays without route navigation.
 * - Preserve underlying page context (continuous flow principle).
 * - Bottom navigation stays in the shell footer for overlay screens
 *   (visibility is owned by the router screenType of the underlying page).
 *
 * Wallet / Profile / Balance overlay modules are lazy-loaded on first open.
 */

import { OVERLAY_NAMES } from '../utils/constants.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import { referralService } from '../services/referral.service.js';

/** @type {object|null} */
let shell = null;

/** @type {{ close: () => Promise<void>, footer?: HTMLElement }|null} */
let activeOverlay = null;

/** @type {{ close: () => Promise<void> }|null} */
let stackedOverlay = null;

/** @type {'wallet'|'profile'|'balance'|'referrals'|null} */
let activeOverlayKind = null;

/** @type {object|null} */
let lastOverlayProps = null;

/** @type {string|null} */
let navIdBeforeOverlay = null;

/** @type {function|null} */
let onNavRestore = null;

/** @type {function|null} */
let onNavNavigate = null;

/** @type {((routeName: string) => void | Promise<void>)|null} */
let onRouteNavigate = null;

/** @type {string|null} */
let closeRestoreNavId = null;

/**
 * @param {object} appShell
 * @param {function} restoreNavCallback
 * @param {function} navigateCallback
 * @param {((routeName: string) => void | Promise<void>)} [routeNavigateCallback]
 */
export function initOverlayManager(appShell, restoreNavCallback, navigateCallback, routeNavigateCallback) {
  shell = appShell;
  onNavRestore = restoreNavCallback;
  onNavNavigate = navigateCallback;
  onRouteNavigate = typeof routeNavigateCallback === 'function' ? routeNavigateCallback : null;
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
  stackedOverlay = null;
  activeOverlay = null;
  activeOverlayKind = null;
  lastOverlayProps = null;

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

function teardownStackedOverlay() {
  stackedOverlay = null;
  const root = getOverlayRoot();
  if (!activeOverlay && root) {
    root.setAttribute('aria-hidden', 'true');
  }
}

/**
 * @param {'wallet'|'profile'|'balance'|'referrals'} kind
 * @param {(options: object) => object | Promise<object>} createOverlay
 * @param {object} props
 */
function mountOverlay(kind, createOverlay, props = {}) {
  lastOverlayProps = { ...props };

  // Allow forced remount after Guest → Authenticated upgrade.
  if (activeOverlayKind === kind && !props.forceRemount) return;

  const launch = async () => {
    const root = getOverlayRoot();
    if (!root) return;

    navIdBeforeOverlay = props.previousNavId ?? navIdBeforeOverlay ?? 'casino';

    if (props.highlightNav) {
      const navHighlight =
        kind === 'balance'
          ? 'wallet'
          : kind === 'referrals'
            ? 'referrals'
            : kind;
      highlightNav(navHighlight);
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
        onStatusInfo: () => {
          this.openReferralStatusInfo();
        },
        onMenuAction: (actionId) => {
          if (actionId === 'bonuses') {
            void this.close().then(() => {
              if (onRouteNavigate) {
                void onRouteNavigate(ROUTE_NAMES.BONUSES);
              }
            });
            return;
          }
          if (actionId === 'referrals') {
            this.openReferrals({
              previousNavId: props.previousNavId ?? navIdBeforeOverlay ?? 'casino',
              highlightNav: true,
            });
          }
        },
      });
    }, props);
  },

  openReferrals(props = {}) {
    mountOverlay('referrals', async (options) => {
      const { createReferralsOverlay } = await import('./referrals.overlay.js');
      return createReferralsOverlay({
        onClose: options.onClose,
        onBeforeRemove: options.onBeforeRemove,
      });
    }, props);
  },

  /**
   * Shared Referral Status Details sheet.
   * Stacks above an open overlay when needed (e.g. Referrals → Learn More).
   * @param {object} [props]
   */
  openReferralStatusInfo(props = {}) {
    const launch = async () => {
      const root = getOverlayRoot();
      if (!root) return;

      if (stackedOverlay) {
        await stackedOverlay.close();
        stackedOverlay = null;
      }

      const { createReferralStatusOverlay } = await import('./referral-status.overlay.js');
      let summary = props.summary || null;
      if (!summary) {
        try {
          summary = await referralService.fetchSummary();
        } catch {
          summary = referralService.getSummary();
        }
      }

      const overlay = createReferralStatusOverlay({
        summary,
        onClose: teardownStackedOverlay,
        manageBodyScroll: !activeOverlay,
      });

      overlay.element.classList.add('bottom-sheet--stacked');
      stackedOverlay = overlay;
      root.setAttribute('aria-hidden', 'false');
      root.appendChild(overlay.element);
      overlay.open();
    };

    void launch();
  },

  close(options = {}) {
    if (stackedOverlay) {
      const stacked = stackedOverlay;
      stackedOverlay = null;
      return stacked.close().then(() => {
        if (!activeOverlay) return undefined;
        if (options.restoreNavId !== undefined) {
          closeRestoreNavId = options.restoreNavId;
        }
        return activeOverlay.close();
      });
    }

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

  /**
   * Remount the open overlay after auth upgrades Guest → Authenticated.
   * No full page reload — restricted panels unlock in place.
   */
  refreshForAuthUpgrade() {
    if (!activeOverlay || !activeOverlayKind) return;

    const kind = activeOverlayKind;
    const props = {
      ...(lastOverlayProps || {}),
      forceRemount: true,
      highlightNav: true,
      previousNavId: navIdBeforeOverlay ?? lastOverlayProps?.previousNavId ?? 'casino',
    };

    if (kind === 'wallet') {
      this.openWallet(props);
      return;
    }
    if (kind === 'profile') {
      this.openProfile(props);
      return;
    }
    if (kind === 'balance') {
      this.openBalance(props);
      return;
    }
    if (kind === 'referrals') {
      this.openReferrals(props);
    }
  },
};
