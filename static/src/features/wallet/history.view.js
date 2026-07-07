/**
 * History view — placeholder for the wallet modal history tab.
 */

import { createElement } from '../../utils/dom.js';

/**
 * @returns {{ element: HTMLElement }}
 */
export function createHistoryView() {
  const element = createElement('div', {
    className: 'wallet-view wallet-view--history',
    attrs: { 'data-view': 'history' },
    children: [
      createElement('div', {
        className: 'wallet-view__empty',
        children: [
          createElement('p', {
            className: 'wallet-view__empty-title',
            text: 'Transaction history',
          }),
          createElement('p', {
            className: 'wallet-view__empty-text',
            text: 'Coming soon',
          }),
        ],
      }),
    ],
  });

  return { element };
}
