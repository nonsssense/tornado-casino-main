/**
 * Authentication service.
 *
 * Responsibility:
 * - Orchestrate silent login on app start (Telegram initData → POST /api/auth).
 * - Coordinate telegram.js and api/auth.js.
 * - Hold server-validated user fields for profile display.
 * - Hold first-time welcome payload from auth.
 * - No DOM access — UI feedback belongs in pages or toasts.
 */

import { getTelegramContext } from '../app/telegram.js';
import { authenticate } from '../api/auth.js';

/** @type {{ id?: number|string, username?: string, first_name?: string, last_name?: string }|null} */
let authUser = null;

/** @type {{ show?: boolean, variant?: string, referred?: boolean, campaign_id?: string }|null} */
let welcomePayload = null;

/**
 * Always call POST /api/auth with Telegram Mini App initData.
 * Backend rejects missing/invalid initData with HTTP 401 (no browser bypass).
 *
 * Never authenticates without a resolved Telegram user id / signed initData.
 */
export async function initAuth() {
  const context = await getTelegramContext();
  const initData = context?.initData;
  const telegramId = context?.telegramId;

  if (!initData || !telegramId) {
    throw new Error('Telegram initData unavailable');
  }

  const result = await authenticate(initData);

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

  return result;
}

/**
 * Server-validated Telegram user from the last successful /api/auth.
 * Prefer this over initDataUnsafe for any profile UI.
 * @returns {{ id?: number|string, username?: string, first_name?: string, last_name?: string }|null}
 */
export function getAuthUser() {
  return authUser;
}

/**
 * First-time welcome payload from the last successful /api/auth.
 * @returns {{ show?: boolean, variant?: string, referred?: boolean, campaign_id?: string }|null}
 */
export function getWelcomePayload() {
  return welcomePayload;
}

/**
 * Clear welcome payload after the modal has been handled (optional local guard).
 */
export function clearWelcomePayload() {
  welcomePayload = null;
}
