/**
 * Mock Live Bets round loop — visual-only stand-in for WebSocket events.
 * Stop via returned disposer; replace with real WS handlers later.
 */

import { CRASH_MOCK_LIVE_BETS_ROUNDS } from './crash.constants.js';

/**
 * @param {ReturnType<import('./crash.live-bets.js').createLiveBets>} liveBets
 * @returns {() => void} stop
 */
export function startLiveBetsMockLoop(liveBets) {
  let roundIndex = 0;
  /** @type {ReturnType<typeof setTimeout>[]} */
  const timers = [];

  function schedule(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }

  function clearTimers() {
    timers.splice(0).forEach((id) => clearTimeout(id));
  }

  function runRound() {
    clearTimers();

    const snapshot = CRASH_MOCK_LIVE_BETS_ROUNDS[roundIndex % CRASH_MOCK_LIVE_BETS_ROUNDS.length]
      .map((bet) => ({ ...bet, cashedOut: false }));

    // ROUND_OPEN / ROUND_END → replace list
    liveBets.setBets(snapshot);

    const ids = snapshot.map((bet) => bet.id);
    const cashoutCount = Math.max(1, Math.min(ids.length - 1, Math.floor(ids.length * 0.6)));
    const shuffled = [...ids].sort(() => Math.random() - 0.5).slice(0, cashoutCount);

    shuffled.forEach((id, index) => {
      // PLAYER_CASHOUT → green row only
      schedule(() => liveBets.markCashedOut(id), 1800 + index * 900);
    });

    // Next mock round
    schedule(() => {
      roundIndex += 1;
      runRound();
    }, 1800 + cashoutCount * 900 + 3500);
  }

  runRound();

  return () => clearTimers();
}
