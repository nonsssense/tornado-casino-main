/**
 * Client lifecycle event tracking — posts to existing /api/events → user_events.
 */

import { request } from './request.js';

/**
 * Fire-and-forget tracked UI event. Never throws to callers.
 * @param {'app_open'|'page_nav'|'game_open'|'game_close'} eventType
 */
export function trackClientEvent(eventType) {
  return request('/api/events', {
    method: 'POST',
    body: JSON.stringify({ event_type: eventType }),
  }).catch(() => null);
}
