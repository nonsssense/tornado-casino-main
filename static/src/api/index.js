/**
 * API module barrel.
 *
 * Responsibility:
 * - Re-export all documented API clients from a single import path.
 * - Keep api/*.js focused on HTTP contracts only (no UI, no state).
 */

export { request } from './request.js';
export { authenticate } from './auth.js';
export { dismissWelcome } from './welcome.js';
export { rollDice, playPlinko } from './games.js';
export {
  fetchCrashState,
  fetchCrashHistory,
  placeCrashBet,
  cashoutCrash,
} from './crash.js';
export { createDeposit, fetchBalance, fetchDepositMinimum, fetchDepositStatus, fetchHistory, submitWithdraw } from './wallet.js';
export { createFiatDeposit } from './fiat.js';
export { fetchBonusOffers, fetchActiveBonuses, selectBonusOffer } from './bonus.js';
export { fetchBonusCatalog, fetchBonusCatalogItem } from './bonus-catalog.js';
export { fetchCampaigns, fetchCampaignDetail } from './campaigns.js';
export { fetchReferralSummary, fetchReferralStatus, claimReferralEarnings } from './referrals.js';
export { fetchSettings, updateSettings } from './settings.js';
export { fetchPersonalData } from './personal-data.js';
