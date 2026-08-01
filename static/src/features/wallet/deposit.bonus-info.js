/**
 * Bonus information page — in-wallet detail view for the active/available deposit bonus.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';

/**
 * @param {number|null|undefined} n
 * @returns {string}
 */
function ordinal(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return t('wallet.bonus.ordinal.next');
  const key = `wallet.bonus.ordinal.${value}`;
  const label = t(key);
  if (label !== key) return label;
  return t('wallet.bonus.ordinal.nth', { n: value });
}

/**
 * @param {object|null} offer
 * @param {object|null} rules
 * @returns {string}
 */
function formatEligibleGames(offer, rules) {
  const eligible = offer?.eligible_games || rules?.eligible_games;
  if (!eligible || typeof eligible !== 'object') return t('wallet.bonus.games.all');

  const hasDice = Boolean(eligible.dice);
  const hasCrash = Boolean(eligible.crash);
  const hasPlinko = eligible.plinco === true
    || (eligible.plinco && typeof eligible.plinco === 'object');

  if (hasDice && hasCrash && hasPlinko) {
    return t('wallet.bonus.games.all');
  }

  const parts = [];
  if (hasDice) parts.push(t('wallet.bonus.games.dice'));
  if (hasCrash) parts.push(t('wallet.bonus.games.crash'));
  if (hasPlinko) parts.push(t('wallet.bonus.games.plinko'));
  return parts.length ? parts.join(', ') : t('wallet.bonus.games.all');
}

/**
 * @param {object|null} offer
 * @param {object|null} rules
 * @returns {string}
 */
function formatMaxBet(offer, rules) {
  const abs = offer?.max_bet_absolute
    ?? offer?.mqb_absolute
    ?? rules?.max_bet_absolute
    ?? rules?.mqb_absolute;
  const pct = offer?.max_bet_percent_of_bonus
    ?? offer?.mqb_percent
    ?? rules?.max_bet_percent_of_bonus
    ?? rules?.mqb_percent;
  if (abs != null && pct != null) {
    return t('wallet.bonus.maxBet.pctCap', {
      pct: Math.round(Number(pct) * 100),
      amount: `$${Number(abs)}`,
    });
  }
  if (abs != null) return t('wallet.bonus.maxBet.upTo', { amount: `$${Number(abs)}` });
  return t('wallet.bonus.maxBet.pctCap', {
    pct: 10,
    amount: '$5',
  });
}

/**
 * @param {object|null} offer
 * @param {object|null} rules
 * @returns {string}
 */
function formatWager(offer, rules) {
  const n = offer?.wager_multiplier ?? rules?.wager_multiplier;
  if (n == null) return t('common.emDash');
  return t('wallet.bonus.wager', { n });
}

/**
 * @param {object|null} offer
 * @param {object|null} rules
 * @returns {string}
 */
function formatExpiry(offer, rules) {
  const n = offer?.expires_days ?? rules?.expires_days;
  if (n == null) return t('wallet.bonus.expires.none');
  return t('wallet.bonus.expires.days', { n });
}

/**
 * @param {{ label: string, value: string }} row
 * @returns {HTMLElement}
 */
function infoRow(row) {
  return createElement('div', {
    className: 'wallet-bonus-info__row',
    children: [
      createElement('span', {
        className: 'wallet-bonus-info__row-label',
        text: row.label,
      }),
      createElement('span', {
        className: 'wallet-bonus-info__row-value',
        text: row.value,
      }),
    ],
  });
}

/**
 * @param {object} [options]
 * @param {object} [options.offer]
 * @param {'active'|'available'} [options.mode]
 * @param {object|null} [options.rules]
 * @param {() => void} [options.onBack]
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createBonusInfoView(options = {}) {
  const {
    offer = null,
    mode = 'available',
    rules = null,
    onBack,
  } = options;

  const percent = offer?.percent != null ? `${offer.percent}%` : t('common.emDash');
  const heading = t('wallet.bonus.detail.title', { pct: offer?.percent ?? t('common.emDash') });

  const rows = [
    {
      label: t('wallet.bonus.detail.bonus'),
      value: percent,
    },
    {
      label: t('wallet.bonus.detail.who'),
      value: t('wallet.bonus.detail.whoPlayers', {
        ordinal: ordinal(offer?.deposit_index),
      }),
    },
    {
      label: t('wallet.bonus.detail.wager'),
      value: formatWager(offer, rules),
    },
    {
      label: t('wallet.bonus.detail.expires'),
      value: formatExpiry(offer, rules),
    },
    {
      label: t('wallet.bonus.detail.maxBet'),
      value: formatMaxBet(offer, rules),
    },
    {
      label: t('wallet.bonus.detail.games'),
      value: formatEligibleGames(offer, rules),
    },
    {
      label: t('wallet.bonus.detail.note'),
      value: t('wallet.bonus.detail.noteValue'),
    },
  ];

  const element = createElement('div', {
    className: 'wallet-bonus-info',
    attrs: { 'data-mode': mode },
    children: [
      createElement('div', {
        className: 'wallet-bonus-info__header',
        children: [
          createElement('button', {
            className: 'wallet-bonus-info__back',
            attrs: {
              type: 'button',
              'aria-label': t('wallet.bonus.info.back'),
              onClick: () => onBack?.(),
            },
            html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
          }),
          createElement('h2', {
            className: 'wallet-bonus-info__title',
            text: t('wallet.bonus.info.title'),
          }),
        ],
      }),
      createElement('div', {
        className: 'wallet-bonus-info__hero',
        children: [
          createElement('p', {
            className: 'wallet-bonus-info__hero-label',
            text: mode === 'active'
              ? t('wallet.bonus.state.active')
              : t('wallet.bonus.card.autoActivate'),
          }),
          createElement('p', {
            className: 'wallet-bonus-info__hero-value',
            text: heading,
          }),
        ],
      }),
      createElement('div', {
        className: 'wallet-bonus-info__list',
        children: rows.map(infoRow),
      }),
    ],
  });

  return {
    element,
    destroy() {},
  };
}
