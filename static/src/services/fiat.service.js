/**
 * Fiat deposit service.
 *
 * Responsibility:
 * - Thin orchestration over the fiat deposit API.
 * - Never computes amounts, fees, rates, limits, or bonuses — the backend is
 *   authoritative. This layer only forwards input and returns responses.
 */

import { createFiatDeposit } from '../api/fiat.js';

export const fiatService = {
  /**
   * Create a fiat (KZT) deposit order and return the provider requisites.
   * @param {{ amount: number, token: string }} payload
   * @returns {Promise<object>}
   */
  async createDeposit(payload) {
    return createFiatDeposit(payload);
  },
};
