/**
 * Profile modal — account UI inside the bottom sheet.
 */

import { createElement } from '../../utils/dom.js';
import { AvatarPlaceholder } from '../../components/shared/AvatarPlaceholder.js';
import { PROFILE_MENU_ITEMS, PROFILE_FIELDS } from './profile.constants.js';

/**
 * @param {string} actionId
 */
function handleMenuAction(actionId) {
  // TODO: implement profile menu action
  void actionId;
}

/**
 * @returns {HTMLElement}
 */
function createProfileCard() {
  return createElement('div', {
    className: 'profile-card',
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
                text: `${field.label}:`,
              }),
              createElement('span', {
                className: 'profile-field__value',
                text: field.placeholder,
              }),
            ],
          }),
        ),
      }),
    ],
  });
}

/**
 * @returns {HTMLElement}
 */
function createProfileMenu() {
  return createElement('div', {
    className: 'profile-menu',
    attrs: { role: 'list' },
    children: PROFILE_MENU_ITEMS.map((item) =>
      createElement('button', {
        className: 'profile-menu__item',
        attrs: {
          type: 'button',
          role: 'listitem',
          onClick: () => handleMenuAction(item.id),
        },
        children: [
          createElement('span', {
            className: `profile-menu__icon profile-menu__icon--${item.id}`,
            attrs: { 'aria-hidden': 'true' },
          }),
          createElement('span', {
            className: 'profile-menu__label',
            text: item.label,
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
 * @returns {HTMLElement}
 */
export function createProfileModal() {
  return createElement('div', {
    className: 'profile-modal',
    attrs: { 'data-modal': 'profile' },
    children: [
      createProfileCard(),
      createProfileMenu(),
      createElement('div', {
        className: 'profile-modal__banner',
        attrs: {
          'aria-hidden': 'true',
          'data-banner-slot': 'creative',
        },
      }),
    ],
  });
}
