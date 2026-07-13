/**
 * AnimationContainer — centered multiplier + premium flight canvas.
 * Multiplier remains the primary focus; flight supports it.
 */

import { createElement } from '../../utils/dom.js';
import { formatMultiplier, getPayoutTierKey } from './crash.utils.js';
import { createFlightEngine } from './crash.flight-engine.js';

const MULT_FONT_MAX_PX = 72;
const MULT_FONT_MIN_PX = 22;
/** Hold final crash multiplier before fading (ms) */
const MULT_HOLD_MS = 850;
/** Subtle fade of the frozen multiplier (ms) */
const MULT_FADE_MS = 700;

/**
 * Fit multiplier text into the fixed slot without overflow.
 * @param {HTMLElement} el
 */
function fitMultiplierFont(el) {
  el.style.fontSize = `${MULT_FONT_MAX_PX}px`;
  let size = MULT_FONT_MAX_PX;
  // Shrink until the text fits the fixed slot width.
  while (size > MULT_FONT_MIN_PX && el.scrollWidth > el.clientWidth) {
    size -= 2;
    el.style.fontSize = `${size}px`;
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.label]
 * @returns {{
 *   element: HTMLElement,
 *   mountPoint: HTMLElement,
 *   setPlaceholder: (text: string) => void,
 *   setMultiplier: (value: number|null) => void,
 *   setCrashed: (value: number|null) => void,
 *   setStatus: (text: string) => void,
 *   destroy: () => void,
 * }}
 */
export function createAnimationContainer(options = {}) {
  const label = options.label ?? '';

  const multiplierEl = createElement('p', {
    className: 'crash-animation__multiplier crash-animation__multiplier--orange',
    text: '1.00x',
  });

  const multiplierSlot = createElement('div', {
    className: 'crash-animation__multiplier-slot',
    attrs: { 'aria-live': 'polite' },
    children: [multiplierEl],
  });
  multiplierSlot.hidden = true;

  const statusEl = createElement('p', {
    className: 'crash-animation__placeholder',
    text: label,
  });
  // No debug / connecting label — only show intentional idle/betting copy
  statusEl.hidden = !label;

  const mountPoint = createElement('div', {
    className: 'crash-animation__mount',
    attrs: {
      'data-crash-animation-mount': 'true',
      'aria-hidden': 'true',
    },
  });

  const element = createElement('section', {
    className: 'crash-animation',
    attrs: {
      'aria-label': 'Crash animation area',
      role: 'region',
    },
    children: [
      createElement('div', {
        className: 'crash-animation__frame',
        children: [mountPoint, multiplierSlot, statusEl],
      }),
    ],
  });

  const flight = createFlightEngine(mountPoint);
  /** @type {'idle'|'flying'|'crashed'} */
  let phase = 'idle';
  /** @type {number} */
  let multHoldTimer = 0;
  /** @type {number} */
  let multFadeTimer = 0;
  /** @type {string|null} */
  let pendingPlaceholder = null;
  let exitComplete = true;

  /**
   * @param {number} numeric
   */
  function showMultiplier(numeric) {
    const tier = getPayoutTierKey(numeric);
    multiplierEl.textContent = formatMultiplier(numeric);
    multiplierEl.className = `crash-animation__multiplier crash-animation__multiplier--${tier}`;
    multiplierEl.classList.remove('crash-animation__multiplier--fading');
    multiplierSlot.hidden = false;
    multiplierSlot.classList.remove('crash-animation__multiplier-slot--fading');
    statusEl.hidden = true;
    statusEl.textContent = '';
    fitMultiplierFont(multiplierEl);
  }

  function clearMultTimers() {
    if (multHoldTimer) {
      window.clearTimeout(multHoldTimer);
      multHoldTimer = 0;
    }
    if (multFadeTimer) {
      window.clearTimeout(multFadeTimer);
      multFadeTimer = 0;
    }
  }

  function beginMultiplierFade() {
    multiplierEl.classList.add('crash-animation__multiplier--fading');
    multiplierSlot.classList.add('crash-animation__multiplier-slot--fading');
    if (multFadeTimer) window.clearTimeout(multFadeTimer);
    multFadeTimer = window.setTimeout(() => {
      multFadeTimer = 0;
      multiplierSlot.hidden = true;
      multiplierEl.classList.remove('crash-animation__multiplier--fading');
      multiplierSlot.classList.remove('crash-animation__multiplier-slot--fading');
    }, MULT_FADE_MS);
  }

  /**
   * @param {string} text
   */
  function revealPlaceholder(text) {
    clearMultTimers();
    multiplierSlot.hidden = true;
    multiplierEl.classList.remove('crash-animation__multiplier--fading');
    multiplierSlot.classList.remove('crash-animation__multiplier-slot--fading');
    const next = String(text || '');
    statusEl.textContent = next;
    statusEl.hidden = !next;
    statusEl.classList.remove('crash-animation__placeholder--enter');
    void statusEl.offsetWidth;
    if (next) {
      statusEl.classList.add('crash-animation__placeholder--enter');
    }
  }

  /**
   * Park the next takeoff and show betting copy.
   * @param {string} text
   */
  function goBetting(text) {
    phase = 'idle';
    exitComplete = true;
    pendingPlaceholder = null;
    flight.prepareNextRound({
      onReady: () => revealPlaceholder(text),
    });
  }

  return {
    element,
    mountPoint,

    setPlaceholder(text) {
      const next = String(text || '');

      // Keep the sky exit continuous — reveal betting copy when the plane is gone.
      if (phase === 'crashed' && !exitComplete) {
        pendingPlaceholder = next;
        return;
      }

      goBetting(next);
    },

    setStatus(text) {
      // Status is idle-only; never overlay flight / crash multiplier
      if (phase === 'flying' || phase === 'crashed') {
        statusEl.hidden = true;
        statusEl.textContent = '';
        return;
      }
      const next = String(text || '');
      statusEl.textContent = next;
      statusEl.hidden = !next;
    },

    /**
     * Live / active flight multiplier (large, centered).
     * @param {number|null} value
     */
    setMultiplier(value) {
      if (value == null || !Number.isFinite(Number(value))) {
        multiplierSlot.hidden = true;
        return;
      }

      clearMultTimers();
      pendingPlaceholder = null;
      exitComplete = true;
      const numeric = Number(value);
      showMultiplier(numeric);
      phase = 'flying';
      flight.setFlying(numeric);
    },

    /**
     * Round ended — freeze multiplier, then calm sky exit.
     * @param {number|null} value
     */
    setCrashed(value) {
      phase = 'crashed';
      exitComplete = false;
      pendingPlaceholder = null;
      clearMultTimers();
      statusEl.hidden = true;
      statusEl.textContent = '';

      const onExitComplete = () => {
        exitComplete = true;
        // Softly reset flight state for the next takeoff (plane stays off-screen).
        flight.prepareNextRound({});

        if (pendingPlaceholder != null) {
          const copy = pendingPlaceholder;
          pendingPlaceholder = null;
          phase = 'idle';
          revealPlaceholder(copy);
        }
      };

      if (value == null || !Number.isFinite(Number(value))) {
        flight.setCrashed(null, { onExitComplete });
        return;
      }

      const numeric = Number(value);
      showMultiplier(numeric);
      flight.setCrashed(numeric, { onExitComplete });

      // Freeze → brief hold → subtle fade (plane exit continues independently)
      multHoldTimer = window.setTimeout(() => {
        multHoldTimer = 0;
        beginMultiplierFade();
      }, MULT_HOLD_MS);
    },

    destroy() {
      clearMultTimers();
      flight.destroy();
    },
  };
}
