/**
 * Toast — transient notification primitive.
 */

import { createElement } from '../../utils/dom.js';
import { IconButton } from './IconButton.js';

const TYPES = new Set(['success', 'error', 'warning', 'info']);

let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = createElement('div', {
      className: 'toast-container',
      attrs: { 'aria-live': 'polite', 'aria-relevant': 'additions' },
    });
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * @param {object} options
 * @param {string} options.message
 * @param {string} [options.type] - success | error | warning | info
 * @param {number} [options.duration] - ms, 0 = no auto dismiss
 * @param {boolean} [options.closable]
 * @param {function} [options.onClose]
 */
export function Toast(options = {}) {
  const {
    message,
    type = 'info',
    duration = 3000,
    closable = true,
    onClose,
  } = options;

  const toastType = TYPES.has(type) ? type : 'info';

  const dismiss = () => {
    toast.classList.remove('toast--visible');
    setTimeout(() => {
      toast.remove();
      if (onClose) onClose();
    }, 200);
  };

  const children = [
    createElement('span', { className: 'toast__message', text: message }),
  ];

  if (closable) {
    children.push(IconButton({
      ariaLabel: 'Dismiss notification',
      variant: 'ghost',
      size: 'sm',
      iconHtml: '&#10005;',
      className: 'toast__close',
      onClick: dismiss,
    }));
  }

  const toast = createElement('div', {
    className: `toast toast--${toastType}`,
    attrs: { role: 'status' },
    children,
  });

  getToastContainer().appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  return { element: toast, dismiss };
}
