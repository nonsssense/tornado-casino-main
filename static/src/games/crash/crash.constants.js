/**
 * Crash (Aviator) — layout constants.
 */

/**
 * Soft growth curve (must match backend CrashGameLoop).
 *
 * multiplier = floor(100 * exp(RATE * elapsedMs^POWER)) / 100
 *
 * POWER < 1 damps acceleration at higher multipliers so 5x/10x/20x+
 * stay readable, while early 1x→2x pacing stays close to classic feel.
 * Provably-fair crash points are unchanged — only time↔display mapping.
 */
export const CRASH_GROWTH_RATE = 0.00062204;
export const CRASH_GROWTH_POWER = 0.75;

/** Bet amount bounds for local +/- controls. */
export const CRASH_BET_LIMITS = {
  min: 0.1,
  max: 1000,
  step: 0.1,
  default: 1,
};

/** Quick-select amounts shown under the Bet Amount steppers. */
export const CRASH_QUICK_BETS = [0.1, 0.2, 0.5, 1, 2, 5];

/** Match backend CrashGameLoop.BETTING_TIME for progress denominator. */
export const CRASH_BETTING_DURATION_SEC = 8;

/** How many recent crash multipliers to show in the history strip. */
export const CRASH_HISTORY_LIMIT = 10;

/**
 * History capsule color tiers by multiplier.
 * @type {{ min: number, max: number|null, key: string }[]}
 */
export const CRASH_HISTORY_TIERS = [
  { min: 1, max: 1.99, key: 'orange' },
  { min: 2, max: 4.99, key: 'yellow' },
  { min: 5, max: 9.99, key: 'green' },
  { min: 10, max: 24.99, key: 'cyan' },
  { min: 25, max: 99.99, key: 'purple' },
  { min: 100, max: null, key: 'red' },
];

/**
 * Live multiplier / cash-out payout text color tiers.
 * @type {{ min: number, max: number|null, key: string }[]}
 */
export const CRASH_PAYOUT_TIERS = [
  { min: 1, max: 2, key: 'orange' },
  { min: 2, max: 5, key: 'yellow' },
  { min: 5, max: 10, key: 'green' },
  { min: 10, max: 25, key: 'cyan' },
  { min: 25, max: 100, key: 'purple' },
  { min: 100, max: null, key: 'red' },
];

/**
 * @typedef {{ id: string, username: string, amount: number, cashedOut?: boolean }} CrashLiveBet
 */
