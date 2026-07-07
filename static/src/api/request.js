/**
 * Central HTTP client.
 *
 * Responsibility:
 * - Single entry point for all fetch() calls (per project rules).
 * - Attach Content-Type, send cookies (session_token) automatically.
 * - Parse JSON/text responses and normalize errors.
 */

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

    throw error;
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}
