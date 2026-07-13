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
import { animatePlinkoPath } from './plinko.animation.js';
import { isPremiumMultiplier } from './plinko.geometry.js';
import { PLINKO_DEFAULT_STATE } from './plinko.constants.js';
import { formatCryptoAmount } from '../../utils/format.js';

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
    Toast({ message: 'Enter a valid bet amount', type: 'warning', duration: 2500 });
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
    const path = result.path ?? result.bits;

    if (!Array.isArray(path) || path.length !== rows) {
      throw new Error('Backend did not return a valid ball path');
    }

    const { basketIndex } = await animatePlinkoPath({ path, board });

    const multiplier = Number(result.multiplier) || 0;
    const payout = Number(result.payout) || 0;
    const profit = payout - bid;
    const premium = isPremiumMultiplier(multiplier);

    board.highlightBasket(basketIndex, { premium });
    board.hideBall();

    if (profit > 0) {
      showGameWinToast({
        gameName: `Plinko · ${multiplier.toFixed(2)}×`,
        amount: profit,
        duration: premium ? 4800 : 3800,
      });
    } else {
      Toast({
        message: `${multiplier.toFixed(2)}× — ${formatCryptoAmount(payout, { symbol: 'USDT' })} returned`,
        type: 'info',
        duration: 3200,
      });
    }
  } catch (error) {
    board.hideBall();
    board.clearBasketHighlight();
    Toast({
      message: error.message || 'Plinko round failed',
      type: 'error',
      duration: 3200,
    });
  } finally {
    isPlaying = false;
    controls.setLoading(false);
    controls.setDisabled(false);
  }
}

export const PlinkoGame = {
  async mount(container) {
    if (mountContainer === container && board?.element?.isConnected && configReady) return;

    mountContainer = container;

    try {
      await plinkoConfigService.load();
      configReady = true;
    } catch (error) {
      configReady = false;
      container.replaceChildren(
        createElement('p', {
          className: 'plinko-board-wrap__error',
          text: 'Unable to load Plinko configuration from server.',
        }),
      );
      Toast({
        message: error.message || 'Failed to load Plinko config',
        type: 'error',
        duration: 4000,
      });
      return;
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

    container.replaceChildren(root);
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

  unmount() {
    mountContainer = null;
    board = null;
    controls = null;
    isPlaying = false;
    configReady = false;
  },
};
