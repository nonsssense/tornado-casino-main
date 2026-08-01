/**
 * Dice pointer animation along the outer wheel edge.
 * Uses backend-provided roll only — never generates outcomes.
 */

import { rollToDegrees } from './dice.utils.js';

const SPIN_DURATION_MS = 2400;
const MIN_EXTRA_ROTATIONS = 4;

/** @type {number} */
let activeRaf = 0;

/** @type {boolean} */
let cancelled = false;

/**
 * Cubic ease-out for premium deceleration.
 * @param {number} t 0–1
 */
function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/**
 * Convert the pointer's current angle back into its represented roll.
 * @param {number} degrees
 * @returns {number}
 */
function rotationToRoll(degrees) {
  const sectorDegrees = ((degrees - 180) % 360 + 360) % 360;
  return Math.min(99, Math.floor((sectorDegrees / 360) * 100));
}

/**
 * Stop any in-flight roll animation.
 */
export function cancelDiceRollAnimation() {
  cancelled = true;
  if (activeRaf) {
    cancelAnimationFrame(activeRaf);
    activeRaf = 0;
  }
}

/**
 * @param {number} roll - Backend result 0–99
 * @param {{ getPointerDegrees: () => number, setPointerDegrees: (deg: number, animate?: boolean) => void, pointer: HTMLElement }} wheel
 * @returns {Promise<void>}
 */
export function animateDiceRoll(roll, wheel) {
  if (!wheel?.pointer) return Promise.resolve();

  cancelDiceRollAnimation();
  cancelled = false;

  const targetDeg = rollToDegrees(roll);
  const startDeg = wheel.getPointerDegrees?.() ?? 0;
  const normalizedStart = ((startDeg % 360) + 360) % 360;
  let delta = targetDeg - normalizedStart;
  if (delta < 0) delta += 360;
  const totalRotation = startDeg + MIN_EXTRA_ROTATIONS * 360 + delta;

  wheel.pointer.style.transition = 'none';

  return new Promise((resolve) => {
    const startTime = performance.now();

    function frame(now) {
      activeRaf = 0;
      if (cancelled) {
        resolve();
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / SPIN_DURATION_MS, 1);
      const eased = easeOutCubic(progress);
      const current = startDeg + (totalRotation - startDeg) * eased;

      wheel.pointer.style.transform = `rotate(${current}deg)`;
      wheel.setSpinRoll?.(rotationToRoll(current));

      if (progress < 1) {
        activeRaf = requestAnimationFrame(frame);
      } else {
        wheel.setPointerDegrees(totalRotation % 360, false);
        wheel.setSpinRoll?.(roll);
        resolve();
      }
    }

    activeRaf = requestAnimationFrame(frame);
  });
}
