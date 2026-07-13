/**
 * LiveBets — scrollable panel of current-round players.
 *
 * Public API is shaped for future WebSocket events:
 *   PLAYER_JOIN   → addBet
 *   PLAYER_CASHOUT → markCashedOut / updateBet
 *   ROUND_END / ROUND_OPEN → clear + setBets
 */

import { createElement } from '../../utils/dom.js';
import { createLiveBetRow } from './crash.live-bet-row.js';

/**
 * @typedef {{ id: string, username: string, amount: number, cashedOut?: boolean }} LiveBetData
 */

/**
 * @param {object} [options]
 * @param {LiveBetData[]} [options.bets]
 * @returns {{
 *   element: HTMLElement,
 *   addBet: (bet: LiveBetData) => void,
 *   updateBet: (id: string, patch: Partial<LiveBetData>) => void,
 *   markCashedOut: (id: string) => void,
 *   removeBet: (id: string) => void,
 *   clear: () => void,
 *   setBets: (bets: LiveBetData[]) => void,
 *   getBets: () => LiveBetData[],
 * }}
 */
export function createLiveBets(options = {}) {
  /** @type {Map<string, ReturnType<typeof createLiveBetRow>>} */
  const rows = new Map();

  const list = createElement('ul', {
    className: 'crash-live-bets__list',
    attrs: { 'aria-label': 'Live bets' },
  });

  const empty = createElement('p', {
    className: 'crash-live-bets__empty',
    text: 'No bets yet',
  });

  const scroll = createElement('div', {
    className: 'crash-live-bets__scroll',
    children: [list, empty],
  });

  const element = createElement('section', {
    className: 'crash-live-bets',
    attrs: {
      'aria-label': 'Live bets',
      role: 'region',
    },
    children: [
      createElement('header', {
        className: 'crash-live-bets__header',
        children: [
          createElement('h2', {
            className: 'crash-live-bets__title',
            text: 'Live Bets',
          }),
        ],
      }),
      scroll,
    ],
  });

  function syncEmpty() {
    const isEmpty = rows.size === 0;
    empty.hidden = !isEmpty;
    list.hidden = isEmpty;
  }

  /**
   * @param {LiveBetData} bet
   */
  function addBet(bet) {
    const id = String(bet.id);
    if (rows.has(id)) {
      updateBet(id, bet);
      return;
    }

    const row = createLiveBetRow(bet);
    rows.set(id, row);
    list.appendChild(row.element);
    syncEmpty();
  }

  /**
   * @param {string} id
   * @param {Partial<LiveBetData>} patch
   */
  function updateBet(id, patch) {
    const row = rows.get(String(id));
    if (!row) return;

    if (patch.amount != null) row.setAmount(patch.amount);
    if (patch.cashedOut != null) row.setCashedOut(patch.cashedOut);
  }

  /**
   * @param {string} id
   */
  function markCashedOut(id) {
    updateBet(id, { cashedOut: true });
  }

  /**
   * @param {string} id
   */
  function removeBet(id) {
    const key = String(id);
    const row = rows.get(key);
    if (!row) return;
    row.element.remove();
    rows.delete(key);
    syncEmpty();
  }

  function clear() {
    rows.forEach((row) => row.element.remove());
    rows.clear();
    syncEmpty();
  }

  /**
   * Replace the whole list without remounting the panel shell.
   * @param {LiveBetData[]} bets
   */
  function setBets(bets) {
    clear();
    (Array.isArray(bets) ? bets : []).forEach((bet) => addBet(bet));
  }

  function getBets() {
    return [...rows.values()].map((row) => row.getData());
  }

  setBets(options.bets ?? []);

  return {
    element,
    addBet,
    updateBet,
    markCashedOut,
    removeBet,
    clear,
    setBets,
    getBets,
  };
}
