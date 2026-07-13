/**
 * Crash layout helpers — display-only, no game logic.
 */

import { CRASH_HISTORY_TIERS, CRASH_PAYOUT_TIERS } from './crash.constants.js';

/**
 * @param {number} multiplier
 * @param {{ min: number, max: number|null, key: string }[]} tiers
 * @returns {string}
 */
function resolveTierKey(multiplier, tiers) {
  const value = Number(multiplier);
  if (!Number.isFinite(value) || value < 1) return tiers[0]?.key ?? 'orange';

  for (const tier of tiers) {
    if (value < tier.min) continue;
    if (tier.max == null || value <= tier.max) return tier.key;
  }

  return tiers[tiers.length - 1]?.key ?? 'red';
}

/**
 * @param {number} multiplier
 * @returns {string}
 */
export function getHistoryTierKey(multiplier) {
  return resolveTierKey(multiplier, CRASH_HISTORY_TIERS);
}

/**
 * @param {number} multiplier
 * @returns {string}
 */
export function getPayoutTierKey(multiplier) {
  return resolveTierKey(multiplier, CRASH_PAYOUT_TIERS);
}

/**
 * @param {number} multiplier
 * @returns {string}
 */
export function formatMultiplier(multiplier) {
  const value = Number(multiplier);
  if (!Number.isFinite(value)) return '—';

  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toFixed(2)}x`;
}

/**
 * @param {number} amount
 * @returns {string}
 */
export function formatPayout(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '$0.00';
  return `$${value.toFixed(2)}`;
}

/**
 * Clamp bet amount for local +/- controls.
 * @param {number} value
 * @param {{ min: number, max: number }} limits
 * @returns {number}
 */
export function clampBetAmount(value, limits) {
  if (!Number.isFinite(value) || value <= 0) return limits.min;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value * 100) / 100));
}
