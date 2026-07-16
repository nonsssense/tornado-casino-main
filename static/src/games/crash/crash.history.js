/**
 * CrashHistory — horizontal scroll row of recent multipliers.
 */

import { createElement } from '../../utils/dom.js';
import { createCrashHistoryItem } from './crash.history-item.js';
import { t } from '../../i18n/index.js';

/**
 * @param {object} [options]
 * @param {number[]} [options.items]
 * @returns {{ element: HTMLElement, setItems: (items: number[]) => void }}
 */
export function createCrashHistory(options = {}) {
  const list = createElement('ul', {
    className: 'crash-history__list',
    attrs: { 'aria-label': t('crash.history.aria') },
  });

  const element = createElement('div', {
    className: 'crash-history',
    children: [list],
  });

  /**
   * @param {number[]} items
   */
  function setItems(items) {
    list.replaceChildren(
      ...(Array.isArray(items) ? items : []).map((multiplier) =>
        createCrashHistoryItem({ multiplier }),
      ),
    );
  }

  setItems(options.items ?? []);

  return { element, setItems };
}
