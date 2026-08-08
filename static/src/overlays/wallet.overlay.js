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
 * @param {boolean} [options.retainOnClose]
 * @param {function} [options.onClose]
 * @param {function} [options.onHide]
 * @param {function} [options.onBeforeRemove]
 * @returns {{
 *   element: HTMLElement,
 *   footer: HTMLElement,
 *   open: () => void,
 *   close: (opts?: object) => Promise<void>,
 *   destroy: () => Promise<void>,
 *   setTab: (tabId: string) => void,
 *   pause: () => void,
 *   resume: () => void,
 * }}
 */
export function createWalletOverlay(options = {}) {
  const {
    initialTab = 'deposit',
    retainOnClose = false,
    onClose,
    onHide,
    onBeforeRemove,
  } = options;

  const modal = createWalletModal({ initialTab });

  const sheet = BottomSheet({
    content: modal.element,
    ariaLabel: t('wallet.overlay.title'),
    panelClass: 'bottom-sheet__panel--wallet',
    retainOnClose,
    onClose,
    onHide: () => {
      modal.pause?.();
      if (typeof onHide === 'function') onHide();
    },
    onBeforeRemove: () => {
      modal.destroy?.();
      if (typeof onBeforeRemove === 'function') {
        onBeforeRemove();
      }
    },
  });

  return {
    ...sheet,
    setTab(tabId) {
      modal.setTab?.(tabId);
    },
    pause() {
      modal.pause?.();
    },
    resume() {
      modal.resume?.();
    },
  };
}
