/**
 * CrashHistoryItem — colored multiplier text (no capsule).
 */

import { createElement } from '../../utils/dom.js';
import { formatMultiplier, getHistoryTierKey } from './crash.utils.js';

/**
 * @param {object} options
 * @param {number} options.multiplier
 * @returns {HTMLElement}
 */
export function createCrashHistoryItem(options = {}) {
  const multiplier = Number(options.multiplier);
  const tier = getHistoryTierKey(multiplier);

  return createElement('li', {
    className: `crash-history__item crash-history__item--${tier}`,
    attrs: {
      title: formatMultiplier(multiplier),
    },
    text: formatMultiplier(multiplier),
  });
}
