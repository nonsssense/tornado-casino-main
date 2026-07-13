/**
 * Dice game page — mounts DiceGame placeholder board.
 */

import { createElement } from '../utils/dom.js';
import { DiceGame } from '../games/dice/index.js';

/**
 * @returns {HTMLElement}
 */
export function renderDicePage() {
  const board = createElement('div', {
    className: 'game-page game-page--dice',
    attrs: { 'data-page': 'dice' },
  });

  DiceGame.mount(board);

  return board;
}
