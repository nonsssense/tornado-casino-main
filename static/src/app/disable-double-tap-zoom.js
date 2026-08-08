/**
 * Disable accidental double-tap zoom in Telegram WebViews / iOS Safari.
 * Keeps single taps, scrolling, and pinch-zoom (when the WebView allows it).
 *
 * Important: never call preventDefault() on interactive controls. Blocking
 * touchend default suppresses the synthesized click, which makes rapid taps
 * on buttons (+/− steppers, etc.) feel unresponsive.
 */

const DOUBLE_TAP_MS = 320;

/**
 * Elements that must always receive click / activation from touch.
 * Matches form fields and typical tappables used across the app.
 */
const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'summary',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[contenteditable="true"]',
  '[contenteditable=""]',
].join(', ');

/** @type {number} */
let lastTouchEndAt = 0;

/**
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isInteractiveControl(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
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
      // Let buttons / links / inputs keep every synthesized click.
      if (isInteractiveControl(event.target)) return;
      if (event.touches && event.touches.length > 1) return;

      // Second tap on non-interactive surface — block WebView double-tap zoom.
      event.preventDefault();
    },
    { capture: true, passive: false },
  );
}
