/**
 * Wallet modal — single container with deposit / withdraw / history views.
 */

import { createElement } from '../../utils/dom.js';
import { ASSETS } from '../../utils/assets.js';
import { t } from '../../i18n/index.js';
import { WalletTabs, WALLET_TABS } from '../../components/shared/WalletTabs.js';
import { createDepositView } from './deposit.view.js';
import { createWithdrawView } from './withdraw.view.js';
import { createHistoryView } from './history.view.js';
import { getDefaultNetworkId } from './wallet.utils.js';

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

  const shared = {
    coinId: 'usdt',
    networkId: getDefaultNetworkId('usdt'),
  };
  const controllers = new Map();
  let activeTab = initialTab;

  const tabsMount = createElement('div');
  const titleEl = createElement('h2', {
    className: 'wallet-modal__page-title',
    text: t(`wallet.pages.${initialTab}`),
  });

  const walletModal = createElement('div', {
    className: 'wallet-modal',
    attrs: { role: 'tabpanel' },
  });

  function updatePageTitle() {
    titleEl.textContent = t(`wallet.pages.${activeTab}`);
  }

  function getCoinId() {
    return shared.coinId;
  }

  function getNetworkId() {
    return shared.networkId;
  }

  function onCoinSelect(coinId) {
    if (shared.coinId === coinId) return;
    shared.coinId = coinId;
    shared.networkId = getDefaultNetworkId(coinId);
    controllers.forEach((controller) => {
      controller.setCoinId?.(shared.coinId);
    });
  }

  function onNetworkSelect(networkId) {
    if (shared.networkId === networkId) return;
    shared.networkId = networkId;
    controllers.forEach((controller) => {
      controller.setNetworkId?.(shared.networkId);
    });
  }

  function getController(tabId) {
    if (!controllers.has(tabId)) {
      const factory = VIEW_FACTORIES[tabId];
      if (!factory) return null;

      const controller = tabId === 'history'
        ? factory({ deferLoad: true })
        : factory({
          getCoinId,
          getNetworkId,
          onCoinSelect,
          onNetworkSelect,
        });

      controllers.set(tabId, controller);
    }

    return controllers.get(tabId);
  }

  function renderTabs() {
    const existingTabs = tabsMount.querySelector('.wallet-tabs');

    if (!existingTabs) {
      tabsMount.replaceChildren(
        WalletTabs({
          activeId: activeTab,
          onTabSelect: switchTab,
          className: 'wallet-modal__tabs',
        }),
      );
      return;
    }

    existingTabs.querySelectorAll('.wallet-tabs__tab').forEach((button, index) => {
      const tabId = WALLET_TABS[index]?.id;
      if (!tabId) return;

      const isActive = tabId === activeTab;
      button.classList.toggle('wallet-tabs__tab--active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function showActiveView() {
    ['deposit', 'withdraw', 'history'].forEach((tabId) => {
      const controller = controllers.get(tabId);
      if (!controller) return;

      const isActive = tabId === activeTab;
      controller.element.classList.toggle('wallet-view--hidden', !isActive);
      controller.element.setAttribute('aria-hidden', isActive ? 'false' : 'true');

      if (isActive) {
        controller.onTabVisible?.();
      }
    });

    walletModal.setAttribute('data-active-view', activeTab);
    updatePageTitle();
  }

  function switchTab(tabId) {
    if (tabId === activeTab) return;

    activeTab = tabId;

    const controller = getController(tabId);
    if (controller && !walletModal.contains(controller.element)) {
      walletModal.insertBefore(controller.element, tabsMount);
    }

    showActiveView();
    renderTabs();
  }

  const initialController = getController(activeTab);
  walletModal.appendChild(titleEl);
  if (initialController) {
    walletModal.appendChild(initialController.element);
  }

  walletModal.appendChild(tabsMount);
  walletModal.appendChild(
    createElement('div', {
      className: 'wallet-modal__brand',
      children: [
        createElement('img', {
          className: 'wallet-modal__brand-logo',
          attrs: {
            src: ASSETS.logo,
            alt: t('brand.name'),
            draggable: false,
          },
        }),
      ],
    }),
  );

  showActiveView();
  renderTabs();

  return {
    element: walletModal,
    destroy() {
      controllers.forEach((controller) => {
        controller.destroy?.();
      });
      controllers.clear();
    },
  };
}
