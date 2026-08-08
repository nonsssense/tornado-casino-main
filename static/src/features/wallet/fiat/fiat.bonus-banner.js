/**
 * Fiat deposit bonus banner.
 *
 * Renders the provided banner artwork with dynamic text overlaid:
 *   "Бонус {n}%" + active-state line.
 *
 * All values come from backend bonus state (bonusService). The frontend never
 * computes eligibility or percentages — it only reflects what the server says.
 */

import { createElement } from '../../../utils/dom.js';
import { bonusService } from '../../../services/bonus.service.js';
import { resolveDepositBonusCard } from '../deposit.bonus-card.js';
import { isAuthenticated } from '../../../services/auth-state.js';
import { t } from '../../../i18n/index.js';
import { FIAT_BONUS_BANNER } from './fiat.constants.js';

/**
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createFiatBonusBanner() {
  const state = {
    loading: true,
    offers: [],
    activeBonuses: [],
    rules: null,
  };

  const root = createElement('div', { className: 'fiat-bonus-banner' });

  function applySnapshot(snapshot) {
    state.offers = Array.isArray(snapshot?.offers) ? snapshot.offers : [];
    state.activeBonuses = Array.isArray(snapshot?.activeBonuses)
      ? snapshot.activeBonuses
      : [];
    state.rules = snapshot?.rules ?? null;
  }

  function render() {
    if (state.loading) {
      root.hidden = true;
      root.replaceChildren();
      return;
    }

    const resolved = resolveDepositBonusCard(state);
    const percent = Number(resolved?.offer?.percent);

    // No bonus available for this user right now — hide the banner entirely
    // rather than inventing a value on the frontend.
    if (!resolved || !Number.isFinite(percent) || percent <= 0) {
      root.hidden = true;
      root.replaceChildren();
      return;
    }

    const stateKey = resolved.mode === 'active'
      ? 'wallet.fiat.bonus.active'
      : 'wallet.fiat.bonus.available';

    root.hidden = false;
    root.replaceChildren(
      createElement('div', {
        className: 'fiat-bonus-banner__media',
        children: [
          createElement('img', {
            className: 'fiat-bonus-banner__img',
            attrs: {
              src: FIAT_BONUS_BANNER,
              alt: '',
              loading: 'lazy',
              decoding: 'async',
              draggable: false,
            },
          }),
          createElement('div', {
            className: 'fiat-bonus-banner__text',
            children: [
              createElement('span', {
                className: 'fiat-bonus-banner__title',
                html: t('wallet.fiat.bonus.title', {
                  percent: `<strong>${percent}%</strong>`,
                }),
              }),
              createElement('span', {
                className: 'fiat-bonus-banner__sub',
                text: t(stateKey),
              }),
            ],
          }),
        ],
      }),
    );
  }

  async function load() {
    if (!isAuthenticated()) {
      state.loading = false;
      render();
      return;
    }
    state.loading = true;
    render();
    try {
      await Promise.all([
        bonusService.fetchOffers(),
        bonusService.fetchActiveBonuses().catch(() => []),
      ]);
      applySnapshot(bonusService.getState());
    } catch {
      // Banner is non-critical; stay hidden on failure.
    } finally {
      state.loading = false;
      render();
    }
  }

  const unsubscribe = bonusService.subscribe((snapshot) => {
    if (state.loading) return;
    applySnapshot(snapshot);
    render();
  });

  void load();

  return {
    element: root,
    destroy() {
      unsubscribe?.();
    },
  };
}
