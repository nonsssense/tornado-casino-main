/**
 * Deposit bonus banner — full-width creative for the currently valid bonus.
 * Uses backend offer state from bonusService (no local eligibility rules).
 */

import { createElement } from '../../utils/dom.js';
import { bonusService } from '../../services/bonus.service.js';
import { t } from '../../i18n/index.js';

const BONUS_BANNERS = {
  1: '/assets/deposit_page_bonus1.webp',
  2: '/assets/deposit_page_bonus2.webp',
  3: '/assets/deposit_page_bonus3.webp',
};

/**
 * Prefer an active bonus; otherwise the selected/available deposit tier.
 * @param {object} snapshot
 * @returns {{ offer: object, mode: 'active'|'available' }|null}
 */
export function resolveDepositBonusCard(snapshot) {
  const offers = Array.isArray(snapshot?.offers) ? snapshot.offers : [];
  const activeFromOffers = offers.find((offer) => offer.state === 'active');
  const activeInstance = Array.isArray(snapshot?.activeBonuses)
    ? snapshot.activeBonuses[0]
    : null;

  if (activeFromOffers || activeInstance) {
    const offer = activeFromOffers || {
      id: activeInstance?.id,
      source: activeInstance?.source,
      name: activeInstance?.name,
      percent: activeInstance?.percent,
      description: activeInstance?.description,
      state: 'active',
      deposit_index: null,
      wager_multiplier: snapshot?.rules?.wager_multiplier,
      expires_days: snapshot?.rules?.expires_days,
      eligible_games: activeInstance?.eligible_games || snapshot?.rules?.eligible_games,
      max_bet_absolute: snapshot?.rules?.max_bet_absolute,
      max_bet_percent_of_bonus: snapshot?.rules?.max_bet_percent_of_bonus,
    };
    return { offer, mode: 'active' };
  }

  const available = offers.find((offer) => offer.selected && offer.state === 'available')
    || offers.find((offer) => offer.state === 'available' && offer.selectable)
    || offers.find((offer) => offer.state === 'available');

  if (available) {
    return { offer: available, mode: 'available' };
  }

  return null;
}

/**
 * @param {object} offer
 * @returns {string}
 */
function resolveBonusBannerSrc(offer) {
  const index = Number(offer?.deposit_index) || 0;
  if (BONUS_BANNERS[index]) return BONUS_BANNERS[index];

  const percent = Number(offer?.percent) || 0;
  if (percent >= 100) return BONUS_BANNERS[3];
  if (percent >= 75) return BONUS_BANNERS[2];
  return BONUS_BANNERS[1];
}

/**
 * @param {object} [options]
 * @param {(payload: { offer: object, mode: string, rules: object|null }) => void} [options.onLearnMore]
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createDepositBonusCard(options = {}) {
  const { onLearnMore } = options;

  const state = {
    loading: true,
    error: null,
    offers: [],
    activeBonuses: [],
    selectedOfferId: null,
    rules: null,
  };

  const root = createElement('div', {
    className: 'deposit-bonus-banner',
  });

  function applySnapshot(snapshot) {
    state.offers = Array.isArray(snapshot.offers) ? snapshot.offers : [];
    state.activeBonuses = Array.isArray(snapshot.activeBonuses)
      ? snapshot.activeBonuses
      : [];
    state.selectedOfferId = snapshot.selectedOfferId ?? null;
    state.rules = snapshot.rules ?? null;
  }

  async function ensureSelected(resolved) {
    if (!resolved || resolved.mode !== 'available') return;
    const offer = resolved.offer;
    if (!offer?.selectable || offer.selected) return;
    if (state.selectedOfferId === offer.id) return;
    try {
      const next = await bonusService.selectOffer(offer.id);
      applySnapshot(next);
    } catch {
      // Selection is best-effort; banner still renders available state.
    }
  }

  function openLearnMore(resolved) {
    onLearnMore?.({
      offer: resolved.offer,
      mode: resolved.mode,
      rules: state.rules,
    });
  }

  function render() {
    if (state.loading) {
      root.replaceChildren(
        createElement('div', {
          className: 'deposit-bonus-banner__shell deposit-bonus-banner__shell--loading',
          text: t('wallet.bonus.card.loading'),
        }),
      );
      return;
    }

    if (state.error) {
      root.replaceChildren(
        createElement('div', {
          className: 'deposit-bonus-banner__shell deposit-bonus-banner__shell--empty',
          text: state.error,
        }),
      );
      return;
    }

    const resolved = resolveDepositBonusCard(state);
    if (!resolved) {
      root.replaceChildren(
        createElement('div', {
          className: 'deposit-bonus-banner__shell deposit-bonus-banner__shell--empty',
          text: t('wallet.bonus.empty'),
        }),
      );
      return;
    }

    const { offer, mode } = resolved;
    const bannerSrc = resolveBonusBannerSrc(offer);
    const alt = mode === 'active'
      ? t('wallet.bonus.card.activeTitle', { percent: `${offer.percent ?? ''}%` })
      : t('wallet.bonus.card.availableTitle', {
        n: offer.deposit_index || t('wallet.bonus.ordinal.next'),
        percent: `${offer.percent ?? ''}%`,
      });

    root.replaceChildren(
      createElement('button', {
        className: [
          'deposit-bonus-banner__media',
          mode === 'active' ? 'deposit-bonus-banner__media--active' : '',
        ].filter(Boolean).join(' '),
        attrs: {
          type: 'button',
          'aria-label': alt,
          onClick: () => openLearnMore(resolved),
        },
        children: [
          createElement('img', {
            className: 'deposit-bonus-banner__img',
            attrs: {
              src: bannerSrc,
              alt,
              draggable: false,
              decoding: 'async',
            },
          }),
        ],
      }),
      createElement('button', {
        className: 'deposit-bonus-banner__learn',
        attrs: {
          type: 'button',
          onClick: () => openLearnMore(resolved),
        },
        text: t('wallet.bonus.card.learnMore'),
      }),
    );
  }

  async function load() {
    state.loading = true;
    state.error = null;
    render();

    try {
      const [offersState] = await Promise.all([
        bonusService.fetchOffers(),
        bonusService.fetchActiveBonuses().catch(() => []),
      ]);
      applySnapshot({
        ...offersState,
        activeBonuses: bonusService.getState().activeBonuses,
      });
      const resolved = resolveDepositBonusCard(state);
      await ensureSelected(resolved);
      applySnapshot(bonusService.getState());
    } catch {
      state.error = t('wallet.bonus.error.loadFailed');
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
