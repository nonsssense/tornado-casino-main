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

export async function initAuth() {
  const context = getTelegramContext();
  if (!context?.initData) {
    throw new Error('Telegram initData is required for authentication');
  }

  await authenticate(context.initData);
}
