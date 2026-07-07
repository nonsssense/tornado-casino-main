/**
 * Badge — compact status or label indicator.
 */

import { createElement } from '../../utils/dom.js';

const VARIANTS = new Set(['default', 'accent', 'success', 'warning', 'error']);

/**
 * @param {object} options
 * @param {string} options.text
 * @param {string} [options.variant]
 * @param {boolean} [options.pill]
 * @param {string} [options.className]
 */
export function Badge(options = {}) {
  const { text, variant = 'default', pill = false, className = '' } = options;

  const classes = ['badge', `badge--${VARIANTS.has(variant) ? variant : 'default'}`];
  if (pill) classes.push('badge--pill');
  if (className) classes.push(className);

  return createElement('span', {
    className: classes.join(' '),
    text,
  });
}
