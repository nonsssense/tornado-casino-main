/**
 * Welcome dismiss API — marks first-time welcome as seen on the server.
 */

import { request } from './request.js';

export async function dismissWelcome() {
  return request('/api/welcome/dismiss', { method: 'POST' });
}
