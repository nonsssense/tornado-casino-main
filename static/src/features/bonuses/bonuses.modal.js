/**
 * My Bonuses page — catalog with large hero + vertically stacked bonus cards.
 *
 * Filtering is driven by category arrays from the catalog API.
 * Opening a bonus navigates to the dedicated Bonus Details route.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { Skeleton } from '../../components/base/Skeleton.js';
import {
  bonusCatalogService,
  filterBonuses,
} from '../../services/bonus-catalog.service.js';
import { isAuthenticated } from '../../services/auth-state.js';
import { BONUS_ASSETS, BONUS_FILTERS_FALLBACK } from './bonuses.constants.js';
import { createBonusCatalogCard } from './bonus-card.js';
import { ROUTE_NAMES } from '../../router/route-names.js';
import { createGuestNotice } from '../../components/shared/GuestLock.js';

/**
 * @param {object} [options]
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createBonusesModal(options = {}) {
  /** @type {{ hero: object, filters: object[], bonuses: object[] }|null} */
  let catalog = bonusCatalogService.getCatalog();
  /** @type {string} */
  let activeFilterId = 'my_bonuses';

  const filtersEl = createElement('div', {
    className: 'bonuses-filters',
    attrs: { role: 'tablist', 'aria-label': t('bonuses.filters.aria') },
  });

  const sectionTitle = createElement('h2', {
    className: 'bonuses-section__title',
    text: t('bonuses.sections.yours'),
  });
  const list = createElement('div', {
    className: 'bonuses-list',
    attrs: { role: 'list' },
  });
  const boardSection = createElement('section', {
    className: 'bonuses-section',
    children: [sectionTitle, list],
  });
  const boardMount = createElement('div', {
    className: 'bonuses-board',
    children: [boardSection],
  });

  const heroEl = createElement('div', {
    className: 'bonuses-hero',
    children: [
      createElement('img', {
        className: 'bonuses-hero__image',
        attrs: {
          src: BONUS_ASSETS.heroFallback,
          alt: t('bonuses.hero.alt'),
          draggable: false,
          decoding: 'async',
          loading: 'eager',
          fetchpriority: 'high',
        },
      }),
    ],
  });

  const heroImage = heroEl.querySelector('.bonuses-hero__image');

  function currentFilters() {
    return catalog?.filters?.length ? catalog.filters : BONUS_FILTERS_FALLBACK;
  }

  function currentFilter() {
    return currentFilters().find((f) => f.id === activeFilterId) || currentFilters()[0];
  }

  function renderHero() {
    const banner = catalog?.hero?.banner || BONUS_ASSETS.heroFallback;
    if (heroImage && heroImage.getAttribute('src') !== banner) {
      heroImage.setAttribute('src', banner);
    }
    // Always keep the hero visible on the catalog page.
    heroEl.removeAttribute('hidden');
  }

  function openDetail(card) {
    if (!card?.id) return;
    void import('../../router/index.js').then(({ navigate }) => {
      void navigate(ROUTE_NAMES.BONUS_DETAIL, {
        params: { bonusId: String(card.id) },
      });
    });
  }

  function renderFilters() {
    const filters = currentFilters();
    if (!filters.some((f) => f.id === activeFilterId)) {
      activeFilterId = filters[0]?.id || 'my_bonuses';
    }

    filtersEl.replaceChildren(
      ...filters.map((filter) =>
        createElement('button', {
          className: `bonuses-filters__chip${activeFilterId === filter.id ? ' is-active' : ''}`,
          attrs: {
            type: 'button',
            role: 'tab',
            'aria-selected': activeFilterId === filter.id ? 'true' : 'false',
            onClick: () => {
              activeFilterId = filter.id;
              renderFilters();
              renderBoard();
            },
          },
          text: t(filter.label_key || filter.labelKey || filter.id),
        }),
      ),
    );
  }

  function emptyState(text) {
    return createElement('div', {
      className: 'bonuses-empty',
      attrs: { role: 'listitem' },
      text,
    });
  }

  function renderBoard() {
    renderHero();

    if (!catalog) {
      sectionTitle.textContent = t('bonuses.sections.yours');
      list.replaceChildren(
        Skeleton({ className: 'bonuses-skeleton', height: '14rem' }),
        Skeleton({ className: 'bonuses-skeleton', height: '14rem' }),
      );
      return;
    }

    const filter = currentFilter();
    const cards = filterBonuses(catalog.bonuses || [], filter);
    const titleKey = filter?.label_key || filter?.labelKey;
    sectionTitle.textContent = titleKey ? t(titleKey) : t('bonuses.sections.yours');

    list.replaceChildren(
      ...(cards.length
        ? cards.map((card, index) =>
          createElement('div', {
            className: 'bonuses-list__item',
            attrs: { role: 'listitem' },
            children: [
              createBonusCatalogCard(card, {
                onOpen: openDetail,
                eager: index === 0,
              }),
            ],
          }))
        : [
          !isAuthenticated()
            ? createGuestNotice({
                message: t('guest.bonuses.message'),
                className: 'bonuses-guest-notice',
              })
            : emptyState(t('bonuses.empty.yours')),
        ]),
    );
  }

  const element = createElement('div', {
    className: 'bonuses-page',
    attrs: { 'data-page': 'bonuses' },
    children: [
      heroEl,
      filtersEl,
      boardMount,
    ],
  });

  renderFilters();
  renderBoard();

  const unsubscribe = bonusCatalogService.subscribe((next) => {
    catalog = next;
    renderFilters();
    renderBoard();
  });

  if (!isAuthenticated()) {
    catalog = {
      hero: { banner: BONUS_ASSETS.heroFallback },
      filters: BONUS_FILTERS_FALLBACK,
      bonuses: [],
    };
    renderFilters();
    renderBoard();
  } else {
    void bonusCatalogService.fetchCatalog().catch(() => {
      catalog = {
        hero: { banner: BONUS_ASSETS.heroFallback },
        filters: BONUS_FILTERS_FALLBACK,
        bonuses: [],
      };
      renderFilters();
      renderBoard();
    });
  }

  return {
    element,
    destroy() {
      unsubscribe();
    },
  };
}
