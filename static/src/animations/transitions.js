/**
 * Shared motion constants aligned with static/styles/tokens.css
 */

export const TRANSITION_DURATION = '200ms';
export const EASING = 'ease-out';

export const DURATION = {
  fast: 100,
  base: 200,
  slow: 220,
  sheet: 200,
};

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @returns {Promise<void>}
 */
export function waitFrames(count = 2) {
  return new Promise((resolve) => {
    let remaining = count;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
