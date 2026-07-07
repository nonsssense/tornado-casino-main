/**
 * WalletTabs — deposit / withdraw / history tab bar for wallet screens.
 */

import { createElement } from '../../utils/dom.js';

export const WALLET_TABS = [
  { id: 'deposit', label: 'deposit' },
  { id: 'withdraw', label: 'withdraw' },
  { id: 'history', label: 'history' },
];

/**
 * @param {object} [options]
 * @param {string} [options.activeId]
 * @param {function} [options.onTabSelect] - (tabId) => void
 * @param {string} [options.className]
 */
export function WalletTabs(options = {}) {
  const {
    activeId = 'deposit',
    onTabSelect,
    className = '',
  } = options;

  const classes = ['wallet-tabs'];
  if (className) classes.push(className);

  return createElement('div', {
    className: classes.join(' '),
    attrs: { role: 'tablist', 'aria-label': 'Wallet sections' },
    children: WALLET_TABS.map((tab) => {
      const isActive = tab.id === activeId;

      return createElement('button', {
        className: [
          'wallet-tabs__tab',
          isActive ? 'wallet-tabs__tab--active' : '',
        ].filter(Boolean).join(' '),
        attrs: {
          type: 'button',
          role: 'tab',
          'aria-selected': isActive ? 'true' : 'false',
          onClick: onTabSelect ? () => onTabSelect(tab.id) : undefined,
        },
        text: tab.label,
      });
    }),
  });
}
