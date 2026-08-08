/**
 * Lightweight shared AppState — frontend cache facade only.
 *
 * Responsibility:
 * - Expose already-cached service data from one place.
 * - Coordinate cache invalidation without duplicating backend logic.
 * - Backend remains the source of truth; this is display freshness only.
 */

import { getAuthUser, getAuthStatus, isAuthenticated } from './auth.service.js';
import { balanceService } from './balance.service.js';
import { referralService } from './referral.service.js';
import { settingsService } from './settings.service.js';
import { personalDataService } from './personal-data.service.js';
import { profileService } from './profile.service.js';

/** @type {boolean} */
let wired = false;

/**
 * Wire cross-service invalidation once (idempotent).
 * Balance mutations invalidate personal-data summary so the next open is fresh.
 */
function ensureWired() {
  if (wired) return;
  wired = true;

  balanceService.subscribe(() => {
    personalDataService.invalidate();
  });
}

export const appState = {
  init() {
    ensureWired();
  },

  getAuthStatus,
  isAuthenticated,
  getUser: () => getAuthUser(),

  getBalances: () => balanceService.getBalances(),

  getReferralSummary: () => referralService.getSummary(),
  getReferralStatus: () => referralService.getStatus(),

  getSettings: () => settingsService.getSettings(),

  getPersonalData: () => personalDataService.getCached(),
  isPersonalDataFresh: () => personalDataService.isFresh(),

  /**
   * @param {{ force?: boolean }} [options]
   */
  async ensurePersonalData(options = {}) {
    ensureWired();
    return personalDataService.fetch(options);
  },

  invalidatePersonalData() {
    personalDataService.invalidate();
  },

  /**
   * Soft profile snapshot — reuses balance/referral caches when available.
   */
  async getProfileSummary() {
    return profileService.getProfile();
  },
};
