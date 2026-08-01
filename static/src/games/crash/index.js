/**
 * Crash (Aviator) game module barrel.
 */

export { CrashGame } from './crash.game.js';
export { createCrashHistory } from './crash.history.js';
export { createCrashHistoryItem } from './crash.history-item.js';
export { createAnimationContainer } from './crash.animation-container.js';
export { createFlightEngine, progressFromMultiplier, climbProgressFromElapsed, elapsedFromMultiplier } from './crash.flight-engine.js';
export { createBetPanel } from './crash.bet-panel.js';
export { createBetAmount } from './crash.bet-amount.js';
export { createBetButton, createCashOutButton } from './crash.bet-button.js';
export { createAutoCashOut } from './crash.auto-cashout.js';
export { createLiveBets } from './crash.live-bets.js';
export { createLiveBetRow } from './crash.live-bet-row.js';
export { createActivityHud } from './crash.activity-hud.js';
export {
  CRASH_BET_LIMITS,
  CRASH_QUICK_BETS,
  CRASH_GROWTH_RATE,
  CRASH_GROWTH_POWER,
  CRASH_HISTORY_LIMIT,
  CRASH_HISTORY_TIERS,
  CRASH_PAYOUT_TIERS,
} from './crash.constants.js';
export {
  formatMultiplier,
  formatPayout,
  getHistoryTierKey,
  getPayoutTierKey,
  clampBetAmount,
} from './crash.utils.js';
