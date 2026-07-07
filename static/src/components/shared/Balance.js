/**
 * Balance — balance display with optional deposit control.
 * Rebuilt for new header design with compact, refined appearance
 */

import { createElement } from '../../utils/dom.js';

const MOCK_BALANCE = '2314$';

/**
 * @param {object} [options]
 * @param {string} [options.amount]
 * @param {string} [options.currency]
 * @param {boolean} [options.showAddButton]
 * @param {function} [options.onAdd]
 * @param {string} [options.className]
 */
export function Balance(options = {}) {
  const {
    amount = MOCK_BALANCE,
    showAddButton = true,
    onAdd,
    className = '',
  } = options;

  const classes = ['balance'];
  if (className) classes.push(className);

  const isHeader = className.includes('balance--header');

  const value = createElement('span', {
    className: 'balance__pill',
    attrs: { 'aria-live': 'polite' },
    text: amount,
  });

  const controls = [value];

  if (showAddButton) {
    controls.push(createElement('button', {
      className: 'balance__add',
      attrs: {
        type: 'button',
        'aria-label': 'Deposit',
        onClick: onAdd || undefined,
      },
      text: '+',
    }));
  }

  // Header context: unified widget container
  if (isHeader) {
    return createElement('div', {
      className: classes.join(' '),
      children: [
        createElement('div', {
          className: 'balance__widget',
          children: controls,
        }),
      ],
    });
  }

  // Default context: separate elements
  return createElement('div', {
    className: classes.join(' '),
    children: controls,
  });
}
