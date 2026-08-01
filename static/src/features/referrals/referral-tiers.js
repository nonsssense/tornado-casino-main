/**
 * Reusable Referral VIP program UI — tiers + partner CTA.
 * Assembled from components (not banner images) so rewards stay dynamic.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { Button } from '../../components/base/Button.js';
import { referralIconHtml, tierMedalHtml } from './referral-icons.js';

/**
 * @param {object[]} tiers
 * @returns {object[]}
 */
export function sortedTiers(tiers) {
  return [...(Array.isArray(tiers) ? tiers : [])].sort(
    (a, b) => Number(a.min_qualified_ftd || 0) - Number(b.min_qualified_ftd || 0),
  );
}

/**
 * Derive FTD requirement badge from live tier thresholds.
 * @param {object} tier
 * @param {object[]} ordered
 * @returns {string}
 */
export function formatFtdBadge(tier, ordered) {
  const min = Math.max(0, Number(tier?.min_qualified_ftd) || 0);
  const idx = ordered.findIndex((item) => item.name === tier.name);
  const next = idx >= 0 ? ordered[idx + 1] : null;
  if (!next) {
    return t('referrals.tiers.ftdPlus', { min });
  }
  const max = Math.max(min, Number(next.min_qualified_ftd) - 1);
  if (min <= 0) {
    return t('referrals.tiers.ftdRange', { min: 1, max });
  }
  return t('referrals.tiers.ftdRange', { min, max });
}

/**
 * Normalize friend rewards into a list of display items.
 * Supports current free_spins shape and future `{ items: [] }` payloads.
 * @param {string} tierName
 * @param {object} friendRewardsMap
 * @returns {Array<{ icon: string, title: string, subtitle?: string }>}
 */
export function buildFriendRewardItems(tierName, friendRewardsMap) {
  const raw = friendRewardsMap?.[tierName] || {};
  /** @type {Array<{ icon: string, title: string, subtitle?: string }>} */
  const items = [];

  if (Array.isArray(raw.items)) {
    for (const entry of raw.items) {
      if (!entry) continue;
      items.push({
        icon: entry.icon || 'gift',
        title: entry.title || entry.label || '',
        subtitle: entry.subtitle || undefined,
      });
    }
  }

  if (raw.free_spins != null && !items.some((i) => i.icon === 'gift')) {
    items.push({
      icon: 'gift',
      title: t('referrals.rewards.freeSpins', {
        spins: raw.free_spins,
        value: Number(raw.spin_value ?? 0).toFixed(2),
      }),
    });
  }

  if (raw.exclusive === false) {
    return items.filter(Boolean);
  }

  if (!items.some((i) => i.icon === 'star')) {
    items.push({
      icon: 'star',
      title: t('referrals.rewards.exclusive'),
    });
  }

  return items.filter((i) => i.title);
}

/**
 * Reusable reward card / row.
 * @param {object} reward
 * @param {'highlight'|'row'} [variant]
 * @returns {HTMLElement}
 */
export function createRewardCard(reward, variant = 'row') {
  const icon = reward?.icon || 'gift';
  const title = reward?.title || '';
  const subtitle = reward?.subtitle || '';

  if (variant === 'highlight') {
    return createElement('div', {
      className: 'referrals-reward referrals-reward--highlight',
      children: [
        createElement('span', {
          className: 'referrals-reward__icon',
          html: referralIconHtml(icon, { size: 22 }),
        }),
        createElement('div', {
          className: 'referrals-reward__copy',
          children: [
            createElement('p', {
              className: 'referrals-reward__value',
              text: title,
            }),
            subtitle
              ? createElement('p', {
                  className: 'referrals-reward__label',
                  text: subtitle,
                })
              : null,
          ].filter(Boolean),
        }),
      ],
    });
  }

  return createElement('div', {
    className: 'referrals-reward referrals-reward--row',
    children: [
      createElement('span', {
        className: 'referrals-reward__icon',
        html: referralIconHtml(icon, { size: 18 }),
      }),
      createElement('div', {
        className: 'referrals-reward__copy',
        children: [
          createElement('p', {
            className: 'referrals-reward__title',
            text: title,
          }),
          subtitle
            ? createElement('p', {
                className: 'referrals-reward__subtitle',
                text: subtitle,
              })
            : null,
        ].filter(Boolean),
      }),
    ],
  });
}

/**
 * Single Bronze / Silver / Gold section — identical structure for every tier.
 * @param {object} tier
 * @param {object[]} ordered
 * @param {object} friendRewardsMap
 * @returns {HTMLElement}
 */
export function createTierSection(tier, ordered, friendRewardsMap) {
  const key = String(tier?.name || 'bronze').toLowerCase();
  const letter = String(tier?.name || '?').charAt(0);
  const percent = Number(tier?.revshare_percent ?? 0);
  const friendItems = buildFriendRewardItems(tier?.name, friendRewardsMap);

  return createElement('section', {
    className: [
      'referrals-tier',
      `referrals-tier--${key}`,
      tier?.current ? 'is-current' : '',
    ].filter(Boolean).join(' '),
    children: [
      createElement('header', {
        className: 'referrals-tier__header',
        children: [
          createElement('div', {
            className: 'referrals-tier__medal',
            html: tierMedalHtml(key, letter),
          }),
          createElement('div', {
            className: 'referrals-tier__heading',
            children: [
              createElement('h3', {
                className: 'referrals-tier__name',
                text: tier?.name || '',
              }),
              createElement('span', {
                className: 'referrals-tier__badge',
                text: formatFtdBadge(tier, ordered),
              }),
            ],
          }),
        ],
      }),
      createElement('div', {
        className: 'referrals-tier__columns',
        children: [
          createElement('div', {
            className: 'referrals-tier__col referrals-tier__col--you',
            children: [
              createElement('p', {
                className: 'referrals-tier__col-label',
                text: t('referrals.tiers.youGet'),
              }),
              createRewardCard(
                {
                  icon: 'percent',
                  title: `${percent}%`,
                  subtitle: t('referrals.tiers.revshare'),
                },
                'highlight',
              ),
            ],
          }),
          createElement('div', {
            className: 'referrals-tier__col referrals-tier__col--friend',
            children: [
              createElement('p', {
                className: 'referrals-tier__col-label',
                text: t('referrals.tiers.friendGets'),
              }),
              createElement('div', {
                className: 'referrals-tier__friend-list',
                children: friendItems.map((item) => createRewardCard(item, 'row')),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Partner program premium CTA — connected to the tier system.
 * @param {object} summary
 * @param {() => void} onApply
 * @returns {HTMLElement}
 */
export function createPartnerProgramBlock(summary, onApply) {
  const maxPercent = Number(summary?.affiliate?.max_revshare_percent ?? 70);

  const features = [
    {
      icon: 'percent',
      label: t('referrals.partner.features.revshare', { percent: maxPercent }),
    },
    {
      icon: 'user',
      label: t('referrals.partner.features.terms'),
    },
    {
      icon: 'monitor',
      label: t('referrals.partner.features.cabinet'),
    },
    {
      icon: 'headset',
      label: t('referrals.partner.features.manager'),
    },
  ];

  return createElement('section', {
    className: 'referrals-partner',
    children: [
      createElement('header', {
        className: 'referrals-partner__header',
        children: [
          createElement('div', {
            className: 'referrals-partner__icon',
            html: referralIconHtml('handshake', { size: 30 }),
          }),
          createElement('div', {
            className: 'referrals-partner__intro',
            children: [
              createElement('h3', {
                className: 'referrals-partner__title',
                text: t('referrals.partner.title'),
              }),
              createElement('p', {
                className: 'referrals-partner__blurb',
                text: t('referrals.partner.description'),
              }),
            ],
          }),
        ],
      }),
      createElement('div', {
        className: 'referrals-partner__features',
        children: features.map((feature) =>
          createElement('div', {
            className: 'referrals-partner__feature',
            children: [
              createElement('span', {
                className: 'referrals-partner__feature-icon',
                html: referralIconHtml(feature.icon, { size: 18 }),
              }),
              createElement('span', {
                className: 'referrals-partner__feature-label',
                text: feature.label,
              }),
            ],
          }),
        ),
      }),
      Button({
        label: t('referrals.partner.cta'),
        variant: 'primary',
        block: true,
        className: 'referrals-partner__cta',
        onClick: onApply,
      }),
    ],
  });
}

/**
 * One continuous premium container: Bronze / Silver / Gold status tiers.
 * @param {object} summary
 * @returns {HTMLElement}
 */
export function createReferralProgram(summary) {
  const ordered = sortedTiers(summary?.tiers);
  const friendMap = summary?.friend_rewards || {};

  return createElement('div', {
    className: 'referrals-program',
    children: ordered.map((tier, index) =>
      createElement('div', {
        className: 'referrals-program__section',
        children: [
          index > 0
            ? createElement('div', {
                className: 'referrals-program__divider',
                attrs: { 'aria-hidden': 'true' },
              })
            : null,
          createTierSection(tier, ordered, friendMap),
        ].filter(Boolean),
      }),
    ),
  });
}
