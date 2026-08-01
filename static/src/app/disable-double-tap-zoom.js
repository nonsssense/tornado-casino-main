/**
 * Disable accidental double-tap zoom in Telegram WebViews / iOS Safari.
 * Keeps single taps, scrolling, and pinch-zoom (when the WebView allows it).
 */

const DOUBLE_TAP_MS = 320;

/** @type {number} */
let lastTouchEndAt = 0;

/**
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isFormControl(target) {
  if (!(target instanceof Element)) return false;
  const el = target.closest('input, textarea, select, [contenteditable="true"]');
  return Boolean(el);
}

/**
 * Install once at app boot. Safe to call multiple times.
 */
export function initDisableDoubleTapZoom() {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.doubleTapZoomGuard === '1') return;
  document.documentElement.dataset.doubleTapZoomGuard = '1';

  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      const elapsed = now - lastTouchEndAt;
      lastTouchEndAt = now;

      if (elapsed > DOUBLE_TAP_MS || elapsed <= 0) return;
      if (isFormControl(event.target)) return;
      if (event.touches && event.touches.length > 1) return;

      // Second tap in the pair — block WebView zoom without blocking the first tap.
      event.preventDefault();
    },
    { capture: true, passive: false },
  );
}
