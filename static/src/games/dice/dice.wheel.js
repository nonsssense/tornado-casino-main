/**
 * Dice probability wheel — green/yellow sectors, minimal pointer, center hub.
 */

import { createElement } from '../../utils/dom.js';
import { getDisplayStats, rollToDegrees } from './dice.utils.js';
import { t } from '../../i18n/index.js';

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

  function createSectorLabel(side, label) {
    return {
      root: createElement('div', {
        className: `dice-wheel__sector-label dice-wheel__sector-label--${side}`,
      }),
      title: createElement('span', {
        className: 'dice-wheel__sector-title',
        text: label,
      }),
      multiplier: createElement('span', {
        className: 'dice-wheel__sector-multiplier',
      }),
      chance: createElement('span', {
        className: 'dice-wheel__sector-chance',
      }),
    };
  }

  const underLabel = createSectorLabel('under', t('dice.wheel.less'));
  const overLabel = createSectorLabel('over', t('dice.wheel.more'));
  underLabel.root.append(underLabel.title, underLabel.multiplier, underLabel.chance);
  overLabel.root.append(overLabel.title, overLabel.multiplier, overLabel.chance);

  const sectorLabels = createElement('div', {
    className: 'dice-wheel__sector-labels',
    children: [underLabel.root, overLabel.root],
  });

  const pointer = createElement('div', {
    className: 'dice-wheel__pointer',
    attrs: { 'aria-hidden': 'true' },
    children: [createElement('span', { className: 'dice-wheel__pointer-cap' })],
  });

  const resultValue = createElement('span', {
    className: 'dice-wheel__result-value',
    text: '0',
    attrs: { 'aria-live': 'polite' },
  });

  const resultLabel = createElement('span', {
    className: 'dice-wheel__result-label',
    text: t('dice.wheel.rollLabel'),
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
    children: [groundSpill, disc, sectorLabels, pointer, hub],
  });

  function positionSectorLabel(label, angleDeg) {
    const radians = angleDeg * (Math.PI / 180);
    const radius = 29;
    label.style.left = `${50 + Math.sin(radians) * radius}%`;
    label.style.top = `${50 - Math.cos(radians) * radius}%`;
  }

  function applySectors() {
    const underStats = getDisplayStats(0, state.limit, false);
    const overStats = getDisplayStats(0, state.limit, true);
    const underDeg = (underStats.chance / 100) * 360;

    root.style.setProperty('--dice-under-deg', `${underDeg}deg`);
    root.dataset.over = state.over ? 'true' : 'false';

    underLabel.multiplier.textContent = `${underStats.multiplier.toFixed(2)}×`;
    underLabel.chance.textContent = `${underStats.chance}%`;
    overLabel.multiplier.textContent = `${overStats.multiplier.toFixed(2)}×`;
    overLabel.chance.textContent = `${overStats.chance}%`;

    positionSectorLabel(underLabel.root, 180 + underDeg / 2);
    positionSectorLabel(overLabel.root, 180 + underDeg + (360 - underDeg) / 2);
  }

  function setPointerRotation(deg, animate = false) {
    state.pointerDeg = deg;
    pointer.style.transition = animate
      ? 'transform 2.4s cubic-bezier(0.22, 0.61, 0.36, 1)'
      : 'transform 0.35s ease-out';
    pointer.style.transform = `rotate(${deg}deg)`;
  }

  function setResultDisplay(value, { pulse = false } = {}) {
    resultValue.textContent = value === null || value === undefined ? '0' : String(value);
    hub.classList.toggle('dice-wheel__hub--pulse', pulse);
    if (pulse) {
      window.setTimeout(() => hub.classList.remove('dice-wheel__hub--pulse'), 600);
    }
  }

  applySectors();
  setPointerRotation(180, false);

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
      root.classList.remove('dice-wheel--sector-highlight');
      root.removeAttribute('data-highlight');
      setResultDisplay(state.roll ?? 0);
    },

    setIdle() {
      state.isSpinning = false;
      root.classList.remove('dice-wheel--spinning');
    },

    showResult(value) {
      state.roll = value;
      setResultDisplay(value, { pulse: true });
    },

    setSpinRoll(value) {
      const roll = Number(value);
      const displayedRoll = Number.isFinite(roll)
        ? Math.min(99, Math.max(0, Math.floor(roll)))
        : 0;
      setResultDisplay(displayedRoll);
    },

    highlightSector(side) {
      if (side !== 'under' && side !== 'over') return;
      root.dataset.highlight = side;
      root.classList.remove('dice-wheel--sector-highlight');
      void root.offsetWidth;
      root.classList.add('dice-wheel--sector-highlight');
      root.addEventListener('animationend', (event) => {
        if (event.animationName !== 'dice-sector-highlight') return;
        root.classList.remove('dice-wheel--sector-highlight');
        root.removeAttribute('data-highlight');
      }, { once: true });
    },

    resetResult() {
      state.roll = null;
      setPointerRotation(180, false);
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
