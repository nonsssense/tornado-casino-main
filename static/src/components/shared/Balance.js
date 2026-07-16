/**
 * Balance — balance display with separate amount and deposit controls.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';

/**
 * @param {object} [options]
 * @param {string} [options.amount]
 * @param {boolean} [options.loading]
 * @param {string} [options.currency]
 * @param {boolean} [options.showAddButton]
 * @param {function} [options.onAdd]
 * @param {function} [options.onBalanceClick]
 * @param {string} [options.className]
 */
export function Balance(options = {}) {
  const {
    amount = t('common.emDash'),
    loading = false,
    showAddButton = true,
    onAdd,
    onBalanceClick,
    className = '',
  } = options;

  const classes = ['balance'];
  if (className) classes.push(className);

  const isHeader = className.includes('balance--header');

  const pillClasses = ['balance__pill'];
  if (loading) pillClasses.push('balance__pill--loading');

  const value = createElement('button', {
    className: pillClasses.join(' '),
    attrs: {
      type: 'button',
      'aria-label': loading ? t('balance.aria.loading') : t('balance.aria.open'),
      'aria-live': 'polite',
      'aria-busy': loading ? 'true' : 'false',
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
        'aria-label': t('balance.aria.deposit'),
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
