/**
 * Crash activity HUD — online count, active bets, live cashout ticker.
 * Mounts inside the animation frame; does not affect gameplay.
 */

import { createElement } from '../../utils/dom.js';
import { formatMultiplier } from './crash.utils.js';
import { t } from '../../i18n/index.js';

const MAX_FEED = 2;
const FEED_LEAVE_MS = 220;

/**
 * @returns {{
 *   element: HTMLElement,
 *   setOnline: (count: number) => void,
 *   setActiveBets: (count: number) => void,
 *   pushCashout: (entry: { username: string, multiplier: number }) => void,
 *   clearFeed: () => void,
 *   destroy: () => void,
 * }}
 */
export function createActivityHud() {
  /** @type {Array<{ root: HTMLElement }>} */
  const feedItems = [];
  let feedBusy = Promise.resolve();

  const onlineCountEl = createElement('span', {
    className: 'crash-activity__online-count',
    text: '0',
  });

  const onlineEl = createElement('div', {
    className: 'crash-activity__online',
    attrs: { 'aria-label': t('crash.activity.onlineAria') },
    children: [
      createElement('span', {
        className: 'crash-activity__online-dot',
        attrs: { 'aria-hidden': 'true' },
      }),
      onlineCountEl,
    ],
  });

  const betsCountEl = createElement('span', {
    className: 'crash-activity__bets-count',
    text: '0',
  });

  const betsEl = createElement('div', {
    className: 'crash-activity__bets',
    attrs: { 'aria-label': t('crash.activity.betsAria') },
    children: [
      createElement('span', {
        className: 'crash-activity__bets-label',
        text: t('crash.activity.bets'),
      }),
      betsCountEl,
    ],
  });

  const feedEl = createElement('div', {
    className: 'crash-activity__feed',
    attrs: {
      'aria-live': 'polite',
      'aria-label': t('crash.activity.feedAria'),
    },
  });

  const rightEl = createElement('div', {
    className: 'crash-activity__right',
    children: [feedEl, betsEl],
  });

  const element = createElement('div', {
    className: 'crash-activity',
    attrs: { 'aria-hidden': 'false' },
    children: [onlineEl, rightEl],
  });

  /**
   * @param {number} count
   */
  function setOnline(count) {
    const next = Math.max(0, Math.floor(Number(count) || 0));
    onlineCountEl.textContent = String(next);
  }

  /**
   * @param {number} count
   */
  function setActiveBets(count) {
    const next = Math.max(0, Math.floor(Number(count) || 0));
    betsCountEl.textContent = String(next);
  }

  /**
   * @param {{ username: string, multiplier: number }} entry
   * @returns {HTMLElement}
   */
  function createFeedItem(entry) {
    const name = String(entry.username || t('crash.activity.player')).trim()
      || t('crash.activity.player');
    const mult = formatMultiplier(Number(entry.multiplier) || 0);

    return createElement('div', {
      className: 'crash-activity__feed-item crash-activity__feed-item--enter',
      children: [
        createElement('span', {
          className: 'crash-activity__feed-name',
          text: name,
        }),
        createElement('span', {
          className: 'crash-activity__feed-sep',
          text: ` — ${t('crash.activity.cashout')} `,
          attrs: { 'aria-hidden': 'true' },
        }),
        createElement('span', {
          className: 'crash-activity__feed-mult',
          text: mult,
        }),
      ],
    });
  }

  function clearFeed() {
    feedBusy = feedBusy.then(() => {
      feedItems.splice(0, feedItems.length);
      feedEl.replaceChildren();
    });
  }

  /**
   * @param {{ username: string, multiplier: number }} entry
   */
  function pushCashout(entry) {
    if (!entry || !Number.isFinite(Number(entry.multiplier))) return;

    feedBusy = feedBusy.then(async () => {
      if (feedItems.length >= MAX_FEED) {
        const oldest = feedItems.shift();
        if (oldest?.root) {
          oldest.root.classList.remove('crash-activity__feed-item--enter');
          oldest.root.classList.add('crash-activity__feed-item--leave');
          await new Promise((resolve) => {
            window.setTimeout(resolve, FEED_LEAVE_MS);
          });
          oldest.root.remove();
        }
      }

      const root = createFeedItem(entry);
      feedItems.push({ root });
      feedEl.appendChild(root);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          root.classList.remove('crash-activity__feed-item--enter');
        });
      });
    });
  }

  return {
    element,
    setOnline,
    setActiveBets,
    pushCashout,
    clearFeed,
    destroy() {
      clearFeed();
      element.remove();
    },
  };
}
