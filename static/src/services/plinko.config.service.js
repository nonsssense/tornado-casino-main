/**
 * Plinko config loader — multiplier tables from backend.
 */

import { fetchPlinkoConfig, getMultipliersFromConfig } from '../api/plinko.config.js';

/** @type {object|null} */
let configCache = null;

export const plinkoConfigService = {
  async load() {
    if (!configCache) {
      configCache = await fetchPlinkoConfig();
    }
    return configCache;
  },

  getMultipliers(riskMode, rows) {
    return getMultipliersFromConfig(configCache, riskMode, rows);
  },

  clear() {
    configCache = null;
  },
};
