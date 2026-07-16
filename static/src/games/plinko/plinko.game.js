/**
 * Plinko game — board generation + backend path visualization.
 */

import { createElement } from '../../utils/dom.js';
import { gameService } from '../../services/game.service.js';
import { balanceTypeService } from '../../services/balance-type.service.js';
import { balanceService } from '../../services/balance.service.js';
import { plinkoConfigService } from '../../services/plinko.config.service.js';
import { Toast, showGameWinToast } from '../../components/base/Toast.js';
import { createPlinkoBoard } from './plinko.board.js';
import { createPlinkoControls } from './plinko.controls.js';
import { animatePlinkoPath, cancelPlinkoPathAnimation } from './plinko.animation.js';
import { isPremiumMultiplier } from './plinko.geometry.js';
import { PLINKO_DEFAULT_STATE } from './plinko.constants.js';
import { formatUsd } from '../../utils/format.js';
import { t } from '../../i18n/index.js';

/** @type {HTMLElement|null} */
let mountContainer = null;

/** @type {ReturnType<typeof createPlinkoBoard>|null} */
let board = null;

/** @type {ReturnType<typeof createPlinkoControls>|null} */
let controls = null;

let isPlaying = false;
let configReady = false;

const gameState = { ...PLINKO_DEFAULT_STATE };

function handleSettingsChange(next) {
  gameState.bid = next.bid;
  gameState.risk_mode = next.risk_mode;
  gameState.rows = next.rows;
  const mults = plinkoConfigService.getMultipliers(next.risk_mode, next.rows);
  board?.updateSettings(next.rows, next.risk_mode, mults);
}

async function handlePlay() {
  if (isPlaying || !controls || !board) return;

  const { bid, risk_mode, rows } = controls.getState();

  if (!Number.isFinite(bid) || bid <= 0) {
    Toast({ message: t('game.validation.bet'), type: 'warning', duration: 2500 });
    return;
  }

  isPlaying = true;
  controls.setLoading(true);
  controls.setDisabled(true);
  board.clearBasketHighlight();
  board.hideBall();

  try {
    const payload = {
      bid,
      risk_mode,
      rows,
      ...balanceTypeService.getGamePayloadExtras(),
    };

    const result = await gameService.playPlinko(payload);
    if (!isPlaying || !board || !controls) return;

    const path = result.path ?? result.bits;

    if (!Array.isArray(path) || path.length !== rows) {
      throw new Error(t('plinko.error.invalidPath'));
    }

    const { basketIndex } = await animatePlinkoPath({ path, board });
    if (!isPlaying || !board) return;

    const multiplier = Number(result.multiplier) || 0;
    const payout = Number(result.payout) || 0;
    const profit = payout - bid;
    const premium = isPremiumMultiplier(multiplier);
    const mult = multiplier.toFixed(2);

    board.highlightBasket(basketIndex, { premium });
    board.hideBall();

    if (profit > 0) {
      showGameWinToast({
        gameName: t('plinko.toast.winMeta', { mult }),
        amount: profit,
        duration: premium ? 4800 : 3800,
      });
    } else {
      Toast({
        message: t('plinko.toast.returned', { mult, usd: formatUsd(payout) }),
        type: 'info',
        duration: 3200,
      });
    }
  } catch (error) {
    board?.hideBall();
    board?.clearBasketHighlight();
    Toast({
      message: error.message || t('plinko.toast.failed'),
      type: 'error',
      duration: 3200,
    });
  } finally {
    isPlaying = false;
    controls?.setLoading(false);
    controls?.setDisabled(false);
  }
}

export const PlinkoGame = {
  /**
   * @param {HTMLElement} container
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<boolean>} true when board mounted successfully
   */
  async mount(container, options = {}) {
    const { signal } = options;

    if (mountContainer === container && board?.element?.isConnected && configReady) {
      return true;
    }

    this.unmount({ keepDom: false });
    mountContainer = container;

    try {
      await plinkoConfigService.load();
      if (signal?.aborted) {
        this.unmount({ keepDom: false });
        return false;
      }
      configReady = true;
    } catch (error) {
      configReady = false;
      container.replaceChildren(
        createElement('p', {
          className: 'plinko-board-wrap__error',
          text: t('plinko.error.config'),
        }),
      );
      Toast({
        message: error.message || t('plinko.toast.configFailed'),
        type: 'error',
        duration: 4000,
      });
      return false;
    }

    const balances = balanceService.getBalances();
    if (balances?.real) {
      gameState.bid = Math.min(gameState.bid, balances.real) || gameState.bid;
    }

    const multipliers = plinkoConfigService.getMultipliers(gameState.risk_mode, gameState.rows);

    board = createPlinkoBoard({
      rows: gameState.rows,
      riskMode: gameState.risk_mode,
      multipliers,
    });

    controls = createPlinkoControls({
      bid: gameState.bid,
      risk_mode: gameState.risk_mode,
      rows: gameState.rows,
      onChange: handleSettingsChange,
      onPlay: handlePlay,
    });

    const stage = createElement('div', {
      className: 'plinko-stage',
      children: [board.element],
    });

    const root = createElement('div', {
      className: 'plinko-board-wrap',
      attrs: { 'data-game': 'plinko' },
      children: [stage, controls.element],
    });

    if (signal?.aborted) {
      this.unmount({ keepDom: false });
      return false;
    }

    container.replaceChildren(root);
    return true;
  },

  /**
   * @param {{ bid: number, risk_mode: string, rows: number }} bet
   */
  async playRound(bet) {
    if (!controls) return;
    gameState.bid = bet.bid;
    gameState.risk_mode = bet.risk_mode;
    gameState.rows = bet.rows;
    handleSettingsChange(gameState);
    await handlePlay();
  },

  /**
   * @param {{ keepDom?: boolean }} [options]
   */
  unmount(options = {}) {
    const { keepDom = false } = options;

    cancelPlinkoPathAnimation();
    isPlaying = false;
    controls?.setLoading(false);
    controls?.setDisabled(false);
    board?.setPlaying?.(false);
    board?.hideBall?.();

    if (keepDom && board?.element?.isConnected && configReady) {
      return;
    }

    const container = mountContainer;
    mountContainer = null;
    board = null;
    controls = null;
    configReady = false;

    if (container) {
      container.replaceChildren();
    }
  },
};
