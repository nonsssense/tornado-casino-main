/**
 * Crash API client — HTTP contracts only.
 *
 * Endpoints:
 * - GET  /crash/state
 * - GET  /crash/history
 * - POST /crash/bet
 * - POST /crash/cashout
 */

import { request } from './request.js';

export async function fetchCrashState() {
  return request('/crash/state');
}

/**
 * @param {number} [limit]
 */
export async function fetchCrashHistory(limit = 10) {
  return request(`/crash/history?limit=${encodeURIComponent(limit)}`);
}

/**
 * @param {{ amount: number }} payload
 */
export async function placeCrashBet(payload) {
  return request('/crash/bet', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * @param {{ bet_id: number }} payload
 */
export async function cashoutCrash(payload) {
  return request('/crash/cashout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
