/**
 * Plinko controls — risk, rows, bet amount, play.
 */

import { createElement } from '../../utils/dom.js';
import { Button } from '../../components/base/Button.js';
import {
  PLINKO_BALL_LIMITS,
  PLINKO_BET_MIN,
  PLINKO_QUICK_BETS,
  PLINKO_ROW_OPTIONS,
  PLINKO_RISK_OPTIONS,
  getPlinkoBetLimits,
} from './plinko.constants.js';
import { t } from '../../i18n/index.js';
import { hideTelegramKeyboard } from '../../app/telegram.js';

/**
 * @param {object} options
 * @param {number} options.bid
 * @param {string} options.risk_mode
 * @param {number} options.rows
 * @param {number} [options.count]
 * @param {boolean} [options.disabled]
 * @param {boolean} [options.loading]
 * @param {(state: { bid: number, risk_mode: string, rows: number, count: number }) => void} options.onChange
 * @param {() => void} options.onPlay
 * @param {HTMLElement} [options.settingsButton]
 * @param {() => void} [options.onBeforeRowsOpen]
 */
export function createPlinkoControls(options) {
  const state = {
    bid: options.bid ?? PLINKO_BET_MIN,
    risk_mode: options.risk_mode ?? 'medium',
    rows: options.rows ?? 12,
    count: options.count ?? PLINKO_BALL_LIMITS.min,
    disabled: options.disabled ?? false,
    loading: options.loading ?? false,
  };

  let onChange = options.onChange;
  let onPlay = options.onPlay;
  let playButton = null;
  let rowsOpen = false;
  const settingsButton = options.settingsButton ?? null;

  const riskValue = createElement('span', {
    className: 'plinko-board-control__value',
  });

  const rowButtons = PLINKO_ROW_OPTIONS.map((rows) =>
    createElement('button', {
      className: 'plinko-rows-menu__option',
      attrs: {
        type: 'button',
        onClick: () => {
          state.rows = rows;
          setRowsOpen(false);
          sync();
        },
      },
      text: String(rows),
    }),
  );

  const rowsValue = createElement('span', {
    className: 'plinko-board-control__value',
    text: String(state.rows),
  });

  const rowsMenu = createElement('div', {
    className: 'plinko-rows-menu',
    attrs: {
      role: 'menu',
      'aria-hidden': 'true',
    },
    children: rowButtons,
  });

  const rowsButton = createElement('button', {
    className: 'plinko-board-control plinko-board-control--rows',
    attrs: {
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      onClick: () => {
        options.onBeforeRowsOpen?.();
        setRowsOpen(!rowsOpen);
      },
    },
    children: [
      createElement('span', {
        className: 'plinko-board-control__label',
        text: t('plinko.rows'),
      }),
      createElement('span', {
        className: 'plinko-board-control__content',
        children: [
          rowsValue,
          createElement('span', {
            className: 'plinko-board-control__chevron',
            attrs: { 'aria-hidden': 'true' },
          }),
        ],
      }),
    ],
  });

  const rowsControl = createElement('div', {
    className: 'plinko-board-control-wrap plinko-board-control-wrap--rows',
    children: [rowsButton, rowsMenu],
  });

  const riskButton = createElement('button', {
    className: 'plinko-board-control plinko-board-control--risk',
    attrs: {
      type: 'button',
      onClick: cycleRisk,
    },
    children: [
      createElement('span', {
        className: 'plinko-board-control__label',
        text: t('plinko.risk'),
      }),
      riskValue,
    ],
  });

  const endControls = createElement('div', {
    className: 'plinko-board__game-controls-end',
    children: settingsButton ? [settingsButton, riskButton] : [riskButton],
  });

  const gameControls = createElement('div', {
    className: 'plinko-board__game-controls',
    children: [rowsControl, endControls],
  });

  const betInput = createElement('input', {
    className: 'plinko-controls__bet-input',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
      value: String(state.bid),
      'aria-label': t('games.betAmount'),
      onInput: (event) => {
        const parsed = parseFloat(event.target.value.replace(',', '.'));
        if (Number.isFinite(parsed) && parsed >= 0) state.bid = parsed;
        sync({ skipBetInput: true });
      },
      onBlur: (event) => {
        const parsed = parseFloat(event.target.value.replace(',', '.'));
        state.bid = clampBid(Number.isFinite(parsed) ? parsed : getPlinkoBetLimits(state.risk_mode).min);
        event.target.value = String(state.bid);
        sync();
        hideTelegramKeyboard();
      },
    },
  });

  const quickBetButtons = PLINKO_QUICK_BETS.map((amount) => {
    const btn = createElement('button', {
      className: 'plinko-controls__quick-bet',
      attrs: {
        type: 'button',
        onClick: () => {
          setBetAmount(amount);
          btn.classList.add('plinko-controls__quick-bet--pressed');
          window.setTimeout(() => {
            btn.classList.remove('plinko-controls__quick-bet--pressed');
          }, 150);
        },
      },
      text: String(amount),
    });
    return btn;
  });

  const countValue = createElement('span', {
    className: 'plinko-controls__count-value',
    text: String(state.count),
  });

  const decreaseCountButton = createElement('button', {
    className: 'plinko-controls__count-button',
    attrs: {
      type: 'button',
      'aria-label': t('plinko.ballsDecrease'),
      onClick: () => setBallCount(state.count - 1),
    },
    text: '−',
  });

  const increaseCountButton = createElement('button', {
    className: 'plinko-controls__count-button',
    attrs: {
      type: 'button',
      'aria-label': t('plinko.ballsIncrease'),
      onClick: () => setBallCount(state.count + 1),
    },
    text: '+',
  });

  function clampBid(value) {
    const limits = getPlinkoBetLimits(state.risk_mode);
    if (!Number.isFinite(value) || value <= 0) return limits.min;
    return Math.min(limits.max, Math.max(limits.min, Math.round(value * 100) / 100));
  }

  function setBetAmount(amount) {
    state.bid = clampBid(amount);
    sync();
  }

  function setBallCount(count) {
    if (state.disabled || state.loading) return;
    state.count = Math.min(
      PLINKO_BALL_LIMITS.max,
      Math.max(PLINKO_BALL_LIMITS.min, Math.round(Number(count) || 1)),
    );
    sync();
  }

  function setRowsOpen(open) {
    rowsOpen = Boolean(open) && !state.disabled && !state.loading;
    rowsControl.classList.toggle('plinko-board-control-wrap--open', rowsOpen);
    rowsButton.setAttribute('aria-expanded', rowsOpen ? 'true' : 'false');
    rowsMenu.setAttribute('aria-hidden', rowsOpen ? 'false' : 'true');
  }

  function cycleRisk() {
    if (state.disabled || state.loading) return;
    const index = PLINKO_RISK_OPTIONS.findIndex(
      (option) => option.riskMode === state.risk_mode,
    );
    const next = PLINKO_RISK_OPTIONS[(index + 1) % PLINKO_RISK_OPTIONS.length];
    state.risk_mode = next.riskMode;
    state.bid = clampBid(state.bid);
    sync();
  }

  function handleOutsidePointer(event) {
    if (rowsOpen && !rowsControl.contains(event.target)) setRowsOpen(false);
  }

  function handleEscape(event) {
    if (event.key === 'Escape') setRowsOpen(false);
  }

  function sync(opts = {}) {
    if (!opts.skipBetInput) betInput.value = String(state.bid);

    const riskOption = PLINKO_RISK_OPTIONS.find(
      (option) => option.riskMode === state.risk_mode,
    ) ?? PLINKO_RISK_OPTIONS[0];
    riskValue.textContent = t(riskOption.labelKey);
    riskButton.dataset.risk = riskOption.riskMode;
    riskButton.setAttribute(
      'aria-label',
      `${t('plinko.risk')}: ${t(riskOption.labelKey)}`,
    );

    rowButtons.forEach((btn, i) => {
      const active = PLINKO_ROW_OPTIONS[i] === state.rows;
      btn.classList.toggle('plinko-rows-menu__option--active', active);
      btn.setAttribute('aria-current', active ? 'true' : 'false');
    });
    rowsValue.textContent = String(state.rows);
    countValue.textContent = String(state.count);

    root.classList.toggle('plinko-controls--disabled', state.disabled || state.loading);
    rowsButton.disabled = state.disabled || state.loading;
    riskButton.disabled = state.disabled || state.loading;
    if (settingsButton) settingsButton.disabled = state.disabled || state.loading;
    decreaseCountButton.disabled = (
      state.disabled
      || state.loading
      || state.count <= PLINKO_BALL_LIMITS.min
    );
    increaseCountButton.disabled = (
      state.disabled
      || state.loading
      || state.count >= PLINKO_BALL_LIMITS.max
    );
    rowButtons.forEach((button) => {
      button.disabled = state.disabled || state.loading;
    });
    if (state.disabled || state.loading) setRowsOpen(false);

    if (playButton) {
      playButton.disabled = state.disabled || state.loading;
      playButton.classList.toggle('btn--loading', state.loading);
      playButton.classList.toggle('btn--disabled', state.disabled || state.loading);
    }

    onChange?.({
      bid: state.bid,
      risk_mode: state.risk_mode,
      rows: state.rows,
      count: state.count,
    });
  }

  const root = createElement('div', {
    className: 'plinko-controls',
    children: [
      createElement('div', { className: 'plinko-controls__play-wrap', children: [] }),
      createElement('div', {
        className: 'plinko-controls__bet-panel',
        children: [
          createElement('div', {
            className: 'plinko-controls__bet-heading',
            children: [
              createElement('span', {
                className: 'plinko-controls__bet-title',
                text: t('games.betAmount'),
              }),
              createElement('div', {
                className: 'plinko-controls__count',
                attrs: {
                  role: 'group',
                  'aria-label': t('plinko.balls'),
                },
                children: [
                  createElement('span', {
                    className: 'plinko-controls__count-label',
                    text: t('plinko.balls'),
                  }),
                  decreaseCountButton,
                  countValue,
                  increaseCountButton,
                ],
              }),
            ],
          }),
          createElement('div', {
            className: 'plinko-controls__bet-input-wrap',
            children: [
              createElement('span', {
                className: 'plinko-controls__bet-icon plinko-controls__bet-icon--usd',
                attrs: { 'aria-hidden': 'true' },
                text: '$',
              }),
              betInput,
              createElement('span', { className: 'plinko-controls__bet-currency', text: t('common.usd') }),
            ],
          }),
          createElement('div', {
            className: 'plinko-controls__quick-bets',
            attrs: { role: 'group', 'aria-label': t('games.quickBets.aria') },
            children: quickBetButtons,
          }),
          createElement('div', {
            className: 'plinko-controls__bet-actions',
            children: [
              Button({
                label: t('games.bet.min'),
                variant: 'ghost',
                size: 'sm',
                className: 'plinko-controls__bet-limit',
                onClick: () => setBetAmount(getPlinkoBetLimits(state.risk_mode).min),
              }),
              Button({
                label: t('games.bet.max'),
                variant: 'ghost',
                size: 'sm',
                className: 'plinko-controls__bet-limit',
                onClick: () => setBetAmount(getPlinkoBetLimits(state.risk_mode).max),
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const playWrap = root.querySelector('.plinko-controls__play-wrap');
  playButton = Button({
    label: t('plinko.play'),
    variant: 'primary',
    block: true,
    size: 'md',
    className: 'plinko-controls__play',
    onClick: () => onPlay?.(),
  });
  playWrap.appendChild(playButton);

  document.addEventListener('pointerdown', handleOutsidePointer, true);
  document.addEventListener('keydown', handleEscape);
  sync();

  return {
    element: root,
    gameControls,
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
    closeRowsMenu() {
      setRowsOpen(false);
    },
    destroy() {
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
      document.removeEventListener('keydown', handleEscape);
    },
  };
}
