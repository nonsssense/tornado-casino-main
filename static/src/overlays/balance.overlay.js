/**
 * Balance overlay — bottom sheet with single USDT account overview.
 */

import { createBalanceModal } from '../features/balance/balance.modal.js';
import { BottomSheet } from './bottom-sheet.js';

/**
 * @param {object} options
 * @param {string} [options.amount]
 * @param {number} [options.cashback]
 * @param {function} [options.onDeposit]
 * @param {function} [options.onWithdraw]
 * @param {function} [options.onClose]
 * @param {function} [options.onBeforeRemove]
 * @returns {{ element: HTMLElement, footer: HTMLElement, open: () => void, close: () => Promise<void> }}
 */
export function createBalanceOverlay(options = {}) {
  const {
    amount,
    cashback,
    onDeposit,
    onWithdraw,
    onClose,
    onBeforeRemove,
  } = options;

  const modal = createBalanceModal({
    amount,
    cashback,
    onDeposit,
    onWithdraw,
  });

  return BottomSheet({
    content: modal.element,
    ariaLabel: 'Balance',
    panelClass: 'bottom-sheet__panel--balance',
    size: 'balance',
    onBeforeRemove,
    onClose: () => {
      modal.destroy();
      if (onClose) onClose();
    },
  });
}
