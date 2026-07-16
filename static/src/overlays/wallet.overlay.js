/**
 * Wallet overlay — bottom sheet with deposit / withdraw / history views.
 */

import { createWalletModal } from '../features/wallet/wallet.modal.js';
import { t } from '../i18n/index.js';
import { BottomSheet } from './bottom-sheet.js';
import '../../styles/pages/wallet.css';

/**
 * @param {object} options
 * @param {string} [options.initialTab]
 * @param {function} [options.onClose]
 * @param {function} [options.onBeforeRemove]
 * @returns {{ element: HTMLElement, footer: HTMLElement, open: () => void, close: () => Promise<void> }}
 */
export function createWalletOverlay(options = {}) {
  const { initialTab = 'deposit', onClose, onBeforeRemove } = options;

  const modal = createWalletModal({ initialTab });

  return BottomSheet({
    content: modal.element,
    ariaLabel: t('wallet.overlay.title'),
    panelClass: 'bottom-sheet__panel--wallet',
    onClose,
    onBeforeRemove: () => {
      modal.destroy?.();
      if (typeof onBeforeRemove === 'function') {
        onBeforeRemove();
      }
    },
  });
}
