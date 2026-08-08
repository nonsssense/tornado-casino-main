/**
 * Referrals overlay — referral dashboard in a bottom sheet.
 */

import { createReferralsModal } from '../features/referrals/referrals.modal.js';
import { t } from '../i18n/index.js';
import { BottomSheet } from './bottom-sheet.js';
import '../../styles/pages/referrals.css';

/**
 * @param {object} options
 * @param {boolean} [options.retainOnClose]
 * @param {function} [options.onClose]
 * @param {function} [options.onHide]
 * @param {function} [options.onBeforeRemove]
 */
export function createReferralsOverlay(options = {}) {
  const {
    retainOnClose = false,
    onClose,
    onHide,
    onBeforeRemove,
  } = options;
  const modal = createReferralsModal();

  const sheet = BottomSheet({
    content: modal.element,
    ariaLabel: t('referrals.overlay.title'),
    panelClass: 'bottom-sheet__panel--wallet bottom-sheet__panel--referrals',
    retainOnClose,
    onClose: () => {
      modal.destroy();
      if (onClose) onClose();
    },
    onHide,
    onBeforeRemove: () => {
      // Hard destroy path — subscription cleanup.
      if (!retainOnClose) {
        modal.destroy();
      }
      if (typeof onBeforeRemove === 'function') onBeforeRemove();
    },
  });

  return {
    ...sheet,
    destroy() {
      modal.destroy();
      return sheet.destroy();
    },
    refresh() {
      modal.refresh?.();
    },
  };
}
