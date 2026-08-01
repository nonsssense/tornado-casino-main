/**
 * Referrals API — player referral dashboard + claim.
 */

import { request } from './request.js';

/**
 * @returns {Promise<object>}
 */
export async function fetchReferralSummary() {
  return request('/api/referrals/summary');
}

/**
 * @returns {Promise<{ status: string, tier: string }>}
 */
export async function fetchReferralStatus() {
  return request('/api/referrals/status');
}

/**
 * @returns {Promise<{ ok: boolean, claimed: number }>}
 */
export async function claimReferralEarnings() {
  return request('/api/referrals/claim', { method: 'POST' });
}
