/**
 * BetPanel — one betting card: amount (left) | BET + Auto Cash Out (right).
 */

import { createElement } from '../../utils/dom.js';
import { createBetAmount } from './crash.bet-amount.js';
import { createBetButton } from './crash.bet-button.js';
import { createAutoCashOut } from './crash.auto-cashout.js';
import { CRASH_BET_LIMITS } from './crash.constants.js';

/**
 * @param {object} [options]
 * @param {number} [options.amount]
 * @param {'bet' | 'cashout'} [options.mode]
 * @param {number} [options.payout]
 * @param {number} [options.multiplier]
 * @param {string} [options.panelId]
 * @param {(amount: number) => void} [options.onAmountChange]
 * @param {() => void} [options.onAction]
 * @returns {{
 *   element: HTMLElement,
 *   getAmount: () => number,
 *   setAmount: (amount: number) => void,
 *   setAmountMax: (max: number) => void,
 *   setMode: (mode: 'bet' | 'cashout', meta?: { payout?: number, multiplier?: number }) => void,
 *   getMode: () => 'bet' | 'cashout',
 *   setDisabled: (disabled: boolean) => void,
 *   setAmountDisabled: (disabled: boolean) => void,
 *   setActionDisabled: (disabled: boolean) => void,
 * }}
 */
export function createBetPanel(options = {}) {
  const panelId = options.panelId ?? 'a';
  let amountDisabled = false;
  let actionDisabled = false;

  const amountControl = createBetAmount({
    amount: options.amount ?? CRASH_BET_LIMITS.default,
    onChange: options.onAmountChange,
  });

  const actionButton = createBetButton({
    mode: options.mode ?? 'bet',
    payout: options.payout,
    multiplier: options.multiplier,
    onClick: options.onAction,
  });

  const autoCashOut = createAutoCashOut();

  const leftColumn = createElement('div', {
    className: 'crash-bet-panel__left',
    children: [amountControl.element],
  });

  const rightColumn = createElement('div', {
    className: 'crash-bet-panel__right',
    children: [actionButton.element, autoCashOut],
  });

  const element = createElement('article', {
    className: 'crash-bet-panel',
    attrs: {
      'data-panel': panelId,
      'aria-label': `Bet panel ${panelId}`,
    },
    children: [leftColumn, rightColumn],
  });

  function syncDisabledClass() {
    element.classList.toggle(
      'crash-bet-panel--disabled',
      amountDisabled && actionDisabled,
    );
  }

  return {
    element,
    getAmount: () => amountControl.getAmount(),
    setAmount: (amount) => amountControl.setAmount(amount),
    setAmountMax: (max) => amountControl.setMax(max),
    setMode: (mode, meta) => actionButton.setMode(mode, meta),
    getMode: () => actionButton.getMode(),
    setDisabled(disabled) {
      amountDisabled = Boolean(disabled);
      actionDisabled = Boolean(disabled);
      amountControl.setDisabled(amountDisabled);
      actionButton.setDisabled(actionDisabled);
      syncDisabledClass();
    },
    setAmountDisabled(disabled) {
      amountDisabled = Boolean(disabled);
      amountControl.setDisabled(amountDisabled);
      syncDisabledClass();
    },
    setActionDisabled(disabled) {
      actionDisabled = Boolean(disabled);
      actionButton.setDisabled(actionDisabled);
      syncDisabledClass();
    },
  };
}
