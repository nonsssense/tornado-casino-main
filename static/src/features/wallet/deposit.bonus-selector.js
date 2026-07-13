/**
 * Deposit bonus selector — renders backend offer states only.
 * Presentation/interaction only; no local eligibility logic.
 */

import { createElement } from '../../utils/dom.js';
import { bonusService } from '../../services/bonus.service.js';

const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

const ICON_HELP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';

const BRIEFCASE_ICON = '/assets/bonus-briefcase.png';

/** Backend offer.state → short status label (display only). */
const STATE_LABEL = {
  available: 'Available',
  active: 'Active',
  completed: 'Done',
  expired: 'Expired',
  forfeited: 'Forfeited',
  upcoming: 'Upcoming',
};

/**
 * @param {object|null} offer
 * @returns {string}
 */
function formatPercent(offer) {
  if (offer?.percent == null) return '—';
  return `${offer.percent}%`;
}

/**
 * @param {object|null} offer
 * @returns {string}
 */
function formatWager(offer) {
  if (offer?.wager_multiplier == null) return '—';
  return `${offer.wager_multiplier}× bonus`;
}

/**
 * @param {object|null} offer
 * @returns {string}
 */
function formatExpiry(offer) {
  if (offer?.expires_days == null) return 'No expiry';
  return `${offer.expires_days} days`;
}

/**
 * @param {object|null} offer
 * @returns {string}
 */
function formatTierLabel(offer) {
  if (!offer?.deposit_index) return offer?.name || 'Deposit Bonus';
  return `Deposit #${offer.deposit_index}`;
}

/**
 * @param {object} offer
 * @param {boolean} isSelected
 * @returns {string}
 */
function formatStatusLabel(offer, isSelected) {
  if (isSelected && offer.state === 'available') return 'Selected';
  return STATE_LABEL[offer.state] || offer.state || '';
}

/**
 * @param {object|null} offer
 * @returns {string}
 */
function formatEligibleGames(offer) {
  const eligible = offer?.eligible_games;
  if (!eligible || typeof eligible !== 'object') return 'Dice, Crash, Plinko LOW';

  const parts = [];
  if (eligible.dice) parts.push('Dice');
  if (eligible.crash) parts.push('Crash');
  if (eligible.plinco) {
    const modes = eligible.plinco?.risk_modes;
    if (Array.isArray(modes) && modes.length) {
      parts.push(`Plinko (${modes.map((m) => String(m).toUpperCase()).join('/')})`);
    } else {
      parts.push('Plinko');
    }
  }
  return parts.length ? parts.join(', ') : '—';
}

/**
 * @param {object|null} offer
 * @returns {string}
 */
function formatMaxBet(offer) {
  const abs = offer?.max_bet_absolute;
  const pct = offer?.max_bet_percent_of_bonus;
  if (abs != null && pct != null) {
    return `${Math.round(Number(pct) * 100)}% of bonus, up to $${Number(abs)}`;
  }
  if (abs != null) return `Up to $${Number(abs)}`;
  return 'See bonus terms';
}

/**
 * @param {object} snapshot
 * @param {object} state
 */
function applySnapshot(snapshot, state) {
  state.offers = Array.isArray(snapshot.offers) ? snapshot.offers : [];
  state.selectedOfferId = snapshot.selectedOfferId ?? null;
  state.rules = snapshot.rules ?? state.rules ?? null;
}

/**
 * @param {object} [options]
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createDepositBonusSelector(options = {}) {
  void options;

  /** @type {Set<string>} */
  const flippedIds = new Set();

  const state = {
    expanded: false,
    loading: true,
    selecting: false,
    error: null,
    offers: [],
    selectedOfferId: null,
    rules: null,
  };

  const root = createElement('div', {
    className: 'deposit-bonus',
    attrs: { 'data-expanded': 'false' },
  });

  function getDisplayOffer() {
    return (
      state.offers.find((offer) => offer.selected)
      || state.offers.find((offer) => offer.state === 'active')
      || null
    );
  }

  function hasSelectableOffer() {
    return state.offers.some((offer) => offer.selectable);
  }

  function toggleFlip(offerId, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const nextFlipped = !flippedIds.has(offerId);
    if (nextFlipped) {
      flippedIds.add(offerId);
    } else {
      flippedIds.delete(offerId);
    }

    const card = root.querySelector(`[data-offer-id="${CSS.escape(offerId)}"]`);
    if (!card) {
      render();
      return;
    }

    card.classList.toggle('deposit-bonus__flip--flipped', nextFlipped);
    card.querySelectorAll('.deposit-bonus__help').forEach((button) => {
      button.setAttribute('aria-pressed', nextFlipped ? 'true' : 'false');
      button.setAttribute(
        'aria-label',
        nextFlipped ? 'Hide bonus details' : 'Show bonus details',
      );
    });
  }

  function render() {
    const display = getDisplayOffer();

    root.dataset.expanded = state.expanded ? 'true' : 'false';
    root.replaceChildren(
      createCollapsed(display),
      createExpandedPanel(display),
    );
  }

  /**
   * Collapsed control — only the current selected/active bonus.
   * @param {object|null} display
   */
  function createCollapsed(display) {
    const isSelected = Boolean(display?.selected);
    const status = display
      ? formatStatusLabel(display, isSelected)
      : (state.loading ? '' : 'None');

    let title = 'Deposit bonus';
    let subtitle = 'Tap to choose';
    if (state.loading) {
      title = 'Loading bonuses…';
      subtitle = '';
    } else if (display) {
      title = `${formatPercent(display)} · ${formatTierLabel(display)}`;
      subtitle = display.description || formatStatusLabel(display, isSelected);
    } else if (!hasSelectableOffer() && state.offers.length) {
      title = 'No deposit bonus available';
      subtitle = 'All tiers used or locked';
    }

    const children = [
      createElement('img', {
        className: 'deposit-bonus__collapsed-icon',
        attrs: {
          src: BRIEFCASE_ICON,
          alt: '',
          draggable: false,
          'aria-hidden': 'true',
        },
      }),
      createElement('div', {
        className: 'deposit-bonus__collapsed-body',
        children: [
          createElement('span', {
            className: 'deposit-bonus__collapsed-title',
            text: title,
          }),
          subtitle
            ? createElement('span', {
              className: 'deposit-bonus__collapsed-sub',
              text: subtitle,
            })
            : null,
        ].filter(Boolean),
      }),
    ];

    if (display && status) {
      children.push(createElement('span', {
        className: [
          'deposit-bonus__status',
          display.state === 'active' || isSelected
            ? 'deposit-bonus__status--accent'
            : '',
          display.state === 'completed' ? 'deposit-bonus__status--muted' : '',
        ].filter(Boolean).join(' '),
        text: status,
      }));
    }

    children.push(createElement('span', {
      className: 'deposit-bonus__chevron',
      attrs: { 'aria-hidden': 'true' },
      html: ICON_CHEVRON,
    }));

    return createElement('button', {
      className: [
        'deposit-bonus__collapsed',
        display ? 'deposit-bonus__collapsed--has-bonus' : '',
        display?.selected || display?.state === 'active'
          ? 'deposit-bonus__collapsed--active'
          : '',
      ].filter(Boolean).join(' '),
      attrs: {
        type: 'button',
        'aria-expanded': state.expanded ? 'true' : 'false',
        'aria-controls': 'deposit-bonus-panel',
        onClick: () => {
          state.expanded = !state.expanded;
          if (!state.expanded) flippedIds.clear();
          render();
        },
      },
      children,
    });
  }

  /**
   * @param {object|null} display
   */
  function createExpandedPanel(display) {
    const children = [];

    if (state.error) {
      children.push(createElement('p', {
        className: 'deposit-bonus__error',
        text: state.error,
      }));
    }

    if (!state.loading && state.offers.length && !hasSelectableOffer() && !display) {
      children.push(createElement('p', {
        className: 'deposit-bonus__error',
        text: 'No deposit bonus is available for your next deposit.',
      }));
    }

    children.push(createElement('div', {
      className: 'deposit-bonus__list',
      attrs: { role: 'listbox', 'aria-label': 'Deposit bonus tiers' },
      children: state.offers.map((offer) => createFlipCard(offer)),
    }));

    return createElement('div', {
      className: 'deposit-bonus__panel',
      attrs: {
        id: 'deposit-bonus-panel',
        'aria-hidden': state.expanded ? 'false' : 'true',
      },
      children,
    });
  }

  /**
   * @param {object} offer
   * @param {number} index
   */
  function createFlipCard(offer) {
    const offerState = offer.state || 'upcoming';
    const selectable = Boolean(offer.selectable);
    const isSelected = Boolean(offer.selected);
    const isFlipped = flippedIds.has(offer.id);
    const statusText = formatStatusLabel(offer, isSelected);

    return createElement('div', {
      className: [
        'deposit-bonus__flip',
        `deposit-bonus__flip--${offerState}`,
        isSelected ? 'deposit-bonus__flip--selected' : '',
        isFlipped ? 'deposit-bonus__flip--flipped' : '',
      ].filter(Boolean).join(' '),
      dataset: { offerId: offer.id },
      children: [
        createElement('div', {
          className: 'deposit-bonus__flip-inner',
          children: [
            createCardFront(offer, {
              selectable,
              isSelected,
              statusText,
              offerState,
            }),
            createCardBack(offer),
          ],
        }),
      ],
    });
  }

  /**
   * @param {object} offer
   * @param {{ selectable: boolean, isSelected: boolean, statusText: string, offerState: string }} meta
   */
  function createCardFront(offer, meta) {
    const { selectable, isSelected, statusText, offerState } = meta;

    return createElement('div', {
      className: [
        'deposit-bonus__face',
        'deposit-bonus__face--front',
        `deposit-bonus__card--${offerState}`,
        isSelected ? 'deposit-bonus__card--selected' : '',
      ].filter(Boolean).join(' '),
      children: [
        createHelpButton(offer.id, false),
        createElement('button', {
          className: 'deposit-bonus__select',
          attrs: {
            type: 'button',
            role: 'option',
            'aria-selected': isSelected ? 'true' : 'false',
            'aria-disabled': selectable ? 'false' : 'true',
            disabled: state.selecting || !selectable,
            onClick: () => {
              if (!selectable) return;
              void onSelect(offer.id);
            },
          },
          children: [
            createElement('img', {
              className: 'deposit-bonus__icon',
              attrs: {
                src: BRIEFCASE_ICON,
                alt: '',
                draggable: false,
                'aria-hidden': 'true',
              },
            }),
            createElement('div', {
              className: 'deposit-bonus__card-body',
              children: [
                createElement('div', {
                  className: 'deposit-bonus__card-top',
                  children: [
                    createElement('span', {
                      className: 'deposit-bonus__card-percent',
                      text: formatPercent(offer),
                    }),
                    createElement('span', {
                      className: 'deposit-bonus__card-name',
                      text: formatTierLabel(offer),
                    }),
                  ],
                }),
                createElement('span', {
                  className: 'deposit-bonus__card-desc',
                  text: offer.description || '',
                }),
                createElement('span', {
                  className: 'deposit-bonus__card-meta',
                  text: `${formatWager(offer)} · ${formatExpiry(offer)}`,
                }),
              ],
            }),
            createElement('span', {
              className: [
                'deposit-bonus__status',
                isSelected || offerState === 'active'
                  ? 'deposit-bonus__status--accent'
                  : '',
                offerState === 'completed' || offerState === 'expired'
                  ? 'deposit-bonus__status--muted'
                  : '',
              ].filter(Boolean).join(' '),
              attrs: { 'aria-hidden': 'true' },
              text: isSelected && offerState === 'available' ? '✓' : statusText,
            }),
          ],
        }),
      ],
    });
  }

  /**
   * @param {object} offer
   */
  function createCardBack(offer) {
    const rows = [
      { label: 'Bonus', value: `${formatPercent(offer)} match on ${formatTierLabel(offer).toLowerCase()}` },
      { label: 'Who', value: `Players making their ${ordinal(offer.deposit_index)} deposit` },
      { label: 'Wager', value: formatWager(offer) },
      { label: 'Expires', value: formatExpiry(offer) },
      { label: 'Max bet', value: formatMaxBet(offer) },
      { label: 'Games', value: formatEligibleGames(offer) },
      { label: 'Note', value: 'Plinko LOW only. Unused bonus burns on expiry.' },
    ];

    return createElement('div', {
      className: 'deposit-bonus__face deposit-bonus__face--back',
      attrs: {
        role: 'button',
        tabindex: '0',
        'aria-label': 'Flip card back',
        onClick: (event) => toggleFlip(offer.id, event),
        onKeydown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            toggleFlip(offer.id, event);
          }
        },
      },
      children: [
        createHelpButton(offer.id, true),
        createElement('div', {
          className: 'deposit-bonus__back-body',
          children: [
            createElement('span', {
              className: 'deposit-bonus__back-title',
              text: `${formatPercent(offer)} Deposit Bonus`,
            }),
            createElement('ul', {
              className: 'deposit-bonus__back-list',
              children: rows.map((row) => createElement('li', {
                className: 'deposit-bonus__back-row',
                children: [
                  createElement('span', {
                    className: 'deposit-bonus__back-label',
                    text: row.label,
                  }),
                  createElement('span', {
                    className: 'deposit-bonus__back-value',
                    text: row.value,
                  }),
                ],
              })),
            }),
          ],
        }),
      ],
    });
  }

  /**
   * @param {string} offerId
   * @param {boolean} isBack
   */
  function createHelpButton(offerId, isBack) {
    return createElement('button', {
      className: 'deposit-bonus__help',
      attrs: {
        type: 'button',
        'aria-label': isBack ? 'Hide bonus details' : 'Show bonus details',
        'aria-pressed': flippedIds.has(offerId) ? 'true' : 'false',
        onClick: (event) => toggleFlip(offerId, event),
      },
      html: ICON_HELP,
    });
  }

  /**
   * @param {number|null|undefined} n
   * @returns {string}
   */
  function ordinal(n) {
    const value = Number(n);
    if (!Number.isFinite(value)) return 'next';
    const mod100 = value % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
    const mod10 = value % 10;
    if (mod10 === 1) return `${value}st`;
    if (mod10 === 2) return `${value}nd`;
    if (mod10 === 3) return `${value}rd`;
    return `${value}th`;
  }

  async function onSelect(offerId) {
    if (!offerId || offerId === state.selectedOfferId || state.selecting) return;

    state.selecting = true;
    render();

    try {
      const next = await bonusService.selectOffer(offerId);
      applySnapshot(next, state);
      state.error = null;
    } catch {
      state.error = 'This deposit bonus tier is not available.';
    } finally {
      state.selecting = false;
      render();
    }
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
      applySnapshot(offersState, state);
    } catch {
      state.error = 'Unable to load bonuses.';
      state.offers = [];
      state.selectedOfferId = null;
    } finally {
      state.loading = false;
      render();
    }
  }

  const unsubscribe = bonusService.subscribe((snapshot) => {
    if (state.loading) return;
    applySnapshot(snapshot, state);
    render();
  });

  void load();

  return {
    element: root,
    destroy() {
      unsubscribe();
      flippedIds.clear();
    },
  };
}
