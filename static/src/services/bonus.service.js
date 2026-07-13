/**
 * Bonus service.
 *
 * Responsibility:
 * - Orchestrate deposit-tier offers, selection, and active instances.
 * - Keep deposit selector state in sync with BonusManager APIs.
 */

import { balanceService } from './balance.service.js';
import {
  fetchActiveBonuses as fetchActiveBonusesApi,
  fetchBonusOffers,
  selectBonusOffer as selectBonusOfferApi,
} from '../api/bonus.js';

/** @type {Array<object>} */
let offers = [];

/** @type {string|null} */
let selectedOfferId = null;

/** @type {Array<object>} */
let activeBonuses = [];

/** @type {object|null} */
let rules = null;

/** @type {number|null} */
let completedDeposits = null;

/** @type {number|null} */
let nextDepositIndex = null;

/** @type {Set<function>} */
const listeners = new Set();

function applyOffersPayload(data) {
  offers = Array.isArray(data?.offers) ? data.offers : [];
  selectedOfferId = data?.selected_offer_id ?? offers.find((o) => o.selected)?.id ?? null;
  rules = data?.rules ?? null;
  completedDeposits = data?.completed_deposits ?? null;
  nextDepositIndex = data?.next_deposit_index ?? null;
}

function notify() {
  listeners.forEach((listener) => listener(bonusService.getState()));
}

export const bonusService = {
  /**
   * @returns {Promise<number>}
   */
  async fetchBonusBalance() {
    const balances = await balanceService.fetchBalances();
    return balances.bonus;
  },

  /**
   * @returns {Promise<object>}
   */
  async fetchOffers() {
    const data = await fetchBonusOffers();
    applyOffersPayload(data);
    notify();
    return this.getState();
  },

  /**
   * @returns {Promise<Array<object>>}
   */
  async fetchActiveBonuses() {
    const data = await fetchActiveBonusesApi();
    activeBonuses = Array.isArray(data?.bonuses) ? data.bonuses : [];
    notify();
    return activeBonuses.slice();
  },

  /**
   * @param {string} offerId
   * @returns {Promise<object>}
   */
  async selectOffer(offerId) {
    const data = await selectBonusOfferApi(offerId);
    applyOffersPayload(data);
    notify();
    return this.getState();
  },

  /**
   * @returns {object}
   */
  getState() {
    return {
      offers: offers.slice(),
      selectedOfferId,
      selectedOffer: offers.find((offer) => offer.id === selectedOfferId) || null,
      activeBonuses: activeBonuses.slice(),
      rules,
      completedDeposits,
      nextDepositIndex,
    };
  },

  /**
   * @param {function(object): void} callback
   * @returns {function(): void}
   */
  subscribe(callback) {
    listeners.add(callback);
    callback(this.getState());
    return () => listeners.delete(callback);
  },
};
