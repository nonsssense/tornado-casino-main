/**
 * Services barrel.
 *
 * Responsibility:
 * - Export business orchestration modules (services sit between api/ and pages/).
 * - Services may call api/ and utils/ but never render DOM directly.
 */

export { initAuth } from './auth.service.js';
export { walletService } from './wallet.service.js';
export { balanceService } from './balance.service.js';
export { gameService } from './game.service.js';
export { crashService, calculateCrashMultiplier, getLiveMultiplier } from './crash.service.js';
export { profileService } from './profile.service.js';
export { bonusService } from './bonus.service.js';
export { freebetService } from './freebet.service.js';
export { balanceTypeService, BALANCE_TYPES } from './balance-type.service.js';
