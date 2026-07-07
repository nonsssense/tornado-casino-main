/**
 * BottomSheet — premium floating modal that slides up over the current screen.
 */

import { createElement } from '../utils/dom.js';
import { DURATION } from '../animations/transitions.js';

const SWIPE_CLOSE_THRESHOLD = 80;

/**
 * @param {object} options
 * @param {HTMLElement} options.content
 * @param {function} [options.onClose]
 * @param {string} [options.ariaLabel]
 * @param {string} [options.panelClass] - BEM modifier for .bottom-sheet__panel
 * @returns {{ element: HTMLElement, open: () => void, close: () => Promise<void> }}
 */
export function BottomSheet(options = {}) {
  const {
    content,
    onClose,
    ariaLabel = 'Dialog',
    panelClass = '',
  } = options;

  let isClosing = false;
  let dragStartY = 0;
  let dragCurrentY = 0;
  let isDragging = false;

  const backdrop = createElement('button', {
    className: 'bottom-sheet__backdrop',
    attrs: {
      type: 'button',
      'aria-label': 'Close',
    },
  });

  const handle = createElement('div', {
    className: 'bottom-sheet__handle',
    attrs: { 'aria-hidden': 'true' },
    children: [
      createElement('span', { className: 'bottom-sheet__handle-bar' }),
    ],
  });

  const scroll = createElement('div', {
    className: 'bottom-sheet__scroll',
    children: [content],
  });

  const sheetClasses = ['bottom-sheet__panel'];
  if (panelClass) sheetClasses.push(panelClass);

  const sheet = createElement('div', {
    className: sheetClasses.join(' '),
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': ariaLabel },
    children: [handle, scroll],
  });

  const root = createElement('div', {
    className: 'bottom-sheet',
    attrs: { 'aria-hidden': 'true' },
    children: [backdrop, sheet],
  });

  function lockScroll() {
    document.documentElement.classList.add('bottom-sheet-open');
  }

  function unlockScroll() {
    document.documentElement.classList.remove('bottom-sheet-open');
  }

  function requestClose() {
    if (isClosing) return;
    close();
  }

  backdrop.addEventListener('click', requestClose);

  function onTouchStart(event) {
    if (isClosing) return;

    const touch = event.touches[0];
    dragStartY = touch.clientY;
    dragCurrentY = touch.clientY;
    isDragging = true;
    sheet.classList.add('bottom-sheet__panel--dragging');
  }

  function onTouchMove(event) {
    if (!isDragging || isClosing) return;

    dragCurrentY = event.touches[0].clientY;
    const delta = Math.max(0, dragCurrentY - dragStartY);
    sheet.style.transform = `translateY(${delta}px)`;
  }

  function onTouchEnd() {
    if (!isDragging || isClosing) return;

    isDragging = false;
    sheet.classList.remove('bottom-sheet__panel--dragging');

    const delta = dragCurrentY - dragStartY;

    if (delta > SWIPE_CLOSE_THRESHOLD) {
      requestClose();
      return;
    }

    sheet.style.transform = '';
  }

  handle.addEventListener('touchstart', onTouchStart, { passive: true });
  sheet.addEventListener('touchstart', (event) => {
    if (event.target === handle || handle.contains(event.target)) return;
    if (scroll.scrollTop > 0) return;
    onTouchStart(event);
  }, { passive: true });

  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd);
  document.addEventListener('touchcancel', onTouchEnd);

  function open() {
    root.setAttribute('aria-hidden', 'false');
    lockScroll();

    requestAnimationFrame(() => {
      root.classList.add('bottom-sheet--visible');
    });
  }

  function close() {
    if (isClosing) {
      return Promise.resolve();
    }

    isClosing = true;
    root.classList.remove('bottom-sheet--visible');
    root.classList.add('bottom-sheet--closing');
    sheet.style.transform = '';

    return new Promise((resolve) => {
      setTimeout(() => {
        unlockScroll();
        root.remove();
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchEnd);
        if (onClose) onClose();
        resolve();
      }, DURATION.slow);
    });
  }

  return { element: root, open, close };
}
