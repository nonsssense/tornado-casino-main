/**
 * Dice display helpers — UI preview only.
 * Payouts and outcomes always come from the backend.
 */

const HOUSE_EDGE = 97.5;

/**
 * @param {number} limit
 * @param {boolean} over
 * @returns {number} Win chance percent (0–99)
 */
export function getWinChance(limit, over) {
  const clamped = Math.min(98, Math.max(1, Math.round(limit)));
  return over ? 99 - clamped : clamped;
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
  const clamped = Math.min(98, Math.max(1, Math.round(limit)));
  const winCount = over ? 99 - clamped : clamped;
  const loseCount = 100 - winCount;

  return {
    winCount,
    loseCount,
    winPercent: winCount,
    losePercent: loseCount,
    splitRatio: over ? (clamped + 0.5) / 100 : clamped / 100,
  };
}

/**
 * @param {number} roll - Backend roll 0–99
 * @returns {number} CSS rotation degrees (0 at top, clockwise)
 */
export function rollToDegrees(roll) {
  const value = Math.min(99, Math.max(0, Math.round(roll)));
  return (value / 100) * 360;
}
