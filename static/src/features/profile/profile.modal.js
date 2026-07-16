/**
 * Profile modal — account UI inside the bottom sheet.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { AvatarPlaceholder } from '../../components/shared/AvatarPlaceholder.js';
import { Skeleton } from '../../components/base/Skeleton.js';
import { PROFILE_MENU_ITEMS, PROFILE_FIELDS } from './profile.constants.js';
import { profileService } from '../../services/profile.service.js';
import { replaceChildrenFadeIn } from '../../utils/hydrate.js';

/**
 * @param {string} actionId
 * @param {function(string): void} [onMenuAction]
 */
function handleMenuAction(actionId, onMenuAction) {
  if (onMenuAction) {
    onMenuAction(actionId);
  }
}

/**
 * Skeleton profile card — same layout as loaded card.
 * @returns {HTMLElement}
 */
function createProfileSkeletonCard() {
  return createElement('div', {
    className: 'profile-card profile-card--skeleton',
    attrs: { 'aria-busy': 'true', 'aria-label': t('profile.loading') },
    children: [
      createElement('div', {
        className: 'profile-card__avatar-wrap',
        children: [
          Skeleton({
            variant: 'circle',
            className: 'profile-card__avatar-skeleton',
            width: '5.5rem',
            height: '5.5rem',
          }),
        ],
      }),
      createElement('div', {
        className: 'profile-card__info',
        children: PROFILE_FIELDS.map((field, index) =>
          createElement('div', {
            className: 'profile-field',
            children: [
              createElement('span', {
                className: 'profile-field__label',
                text: `${t(field.labelKey)}:`,
              }),
              Skeleton({
                variant: 'text',
                className: [
                  'profile-field__value-skeleton',
                  index === 1 ? 'profile-field__value-skeleton--wide' : '',
                ].filter(Boolean).join(' '),
              }),
            ],
          }),
        ),
      }),
    ],
  });
}

/**
 * @param {Record<string, string>} values
 * @returns {HTMLElement}
 */
function createProfileCard(values) {
  return createElement('div', {
    className: 'profile-card',
    attrs: { 'aria-busy': 'false' },
    children: [
      AvatarPlaceholder({ className: 'profile-card__avatar' }),
      createElement('div', {
        className: 'profile-card__info',
        children: PROFILE_FIELDS.map((field) =>
          createElement('div', {
            className: 'profile-field',
            children: [
              createElement('span', {
                className: 'profile-field__label',
                text: `${t(field.labelKey)}:`,
              }),
              createElement('span', {
                className: 'profile-field__value',
                text: values[field.id] || t(field.placeholderKey),
              }),
            ],
          }),
        ),
      }),
    ],
  });
}

/**
 * @param {function(string): void} [onMenuAction]
 * @returns {HTMLElement}
 */
function createProfileMenu(onMenuAction) {
  return createElement('div', {
    className: 'profile-menu',
    attrs: { role: 'list' },
    children: PROFILE_MENU_ITEMS.map((item) =>
      createElement('button', {
        className: 'profile-menu__item',
        attrs: {
          type: 'button',
          role: 'listitem',
          onClick: () => handleMenuAction(item.id, onMenuAction),
        },
        children: [
          createElement('span', {
            className: `profile-menu__icon profile-menu__icon--${item.id}`,
            attrs: { 'aria-hidden': 'true' },
          }),
          createElement('span', {
            className: 'profile-menu__label',
            text: t(item.labelKey),
          }),
          createElement('span', {
            className: 'profile-menu__chevron',
            attrs: { 'aria-hidden': 'true' },
            html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
          }),
        ],
      }),
    ),
  });
}

/**
 * @param {object} [options]
 * @param {function(string): void} [options.onMenuAction]
 * @returns {HTMLElement}
 */
export function createProfileModal(options = {}) {
  const { onMenuAction } = options;
  const cardMount = createElement('div');

  const modal = createElement('div', {
    className: 'profile-modal',
    attrs: { 'data-modal': 'profile' },
    children: [
      cardMount,
      createProfileMenu(onMenuAction),
      createElement('div', {
        className: 'profile-modal__banner',
        attrs: {
          'aria-hidden': 'true',
          'data-banner-slot': 'creative',
        },
      }),
    ],
  });

  cardMount.replaceChildren(createProfileSkeletonCard());

  profileService.getProfile()
    .then((profile) => {
      replaceChildrenFadeIn(
        cardMount,
        createProfileCard({
          status: profile.status,
          nickname: profile.nickname,
          'user-id': profile.userId,
          email: profile.email,
        }),
        150,
      );
    })
    .catch(() => {
      replaceChildrenFadeIn(cardMount, createProfileCard({}), 150);
    });

  return modal;
}
