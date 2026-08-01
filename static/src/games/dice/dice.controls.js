/**
 * Dice betting controls — slider, direction, amount, play.
 */

import { createElement } from '../../utils/dom.js';
import { Button } from '../../components/base/Button.js';
import { clampDiceTarget, getDisplayStats } from './dice.utils.js';
import { formatUsd } from '../../utils/format.js';
import {
  DICE_BET_LIMITS,
  DICE_QUICK_BETS,
  DICE_TARGET_LIMITS,
} from './dice.constants.js';
import { t } from '../../i18n/index.js';
import { hideTelegramKeyboard } from '../../app/telegram.js';

/**
 * @param {object} options
 * @param {number} options.limit
 * @param {boolean} options.over
 * @param {number} options.bid
 * @param {boolean} [options.disabled]
 * @param {boolean} [options.loading]
 * @param {(state: { limit: number, over: boolean, bid: number }) => void} options.onChange
 * @param {() => void} options.onPlay
 */
export function createDiceControls(options) {
  const state = {
    limit: clampDiceTarget(options.limit ?? 50),
    over: options.over ?? true,
    bid: options.bid ?? DICE_BET_LIMITS.min,
    disabled: options.disabled ?? false,
    loading: options.loading ?? false,
  };

  let onChange = options.onChange;
  let onPlay = options.onPlay;

  const slider = createElement('input', {
    className: 'dice-controls__slider',
    attrs: {
      type: 'range',
      min: String(DICE_TARGET_LIMITS.min),
      max: String(DICE_TARGET_LIMITS.max),
      step: '1',
      value: String(state.limit),
      'aria-label': t('dice.targetAria'),
      onInput: (event) => {
        state.limit = clampDiceTarget(event.target.value);
        sync();
      },
    },
  });

  const limitValue = createElement('span', {
    className: 'dice-controls__limit-value',
    text: String(state.limit),
  });

  const sliderPanel = createElement('div', {
    className: 'dice-controls__slider-panel',
    children: [
      createElement('div', {
        className: 'dice-controls__slider-header',
        children: [
          createElement('span', { className: 'dice-controls__slider-label', text: t('dice.target') }),
          limitValue,
        ],
      }),
      createElement('div', {
        className: 'dice-controls__slider-track',
        children: [slider],
      }),
    ],
  });

  const overCard = createDirectionCard('over', true);
  const underCard = createDirectionCard('under', false);

  const previewMultiplier = createElement('span', { className: 'dice-payout-preview__value' });
  const previewProfit = createElement('span', { className: 'dice-payout-preview__value' });
  const previewPayout = createElement('span', { className: 'dice-payout-preview__value' });

  const payoutPreview = createElement('div', {
    className: 'dice-payout-preview',
    children: [
      createElement('span', { className: 'dice-payout-preview__title', text: t('dice.payout.title') }),
      createElement('div', {
        className: 'dice-payout-preview__grid',
        children: [
          createPreviewRow(t('dice.payout.multiplier'), previewMultiplier),
          createPreviewRow(t('dice.payout.profit'), previewProfit),
          createPreviewRow(t('dice.payout.payout'), previewPayout),
        ],
      }),
    ],
  });

  const betInput = createElement('input', {
    className: 'dice-controls__bet-input',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
      value: String(state.bid),
      'aria-label': t('games.betAmount'),
      onInput: (event) => {
        const parsed = parseFloat(event.target.value.replace(',', '.'));
        if (Number.isFinite(parsed) && parsed >= 0) {
          state.bid = parsed;
        }
        sync({ skipBetInput: true });
      },
      onBlur: (event) => {
        const parsed = parseFloat(event.target.value.replace(',', '.'));
        state.bid = clampBid(Number.isFinite(parsed) ? parsed : DICE_BET_LIMITS.min);
        event.target.value = String(state.bid);
        sync();
        hideTelegramKeyboard();
      },
    },
  });

  const quickBetButtons = DICE_QUICK_BETS.map((amount) => {
    const btn = createElement('button', {
      className: 'dice-controls__quick-bet',
      attrs: {
        type: 'button',
        onClick: () => {
          setBetAmount(amount);
          btn.classList.add('dice-controls__quick-bet--pressed');
          window.setTimeout(() => {
            btn.classList.remove('dice-controls__quick-bet--pressed');
          }, 150);
        },
      },
      text: String(amount),
    });
    return btn;
  });

  let playButton = null;

  function createPreviewRow(label, valueEl) {
    return createElement('div', {
      className: 'dice-payout-preview__row',
      children: [
        createElement('span', { className: 'dice-payout-preview__label', text: label }),
        valueEl,
      ],
    });
  }

  function clampBid(value) {
    if (!Number.isFinite(value) || value <= 0) return DICE_BET_LIMITS.min;
    return Math.min(DICE_BET_LIMITS.max, Math.max(DICE_BET_LIMITS.min, Math.round(value * 100) / 100));
  }

  function createDirectionCard(kind, isOver) {
    const chanceEl = createElement('span', { className: 'dice-direction__chance-value' });
    const multiplierEl = createElement('span', { className: 'dice-direction__multiplier-value' });

    const card = createElement('button', {
      className: `dice-direction dice-direction--${kind}`,
      attrs: {
        type: 'button',
        'aria-pressed': isOver === state.over ? 'true' : 'false',
        onClick: () => {
          state.over = isOver;
          sync();
        },
      },
      children: [
        createElement('span', {
          className: 'dice-direction__title',
          text: isOver ? t('dice.direction.over') : t('dice.direction.under'),
        }),
        multiplierEl,
        createElement('div', {
          className: 'dice-direction__meta',
          children: [
            createElement('span', {
              className: 'dice-direction__chance',
              attrs: { 'data-chance-label': t('dice.meta.chance') },
              children: [chanceEl],
            }),
          ],
        }),
      ],
    });

    return { card, chanceEl, multiplierEl, isOver };
  }

  function updateSliderFill() {
    const pct = (
      (state.limit - DICE_TARGET_LIMITS.min)
      / (DICE_TARGET_LIMITS.max - DICE_TARGET_LIMITS.min)
    ) * 100;
    sliderPanel.style.setProperty('--dice-slider-pct', `${pct}%`);
  }

  function updatePayoutPreview() {
    const stats = getDisplayStats(state.bid, state.limit, state.over);
    previewMultiplier.textContent = `${stats.multiplier.toFixed(2)}×`;
    previewProfit.textContent = formatUsd(stats.profit);
    previewPayout.textContent = formatUsd(stats.payout);
  }

  function sync(opts = {}) {
    slider.value = String(state.limit);
    limitValue.textContent = String(state.limit);
    updateSliderFill();

    if (!opts.skipBetInput) {
      betInput.value = String(state.bid);
    }

    [overCard, underCard].forEach((entry) => {
      const active = entry.isOver === state.over;
      entry.card.classList.toggle('dice-direction--active', active);
      entry.card.setAttribute('aria-pressed', active ? 'true' : 'false');

      const stats = getDisplayStats(state.bid, state.limit, entry.isOver);
      entry.chanceEl.textContent = `${stats.chance}%`;
      entry.multiplierEl.textContent = `${stats.multiplier.toFixed(2)}×`;
    });

    updatePayoutPreview();

    root.classList.toggle('dice-controls--disabled', state.disabled || state.loading);

    if (playButton) {
      playButton.disabled = state.disabled || state.loading;
      playButton.classList.toggle('btn--loading', state.loading);
      playButton.classList.toggle('btn--disabled', state.disabled || state.loading);
    }

    onChange?.({
      limit: state.limit,
      over: state.over,
      bid: state.bid,
    });
  }

  function setBetAmount(amount) {
    state.bid = clampBid(amount);
    sync();
  }

  const root = createElement('div', {
    className: 'dice-controls',
    children: [
      createElement('div', {
        className: 'dice-controls__directions',
        children: [overCard.card, underCard.card],
      }),
      createElement('div', {
        className: 'dice-controls__play-wrap',
        children: [],
      }),
      payoutPreview,
      createElement('div', {
        className: 'dice-controls__bet-panel',
        children: [
          createElement('span', { className: 'dice-controls__bet-title', text: t('games.betAmount') }),
          createElement('div', {
            className: 'dice-controls__bet-input-wrap',
            children: [
              createElement('span', {
                className: 'dice-controls__bet-icon dice-controls__bet-icon--usd',
                attrs: { 'aria-hidden': 'true' },
                text: '$',
              }),
              betInput,
              createElement('span', { className: 'dice-controls__bet-currency', text: t('common.usd') }),
            ],
          }),
          createElement('div', {
            className: 'dice-controls__quick-bets',
            attrs: { role: 'group', 'aria-label': t('games.quickBets.aria') },
            children: quickBetButtons,
          }),
          createElement('div', {
            className: 'dice-controls__bet-actions',
            children: [
              Button({
                label: t('games.bet.min'),
                variant: 'ghost',
                size: 'sm',
                className: 'dice-controls__bet-limit',
                onClick: () => setBetAmount(DICE_BET_LIMITS.min),
              }),
              Button({
                label: t('games.bet.max'),
                variant: 'ghost',
                size: 'sm',
                className: 'dice-controls__bet-limit',
                onClick: () => setBetAmount(DICE_BET_LIMITS.max),
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const playWrap = root.querySelector('.dice-controls__play-wrap');
  playButton = Button({
    label: t('dice.play'),
    variant: 'primary',
    block: true,
    size: 'md',
    className: 'dice-controls__play',
    onClick: () => onPlay?.(),
  });
  playWrap.appendChild(playButton);

  sync();

  return {
    element: root,
    sliderPanel,

    getState() {
      return { ...state };
    },

    setLoading(loading) {
      state.loading = loading;
      sync();
    },

    setDisabled(disabled) {
      state.disabled = disabled;
      sync();
    },

    setHandlers(handlers = {}) {
      if (handlers.onChange) onChange = handlers.onChange;
      if (handlers.onPlay) onPlay = handlers.onPlay;
    },
  };
}
