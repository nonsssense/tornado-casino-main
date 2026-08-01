/**
 * Application entry point — shell-first startup with progressive hydration.
 */

import '../../styles/foundation.css';
import { initAuth, getWelcomePayload, clearWelcomePayload } from '../services/auth.service.js';
import { balanceService } from '../services/balance.service.js';
import { settingsService } from '../services/settings.service.js';
import { mountAppShell } from './shell.js';
import { router } from '../router/index.js';
import { showAuthError, clearAuthError } from './auth-error.js';
import { startSplashWatch, dismissSplash } from './splash.js';
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
let localeSubscribed = false;

export function initApp() {
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

function resetShellState() {
  shellInstance = null;

  if (unsubscribeBalance) {
    unsubscribeBalance();
    unsubscribeBalance = null;
  }
}

/**
 * Mount shell immediately for perceived speed.
 * Splash stays until auth settles (success or failure).
 */
function mountShellFirst() {
  if (!shellInstance) {
    initApp();
  }
}

/**
 * Terminal startup outcome — auth finished.
 * Splash must never remain after this.
 * @param {'success' | 'failure'} outcome
 */
function finishStartup(outcome) {
  if (outcome === 'failure') {
    dismissSplash({ immediate: true });
    return;
  }

  dismissSplash();
}

async function hydrateAfterAuth() {
  try {
    await initAuth();
  } catch {
    finishStartup('failure');
    resetShellState();
    showAuthError({ onRetry: bootstrap });
    return;
  }

  finishStartup('success');

  void settingsService.load().catch(() => {
    // Settings failure should not block shell or navigation.
  });

  void balanceService.fetchBalances().catch(() => {
    // Balance failure should not block shell or navigation.
  });

  // First-time welcome — only when backend says welcome_pending.
  // Dynamic import keeps welcome CSS/JS out of the returning-user bundle.
  const welcome = getWelcomePayload();
  if (welcome?.show) {
    clearWelcomePayload();
    // Defer one frame so Home/shell paint under the modal.
    requestAnimationFrame(() => {
      void import('../features/welcome/welcome.modal.js')
        .then(({ maybeShowWelcome }) => {
          maybeShowWelcome(welcome, {
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
}

function ensureLocaleSubscription() {
  if (localeSubscribed) return;
  localeSubscribed = true;

  subscribeLocale(async () => {
    if (overlayManager.isOpen()) {
      await overlayManager.close();
    }
    document.title = t('app.title');
    await router.refreshForLocale();
  });
}

async function bootstrap() {
  // Module path: re-signal ready if inline early call was skipped (browser stub / race).
  notifyTelegramReady();
  initDisableDoubleTapZoom();
  initDismissKeyboardOnOutsideTap();

  initI18n();
  document.title = t('app.title');
  ensureLocaleSubscription();

  clearAuthError();
  startSplashWatch();
  mountShellFirst();

  await hydrateAfterAuth();
}

window.addEventListener('session:expired', () => {
  // Auth / session failure is terminal — never leave splash covering the error UI.
  dismissSplash({ immediate: true });
  resetShellState();
  showAuthError({ onRetry: bootstrap });
});

bootstrap();
