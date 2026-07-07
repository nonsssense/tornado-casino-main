/**
 * Wallet modal — single container with deposit / withdraw / history views.
 */

import { createElement } from '../../utils/dom.js';
import { ASSETS } from '../../utils/assets.js';
import { WalletTabs } from '../../components/shared/WalletTabs.js';
import { createDepositView } from './deposit.view.js';
import { createWithdrawView } from './withdraw.view.js';
import { createHistoryView } from './history.view.js';

const VIEW_FACTORIES = {
  deposit: createDepositView,
  withdraw: createWithdrawView,
  history: createHistoryView,
};

/**
 * @param {object} [options]
 * @param {string} [options.initialTab] - deposit | withdraw | history
 * @returns {HTMLElement}
 */
export function createWalletModal(options = {}) {
  const { initialTab = 'deposit' } = options;

  const shared = { coinId: 'usdt' };
  const controllers = new Map();
  let activeTab = initialTab;

  const tabsMount = createElement('div');

  const walletModal = createElement('div', {
    className: 'wallet-modal',
    attrs: { role: 'tabpanel' },
  });

  function getCoinId() {
    return shared.coinId;
  }

  function onCoinSelect(coinId) {
    shared.coinId = coinId;
    controllers.forEach((controller) => {
      controller.setCoinId?.(coinId);
    });
  }

  function getController(tabId) {
    if (!controllers.has(tabId)) {
      const factory = VIEW_FACTORIES[tabId];
      if (!factory) return null;

      const controller = tabId === 'history'
        ? factory()
        : factory({ getCoinId, onCoinSelect });

      controllers.set(tabId, controller);
    }

    return controllers.get(tabId);
  }

  function renderTabs() {
    tabsMount.replaceChildren(
      WalletTabs({
        activeId: activeTab,
        onTabSelect: switchTab,
        className: 'wallet-modal__tabs',
      }),
    );
  }

  function showActiveView() {
    ['deposit', 'withdraw', 'history'].forEach((tabId) => {
      const controller = getController(tabId);
      if (!controller) return;

      const isActive = tabId === activeTab;
      controller.element.classList.toggle('wallet-view--hidden', !isActive);
      controller.element.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    walletModal.setAttribute('data-active-view', activeTab);
  }

  function switchTab(tabId) {
    if (tabId === activeTab) return;

    activeTab = tabId;
    showActiveView();
    renderTabs();
  }

  ['deposit', 'withdraw', 'history'].forEach((tabId) => {
    const controller = getController(tabId);
    if (controller) {
      walletModal.appendChild(controller.element);
    }
  });

  walletModal.appendChild(tabsMount);
  walletModal.appendChild(
    createElement('div', {
      className: 'wallet-modal__brand',
      children: [
        createElement('img', {
          className: 'wallet-modal__brand-logo',
          attrs: {
            src: ASSETS.logo,
            alt: 'Tornado',
            draggable: false,
          },
        }),
      ],
    }),
  );

  showActiveView();
  renderTabs();

  return walletModal;
}
