/**
 * BetButton / CashOutButton — single control with BET | CASH OUT modes.
 */

import { createElement } from '../../utils/dom.js';
import { formatPayout, getPayoutTierKey } from './crash.utils.js';

/**
 * @typedef {'bet' | 'cashout'} CrashActionMode
 */

/**
 * @param {object} [options]
 * @param {CrashActionMode} [options.mode]
 * @param {number} [options.payout]
 * @param {number} [options.multiplier]
 * @param {() => void} [options.onClick]
 * @param {boolean} [options.disabled]
 * @returns {{
 *   element: HTMLElement,
 *   setMode: (mode: CrashActionMode, meta?: { payout?: number, multiplier?: number }) => void,
 *   setDisabled: (disabled: boolean) => void,
 *   getMode: () => CrashActionMode,
 * }}
 */
export function createBetButton(options = {}) {
  let mode = options.mode === 'cashout' ? 'cashout' : 'bet';
  let payout = Number(options.payout) || 0;
  let multiplier = Number(options.multiplier) || 1;
  let disabled = Boolean(options.disabled);
  let onClick = options.onClick;

  const label = createElement('span', {
    className: 'crash-bet-button__label',
    text: 'BET',
  });

  const payoutEl = createElement('span', {
    className: 'crash-bet-button__payout',
    text: formatPayout(payout),
  });

  const element = createElement('button', {
    className: 'crash-bet-button',
    attrs: {
      type: 'button',
      onClick: () => onClick?.(),
    },
    children: [label, payoutEl],
  });

  function sync() {
    const isCashout = mode === 'cashout';
    element.classList.toggle('crash-bet-button--cashout', isCashout);
    element.classList.toggle('crash-bet-button--bet', !isCashout);
    element.disabled = disabled;

    label.textContent = isCashout ? 'CASH OUT' : 'BET';
    payoutEl.hidden = !isCashout;
    payoutEl.textContent = formatPayout(payout);

    const tier = getPayoutTierKey(multiplier);
    payoutEl.className = `crash-bet-button__payout crash-bet-button__payout--${tier}`;
  }

  sync();

  return {
    element,
    getMode: () => mode,
    setMode(nextMode, meta = {}) {
      mode = nextMode === 'cashout' ? 'cashout' : 'bet';
      if (meta.payout != null) payout = Number(meta.payout) || 0;
      if (meta.multiplier != null) multiplier = Number(meta.multiplier) || 1;
      sync();
    },
    setDisabled(next) {
      disabled = Boolean(next);
      sync();
    },
  };
}

/**
 * Alias for API clarity when composing cash-out UI.
 * Same component — mode starts as cashout.
 *
 * @param {object} [options]
 */
export function createCashOutButton(options = {}) {
  return createBetButton({
    ...options,
    mode: 'cashout',
  });
}
