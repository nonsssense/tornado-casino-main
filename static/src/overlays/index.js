/**
 * Overlay manager.
 *
 * Responsibility:
 * - Open/close overlays without route navigation.
 * - Preserve underlying page context (continuous flow principle).
 * - Bottom navigation stays in the shell footer for overlay screens
 *   (visibility is owned by the router screenType of the underlying page).
 * - Keep Wallet / Profile / Referrals instances alive (hide/show) for faster reopen.
 *
 * Wallet / Profile / Balance overlay modules are lazy-loaded on first open.
 */

import { OVERLAY_NAMES } from '../utils/constants.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import { referralService } from '../services/referral.service.js';

/** Overlay kinds that park instead of destroy on close. */
const KEEP_ALIVE_KINDS = new Set(['wallet', 'profile', 'referrals']);

/** @type {object|null} */
let shell = null;

/** @type {{ close: (opts?: object) => Promise<void>, destroy?: () => Promise<void>, element?: HTMLElement, resume?: Function, setTab?: Function, refresh?: Function }|null} */
let activeOverlay = null;

/** @type {{ close: () => Promise<void> }|null} */
let stackedOverlay = null;

/** @type {'wallet'|'profile'|'balance'|'referrals'|null} */
let activeOverlayKind = null;

/** @type {Map<string, object>} */
const retainedOverlays = new Map();

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

/** When true, parking an overlay must not restore bottom-nav highlight (switching sheets). */
let suppressNavRestore = false;

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

function finishNavRestore() {
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
 * Soft park after retain close — keep instance for reuse.
 * @param {string} kind
 * @param {object} overlay
 */
function parkOverlay(kind, overlay) {
  if (KEEP_ALIVE_KINDS.has(kind) && overlay) {
    retainedOverlays.set(kind, overlay);
  }
  if (activeOverlay === overlay) {
    activeOverlay = null;
    activeOverlayKind = null;
  }

  const root = getOverlayRoot();
  if (root && !activeOverlay && !stackedOverlay) {
    root.setAttribute('aria-hidden', 'true');
  }

  if (!suppressNavRestore) {
    finishNavRestore();
  }
}

/**
 * Hard teardown of the active overlay (non-retained kinds, or after destroy).
 */
function teardownOverlay() {
  stackedOverlay = null;
  activeOverlay = null;
  activeOverlayKind = null;
  lastOverlayProps = null;

  const root = getOverlayRoot();
  if (root) {
    // Keep retained overlay elements off-DOM (already detached); clear any leftovers.
    root.replaceChildren();
    root.setAttribute('aria-hidden', 'true');
  }

  finishNavRestore();
}

function teardownStackedOverlay() {
  stackedOverlay = null;
  const root = getOverlayRoot();
  if (!activeOverlay && root) {
    root.setAttribute('aria-hidden', 'true');
  }
}

/**
 * @param {string} kind
 * @returns {Promise<void>}
 */
async function destroyRetained(kind) {
  const retained = retainedOverlays.get(kind);
  if (!retained) return;
  retainedOverlays.delete(kind);
  if (typeof retained.destroy === 'function') {
    await retained.destroy();
  } else if (typeof retained.close === 'function') {
    await retained.close({ destroy: true });
  }
}

/**
 * Destroy every parked overlay (auth upgrade / locale refresh).
 * @returns {Promise<void>}
 */
async function destroyAllRetained() {
  const kinds = [...retainedOverlays.keys()];
  await Promise.all(kinds.map((kind) => destroyRetained(kind)));
}

/**
 * Park or destroy the currently active overlay.
 * @param {{ destroy?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function dismissActiveOverlay(options = {}) {
  if (stackedOverlay) {
    const stacked = stackedOverlay;
    stackedOverlay = null;
    await stacked.close();
  }

  if (!activeOverlay) return;

  const kind = activeOverlayKind;
  const overlay = activeOverlay;
  const hardDestroy = Boolean(options.destroy) || !KEEP_ALIVE_KINDS.has(kind);

  if (hardDestroy) {
    retainedOverlays.delete(kind);
    activeOverlay = null;
    activeOverlayKind = null;
    await (overlay.destroy?.() ?? overlay.close({ destroy: true }));
    teardownOverlay();
    return;
  }

  // Soft park — BottomSheet retainOnClose detaches without destroying content.
  // onHide (wired at create time) parks the instance.
  const kindToPark = kind;
  const overlayToPark = overlay;
  activeOverlay = null;
  activeOverlayKind = null;
  await overlayToPark.close();
  // Safety: ensure parked even if onHide was not wired.
  if (KEEP_ALIVE_KINDS.has(kindToPark) && !retainedOverlays.has(kindToPark)) {
    parkOverlay(kindToPark, overlayToPark);
  }
}

/**
 * @param {'wallet'|'profile'|'balance'|'referrals'} kind
 * @param {(options: object) => object | Promise<object>} createOverlay
 * @param {object} props
 * @param {{ onReuse?: (overlay: object, props: object) => void }} [hooks]
 */
function mountOverlay(kind, createOverlay, props = {}, hooks = {}) {
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

    if (props.forceRemount) {
      await destroyRetained(kind);
    }

    let overlay = KEEP_ALIVE_KINDS.has(kind) ? retainedOverlays.get(kind) : null;

    if (overlay) {
      retainedOverlays.delete(kind);
      hooks.onReuse?.(overlay, props);
    } else {
      overlay = await createOverlay({
        onClose: () => {
          // Hard-destroy path (non-retained overlays, or explicit destroy).
          if (activeOverlayKind === kind) {
            teardownOverlay();
          }
        },
        onHide: () => {
          // Retain path — park instance after sheet animation.
          parkOverlay(kind, overlay);
        },
        ...props,
      });
    }

    activeOverlay = overlay;
    activeOverlayKind = kind;
    root.setAttribute('aria-hidden', 'false');
    root.replaceChildren(overlay.element);
    overlay.open();
  };

  if (activeOverlay) {
    const previousKind = activeOverlayKind;
    const previous = activeOverlay;
    const hardDestroyPrevious = !KEEP_ALIVE_KINDS.has(previousKind);

    activeOverlay = null;
    activeOverlayKind = null;
    suppressNavRestore = true;

    const dismissPrevious = hardDestroyPrevious
      ? (previous.destroy?.() ?? previous.close({ destroy: true })).then(() => {
          const root = getOverlayRoot();
          if (root) root.replaceChildren();
        })
      : previous.close().then(() => {
          if (KEEP_ALIVE_KINDS.has(previousKind) && !retainedOverlays.has(previousKind)) {
            parkOverlay(previousKind, previous);
          }
        });

    dismissPrevious.finally(() => {
      suppressNavRestore = false;
    }).then(() => {
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
    mountOverlay(
      'wallet',
      async (options) => {
        const { createWalletOverlay } = await import('./wallet.overlay.js');
        return createWalletOverlay({
          initialTab: props.initialTab ?? 'deposit',
          retainOnClose: true,
          onClose: options.onClose,
          onHide: options.onHide,
          onBeforeRemove: options.onBeforeRemove,
        });
      },
      props,
      {
        onReuse(overlay, nextProps) {
          overlay.setTab?.(nextProps.initialTab ?? 'deposit');
          overlay.resume?.();
        },
      },
    );
  },

  openProfile(props = {}) {
    mountOverlay(
      'profile',
      async (options) => {
        const { createProfileOverlay } = await import('./profile.overlay.js');
        return createProfileOverlay({
          retainOnClose: true,
          onClose: options.onClose,
          onHide: options.onHide,
          onBeforeRemove: options.onBeforeRemove,
          onStatusInfo: () => {
            this.openReferralStatusInfo();
          },
          onMenuAction: (actionId) => {
            if (actionId === 'personal-data') {
              void this.close().then(() => {
                if (onRouteNavigate) {
                  void onRouteNavigate(ROUTE_NAMES.PERSONAL_DATA);
                }
              });
              return;
            }
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
      },
      props,
      {
        onReuse() {
          // Retained profile DOM stays painted — avoid skeleton/network churn on reopen.
        },
      },
    );
  },

  openReferrals(props = {}) {
    mountOverlay(
      'referrals',
      async (options) => {
        const { createReferralsOverlay } = await import('./referrals.overlay.js');
        return createReferralsOverlay({
          retainOnClose: true,
          onClose: options.onClose,
          onHide: options.onHide,
          onBeforeRemove: options.onBeforeRemove,
        });
      },
      props,
      {
        onReuse() {
          // Retained referrals DOM + subscription stay warm; service cache already holds summary.
        },
      },
    );
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
    if (options.restoreNavId !== undefined) {
      closeRestoreNavId = options.restoreNavId;
    }

    if (stackedOverlay) {
      const stacked = stackedOverlay;
      stackedOverlay = null;
      return stacked.close().then(() => {
        if (!activeOverlay) {
          finishNavRestore();
          return undefined;
        }
        return dismissActiveOverlay({ destroy: Boolean(options.destroy) });
      });
    }

    if (!activeOverlay) return Promise.resolve();
    return dismissActiveOverlay({ destroy: Boolean(options.destroy) });
  },

  /**
   * Hard-destroy parked overlays (locale change / full remount).
   * @returns {Promise<void>}
   */
  async clearRetained() {
    await destroyAllRetained();
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
    void destroyAllRetained().then(() => {
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
    });
  },
};
