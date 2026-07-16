/**
 * AmountInput — numeric amount field with integrated MAX control.
 * Visual language matches NetworkSelector for wallet screens.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';

/**
 * @param {object} [options]
 * @param {string} [options.label]
 * @param {string} [options.name]
 * @param {string} [options.value] - controlled numeric value (currency is display-only)
 * @param {string} [options.currency] - visual suffix, e.g. USD, BTC
 * @param {string} [options.placeholder]
 * @param {string} [options.error] - validation message (rendered when set)
 * @param {string} [options.hint]
 * @param {boolean} [options.disabled]
 * @param {function} [options.onInput] - (event) => void
 * @param {function} [options.onChange] - (event) => void
 * @param {function} [options.onMaxClick] - reserved for future max-balance logic
 * @param {string} [options.className]
 * @returns {HTMLElement}
 */
export function AmountInput(options = {}) {
  const {
    label = t('wallet.amount.label'),
    name = 'amount',
    value = '',
    currency = '',
    placeholder = t('wallet.amount.placeholder'),
    error = '',
    hint = '',
    disabled = false,
    onInput,
    onChange,
    onMaxClick,
    className = '',
  } = options;

  const classes = ['amount-input'];
  if (className) classes.push(className);
  if (error) classes.push('amount-input--error');
  if (value) classes.push('amount-input--has-value');

  const control = createElement('input', {
    className: 'amount-input__control',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
      name,
      id: name,
      placeholder,
      value,
      disabled,
      onInput,
      onChange,
      'aria-invalid': error ? 'true' : 'false',
      autocomplete: 'off',
    },
  });

  const valueAreaChildren = [control];

  if (currency) {
    valueAreaChildren.push(createElement('span', {
      className: 'amount-input__currency',
      attrs: { 'aria-hidden': 'true' },
      text: currency,
    }));
  }

  const field = createElement('div', {
    className: 'amount-input__field',
    children: [
      createElement('div', {
        className: 'amount-input__value-area',
        children: valueAreaChildren,
      }),
      createElement('button', {
        className: 'amount-input__max',
        attrs: {
          type: 'button',
          disabled,
          onClick: onMaxClick,
          'aria-label': t('wallet.amount.maxAria'),
        },
        text: t('wallet.amount.max'),
      }),
    ],
  });

  const children = [
    createElement('label', {
      className: 'amount-input__label',
      attrs: { for: name },
      text: label,
    }),
    field,
  ];

  if (error) {
    children.push(createElement('span', {
      className: 'amount-input__error',
      text: error,
      attrs: { role: 'alert' },
    }));
  } else if (hint) {
    children.push(createElement('span', {
      className: 'amount-input__hint',
      text: hint,
    }));
  }

  return createElement('div', {
    className: classes.join(' '),
    children,
  });
}

/**
 * Update the currency suffix without re-mounting the input.
 * @param {HTMLElement} root - AmountInput root element
 * @param {string} currency
 * @param {boolean} [hasValue]
 */
export function updateAmountInputCurrency(root, currency, hasValue = false) {
  const suffix = root.querySelector('.amount-input__currency');

  if (suffix) {
    suffix.textContent = currency;
  }

  root.classList.toggle('amount-input--has-value', hasValue);
}
