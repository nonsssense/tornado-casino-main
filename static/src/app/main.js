/**
 * Application entry point.
 */

import { initAuth } from '../services/auth.service.js';
import { balanceService } from '../services/balance.service.js';
import { mountAppShell } from './shell.js';
import { router } from '../router/index.js';
import { showAuthError, clearAuthError } from './auth-error.js';

let shellInstance = null;
let unsubscribeBalance = null;

export function initApp() {
  shellInstance = mountAppShell();
  router.init(shellInstance);

  if (unsubscribeBalance) {
    unsubscribeBalance();
  }

  unsubscribeBalance = balanceService.subscribe((formatted) => {
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
  } catch {
    showAuthError({ onRetry: bootstrap });
  }
}

bootstrap();
