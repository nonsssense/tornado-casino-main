/**
 * Authentication service.
 *
 * Responsibility:
 * - Orchestrate silent login (Telegram initData → POST /api/auth).
 * - Maintain Guest / Authenticated / Loading product states.
 * - Never block the UI — missing initData enters Guest Mode.
 * - Auto-upgrade Guest → Authenticated when initData appears later.
 * - Hold server-validated user fields and welcome payload.
 * - No DOM access — Guest UI belongs in components.
 */

import { getTelegramContext, readTelegramContextSync } from '../app/telegram.js';
import { authenticate } from '../api/auth.js';
import {
  AUTH_STATUS,
  getAuthStatus,
  isAuthenticated,
  isGuest,
  isAuthLoading,
  setAuthStatus,
  subscribeAuthStatus,
} from './auth-state.js';

/** @type {{ id?: number|string, username?: string, first_name?: string, last_name?: string }|null} */
let authUser = null;

/** @type {{ show?: boolean, variant?: string, referred?: boolean, campaign_id?: string }|null} */
let welcomePayload = null;

/** @type {boolean} */
let lifecycleStarted = false;

/** @type {ReturnType<typeof setInterval>|null} */
let lateWatchTimer = null;

/** @type {((event: Event) => void)|null} */
let lateHashHandler = null;

/** @type {Promise<unknown>|null} */
let authInFlight = null;

/**
 * @param {unknown} result
 */
function applyAuthResult(result) {
  authUser = result && typeof result === 'object' && result.user && typeof result.user === 'object'
    ? result.user
    : null;

  const welcome = result && typeof result === 'object' ? result.welcome : null;
  welcomePayload = welcome && typeof welcome === 'object'
    ? {
        show: Boolean(welcome.show),
        variant: welcome.variant === 'referral' ? 'referral' : 'default',
        referred: Boolean(welcome.referred),
        campaign_id: typeof welcome.campaign_id === 'string' ? welcome.campaign_id : undefined,
      }
    : null;

  setAuthStatus(AUTH_STATUS.AUTHENTICATED);
}

function clearWelcomeOnGuest() {
  welcomePayload = null;
  authUser = null;
}

/**
 * Enter Guest Mode — supported product state, not an error.
 */
export function enterGuestMode() {
  clearWelcomeOnGuest();
  setAuthStatus(AUTH_STATUS.GUEST);
  startLateInitDataWatch();
}

function stopLateInitDataWatch() {
  if (lateWatchTimer != null) {
    clearInterval(lateWatchTimer);
    lateWatchTimer = null;
  }
  if (lateHashHandler) {
    window.removeEventListener('hashchange', lateHashHandler);
    lateHashHandler = null;
  }
}

/**
 * Keep watching for late Telegram initData while in Guest Mode.
 */
function startLateInitDataWatch() {
  stopLateInitDataWatch();

  const tryUpgrade = () => {
    if (isAuthenticated() || authInFlight) return;
    void attemptAuthFromContext({ wait: false }).catch(() => {
      // Stay guest — expected until initData exists.
    });
  };

  lateHashHandler = () => tryUpgrade();
  window.addEventListener('hashchange', lateHashHandler);
  lateWatchTimer = setInterval(tryUpgrade, 2000);
}

/**
 * @param {{ wait?: boolean }} [options]
 * @returns {Promise<unknown|null>}
 */
async function attemptAuthFromContext(options = {}) {
  const { wait = true } = options;

  if (authInFlight) return authInFlight;

  authInFlight = (async () => {
    const context = wait
      ? await getTelegramContext()
      : readTelegramContextSync();

    const initData = context?.initData;
    const telegramId = context?.telegramId;

    if (!initData || !telegramId) {
      return null;
    }

    const result = await authenticate(initData);
    applyAuthResult(result);
    stopLateInitDataWatch();
    return result;
  })();

  try {
    return await authInFlight;
  } finally {
    authInFlight = null;
  }
}

/**
 * Bootstrap auth lifecycle. Resolves after first determination of Guest or Authenticated.
 * Does not throw for missing Telegram identity.
 * @returns {Promise<{ status: string, result?: unknown }>}
 */
export async function startAuthLifecycle() {
  if (lifecycleStarted && !isAuthLoading()) {
    return { status: getAuthStatus() };
  }
  lifecycleStarted = true;
  setAuthStatus(AUTH_STATUS.LOADING);

  try {
    const result = await attemptAuthFromContext({ wait: true });
    if (result) {
      return { status: AUTH_STATUS.AUTHENTICATED, result };
    }
    enterGuestMode();
    return { status: AUTH_STATUS.GUEST };
  } catch {
    // Invalid initData / network — Guest Mode (backend still not bypassed).
    enterGuestMode();
    return { status: AUTH_STATUS.GUEST };
  }
}

/**
 * @deprecated Prefer startAuthLifecycle — kept for callers expecting initAuth.
 * Guest Mode is returned as null instead of throwing.
 * @returns {Promise<unknown|null>}
 */
export async function initAuth() {
  const outcome = await startAuthLifecycle();
  return outcome.result ?? null;
}

/**
 * Session cookie expired while previously authenticated → Guest Mode.
 */
export function handleSessionExpired() {
  enterGuestMode();
}

/**
 * Server-validated Telegram user from the last successful /api/auth.
 * @returns {{ id?: number|string, username?: string, first_name?: string, last_name?: string }|null}
 */
export function getAuthUser() {
  return authUser;
}

/**
 * @returns {{ show?: boolean, variant?: string, referred?: boolean, campaign_id?: string }|null}
 */
export function getWelcomePayload() {
  return welcomePayload;
}

export function clearWelcomePayload() {
  welcomePayload = null;
}

export {
  AUTH_STATUS,
  getAuthStatus,
  isAuthenticated,
  isGuest,
  isAuthLoading,
  subscribeAuthStatus,
};
