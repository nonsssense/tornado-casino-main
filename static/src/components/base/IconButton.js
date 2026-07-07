/**
 * IconButton — compact icon-only action control.
 */

import { createElement } from '../../utils/dom.js';
import { Icon } from './Icon.js';

const SIZES = new Set(['sm', 'md', 'lg']);
const VARIANTS = new Set(['default', 'ghost', 'accent', 'circle']);

/**
 * @param {object} options
 * @param {string} options.ariaLabel
 * @param {string} [options.src] - image icon source
 * @param {string} [options.iconHtml] - inline SVG/html icon
 * @param {string} [options.variant]
 * @param {string} [options.size]
 * @param {boolean} [options.disabled]
 * @param {string} [options.className]
 * @param {string} [options.type]
 * @param {function} [options.onClick]
 */
export function IconButton(options = {}) {
  const {
    ariaLabel,
    src,
    iconHtml,
    variant = 'default',
    size = 'md',
    disabled = false,
    className = '',
    type = 'button',
    onClick,
  } = options;

  if (!ariaLabel) {
    throw new Error('IconButton requires ariaLabel');
  }

  const classes = ['icon-btn'];

  if (VARIANTS.has(variant) && variant !== 'default') {
    classes.push(`icon-btn--${variant}`);
  }

  if (SIZES.has(size) && size !== 'md') {
    classes.push(`icon-btn--${size}`);
  }

  if (className) classes.push(className);

  const icon = src
    ? Icon({ src, alt: '', className: 'icon-btn__icon' })
    : createElement('span', { className: 'icon-btn__icon', html: iconHtml || '' });

  return createElement('button', {
    className: classes.join(' '),
    attrs: {
      type,
      disabled,
      onClick,
      'aria-label': ariaLabel,
    },
    children: [icon],
  });
}
