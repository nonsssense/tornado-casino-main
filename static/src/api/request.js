/**
 * Central HTTP client.
 *
 * Responsibility:
 * - Single entry point for all fetch() calls (per project rules).
 * - Attach Content-Type, send cookies (session_token) automatically.
 * - Parse JSON/text responses and normalize errors.
 * - 401 while Guest/Loading is expected — do not broadcast session:expired.
 */

import { isAuthenticated } from '../services/auth-state.js';

/**
 * @param {string} url
 * @param {RequestInit & { body?: string }} [options]
 * @returns {Promise<unknown>}
 */
export async function request(url, options = {}) {
  const { headers = {}, body, method = 'GET', ...rest } = options;

  const config = {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    ...rest,
  };

  if (body !== undefined) {
    config.body = body;
    if (!config.headers['Content-Type'] && !config.headers['content-type']) {
      config.headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    /** @type {Error & { status?: number, data?: unknown }} */
    const error = new Error(`Request failed with status ${response.status}`);
    error.status = response.status;

    try {
      error.data = await response.json();
    } catch {
      error.data = null;
    }

    // Only signal session loss when we previously believed the user was authenticated.
    // Guest Mode 401s are expected and must not tear down the UI.
    if (response.status === 401 && isAuthenticated()) {
      window.dispatchEvent(new CustomEvent('session:expired', { detail: error }));
    }

    throw error;
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}
