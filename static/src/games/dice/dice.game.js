/**
 * Dice game — immersive game experience integrated with Tornado services.
 */

import { createElement } from '../../utils/dom.js';
import { gameService } from '../../services/game.service.js';
import { balanceTypeService } from '../../services/balance-type.service.js';
import { balanceService } from '../../services/balance.service.js';
import { settingsService } from '../../services/settings.service.js';
import { Toast, showGameWinToast } from '../../components/base/Toast.js';
import { triggerWinHaptic } from '../../app/telegram.js';
import { soundManager } from '../../services/sound.service.js';
import { createGameSettingsPanel } from '../shared/game-settings-panel.js';
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

/** @type {ReturnType<typeof createGameSettingsPanel>|null} */
let settingsPanel = null;

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

  if (
    !Number.isFinite(bid)
    || bid < DICE_BET_LIMITS.min
    || bid > DICE_BET_LIMITS.max
  ) {
    Toast({ message: t('game.validation.bet'), type: 'warning', duration: 2500 });
    return;
  }

  isPlaying = true;
  controls.setLoading(true);
  if (settingsPanel?.button) settingsPanel.button.disabled = true;
  settingsPanel?.close?.();
  soundManager.unlock();
  wheel.setRolling();

  let balanceReady = false;
  const revealBalance = () => {
    if (!balanceReady) return;
    balanceReady = false;
    balanceService.publishStaged();
  };

  try {
    const payload = {
      bid,
      limit,
      over,
      ...balanceTypeService.getGamePayloadExtras(),
    };

    const result = await gameService.playDice(payload);
    balanceReady = true;
    if (!isPlaying || !wheel || !controls || document.visibilityState === 'hidden') {
      revealBalance();
      return;
    }
    balanceService.presentConfirmedDebit(bid, result.balance_type);

    const roll = typeof result.roll === 'number' ? result.roll : null;

    if (roll !== null) {
      await animateDiceRoll(roll, wheel);
      if (!isPlaying || !wheel) {
        revealBalance();
        return;
      }
      wheel.showResult(roll);
      wheel.highlightSector(roll >= limit ? 'over' : 'under');
    } else {
      wheel.showResult('?');
    }

    const won = Boolean(result.result_of_game ?? result.result);

    // Win SFX + haptic + toast fire together with the finalized result UI.
    // Do not wait for balance publish / other DOM updates first.
    if (won) {
      soundManager.play('diceWin');
      triggerWinHaptic();
      showGameWinToast({
        gameName: t('games.dice.name'),
        amount: Number(result.gross_payout) || 0,
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

    revealBalance();
  } catch (error) {
    revealBalance();
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
    if (settingsPanel?.button) settingsPanel.button.disabled = false;
    wheel?.setIdle();
  }
}

export const DiceGame = {
  /**
   * @param {HTMLElement} container
   */
  mount(container) {
    if (mountContainer === container && boardMount?.isConnected && wheel && controls && settingsPanel) {
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

    settingsPanel?.destroy?.();
    settingsPanel = createGameSettingsPanel({
      id: 'dice-game-settings-panel',
    });

    void settingsService.load().then(() => {
      settingsPanel?.sync?.();
    }).catch(() => {
      // Defaults already applied locally.
    });

    void soundManager.preload();

    const balances = balanceService.getBalances();
    const playable = Number(balances?.available ?? ((balances?.real || 0) + (balances?.bonus || 0)));
    if (playable > 0) {
      gameState.bid = Math.min(gameState.bid, playable) || gameState.bid;
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
        settingsPanel.button,
        settingsPanel.element,
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

    balanceService.publishStaged();
    cancelDiceRollAnimation();
    isPlaying = false;
    controls?.setLoading(false);
    if (settingsPanel?.button) settingsPanel.button.disabled = false;
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
    settingsPanel?.destroy?.();
    settingsPanel = null;

    if (container) {
      container.replaceChildren();
    }
  },
};
