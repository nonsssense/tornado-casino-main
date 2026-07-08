/**
 * History view — transaction list for the wallet modal history tab.
 */

import { createElement } from '../../utils/dom.js';
import { walletService } from '../../services/wallet.service.js';
import { formatCryptoAmount } from '../../utils/format.js';
import { Loader } from '../../components/base/Loader.js';
import { Button } from '../../components/base/Button.js';

/**
 * @returns {{ element: HTMLElement, refresh: () => void }}
 */
export function createHistoryView() {
  const contentMount = createElement('div');

  const state = {
    loading: true,
    error: null,
    transactions: [],
  };

  function renderLoading() {
    contentMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__address-loading',
        children: [
          Loader({ size: 'md' }),
          createElement('span', {
            className: 'wallet-view__address-loading-text',
            text: 'Loading history…',
          }),
        ],
      }),
    );
  }

  function renderError() {
    contentMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__address-error',
        children: [
          createElement('p', {
            className: 'wallet-view__address-error-text',
            text: state.error || 'Unable to load history.',
          }),
          Button({
            label: 'Retry',
            variant: 'secondary',
            size: 'sm',
            onClick: loadHistory,
          }),
        ],
      }),
    );
  }

  function renderEmpty() {
    contentMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__empty',
        children: [
          createElement('p', {
            className: 'wallet-view__empty-title',
            text: 'Transaction history',
          }),
          createElement('p', {
            className: 'wallet-view__empty-text',
            text: 'No transactions yet',
          }),
        ],
      }),
    );
  }

  function renderList() {
    contentMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__history-list',
        children: state.transactions.map((tx) => (
          createElement('div', {
            className: 'wallet-view__history-item',
            children: [
              createElement('div', {
                className: 'wallet-view__history-row',
                children: [
                  createElement('span', {
                    className: 'wallet-view__history-type',
                    text: tx.type,
                  }),
                  createElement('span', {
                    className: 'wallet-view__history-amount',
                    text: formatCryptoAmount(tx.amount),
                  }),
                ],
              }),
              createElement('div', {
                className: 'wallet-view__history-row',
                children: [
                  createElement('span', {
                    className: 'wallet-view__history-status',
                    text: tx.status,
                  }),
                  createElement('span', {
                    className: 'wallet-view__history-balance',
                    text: formatCryptoAmount(tx.balance_after),
                  }),
                ],
              }),
            ],
          })
        )),
      }),
    );
  }

  function renderContent() {
    if (state.loading) {
      renderLoading();
      return;
    }

    if (state.error) {
      renderError();
      return;
    }

    if (!state.transactions.length) {
      renderEmpty();
      return;
    }

    renderList();
  }

  async function loadHistory() {
    state.loading = true;
    state.error = null;
    renderContent();

    try {
      state.transactions = await walletService.fetchHistory();
    } catch {
      state.error = 'Unable to load history. Please try again.';
    } finally {
      state.loading = false;
      renderContent();
    }
  }

  const element = createElement('div', {
    className: 'wallet-view wallet-view--history',
    attrs: { 'data-view': 'history' },
    children: [contentMount],
  });

  const observer = new MutationObserver(() => {
    if (element.getAttribute('aria-hidden') === 'false') {
      loadHistory();
    }
  });

  observer.observe(element, { attributes: true, attributeFilter: ['aria-hidden'] });

  loadHistory();

  return { element, refresh: loadHistory };
}
