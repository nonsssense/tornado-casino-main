/**
 * Plinko game page — mounts Plinko board + controls.
 */

import { createElement } from '../utils/dom.js';
import { PlinkoGame } from '../games/plinko/index.js';

/**
 * @returns {HTMLElement}
 */
export function renderPlinkoPage() {
  const board = createElement('div', {
    className: 'game-page game-page--plinko',
    attrs: { 'data-page': 'plinko' },
  });

  void PlinkoGame.mount(board);

  return board;
}
