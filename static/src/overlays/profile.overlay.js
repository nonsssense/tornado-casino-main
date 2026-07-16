/**
 * Profile overlay — bottom sheet with profile account UI.
 */

import { createProfileModal } from '../features/profile/profile.modal.js';
import { t } from '../i18n/index.js';
import { BottomSheet } from './bottom-sheet.js';
import '../../styles/pages/profile.css';

/**
 * @param {object} options
 * @param {function} [options.onClose]
 * @param {function} [options.onBeforeRemove]
 * @returns {{ element: HTMLElement, footer: HTMLElement, open: () => void, close: () => Promise<void> }}
 */
export function createProfileOverlay(options = {}) {
  const { onClose, onBeforeRemove, onMenuAction } = options;

  const content = createProfileModal({ onMenuAction });

  return BottomSheet({
    content,
    ariaLabel: t('profile.overlay.title'),
    panelClass: 'bottom-sheet__panel--profile',
    onClose,
    onBeforeRemove,
  });
}
