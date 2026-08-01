/**
 * BottomSheet — premium native mobile bottom sheet.
 *
 * Shared layout for wallet / profile / future sheets.
 * Size `balance` preserves the taller Balance overlay exception.
 */

import { createElement } from '../utils/dom.js';
import { t } from '../i18n/index.js';
import { DURATION } from '../animations/transitions.js';

const DISMISS_THRESHOLD_PX = 96;
const DISMISS_VELOCITY_PX_MS = 0.55;
const DIRECTION_LOCK_PX = 8;

/**
 * @param {object} options
 * @param {HTMLElement} options.content
 * @param {HTMLElement} [options.header] - optional fixed header above scroll
 * @param {function} [options.onClose]
 * @param {function} [options.onBeforeRemove]
 * @param {string} [options.ariaLabel]
 * @param {string} [options.panelClass]
 * @param {'standard'|'balance'} [options.size]
 * @param {boolean} [options.manageBodyScroll=true] - set false when stacking above another sheet
 * @returns {{ element: HTMLElement, footer: HTMLElement, open: () => void, close: () => Promise<void> }}
 */
export function BottomSheet(options = {}) {
  const {
    content,
    header = null,
    onClose,
    onBeforeRemove,
    ariaLabel = t('common.dialog'),
    panelClass = '',
    size = 'standard',
    manageBodyScroll = true,
  } = options;

  let isClosing = false;

  /** @type {null | 'undecided' | 'scroll' | 'dismiss' | 'ignore'} */
  let gestureMode = null;
  let dragFromHandle = false;
  let dragStartY = 0;
  let dragStartX = 0;
  let dragOffsetY = 0;
  let lastMoveY = 0;
  let lastMoveTime = 0;
  let velocityY = 0;
  let listenersBound = false;

  const backdrop = createElement('button', {
    className: 'bottom-sheet__backdrop',
    attrs: {
      type: 'button',
      'aria-label': t('common.close'),
    },
  });

  const handle = createElement('div', {
    className: 'bottom-sheet__handle',
    attrs: { 'aria-hidden': 'true' },
    children: [
      createElement('span', { className: 'bottom-sheet__handle-bar' }),
    ],
  });

  const headerSlot = header
    ? createElement('div', {
      className: 'bottom-sheet__header',
      children: [header],
    })
    : null;

  const scroll = createElement('div', {
    className: 'bottom-sheet__scroll',
    children: [content],
  });

  const footer = createElement('div', {
    className: 'bottom-sheet__footer',
  });

  const sheetClasses = [
    'bottom-sheet__panel',
    size === 'balance' ? 'bottom-sheet__panel--size-balance' : 'bottom-sheet__panel--size-standard',
  ];
  if (panelClass) sheetClasses.push(panelClass);

  const panelChildren = [handle];
  if (headerSlot) panelChildren.push(headerSlot);
  panelChildren.push(scroll, footer);

  const sheet = createElement('div', {
    className: sheetClasses.join(' '),
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': ariaLabel },
    children: panelChildren,
  });

  const root = createElement('div', {
    className: [
      'bottom-sheet',
      size === 'balance' ? 'bottom-sheet--balance' : 'bottom-sheet--standard',
    ].join(' '),
    attrs: { 'aria-hidden': 'true' },
    children: [backdrop, sheet],
  });

  function lockScroll() {
    if (!manageBodyScroll) return;
    document.documentElement.classList.add('bottom-sheet-open');
  }

  function unlockScroll() {
    if (!manageBodyScroll) return;
    document.documentElement.classList.remove('bottom-sheet-open');
  }

  function isScrollAtTop() {
    return scroll.scrollTop <= 0;
  }

  function applyDragOffset(offsetY) {
    dragOffsetY = Math.max(0, offsetY);
    sheet.style.transform = `translate3d(0, ${dragOffsetY}px, 0)`;
  }

  function clearDragStyles() {
    sheet.classList.remove('bottom-sheet__panel--dragging');
    sheet.style.transform = '';
    dragOffsetY = 0;
  }

  function requestClose(fromDrag = false) {
    if (isClosing) return;
    close({ fromDrag });
  }

  backdrop.addEventListener('click', () => requestClose(false));

  function resetGesture() {
    gestureMode = null;
    dragFromHandle = false;
    dragStartY = 0;
    dragStartX = 0;
    lastMoveY = 0;
    lastMoveTime = 0;
    velocityY = 0;
  }

  function beginGesture(clientX, clientY, fromHandle) {
    if (isClosing) return false;

    dragFromHandle = fromHandle;
    dragStartX = clientX;
    dragStartY = clientY;
    lastMoveY = clientY;
    lastMoveTime = performance.now();
    velocityY = 0;
    dragOffsetY = 0;
    gestureMode = 'undecided';
    return true;
  }

  function updateGesture(clientX, clientY, event) {
    if (!gestureMode || gestureMode === 'ignore' || isClosing) return;

    const now = performance.now();
    const dt = Math.max(1, now - lastMoveTime);
    const dyStep = clientY - lastMoveY;
    velocityY = dyStep / dt;
    lastMoveY = clientY;
    lastMoveTime = now;

    const deltaY = clientY - dragStartY;
    const deltaX = clientX - dragStartX;

    if (gestureMode === 'undecided') {
      if (Math.abs(deltaX) < DIRECTION_LOCK_PX && Math.abs(deltaY) < DIRECTION_LOCK_PX) {
        return;
      }

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        gestureMode = 'ignore';
        return;
      }

      if (deltaY < 0) {
        gestureMode = 'scroll';
        return;
      }

      // Downward: dismiss from the handle, or when content is already at the top
      if (dragFromHandle || isScrollAtTop()) {
        gestureMode = 'dismiss';
        sheet.classList.add('bottom-sheet__panel--dragging');
      } else {
        gestureMode = 'scroll';
        return;
      }
    }

    if (gestureMode === 'dismiss') {
      // Capture before Telegram / browser overscroll can react
      if (event.cancelable) event.preventDefault();
      applyDragOffset(deltaY);
    }
  }

  function endGesture() {
    if (!gestureMode || isClosing) {
      resetGesture();
      return;
    }

    const mode = gestureMode;
    const offset = dragOffsetY;
    const velocity = velocityY;

    if (mode === 'dismiss') {
      const shouldClose =
        offset > DISMISS_THRESHOLD_PX || velocity > DISMISS_VELOCITY_PX_MS;

      if (shouldClose) {
        sheet.classList.remove('bottom-sheet__panel--dragging');
        requestClose(true);
        resetGesture();
        return;
      }

      // Smoothly return to the open position
      sheet.classList.remove('bottom-sheet__panel--dragging');
      sheet.style.transform = 'translate3d(0, 0, 0)';
      window.setTimeout(() => {
        if (!isClosing) sheet.style.transform = '';
      }, DURATION.sheet);
    }

    resetGesture();
  }

  function onTouchStart(event) {
    if (event.touches.length !== 1) return;

    const target = /** @type {Node} */ (event.target);
    if (footer.contains(target)) return;
    if (headerSlot && headerSlot.contains(target)) return;

    const fromHandle = handle === target || handle.contains(target);
    const touch = event.touches[0];
    beginGesture(touch.clientX, touch.clientY, fromHandle);
  }

  function onTouchMove(event) {
    if (!gestureMode || gestureMode === 'ignore') return;
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    updateGesture(touch.clientX, touch.clientY, event);
  }

  function onTouchEnd() {
    endGesture();
  }

  /**
   * Document-level capture: while dismissing, stop the event so Telegram
   * never receives the downward swipe that would collapse the Mini App.
   */
  function onDocumentTouchMove(event) {
    if (gestureMode !== 'dismiss') return;
    if (event.cancelable) event.preventDefault();
  }

  function bindGestureListeners() {
    if (listenersBound) return;
    listenersBound = true;
    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd);
    sheet.addEventListener('touchcancel', onTouchEnd);
    document.addEventListener('touchmove', onDocumentTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true });
    document.addEventListener('touchcancel', onTouchEnd, { capture: true });
  }

  function unbindGestureListeners() {
    if (!listenersBound) return;
    listenersBound = false;
    sheet.removeEventListener('touchstart', onTouchStart);
    sheet.removeEventListener('touchmove', onTouchMove);
    sheet.removeEventListener('touchend', onTouchEnd);
    sheet.removeEventListener('touchcancel', onTouchEnd);
    document.removeEventListener('touchmove', onDocumentTouchMove, { capture: true });
    document.removeEventListener('touchend', onTouchEnd, { capture: true });
    document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
  }

  function open() {
    root.setAttribute('aria-hidden', 'false');
    lockScroll();
    bindGestureListeners();

    // Double rAF: paint closed state first, then animate in (no flash)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.add('bottom-sheet--visible');
      });
    });
  }

  /**
   * @param {{ fromDrag?: boolean }} [opts]
   */
  function close(opts = {}) {
    if (isClosing) {
      return Promise.resolve();
    }

    isClosing = true;
    const fromDrag = Boolean(opts.fromDrag);
    const dismissOffset = dragOffsetY;

    root.classList.remove('bottom-sheet--visible');
    root.classList.add('bottom-sheet--closing');

    if (fromDrag && dismissOffset > 0) {
      // Continue downward from the current drag offset
      sheet.classList.remove('bottom-sheet__panel--dragging');
      sheet.style.transform = 'translate3d(0, 110%, 0)';
    } else {
      sheet.style.transform = '';
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        unlockScroll();
        unbindGestureListeners();
        clearDragStyles();
        if (onBeforeRemove) onBeforeRemove();
        root.remove();
        if (onClose) onClose();
        resolve();
      }, DURATION.sheet);
    });
  }

  return { element: root, footer, open, close };
}
