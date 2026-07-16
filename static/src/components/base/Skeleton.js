/**
 * Skeleton — layout-preserving placeholder blocks.
 */

import { createElement } from '../../utils/dom.js';

/**
 * @param {object} [options]
 * @param {string} [options.className]
 * @param {'block'|'text'|'circle'|'pill'} [options.variant]
 * @param {string} [options.width]
 * @param {string} [options.height]
 * @param {string} [options.text] - optional visible label (e.g. em dash balance)
 * @returns {HTMLElement}
 */
export function Skeleton(options = {}) {
  const {
    className = '',
    variant = 'block',
    width,
    height,
    text,
  } = options;

  const classes = ['skeleton', `skeleton--${variant}`];
  if (className) classes.push(className);

  /** @type {Record<string, string>} */
  const style = {};
  if (width) style.width = width;
  if (height) style.height = height;

  const children = text
    ? [createElement('span', { className: 'skeleton__text', text })]
    : [];

  return createElement('div', {
    className: classes.join(' '),
    attrs: {
      'aria-hidden': text ? undefined : 'true',
      role: text ? 'status' : undefined,
    },
    style,
    children,
  });
}

/**
 * @param {number} [count]
 * @returns {HTMLElement}
 */
export function SkeletonHistoryRows(count = 3) {
  return createElement('div', {
    className: 'skeleton-history',
    attrs: { 'aria-hidden': 'true' },
    children: Array.from({ length: count }, () =>
      createElement('div', {
        className: 'skeleton-history__row',
        children: [
          Skeleton({ variant: 'text', className: 'skeleton-history__line skeleton-history__line--type' }),
          Skeleton({ variant: 'text', className: 'skeleton-history__line skeleton-history__line--amount' }),
          Skeleton({ variant: 'text', className: 'skeleton-history__line skeleton-history__line--meta' }),
          Skeleton({ variant: 'text', className: 'skeleton-history__line skeleton-history__line--meta' }),
        ],
      }),
    ),
  });
}

/**
 * Deposit address card skeleton — matches wallet-view__address-card dimensions.
 * @returns {HTMLElement}
 */
export function SkeletonDepositAddress() {
  return createElement('div', {
    className: 'skeleton-deposit-address',
    attrs: { 'aria-hidden': 'true' },
    children: [
      Skeleton({ variant: 'text', className: 'skeleton-deposit-address__label', width: '40%' }),
      Skeleton({ variant: 'block', className: 'skeleton-deposit-address__value' }),
      createElement('div', {
        className: 'skeleton-deposit-address__actions',
        children: [
          Skeleton({ variant: 'pill', className: 'skeleton-deposit-address__btn' }),
          Skeleton({ variant: 'pill', className: 'skeleton-deposit-address__btn' }),
        ],
      }),
    ],
  });
}
