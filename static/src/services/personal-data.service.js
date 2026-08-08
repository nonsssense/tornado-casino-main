/**
 * Personal Data service — cached aggregated payload with TTL freshness.
 */

import { fetchPersonalData } from '../api/personal-data.js';

/** Freshness window for Personal Data (balances/stats). */
const TTL_MS = 60_000;

/** @type {object|null} */
let cached = null;

/** @type {number} */
let cachedAt = 0;

/** @type {boolean} */
let invalidated = false;

/** @type {Promise<object>|null} */
let inFlight = null;

function isFreshNow() {
  if (!cached || invalidated) return false;
  return Date.now() - cachedAt < TTL_MS;
}

export const personalDataService = {
  /**
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<object>}
   */
  async fetch(options = {}) {
    const { force = false } = options;

    if (!force && isFreshNow()) {
      return cached;
    }

    if (inFlight) {
      return inFlight;
    }

    inFlight = fetchPersonalData()
      .then((payload) => {
        cached = payload;
        cachedAt = Date.now();
        invalidated = false;
        return cached;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  },

  getCached() {
    return cached;
  },

  isFresh() {
    return isFreshNow();
  },

  /**
   * Mark cache stale without clearing last good payload (allows paint-from-cache).
   */
  invalidate() {
    invalidated = true;
  },

  clearCache() {
    cached = null;
    cachedAt = 0;
    invalidated = false;
  },
};
