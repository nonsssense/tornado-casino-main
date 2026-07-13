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

export async function fetchBalance() {
  return request('/api/wallet/balance');
}

/**
 * @param {number} depositId
 */
export async function fetchDepositStatus(depositId) {
  return request(`/api/wallet/deposit/status?deposit_id=${encodeURIComponent(depositId)}`);
}

export async function fetchHistory() {
  return request('/api/wallet/history');
}

/**
 * @param {{ ticker: string, address: string, amount: number }} payload
 */
export async function submitWithdraw(payload) {
  return request('/api/wallet/withdraw', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
