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
      // Left Region: Fixed width for brand logo
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
              'aria-label': 'Profile',
            },
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
