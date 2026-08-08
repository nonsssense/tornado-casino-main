/**
 * Fiat (KZT) deposit API.
 *
 * Responsibility:
 * - POST /api/wallet/fiatdeposit
 *
 * Contract is owned by the backend (payments/fiat_deposit.py). This client only
 * forwards user input and returns the provider requisites verbatim.
 */

import { request } from './request.js';

/**
 * Create a NirvanaPay fiat deposit order.
 * @param {{ amount: number, token: string }} payload - amount in KZT, token is the bank id
 * @returns {Promise<{
 *   external_id: string,
 *   status: string,
 *   currency: string,
 *   amount_kzt: number,
 *   token: string,
 *   receiver: string|null,
 *   recipient_name: string|null,
 *   bank_name: string|null,
 * }>}
 */
export async function createFiatDeposit({ amount, token }) {
  return request('/api/wallet/fiatdeposit', {
    method: 'POST',
    body: JSON.stringify({ amount: Number(amount), token }),
  });
}
