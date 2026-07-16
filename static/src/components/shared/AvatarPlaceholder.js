/**
 * AvatarPlaceholder — upload-ready avatar slot (UI only).
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';

const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>';

/**
 * @param {object} [options]
 * @param {string} [options.className]
 * @param {string} [options.ariaLabel]
 */
export function AvatarPlaceholder(options = {}) {
  const {
    className = '',
    ariaLabel = t('profile.avatar.ariaLabel'),
  } = options;

  const classes = ['avatar-placeholder'];
  if (className) classes.push(className);

  return createElement('div', {
    className: classes.join(' '),
    attrs: {
      role: 'img',
      'aria-label': ariaLabel,
    },
    children: [
      createElement('span', {
        className: 'avatar-placeholder__icon',
        html: ICON_USER,
      }),
    ],
  });
}
