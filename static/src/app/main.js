/**
 * Application entry point — shell-first startup with progressive hydration.
 * Auth runs in the background. Missing Telegram identity → Guest Mode (not an error).
 */

import '../../styles/foundation.css';
import {
  startAuthLifecycle,
  getWelcomePayload,
  clearWelcomePayload,
  handleSessionExpired,
  isAuthenticated,
  subscribeAuthStatus,
  AUTH_STATUS,
} from '../services/auth.service.js';
import { balanceService } from '../services/balance.service.js';
import { settingsService } from '../services/settings.service.js';
import { appState } from '../services/app-state.js';
import { mountAppShell } from './shell.js';
import { router } from '../router/index.js';
import { initI18n, subscribeLocale, t } from '../i18n/index.js';
import { overlayManager } from '../overlays/index.js';
import { notifyTelegramReady } from './telegram.js';
import { initDisableDoubleTapZoom } from './disable-double-tap-zoom.js';
import { initDismissKeyboardOnOutsideTap } from './dismiss-keyboard.js';

/** Placeholder until balance API hydrates the header. */
function balancePlaceholder() {
  return t('common.emDash');
}

let shellInstance = null;
let unsubscribeBalance = null;
let unsubscribeAuth = null;
let localeSubscribed = false;
let welcomeShown = false;

export function initApp() {
  appState.init();
  shellInstance = mountAppShell({
    balanceAmount: balancePlaceholder(),
    balanceLoading: true,
  });
  router.init(shellInstance);

  if (unsubscribeBalance) {
    unsubscribeBalance();
  }

  unsubscribeBalance = balanceService.subscribeReal((formatted) => {
    shellInstance?.updateBalanceAmount?.(formatted);
  });

  return shellInstance;
}

/**
 * @returns {object|null}
 */
export function getAppShell() {
  return shellInstance;
}

/**
 * Mount shell immediately for perceived speed.
 */
function mountShellFirst() {
  if (!shellInstance) {
    initApp();
  }
}

function hydrateAuthenticatedData() {
  void settingsService.load().catch(() => {
    // Settings failure should not block shell or navigation.
  });

  void balanceService.fetchBalances().catch(() => {
    // Balance failure should not block shell or navigation.
  });

  maybeShowWelcome();
}

function hydrateGuestData() {
  // Language is local. Apply sound/haptic defaults without requiring a session.
  try {
    settingsService.enableHapticPreferenceGate();
  } catch {
    // Non-critical.
  }

  shellInstance?.updateBalanceAmount?.(balancePlaceholder());
}

function maybeShowWelcome() {
  if (welcomeShown || !isAuthenticated()) return;
  const welcome = getWelcomePayload();
  if (!welcome?.show) return;

  welcomeShown = true;
  clearWelcomePayload();

  requestAnimationFrame(() => {
    void import('../features/welcome/welcome.modal.js')
      .then(({ maybeShowWelcome: showWelcome }) => {
        showWelcome(welcome, {
          onClaim: () => {
            overlayManager.openDeposit({ previousNavId: 'casino', highlightNav: true });
          },
          onLater: () => {
            // Stay on Home — no navigation.
          },
        });
      })
      .catch(() => {
        // Welcome is non-critical — ignore load failures.
      });
  });
}

async function hydrateAfterAuth() {
  const outcome = await startAuthLifecycle();

  if (outcome.status === AUTH_STATUS.AUTHENTICATED) {
    hydrateAuthenticatedData();
  } else {
    hydrateGuestData();
  }
}

function ensureAuthSubscription() {
  if (unsubscribeAuth) return;
  unsubscribeAuth = subscribeAuthStatus((status) => {
    if (status === AUTH_STATUS.AUTHENTICATED) {
      hydrateAuthenticatedData();
      overlayManager.refreshForAuthUpgrade?.();
    } else if (status === AUTH_STATUS.GUEST) {
      hydrateGuestData();
    }
  });
}

function ensureLocaleSubscription() {
  if (localeSubscribed) return;
  localeSubscribed = true;

  subscribeLocale(async () => {
    if (overlayManager.isOpen()) {
      await overlayManager.close({ destroy: true });
    }
    await overlayManager.clearRetained?.();
    document.title = t('app.title');
    await router.refreshForLocale();
  });
}

async function bootstrap() {
  notifyTelegramReady();
  initDisableDoubleTapZoom();
  initDismissKeyboardOnOutsideTap();

  initI18n();
  document.title = t('app.title');
  ensureLocaleSubscription();
  ensureAuthSubscription();

  mountShellFirst();
  await hydrateAfterAuth();
}

window.addEventListener('session:expired', () => {
  handleSessionExpired();
});

bootstrap();
