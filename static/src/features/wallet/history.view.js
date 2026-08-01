/**
 * History view — unified activity feed with category filters.
 */

import { createElement } from '../../utils/dom.js';
import { walletService } from '../../services/wallet.service.js';
import { formatUsd } from '../../utils/format.js';
import { t } from '../../i18n/index.js';
import { SkeletonHistoryRows } from '../../components/base/Skeleton.js';
import { Button } from '../../components/base/Button.js';
import { hydrateFadeIn } from '../../utils/hydrate.js';

const HISTORY_FILTERS = [
  'all',
  'deposits',
  'withdrawals',
  'game_bets',
  'game_wins',
  'referrals',
  'bonuses',
  'rewards',
  'system',
];

const ICON_SVGS = {
  deposits: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>',
  withdrawals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21V9M7 14l5-5 5 5"/><path d="M5 5h14"/></svg>',
  game_bets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12h8M12 8v8"/></svg>',
  game_wins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18l.9-5.4L4.2 8.7l5.4-.8L12 3z"/></svg>',
  referrals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M14 19c0-2 1.6-3.5 3.5-3.5S21 17 21 19"/></svg>',
  bonuses: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M8 8c0-2 1.5-3.5 4-3.5S16 6 16 8"/></svg>',
  rewards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM5 4h14"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
};

/**
 * @param {string} titleKey
 * @returns {string}
 */
function resolveTitle(titleKey) {
  const key = `wallet.history.items.${titleKey}`;
  const label = t(key);
  return label === key ? t('wallet.history.items.system') : label;
}

/**
 * @param {string} titleKey
 * @returns {string}
 */
function resolveDescription(titleKey) {
  const key = `wallet.history.items.${titleKey}_desc`;
  const label = t(key);
  return label === key ? '' : label;
}

/**
 * @param {string|null|undefined} iso
 * @returns {string}
 */
function formatWhen(iso) {
  if (!iso) return t('common.emDash');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/**
 * @param {number} amount
 * @returns {string}
 */
function formatSignedAmount(amount) {
  const value = Number(amount) || 0;
  const formatted = formatUsd(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

/**
 * @param {object} [options]
 * @param {boolean} [options.deferLoad]
 * @returns {{ element: HTMLElement, refresh: Function, onTabVisible: Function }}
 */
export function createHistoryView(options = {}) {
  const { deferLoad = true } = options;
  const filtersMount = createElement('div', {
    className: 'wallet-history__filters',
    attrs: {
      role: 'tablist',
      'aria-label': t('wallet.history.filtersAria'),
    },
  });
  const contentMount = createElement('div', { className: 'wallet-history__content' });
  let hasLoadedOnce = false;

  const state = {
    loading: false,
    error: null,
    items: [],
    category: 'all',
  };

  function renderFilters() {
    filtersMount.replaceChildren(
      ...HISTORY_FILTERS.map((category) => {
        const active = state.category === category;
        return createElement('button', {
          className: [
            'wallet-history__filter',
            active ? 'wallet-history__filter--active' : '',
          ].filter(Boolean).join(' '),
          attrs: {
            type: 'button',
            role: 'tab',
            'aria-selected': active ? 'true' : 'false',
            onClick: () => {
              if (state.category === category) return;
              state.category = category;
              renderFilters();
              void loadHistory({ soft: true });
            },
          },
          text: t(`wallet.history.filters.${category}`),
        });
      }),
    );
  }

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
            onClick: () => void loadHistory(),
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
      className: 'wallet-history__list',
      children: state.items.map((item) => {
        const category = item.category || item.icon || 'system';
        const titleKey = item.title_key || 'system';
        const amount = Number(item.amount) || 0;
        const amountClass = amount > 0
          ? 'wallet-history__amount--credit'
          : amount < 0
            ? 'wallet-history__amount--debit'
            : '';

        return createElement('article', {
          className: 'wallet-history__item',
          children: [
            createElement('div', {
              className: `wallet-history__icon wallet-history__icon--${category}`,
              html: ICON_SVGS[category] || ICON_SVGS.system,
            }),
            createElement('div', {
              className: 'wallet-history__body',
              children: [
                createElement('div', {
                  className: 'wallet-history__topline',
                  children: [
                    createElement('h3', {
                      className: 'wallet-history__title',
                      text: resolveTitle(titleKey),
                    }),
                    createElement('span', {
                      className: ['wallet-history__amount', amountClass].filter(Boolean).join(' '),
                      text: formatSignedAmount(amount),
                    }),
                  ],
                }),
                createElement('div', {
                  className: 'wallet-history__meta',
                  children: [
                    createElement('span', {
                      className: 'wallet-history__desc',
                      text: resolveDescription(titleKey) || item.type || '',
                    }),
                    item.status
                      ? createElement('span', {
                        className: 'wallet-history__status',
                        text: item.status,
                      })
                      : null,
                    createElement('span', {
                      className: 'wallet-history__time',
                      text: formatWhen(item.created_at),
                    }),
                  ].filter(Boolean),
                }),
              ],
            }),
          ],
        });
      }),
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
    if (!state.items.length) {
      renderEmpty();
      return;
    }
    renderList();
  }

  /**
   * @param {{ soft?: boolean }} [opts]
   */
  async function loadHistory(opts = {}) {
    const soft = Boolean(opts.soft);
    state.loading = true;
    state.error = null;
    if (!soft || !state.items.length) {
      renderContent();
    }

    try {
      const data = await walletService.fetchHistory(state.category);
      state.items = Array.isArray(data.items) ? data.items : [];
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

  renderFilters();

  const element = createElement('div', {
    className: 'wallet-view wallet-view--history',
    attrs: { 'data-view': 'history' },
    children: [filtersMount, contentMount],
  });

  if (!deferLoad) {
    void loadHistory();
  } else {
    renderLoading();
  }

  return { element, refresh: loadHistory, onTabVisible };
}
