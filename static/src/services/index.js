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
