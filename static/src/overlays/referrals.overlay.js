/**
 * Referrals overlay — referral dashboard in a bottom sheet.
 */

import { createReferralsModal } from '../features/referrals/referrals.modal.js';
import { t } from '../i18n/index.js';
import { BottomSheet } from './bottom-sheet.js';
import '../../styles/pages/referrals.css';

/**
 * @param {object} options
 * @param {function} [options.onClose]
 * @param {function} [options.onBeforeRemove]
 */
export function createReferralsOverlay(options = {}) {
  const { onClose, onBeforeRemove } = options;
  const modal = createReferralsModal();

  return BottomSheet({
    content: modal.element,
    ariaLabel: t('referrals.overlay.title'),
    panelClass: 'bottom-sheet__panel--wallet bottom-sheet__panel--referrals',
    onClose: () => {
      modal.destroy();
      if (onClose) onClose();
    },
    onBeforeRemove,
  });
}
