/**
 * Fetch Plinko config (multiplier tables) from backend config.py.
 * Frontend must not ship its own payout tables — this endpoint is the source of truth.
 */

import { request } from './request.js';

/** @type {object|null} */
let cachedConfig = null;

/**
 * Normalize risk → row → multipliers so row keys are always strings.
 * @param {object|null|undefined} tables
 * @returns {Record<string, Record<string, number[]>>}
 */
export function normalizePlinkoTables(tables) {
  /** @type {Record<string, Record<string, number[]>>} */
  const normalized = {};
  if (!tables || typeof tables !== 'object') return normalized;

  Object.entries(tables).forEach(([riskMode, rowsMap]) => {
    if (!rowsMap || typeof rowsMap !== 'object') return;
    /** @type {Record<string, number[]>} */
    const rowTables = {};
    Object.entries(rowsMap).forEach(([rowsKey, table]) => {
      if (!Array.isArray(table)) return;
      rowTables[String(rowsKey)] = table.map((value) => Number(value));
    });
    normalized[riskMode] = rowTables;
  });

  return normalized;
}

/**
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<{ tables: object, rows: number[], risk_modes: string[] }>}
 */
export async function fetchPlinkoConfig(options = {}) {
  const { force = false } = options;
  if (!force && cachedConfig) return cachedConfig;

  const data = await request('/api/games/plinco/config');
  cachedConfig = {
    ...data,
    tables: normalizePlinkoTables(data?.tables),
  };
  return cachedConfig;
}

/**
 * @param {object|null|undefined} config
 * @param {string} riskMode
 * @param {number|string} rows
 * @returns {number[]|null}
 */
export function getMultipliersFromConfig(config, riskMode, rows) {
  if (!config?.tables) return null;
  const riskTables = config.tables[riskMode];
  if (!riskTables) return null;

  const table = riskTables[rows]
    ?? riskTables[String(rows)]
    ?? riskTables[String(Number(rows))];

  return Array.isArray(table) ? table.slice() : null;
}

export function clearPlinkoConfigCache() {
  cachedConfig = null;
}
