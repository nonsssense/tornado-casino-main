/**
 * SupportModal — centered dialog for contacting Tornado Support.
 *
 * Opens over the current page with a darkened backdrop.
 * Uses Telegram.WebApp.openTelegramLink when available so the Mini App
 * is minimized (not closed) when the user taps "Message Support".
 * Also offers email for users who cannot use Telegram (e.g. banned).
 */

import { createElement } from '../../utils/dom.js';
import { Toast } from '../base/Toast.js';
import { t } from '../../i18n/index.js';

const SUPPORT_USERNAME = 't.me/TornadoSupport';
const SUPPORT_URL = 'https://t.me/TornadoSupport';
const SUPPORT_EMAIL = 'support@tornado.casino';

const ICON_COPY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

/** @type {HTMLElement|null} */
let activeBackdrop = null;

function lockScroll() {
  document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  document.body.style.overflow = '';
}

function close() {
  if (!activeBackdrop) return;

  activeBackdrop.classList.remove('support-modal-backdrop--visible');

  const el = activeBackdrop;
  setTimeout(() => {
    el.remove();
    unlockScroll();
  }, 200);

  activeBackdrop = null;
}

function copyText(value, successKey, failKey) {
  navigator.clipboard.writeText(value).then(
    () => Toast({ message: t(successKey), type: 'success', duration: 2000 }),
    () => Toast({ message: t(failKey), type: 'error', duration: 2000 }),
  );
}

/**
 * Open the support chat via Telegram API when available, otherwise fallback.
 * @param {object} [options]
 * @param {() => void} [options.onNavigateHome] — called after the link opens
 */
function messageSupport(options = {}) {
  const tg = window.Telegram?.WebApp;

  if (typeof tg?.openTelegramLink === 'function') {
    try {
      tg.openTelegramLink(SUPPORT_URL);
    } catch {
      window.open(SUPPORT_URL, '_blank', 'noopener');
    }
  } else {
    window.open(SUPPORT_URL, '_blank', 'noopener');
  }

  close();

  if (typeof options.onNavigateHome === 'function') {
    options.onNavigateHome();
  }
}

function emailSupport() {
  window.location.href = `mailto:${SUPPORT_EMAIL}`;
}

/**
 * Show the Support modal.
 * @param {object} [options]
 * @param {() => void} [options.onNavigateHome] — navigate to Home after opening chat
 */
export function openSupportModal(options = {}) {
  if (activeBackdrop) return;

  const backdrop = createElement('div', {
    className: 'support-modal-backdrop',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('support.title'),
      onClick: (e) => {
        if (e.target === backdrop) close();
      },
    },
    children: [
      createElement('div', {
        className: 'support-modal',
        children: [
          createElement('button', {
            className: 'support-modal__close',
            attrs: {
              type: 'button',
              'aria-label': t('common.close'),
              onClick: close,
            },
            html: '&#10005;',
          }),
          createElement('div', {
            className: 'support-modal__body',
            children: [
              createElement('h2', {
                className: 'support-modal__title',
                text: t('support.title'),
              }),
              createElement('p', {
                className: 'support-modal__subtitle',
                text: t('support.subtitle'),
              }),
              createElement('div', {
                className: 'support-modal__field',
                children: [
                  createElement('span', {
                    className: 'support-modal__field-text',
                    text: SUPPORT_USERNAME,
                  }),
                  createElement('button', {
                    className: 'support-modal__copy-btn',
                    attrs: {
                      type: 'button',
                      'aria-label': t('common.copy'),
                      onClick: () => copyText(
                        SUPPORT_USERNAME,
                        'support.toast.copied',
                        'support.toast.copyFailed',
                      ),
                    },
                    html: ICON_COPY,
                  }),
                ],
              }),
              createElement('button', {
                className: 'support-modal__cta',
                attrs: {
                  type: 'button',
                  onClick: () => messageSupport(options),
                },
                text: t('support.cta'),
              }),
              createElement('p', {
                className: 'support-modal__alt-label',
                text: t('support.emailLabel'),
              }),
              createElement('div', {
                className: 'support-modal__field',
                children: [
                  createElement('span', {
                    className: 'support-modal__field-text',
                    text: SUPPORT_EMAIL,
                  }),
                  createElement('button', {
                    className: 'support-modal__copy-btn',
                    attrs: {
                      type: 'button',
                      'aria-label': t('common.copy'),
                      onClick: () => copyText(
                        SUPPORT_EMAIL,
                        'support.toast.emailCopied',
                        'support.toast.copyFailed',
                      ),
                    },
                    html: ICON_COPY,
                  }),
                ],
              }),
              createElement('button', {
                className: 'support-modal__cta support-modal__cta--secondary',
                attrs: {
                  type: 'button',
                  onClick: emailSupport,
                },
                text: t('support.emailCta'),
              }),
            ],
          }),
        ],
      }),
    ],
  });

  document.body.appendChild(backdrop);
  activeBackdrop = backdrop;
  lockScroll();

  requestAnimationFrame(() => {
    backdrop.classList.add('support-modal-backdrop--visible');
  });

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKeyDown);
    }
  };
  document.addEventListener('keydown', onKeyDown);
}
