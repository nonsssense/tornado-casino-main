/**
 * AnimationContainer — centered multiplier + cinematic flight canvas.
 * HUD uses growth formula; plane uses start_time elapsed (takeoff → cruise).
 */

import { createElement } from '../../utils/dom.js';
import { ASSETS } from '../../utils/assets.js';
import { formatMultiplier, getPayoutTierKey } from './crash.utils.js';
import { createFlightEngine } from './crash.flight-engine.js';
import { createActivityHud } from './crash.activity-hud.js';
import { t } from '../../i18n/index.js';

const MULT_FONT_MAX_PX = 72;
const MULT_FONT_MIN_PX = 22;
/** Hold final crash multiplier on screen before fading (ms) */
const MULT_HOLD_MS = 2000;
/** Subtle fade of the frozen multiplier (ms) */
const MULT_FADE_MS = 700;

/**
 * Fit multiplier text into the fixed slot without overflow.
 * @param {HTMLElement} el
 */
function fitMultiplierFont(el) {
  el.style.fontSize = `${MULT_FONT_MAX_PX}px`;
  let size = MULT_FONT_MAX_PX;
  while (size > MULT_FONT_MIN_PX && el.scrollWidth > el.clientWidth) {
    size -= 2;
    el.style.fontSize = `${size}px`;
  }
}

/**
 * @param {number} remainingSec
 * @param {number} durationSec
 * @returns {number} 0..1 remaining fraction
 */
function remainingFraction(remainingSec, durationSec) {
  const dur = Math.max(0.001, Number(durationSec) || 1);
  return Math.max(0, Math.min(1, Number(remainingSec) / dur));
}

/**
 * @param {object} [options]
 * @param {string} [options.label]
 * @returns {{
 *   element: HTMLElement,
 *   mountPoint: HTMLElement,
 *   setPlaceholder: (text: string) => void,
 *   setWaiting: (state: { remainingSec: number, durationSec: number }|null) => void,
 *   setMultiplier: (value: number|null) => void,
 *   setCrashed: (value: number|null) => void,
 *   setStatus: (text: string) => void,
 *   activityHud: ReturnType<typeof createActivityHud>,
 *   destroy: () => void,
 * }}
 */
export function createAnimationContainer(options = {}) {
  const label = options.label ?? '';
  const activityHud = createActivityHud();

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

  const logoEl = createElement('img', {
    className: 'crash-waiting__logo',
    attrs: {
      src: ASSETS.logo,
      alt: t('brand.name'),
      draggable: 'false',
    },
  });

  const titleEl = createElement('h2', {
    className: 'crash-waiting__title',
    text: t('crash.waiting.title'),
  });

  const subtitleEl = createElement('p', {
    className: 'crash-waiting__subtitle',
    text: t('crash.waiting.subtitle'),
  });

  const fillEl = createElement('div', {
    className: 'crash-waiting__fill',
  });

  const trackEl = createElement('div', {
    className: 'crash-waiting__track',
    attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' },
    children: [fillEl],
  });

  const secondsEl = createElement('p', {
    className: 'crash-waiting__seconds',
    attrs: { 'aria-live': 'polite' },
    text: '',
  });

  const waitingEl = createElement('div', {
    className: 'crash-waiting',
    attrs: { 'aria-label': t('crash.waiting.aria') },
    children: [logoEl, titleEl, subtitleEl, trackEl, secondsEl],
  });
  waitingEl.hidden = true;

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
      'aria-label': t('crash.animation.aria'),
      role: 'region',
    },
    children: [
      createElement('div', {
        className: 'crash-animation__frame',
        children: [mountPoint, multiplierSlot, waitingEl, activityHud.element],
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
  /** @type {{ remainingSec: number, durationSec: number }|null} */
  let pendingWaiting = null;
  let exitComplete = true;
  let multiplierDone = true;
  /** @type {number} */
  let lastWholeSecond = -1;

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
    hideWaiting(false);
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

  /**
   * @param {boolean} [animate]
   */
  function hideWaiting(animate = true) {
    waitingEl.classList.remove('crash-waiting--enter');
    if (!animate) {
      waitingEl.hidden = true;
      waitingEl.classList.remove('crash-waiting--exit');
      return;
    }
    if (waitingEl.hidden) return;
    waitingEl.classList.add('crash-waiting--exit');
    window.setTimeout(() => {
      if (waitingEl.classList.contains('crash-waiting--exit')) {
        waitingEl.hidden = true;
        waitingEl.classList.remove('crash-waiting--exit');
      }
    }, 420);
  }

  /**
   * @param {{ remainingSec: number, durationSec: number }} state
   */
  function paintWaiting(state) {
    const remaining = Math.max(0, Number(state.remainingSec) || 0);
    const duration = Math.max(remaining, Number(state.durationSec) || remaining || 1);
    const whole = Math.max(0, Math.ceil(remaining));
    const fraction = remainingFraction(remaining, duration);

    fillEl.style.transform = `scaleX(${fraction})`;
    trackEl.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));

    if (whole !== lastWholeSecond) {
      lastWholeSecond = whole;
      secondsEl.textContent = whole > 0
        ? t('crash.waiting.seconds', { n: whole })
        : t('crash.waiting.secondsZero');
    }
  }

  /**
   * @param {{ remainingSec: number, durationSec: number }} state
   * @param {boolean} [enter]
   */
  function revealWaiting(state, enter = true) {
    clearMultTimers();
    // Multiplier must be fully gone before betting UI appears
    multiplierSlot.hidden = true;
    multiplierEl.textContent = '';
    multiplierEl.classList.remove('crash-animation__multiplier--fading');
    multiplierSlot.classList.remove('crash-animation__multiplier-slot--fading');
    multiplierDone = true;

    titleEl.textContent = t('crash.waiting.title');
    subtitleEl.textContent = t('crash.waiting.subtitle');

    waitingEl.hidden = false;
    waitingEl.classList.remove('crash-waiting--exit');
    paintWaiting(state);

    if (enter) {
      waitingEl.classList.remove('crash-waiting--enter');
      void waitingEl.offsetWidth;
      waitingEl.classList.add('crash-waiting--enter');
    }
  }

  function tryRevealWaiting() {
    // Betting UI only after plane exit AND multiplier hold/fade are done
    if (!exitComplete || !multiplierDone) return;
    if (!pendingWaiting) return;

    const next = pendingWaiting;
    pendingWaiting = null;
    phase = 'idle';
    revealWaiting(next, true);
  }

  /**
   * Park the next takeoff, then show waiting only after multiplier is gone.
   * @param {{ remainingSec: number, durationSec: number }|null} waiting
   */
  function goBetting(waiting) {
    pendingWaiting = waiting;
    flight.prepareNextRound({
      onReady: () => {
        exitComplete = true;
        tryRevealWaiting();
      },
    });
    // Do not force phase/exitComplete here — wait for multiplierDone + exit
    if (exitComplete && multiplierDone) {
      phase = 'idle';
      tryRevealWaiting();
    }
  }

  function beginMultiplierFade() {
    multiplierEl.classList.add('crash-animation__multiplier--fading');
    multiplierSlot.classList.add('crash-animation__multiplier-slot--fading');
    if (multFadeTimer) window.clearTimeout(multFadeTimer);
    multFadeTimer = window.setTimeout(() => {
      multFadeTimer = 0;
      multiplierSlot.hidden = true;
      multiplierEl.textContent = '';
      multiplierEl.classList.remove('crash-animation__multiplier--fading');
      multiplierSlot.classList.remove('crash-animation__multiplier-slot--fading');
      multiplierDone = true;
      tryRevealWaiting();
    }, MULT_FADE_MS);
  }

  return {
    element,
    mountPoint,
    activityHud,

    /**
     * Legacy string placeholder — prefer setWaiting.
     * @param {string} text
     */
    setPlaceholder(text) {
      const next = String(text || '');
      if (!next) {
        hideWaiting(false);
        return;
      }
      // Map plain text to a minimal waiting state if something still calls this
      this.setWaiting({ remainingSec: 0, durationSec: 1 });
      titleEl.textContent = next;
    },

    /**
     * Betting / waiting overlay (logo, Russian copy, countdown bar).
     * @param {{ remainingSec: number, durationSec: number }|null} state
     */
    setWaiting(state) {
      if (!state) {
        pendingWaiting = null;
        hideWaiting(true);
        return;
      }

      const next = {
        remainingSec: Math.max(0, Number(state.remainingSec) || 0),
        durationSec: Math.max(0.001, Number(state.durationSec) || 1),
      };

      // Crash hold/fade/exit still running — only queue, never show early
      if (phase === 'crashed' && (!exitComplete || !multiplierDone)) {
        pendingWaiting = next;
        return;
      }

      if (phase === 'flying') {
        pendingWaiting = next;
        return;
      }

      // Betting UI already up — update countdown only (keep multiplier gone)
      if (!waitingEl.hidden) {
        multiplierSlot.hidden = true;
        multiplierEl.textContent = '';
        paintWaiting(next);
        return;
      }

      // Multiplier hold/fade still in progress — queue only
      if (!multiplierDone) {
        pendingWaiting = next;
        return;
      }

      multiplierSlot.hidden = true;
      multiplierEl.textContent = '';
      goBetting(next);
    },

    setStatus() {
      // Status overlay retired — waiting screen covers idle messaging
    },

    /**
     * Live / active flight multiplier (large, centered).
     * @param {number|null} value
     * @param {{ startTime?: number|null }} [options]
     */
    setMultiplier(value, options = {}) {
      if (value == null || !Number.isFinite(Number(value))) {
        multiplierSlot.hidden = true;
        return;
      }

      clearMultTimers();
      pendingWaiting = null;
      exitComplete = true;
      multiplierDone = true;
      const numeric = Number(value);
      showMultiplier(numeric);
      phase = 'flying';
      flight.setFlying(numeric, { startTime: options.startTime });
    },

    /**
     * Round ended — freeze multiplier, plane exits, trail stays at crash.
     * @param {number|null} value
     * @param {{ startTime?: number|null }} [options]
     */
    setCrashed(value, options = {}) {
      phase = 'crashed';
      exitComplete = false;
      multiplierDone = false;
      pendingWaiting = null;
      clearMultTimers();
      hideWaiting(false);
      lastWholeSecond = -1;

      const onExitComplete = () => {
        exitComplete = true;
        flight.prepareNextRound({});
        tryRevealWaiting();
      };

      if (value == null || !Number.isFinite(Number(value))) {
        multiplierSlot.hidden = true;
        multiplierEl.textContent = '';
        multiplierDone = true;
        flight.setCrashed(null, { onExitComplete, startTime: options.startTime });
        return;
      }

      const numeric = Number(value);
      showMultiplier(numeric);
      flight.setCrashed(numeric, { onExitComplete, startTime: options.startTime });

      // Freeze → ~2s hold → soft fade (plane exit continues independently)
      multHoldTimer = window.setTimeout(() => {
        multHoldTimer = 0;
        beginMultiplierFade();
      }, MULT_HOLD_MS);
    },

    destroy() {
      clearMultTimers();
      activityHud.destroy();
      flight.destroy();
    },
  };
}
