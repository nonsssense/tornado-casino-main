/**
 * Button — reusable action control.
 *
 * Variants: primary | secondary | ghost | danger
 * Sizes: sm | md | lg
 * Modifiers: pill | block | loading | disabled
 */

import { createElement, appendChildren } from '../../utils/dom.js';

const VARIANTS = new Set(['primary', 'secondary', 'ghost', 'danger']);
const SIZES = new Set(['sm', 'md', 'lg']);

/**
 * @param {object} options
 * @param {string} [options.label]
 * @param {string} [options.variant]
 * @param {string} [options.size]
 * @param {boolean} [options.pill]
 * @param {boolean} [options.block]
 * @param {boolean} [options.disabled]
 * @param {boolean} [options.loading]
 * @param {string} [options.type]
 * @param {string} [options.className]
 * @param {HTMLElement|HTMLElement[]|string} [options.icon]
 * @param {HTMLElement|HTMLElement[]|string} [options.children]
 * @param {function} [options.onClick]
 */
export function Button(options = {}) {
  const {
    label,
    variant = 'primary',
    size = 'md',
    pill = false,
    block = false,
    disabled = false,
    loading = false,
    type = 'button',
    className = '',
    icon,
    children,
    onClick,
  } = options;

  const classes = ['btn', `btn--${VARIANTS.has(variant) ? variant : 'primary'}`];

  if (SIZES.has(size) && size !== 'md') classes.push(`btn--${size}`);
  if (pill) classes.push('btn--pill');
  if (block) classes.push('btn--block');
  if (loading) classes.push('btn--loading');
  if (disabled) classes.push('btn--disabled');
  if (className) classes.push(className);

  const button = createElement('button', {
    className: classes.join(' '),
    attrs: {
      type,
      disabled: disabled || loading,
      onClick,
    },
  });

  if (icon) {
    const iconEl = typeof icon === 'string'
      ? createElement('span', { className: 'btn__icon', html: icon })
      : icon;
    if (iconEl.classList && !iconEl.classList.contains('btn__icon')) {
      iconEl.classList.add('btn__icon');
    }
    button.appendChild(iconEl);
  }

  if (children) {
    appendChildren(button, Array.isArray(children) ? children : [children]);
  } else if (label) {
    button.appendChild(document.createTextNode(label));
  }

  return button;
}
