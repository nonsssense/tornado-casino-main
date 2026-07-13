/**
 * Plinko controls — risk, rows, bet amount, play.
 */

import { createElement } from '../../utils/dom.js';
import { Button } from '../../components/base/Button.js';
import { formatCryptoAmount } from '../../utils/format.js';
import { WALLET_COINS } from '../../utils/wallet.constants.js';
import {
  PLINKO_BET_LIMITS,
  PLINKO_QUICK_BETS,
  PLINKO_ROW_OPTIONS,
  PLINKO_RISK_OPTIONS,
} from './plinko.constants.js';

const USDT_ICON = WALLET_COINS.find((coin) => coin.id === 'usdt')?.icon ?? '/assets/tether.png';

/**
 * @param {object} options
 * @param {number} options.bid
 * @param {string} options.risk_mode
 * @param {number} options.rows
 * @param {boolean} [options.disabled]
 * @param {boolean} [options.loading]
 * @param {(state: { bid: number, risk_mode: string, rows: number }) => void} options.onChange
 * @param {() => void} options.onPlay
 */
export function createPlinkoControls(options) {
  const state = {
    bid: options.bid ?? PLINKO_BET_LIMITS.min,
    risk_mode: options.risk_mode ?? 'medium',
    rows: options.rows ?? 12,
    disabled: options.disabled ?? false,
    loading: options.loading ?? false,
  };

  let onChange = options.onChange;
  let onPlay = options.onPlay;
  let playButton = null;

  const riskButtons = PLINKO_RISK_OPTIONS.map((opt) =>
    createElement('button', {
      className: `plinko-controls__risk-btn plinko-controls__risk-btn--${opt.id}`,
      attrs: {
        type: 'button',
        'aria-pressed': state.risk_mode === opt.riskMode ? 'true' : 'false',
        onClick: () => {
          state.risk_mode = opt.riskMode;
          sync();
        },
      },
      text: opt.label,
    }),
  );

  const rowButtons = PLINKO_ROW_OPTIONS.map((rows) =>
    createElement('button', {
      className: 'plinko-controls__row-btn',
      attrs: {
        type: 'button',
        'aria-pressed': state.rows === rows ? 'true' : 'false',
        onClick: () => {
          state.rows = rows;
          sync();
        },
      },
      text: String(rows),
    }),
  );

  const betInput = createElement('input', {
    className: 'plinko-controls__bet-input',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
      value: String(state.bid),
      'aria-label': 'Bet amount in USDT',
      onInput: (event) => {
        const parsed = parseFloat(event.target.value.replace(',', '.'));
        if (Number.isFinite(parsed) && parsed >= 0) state.bid = parsed;
        sync({ skipBetInput: true });
      },
      onBlur: (event) => {
        const parsed = parseFloat(event.target.value.replace(',', '.'));
        state.bid = clampBid(Number.isFinite(parsed) ? parsed : PLINKO_BET_LIMITS.min);
        event.target.value = String(state.bid);
        sync();
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

  function clampBid(value) {
    if (!Number.isFinite(value) || value <= 0) return PLINKO_BET_LIMITS.min;
    return Math.min(PLINKO_BET_LIMITS.max, Math.max(PLINKO_BET_LIMITS.min, Math.round(value * 100) / 100));
  }

  function setBetAmount(amount) {
    state.bid = clampBid(amount);
    sync();
  }

  function sync(opts = {}) {
    if (!opts.skipBetInput) betInput.value = String(state.bid);

    riskButtons.forEach((btn, i) => {
      const active = PLINKO_RISK_OPTIONS[i].riskMode === state.risk_mode;
      btn.classList.toggle('plinko-controls__risk-btn--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    rowButtons.forEach((btn, i) => {
      const active = PLINKO_ROW_OPTIONS[i] === state.rows;
      btn.classList.toggle('plinko-controls__row-btn--active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    root.classList.toggle('plinko-controls--disabled', state.disabled || state.loading);

    if (playButton) {
      playButton.disabled = state.disabled || state.loading;
      playButton.classList.toggle('btn--loading', state.loading);
      playButton.classList.toggle('btn--disabled', state.disabled || state.loading);
    }

    onChange?.({ bid: state.bid, risk_mode: state.risk_mode, rows: state.rows });
  }

  const root = createElement('div', {
    className: 'plinko-controls',
    children: [
      createElement('div', { className: 'plinko-controls__play-wrap', children: [] }),
      createElement('div', {
        className: 'plinko-controls__bet-panel',
        children: [
          createElement('span', { className: 'plinko-controls__bet-title', text: 'Bet Amount' }),
          createElement('div', {
            className: 'plinko-controls__bet-input-wrap',
            children: [
              createElement('img', {
                className: 'plinko-controls__bet-icon',
                attrs: { src: USDT_ICON, alt: '', 'aria-hidden': 'true', draggable: false },
              }),
              betInput,
              createElement('span', { className: 'plinko-controls__bet-currency', text: 'USDT' }),
            ],
          }),
          createElement('div', {
            className: 'plinko-controls__quick-bets',
            attrs: { role: 'group', 'aria-label': 'Quick bet amounts' },
            children: quickBetButtons,
          }),
          createElement('div', {
            className: 'plinko-controls__bet-actions',
            children: [
              Button({
                label: 'Minimum',
                variant: 'ghost',
                size: 'sm',
                className: 'plinko-controls__bet-limit',
                onClick: () => setBetAmount(PLINKO_BET_LIMITS.min),
              }),
              Button({
                label: 'Maximum',
                variant: 'ghost',
                size: 'sm',
                className: 'plinko-controls__bet-limit',
                onClick: () => setBetAmount(PLINKO_BET_LIMITS.max),
              }),
            ],
          }),
        ],
      }),
      createElement('div', {
        className: 'plinko-controls__section',
        children: [
          createElement('span', { className: 'plinko-controls__label', text: 'Risk' }),
          createElement('div', {
            className: 'plinko-controls__segmented plinko-controls__segmented--risk',
            attrs: { role: 'group', 'aria-label': 'Risk level' },
            children: riskButtons,
          }),
        ],
      }),
      createElement('div', {
        className: 'plinko-controls__section',
        children: [
          createElement('span', { className: 'plinko-controls__label', text: 'Rows' }),
          createElement('div', {
            className: 'plinko-controls__segmented plinko-controls__segmented--rows',
            attrs: { role: 'group', 'aria-label': 'Row count' },
            children: rowButtons,
          }),
        ],
      }),
    ],
  });

  const playWrap = root.querySelector('.plinko-controls__play-wrap');
  playButton = Button({
    label: 'Play',
    variant: 'primary',
    block: true,
    size: 'md',
    className: 'plinko-controls__play',
    onClick: () => onPlay?.(),
  });
  playWrap.appendChild(playButton);

  sync();

  return {
    element: root,
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
  };
}
