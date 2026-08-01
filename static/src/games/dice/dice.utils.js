/**
 * Dice display helpers — UI preview only.
 * Payouts and outcomes always come from the backend.
 */

import { DICE_TARGET_LIMITS } from './dice.constants.js';

const HOUSE_EDGE = 97.5;

/**
 * @param {number} limit
 * @returns {number}
 */
export function clampDiceTarget(limit) {
  return Math.min(
    DICE_TARGET_LIMITS.max,
    Math.max(DICE_TARGET_LIMITS.min, Math.round(Number(limit) || DICE_TARGET_LIMITS.min)),
  );
}

/**
 * @param {number} limit
 * @param {boolean} over
 * @returns {number} Win chance percent (0–99)
 */
export function getWinChance(limit, over) {
  const clamped = clampDiceTarget(limit);
  return over ? 100 - clamped : clamped;
}

/**
 * @param {number} chance
 * @returns {number}
 */
export function getDisplayMultiplier(chance) {
  if (!chance || chance <= 0) return 0;
  return HOUSE_EDGE / chance;
}

/**
 * @param {number} bid
 * @param {number} limit
 * @param {boolean} over
 * @returns {{ chance: number, multiplier: number, profit: number }}
 */
export function getDisplayStats(bid, limit, over) {
  const chance = getWinChance(limit, over);
  const multiplier = getDisplayMultiplier(chance);
  const safeBid = Number.isFinite(bid) && bid > 0 ? bid : 0;
  const profit = safeBid * multiplier - safeBid;
  const payout = safeBid * multiplier;

  return { chance, multiplier, profit, payout };
}

/**
 * Sector sizes for the probability wheel (100 outcomes: 0–99).
 * @param {number} limit
 * @param {boolean} over
 */
export function getWheelSectors(limit, over) {
  const clamped = clampDiceTarget(limit);
  const winCount = over ? 100 - clamped : clamped;
  const loseCount = 100 - winCount;

  return {
    winCount,
    loseCount,
    winPercent: winCount,
    losePercent: loseCount,
    splitRatio: clamped / 100,
  };
}

/**
 * @param {number} roll - Backend roll 0–99
 * @returns {number} CSS rotation degrees (roll 0 at the wheel's 180° sector origin)
 */
export function rollToDegrees(roll) {
  const value = Math.min(99, Math.max(0, Math.round(roll)));
  return 180 + (value / 100) * 360;
}
