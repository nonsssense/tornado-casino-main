/**
 * Wallet overlay — bottom sheet with deposit / withdraw / history views.
 */

import { createWalletModal } from '../features/wallet/wallet.modal.js';
import { BottomSheet } from './bottom-sheet.js';

/**
 * @param {object} options
 * @param {string} [options.initialTab]
 * @param {function} [options.onClose]
 * @param {function} [options.onBeforeRemove]
 * @returns {{ element: HTMLElement, footer: HTMLElement, open: () => void, close: () => Promise<void> }}
 */
export function createWalletOverlay(options = {}) {
  const { initialTab = 'deposit', onClose, onBeforeRemove } = options;

  const content = createWalletModal({ initialTab });

  return BottomSheet({
    content,
    ariaLabel: 'Wallet',
    panelClass: 'bottom-sheet__panel--wallet',
    onClose,
    onBeforeRemove,
  });
}
