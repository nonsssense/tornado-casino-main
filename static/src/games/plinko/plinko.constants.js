/**
 * Plinko UI constants.
 * Risk keys match backend config.plinko_tables (low | medium | high).
 */

export const PLINKO_BET_LIMITS = {
  min: 0.2,
  max: 20,
};

/** Quick-select amounts shown inside the Bet Amount card. */
export const PLINKO_QUICK_BETS = [0.1, 0.2, 0.5, 1, 2, 5, 10];

export const PLINKO_ROW_OPTIONS = [8, 10, 12, 14, 16];

/** @type {Array<{ id: string, labelKey: string, riskMode: string }>} */
export const PLINKO_RISK_OPTIONS = [
  { id: 'low', labelKey: 'plinko.riskLevel.easy', riskMode: 'low' },
  { id: 'medium', labelKey: 'plinko.riskLevel.medium', riskMode: 'medium' },
  { id: 'high', labelKey: 'plinko.riskLevel.high', riskMode: 'high' },
];

export const PLINKO_DEFAULT_STATE = {
  bid: PLINKO_BET_LIMITS.min,
  risk_mode: 'medium',
  rows: 12,
};
