/**
 * Profile overlay — bottom sheet with profile account UI.
 */

import { createProfileModal } from '../features/profile/profile.modal.js';
import { t } from '../i18n/index.js';
import { BottomSheet } from './bottom-sheet.js';
import '../../styles/pages/profile.css';

/**
 * @param {object} options
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
 *   refresh: () => void,
 * }}
 */
export function createProfileOverlay(options = {}) {
  const {
    retainOnClose = false,
    onClose,
    onHide,
    onBeforeRemove,
    onMenuAction,
    onStatusInfo,
  } = options;

  const modal = createProfileModal({ onMenuAction, onStatusInfo });

  const sheet = BottomSheet({
    content: modal.element,
    ariaLabel: t('profile.overlay.title'),
    panelClass: 'bottom-sheet__panel--wallet bottom-sheet__panel--profile',
    retainOnClose,
    onClose,
    onHide,
    onBeforeRemove: () => {
      modal.destroy?.();
      if (typeof onBeforeRemove === 'function') onBeforeRemove();
    },
  });

  return {
    ...sheet,
    refresh() {
      modal.refresh?.();
    },
  };
}
