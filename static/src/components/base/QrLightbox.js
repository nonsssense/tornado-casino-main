/**
 * QrLightbox — centered QR presentation over a minimal backdrop.
 * Presentation only — does not alter the QR payload/image.
 */

import { createElement } from '../../utils/dom.js';
import { DURATION } from '../../animations/transitions.js';
import { t } from '../../i18n/index.js';

const CLOSE_MS = DURATION.base;

/**
 * @param {object} options
 * @param {string} options.src
 * @param {string} [options.alt]
 * @param {function} [options.onClose]
 * @returns {{ element: HTMLElement, open: () => void, close: () => Promise<void> }}
 */
export function QrLightbox(options = {}) {
  const {
    src,
    alt = 'QR code',
    onClose,
  } = options;

  let isClosing = false;

  const qrImage = createElement('img', {
    className: 'qr-lightbox__image',
    attrs: {
      src,
      alt,
      draggable: false,
    },
  });

  const frame = createElement('div', {
    className: 'qr-lightbox__frame',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': alt,
      onClick: (event) => event.stopPropagation(),
    },
    children: [qrImage],
  });

  const closeButton = createElement('button', {
    className: 'qr-lightbox__close',
    attrs: {
      type: 'button',
      'aria-label': t('common.close'),
      onClick: () => {
        void close();
      },
    },
    text: '×',
  });

  const root = createElement('div', {
    className: 'qr-lightbox',
    attrs: {
      'aria-hidden': 'true',
      onClick: () => {
        void close();
      },
    },
    children: [closeButton, frame],
  });

  function open() {
    root.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.add('qr-lightbox--visible');
      });
    });
  }

  function close() {
    if (isClosing) {
      return Promise.resolve();
    }

    isClosing = true;
    root.classList.remove('qr-lightbox--visible');
    root.classList.add('qr-lightbox--closing');

    return new Promise((resolve) => {
      setTimeout(() => {
        root.remove();
        if (onClose) onClose();
        resolve();
      }, CLOSE_MS);
    });
  }

  return { element: root, open, close };
}
