/**
 * Bonus Details route — dedicated page for a single Bonus Card.
 * Reuses createBonusDetailView; no layout redesign.
 */

import { createElement } from '../utils/dom.js';
import { t } from '../i18n/index.js';
import { Skeleton } from '../components/base/Skeleton.js';
import { createBonusDetailView } from '../features/bonuses/bonus-card.js';
import { bonusCatalogService } from '../services/bonus-catalog.service.js';
import { overlayManager } from '../overlays/index.js';
import { ROUTE_NAMES } from '../router/route-names.js';
import {
  createRouteController,
  defineRoutePolicy,
} from '../router/route-controller.js';
import { requireAuth } from '../components/shared/GuestLoginModal.js';
import '../../styles/pages/bonuses.css';

/**
 * @param {object|null} catalog
 * @param {string|null|undefined} bonusId
 * @returns {object|null}
 */
function findBonusCard(catalog, bonusId) {
  if (!catalog || !bonusId) return null;
  return (catalog.bonuses || []).find((item) => item.id === bonusId) || null;
}

function goToCatalog() {
  void import('../router/index.js').then(({ navigate }) => {
    void navigate(ROUTE_NAMES.BONUSES);
  });
}

function openDeposit() {
  overlayManager.openDeposit({
    previousNavId: 'profile',
    highlightNav: true,
  });
}

/**
 * @returns {import('../router/route-controller.js').RouteController}
 */
export function createBonusDetailController() {
  /** @type {HTMLElement|null} */
  let mount = null;
  /** @type {string|null} */
  let activeBonusId = null;
  /** @type {function|null} */
  let unsubscribe = null;

  /**
   * @param {object|null} card
   */
  function renderDetail(card) {
    if (!mount) return;

    if (!card) {
      mount.replaceChildren(
        createElement('div', {
          className: 'bonuses-detail bonuses-detail--missing',
          children: [
            createElement('button', {
              className: 'bonuses-detail__back',
              attrs: {
                type: 'button',
                onClick: goToCatalog,
              },
              text: t('bonuses.detail.back'),
            }),
            createElement('p', {
              className: 'bonuses-empty',
              text: t('bonuses.empty.yours'),
            }),
          ],
        }),
      );
      return;
    }

    mount.replaceChildren(
      createBonusDetailView(card, {
        onBack: () => {
          if (window.history.length > 1) {
            window.history.back();
            return;
          }
          goToCatalog();
        },
        onAction: (selected) => {
          if (!requireAuth({ message: t('guest.bonuses.message') })) return;
          if (selected?.button?.action === 'deposit') {
            openDeposit();
          }
        },
      }),
    );
  }

  function renderLoading() {
    if (!mount) return;
    mount.replaceChildren(
      Skeleton({ className: 'bonuses-skeleton', height: '12rem' }),
      Skeleton({ className: 'bonuses-skeleton', height: '16rem' }),
    );
  }

  /**
   * @param {string|null|undefined} bonusId
   */
  async function showBonus(bonusId) {
    activeBonusId = bonusId || null;
    const cached = bonusCatalogService.getCatalog();
    const cachedCard = findBonusCard(cached, activeBonusId);
    if (cachedCard) {
      renderDetail(cachedCard);
    } else {
      renderLoading();
    }

    try {
      const catalog = cached || await bonusCatalogService.fetchCatalog();
      renderDetail(findBonusCard(catalog, activeBonusId));
    } catch {
      renderDetail(findBonusCard(bonusCatalogService.getCatalog(), activeBonusId));
    }
  }

  return createRouteController({
    name: ROUTE_NAMES.BONUS_DETAIL,
    policy: defineRoutePolicy({
      retainController: true,
      retainDom: true,
      screenType: 'standalone',
      showRouteSkeleton: false,
    }),
    createRoot() {
      return createElement('div', {
        className: 'route-root route-root--bonuses route-root--bonus-detail',
        attrs: { 'data-route': ROUTE_NAMES.BONUS_DETAIL },
      });
    },
    load(root) {
      if (!mount) {
        mount = createElement('div', {
          className: 'bonuses-page bonuses-page--detail',
          attrs: { 'data-page': 'bonus-detail' },
        });
      }
      if (mount.parentElement !== root) {
        root.replaceChildren(mount);
      }
    },
    async activate(_root, ctx) {
      const bonusId = ctx?.params?.bonusId || null;
      await showBonus(bonusId);

      if (!unsubscribe) {
        unsubscribe = bonusCatalogService.subscribe((catalog) => {
          if (!activeBonusId) return;
          const card = findBonusCard(catalog, activeBonusId);
          if (card) renderDetail(card);
        });
      }
    },
    deactivate() {
      // Soft leave — retain DOM for fast return; catalog subscription stays.
    },
    destroy(root) {
      unsubscribe?.();
      unsubscribe = null;
      mount = null;
      activeBonusId = null;
      root.replaceChildren();
    },
  });
}
