/**
 * Header — Modern three-region layout for perfect centering
 * Architecture: Left Region | Center Region | Right Region
 */

import { createElement } from '../../utils/dom.js';
import { ASSETS } from '../../utils/assets.js';
import { Balance } from './Balance.js';

/**
 * @param {object} [options]
 * @param {string} [options.balanceAmount]
 * @param {function} [options.onDepositClick]
 * @param {string} [options.className]
 */
export function Header(options = {}) {
  const {
    balanceAmount,
    onDepositClick,
    className = '',
  } = options;

  const classes = ['app-header'];
  if (className) classes.push(className);

  return createElement('header', {
    className: classes.join(' '),
    children: [
      // Left Region: brand logo (default) or back control (game mode)
      createElement('div', {
        className: 'app-header__left',
        children: [
          createElement('img', {
            className: 'app-header__logo',
            attrs: {
              src: ASSETS.logo,
              alt: 'Tornado',
              draggable: false,
              role: 'button',
              tabindex: '0',
              'aria-label': 'Home',
            },
          }),
          createElement('button', {
            className: 'app-header__back',
            attrs: {
              type: 'button',
              'aria-label': 'Back to games',
            },
            html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
          }),
        ],
      }),
      // Center Region: Flexible area with balance widget
      createElement('div', {
        className: 'app-header__center',
        children: [
          Balance({
            amount: balanceAmount,
            onAdd: onDepositClick,
            className: 'balance--header',
          }),
        ],
      }),
      // Right Region: Fixed width for profile button
      createElement('div', {
        className: 'app-header__right',
        children: [
          createElement('button', {
            className: 'app-header__profile',
            attrs: {
              type: 'button',
              'aria-label': 'Profile',
            },
            children: [
              createElement('img', {
                className: 'app-header__profile-icon',
                attrs: {
                  src: ASSETS.icon,
                  alt: '',
                  draggable: false,
                  'aria-hidden': 'true',
                },
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
