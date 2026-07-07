/**
 * Icon — image or inline icon wrapper with consistent sizing.
 */

import { createElement } from '../../utils/dom.js';

/**
 * @param {object} options
 * @param {string} [options.src]
 * @param {string} [options.alt]
 * @param {string} [options.html]
 * @param {string} [options.className]
 * @param {string} [options.size] - sm | md | lg
 */
export function Icon(options = {}) {
  const { src, alt = '', html, className = '', size = 'md' } = options;
  const classes = ['icon', `icon--${size}`];

  if (className) classes.push(className);

  if (src) {
    return createElement('img', {
      className: classes.join(' '),
      attrs: { src, alt, draggable: false },
    });
  }

  return createElement('span', {
    className: classes.join(' '),
    html: html || '',
    aria: alt ? { label: alt } : undefined,
  });
}
