/**
 * Balance type service (prepared).
 *
 * Responsibility:
 * - Track REAL vs BONUS balance selection for games.
 * - UI selector is not built yet; GameManager resolves balance server-side today.
 * - When the API accepts balance_type / freebet_ticket_id, this state will be sent.
 */

export const BALANCE_TYPES = {
  REAL: 'REAL',
  BONUS: 'BONUS',
  FREEBET: 'FREEBET',
};

/** @type {'REAL'|'BONUS'|'FREEBET'} */
let selectedBalanceType = BALANCE_TYPES.REAL;

/** @type {Set<function>} */
const listeners = new Set();

export const balanceTypeService = {
  /**
   * @returns {'REAL'|'BONUS'|'FREEBET'}
   */
  getSelected() {
    return selectedBalanceType;
  },

  /**
   * @param {'REAL'|'BONUS'|'FREEBET'} type
   */
  setSelected(type) {
    if (!Object.values(BALANCE_TYPES).includes(type)) return;
    selectedBalanceType = type;
    listeners.forEach((listener) => listener(selectedBalanceType));
  },

  /**
   * Prepared payload extension for game API calls.
   * @returns {{ balance_type?: string, freebet_ticket_id?: number }}
   */
  getGamePayloadExtras() {
    // Not sent until backend documents these fields on game endpoints.
    return {};
  },

  /**
   * @param {function(string): void} callback
   * @returns {function(): void}
   */
  subscribe(callback) {
    listeners.add(callback);
    callback(selectedBalanceType);
    return () => listeners.delete(callback);
  },
};
