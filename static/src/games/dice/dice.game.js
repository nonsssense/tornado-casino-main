/**
 * Dice game — immersive game experience integrated with Tornado services.
 */

import { createElement } from '../../utils/dom.js';
import { gameService } from '../../services/game.service.js';
import { balanceTypeService } from '../../services/balance-type.service.js';
import { balanceService } from '../../services/balance.service.js';
import { Toast, showGameWinToast } from '../../components/base/Toast.js';
import { createDiceWheel } from './dice.wheel.js';
import { createDiceControls } from './dice.controls.js';
import { animateDiceRoll, cancelDiceRollAnimation } from './dice.animation.js';
import { DICE_BET_LIMITS } from './dice.constants.js';
import { t } from '../../i18n/index.js';

/** @type {HTMLElement|null} */
let mountContainer = null;

/** @type {HTMLElement|null} */
let boardMount = null;

/** @type {ReturnType<typeof createDiceWheel>|null} */
let wheel = null;

/** @type {ReturnType<typeof createDiceControls>|null} */
let controls = null;

let isPlaying = false;

const gameState = {
  limit: 50,
  over: true,
  bid: DICE_BET_LIMITS.min,
};

function handleSettingsChange(next) {
  gameState.limit = next.limit;
  gameState.over = next.over;
  gameState.bid = next.bid;
  wheel?.updateSettings(next.limit, next.over);
}

async function handlePlay() {
  if (isPlaying || !controls || !wheel) return;

  const { limit, over, bid } = controls.getState();

  if (!Number.isFinite(bid) || bid <= 0) {
    Toast({ message: t('game.validation.bet'), type: 'warning', duration: 2500 });
    return;
  }

  isPlaying = true;
  controls.setLoading(true);
  wheel.setRolling();

  try {
    const payload = {
      bid,
      limit,
      over,
      ...balanceTypeService.getGamePayloadExtras(),
    };

    const result = await gameService.playDice(payload);
    if (!isPlaying || !wheel || !controls) return;

    const roll = typeof result.roll === 'number' ? result.roll : null;

    if (roll !== null) {
      await animateDiceRoll(roll, wheel);
      if (!isPlaying || !wheel) return;
      wheel.showResult(roll);
    } else {
      wheel.showResult('?');
    }

    const won = Boolean(result.result_of_game ?? result.result);

    if (won) {
      showGameWinToast({
        gameName: t('games.dice.name'),
        amount: Number(result.payout) || 0,
        duration: 4200,
      });
    } else {
      Toast({
        message: roll !== null
          ? t('dice.toast.loseWithRoll', { roll })
          : t('dice.toast.lose'),
        type: 'info',
        duration: 2800,
      });
    }
  } catch (error) {
    if (wheel) {
      wheel.resetResult();
    }
    Toast({
      message: error.message || t('dice.toast.failed'),
      type: 'error',
      duration: 3200,
    });
  } finally {
    isPlaying = false;
    controls?.setLoading(false);
    wheel?.setIdle();
  }
}

export const DiceGame = {
  /**
   * @param {HTMLElement} container
   */
  mount(container) {
    if (mountContainer === container && boardMount?.isConnected && wheel && controls) {
      return;
    }

    this.unmount({ keepDom: false });
    mountContainer = container;
    wheel = createDiceWheel({ limit: gameState.limit, over: gameState.over });
    controls = createDiceControls({
      limit: gameState.limit,
      over: gameState.over,
      bid: gameState.bid,
      onChange: handleSettingsChange,
      onPlay: handlePlay,
    });

    const balances = balanceService.getBalances();
    if (balances?.real) {
      gameState.bid = Math.min(gameState.bid, balances.real) || gameState.bid;
    }

    const stage = createElement('div', {
      className: 'dice-stage',
      children: [
        createElement('div', {
          className: 'dice-stage__glow',
          attrs: { 'aria-hidden': 'true' },
        }),
        createElement('div', {
          className: 'dice-stage__wheel-wrap',
          children: [wheel.element],
        }),
        controls.sliderPanel,
      ],
    });

    boardMount = createElement('div', {
      className: 'dice-board',
      attrs: { 'data-game': 'dice' },
      children: [
        createElement('div', {
          className: 'dice-page__banner-slot',
          attrs: { 'aria-hidden': 'true' },
        }),
        stage,
        controls.element,
      ],
    });

    container.replaceChildren(boardMount);
  },

  /**
   * @param {{ bid: number, limit: number, over: boolean }} bet
   */
  async playRound(bet) {
    if (!controls) return;

    gameState.bid = bet.bid;
    gameState.limit = bet.limit;
    gameState.over = bet.over;
    handleSettingsChange(gameState);
    await handlePlay();
  },

  /**
   * @param {{ keepDom?: boolean }} [options]
   */
  unmount(options = {}) {
    const { keepDom = false } = options;

    cancelDiceRollAnimation();
    isPlaying = false;
    controls?.setLoading(false);
    wheel?.setIdle?.();

    if (keepDom && boardMount?.isConnected) {
      // Keep board for instant return; cancel live animation only.
      return;
    }

    const container = mountContainer;
    mountContainer = null;
    boardMount = null;
    wheel = null;
    controls = null;

    if (container) {
      container.replaceChildren();
    }
  },
};
