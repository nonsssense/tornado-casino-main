/**
 * Guest login prompt — centered modal for restricted actions.
 * Never shows backend auth errors; Guest Mode is a supported product state.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { openTelegramBot } from '../../utils/app.config.js';
import { isAuthenticated } from '../../services/auth-state.js';
import { Button } from '../base/Button.js';

/** @type {HTMLElement|null} */
let activeBackdrop = null;

function lockScroll() {
  document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  document.body.style.overflow = '';
}

export function closeGuestLoginModal() {
  if (!activeBackdrop) return;

  activeBackdrop.classList.remove('guest-modal-backdrop--visible');
  const el = activeBackdrop;
  setTimeout(() => {
    el.remove();
    unlockScroll();
  }, 200);
  activeBackdrop = null;
}

/**
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {string} [options.message]
 * @param {string} [options.ctaLabel]
 */
export function showGuestLoginModal(options = {}) {
  closeGuestLoginModal();

  const title = options.title || t('guest.modal.title');
  const message = options.message || t('guest.modal.message');
  const ctaLabel = options.ctaLabel || t('guest.actions.openTelegram');

  const backdrop = createElement('div', {
    className: 'guest-modal-backdrop',
    attrs: {
      role: 'presentation',
      onClick: (event) => {
        if (event.target === backdrop) closeGuestLoginModal();
      },
    },
  });

  const dialog = createElement('div', {
    className: 'guest-modal',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'guest-login-title',
    },
    children: [
      createElement('button', {
        className: 'guest-modal__close',
        attrs: {
          type: 'button',
          'aria-label': t('common.close'),
          onClick: closeGuestLoginModal,
        },
        html: '&#10005;',
      }),
      createElement('div', {
        className: 'guest-modal__body',
        children: [
          createElement('h2', {
            className: 'guest-modal__title',
            attrs: { id: 'guest-login-title' },
            text: title,
          }),
          createElement('p', {
            className: 'guest-modal__message',
            text: message,
          }),
          Button({
            label: ctaLabel,
            variant: 'primary',
            block: true,
            className: 'guest-modal__cta',
            onClick: () => {
              openTelegramBot();
              closeGuestLoginModal();
            },
          }),
        ],
      }),
    ],
  });

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  lockScroll();
  activeBackdrop = backdrop;

  requestAnimationFrame(() => {
    backdrop.classList.add('guest-modal-backdrop--visible');
  });
}

/**
 * Gate a restricted action. Returns true when the user is authenticated.
 * Guests see the login modal instead — never a backend error toast.
 * @param {object} [options] — forwarded to showGuestLoginModal
 * @returns {boolean}
 */
export function requireAuth(options = {}) {
  if (isAuthenticated()) return true;
  showGuestLoginModal(options);
  return false;
}
