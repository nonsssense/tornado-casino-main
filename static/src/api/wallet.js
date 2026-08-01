/**
 * Wallet API.
 *
 * Responsibility:
 * - POST /api/wallet/deposit
 * - GET /api/wallet/deposit/minimum
 * - GET /api/wallet/withdraw/minimum
 * - POST /api/wallet/withdraw
 */

import { request } from './request.js';

/**
 * @param {string} ticker
 */
export async function fetchDepositMinimum(ticker) {
  return request(`/api/wallet/deposit/minimum?ticker=${encodeURIComponent(ticker)}`);
}

/**
 * Configured product withdrawal minimum (USD).
 */
export async function fetchWithdrawMinimum() {
  return request('/api/wallet/withdraw/minimum');
}

/**
 * @param {string} ticker
 * @param {number} [amount] - optional declared USD amount (validated when provided)
 */
export async function createDeposit(ticker, amount) {
  const body = { ticker };
  if (amount != null && Number.isFinite(Number(amount))) {
    body.amount = Number(amount);
  }
  return request('/api/wallet/deposit', {
    method: 'POST',
    body: JSON.stringify(body),
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

export async function fetchHistory(category = 'all') {
  const query = category && category !== 'all'
    ? `?category=${encodeURIComponent(category)}`
    : '';
  return request(`/api/wallet/history${query}`);
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
