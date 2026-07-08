/**
 * Profile overlay — bottom sheet with profile account UI.
 */

import { createProfileModal } from '../features/profile/profile.modal.js';
import { BottomSheet } from './bottom-sheet.js';

/**
 * @param {object} options
 * @param {function} [options.onClose]
 * @param {function} [options.onBeforeRemove]
 * @returns {{ element: HTMLElement, footer: HTMLElement, open: () => void, close: () => Promise<void> }}
 */
export function createProfileOverlay(options = {}) {
  const { onClose, onBeforeRemove } = options;

  const content = createProfileModal();

  return BottomSheet({
    content,
    ariaLabel: 'Profile',
    panelClass: 'bottom-sheet__panel--profile',
    onClose,
    onBeforeRemove,
  });
}
