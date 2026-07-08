/**
 * Balance — balance display with separate amount and deposit controls.
 */

import { createElement } from '../../utils/dom.js';

const MOCK_BALANCE = '2314$';

/**
 * @param {object} [options]
 * @param {string} [options.amount]
 * @param {string} [options.currency]
 * @param {boolean} [options.showAddButton]
 * @param {function} [options.onAdd]
 * @param {function} [options.onBalanceClick]
 * @param {string} [options.className]
 */
export function Balance(options = {}) {
  const {
    amount = MOCK_BALANCE,
    showAddButton = true,
    onAdd,
    onBalanceClick,
    className = '',
  } = options;

  const classes = ['balance'];
  if (className) classes.push(className);

  const isHeader = className.includes('balance--header');

  const value = createElement('button', {
    className: 'balance__pill',
    attrs: {
      type: 'button',
      'aria-label': 'Open balance',
      'aria-live': 'polite',
      onClick: onBalanceClick || undefined,
    },
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

  return createElement('div', {
    className: classes.join(' '),
    children: controls,
  });
}
