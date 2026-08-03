/**
 * Plinko game — board generation + backend path visualization.
 */

import { createElement } from '../../utils/dom.js';
import { gameService } from '../../services/game.service.js';
import { balanceTypeService } from '../../services/balance-type.service.js';
import { balanceService } from '../../services/balance.service.js';
import { plinkoConfigService } from '../../services/plinko.config.service.js';
import { Toast, showGameWinToast } from '../../components/base/Toast.js';
import { triggerWinHaptic } from '../../app/telegram.js';
import { soundManager } from '../../services/sound.service.js';
import { settingsService } from '../../services/settings.service.js';
import { createPlinkoBoard } from './plinko.board.js';
import { createPlinkoControls } from './plinko.controls.js';
import { createPlinkoSettingsPanel } from './plinko.settings-panel.js';
import { animatePlinkoPath, cancelPlinkoPathAnimation } from './plinko.animation.js';
import { isPremiumMultiplier } from './plinko.geometry.js';
import {
  PLINKO_DEFAULT_STATE,
  getPlinkoBetLimits,
} from './plinko.constants.js';
import { formatUsd } from '../../utils/format.js';
import { t } from '../../i18n/index.js';
import { requireAuth } from '../../components/shared/GuestLoginModal.js';
import { isAuthenticated } from '../../services/auth-state.js';

/** @type {HTMLElement|null} */
let mountContainer = null;

/** @type {ReturnType<typeof createPlinkoBoard>|null} */
let board = null;

/** @type {ReturnType<typeof createPlinkoControls>|null} */
let controls = null;

/** @type {ReturnType<typeof createPlinkoSettingsPanel>|null} */
let settingsPanel = null;

let isPlaying = false;
let configReady = false;
let playGeneration = 0;

const gameState = { ...PLINKO_DEFAULT_STATE };

function createBatchIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint32Array(4);
  globalThis.crypto?.getRandomValues?.(bytes);
  return `plinko_${Date.now().toString(36)}_${[...bytes].map((value) => value.toString(36)).join('_')}`;
}

function handleSettingsChange(next) {
  const boardSettingsChanged = (
    gameState.risk_mode !== next.risk_mode
    || gameState.rows !== next.rows
  );
  gameState.bid = next.bid;
  gameState.risk_mode = next.risk_mode;
  gameState.rows = next.rows;
  gameState.count = next.count ?? gameState.count;

  if (boardSettingsChanged) {
    const mults = plinkoConfigService.getMultipliers(next.risk_mode, next.rows);
    board?.updateSettings(next.rows, next.risk_mode, mults);
  }
}

async function handleBatchPlay({ bid, risk_mode, rows, count }) {
  isPlaying = true;
  const generation = ++playGeneration;
  controls.setLoading(true);
  controls.setDisabled(true);
  soundManager.unlock();
  board.clearBasketHighlight();
  board.releaseAllBalls();
  let sequenceReady = false;

  const revealFinalBalance = () => {
    if (!sequenceReady) return;
    sequenceReady = false;
    balanceService.publishStaged();
  };

  try {
    const response = await gameService.playPlinkoBatch({
      bid,
      count,
      risk_mode,
      rows,
      idempotency_key: createBatchIdempotencyKey(),
      ...balanceTypeService.getGamePayloadExtras(),
    });
    sequenceReady = true;

    if (
      generation !== playGeneration
      || !isPlaying
      || !board
      || !controls
      || document.visibilityState === 'hidden'
    ) {
      revealFinalBalance();
      return;
    }

    const results = response.results;
    results.forEach((result) => {
      const path = result.path ?? result.bits;
      if (!Array.isArray(path) || path.length !== rows) {
        throw new Error(t('plinko.error.invalidPath'));
      }
    });

    const launchBall = async (result, index) => {
      if (index > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, index * 20));
      }
      if (generation !== playGeneration || !isPlaying || !board) return;

      const ball = board.acquireBall();
      try {
        const path = result.path ?? result.bits;
        const landing = await animatePlinkoPath({
          path,
          board,
          ball,
          exclusive: false,
          clearHighlight: false,
          onLand: () => {
            soundManager.play('plinkoBasket');
          },
        });
        if (
          landing.cancelled
          || generation !== playGeneration
          || !isPlaying
          || !board
        ) {
          return;
        }

        const multiplier = Number(result.multiplier) || 0;
        board.pulseBasket(landing.basketIndex, {
          premium: isPremiumMultiplier(multiplier),
        });
        balanceService.presentStagedCredit(
          Number(result.credited_amount) || 0,
          result.balance_type ?? response.balance_type,
        );
      } finally {
        board?.releaseBall(ball);
      }
    };

    await Promise.all(results.map(launchBall));
    if (generation !== playGeneration || !isPlaying || !board) {
      revealFinalBalance();
      return;
    }

    revealFinalBalance();
    const totalPayout = Number(response.total_payout) || 0;
    const totalBid = Number(response.total_bid) || 0;
    if (totalPayout >= totalBid) {
      triggerWinHaptic();
      showGameWinToast({
        gameName: t('plinko.batchResult', { count }),
        amount: totalPayout,
        duration: 4200,
      });
    } else {
      Toast({
        message: t('plinko.batchReceived', {
          count,
          usd: formatUsd(totalPayout),
        }),
        type: 'info',
        duration: 3600,
      });
    }
  } catch (error) {
    revealFinalBalance();
    board?.releaseAllBalls();
    board?.clearBasketHighlight();
    Toast({
      message: error.message || t('plinko.toast.failed'),
      type: 'error',
      duration: 3200,
    });
  } finally {
    if (generation === playGeneration) {
      isPlaying = false;
      controls?.setLoading(false);
      controls?.setDisabled(false);
      board?.releaseAllBalls();
    }
  }
}

async function handlePlay() {
  if (isPlaying || !controls || !board) return;

  if (!requireAuth({
    title: t('guest.modal.title'),
    message: t('guest.modal.message'),
  })) {
    return;
  }

  const {
    bid,
    risk_mode,
    rows,
    count = 1,
  } = controls.getState();

  const limits = getPlinkoBetLimits(risk_mode);
  if (
    !Number.isFinite(bid)
    || bid < limits.min
    || bid > limits.max
  ) {
    Toast({ message: t('game.validation.bet'), type: 'warning', duration: 2500 });
    return;
  }

  if (count > 1) {
    await handleBatchPlay({ bid, risk_mode, rows, count });
    return;
  }

  isPlaying = true;
  controls.setLoading(true);
  controls.setDisabled(true);
  soundManager.unlock();
  board.clearBasketHighlight();
  board.hideBall();

  let balanceReady = false;
  const revealBalance = () => {
    if (!balanceReady) return;
    balanceReady = false;
    balanceService.publishStaged();
  };

  try {
    const payload = {
      bid,
      risk_mode,
      rows,
      ...balanceTypeService.getGamePayloadExtras(),
    };

    const result = await gameService.playPlinko(payload);
    balanceReady = true;
    if (!isPlaying || !board || !controls || document.visibilityState === 'hidden') {
      revealBalance();
      return;
    }
    balanceService.presentConfirmedDebit(bid, result.balance_type);

    const path = result.path ?? result.bits;

    if (!Array.isArray(path) || path.length !== rows) {
      throw new Error(t('plinko.error.invalidPath'));
    }

    const { basketIndex } = await animatePlinkoPath({
      path,
      board,
      onLand: () => {
        soundManager.play('plinkoBasket');
      },
    });
    if (!isPlaying || !board) {
      revealBalance();
      return;
    }

    const multiplier = Number(result.multiplier) || 0;
    const payout = Number(result.payout) || 0;
    const premium = isPremiumMultiplier(multiplier);
    const mult = multiplier.toFixed(2);

    board.highlightBasket(basketIndex, { premium });
    board.hideBall();
    revealBalance();

    if (multiplier >= 1) {
      triggerWinHaptic();
      showGameWinToast({
        gameName: t('plinko.toast.winMeta', { mult }),
        amount: payout,
        duration: premium ? 4800 : 3800,
      });
    } else {
      Toast({
        message: t('plinko.toast.received', { mult, usd: formatUsd(payout) }),
        type: 'info',
        duration: 3200,
      });
    }
  } catch (error) {
    revealBalance();
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

    try {
      // Always refresh from backend so basket labels match live payout tables.
      await plinkoConfigService.load({ force: true });
      if (signal?.aborted) {
        this.unmount({ keepDom: false });
        return false;
      }
      configReady = true;
    } catch (error) {
      // Guests cannot load protected config — still show the playable UI shell.
      if (!isAuthenticated() || error?.status === 401) {
        configReady = true;
      } else {
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
    }

    if (mountContainer === container && board?.element?.isConnected && configReady) {
      const multipliers = plinkoConfigService.getMultipliers(
        gameState.risk_mode,
        gameState.rows,
      );
      board.setMultipliers(multipliers);
      return true;
    }

    this.unmount({ keepDom: false });
    mountContainer = container;

    const balances = balanceService.getBalances();
    const playable = Number(balances?.available ?? ((balances?.real || 0) + (balances?.bonus || 0)));
    if (playable > 0) {
      gameState.bid = Math.min(gameState.bid, playable) || gameState.bid;
    }

    const multipliers = plinkoConfigService.getMultipliers(gameState.risk_mode, gameState.rows);

    board = createPlinkoBoard({
      rows: gameState.rows,
      riskMode: gameState.risk_mode,
      multipliers,
    });

    settingsPanel?.destroy?.();
    settingsPanel = createPlinkoSettingsPanel({
      onOpenChange: (open) => {
        if (open) controls?.closeRowsMenu?.();
      },
    });

    void settingsService.load().then(() => {
      settingsPanel?.sync?.();
    }).catch(() => {
      // Defaults already applied locally.
    });

    void soundManager.preload();

    controls = createPlinkoControls({
      bid: gameState.bid,
      risk_mode: gameState.risk_mode,
      rows: gameState.rows,
      count: gameState.count,
      settingsButton: settingsPanel.button,
      onBeforeRowsOpen: () => settingsPanel?.close?.(),
      onChange: handleSettingsChange,
      onPlay: handlePlay,
    });

    board.element.appendChild(controls.gameControls);
    board.element.appendChild(settingsPanel.element);

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
   * @param {{ bid: number, risk_mode: string, rows: number, count?: number }} bet
   */
  async playRound(bet) {
    if (!controls) return;
    gameState.bid = bet.bid;
    gameState.risk_mode = bet.risk_mode;
    gameState.rows = bet.rows;
    gameState.count = bet.count ?? gameState.count;
    handleSettingsChange(gameState);
    await handlePlay();
  },

  /**
   * @param {{ keepDom?: boolean }} [options]
   */
  unmount(options = {}) {
    const { keepDom = false } = options;

    balanceService.publishStaged();
    playGeneration += 1;
    cancelPlinkoPathAnimation();
    isPlaying = false;
    controls?.setLoading(false);
    controls?.setDisabled(false);
    board?.setPlaying?.(false);
    board?.releaseAllBalls?.();

    if (keepDom && board?.element?.isConnected && configReady) {
      return;
    }

    const container = mountContainer;
    mountContainer = null;
    board = null;
    settingsPanel?.destroy?.();
    settingsPanel = null;
    controls?.destroy?.();
    controls = null;
    configReady = false;

    if (container) {
      container.replaceChildren();
    }
  },
};
