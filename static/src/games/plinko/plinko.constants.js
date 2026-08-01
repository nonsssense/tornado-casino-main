/**
 * Plinko UI constants.
 * Risk keys match backend config.plinko_tables (low | medium | high).
 * Bet limits mirror backend config (UX only).
 */

export const PLINKO_BET_MIN = 0.1;

/** @type {Record<string, number>} */
export const PLINKO_BET_MAX_BY_RISK = {
  high: 5,
  medium: 20,
  low: 80,
};

/**
 * @param {string} [riskMode]
 * @returns {{ min: number, max: number }}
 */
export function getPlinkoBetLimits(riskMode) {
  const max = PLINKO_BET_MAX_BY_RISK[riskMode] ?? PLINKO_BET_MAX_BY_RISK.medium;
  return { min: PLINKO_BET_MIN, max };
}

/** @deprecated Prefer getPlinkoBetLimits(riskMode) — max depends on risk. */
export const PLINKO_BET_LIMITS = {
  min: PLINKO_BET_MIN,
  max: PLINKO_BET_MAX_BY_RISK.medium,
};

/** Quick-select amounts shown inside the Bet Amount card. */
export const PLINKO_QUICK_BETS = [0.1, 0.2, 0.5, 1, 2, 5, 10];

export const PLINKO_ROW_OPTIONS = [8, 10, 12, 14, 16];
export const PLINKO_BALL_LIMITS = { min: 1, max: 10 };

/** @type {Array<{ id: string, labelKey: string, riskMode: string }>} */
export const PLINKO_RISK_OPTIONS = [
  { id: 'low', labelKey: 'plinko.riskLevel.easy', riskMode: 'low' },
  { id: 'medium', labelKey: 'plinko.riskLevel.medium', riskMode: 'medium' },
  { id: 'high', labelKey: 'plinko.riskLevel.high', riskMode: 'high' },
];

export const PLINKO_DEFAULT_STATE = {
  bid: PLINKO_BET_MIN,
  risk_mode: 'medium',
  rows: 12,
  count: 1,
};
