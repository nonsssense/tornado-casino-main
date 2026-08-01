/**
 * Plinko config loader — multiplier tables from backend only.
 */

import {
  clearPlinkoConfigCache,
  fetchPlinkoConfig,
  getMultipliersFromConfig,
} from '../api/plinko.config.js';

/** @type {object|null} */
let configCache = null;

export const plinkoConfigService = {
  /**
   * @param {{ force?: boolean }} [options]
   */
  async load(options = {}) {
    const { force = false } = options;
    if (force || !configCache) {
      if (force) clearPlinkoConfigCache();
      configCache = await fetchPlinkoConfig({ force });
    }
    return configCache;
  },

  /**
   * @param {string} riskMode
   * @param {number|string} rows
   * @returns {number[]|null}
   */
  getMultipliers(riskMode, rows) {
    return getMultipliersFromConfig(configCache, riskMode, rows);
  },

  clear() {
    configCache = null;
    clearPlinkoConfigCache();
  },
};
