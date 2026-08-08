/**
 * AvatarPlaceholder — avatar slot with optional Telegram photo.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';

const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>';

/**
 * @param {object} [options]
 * @param {string} [options.className]
 * @param {string} [options.ariaLabel]
 * @param {string|null} [options.src] - Telegram profile photo URL when available
 */
export function AvatarPlaceholder(options = {}) {
  const {
    className = '',
    ariaLabel = t('profile.avatar.ariaLabel'),
    src = null,
  } = options;

  const classes = ['avatar-placeholder'];
  if (className) classes.push(className);

  const photoUrl = typeof src === 'string' && src.trim() ? src.trim() : null;

  const root = createElement('div', {
    className: classes.join(' '),
    attrs: {
      role: 'img',
      'aria-label': ariaLabel,
    },
  });

  function showPlaceholderIcon() {
    root.classList.remove('avatar-placeholder--photo');
    root.replaceChildren(
      createElement('span', {
        className: 'avatar-placeholder__icon',
        html: ICON_USER,
      }),
    );
  }

  if (!photoUrl) {
    showPlaceholderIcon();
    return root;
  }

  root.classList.add('avatar-placeholder--photo');
  const img = createElement('img', {
    className: 'avatar-placeholder__img',
    attrs: {
      src: photoUrl,
      alt: '',
      decoding: 'async',
      referrerPolicy: 'no-referrer',
      onError: () => showPlaceholderIcon(),
    },
  });
  root.replaceChildren(img);

  return root;
}
