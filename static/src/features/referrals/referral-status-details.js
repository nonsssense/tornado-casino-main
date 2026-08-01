/**
 * Shared Referral Status Details content (tiers / RevShare only).
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { createReferralProgram, sortedTiers, formatFtdBadge } from './referral-tiers.js';
import { tierMedalHtml } from './referral-icons.js';

/**
 * Compact status cards for the Referrals page (headers only).
 * @param {object} summary
 * @param {{ onLearnMore?: () => void }} [options]
 * @returns {HTMLElement}
 */
export function createCompactReferralStatus(summary, options = {}) {
  const { onLearnMore } = options;
  const ordered = sortedTiers(summary?.tiers);

  return createElement('section', {
    className: 'referrals-status-compact',
    children: [
      createElement('div', {
        className: 'referrals-status-compact__head',
        children: [
          createElement('h2', {
            className: 'referrals-status-compact__title',
            text: t('referrals.statusInfo.label'),
          }),
          createElement('button', {
            className: 'referrals-status-compact__learn-more',
            attrs: {
              type: 'button',
              onClick: () => onLearnMore?.(),
            },
            text: t('referrals.statusInfo.learnMore'),
          }),
        ],
      }),
      createElement('div', {
        className: 'referrals-status-compact__list',
        children: ordered.map((tier) => {
          const key = String(tier?.name || 'bronze').toLowerCase();
          const letter = String(tier?.name || '?').charAt(0);
          return createElement('div', {
            className: [
              'referrals-status-compact__card',
              `referrals-status-compact__card--${key}`,
              tier?.current ? 'is-current' : '',
            ].filter(Boolean).join(' '),
            children: [
              createElement('div', {
                className: 'referrals-status-compact__medal',
                html: tierMedalHtml(key, letter),
              }),
              createElement('div', {
                className: 'referrals-status-compact__meta',
                children: [
                  createElement('span', {
                    className: 'referrals-status-compact__name',
                    text: tier?.name || '',
                  }),
                  createElement('span', {
                    className: 'referrals-status-compact__badge',
                    text: formatFtdBadge(tier, ordered),
                  }),
                ],
              }),
              createElement('span', {
                className: 'referrals-status-compact__revshare',
                text: t('referrals.statusInfo.revshare', {
                  percent: Number(tier?.revshare_percent ?? 0),
                }),
              }),
            ],
          });
        }),
      }),
    ],
  });
}

/**
 * Full status details — Bronze / Silver / Gold + rewards (no Partner Program).
 * @param {object} summary
 * @returns {HTMLElement}
 */
export function createReferralStatusDetails(summary) {
  return createElement('div', {
    className: 'referrals-status-details',
    attrs: { 'data-view': 'referral-status-details' },
    children: [createReferralProgram(summary)],
  });
}
