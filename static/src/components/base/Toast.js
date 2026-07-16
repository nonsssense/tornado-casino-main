/**
 * Toast — transient notification primitive.
 */

import { createElement } from '../../utils/dom.js';
import { IconButton } from './IconButton.js';
import { formatUsd } from '../../utils/format.js';
import { t } from '../../i18n/index.js';

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
 * @param {string} [options.message]
 * @param {string} [options.title]
 * @param {string} [options.meta]
 * @param {string} [options.type] - success | error | warning | info
 * @param {string} [options.variant] - default | game-win
 * @param {number} [options.duration] - ms, 0 = no auto dismiss
 * @param {boolean} [options.closable]
 * @param {function} [options.onClose]
 */
export function Toast(options = {}) {
  const {
    message = '',
    title,
    meta,
    type = 'info',
    variant = 'default',
    duration = 3000,
    closable = true,
    onClose,
  } = options;

  const toastType = TYPES.has(type) ? type : 'info';
  const toastVariant = variant === 'game-win' ? 'game-win' : 'default';

  const dismiss = () => {
    toast.classList.add('toast--dismissing');
    toast.classList.remove('toast--visible');
    setTimeout(() => {
      toast.remove();
      if (onClose) onClose();
    }, 220);
  };

  const children = [];

  if (title || meta) {
    const headerChildren = [];
    if (meta) {
      headerChildren.push(createElement('span', { className: 'toast__meta', text: meta }));
    }
    if (title) {
      headerChildren.push(createElement('span', { className: 'toast__title', text: title }));
    }
    children.push(createElement('div', {
      className: 'toast__header',
      children: headerChildren,
    }));
  }

  if (message) {
    children.push(createElement('span', { className: 'toast__message', text: message }));
  }

  if (closable) {
    children.push(IconButton({
      ariaLabel: t('toast.dismiss'),
      variant: 'ghost',
      size: 'sm',
      iconHtml: '&#10005;',
      className: 'toast__close',
      onClick: dismiss,
    }));
  }

  const toastClasses = ['toast', `toast--${toastType}`];
  if (toastVariant === 'game-win') toastClasses.push('toast--game-win');

  const toast = createElement('div', {
    className: toastClasses.join(' '),
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

/**
 * Premium win notification for game rounds.
 * @param {object} options
 * @param {string} options.gameName
 * @param {number|string} options.amount
 * @param {number} [options.duration]
 */
export function showGameWinToast(options = {}) {
  const { gameName, amount, duration = 4200 } = options;

  return Toast({
    type: 'success',
    variant: 'game-win',
    meta: gameName,
    title: t('toast.win.title'),
    message: typeof amount === 'number' ? `+${formatUsd(amount)}` : String(amount),
    duration,
    closable: true,
  });
}
