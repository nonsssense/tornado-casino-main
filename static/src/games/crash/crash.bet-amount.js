/**
 * BetAmount — amount field with minus / plus steppers.
 */

import { createElement } from '../../utils/dom.js';
import { CRASH_BET_LIMITS } from './crash.constants.js';
import { clampBetAmount } from './crash.utils.js';

/**
 * @param {object} options
 * @param {number} [options.amount]
 * @param {(amount: number) => void} [options.onChange]
 * @param {boolean} [options.disabled]
 * @returns {{
 *   element: HTMLElement,
 *   getAmount: () => number,
 *   setAmount: (amount: number) => void,
 *   setDisabled: (disabled: boolean) => void,
 * }}
 */
export function createBetAmount(options = {}) {
  const limits = CRASH_BET_LIMITS;
  let amount = clampBetAmount(options.amount ?? limits.default, limits);
  let disabled = Boolean(options.disabled);
  let onChange = options.onChange;

  const input = createElement('input', {
    className: 'crash-bet-amount__input',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
      value: String(amount),
      'aria-label': 'Bet amount',
      onInput: (event) => {
        const parsed = parseFloat(String(event.target.value).replace(',', '.'));
        if (Number.isFinite(parsed) && parsed >= 0) {
          amount = parsed;
          onChange?.(amount);
        }
      },
      onBlur: (event) => {
        amount = clampBetAmount(
          parseFloat(String(event.target.value).replace(',', '.')),
          limits,
        );
        event.target.value = String(amount);
        onChange?.(amount);
      },
    },
  });

  const minusBtn = createElement('button', {
    className: 'crash-bet-amount__stepper',
    attrs: {
      type: 'button',
      'aria-label': 'Decrease bet',
      onClick: () => {
        amount = clampBetAmount(amount - limits.step, limits);
        input.value = String(amount);
        onChange?.(amount);
      },
    },
    text: '−',
  });

  const plusBtn = createElement('button', {
    className: 'crash-bet-amount__stepper',
    attrs: {
      type: 'button',
      'aria-label': 'Increase bet',
      onClick: () => {
        amount = clampBetAmount(amount + limits.step, limits);
        input.value = String(amount);
        onChange?.(amount);
      },
    },
    text: '+',
  });

  const element = createElement('div', {
    className: 'crash-bet-amount',
    children: [
      createElement('span', {
        className: 'crash-bet-amount__label',
        text: 'Bet amount',
      }),
      createElement('div', {
        className: 'crash-bet-amount__row',
        children: [minusBtn, input, plusBtn],
      }),
    ],
  });

  function syncDisabled() {
    input.disabled = disabled;
    minusBtn.disabled = disabled;
    plusBtn.disabled = disabled;
    element.classList.toggle('crash-bet-amount--disabled', disabled);
  }

  syncDisabled();

  return {
    element,
    getAmount: () => amount,
    setAmount(next) {
      amount = clampBetAmount(next, limits);
      input.value = String(amount);
    },
    setDisabled(next) {
      disabled = Boolean(next);
      syncDisabled();
    },
  };
}
