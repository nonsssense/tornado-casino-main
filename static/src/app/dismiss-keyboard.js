/**
 * Global outside-tap keyboard dismissal for Telegram Mini App inputs.
 */

import { hideTelegramKeyboard } from './telegram.js';

/**
 * @param {EventTarget|null} target
 * @returns {HTMLElement|null}
 */
function editableFrom(target) {
  if (!(target instanceof Element)) return null;
  const el = target.closest('input, textarea, select, [contenteditable="true"]');
  return el instanceof HTMLElement ? el : null;
}

/**
 * @param {Element|null} el
 * @returns {boolean}
 */
function isTextEditable(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'hidden', 'range', 'color'].includes(type);
}

/**
 * Install once at app boot. Safe to call multiple times.
 */
export function initDismissKeyboardOnOutsideTap() {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.keyboardDismissGuard === '1') return;
  document.documentElement.dataset.keyboardDismissGuard = '1';

  document.addEventListener(
    'pointerdown',
    (event) => {
      const active = document.activeElement;
      if (!isTextEditable(active)) return;

      const tappedEditable = editableFrom(event.target);
      if (tappedEditable && (tappedEditable === active || active.contains(tappedEditable))) {
        return;
      }

      // Another field — let focus move naturally; no forced hide.
      if (tappedEditable) return;

      try {
        active.blur();
      } catch {
        // ignore
      }
      hideTelegramKeyboard();
    },
    true,
  );
}
