/**
 * Crash (Aviator) game page — mounts CrashGame layout.
 */

import { createElement } from '../utils/dom.js';
import { CrashGame } from '../games/crash/index.js';
import '../../styles/pages/crash.css';

/**
 * @returns {HTMLElement}
 */
export function renderCrashPage() {
  const board = createElement('div', {
    className: 'game-page game-page--crash',
    attrs: { 'data-page': 'crash' },
  });

  CrashGame.mount(board);

  return board;
}
