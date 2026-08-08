import { request } from './request.js';

/**
 * Aggregated payload for Personal Data route.
 */
export async function fetchPersonalData() {
  return request('/api/profile/personal-data');
}

