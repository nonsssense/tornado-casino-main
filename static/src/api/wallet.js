/**
 * Wallet API.
 *
 * Responsibility:
 * - POST /api/wallet/deposit
 * - Future: withdraw, balance, history endpoints when documented.
 *
 * Never call POST /api/payment/webhook from the frontend.
 */

import { request } from './request.js';

export async function createDeposit(ticker) {
  return request('/api/wallet/deposit', {
    method: 'POST',
    body: JSON.stringify({ ticker }),
  });
}

/**
 * @param {{ ticker: string, address: string }} payload
 */
export async function submitWithdraw(payload) {
  // TODO: POST /api/wallet/withdraw when endpoint is documented
  return request('/api/wallet/withdraw', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
