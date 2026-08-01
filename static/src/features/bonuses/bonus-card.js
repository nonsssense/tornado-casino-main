/**
 * Bonus Card + detail view for the My Bonuses catalog.
 * Presentation only — all fields come from the Bonus Card API object.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { BONUS_ASSETS } from './bonuses.constants.js';

const LOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

/**
 * @param {string} status
 * @returns {string}
 */
export function statusLabel(status) {
  const key = `bonuses.status.${String(status || 'available').toLowerCase()}`;
  const translated = t(key);
  return translated === key ? String(status || '') : translated;
}

/**
 * Full-width vertical bonus card — artwork + meta + Learn More CTA.
 * @param {object} card
 * @param {{ onOpen?: function(object): void, eager?: boolean }} [options]
 */
export function createBonusCatalogCard(card, options = {}) {
  const { onOpen, eager = false } = options;
  const status = String(card?.status || 'available').toLowerCase();
  const locked = status === 'locked' || card?.unlocked === false;
  const rewardLabel = card?.reward?.label || null;
  const title = card?.title || t('bonuses.card.untitled');

  const open = () => onOpen?.(card);

  return createElement('article', {
    className: [
      'bonus-card',
      `bonus-card--${status}`,
      locked ? 'bonus-card--locked' : '',
    ].filter(Boolean).join(' '),
    children: [
      createElement('button', {
        className: 'bonus-card__media',
        attrs: {
          type: 'button',
          'aria-label': title,
          onClick: open,
        },
        children: [
          createElement('img', {
            className: 'bonus-card__banner',
            attrs: {
              src: card.banner,
              alt: title,
              draggable: false,
              decoding: 'async',
              loading: eager ? 'eager' : 'lazy',
              fetchpriority: eager ? 'high' : 'auto',
            },
          }),
          createElement('span', {
            className: `bonus-card__status bonus-card__status--${status}`,
            text: statusLabel(status),
          }),
          locked
            ? createElement('span', {
                className: 'bonus-card__lock',
                html: LOCK_ICON,
                attrs: { 'aria-hidden': 'true' },
              })
            : null,
        ].filter(Boolean),
      }),
      createElement('div', {
        className: 'bonus-card__body',
        children: [
          createElement('div', {
            className: 'bonus-card__copy',
            children: [
              rewardLabel
                ? createElement('p', {
                    className: 'bonus-card__percent',
                    text: rewardLabel,
                  })
                : null,
              createElement('h3', {
                className: 'bonus-card__title',
                text: title,
              }),
            ].filter(Boolean),
          }),
          createElement('button', {
            className: 'bonus-card__cta',
            attrs: {
              type: 'button',
              onClick: open,
            },
            text: t('bonuses.actions.learnMore'),
          }),
        ],
      }),
    ],
  });
}

/**
 * @param {object} card
 * @returns {Array<{ label: string, value: string }>}
 */
function detailRows(card) {
  const d = card?.details || {};
  const rows = [];

  if (card?.reward?.label) {
    rows.push({ label: t('bonuses.detail.reward'), value: String(card.reward.label) });
  }
  if (d.deposit_index != null) {
    rows.push({ label: t('bonuses.detail.deposit'), value: String(d.deposit_index) });
  }
  if (d.min_deposit != null) {
    rows.push({ label: t('bonuses.detail.minDeposit'), value: `$${Number(d.min_deposit).toFixed(0)}` });
  }
  if (d.max_bonus != null) {
    rows.push({ label: t('bonuses.detail.maxBonus'), value: `$${Number(d.max_bonus).toFixed(0)}` });
  }
  if (d.wager_multiplier != null) {
    rows.push({
      label: t('bonuses.detail.wager'),
      value: t('bonuses.detail.wagerBaseValue', { n: d.wager_multiplier }),
    });
  }
  if (d.wager_remaining != null && Number(d.wager_remaining) > 0) {
    rows.push({
      label: t('bonuses.detail.remainingWager'),
      value: `$${Number(d.wager_remaining).toFixed(2)}`,
    });
  }
  if (d.mqb_percent != null || d.max_bet_percent != null || d.mqb_absolute != null || d.max_bet_absolute != null) {
    const pctRaw = d.mqb_percent ?? d.max_bet_percent;
    const absRaw = d.mqb_absolute ?? d.max_bet_absolute;
    const pct = pctRaw != null ? `${Math.round(Number(pctRaw) * 100)}%` : null;
    const abs = absRaw != null ? `$${Number(absRaw).toFixed(2)}` : null;
    const value = pct && abs
      ? t('bonuses.detail.maxBetValue', { pct, amount: abs })
      : (abs || pct || '—');
    rows.push({ label: t('bonuses.detail.maxBet'), value });
  }
  if (Array.isArray(d.games) && d.games.length) {
    rows.push({ label: t('bonuses.detail.games'), value: d.games.join(', ') });
  }
  if (d.expires_at) {
    rows.push({
      label: t('bonuses.detail.expiresAt'),
      value: String(d.expires_at).slice(0, 19).replace('T', ' '),
    });
  } else if (d.expires_days != null) {
    rows.push({
      label: t('bonuses.detail.expires'),
      value: t('bonuses.detail.expiresDays', { n: d.expires_days }),
    });
  }
  if (card?.description) {
    rows.push({ label: t('bonuses.detail.description'), value: String(card.description) });
  }

  return rows;
}

/**
 * Full detail layer for a Bonus Card.
 * @param {object} card
 * @param {{ onBack?: function(): void, onAction?: function(object): void }} [options]
 */
export function createBonusDetailView(card, options = {}) {
  const { onBack, onAction } = options;
  const status = String(card?.status || 'available').toLowerCase();
  const progress = card?.progress || {};
  const percent = Math.max(0, Math.min(100, Number(progress.percent ?? 0)));
  const lockedProgress = Boolean(progress.locked) || status === 'locked';
  const button = card?.button || {};
  const unlockHint = card?.details?.unlock_hint;

  const progressBlock = createElement('div', {
    className: [
      'bonuses-detail__progress-wrap',
      lockedProgress ? 'bonuses-detail__progress-wrap--locked' : '',
    ].filter(Boolean).join(' '),
    children: [
      createElement('div', {
        className: 'bonuses-detail__progress-label',
        text: t('bonuses.detail.progress'),
      }),
      createElement('div', {
        className: 'bonuses-detail__progress',
        children: [
          createElement('div', {
            className: 'bonuses-detail__progress-bar',
            attrs: { style: `width:${lockedProgress ? 0 : percent}%` },
          }),
        ],
      }),
      lockedProgress
        ? createElement('div', {
            className: 'bonuses-detail__lock-overlay',
            children: [
              createElement('span', {
                className: 'bonuses-detail__lock-icon',
                html: LOCK_ICON,
              }),
              createElement('p', {
                className: 'bonuses-detail__lock-hint',
                text: unlockHint || t('bonuses.detail.lockedHint'),
              }),
            ],
          })
        : null,
    ].filter(Boolean),
  });

  const actionEnabled = Boolean(button.enabled);
  const actionLabel = button.label_key ? t(button.label_key) : t('bonuses.actions.claim');
  const detailBanner =
    card.detail_banner
    || BONUS_ASSETS.detailByTier?.[card.id]
    || card.banner;

  return createElement('div', {
    className: `bonuses-detail bonuses-detail--${status}`,
    children: [
      createElement('button', {
        className: 'bonuses-detail__back',
        attrs: {
          type: 'button',
          onClick: () => onBack?.(),
        },
        text: t('bonuses.detail.back'),
      }),
      createElement('div', {
        className: 'bonuses-detail__banner-wrap',
        children: [
          createElement('img', {
            className: 'bonuses-detail__banner',
            attrs: {
              src: detailBanner,
              alt: card.title || '',
              draggable: false,
              decoding: 'async',
              loading: 'eager',
            },
          }),
        ],
      }),
      createElement('div', {
        className: 'bonuses-detail__header',
        children: [
          createElement('h2', {
            className: 'bonuses-detail__title',
            text: card.title || t('bonuses.card.untitled'),
          }),
          createElement('span', {
            className: `bonuses-detail__badge bonuses-detail__badge--${status}`,
            text: statusLabel(status),
          }),
        ],
      }),
      createElement('dl', {
        className: 'bonuses-detail__rows',
        children: detailRows(card).flatMap((row) => [
          createElement('div', {
            className: 'bonuses-detail__row',
            children: [
              createElement('dt', { text: row.label }),
              createElement('dd', { text: row.value }),
            ],
          }),
        ]),
      }),
      progressBlock,
      createElement('button', {
        className: [
          'bonuses-detail__cta',
          actionEnabled ? 'bonuses-detail__cta--primary' : 'bonuses-detail__cta--disabled',
        ].join(' '),
        attrs: {
          type: 'button',
          disabled: actionEnabled ? undefined : 'true',
          onClick: () => {
            if (actionEnabled) onAction?.(card);
          },
        },
        text: actionLabel,
      }),
    ],
  });
}
