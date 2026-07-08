/**
 * BottomSheet — premium native mobile bottom sheet.
 *
 * Shared layout for wallet / profile / future sheets.
 * Size `balance` preserves the taller Balance overlay exception.
 */

import { createElement } from '../utils/dom.js';
import { DURATION } from '../animations/transitions.js';

const SWIPE_CLOSE_THRESHOLD = 80;

/**
 * @param {object} options
 * @param {HTMLElement} options.content
 * @param {HTMLElement} [options.header] - optional fixed header above scroll
 * @param {function} [options.onClose]
 * @param {function} [options.onBeforeRemove]
 * @param {string} [options.ariaLabel]
 * @param {string} [options.panelClass]
 * @param {'standard'|'balance'} [options.size]
 * @returns {{ element: HTMLElement, footer: HTMLElement, open: () => void, close: () => Promise<void> }}
 */
export function BottomSheet(options = {}) {
  const {
    content,
    header = null,
    onClose,
    onBeforeRemove,
    ariaLabel = 'Dialog',
    panelClass = '',
    size = 'standard',
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
    if (footer.contains(event.target)) return;
    if (headerSlot && headerSlot.contains(event.target)) return;

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
    sheet.style.transform = `translate3d(0, ${delta}px, 0)`;
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
    if (footer.contains(event.target)) return;
    if (headerSlot && headerSlot.contains(event.target)) return;
    if (scroll.scrollTop > 0) return;
    onTouchStart(event);
  }, { passive: true });

  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd);
  document.addEventListener('touchcancel', onTouchEnd);

  function open() {
    root.setAttribute('aria-hidden', 'false');
    lockScroll();

    // Double rAF: paint closed state first, then animate in (no flash)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.add('bottom-sheet--visible');
      });
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
        if (onBeforeRemove) onBeforeRemove();
        root.remove();
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchEnd);
        if (onClose) onClose();
        resolve();
      }, DURATION.sheet);
    });
  }

  return { element: root, footer, open, close };
}
