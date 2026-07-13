/**
 * Freebet service (prepared).
 *
 * Responsibility:
 * - Hold freebet ticket state for game flows.
 * - API layer will be connected when backend exposes freebet endpoints.
 */

/** @type {object|null} */
let availableTicket = null;

export const freebetService = {
  /**
   * @returns {Promise<object|null>}
   */
  async fetchAvailableTicket() {
    // Prepared: no read endpoint yet.
    availableTicket = null;
    return availableTicket;
  },

  /**
   * @returns {object|null}
   */
  getAvailableTicket() {
    return availableTicket;
  },

  /**
   * @param {object|null} ticket
   */
  setAvailableTicket(ticket) {
    availableTicket = ticket;
  },

  clear() {
    availableTicket = null;
  },
};
