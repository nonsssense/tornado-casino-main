/**
 * Chip — selectable option control (currency, filters).
 */

import { createElement } from '../../utils/dom.js';
import { Icon } from './Icon.js';

/**
 * @param {object} options
 * @param {string} options.label
 * @param {string} [options.iconSrc]
 * @param {boolean} [options.active]
 * @param {boolean} [options.disabled]
 * @param {string} [options.className]
 * @param {function} [options.onClick]
 */
export function Chip(options = {}) {
  const {
    label,
    iconSrc,
    active = false,
    disabled = false,
    className = '',
    onClick,
  } = options;

  const classes = ['chip'];
  if (active) classes.push('chip--active');
  if (className) classes.push(className);

  const children = [];

  if (iconSrc) {
    children.push(Icon({ src: iconSrc, alt: '', className: 'chip__icon' }));
  }

  children.push(createElement('span', { className: 'chip__label', text: label }));

  return createElement('button', {
    className: classes.join(' '),
    attrs: {
      type: 'button',
      disabled,
      onClick,
      'aria-pressed': active ? 'true' : 'false',
    },
    children,
  });
}

/**
 * @param {object} options
 * @param {HTMLElement[]} options.chips
 * @param {string} [options.layout] - grid | 2col | row
 * @param {string} [options.className]
 */
export function ChipGroup(options = {}) {
  const { chips = [], layout = 'grid', className = '' } = options;

  const classes = ['chip-group'];

  if (layout === '2col') classes.push('chip-group--2col');
  if (layout === 'row') classes.push('chip-group--row');
  if (className) classes.push(className);

  return createElement('div', {
    className: classes.join(' '),
    attrs: { role: 'group' },
    children: chips,
  });
}
