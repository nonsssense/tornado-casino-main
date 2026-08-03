/**
 * Shared Guest Mode UI building blocks (locked panels, notices, CTAs).
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { openTelegramBot } from '../../utils/app.config.js';
import { Button } from '../base/Button.js';

/**
 * @param {object} [options]
 * @param {string} [options.message]
 * @param {string} [options.ctaLabel]
 * @param {string} [options.className]
 * @param {boolean} [options.showCta]
 * @returns {HTMLElement}
 */
export function createGuestNotice(options = {}) {
  const {
    message = t('guest.notice.default'),
    ctaLabel = t('guest.actions.openTelegram'),
    className = '',
    showCta = true,
  } = options;

  const children = [
    createElement('p', {
      className: 'guest-notice__text',
      text: message,
    }),
  ];

  if (showCta) {
    children.push(
      Button({
        label: ctaLabel,
        variant: 'primary',
        size: 'sm',
        className: 'guest-notice__cta',
        onClick: () => openTelegramBot(),
      }),
    );
  }

  return createElement('div', {
    className: ['guest-notice', className].filter(Boolean).join(' '),
    attrs: { 'data-guest-notice': 'true' },
    children,
  });
}

/**
 * Blurred locked surface with guest CTA overlay (deposit address style).
 * @param {object} [options]
 * @param {string} [options.message]
 * @param {string} [options.className]
 * @param {HTMLElement|HTMLElement[]} [options.placeholder]
 * @returns {HTMLElement}
 */
export function createGuestLockedPanel(options = {}) {
  const {
    message = t('guest.deposit.message'),
    className = '',
    placeholder = null,
  } = options;

  const placeholderChildren = Array.isArray(placeholder)
    ? placeholder
    : (placeholder ? [placeholder] : [
      createElement('div', { className: 'guest-locked__fake-line guest-locked__fake-line--wide' }),
      createElement('div', { className: 'guest-locked__fake-line' }),
      createElement('div', { className: 'guest-locked__fake-actions' }),
    ]);

  return createElement('div', {
    className: ['guest-locked', className].filter(Boolean).join(' '),
    attrs: { 'data-guest-locked': 'true' },
    children: [
      createElement('div', {
        className: 'guest-locked__blur',
        attrs: { 'aria-hidden': 'true' },
        children: placeholderChildren,
      }),
      createElement('div', {
        className: 'guest-locked__overlay',
        children: [
          createElement('p', {
            className: 'guest-locked__message',
            text: message,
          }),
          Button({
            label: t('guest.actions.openTelegram'),
            variant: 'primary',
            size: 'sm',
            className: 'guest-locked__cta',
            onClick: () => openTelegramBot(),
          }),
        ],
      }),
    ],
  });
}
