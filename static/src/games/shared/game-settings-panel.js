/**
 * In-game settings panel — shared Sound / Haptic toggles for Dice & Plinko.
 */

import { createElement } from '../../utils/dom.js';
import { settingsService } from '../../services/settings.service.js';
import { t } from '../../i18n/index.js';

/** Shared stroke language across game chrome icons. */
const ICON_STROKE = '1.75';

/** Three-slider settings glyph (recreated from assets/setingassetforgames.png). */
const ICON_SETTINGS = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M7 4v16"/>
  <path d="M12 4v16"/>
  <path d="M17 4v16"/>
  <rect x="4.75" y="6" width="4.5" height="3.25" rx="1.25" fill="currentColor" stroke="none"/>
  <rect x="9.75" y="10.375" width="4.5" height="3.25" rx="1.25" fill="currentColor" stroke="none"/>
  <rect x="14.75" y="14.75" width="4.5" height="3.25" rx="1.25" fill="currentColor" stroke="none"/>
</svg>`.trim();

const ICON_SOUND = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M11 5 6 9H3v6h3l5 4V5z"/>
  <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
  <path d="M18.5 5.5a9 9 0 0 1 0 13"/>
</svg>`.trim();

const ICON_HAPTIC = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="8" y="3" width="8" height="18" rx="2"/>
  <path d="M4 9v6M20 9v6M1.5 11v2M22.5 11v2"/>
</svg>`.trim();

let panelSeq = 0;

/**
 * @param {object} [options]
 * @param {(open: boolean) => void} [options.onOpenChange]
 * @param {string} [options.buttonClassName]
 * @param {string} [options.id]
 * @returns {{
 *   element: HTMLElement,
 *   button: HTMLButtonElement,
 *   isOpen: () => boolean,
 *   open: () => void,
 *   close: () => void,
 *   toggle: () => void,
 *   sync: () => void,
 *   destroy: () => void,
 * }}
 */
export function createGameSettingsPanel(options = {}) {
  /** @type {(open: boolean) => void} */
  let onOpenChange = options.onOpenChange;
  let openState = false;
  let saving = false;
  const panelId = options.id || `game-settings-panel-${++panelSeq}`;

  const settings = {
    sound_enabled: true,
    haptic_enabled: true,
    ...settingsService.getSettings(),
  };

  const buttonIcon = createElement('span', {
    className: 'game-settings-trigger__icon',
    html: ICON_SETTINGS,
  });

  const buttonClasses = [
    'game-settings-trigger',
    options.buttonClassName,
  ].filter(Boolean).join(' ');

  const button = createElement('button', {
    className: buttonClasses,
    attrs: {
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': panelId,
      'aria-label': t('games.settings.aria'),
      onClick: () => toggle(),
    },
    children: [buttonIcon],
  });

  const soundToggle = createToggleRow({
    iconHtml: ICON_SOUND,
    labelKey: 'games.settings.sound',
    getValue: () => settings.sound_enabled,
    onToggle: () => void commitPatch({ sound_enabled: !settings.sound_enabled }),
  });

  const hapticToggle = createToggleRow({
    iconHtml: ICON_HAPTIC,
    labelKey: 'games.settings.haptic',
    getValue: () => settings.haptic_enabled,
    onToggle: () => void commitPatch({ haptic_enabled: !settings.haptic_enabled }),
  });

  const panel = createElement('div', {
    className: 'game-settings-panel',
    attrs: {
      id: panelId,
      role: 'dialog',
      'aria-label': t('games.settings.title'),
      'aria-hidden': 'true',
    },
    children: [
      createElement('p', {
        className: 'game-settings-panel__title',
        text: t('games.settings.title'),
      }),
      createElement('div', {
        className: 'game-settings-panel__list',
        children: [soundToggle.row, hapticToggle.row],
      }),
    ],
  });

  const element = createElement('div', {
    className: 'game-settings-panel-root',
    children: [panel],
  });

  function syncRows() {
    soundToggle.sync();
    hapticToggle.sync();
  }

  function syncFromService() {
    const next = settingsService.getSettings();
    settings.sound_enabled = next.sound_enabled !== false;
    settings.haptic_enabled = next.haptic_enabled !== false;
    syncRows();
  }

  /**
   * @param {{ sound_enabled?: boolean, haptic_enabled?: boolean }} patch
   */
  async function commitPatch(patch) {
    if (saving) return;
    saving = true;

    const previous = { ...settings };
    if (patch.sound_enabled != null) settings.sound_enabled = Boolean(patch.sound_enabled);
    if (patch.haptic_enabled != null) settings.haptic_enabled = Boolean(patch.haptic_enabled);
    syncRows();

    try {
      await settingsService.save(patch);
      syncFromService();
    } catch {
      settings.sound_enabled = previous.sound_enabled;
      settings.haptic_enabled = previous.haptic_enabled;
      syncRows();
    } finally {
      saving = false;
    }
  }

  function setOpen(next) {
    const resolved = Boolean(next);
    if (openState === resolved) return;
    openState = resolved;
    button.setAttribute('aria-expanded', openState ? 'true' : 'false');
    button.classList.toggle('game-settings-trigger--open', openState);
    panel.classList.toggle('game-settings-panel--open', openState);
    panel.setAttribute('aria-hidden', openState ? 'false' : 'true');
    element.classList.toggle('game-settings-panel-root--open', openState);
    onOpenChange?.(openState);
  }

  function open() {
    syncFromService();
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  function toggle() {
    if (openState) close();
    else open();
  }

  function handlePointerDown(event) {
    if (!openState) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (panel.contains(target) || button.contains(target)) return;
    close();
  }

  function handleKeyDown(event) {
    if (!openState) return;
    if (event.key === 'Escape') close();
  }

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('keydown', handleKeyDown);

  syncRows();

  return {
    element,
    button,
    isOpen: () => openState,
    open,
    close,
    toggle,
    sync: syncFromService,
    destroy() {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      close();
    },
  };
}

/**
 * @param {object} options
 * @param {string} options.iconHtml
 * @param {string} options.labelKey
 * @param {() => boolean} options.getValue
 * @param {() => void} options.onToggle
 */
function createToggleRow(options) {
  const label = createElement('span', {
    className: 'game-settings-panel__label',
    text: t(options.labelKey),
  });

  const stateLabel = createElement('span', {
    className: 'game-settings-panel__state',
  });

  const switchEl = createElement('button', {
    className: 'game-settings-toggle',
    attrs: {
      type: 'button',
      role: 'switch',
      onClick: () => options.onToggle(),
    },
    children: [
      createElement('span', {
        className: 'game-settings-toggle__track',
        children: [
          createElement('span', {
            className: 'game-settings-toggle__thumb',
          }),
        ],
      }),
    ],
  });

  const row = createElement('div', {
    className: 'game-settings-panel__row',
    children: [
      createElement('span', {
        className: 'game-settings-panel__icon',
        html: options.iconHtml,
      }),
      createElement('div', {
        className: 'game-settings-panel__copy',
        children: [label, stateLabel],
      }),
      switchEl,
    ],
  });

  function sync() {
    const on = Boolean(options.getValue());
    switchEl.setAttribute('aria-checked', on ? 'true' : 'false');
    switchEl.classList.toggle('game-settings-toggle--on', on);
    stateLabel.textContent = on
      ? t('games.settings.on')
      : t('games.settings.off');
    row.classList.toggle('game-settings-panel__row--off', !on);
  }

  return { row, sync };
}
