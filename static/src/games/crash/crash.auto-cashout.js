/**
 * AutoCashOut — placeholder block under BET (no logic yet).
 */

import { createElement } from '../../utils/dom.js';

/**
 * @returns {HTMLElement}
 */
export function createAutoCashOut() {
  return createElement('div', {
    className: 'crash-auto-cashout',
    attrs: {
      'aria-label': 'Auto cash out',
      role: 'group',
    },
    children: [
      createElement('span', {
        className: 'crash-auto-cashout__label',
        text: 'Auto',
      }),
      createElement('span', {
        className: 'crash-auto-cashout__value',
        text: 'Cash Out',
      }),
    ],
  });
}
