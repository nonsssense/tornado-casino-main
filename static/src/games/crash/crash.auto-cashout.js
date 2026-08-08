/**
 * AutoCashOut — optional target multiplier sent with the bet.
 * Server executes cashout when the live multiplier reaches this value.
 *
 * UX: toggle enable/disable + popup configuration (no immediate system keyboard).
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { hideTelegramKeyboard } from '../../app/telegram.js';
import {
  CRASH_AUTO_CASHOUT_MAX,
  CRASH_AUTO_CASHOUT_MIN,
  CRASH_AUTO_CASHOUT_PRESETS,
  CRASH_AUTO_CASHOUT_DEFAULT,
} from './crash.constants.js';

/**
 * @param {string} raw
 * @returns {number|null}
 */
function parseMultiplier(raw) {
  const trimmed = String(raw ?? '').trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.floor(value * 100 + 1e-9) / 100;
}

/**
 * Frontend UX clamp for first release. Backend still accepts higher values;
 * this popup simply never offers them.
 * @param {number|null} value
 * @returns {number|null}
 */
function clampMultiplier(value) {
  if (value == null) return null;
  if (!(value > CRASH_AUTO_CASHOUT_MIN)) return null;
  if (value > CRASH_AUTO_CASHOUT_MAX) return CRASH_AUTO_CASHOUT_MAX;
  return value;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatMultiplier(value) {
  return value.toFixed(2);
}

/**
 * @returns {{
 *   element: HTMLElement,
 *   getMultiplier: () => number|null,
 *   setDisabled: (disabled: boolean) => void,
 * }}
 */
export function createAutoCashOut() {
  /** @type {number} */
  let configuredMultiplier = CRASH_AUTO_CASHOUT_DEFAULT;
  let enabled = false;
  let disabled = false;
  /** @type {HTMLElement|null} */
  let activePopup = null;

  const toggleButton = createElement('button', {
    className: 'crash-auto-cashout__toggle',
    attrs: {
      type: 'button',
      'aria-pressed': 'false',
      'aria-label': t('crash.autoCashout.toggleAria'),
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) return;
        setEnabled(!enabled);
      },
    },
    children: [
      createElement('span', {
        className: 'crash-auto-cashout__label',
        text: t('crash.autoCashout.auto'),
      }),
    ],
  });

  const valueButton = createElement('button', {
    className: 'crash-auto-cashout__value-btn',
    attrs: {
      type: 'button',
      'aria-label': t('crash.autoCashout.aria'),
      'aria-haspopup': 'dialog',
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) return;
        openConfigPopup();
      },
    },
    children: [
      createElement('span', {
        className: 'crash-auto-cashout__value',
        text: formatMultiplier(configuredMultiplier),
      }),
      createElement('span', {
        className: 'crash-auto-cashout__suffix',
        text: '×',
      }),
    ],
  });

  const element = createElement('div', {
    className: 'crash-auto-cashout',
    attrs: {
      'aria-label': t('crash.autoCashout.aria'),
      role: 'group',
    },
    children: [toggleButton, valueButton],
  });

  function syncUi() {
    element.classList.toggle('crash-auto-cashout--on', enabled);
    element.classList.toggle('crash-auto-cashout--disabled', disabled);
    toggleButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    toggleButton.disabled = disabled;
    valueButton.disabled = disabled;
    const valueEl = valueButton.querySelector('.crash-auto-cashout__value');
    if (valueEl) valueEl.textContent = formatMultiplier(configuredMultiplier);
  }

  /**
   * @param {boolean} next
   */
  function setEnabled(next) {
    enabled = Boolean(next);
    if (enabled && configuredMultiplier == null) {
      configuredMultiplier = CRASH_AUTO_CASHOUT_DEFAULT;
    }
    syncUi();
  }

  function closeConfigPopup({ restoreFocus = true } = {}) {
    if (!activePopup) return;
    const popup = activePopup;
    activePopup = null;
    popup.classList.remove('crash-auto-cashout-popup--visible');
    hideTelegramKeyboard();
    setTimeout(() => {
      popup.remove();
      if (restoreFocus && !disabled) {
        valueButton.focus({ preventScroll: true });
      }
    }, 180);
  }

  function openConfigPopup() {
    if (activePopup) {
      closeConfigPopup({ restoreFocus: false });
    }

    /** @type {number} */
    let draft = configuredMultiplier;
    let customMode = false;

    const presetButtons = CRASH_AUTO_CASHOUT_PRESETS.map((preset) => {
      const btn = createElement('button', {
        className: 'crash-auto-cashout-popup__preset',
        attrs: {
          type: 'button',
          onClick: () => {
            draft = preset;
            customMode = false;
            customInput.value = formatMultiplier(preset);
            customPanel.hidden = true;
            hideTelegramKeyboard();
            syncPopupSelection();
          },
        },
        text: `${preset}×`,
      });
      btn.dataset.value = String(preset);
      return btn;
    });

    const customInput = createElement('input', {
      className: 'crash-auto-cashout-popup__custom-input',
      attrs: {
        type: 'text',
        inputmode: 'decimal',
        enterkeyhint: 'done',
        autocomplete: 'off',
        spellcheck: 'false',
        placeholder: formatMultiplier(CRASH_AUTO_CASHOUT_DEFAULT),
        value: formatMultiplier(draft),
        'aria-label': t('crash.autoCashout.customAria'),
        onInput: (event) => {
          const parsed = clampMultiplier(parseMultiplier(event.target.value));
          if (parsed != null) {
            draft = parsed;
            syncPopupSelection();
          }
        },
        onBlur: (event) => {
          const parsed = clampMultiplier(parseMultiplier(event.target.value));
          if (parsed != null) {
            draft = parsed;
            event.target.value = formatMultiplier(parsed);
          } else {
            event.target.value = formatMultiplier(draft);
          }
          syncPopupSelection();
          hideTelegramKeyboard();
        },
      },
    });

    const customPanel = createElement('div', {
      className: 'crash-auto-cashout-popup__custom-panel',
      attrs: { hidden: true },
      children: [
        createElement('label', {
          className: 'crash-auto-cashout-popup__custom-label',
          text: t('crash.autoCashout.customHint'),
        }),
        createElement('div', {
          className: 'crash-auto-cashout-popup__custom-row',
          children: [
            customInput,
            createElement('span', {
              className: 'crash-auto-cashout-popup__custom-suffix',
              text: '×',
            }),
          ],
        }),
      ],
    });

    const customToggle = createElement('button', {
      className: 'crash-auto-cashout-popup__custom-toggle',
      attrs: {
        type: 'button',
        onClick: () => {
          customMode = true;
          customPanel.hidden = false;
          syncPopupSelection();
          requestAnimationFrame(() => {
            customInput.focus({ preventScroll: true });
            customInput.select();
          });
        },
      },
      text: t('crash.autoCashout.custom'),
    });

    const errorEl = createElement('p', {
      className: 'crash-auto-cashout-popup__error',
      attrs: { hidden: true, role: 'alert' },
      text: '',
    });

    function syncPopupSelection() {
      presetButtons.forEach((btn) => {
        const value = Number.parseFloat(btn.dataset.value || '');
        btn.classList.toggle(
          'crash-auto-cashout-popup__preset--active',
          !customMode && Math.abs(value - draft) < 1e-9,
        );
      });
      customToggle.classList.toggle(
        'crash-auto-cashout-popup__custom-toggle--active',
        customMode,
      );
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    function commitDraft() {
      let next = draft;
      if (customMode) {
        next = clampMultiplier(parseMultiplier(customInput.value));
      }
      if (next == null || !(next > CRASH_AUTO_CASHOUT_MIN)) {
        errorEl.textContent = t('crash.autoCashout.errorMin');
        errorEl.hidden = false;
        return;
      }
      if (next > CRASH_AUTO_CASHOUT_MAX) {
        errorEl.textContent = t('crash.autoCashout.errorMax');
        errorEl.hidden = false;
        return;
      }
      configuredMultiplier = next;
      enabled = true;
      syncUi();
      closeConfigPopup();
    }

    const dialog = createElement('div', {
      className: 'crash-auto-cashout-popup__dialog',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'crash-auto-cashout-popup-title',
        onClick: (event) => event.stopPropagation(),
      },
      children: [
        createElement('h2', {
          className: 'crash-auto-cashout-popup__title',
          attrs: { id: 'crash-auto-cashout-popup-title' },
          text: t('crash.autoCashout.popupTitle'),
        }),
        createElement('div', {
          className: 'crash-auto-cashout-popup__presets',
          children: presetButtons,
        }),
        customToggle,
        customPanel,
        errorEl,
        createElement('div', {
          className: 'crash-auto-cashout-popup__actions',
          children: [
            createElement('button', {
              className: 'crash-auto-cashout-popup__btn crash-auto-cashout-popup__btn--cancel',
              attrs: {
                type: 'button',
                onClick: () => closeConfigPopup(),
              },
              text: t('crash.autoCashout.cancel'),
            }),
            createElement('button', {
              className: 'crash-auto-cashout-popup__btn crash-auto-cashout-popup__btn--save',
              attrs: {
                type: 'button',
                onClick: commitDraft,
              },
              text: t('crash.autoCashout.save'),
            }),
          ],
        }),
      ],
    });

    const backdrop = createElement('div', {
      className: 'crash-auto-cashout-popup',
      attrs: {
        role: 'presentation',
        onClick: () => closeConfigPopup(),
        onKeydown: (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeConfigPopup();
          }
        },
      },
      children: [dialog],
    });

    document.body.appendChild(backdrop);
    activePopup = backdrop;
    syncPopupSelection();

    requestAnimationFrame(() => {
      backdrop.classList.add('crash-auto-cashout-popup--visible');
    });
  }

  syncUi();

  return {
    element,
    getMultiplier: () => (enabled ? configuredMultiplier : null),
    setDisabled(nextDisabled) {
      disabled = Boolean(nextDisabled);
      if (disabled) closeConfigPopup({ restoreFocus: false });
      syncUi();
    },
  };
}
