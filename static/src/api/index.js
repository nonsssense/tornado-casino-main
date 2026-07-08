/**
 * API module barrel.
 *
 * Responsibility:
 * - Re-export all documented API clients from a single import path.
 * - Keep api/*.js focused on HTTP contracts only (no UI, no state).
 */

export { request } from './request.js';
export { authenticate } from './auth.js';
export { rollDice, playPlinko } from './games.js';
export { createDeposit, fetchBalance, fetchDepositStatus, fetchHistory } from './wallet.js';
