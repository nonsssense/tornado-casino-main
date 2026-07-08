/**
 * Authentication service.
 *
 * Responsibility:
 * - Orchestrate silent login on app start (Telegram initData → POST /api/auth).
 * - Coordinate telegram.js and api/auth.js.
 * - No DOM access — UI feedback belongs in pages or toasts.
 */

import { getTelegramContext } from '../app/telegram.js';
import { authenticate } from '../api/auth.js';

/**
 * Always call POST /api/auth.
 * Backend decides allow/deny from Telegram ID + WEB_DEFENCE.
 */
export async function initAuth() {
  const context = getTelegramContext();
  await authenticate(context?.initData || '');
}
