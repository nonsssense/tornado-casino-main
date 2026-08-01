/**
 * Game service.
 *
 * Responsibility:
 * - Coordinate bet submission and result handling for Dice and Plinko.
 * - Trigger animations with backend-returned data only.
 * - Stage the refreshed balance until the game animation reveals the result.
 */

import { rollDice, playPlinko, playPlinkoBatch } from '../api/games.js';
import { balanceService } from './balance.service.js';
import { t } from '../i18n/index.js';

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
    return t('games.error.insufficient');
  }

  return t('games.error.generic');
}

export const gameService = {
  /**
   * @param {{ bid: number, limit: number, over: boolean }} payload
   */
  async playDice(payload) {
    try {
      const result = await rollDice(payload);
      await balanceService.fetchBalances({ notify: false, stage: true });
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
      await balanceService.fetchBalances({ notify: false, stage: true });
      return result;
    } catch (error) {
      throw new Error(getGameErrorMessage(error));
    }
  },

  /**
   * @param {{ bid: number, count: number, risk_mode: string, rows: number }} payload
   */
  async playPlinkoBatch(payload) {
    try {
      const response = await playPlinkoBatch(payload);
      const results = Array.isArray(response?.results) ? response.results : [];
      if (results.length !== payload.count) {
        throw new Error(t('games.error.generic'));
      }

      const sequenceReady = balanceService.beginSettlementSequence(
        response.balance_after_debit,
        response.balances,
      );
      if (!sequenceReady) {
        throw new Error(t('games.error.generic'));
      }
      return response;
    } catch (error) {
      throw new Error(getGameErrorMessage(error));
    }
  },
};
