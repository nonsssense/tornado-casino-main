/**
 * BetAmount — amount field with minus / plus steppers + quick bets.
 */

import { createElement } from '../../utils/dom.js';
import { CRASH_BET_LIMITS, CRASH_QUICK_BETS } from './crash.constants.js';
import { clampBetAmount } from './crash.utils.js';
import { t } from '../../i18n/index.js';
import { hideTelegramKeyboard } from '../../app/telegram.js';

/**
 * @param {number} value
 * @returns {number}
 */
function roundCents(value) {
  return Math.round(Number(value) * 100) / 100;
}

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
  const limits = {
    min: CRASH_BET_LIMITS.min,
    max: options.max ?? CRASH_BET_LIMITS.max,
    step: CRASH_BET_LIMITS.step,
    default: CRASH_BET_LIMITS.default,
  };
  let amount = clampBetAmount(options.amount ?? limits.default, limits);
  let disabled = Boolean(options.disabled);
  let onChange = options.onChange;

  const input = createElement('input', {
    className: 'crash-bet-amount__input',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
      value: String(amount),
      'aria-label': t('crash.betAmount.label'),
      onInput: (event) => {
        const parsed = parseFloat(String(event.target.value).replace(',', '.'));
        if (Number.isFinite(parsed) && parsed >= 0) {
          amount = parsed;
          syncQuickBets();
          onChange?.(amount);
        }
      },
      onBlur: (event) => {
        amount = clampBetAmount(
          parseFloat(String(event.target.value).replace(',', '.')),
          limits,
        );
        event.target.value = String(amount);
        syncQuickBets();
        onChange?.(amount);
        hideTelegramKeyboard();
      },
    },
  });

  const minusBtn = createElement('button', {
    className: 'crash-bet-amount__stepper',
    attrs: {
      type: 'button',
      'aria-label': t('crash.betAmount.decrease'),
      onClick: () => {
        applyAmount(amount - limits.step);
      },
    },
    text: '−',
  });

  const plusBtn = createElement('button', {
    className: 'crash-bet-amount__stepper',
    attrs: {
      type: 'button',
      'aria-label': t('crash.betAmount.increase'),
      onClick: () => {
        applyAmount(amount + limits.step);
      },
    },
    text: '+',
  });

  const quickBetButtons = CRASH_QUICK_BETS.map((preset) => {
    const btn = createElement('button', {
      className: 'crash-bet-amount__quick-bet',
      attrs: {
        type: 'button',
        'aria-pressed': 'false',
        onClick: () => {
          applyAmount(preset);
          btn.classList.add('crash-bet-amount__quick-bet--pressed');
          window.setTimeout(() => {
            btn.classList.remove('crash-bet-amount__quick-bet--pressed');
          }, 150);
        },
      },
      text: String(preset),
    });
    return { amount: preset, btn };
  });

  const quickBetsRow = createElement('div', {
    className: 'crash-bet-amount__quick-bets',
    attrs: { role: 'group', 'aria-label': t('crash.betAmount.quickAria') },
    children: quickBetButtons.map((entry) => entry.btn),
  });

  const element = createElement('div', {
    className: 'crash-bet-amount',
    children: [
      createElement('span', {
        className: 'crash-bet-amount__label',
        text: t('crash.betAmount.label'),
      }),
      createElement('div', {
        className: 'crash-bet-amount__row',
        children: [minusBtn, input, plusBtn],
      }),
      quickBetsRow,
    ],
  });

  /**
   * @param {number} next
   */
  function applyAmount(next) {
    amount = clampBetAmount(next, limits);
    input.value = String(amount);
    syncQuickBets();
    onChange?.(amount);
  }

  function syncQuickBets() {
    const current = roundCents(amount);
    quickBetButtons.forEach(({ amount: preset, btn }) => {
      const active = current === roundCents(preset);
      btn.classList.toggle('crash-bet-amount__quick-bet--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function syncDisabled() {
    input.disabled = disabled;
    minusBtn.disabled = disabled;
    plusBtn.disabled = disabled;
    quickBetButtons.forEach(({ btn }) => {
      btn.disabled = disabled;
    });
    element.classList.toggle('crash-bet-amount--disabled', disabled);
  }

  syncQuickBets();
  syncDisabled();

  return {
    element,
    getAmount: () => amount,
    setAmount(next) {
      amount = clampBetAmount(next, limits);
      input.value = String(amount);
      syncQuickBets();
    },
    setMax(nextMax) {
      const parsed = Number(nextMax);
      limits.max = Number.isFinite(parsed)
        ? Math.max(limits.min, Math.round(parsed * 100) / 100)
        : CRASH_BET_LIMITS.max;
      amount = clampBetAmount(amount, limits);
      input.value = String(amount);
      syncQuickBets();
    },
    setDisabled(next) {
      disabled = Boolean(next);
      syncDisabled();
    },
  };
}
