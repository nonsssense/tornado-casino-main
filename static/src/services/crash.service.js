/**
 * Crash service — orchestration between Crash API / WebSocket and the UI.
 *
 * Backend remains the source of truth. Frontend only:
 * - syncs state
 * - animates multiplier from start_time using the shared growth formula
 * - forwards bets / cashouts
 */

import {
  fetchCrashState,
  fetchCrashHistory,
  placeCrashBet,
  cashoutCrash,
} from '../api/crash.js';
import { balanceService } from './balance.service.js';
import { CRASH_GROWTH_RATE, CRASH_GROWTH_POWER } from '../games/crash/crash.constants.js';
import { t } from '../i18n/index.js';

/** @type {WebSocket|null} */
let socket = null;

/** @type {number} */
let reconnectTimer = 0;

/** @type {boolean} */
let shouldReconnect = false;

/**
 * Bumped on every connect/disconnect so superseded sockets cannot schedule
 * ghost reconnects or deliver events after intentional teardown.
 * @type {number}
 */
let connectGeneration = 0;

/**
 * @param {unknown} error
 * @returns {string}
 */
function getCrashErrorMessage(error) {
  const detail = error?.data?.detail;

  if (typeof detail === 'object' && detail?.message) {
    return detail.message;
  }

  if (typeof detail === 'string') {
    return detail;
  }

  if (error?.status === 401) {
    return t('crash.error.session');
  }

  if (error?.status === 404) {
    return t('crash.error.unreachable');
  }

  if (error?.status === 409) {
    return typeof detail === 'string' ? detail : t('crash.error.conflict');
  }

  if (error?.message) {
    return error.message;
  }

  return t('crash.error.generic');
}

/**
 * Soft growth curve shared with the backend CrashGameLoop.
 * multiplier = floor(100 * exp(RATE * elapsedMs^POWER)) / 100
 * @param {number} elapsedSeconds
 * @returns {number}
 */
export function calculateCrashMultiplier(elapsedSeconds) {
  const elapsedMs = Math.max(0, Number(elapsedSeconds) || 0) * 1000;
  if (elapsedMs <= 0) return 1;
  const value = Math.exp(CRASH_GROWTH_RATE * elapsedMs ** CRASH_GROWTH_POWER);
  return Math.max(1, Math.floor(100 * value) / 100);
}

/**
 * @param {number} startTime - unix seconds from ROUND_START / state
 * @returns {number}
 */
export function getLiveMultiplier(startTime) {
  if (!Number.isFinite(startTime)) return 1;
  return calculateCrashMultiplier(Date.now() / 1000 - startTime);
}

function buildWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/crash/ws`;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }
}

/**
 * Close the active socket without flipping reconnect policy.
 * Invalidates the previous generation so its close handler is inert.
 */
function closeActiveSocket() {
  clearReconnectTimer();
  connectGeneration += 1;
  if (!socket) return;
  const active = socket;
  socket = null;
  try {
    active.close();
  } catch {
    // ignore
  }
}

export const crashService = {
  /**
   * @returns {Promise<object>}
   */
  async getState() {
    try {
      const data = await fetchCrashState();
      if (!data || typeof data !== 'object' || Array.isArray(data) || !('state' in data)) {
        throw new Error(t('crash.error.invalidState'));
      }
      return data;
    } catch (error) {
      const wrapped = new Error(getCrashErrorMessage(error));
      wrapped.status = error?.status;
      wrapped.data = error?.data;
      throw wrapped;
    }
  },

  /**
   * @param {number} [limit]
   * @returns {Promise<number[]>}
   */
  async getHistory(limit = 10) {
    try {
      const data = await fetchCrashHistory(limit);
      if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
        return [];
      }
      return data.items.map(Number).filter((value) => Number.isFinite(value));
    } catch {
      return [];
    }
  },

  /**
   * @param {number} amount
   * @param {number|null} [autoCashoutMultiplier]
   */
  async placeBet(amount, autoCashoutMultiplier = null) {
    try {
      /** @type {{ amount: number, auto_cashout_multiplier?: number }} */
      const payload = { amount };
      if (
        autoCashoutMultiplier != null
        && Number.isFinite(autoCashoutMultiplier)
        && autoCashoutMultiplier > 1
      ) {
        payload.auto_cashout_multiplier = autoCashoutMultiplier;
      }
      const result = await placeCrashBet(payload);
      void balanceService.fetchBalances().catch(() => {});
      return result;
    } catch (error) {
      throw new Error(getCrashErrorMessage(error));
    }
  },

  /**
   * @param {number|string} betId
   */
  async cashout(betId) {
    try {
      const result = await cashoutCrash({ bet_id: Number(betId) });
      void balanceService.fetchBalances().catch(() => {});
      return result;
    } catch (error) {
      throw new Error(getCrashErrorMessage(error));
    }
  },

  /**
   * @param {{
   *   onEvent?: (payload: object) => void,
   *   onOpen?: () => void,
   *   onClose?: () => void,
   *   onError?: (error: Event) => void,
   * }} handlers
   */
  connect(handlers = {}) {
    closeActiveSocket();
    shouldReconnect = true;

    const myGeneration = connectGeneration;
    const url = buildWebSocketUrl();
    const nextSocket = new WebSocket(url);
    socket = nextSocket;

    nextSocket.addEventListener('open', () => {
      if (myGeneration !== connectGeneration || socket !== nextSocket) return;
      handlers.onOpen?.();
    });

    nextSocket.addEventListener('message', (event) => {
      if (myGeneration !== connectGeneration || socket !== nextSocket) return;
      try {
        const payload = JSON.parse(event.data);
        if (!payload || typeof payload !== 'object') return;
        handlers.onEvent?.(payload);
      } catch {
        // ignore malformed frames
      }
    });

    nextSocket.addEventListener('close', () => {
      if (myGeneration !== connectGeneration) return;
      if (socket === nextSocket) socket = null;
      handlers.onClose?.();
      if (!shouldReconnect) return;
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = 0;
        if (!shouldReconnect || myGeneration !== connectGeneration) return;
        this.connect(handlers);
      }, 1500);
    });

    nextSocket.addEventListener('error', (error) => {
      if (myGeneration !== connectGeneration || socket !== nextSocket) return;
      handlers.onError?.(error);
    });
  },

  disconnect() {
    shouldReconnect = false;
    closeActiveSocket();
  },

  /**
   * @returns {boolean}
   */
  isConnected() {
    return Boolean(socket && socket.readyState === WebSocket.OPEN);
  },
};
