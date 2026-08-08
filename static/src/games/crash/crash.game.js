/**
 * Crash (Aviator) game — connected to backend REST + WebSocket.
 * Flight canvas is a deterministic renderer of the live multiplier timeline.
 */

import { createElement } from '../../utils/dom.js';
import { Toast, showGameWinToast } from '../../components/base/Toast.js';
import { triggerWinHaptic } from '../../app/telegram.js';
import { crashService, getLiveMultiplier } from '../../services/crash.service.js';
import { isAuthenticated } from '../../services/auth-state.js';
import { requireAuth } from '../../components/shared/GuestLoginModal.js';
import { createCrashHistory } from './crash.history.js';
import { createAnimationContainer } from './crash.animation-container.js';
import { createBetPanel } from './crash.bet-panel.js';
import { createLiveBets } from './crash.live-bets.js';
import { CRASH_BET_LIMITS, CRASH_HISTORY_LIMIT, CRASH_BETTING_DURATION_SEC } from './crash.constants.js';
import { t } from '../../i18n/index.js';

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

const PANEL_IDS = ['a', 'b'];
const PANEL_ASSIGNMENTS_STORAGE_KEY = 'crash.panel-assignments.v1';

/**
 * @typedef {{ amount: number, bet_id: number|string }} PanelBet
 * @typedef {{
 *   bet: PanelBet|null,
 *   pending: boolean,
 *   status: 'ready'|'betting'|'waiting'|'active'|'cashing_out'|'cashed_out'|'lost',
 *   payout: number,
 *   multiplier: number,
 *   result: object|null,
 * }} PanelRuntime
 */

/** @returns {PanelRuntime} */
function createPanelRuntime() {
  return {
    bet: null,
    pending: false,
    status: 'ready',
    payout: 0,
    multiplier: 1,
    result: null,
  };
}

const runtime = {
  state: 'BETTING',
  roundId: 0,
  startTime: null,
  crashMultiplier: null,
  timeLeft: null,
  bettingEndsAt: null,
  /** Fixed duration for the betting progress bar (set on ROUND_OPEN). */
  bettingDurationSec: CRASH_BETTING_DURATION_SEC,
  /** True while WS is down / awaiting authoritative rebuild. */
  reconnecting: false,
  /** Drop live events until HTTP or STATE_SYNC rebuild completes. */
  awaitingSync: false,
  /** Server says an open personal bet may still cash out. */
  canCashout: false,
  panels: {
    a: createPanelRuntime(),
    b: createPanelRuntime(),
  },
  /** Track cashed-out live rows that left active_bets on the server. */
  cashedOutBetIds: new Set(),
};

/** @type {ReturnType<typeof buildSocketHandlers>|null} */
let socketHandlers = null;

/** @type {AbortSignal|null} */
let activeSignal = null;

function getPanel(panelId) {
  return panelId === 'b' ? panelB : panelA;
}

/**
 * @param {'a'|'b'} panelId
 * @returns {number}
 */
function getOtherCommittedBetTotal(panelId) {
  return PANEL_IDS.reduce((sum, id) => {
    if (id === panelId) return sum;
    const bet = getPanelRuntime(id).bet;
    const amount = Number(bet?.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

/**
 * Keep each panel's local max in sync with per-slot + combined Crash caps.
 */
function syncCrashBetLimits() {
  PANEL_IDS.forEach((panelId) => {
    const panel = getPanel(panelId);
    if (!panel?.setAmountMax) return;
    const remaining = Math.round(
      (CRASH_BET_LIMITS.totalMax - getOtherCommittedBetTotal(panelId)) * 100,
    ) / 100;
    const maxAllowed = Math.min(CRASH_BET_LIMITS.max, Math.max(0, remaining));
    panel.setAmountMax(maxAllowed);
  });
}

/**
 * @param {'a'|'b'} panelId
 * @returns {PanelRuntime}
 */
function getPanelRuntime(panelId) {
  return panelId === 'b' ? runtime.panels.b : runtime.panels.a;
}

function getPlayerDisplayName(displayName, userId) {
  const normalizedName = String(displayName ?? '').trim();
  if (normalizedName) return normalizedName;

  const digits = String(userId ?? 0).replace(/\D/g, '');
  const shortId = (digits || '0').slice(-4).padStart(4, '0');
  return `Player ${shortId}`;
}

/**
 * @param {object} [payload]
 */
function syncActivityFromPayload(payload = {}) {
  const hud = animationContainer?.activityHud;
  if (!hud) return;

  if (payload.online != null) {
    hud.setOnline(payload.online);
  }

  if (payload.active_bet_count != null) {
    hud.setActiveBets(payload.active_bet_count);
  } else if (Array.isArray(payload.active_bets)) {
    hud.setActiveBets(payload.active_bets.length);
  }
}

function mapActiveBets(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.bet_id != null)
    .map((row) => {
      const id = String(row.bet_id);
      const userId = row.user_id ?? row.id;
      return {
        id,
        username: getPlayerDisplayName(row.username, userId),
        amount: Number(row.amount ?? row.bet ?? 0),
        cashedOut: runtime.cashedOutBetIds.has(id),
      };
    });
}

function readPanelAssignments(roundId) {
  try {
    const stored = JSON.parse(localStorage.getItem(PANEL_ASSIGNMENTS_STORAGE_KEY) || 'null');
    if (String(stored?.roundId) !== String(roundId)) return {};
    return stored?.assignments && typeof stored.assignments === 'object'
      ? stored.assignments
      : {};
  } catch {
    return {};
  }
}

function persistPanelAssignments() {
  const assignments = {};
  PANEL_IDS.forEach((panelId) => {
    const betId = getPanelRuntime(panelId).bet?.bet_id;
    if (betId != null) assignments[panelId] = betId;
  });

  try {
    localStorage.setItem(
      PANEL_ASSIGNMENTS_STORAGE_KEY,
      JSON.stringify({ roundId: runtime.roundId, assignments }),
    );
  } catch {
    // Storage is an optional reconnect aid; runtime behavior remains functional.
  }
}

function clearPanelAssignments() {
  try {
    localStorage.removeItem(PANEL_ASSIGNMENTS_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

function findPanelIdByBetId(betId) {
  if (betId == null) return null;
  const normalized = String(betId);
  return PANEL_IDS.find(
    (panelId) => String(getPanelRuntime(panelId).bet?.bet_id) === normalized,
  ) ?? null;
}

function normalizePersonalBets(state, allowStoredFallback = false) {
  const byId = new Map();
  const addBet = (bet) => {
    if (bet?.bet_id == null) return;
    byId.set(String(bet.bet_id), {
      amount: Number(bet.amount ?? bet.bet ?? 0),
      bet_id: bet.bet_id,
    });
  };

  (Array.isArray(state?.my_bets) ? state.my_bets : []).forEach(addBet);

  if (allowStoredFallback) {
    // Anonymous WS / empty my_bets: recover from storage ∩ public active book,
    // and from still-open local panels for the same round.
    const stored = readPanelAssignments(state?.round_id ?? runtime.roundId);
    const storedIds = new Set(Object.values(stored).map(String));
    PANEL_IDS.forEach((panelId) => {
      const localBet = getPanelRuntime(panelId).bet;
      if (localBet?.bet_id != null) storedIds.add(String(localBet.bet_id));
    });
    (Array.isArray(state?.active_bets) ? state.active_bets : []).forEach((bet) => {
      if (bet?.bet_id != null && storedIds.has(String(bet.bet_id))) addBet(bet);
    });
  }

  return [...byId.values()].sort((left, right) => Number(left.bet_id) - Number(right.bet_id));
}

/**
 * @param {object} state
 * @param {Map<string, object>} remainingActive
 */
function applySettledPanels(state, remainingActive) {
  const settled = Array.isArray(state?.my_settled) ? state.my_settled : [];
  if (!settled.length) return;

  const assignments = readPanelAssignments(state?.round_id ?? runtime.roundId);

  settled.forEach((row) => {
    if (row?.bet_id == null) return;
    const id = String(row.bet_id);
    remainingActive.delete(id);

    if (row.status === 'cashed_out') {
      runtime.cashedOutBetIds.add(id);
      liveBets?.markCashedOut(id);
    }

    let panelId = findPanelIdByBetId(row.bet_id);
    if (!panelId) {
      panelId = PANEL_IDS.find((key) => String(assignments[key]) === id) ?? null;
    }
    if (!panelId) {
      panelId = PANEL_IDS.find((idKey) => {
        const panelState = getPanelRuntime(idKey);
        return !panelState.bet
          && panelState.status !== 'cashed_out'
          && panelState.status !== 'lost';
      }) ?? null;
    }
    if (!panelId) return;

    const panelState = getPanelRuntime(panelId);
    panelState.bet = null;
    panelState.pending = false;
    if (row.status === 'cashed_out') {
      panelState.status = 'cashed_out';
      panelState.result = {
        type: 'win',
        profit: Number(row.profit) || 0,
        multiplier: Number(row.multiplier) || panelState.multiplier,
        payout: Number(row.payout) || 0,
      };
      panelState.payout = Number(row.payout) || 0;
      panelState.multiplier = Number(row.multiplier) || panelState.multiplier;
    } else if (row.status === 'lost') {
      panelState.status = 'lost';
      panelState.result = {
        type: 'lose',
        amount: Number(row.amount) || 0,
      };
    }
  });
}

/**
 * @param {object} state
 * @param {{
 *   allowStoredFallback?: boolean,
 *   preservePersonalIfEmpty?: boolean,
 *   trustEmptyMyBets?: boolean,
 * }} [options]
 */
function reconcilePanelBets(state, options = {}) {
  const allowStoredFallback = Boolean(options.allowStoredFallback);
  const preservePersonalIfEmpty = Boolean(options.preservePersonalIfEmpty);
  const trustEmptyMyBets = Boolean(options.trustEmptyMyBets);

  const myBetsEmpty = !Array.isArray(state?.my_bets) || state.my_bets.length === 0;
  let bets = normalizePersonalBets(
    state,
    allowStoredFallback || (preservePersonalIfEmpty && myBetsEmpty),
  );

  const sameRound = String(state?.round_id ?? '') === String(runtime.roundId ?? '');
  const activeIds = new Set(
    (Array.isArray(state?.active_bets) ? state.active_bets : [])
      .map((bet) => String(bet.bet_id)),
  );

  // Auth gap on reconnect: never wipe open panels for the same round while the
  // bet is still in the public book, even if my_bets arrived empty.
  if (
    preservePersonalIfEmpty
    && myBetsEmpty
    && !trustEmptyMyBets
    && sameRound
    && bets.length === 0
  ) {
    const preserved = [];
    PANEL_IDS.forEach((panelId) => {
      const localBet = getPanelRuntime(panelId).bet;
      if (localBet?.bet_id != null && activeIds.has(String(localBet.bet_id))) {
        preserved.push(localBet);
      }
    });
    if (preserved.length) {
      bets = preserved;
    } else {
      const hasLocalOpen = PANEL_IDS.some((panelId) => getPanelRuntime(panelId).bet);
      const phaseOpen = state?.state === 'FLYING' || state?.state === 'BETTING';
      if (hasLocalOpen && phaseOpen) {
        applySettledPanels(state, new Map());
        persistPanelAssignments();
        return;
      }
    }
  }

  const assignments = readPanelAssignments(state?.round_id ?? runtime.roundId);
  const remaining = new Map(bets.map((bet) => [String(bet.bet_id), bet]));

  applySettledPanels(state, remaining);

  PANEL_IDS.forEach((panelId) => {
    const panelState = getPanelRuntime(panelId);
    if (panelState.status === 'cashed_out' || panelState.status === 'lost') {
      if (!remaining.has(String(panelState.bet?.bet_id ?? ''))) {
        panelState.bet = null;
        return;
      }
    }

    panelState.bet = null;
    panelState.pending = false;
    panelState.payout = 0;
    panelState.multiplier = 1;

    const assignedId = assignments[panelId];
    const assignedBet = assignedId == null ? null : remaining.get(String(assignedId));
    if (assignedBet) {
      panelState.bet = assignedBet;
      panelState.status = runtime.state === 'FLYING' ? 'active' : 'waiting';
      panelState.result = null;
      getPanel(panelId)?.setAmount(assignedBet.amount);
      remaining.delete(String(assignedId));
    } else if (panelState.status !== 'cashed_out' && panelState.status !== 'lost') {
      panelState.status = 'ready';
      panelState.result = null;
    }
  });

  PANEL_IDS.forEach((panelId) => {
    const panelState = getPanelRuntime(panelId);
    if (panelState.bet) return;
    if (panelState.status === 'cashed_out' || panelState.status === 'lost') return;
    const next = remaining.values().next();
    if (next.done) return;
    panelState.bet = next.value;
    panelState.status = runtime.state === 'FLYING' ? 'active' : 'waiting';
    panelState.result = null;
    getPanel(panelId)?.setAmount(next.value.amount);
    remaining.delete(String(next.value.bet_id));
  });

  persistPanelAssignments();
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
  let remaining = 0;
  if (runtime.bettingEndsAt != null) {
    remaining = Math.max(0, runtime.bettingEndsAt - Date.now() / 1000);
  } else {
    remaining = Math.max(0, Number(runtime.timeLeft) || 0);
  }

  const duration = Math.max(
    remaining,
    Number(runtime.bettingDurationSec) || CRASH_BETTING_DURATION_SEC,
  );

  animationContainer?.setWaiting({
    remainingSec: remaining,
    durationSec: duration,
  });
}

function startBettingCountdown() {
  stopBettingCountdown();
  renderBettingStatus();
  // Smooth continuous progress; seconds label updates on whole-second changes inside setWaiting
  bettingTimer = window.setInterval(() => {
    if (runtime.state !== 'BETTING') {
      stopBettingCountdown();
      return;
    }
    renderBettingStatus();
  }, 50);
}

function updateCashoutPreviews(multiplier) {
  if (runtime.state !== 'FLYING') return;

  PANEL_IDS.forEach((panelId) => {
    const panelState = getPanelRuntime(panelId);
    if (!panelState.bet) return;

    const amount = Number(panelState.bet.amount) || 0;
    panelState.multiplier = multiplier;
    panelState.payout = Math.round(amount * multiplier * 100) / 100;
    getPanel(panelId)?.setMode('cashout', {
      payout: panelState.payout,
      multiplier,
    });
  });
}

function startMultiplierLoop() {
  stopMultiplierLoop();
  stopBettingCountdown();

  const tick = () => {
    if (
      !animationContainer
      || runtime.reconnecting
      || runtime.awaitingSync
      || runtime.state !== 'FLYING'
      || runtime.startTime == null
    ) {
      return;
    }

    const multiplier = getLiveMultiplier(runtime.startTime);
    animationContainer.setMultiplier(multiplier, { startTime: runtime.startTime });
    updateCashoutPreviews(multiplier);
    multiplierRaf = requestAnimationFrame(tick);
  };

  tick();
}

function syncPanelUi(panelId) {
  const panel = getPanel(panelId);
  const panelState = getPanelRuntime(panelId);
  if (!panel) return;

  syncCrashBetLimits();

  if (runtime.reconnecting || runtime.awaitingSync) {
    if (panelState.bet && runtime.state === 'FLYING') {
      panel.setMode('cashout', {
        payout: panelState.payout,
        multiplier: panelState.multiplier,
      });
      panel.setAmountDisabled(true);
      panel.setActionDisabled(true);
    } else {
      panel.setMode('bet');
      panel.setDisabled(true);
    }
    return;
  }

  if (runtime.state === 'BETTING') {
    panel.setMode('bet');
    if (panelState.bet) {
      panelState.status = 'waiting';
      panel.setDisabled(true);
    } else {
      panelState.status = panelState.pending ? 'betting' : 'ready';
      panel.setDisabled(panelState.pending);
    }
    return;
  }

  if (runtime.state === 'FLYING' && panelState.bet) {
    const cashoutAllowed = runtime.canCashout !== false;
    panelState.status = panelState.pending ? 'cashing_out' : 'active';
    panel.setMode('cashout', {
      payout: panelState.payout,
      multiplier: panelState.multiplier,
    });
    panel.setAmountDisabled(true);
    panel.setActionDisabled(panelState.pending || !cashoutAllowed);
    return;
  }

  panel.setMode('bet');
  panel.setDisabled(true);
}

function setBettingUi() {
  stopMultiplierLoop();
  if (runtime.reconnecting || runtime.awaitingSync) {
    stopBettingCountdown();
    PANEL_IDS.forEach(syncPanelUi);
    return;
  }
  startBettingCountdown();
  PANEL_IDS.forEach(syncPanelUi);
}

function setFlyingUi() {
  stopBettingCountdown();
  if (runtime.reconnecting || runtime.awaitingSync) {
    stopMultiplierLoop();
    PANEL_IDS.forEach(syncPanelUi);
    return;
  }
  const multiplier = getLiveMultiplier(runtime.startTime);
  updateCashoutPreviews(multiplier);
  PANEL_IDS.forEach(syncPanelUi);
  startMultiplierLoop();
}

function setCrashedUi(crashMultiplier) {
  stopMultiplierLoop();
  stopBettingCountdown();
  if (runtime.reconnecting || runtime.awaitingSync) {
    PANEL_IDS.forEach(syncPanelUi);
    return;
  }
  if (crashMultiplier != null) {
    animationContainer?.setCrashed(crashMultiplier, { startTime: runtime.startTime });
  } else {
    animationContainer?.setWaiting(null);
  }
  PANEL_IDS.forEach(syncPanelUi);
}

function applyRoundPhase() {
  if (runtime.reconnecting || runtime.awaitingSync) {
    stopMultiplierLoop();
    stopBettingCountdown();
    PANEL_IDS.forEach(syncPanelUi);
    return;
  }
  if (runtime.state === 'BETTING') {
    setBettingUi();
  } else if (runtime.state === 'FLYING') {
    setFlyingUi();
  } else if (runtime.state === 'CRASHED') {
    setCrashedUi(runtime.crashMultiplier);
  }
}

function freezeForReconnect() {
  if (!boardMount) return;
  runtime.reconnecting = true;
  runtime.awaitingSync = true;
  stopMultiplierLoop();
  stopBettingCountdown();
  animationContainer?.setPlaceholder(t('crash.reconnect.message'));
  PANEL_IDS.forEach(syncPanelUi);
}

function clearReconnectFreeze() {
  runtime.reconnecting = false;
  runtime.awaitingSync = false;
}

/**
 * @param {object} state
 * @param {{
 *   allowStoredFallback?: boolean,
 *   preservePersonalIfEmpty?: boolean,
 *   trustEmptyMyBets?: boolean,
 * }} [options]
 */
function applyServerState(state, options = {}) {
  if (!state) return;

  const previousRoundId = runtime.roundId;
  runtime.state = state.state || runtime.state;
  runtime.roundId = state.round_id ?? runtime.roundId;
  runtime.startTime = state.start_time ?? null;
  runtime.crashMultiplier = state.crash_multiplier ?? null;
  runtime.timeLeft = state.time_left ?? null;
  runtime.canCashout = Boolean(state.can_cashout);

  if (String(previousRoundId) !== String(runtime.roundId)) {
    runtime.cashedOutBetIds.clear();
  }

  if (runtime.state === 'BETTING' && runtime.timeLeft != null) {
    // Prefer residual time_left from server (already relative to server_time).
    runtime.bettingEndsAt = Date.now() / 1000 + Number(runtime.timeLeft);
    runtime.bettingDurationSec = Math.max(
      Number(runtime.timeLeft) || 0,
      Number(runtime.bettingDurationSec) || CRASH_BETTING_DURATION_SEC,
    );
  } else if (
    runtime.state === 'CRASHED'
    && state.phase_ends_at != null
    && Number.isFinite(Number(state.server_time))
  ) {
    const remaining = Math.max(0, Number(state.phase_ends_at) - Number(state.server_time));
    runtime.bettingEndsAt = Date.now() / 1000 + remaining;
    runtime.timeLeft = remaining;
  } else {
    runtime.bettingEndsAt = null;
  }

  reconcilePanelBets(state, options);

  if (Array.isArray(state.active_bets)) {
    liveBets?.setBets(mapActiveBets(state.active_bets));
  }

  syncActivityFromPayload(state);
  applyRoundPhase();
}

/**
 * HTTP snapshot is authenticated and preferred after reconnect / resume.
 * @param {number} generation
 */
async function resyncFromHttp(generation) {
  runtime.awaitingSync = true;
  try {
    const state = await crashService.getState();
    if (generation !== mountGeneration || Boolean(activeSignal?.aborted) || !boardMount) {
      return false;
    }
    applyServerState(state, {
      allowStoredFallback: true,
      preservePersonalIfEmpty: false,
      trustEmptyMyBets: true,
    });
    clearReconnectFreeze();
    applyRoundPhase();
    return true;
  } catch {
    // Keep frozen; STATE_SYNC may still recover public + stored personal state.
    return false;
  }
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
    applyServerState(payload, {
      allowStoredFallback: true,
      preservePersonalIfEmpty: true,
      trustEmptyMyBets: false,
    });
    clearReconnectFreeze();
    applyRoundPhase();
    return;
  }

  if (event === 'ONLINE_COUNT') {
    syncActivityFromPayload(payload);
    return;
  }

  // Until an authoritative rebuild lands, ignore live events that would paint
  // a fake flying multiplier or mutate panels from a partial stream.
  if (runtime.awaitingSync || runtime.reconnecting) {
    return;
  }

  if (event === 'ROUND_OPEN') {
    runtime.state = 'BETTING';
    runtime.roundId = payload.round_id ?? runtime.roundId;
    runtime.timeLeft = payload.time_left ?? 0;
    runtime.bettingDurationSec = Math.max(
      Number(payload.time_left) || 0,
      CRASH_BETTING_DURATION_SEC,
    );
    runtime.bettingEndsAt = Date.now() / 1000 + Number(runtime.timeLeft || 0);
    runtime.startTime = null;
    runtime.crashMultiplier = null;
    runtime.canCashout = false;
    PANEL_IDS.forEach((panelId) => {
      runtime.panels[panelId] = createPanelRuntime();
    });
    runtime.cashedOutBetIds.clear();
    clearPanelAssignments();
    liveBets?.clear();
    animationContainer?.activityHud?.clearFeed();
    syncActivityFromPayload({
      active_bet_count: payload.active_bet_count ?? 0,
    });
    applyRoundPhase();
    return;
  }

  if (event === 'ROUND_START') {
    runtime.state = 'FLYING';
    runtime.roundId = payload.round_id ?? runtime.roundId;
    runtime.startTime = payload.start_time ?? null;
    runtime.timeLeft = null;
    runtime.canCashout = PANEL_IDS.some((panelId) => getPanelRuntime(panelId).bet);
    applyRoundPhase();
    return;
  }

  if (event === 'PLAYER_BET') {
    if (payload.bet_id == null) return;
    const id = String(payload.bet_id);
    liveBets?.addBet({
      id,
      username: getPlayerDisplayName(
        payload.username,
        payload.user_id ?? id,
      ),
      amount: Number(payload.bet ?? payload.amount ?? 0),
      cashedOut: false,
    });
    syncActivityFromPayload(payload);
    return;
  }

  if (event === 'PLAYER_CASHOUT') {
    if (payload.bet_id == null) return;
    const id = String(payload.bet_id);
    runtime.cashedOutBetIds.add(id);
    liveBets?.markCashedOut(id);

    const username = getPlayerDisplayName(
      payload.username,
      payload.user_id ?? id,
    );
    const multiplier = Number(payload.multiplier);
    if (Number.isFinite(multiplier) && multiplier > 0) {
      animationContainer?.activityHud?.pushCashout({
        username,
        multiplier,
      });
    }

    syncActivityFromPayload(payload);

    const panelId = findPanelIdByBetId(payload.bet_id);
    if (panelId) {
      const panelState = getPanelRuntime(panelId);
      panelState.bet = null;
      panelState.pending = false;
      panelState.status = 'cashed_out';
      panelState.result = {
        type: 'win',
        profit: Number(payload.profit) || 0,
        multiplier: Number(payload.multiplier) || panelState.multiplier,
        payout: Number(payload.payout) || 0,
      };
      persistPanelAssignments();
      runtime.canCashout = PANEL_IDS.some((idKey) => getPanelRuntime(idKey).bet);
      syncPanelUi(panelId);
    }
    return;
  }

  if (event === 'ROUND_END') {
    runtime.state = 'CRASHED';
    runtime.crashMultiplier = payload.crash_multiplier ?? null;
    runtime.canCashout = false;
    if (payload.round_id != null) {
      runtime.roundId = payload.round_id;
    }
    PANEL_IDS.forEach((panelId) => {
      const panelState = getPanelRuntime(panelId);
      if (panelState.bet) {
        panelState.result = {
          type: 'lose',
          amount: Number(panelState.bet.amount) || 0,
        };
        panelState.bet = null;
        panelState.status = 'lost';
      }
      panelState.pending = false;
    });
    clearPanelAssignments();
    syncActivityFromPayload({
      active_bet_count: payload.active_bet_count ?? 0,
    });
    setCrashedUi(runtime.crashMultiplier);
    await refreshHistory();
  }
}

/**
 * @param {number} generation
 */
function buildSocketHandlers(generation) {
  return {
    onOpen: () => {
      if (generation !== mountGeneration || !boardMount) return;
      if (!runtime.reconnecting && !runtime.awaitingSync) return;
      void resyncFromHttp(generation);
    },
    onClose: () => {
      if (generation !== mountGeneration || !boardMount) return;
      freezeForReconnect();
    },
    onEvent: (payload) => {
      if (generation !== mountGeneration || !boardMount) return;
      void handleSocketEvent(payload);
    },
  };
}

function onVisibilityResume() {
  if (document.visibilityState !== 'visible' || !boardMount) return;
  const generation = mountGeneration;
  if (!crashService.isConnected()) {
    freezeForReconnect();
    if (socketHandlers) {
      crashService.connect(socketHandlers);
    }
  } else {
    runtime.awaitingSync = true;
    stopMultiplierLoop();
    stopBettingCountdown();
    PANEL_IDS.forEach(syncPanelUi);
  }
  void resyncFromHttp(generation);
}

/**
 * @param {'a'|'b'} panelId
 */
async function handlePanelAction(panelId) {
  const panel = getPanel(panelId);
  const panelState = getPanelRuntime(panelId);
  if (!panel || panelState.pending) return;

  if (!requireAuth({
    title: t('guest.modal.title'),
    message: t('guest.modal.message'),
  })) {
    return;
  }

  if (runtime.reconnecting || runtime.awaitingSync) {
    Toast({ message: t('crash.toast.reconnecting'), type: 'warning', duration: 2200 });
    return;
  }

  if (!panelState.bet) {
    if (runtime.state !== 'BETTING') {
      Toast({ message: t('crash.toast.betsClosed'), type: 'warning', duration: 2200 });
      return;
    }

    const amount = panel.getAmount();
    const remaining = Math.round(
      (CRASH_BET_LIMITS.totalMax - getOtherCommittedBetTotal(panelId)) * 100,
    ) / 100;
    const maxAllowed = Math.min(CRASH_BET_LIMITS.max, remaining);
    if (
      !Number.isFinite(amount)
      || amount < CRASH_BET_LIMITS.min
      || amount > maxAllowed + 1e-9
    ) {
      Toast({ message: t('game.validation.bet'), type: 'warning', duration: 2200 });
      return;
    }

    panelState.pending = true;
    panelState.status = 'betting';
    syncPanelUi(panelId);

    try {
      const autoCashout = panel.getAutoCashoutMultiplier?.() ?? null;
      const result = await crashService.placeBet(amount, autoCashout);
      panelState.bet = {
        amount: Number(result.amount ?? amount),
        bet_id: result.bet_id,
        auto_cashout_multiplier:
          result.auto_cashout_multiplier ?? autoCashout ?? null,
      };
      panelState.status = 'waiting';
      panelState.result = null;
      persistPanelAssignments();

      // Live Bets row comes from PLAYER_BET / state only — avoid optimistic dual-write.
      PANEL_IDS.forEach(syncPanelUi);
    } catch (error) {
      panelState.status = 'ready';
      Toast({
        message: error?.message || t('crash.toast.betFailed'),
        type: 'error',
        duration: 2800,
      });
    } finally {
      panelState.pending = false;
      PANEL_IDS.forEach(syncPanelUi);
    }
    return;
  }

  if (runtime.state !== 'FLYING') {
    Toast({ message: t('crash.toast.cashoutUnavailable'), type: 'warning', duration: 2200 });
    return;
  }

  const betId = panelState.bet.bet_id;
  panelState.pending = true;
  panelState.status = 'cashing_out';
  syncPanelUi(panelId);

  try {
    const result = await crashService.cashout(betId);
    const id = String(result.bet_id ?? betId);
    runtime.cashedOutBetIds.add(id);
    liveBets?.markCashedOut(id);

    if (String(panelState.bet?.bet_id) === String(betId)) {
      panelState.bet = null;
      panelState.status = 'cashed_out';
      panelState.result = {
        type: 'win',
        profit: Number(result.profit) || 0,
        multiplier: Number(result.multiplier) || panelState.multiplier,
      };
      persistPanelAssignments();
    }

    triggerWinHaptic();
    showGameWinToast({
      gameName: t('games.crash.name'),
      amount: Number(result.payout) || 0,
      duration: 2500,
    });
  } catch (error) {
    if (panelState.bet) panelState.status = 'active';
    Toast({
      message: error?.message || t('crash.toast.cashoutFailed'),
      type: 'error',
      duration: 2800,
    });
  } finally {
    panelState.pending = false;
    syncPanelUi(panelId);
  }
}

/** @type {number} */
let mountGeneration = 0;

/**
 * @param {AbortSignal} [signal]
 */
async function bootstrap(signal) {
  const generation = mountGeneration;
  activeSignal = signal ?? null;

  const isStale = () => (
    generation !== mountGeneration
    || Boolean(signal?.aborted)
    || !boardMount
  );

  // 1) Mandatory state sync
  try {
    const state = await crashService.getState();
    if (isStale()) return;
    applyServerState(state, {
      allowStoredFallback: true,
      preservePersonalIfEmpty: false,
      trustEmptyMyBets: true,
    });
    clearReconnectFreeze();
  } catch (error) {
    if (isStale()) return;
    freezeForReconnect();
    // Guest Mode: browsing is allowed; never show Unauthorized/auth error toasts.
    if (!isAuthenticated() || error?.status === 401) {
      animationContainer?.setPlaceholder(t('guest.crash.placeholder'));
    } else {
      animationContainer?.setPlaceholder(t('crash.error.sync'));
      Toast({
        message: error?.message || t('crash.toast.loadFailed'),
        type: 'error',
        duration: 3500,
      });
    }
  }

  if (isStale()) return;

  // 2) Live updates — skip WS while guest (backend requires a session).
  if (isAuthenticated()) {
    socketHandlers = buildSocketHandlers(generation);
    crashService.connect(socketHandlers);

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityResume);
      document.addEventListener('visibilitychange', onVisibilityResume);
    }
  }

  if (isStale()) {
    crashService.disconnect();
    return;
  }

  // 3) Optional history — never blocks startup
  if (isAuthenticated()) {
    void refreshHistory();
  }
}

export const CrashGame = {
  /**
   * @param {HTMLElement} container
   * @param {{ signal?: AbortSignal }} [options]
   */
  mount(container, options = {}) {
    const { signal } = options;

    if (mountContainer === container && boardMount?.isConnected) {
      return;
    }

    this.unmount();
    mountGeneration += 1;
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
          attrs: { 'aria-label': t('crash.panels.aria') },
          children: [panelA.element, panelB.element],
        }),
        liveBets.element,
      ],
    });

    container.replaceChildren(boardMount);

    if (signal?.aborted) {
      this.unmount();
      return;
    }

    void bootstrap(signal);
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
    mountGeneration += 1;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityResume);
    }
    stopMultiplierLoop();
    stopBettingCountdown();
    crashService.disconnect();
    socketHandlers = null;
    activeSignal = null;
    animationContainer?.destroy?.();

    const container = mountContainer;
    mountContainer = null;
    boardMount = null;
    animationContainer = null;
    history = null;
    panelA = null;
    panelB = null;
    liveBets = null;
    runtime.panels.a = createPanelRuntime();
    runtime.panels.b = createPanelRuntime();
    runtime.bettingEndsAt = null;
    runtime.reconnecting = false;
    runtime.awaitingSync = false;
    runtime.canCashout = false;
    runtime.cashedOutBetIds.clear();

    if (container) {
      container.replaceChildren();
    }
  },
};