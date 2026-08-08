/**
 * Profile modal — account UI inside the bottom sheet.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { AvatarPlaceholder } from '../../components/shared/AvatarPlaceholder.js';
import { Skeleton } from '../../components/base/Skeleton.js';
import { Button } from '../../components/base/Button.js';
import { PROFILE_MENU_ITEMS, PROFILE_FIELDS } from './profile.constants.js';
import { profileService } from '../../services/profile.service.js';
import { replaceChildrenFadeIn } from '../../utils/hydrate.js';
import { openTelegramBot } from '../../utils/app.config.js';

const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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
 * @param {function} [onStatusInfo]
 * @param {{ isGuest?: boolean, photoUrl?: string|null }} [options]
 * @returns {HTMLElement}
 */
function createProfileCard(values, onStatusInfo, options = {}) {
  const isGuest = Boolean(options.isGuest);

  const children = [
    AvatarPlaceholder({
      className: 'profile-card__avatar',
      src: options.photoUrl || null,
    }),
    createElement('div', {
      className: 'profile-card__info',
      children: PROFILE_FIELDS.map((field) => {
        const valueEl = createElement('span', {
          className: 'profile-field__value',
          text: values[field.id] || t(field.placeholderKey),
        });

        const valueRow =
          field.id === 'status' && !isGuest
            ? createElement('span', {
                className: 'profile-field__value-row',
                children: [
                  valueEl,
                  createElement('button', {
                    className: 'profile-field__info',
                    attrs: {
                      type: 'button',
                      'aria-label': t('referrals.statusInfo.open'),
                      onClick: () => onStatusInfo?.(),
                    },
                    html: ICON_INFO,
                  }),
                ],
              })
            : valueEl;

        return createElement('div', {
          className: 'profile-field',
          children: [
            createElement('span', {
              className: 'profile-field__label',
              text: `${t(field.labelKey)}:`,
            }),
            valueRow,
          ],
        });
      }),
    }),
  ];

  if (isGuest) {
    children.push(
      createElement('p', {
        className: 'guest-profile-note',
        text: t('guest.profile.message'),
      }),
      Button({
        label: t('guest.actions.openTelegram'),
        variant: 'primary',
        block: true,
        className: 'profile-card__guest-cta',
        onClick: () => openTelegramBot(),
      }),
    );
  }

  return createElement('div', {
    className: ['profile-card', isGuest ? 'profile-card--guest' : ''].filter(Boolean).join(' '),
    attrs: { 'aria-busy': 'false' },
    children,
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
 * @param {function(): void} [options.onStatusInfo]
 * @returns {{ element: HTMLElement, refresh: () => void, destroy: () => void }}
 */
export function createProfileModal(options = {}) {
  const { onMenuAction, onStatusInfo } = options;
  const cardMount = createElement('div');
  let loadGeneration = 0;

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

  function paintProfile(profile) {
    replaceChildrenFadeIn(
      cardMount,
      createProfileCard(
        {
          status: profile.status,
          nickname: profile.nickname,
          'user-id': profile.userId,
          email: profile.email,
        },
        onStatusInfo,
        { isGuest: profile.isGuest, photoUrl: profile.photoUrl },
      ),
      150,
    );
  }

  function loadProfile({ soft = false } = {}) {
    const generation = ++loadGeneration;
    const hasCard = Boolean(cardMount.querySelector('.profile-card:not(.profile-card--skeleton)'));
    if (!soft || !hasCard) {
      cardMount.replaceChildren(createProfileSkeletonCard());
    }

    profileService.getProfile({ soft })
      .then((profile) => {
        if (generation !== loadGeneration) return;
        paintProfile(profile);
      })
      .catch(() => {
        if (generation !== loadGeneration) return;
        replaceChildrenFadeIn(
          cardMount,
          createProfileCard(
            { nickname: t('guest.name') },
            onStatusInfo,
            { isGuest: true },
          ),
          150,
        );
      });
  }

  loadProfile();

  return {
    element: modal,
    refresh(options = {}) {
      loadProfile({ soft: options.soft !== false });
    },
    destroy() {
      loadGeneration += 1;
    },
  };
}
