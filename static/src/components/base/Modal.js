/**
 * Modal — base dialog container with backdrop.
 */

import { createElement } from '../../utils/dom.js';
import { IconButton } from './IconButton.js';

/**
 * @param {object} options
 * @param {string} [options.title]
 * @param {HTMLElement|HTMLElement[]|string} [options.body]
 * @param {HTMLElement|HTMLElement[]|string} [options.footer]
 * @param {boolean} [options.open]
 * @param {boolean} [options.glow]
 * @param {boolean} [options.fullscreen]
 * @param {boolean} [options.closable]
 * @param {string} [options.className]
 * @param {function} [options.onClose]
 */
export function Modal(options = {}) {
  const {
    title,
    body,
    footer,
    open = false,
    glow = false,
    fullscreen = false,
    closable = true,
    className = '',
    onClose,
  } = options;

  const modalClasses = ['modal'];
  if (glow) modalClasses.push('modal--glow');
  if (fullscreen) modalClasses.push('modal--fullscreen');
  if (className) modalClasses.push(className);

  const modalChildren = [];

  if (title || closable) {
    const headerChildren = [];

    if (title) {
      headerChildren.push(createElement('h2', { className: 'modal__title', text: title }));
    }

    if (closable) {
      headerChildren.push(IconButton({
        ariaLabel: 'Close',
        variant: 'ghost',
        size: 'sm',
        iconHtml: '&#10005;',
        onClick: onClose,
      }));
    }

    modalChildren.push(createElement('div', {
      className: 'modal__header',
      children: headerChildren,
    }));
  }

  if (body) {
    modalChildren.push(createElement('div', {
      className: 'modal__body',
      children: Array.isArray(body) ? body : [body],
    }));
  }

  if (footer) {
    modalChildren.push(createElement('div', {
      className: 'modal__footer',
      children: Array.isArray(footer) ? footer : [footer],
    }));
  }

  const modal = createElement('div', {
    className: modalClasses.join(' '),
    attrs: { role: 'dialog', 'aria-modal': 'true' },
    children: modalChildren,
  });

  const backdrop = createElement('div', {
    className: `modal-backdrop${open ? ' modal-backdrop--open' : ''}`,
    attrs: {
      onClick: (event) => {
        if (event.target === backdrop && closable && onClose) onClose();
      },
    },
    children: [modal],
  });

  backdrop.setOpen = (isOpen) => {
    backdrop.classList.toggle('modal-backdrop--open', isOpen);
  };

  return backdrop;
}
