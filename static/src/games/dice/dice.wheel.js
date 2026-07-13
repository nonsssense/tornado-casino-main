/**
 * Dice probability wheel — premium purple / magenta sectors, outer pointer, center hub.
 */

import { createElement } from '../../utils/dom.js';
import { getWheelSectors, rollToDegrees } from './dice.utils.js';

/**
 * @param {object} [options]
 * @param {number} [options.limit]
 * @param {boolean} [options.over]
 */
export function createDiceWheel(options = {}) {
  const state = {
    limit: options.limit ?? 50,
    over: options.over ?? true,
    roll: null,
    pointerDeg: 0,
    isSpinning: false,
  };

  const sectors = createElement('div', { className: 'dice-wheel__sectors' });
  const sectorsBlend = createElement('div', {
    className: 'dice-wheel__sectors-blend',
    attrs: { 'aria-hidden': 'true' },
  });
  const depth = createElement('div', { className: 'dice-wheel__depth', attrs: { 'aria-hidden': 'true' } });
  const glass = createElement('div', { className: 'dice-wheel__glass', attrs: { 'aria-hidden': 'true' } });
  const caustic = createElement('div', { className: 'dice-wheel__caustic', attrs: { 'aria-hidden': 'true' } });
  const innerRim = createElement('div', { className: 'dice-wheel__inner-rim', attrs: { 'aria-hidden': 'true' } });
  const edgeLight = createElement('div', { className: 'dice-wheel__edge-light', attrs: { 'aria-hidden': 'true' } });
  const rim = createElement('div', { className: 'dice-wheel__rim', attrs: { 'aria-hidden': 'true' } });
  const ambientLit = createElement('div', { className: 'dice-wheel__ambient-lit', attrs: { 'aria-hidden': 'true' } });
  const specular = createElement('div', { className: 'dice-wheel__specular', attrs: { 'aria-hidden': 'true' } });
  const shine = createElement('div', { className: 'dice-wheel__shine', attrs: { 'aria-hidden': 'true' } });
  const groundSpill = createElement('div', {
    className: 'dice-wheel__ground-spill',
    attrs: { 'aria-hidden': 'true' },
  });

  const pointer = createElement('div', {
    className: 'dice-wheel__pointer',
    attrs: { 'aria-hidden': 'true' },
    children: [createElement('span', { className: 'dice-wheel__pointer-cap' })],
  });

  const resultValue = createElement('span', {
    className: 'dice-wheel__result-value',
    text: '—',
    attrs: { 'aria-live': 'polite' },
  });

  const resultLabel = createElement('span', {
    className: 'dice-wheel__result-label',
    text: 'Roll',
  });

  const hub = createElement('div', {
    className: 'dice-wheel__hub',
    children: [
      createElement('div', {
        className: 'dice-wheel__hub-inner',
        children: [resultLabel, resultValue],
      }),
    ],
  });

  const disc = createElement('div', {
    className: 'dice-wheel__disc',
    children: [sectors, sectorsBlend, depth, glass, caustic, innerRim, edgeLight, rim, ambientLit, specular, shine],
  });

  const root = createElement('div', {
    className: 'dice-wheel',
    attrs: { 'data-game': 'dice-wheel' },
    children: [groundSpill, disc, pointer, hub],
  });

  function applySectors() {
    const { winPercent, losePercent } = getWheelSectors(state.limit, state.over);
    const winDeg = (winPercent / 100) * 360;
    const loseDeg = (losePercent / 100) * 360;

    root.style.setProperty('--dice-win-deg', `${winDeg}deg`);
    root.style.setProperty('--dice-lose-deg', `${loseDeg}deg`);
    root.dataset.over = state.over ? 'true' : 'false';
  }

  function setPointerRotation(deg, animate = false) {
    state.pointerDeg = deg;
    pointer.style.transition = animate
      ? 'transform 2.4s cubic-bezier(0.22, 0.61, 0.36, 1)'
      : 'transform 0.35s ease-out';
    pointer.style.transform = `rotate(${deg}deg)`;
  }

  function setResultDisplay(value, { pulse = false } = {}) {
    resultValue.textContent = value === null || value === undefined ? '—' : String(value);
    hub.classList.toggle('dice-wheel__hub--pulse', pulse);
    if (pulse) {
      window.setTimeout(() => hub.classList.remove('dice-wheel__hub--pulse'), 600);
    }
  }

  applySectors();
  setPointerRotation(0, false);

  return {
    element: root,
    pointer,
    hub,

    updateSettings(limit, over) {
      state.limit = limit;
      state.over = over;
      applySectors();
    },

    setRolling() {
      state.isSpinning = true;
      root.classList.add('dice-wheel--spinning');
      setResultDisplay('…');
    },

    setIdle() {
      state.isSpinning = false;
      root.classList.remove('dice-wheel--spinning');
    },

    showResult(roll) {
      state.roll = roll;
      setResultDisplay(roll, { pulse: true });
    },

    resetResult() {
      state.roll = null;
      setResultDisplay(null);
    },

    getPointerDegrees() {
      return state.pointerDeg;
    },

    setPointerDegrees(deg, animate = false) {
      setPointerRotation(deg, animate);
    },

    rollToDegrees,
  };
}
