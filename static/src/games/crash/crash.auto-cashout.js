/**
 * AutoCashOut — placeholder block under BET (no logic yet).
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';

/**
 * @returns {HTMLElement}
 */
export function createAutoCashOut() {
  return createElement('div', {
    className: 'crash-auto-cashout',
    attrs: {
      'aria-label': t('crash.autoCashout.aria'),
      role: 'group',
    },
    children: [
      createElement('span', {
        className: 'crash-auto-cashout__label',
        text: t('crash.autoCashout.auto'),
      }),
      createElement('span', {
        className: 'crash-auto-cashout__value',
        text: t('crash.autoCashout.cashOut'),
      }),
    ],
  });
}
