/**
 * Card — surface container for grouped content.
 */

import { createElement } from '../../utils/dom.js';

/**
 * @param {object} options
 * @param {string} [options.title]
 * @param {string} [options.subtitle]
 * @param {string} [options.variant] - default | glow | interactive
 * @param {boolean} [options.flush]
 * @param {boolean} [options.paddedLg]
 * @param {string} [options.className]
 * @param {HTMLElement|HTMLElement[]|string} [options.children]
 * @param {HTMLElement|HTMLElement[]|string} [options.headerActions]
 * @param {HTMLElement|HTMLElement[]|string} [options.footer]
 */
export function Card(options = {}) {
  const {
    title,
    subtitle,
    variant = 'default',
    flush = false,
    paddedLg = false,
    className = '',
    children = [],
    headerActions,
    footer,
    onClick,
  } = options;

  const classes = ['card'];

  if (variant === 'glow') classes.push('card--glow');
  if (variant === 'interactive') classes.push('card--interactive');
  if (flush) classes.push('card--flush');
  if (paddedLg) classes.push('card--padded-lg');
  if (className) classes.push(className);

  const cardChildren = [];

  if (title || subtitle || headerActions) {
    const headerChildren = [];

    if (title || subtitle) {
      const titleBlock = createElement('div');
      if (title) {
        titleBlock.appendChild(createElement('h3', { className: 'card__title', text: title }));
      }
      if (subtitle) {
        titleBlock.appendChild(createElement('p', { className: 'card__subtitle', text: subtitle }));
      }
      headerChildren.push(titleBlock);
    }

    if (headerActions) {
      headerChildren.push(headerActions);
    }

    cardChildren.push(createElement('div', {
      className: 'card__header',
      children: headerChildren,
    }));
  }

  if (children && (Array.isArray(children) ? children.length : true)) {
    cardChildren.push(createElement('div', {
      className: 'card__body',
      children: Array.isArray(children) ? children : [children],
    }));
  }

  if (footer) {
    cardChildren.push(createElement('div', {
      className: 'card__footer',
      children: Array.isArray(footer) ? footer : [footer],
    }));
  }

  const card = createElement('div', {
    className: classes.join(' '),
    attrs: onClick ? { onClick, role: 'button', tabindex: '0' } : {},
    children: cardChildren,
  });

  return card;
}
