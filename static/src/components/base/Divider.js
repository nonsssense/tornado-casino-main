/**
 * Divider — visual separator between content blocks.
 */

import { createElement } from '../../utils/dom.js';

/**
 * @param {object} options
 * @param {boolean} [options.vertical]
 * @param {boolean} [options.small]
 * @param {string} [options.className]
 */
export function Divider(options = {}) {
  const { vertical = false, small = false, className = '' } = options;

  const classes = ['divider'];
  if (vertical) classes.push('divider--vertical');
  if (small) classes.push('divider--sm');
  if (className) classes.push(className);

  return createElement('hr', { className: classes.join(' ') });
}
