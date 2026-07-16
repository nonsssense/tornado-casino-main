/**
 * BottomNavigation — primary app navigation bar.
 * UI only — navigation actions are placeholders until router is wired.
 */

import { createElement } from '../../utils/dom.js';
import { BOTTOM_NAV_ITEMS } from '../../utils/constants.js';
import { t } from '../../i18n/index.js';

/**
 * @param {object} [options]
 * @param {string} [options.activeId] - highlighted nav item id
 * @param {function} [options.onNavigate] - placeholder callback (id) => void
 * @param {string} [options.className]
 */
export function BottomNavigation(options = {}) {
  const {
    activeId = 'casino',
    onNavigate,
    className = '',
  } = options;

  const classes = ['bottom-nav'];
  if (className) classes.push(className);

  const items = BOTTOM_NAV_ITEMS.map((item) => {
    const isActive = item.id === activeId;

    return createElement('button', {
      className: [
        'bottom-nav__item',
        isActive ? 'bottom-nav__item--active' : '',
      ].filter(Boolean).join(' '),
      attrs: {
        type: 'button',
        'data-nav': item.id,
        'aria-current': isActive ? 'page' : undefined,
        onClick: onNavigate ? () => onNavigate(item.id) : undefined,
      },
      children: [
        createElement('span', {
          className: `bottom-nav__icon bottom-nav__icon--${item.icon}`,
          attrs: { 'aria-hidden': 'true' },
        }),
        createElement('span', {
          className: 'bottom-nav__label',
          text: t(item.labelKey),
        }),
      ],
    });
  });

  return createElement('nav', {
    className: classes.join(' '),
    attrs: {
      'aria-label': t('nav.ariaLabel'),
    },
    children: items,
  });
}
