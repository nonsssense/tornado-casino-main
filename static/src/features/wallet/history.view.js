/**
 * History view — transaction list for the wallet modal history tab.
 */

import { createElement } from '../../utils/dom.js';
import { walletService } from '../../services/wallet.service.js';
import { formatUsd } from '../../utils/format.js';
import { t } from '../../i18n/index.js';
import { SkeletonHistoryRows } from '../../components/base/Skeleton.js';
import { Button } from '../../components/base/Button.js';
import { hydrateFadeIn } from '../../utils/hydrate.js';

/**
 * @param {object} [options]
 * @param {boolean} [options.deferLoad] - wait until tab is first shown
 * @returns {{ element: HTMLElement, refresh: () => void, onTabVisible: () => void }}
 */
export function createHistoryView(options = {}) {
  const { deferLoad = true } = options;
  const contentMount = createElement('div');
  let hasLoadedOnce = false;

  const state = {
    loading: false,
    error: null,
    transactions: [],
  };

  function renderLoading() {
    contentMount.replaceChildren(SkeletonHistoryRows(4));
  }

  function renderError() {
    contentMount.replaceChildren(
      createElement('div', {
        className: 'wallet-view__address-error',
        children: [
          createElement('p', {
            className: 'wallet-view__address-error-text',
            text: state.error || t('wallet.history.error.load'),
          }),
          Button({
            label: t('common.retry'),
            variant: 'secondary',
            size: 'sm',
            onClick: loadHistory,
          }),
        ],
      }),
    );
  }

  function renderEmpty() {
    const empty = createElement('div', {
      className: 'wallet-view__empty',
      children: [
        createElement('p', {
          className: 'wallet-view__empty-title',
          text: t('wallet.history.emptyTitle'),
        }),
        createElement('p', {
          className: 'wallet-view__empty-text',
          text: t('wallet.history.emptyText'),
        }),
      ],
    });
    contentMount.replaceChildren(empty);
    hydrateFadeIn(empty, 150);
  }

  function renderList() {
    const list = createElement('div', {
      className: 'wallet-view__history-list',
      children: state.transactions.map((tx) =>
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
                  text: formatUsd(tx.amount),
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
                  text: formatUsd(tx.balance_after),
                }),
              ],
            }),
          ],
        }),
      ),
    });
    contentMount.replaceChildren(list);
    hydrateFadeIn(list, 150);
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
      state.error = t('wallet.history.error.retry');
    } finally {
      state.loading = false;
      hasLoadedOnce = true;
      renderContent();
    }
  }

  function onTabVisible() {
    if (!hasLoadedOnce) {
      void loadHistory();
    }
  }

  const element = createElement('div', {
    className: 'wallet-view wallet-view--history',
    attrs: { 'data-view': 'history' },
    children: [contentMount],
  });

  if (!deferLoad) {
    void loadHistory();
  } else {
    renderLoading();
  }

  return { element, refresh: loadHistory, onTabVisible };
}
