/**
 * LiveBetRow — one player bet in the Live Bets list.
 */

import { createElement } from '../../utils/dom.js';
import { formatUsd } from '../../utils/format.js';
import { t } from '../../i18n/index.js';

/**
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.username
 * @param {number} options.amount
 * @param {boolean} [options.cashedOut]
 * @returns {{
 *   element: HTMLElement,
 *   id: string,
 *   setCashedOut: (cashedOut: boolean) => void,
 *   setAmount: (amount: number) => void,
 *   getData: () => { id: string, username: string, amount: number, cashedOut: boolean },
 * }}
 */
export function createLiveBetRow(options) {
  const state = {
    id: String(options.id),
    username: options.username || t('common.player'),
    amount: Number(options.amount) || 0,
    cashedOut: Boolean(options.cashedOut),
  };

  const nameEl = createElement('span', {
    className: 'crash-live-bets__name',
    text: state.username,
  });

  const amountEl = createElement('span', {
    className: 'crash-live-bets__amount',
    text: formatBetAmount(state.amount),
  });

  const element = createElement('li', {
    className: 'crash-live-bets__row',
    attrs: {
      'data-bet-id': state.id,
    },
    children: [nameEl, amountEl],
  });

  function sync() {
    nameEl.textContent = state.username;
    amountEl.textContent = formatBetAmount(state.amount);
    element.classList.toggle('crash-live-bets__row--cashed-out', state.cashedOut);
  }

  sync();

  return {
    element,
    id: state.id,
    setCashedOut(cashedOut) {
      state.cashedOut = Boolean(cashedOut);
      sync();
    },
    setAmount(amount) {
      state.amount = Number(amount) || 0;
      sync();
    },
    getData() {
      return { ...state };
    },
  };
}

/**
 * @param {number} amount
 * @returns {string}
 */
function formatBetAmount(amount) {
  return formatUsd(amount);
}
