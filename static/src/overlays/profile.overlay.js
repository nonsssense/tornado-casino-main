/**
 * Profile overlay — bottom sheet with profile account UI.
 */

import { createProfileModal } from '../features/profile/profile.modal.js';
import { BottomSheet } from './bottom-sheet.js';

/**
 * @param {object} options
 * @param {function} [options.onClose]
 * @returns {{ element: HTMLElement, open: () => void, close: () => Promise<void> }}
 */
export function createProfileOverlay(options = {}) {
  const { onClose } = options;

  const content = createProfileModal();

  return BottomSheet({
    content,
    ariaLabel: 'Profile',
    panelClass: 'bottom-sheet__panel--profile',
    onClose,
  });
}
