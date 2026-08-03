/**
 * User settings service — loads preferences for Sound Manager and in-game settings.
 * Applies sound_enabled to soundManager and haptic_enabled to Telegram haptics.
 * Guest Mode keeps preferences locally; server sync happens only when authenticated.
 */

import { fetchSettings, updateSettings } from '../api/settings.js';
import { soundManager } from './sound.service.js';
import { setHapticEnabledResolver } from '../app/telegram.js';
import { isAuthenticated } from './auth-state.js';

/** @type {{ sound_enabled: boolean, haptic_enabled: boolean }} */
let cached = {
  sound_enabled: true,
  haptic_enabled: true,
};

/** @type {boolean} */
let loaded = false;

function applyLocalPreferences() {
  soundManager.setEnabled(cached.sound_enabled);
  // Keep Telegram haptics gated by the stored preference.
  setHapticEnabledResolver(() => cached.haptic_enabled !== false);
}

export const settingsService = {
  /**
   * @returns {{ sound_enabled: boolean, haptic_enabled: boolean }}
   */
  getSettings() {
    return { ...cached };
  },

  /**
   * @returns {boolean}
   */
  isSoundEnabled() {
    return Boolean(cached.sound_enabled);
  },

  /**
   * @returns {boolean}
   */
  isHapticEnabled() {
    return Boolean(cached.haptic_enabled);
  },

  /**
   * Fetch settings from the backend and sync Sound Manager.
   * @returns {Promise<{ sound_enabled: boolean, haptic_enabled: boolean }>}
   */
  async load() {
    if (!isAuthenticated()) {
      applyLocalPreferences();
      return this.getSettings();
    }

    try {
      const data = await fetchSettings();
      if (data && typeof data === 'object') {
        cached = {
          sound_enabled: data.sound_enabled !== false,
          haptic_enabled: data.haptic_enabled !== false,
        };
        loaded = true;
      }
    } catch {
      // Keep defaults when settings API is unavailable.
    }

    applyLocalPreferences();
    return this.getSettings();
  },

  /**
   * @param {{ sound_enabled?: boolean, haptic_enabled?: boolean }} patch
   * @returns {Promise<{ sound_enabled: boolean, haptic_enabled: boolean }>}
   */
  async save(patch) {
    cached = {
      sound_enabled: patch.sound_enabled !== undefined
        ? Boolean(patch.sound_enabled)
        : cached.sound_enabled,
      haptic_enabled: patch.haptic_enabled !== undefined
        ? Boolean(patch.haptic_enabled)
        : cached.haptic_enabled,
    };
    applyLocalPreferences();

    if (!isAuthenticated()) {
      loaded = true;
      return this.getSettings();
    }

    try {
      const data = await updateSettings(patch);
      cached = {
        sound_enabled: data?.sound_enabled !== false,
        haptic_enabled: data?.haptic_enabled !== false,
      };
      loaded = true;
      applyLocalPreferences();
    } catch {
      // Keep local preferences if server sync fails.
      loaded = true;
    }

    return this.getSettings();
  },

  /**
   * Wire haptic preference into Telegram helpers.
   * Prefer applyLocalPreferences via load/save — kept for explicit callers.
   */
  enableHapticPreferenceGate() {
    setHapticEnabledResolver(() => cached.haptic_enabled !== false);
  },

  /**
   * @returns {boolean}
   */
  isLoaded() {
    return loaded;
  },
};
