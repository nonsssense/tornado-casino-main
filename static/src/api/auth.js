/**
 * Authentication API.
 *
 * Responsibility:
 * - POST /api/auth with Telegram initData.
 * - Session is established via HttpOnly session_token cookie (no manual headers).
 *
 * Documented endpoint only — do not invent auth APIs.
 */

import { request } from './request.js';

export async function authenticate(initData = '') {
  return request('/api/auth', {
    method: 'POST',
    body: JSON.stringify({ initdata: initData ?? '' }),
  });
}
