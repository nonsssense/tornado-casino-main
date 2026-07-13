/**
 * Dice pointer animation along the outer wheel edge.
 * Uses backend-provided roll only — never generates outcomes.
 */

import { rollToDegrees } from './dice.utils.js';

const SPIN_DURATION_MS = 2400;
const MIN_EXTRA_ROTATIONS = 4;

/**
 * Cubic ease-out for premium deceleration.
 * @param {number} t 0–1
 */
function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/**
 * @param {number} roll - Backend result 0–99
 * @param {{ getPointerDegrees: () => number, setPointerDegrees: (deg: number, animate?: boolean) => void, pointer: HTMLElement }} wheel
 * @returns {Promise<void>}
 */
export function animateDiceRoll(roll, wheel) {
  if (!wheel?.pointer) return Promise.resolve();

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
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / SPIN_DURATION_MS, 1);
      const eased = easeOutCubic(progress);
      const current = startDeg + (totalRotation - startDeg) * eased;

      wheel.pointer.style.transform = `rotate(${current}deg)`;

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        wheel.setPointerDegrees(totalRotation % 360, false);
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}
