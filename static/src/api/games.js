/**
 * Games API.
 *
 * Responsibility:
 * - POST /api/games/rolldice
 * - POST /api/games/plinco
 *
 * Returns backend-calculated results only — never compute outcomes on the frontend.
 */

import { request } from './request.js';

export async function rollDice(payload) {
  // TODO: POST /api/games/rolldice { bid, limit, over }
  return request('/api/games/rolldice', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function playPlinko(payload) {
  // TODO: POST /api/games/plinco { bid, risk_mode, rows }
  return request('/api/games/plinco', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
