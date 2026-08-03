/**
 * Services barrel.
 *
 * Responsibility:
 * - Export business orchestration modules (services sit between api/ and pages/).
 * - Services may call api/ and utils/ but never render DOM directly.
 */

export {
  initAuth,
  startAuthLifecycle,
  getAuthUser,
  getWelcomePayload,
  clearWelcomePayload,
  enterGuestMode,
  handleSessionExpired,
  AUTH_STATUS,
  getAuthStatus,
  isAuthenticated,
  isGuest,
  isAuthLoading,
  subscribeAuthStatus,
} from './auth.service.js';
export { walletService } from './wallet.service.js';
export { balanceService } from './balance.service.js';
export { gameService } from './game.service.js';
export { crashService, calculateCrashMultiplier, getLiveMultiplier } from './crash.service.js';
export { profileService } from './profile.service.js';
export { bonusService } from './bonus.service.js';
export { bonusCatalogService, filterBonuses, cardMatchesCategory } from './bonus-catalog.service.js';
export { campaignService } from './campaign.service.js';
export { referralService } from './referral.service.js';
export { freebetService } from './freebet.service.js';
export { balanceTypeService, BALANCE_TYPES } from './balance-type.service.js';
export { soundManager } from './sound.service.js';
export { settingsService } from './settings.service.js';
export { trackingService } from './tracking.service.js';
