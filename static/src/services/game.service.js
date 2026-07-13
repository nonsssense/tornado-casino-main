/**
 * Game service.
 *
 * Responsibility:
 * - Coordinate bet submission and result handling for Dice and Plinko.
 * - Trigger animations with backend-returned data only.
 * - Refresh balance after each round via balance.service.js.
 */

import { rollDice, playPlinko } from '../api/games.js';
import { balanceService } from './balance.service.js';

/**
 * @param {unknown} error
 * @returns {string}
 */
function getGameErrorMessage(error) {
  const detail = error?.data?.detail;

  if (typeof detail === 'object' && detail?.message) {
    return detail.message;
  }

  if (typeof detail === 'string') {
    return detail;
  }

  if (error?.status === 409) {
    return 'Insufficient balance. Please top up your wallet.';
  }

  return 'Unable to complete the game round. Please try again.';
}

export const gameService = {
  /**
   * @param {{ bid: number, limit: number, over: boolean }} payload
   */
  async playDice(payload) {
    try {
      const result = await rollDice(payload);
      await balanceService.fetchBalances();
      return result;
    } catch (error) {
      throw new Error(getGameErrorMessage(error));
    }
  },

  /**
   * @param {{ bid: number, risk_mode: string, rows: number }} payload
   */
  async playPlinko(payload) {
    try {
      const result = await playPlinko(payload);
      await balanceService.fetchBalances();
      return result;
    } catch (error) {
      throw new Error(getGameErrorMessage(error));
    }
  },
};
