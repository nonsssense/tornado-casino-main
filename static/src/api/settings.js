/**
 * User settings API — sound / haptic preferences.
 */

import { request } from './request.js';

/**
 * @returns {Promise<{ sound_enabled: boolean, haptic_enabled: boolean }>}
 */
export function fetchSettings() {
  return request('/api/settings');
}

/**
 * @param {{ sound_enabled?: boolean, haptic_enabled?: boolean }} patch
 * @returns {Promise<{ sound_enabled: boolean, haptic_enabled: boolean }>}
 */
export function updateSettings(patch) {
  return request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(patch ?? {}),
  });
}
