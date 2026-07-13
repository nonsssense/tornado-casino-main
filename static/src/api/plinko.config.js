/**
 * Fetch Plinko config (multiplier tables) from backend config.py.
 */

import { request } from './request.js';

/** @type {object|null} */
let cachedConfig = null;

/**
 * @returns {Promise<{ tables: object, rows: number[], risk_modes: string[] }>}
 */
export async function fetchPlinkoConfig() {
  if (cachedConfig) return cachedConfig;

  const data = await request('/api/games/plinco/config');
  cachedConfig = data;
  return data;
}

/**
 * @param {object} config
 * @param {string} riskMode
 * @param {number} rows
 * @returns {number[]|null}
 */
export function getMultipliersFromConfig(config, riskMode, rows) {
  if (!config?.tables) return null;
  const table = config.tables[riskMode]?.[rows];
  return Array.isArray(table) ? table : null;
}
