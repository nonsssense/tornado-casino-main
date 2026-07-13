/**
 * Application entry point.
 */

import { initAuth } from '../services/auth.service.js';
import { balanceService } from '../services/balance.service.js';
import { mountAppShell } from './shell.js';
import { router } from '../router/index.js';
import { showAuthError, clearAuthError } from './auth-error.js';
import { formatCryptoAmount } from '../utils/format.js';

let shellInstance = null;
let unsubscribeBalance = null;

export function initApp() {
  shellInstance = mountAppShell({
    balanceAmount: formatCryptoAmount(0),
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

async function bootstrap() {
  clearAuthError();

  try {
    await initAuth();

    if (!shellInstance) {
      initApp();
    }

    await balanceService.fetchBalances();
  } catch {
    showAuthError({ onRetry: bootstrap });
  }
}

window.addEventListener('session:expired', () => {
  showAuthError({ onRetry: bootstrap });
});

bootstrap();
