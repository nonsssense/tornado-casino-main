/**
 * MethodSelector — one large split control: Cryptocurrency | Bank.
 * Sliding yellow highlight stays inside a single shared rounded container.
 * Icons sit on the outer edges; labels stay centered in each half.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';

export const WALLET_METHODS = [
  {
    id: 'crypto',
    labelKey: 'wallet.method.crypto',
    iconSrc: '/assets/btc%20icon.webp',
    iconEdge: 'start',
  },
  {
    id: 'bank',
    labelKey: 'wallet.method.bank',
    iconSrc: '/assets/fiat_payments_logo.webp',
    iconEdge: 'end',
  },
];

/**
 * @param {object} [options]
 * @param {string} [options.activeId]
 * @param {function(string): void} [options.onSelect]
 * @param {string} [options.className]
 * @returns {HTMLElement}
 */
export function MethodSelector(options = {}) {
  const {
    activeId = 'crypto',
    onSelect,
    className = '',
  } = options;

  const classes = [
    'wallet-method',
    'wallet-method--split',
    `wallet-method--${activeId}`,
  ];
  if (className) classes.push(className);

  const track = createElement('div', {
    className: 'wallet-method__track',
    children: [
      createElement('div', {
        className: 'wallet-method__thumb',
        attrs: { 'aria-hidden': 'true' },
      }),
      ...WALLET_METHODS.map((method) => {
        const isActive = method.id === activeId;
        const icon = createElement('img', {
          className: [
            'wallet-method__asset',
            `wallet-method__asset--${method.iconEdge}`,
          ].join(' '),
          attrs: {
            src: method.iconSrc,
            alt: '',
            draggable: false,
            decoding: 'async',
          },
        });
        const label = createElement('span', {
          className: 'wallet-method__label',
          text: t(method.labelKey),
        });

        const children = method.iconEdge === 'end'
          ? [label, icon]
          : [icon, label];

        return createElement('button', {
          className: [
            'wallet-method__half',
            `wallet-method__half--${method.id}`,
            isActive ? 'wallet-method__half--active' : '',
          ].filter(Boolean).join(' '),
          attrs: {
            type: 'button',
            role: 'tab',
            'aria-selected': isActive ? 'true' : 'false',
            onClick: onSelect ? () => onSelect(method.id) : undefined,
          },
          children,
        });
      }),
    ],
  });

  return createElement('div', {
    className: classes.join(' '),
    attrs: {
      role: 'tablist',
      'aria-label': t('wallet.method.ariaLabel'),
    },
    children: [track],
  });
}
