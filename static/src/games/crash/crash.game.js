/**
 * Crash (Aviator) game — connected to backend REST + WebSocket.
 * Flight animation is visual-only; multiplier / networking unchanged.
 */

import { createElement } from '../../utils/dom.js';
import { Toast, showGameWinToast } from '../../components/base/Toast.js';
import { crashService, getLiveMultiplier } from '../../services/crash.service.js';
import { createCrashHistory } from './crash.history.js';
import { createAnimationContainer } from './crash.animation-container.js';
import { createBetPanel } from './crash.bet-panel.js';
import { createLiveBets } from './crash.live-bets.js';
import { CRASH_BET_LIMITS, CRASH_HISTORY_LIMIT } from './crash.constants.js';

/** @type {HTMLElement|null} */
let mountContainer = null;

/** @type {HTMLElement|null} */
let boardMount = null;

/** @type {ReturnType<typeof createAnimationContainer>|null} */
let animationContainer = null;

/** @type {ReturnType<typeof createCrashHistory>|null} */
let history = null;

/** @type {ReturnType<typeof createBetPanel>|null} */
let panelA = null;

/** @type {ReturnType<typeof createBetPanel>|null} */
let panelB = null;

/** @type {ReturnType<typeof createLiveBets>|null} */
let liveBets = null;

/** @type {number} */
let multiplierRaf = 0;

/** @type {number} */
let bettingTimer = 0;

/** @type {string|null} */
let activePanelId = null;

/** @type {number|null} */
let myUserId = null;

/** @type {boolean} */
let actionInFlight = false;

const runtime = {
  state: 'BETTING',
  roundId: 0,
  startTime: null,
  crashMultiplier: null,
  timeLeft: null,
  bettingEndsAt: null,
  myBet: null,
  /** Track cashed-out rows that left active_bets on the server */
  cashedOutIds: new Set(),
};

function getPanel(panelId) {
  return panelId === 'b' ? panelB : panelA;
}

function mapActiveBets(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const id = String(row.user_id ?? row.id);
    return {
      id,
      username: row.username || `Player ${id}`,
      amount: Number(row.amount ?? row.bet ?? 0),
      cashedOut: runtime.cashedOutIds.has(id),
    };
  });
}

function stopMultiplierLoop() {
  if (multiplierRaf) {
    cancelAnimationFrame(multiplierRaf);
    multiplierRaf = 0;
  }
}

function stopBettingCountdown() {
  if (bettingTimer) {
    window.clearInterval(bettingTimer);
    bettingTimer = 0;
  }
}

function renderBettingStatus() {
  let seconds = 0;
  if (runtime.bettingEndsAt != null) {
    seconds = Math.max(0, Math.ceil(runtime.bettingEndsAt - Date.now() / 1000));
  } else {
    seconds = Math.max(0, Math.ceil(Number(runtime.timeLeft) || 0));
  }

  animationContainer?.setPlaceholder(
    seconds > 0 ? `Betting · ${seconds}s` : 'Place your bets',
  );
}

function startBettingCountdown() {
  stopBettingCountdown();
  renderBettingStatus();
  bettingTimer = window.setInterval(() => {
    if (runtime.state !== 'BETTING') {
      stopBettingCountdown();
      return;
    }
    renderBettingStatus();
  }, 250);
}

function updateCashoutPreviews(multiplier) {
  if (!runtime.myBet || runtime.state !== 'FLYING') return;

  const amount = Number(runtime.myBet.amount) || 0;
  const payout = Math.round(amount * multiplier * 100) / 100;
  const panel = getPanel(activePanelId || 'a');
  panel?.setMode('cashout', { payout, multiplier });
}

function startMultiplierLoop() {
  stopMultiplierLoop();
  stopBettingCountdown();

  const tick = () => {
    if (!animationContainer || runtime.state !== 'FLYING' || runtime.startTime == null) {
      return;
    }

    const multiplier = getLiveMultiplier(runtime.startTime);
    animationContainer.setMultiplier(multiplier);
    updateCashoutPreviews(multiplier);
    multiplierRaf = requestAnimationFrame(tick);
  };

  tick();
}

function setBettingUi() {
  stopMultiplierLoop();
  startBettingCountdown();

  if (runtime.myBet) {
    const panel = getPanel(activePanelId || 'a');
    panel?.setMode('bet');
    panel?.setDisabled(true);
    if (activePanelId !== 'b') panelB?.setDisabled(true);
    if (activePanelId !== 'a') panelA?.setDisabled(true);
  } else {
    panelA?.setMode('bet');
    panelB?.setMode('bet');
    panelA?.setDisabled(false);
    panelB?.setDisabled(false);
  }
}

function setFlyingUi() {
  stopBettingCountdown();

  if (runtime.myBet) {
    const panel = getPanel(activePanelId || 'a');
    const other = activePanelId === 'b' ? panelA : panelB;
    panel?.setDisabled(false);
    other?.setDisabled(true);
    updateCashoutPreviews(getLiveMultiplier(runtime.startTime));
  } else {
    panelA?.setMode('bet');
    panelB?.setMode('bet');
    panelA?.setDisabled(true);
    panelB?.setDisabled(true);
  }

  startMultiplierLoop();
}

function setCrashedUi(crashMultiplier) {
  stopMultiplierLoop();
  stopBettingCountdown();
  if (crashMultiplier != null) {
    animationContainer?.setCrashed(crashMultiplier);
  } else {
    animationContainer?.setPlaceholder('Round ended');
  }
  panelA?.setMode('bet');
  panelB?.setMode('bet');
  panelA?.setDisabled(true);
  panelB?.setDisabled(true);
}

function applyRoundPhase() {
  if (runtime.state === 'BETTING') {
    setBettingUi();
  } else if (runtime.state === 'FLYING') {
    setFlyingUi();
  } else if (runtime.state === 'CRASHED') {
    setCrashedUi(runtime.crashMultiplier);
  }
}

/**
 * @param {object} state
 */
function applyServerState(state) {
  if (!state) return;

  runtime.state = state.state || runtime.state;
  runtime.roundId = state.round_id ?? runtime.roundId;
  runtime.startTime = state.start_time ?? null;
  runtime.crashMultiplier = state.crash_multiplier ?? null;
  runtime.timeLeft = state.time_left ?? null;
  runtime.myBet = state.my_bet ?? null;
  runtime.bettingEndsAt =
    runtime.state === 'BETTING' && runtime.timeLeft != null
      ? Date.now() / 1000 + Number(runtime.timeLeft)
      : null;

  if (runtime.myBet && !activePanelId) {
    activePanelId = 'a';
  }

  if (Array.isArray(state.active_bets)) {
    liveBets?.setBets(mapActiveBets(state.active_bets));
  }

  applyRoundPhase();
}

async function refreshHistory() {
  try {
    const items = await crashService.getHistory(CRASH_HISTORY_LIMIT);
    history?.setItems(items);
  } catch {
    // History is optional — never block the Crash page.
    history?.setItems([]);
  }
}

/**
 * @param {object} payload
 */
async function handleSocketEvent(payload) {
  const event = payload?.event;
  if (!event) return;

  if (event === 'STATE_SYNC') {
    applyServerState(payload);
    return;
  }

  if (event === 'ROUND_OPEN') {
    runtime.state = 'BETTING';
    runtime.roundId = payload.round_id ?? runtime.roundId;
    runtime.timeLeft = payload.time_left ?? 0;
    runtime.bettingEndsAt = Date.now() / 1000 + Number(runtime.timeLeft || 0);
    runtime.startTime = null;
    runtime.crashMultiplier = null;
    runtime.myBet = null;
    runtime.cashedOutIds.clear();
    activePanelId = null;
    liveBets?.clear();
    applyRoundPhase();
    return;
  }

  if (event === 'ROUND_START') {
    runtime.state = 'FLYING';
    runtime.roundId = payload.round_id ?? runtime.roundId;
    runtime.startTime = payload.start_time ?? null;
    runtime.timeLeft = null;
    applyRoundPhase();
    return;
  }

  if (event === 'PLAYER_BET') {
    const id = String(payload.user_id);
    liveBets?.addBet({
      id,
      username: payload.username || `Player ${id}`,
      amount: Number(payload.bet ?? payload.amount ?? 0),
      cashedOut: false,
    });
    return;
  }

  if (event === 'PLAYER_CASHOUT') {
    const id = String(payload.user_id);
    runtime.cashedOutIds.add(id);
    liveBets?.markCashedOut(id);

    if (myUserId != null && Number(payload.user_id) === Number(myUserId)) {
      runtime.myBet = null;
      activePanelId = null;
      panelA?.setMode('bet');
      panelB?.setMode('bet');
      panelA?.setDisabled(true);
      panelB?.setDisabled(true);
    }
    return;
  }

  if (event === 'ROUND_END') {
    runtime.state = 'CRASHED';
    runtime.crashMultiplier = payload.crash_multiplier ?? null;
    runtime.myBet = null;
    activePanelId = null;
    setCrashedUi(runtime.crashMultiplier);
    await refreshHistory();
  }
}

/**
 * @param {'a'|'b'} panelId
 */
async function handlePanelAction(panelId) {
  const panel = getPanel(panelId);
  if (!panel || actionInFlight) return;

  if (panel.getMode() === 'bet') {
    if (runtime.state !== 'BETTING') {
      Toast({ message: 'Bets are closed', type: 'warning', duration: 2200 });
      return;
    }
    if (runtime.myBet) {
      Toast({ message: 'You already have an active bet', type: 'warning', duration: 2200 });
      return;
    }

    const amount = panel.getAmount();
    if (!Number.isFinite(amount) || amount <= 0) {
      Toast({ message: 'Enter a valid bet amount', type: 'warning', duration: 2200 });
      return;
    }

    actionInFlight = true;
    panel.setDisabled(true);

    try {
      const result = await crashService.placeBet(amount);
      activePanelId = panelId;
      if (result.user_id != null) {
        myUserId = Number(result.user_id);
      }
      runtime.myBet = {
        amount: Number(result.amount ?? amount),
        bet_id: result.bet_id,
      };

      // Live Bets row comes from PLAYER_BET / state only — avoid optimistic dual-write.
      applyRoundPhase();
      Toast({ message: 'Bet placed', type: 'success', duration: 1800 });
    } catch (error) {
      panel.setDisabled(false);
      Toast({
        message: error?.message || 'Failed to place bet',
        type: 'error',
        duration: 2800,
      });
    } finally {
      actionInFlight = false;
    }
    return;
  }

  // cashout mode
  if (runtime.state !== 'FLYING' || !runtime.myBet) {
    Toast({ message: 'Cash out is not available', type: 'warning', duration: 2200 });
    return;
  }

  actionInFlight = true;
  panel.setDisabled(true);

  try {
    const result = await crashService.cashout();
    const userId = result.user_id ?? myUserId;
    if (userId != null) {
      const id = String(userId);
      myUserId = Number(userId);
      runtime.cashedOutIds.add(id);
      liveBets?.markCashedOut(id);
    }

    runtime.myBet = null;
    activePanelId = null;
    panel.setMode('bet');
    panel.setDisabled(true);
    if (panelId === 'a') panelB?.setDisabled(true);
    else panelA?.setDisabled(true);

    showGameWinToast({
      gameName: 'Crash',
      amount: Number(result.profit) || 0,
      duration: 3600,
    });
  } catch (error) {
    panel.setDisabled(false);
    Toast({
      message: error?.message || 'Failed to cash out',
      type: 'error',
      duration: 2800,
    });
  } finally {
    actionInFlight = false;
  }
}

async function bootstrap() {
  // 1) Mandatory state sync
  try {
    const state = await crashService.getState();
    applyServerState(state);
  } catch (error) {
    animationContainer?.setPlaceholder('Unable to sync Crash state');
    Toast({
      message: error?.message || 'Failed to load Crash',
      type: 'error',
      duration: 3500,
    });
  }

  // 2) Live updates
  crashService.connect({
    onEvent: (payload) => {
      handleSocketEvent(payload);
    },
  });

  // 3) Optional history — never blocks startup
  void refreshHistory();
}

export const CrashGame = {
  /**
   * @param {HTMLElement} container
   */
  mount(container) {
    if (mountContainer === container && boardMount?.isConnected) {
      return;
    }

    this.unmount();
    mountContainer = container;

    history = createCrashHistory({ items: [] });
    animationContainer = createAnimationContainer();

    panelA = createBetPanel({
      panelId: 'a',
      amount: CRASH_BET_LIMITS.default,
      mode: 'bet',
      onAction: () => {
        handlePanelAction('a');
      },
    });

    panelB = createBetPanel({
      panelId: 'b',
      amount: CRASH_BET_LIMITS.default,
      mode: 'bet',
      onAction: () => {
        handlePanelAction('b');
      },
    });

    liveBets = createLiveBets({ bets: [] });

    boardMount = createElement('div', {
      className: 'crash-board',
      attrs: { 'data-game': 'crash' },
      children: [
        history.element,
        animationContainer.element,
        createElement('div', {
          className: 'crash-bets',
          attrs: { 'aria-label': 'Betting panels' },
          children: [panelA.element, panelB.element],
        }),
        liveBets.element,
      ],
    });

    container.replaceChildren(boardMount);
    bootstrap();
  },

  /**
   * Mount point for the future animation engine (canvas / SVG / WebGL).
   * @returns {HTMLElement|null}
   */
  getAnimationMount() {
    return animationContainer?.mountPoint ?? null;
  },

  /**
   * @returns {{ a: ReturnType<typeof createBetPanel>|null, b: ReturnType<typeof createBetPanel>|null }}
   */
  getPanels() {
    return { a: panelA, b: panelB };
  },

  /**
   * @returns {ReturnType<typeof createLiveBets>|null}
   */
  getLiveBets() {
    return liveBets;
  },

  /**
   * @param {number[]} items
   */
  setHistory(items) {
    history?.setItems(items);
  },

  unmount() {
    stopMultiplierLoop();
    stopBettingCountdown();
    crashService.disconnect();
    animationContainer?.destroy?.();
    mountContainer = null;
    boardMount = null;
    animationContainer = null;
    history = null;
    panelA = null;
    panelB = null;
    liveBets = null;
    activePanelId = null;
    myUserId = null;
    actionInFlight = false;
    runtime.myBet = null;
    runtime.bettingEndsAt = null;
    runtime.cashedOutIds.clear();
  },
};