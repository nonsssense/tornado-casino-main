/**
 * Dice game feature.
 *
 * Responsibility:
 * - Dice board UI (bet, target, over/under, play button).
 * - Submit bets via game.service.js → POST /api/games/rolldice.
 * - Trigger dice.animation.js with backend roll result only.
 */

export const DiceGame = {
  mount(container) {
    // TODO: replace legacy dicePage() in legacy/app.js
  },

  unmount() {
    // TODO: cleanup listeners and animation state
  },
};
