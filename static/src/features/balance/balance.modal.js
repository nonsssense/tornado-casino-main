/**
 * Balance modal — single USDT account overview inside bottom sheet.
 */

import { createElement } from '../../utils/dom.js';
import { ASSETS } from '../../utils/assets.js';
import { WALLET_COINS } from '../../utils/wallet.constants.js';
import { formatCryptoAmount } from '../../utils/format.js';
import { balanceService } from '../../services/balance.service.js';
import { Button } from '../../components/base/Button.js';

const USDT_ASSET = WALLET_COINS.find((coin) => coin.id === 'usdt');

/**
 * @param {object} options
 * @param {string} options.title
 * @param {HTMLElement} options.valueEl
 * @returns {HTMLElement}
 */
function createBalanceCard({ title, valueEl }) {
  return createElement('div', {
    className: 'balance-modal__card',
    children: [
      createElement('img', {
        className: 'balance-modal__asset-icon',
        attrs: {
          src: USDT_ASSET?.icon || '',
          alt: '',
          draggable: false,
          'aria-hidden': 'true',
        },
      }),
      createElement('div', {
        className: 'balance-modal__card-meta',
        children: [
          createElement('span', {
            className: 'balance-modal__card-title',
            text: title,
          }),
          valueEl,
        ],
      }),
    ],
  });
}

/**
 * @param {object} [options]
 * @param {string} [options.amount]
 * @param {number} [options.cashback]
 * @param {function} [options.onDeposit]
 * @param {function} [options.onWithdraw]
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createBalanceModal(options = {}) {
  const {
    amount = formatCryptoAmount(0),
    cashback = 0,
    onDeposit,
    onWithdraw,
  } = options;

  const amountValue = createElement('span', {
    className: 'balance-modal__card-value',
    attrs: { 'aria-live': 'polite' },
    text: amount,
  });

  const bonusValue = createElement('span', {
    className: 'balance-modal__card-value',
    text: formatCryptoAmount(Number(cashback) || 0),
  });

  const unsubscribe = balanceService.subscribe((formatted) => {
    amountValue.textContent = formatted;
  });

  const element = createElement('div', {
    className: 'balance-modal',
    attrs: { 'data-modal': 'balance' },
    children: [
      createElement('div', {
        className: 'balance-modal__cards',
        children: [
          createBalanceCard({
            title: 'Your Balance',
            valueEl: amountValue,
          }),
          createBalanceCard({
            title: 'Bonus Balance',
            valueEl: bonusValue,
          }),
        ],
      }),
      createElement('div', {
        className: 'balance-modal__actions',
        children: [
          Button({
            label: 'deposit',
            variant: 'primary',
            block: true,
            className: 'balance-modal__action',
            onClick: onDeposit,
          }),
          Button({
            label: 'withdraw',
            variant: 'secondary',
            block: true,
            className: 'balance-modal__action',
            onClick: onWithdraw,
          }),
        ],
      }),
      createElement('div', {
        className: 'balance-modal__brand',
        children: [
          createElement('img', {
            className: 'balance-modal__brand-logo',
            attrs: {
              src: ASSETS.logo,
              alt: 'Tornado',
              draggable: false,
            },
          }),
        ],
      }),
    ],
  });

  return {
    element,
    destroy() {
      unsubscribe();
    },
  };
}
