/**
 * Referrals modal — hero, metrics, link, status, history, partner CTA.
 */

import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { formatUsd } from '../../utils/format.js';
import { Skeleton } from '../../components/base/Skeleton.js';
import { Button } from '../../components/base/Button.js';
import { Toast } from '../../components/base/Toast.js';
import { referralService } from '../../services/referral.service.js';
import { isAuthenticated } from '../../services/auth-state.js';
import { REFERRAL_ASSETS, PARTNER_CONTACT_URL } from './referrals.constants.js';
import { createCompactReferralStatus } from './referral-status-details.js';
import { createPartnerProgramBlock } from './referral-tiers.js';
import { createGuestNotice } from '../../components/shared/GuestLock.js';
import { requireAuth } from '../../components/shared/GuestLoginModal.js';
import { openTelegramBot } from '../../utils/app.config.js';

/**
 * Clipboard write that works inside Telegram Mini App WebViews.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyTextToClipboard(text) {
  if (!text) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through.
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
  }
}

function openPartnerContact() {
  const url = PARTNER_CONTACT_URL;
  const tg = window.Telegram?.WebApp;
  if (typeof tg?.openTelegramLink === 'function') {
    try {
      tg.openTelegramLink(url);
      return;
    } catch {
      // fall through
    }
  }
  window.open(url, '_blank', 'noopener');
}

async function openStatusDetails(summary) {
  const { overlayManager } = await import('../../overlays/index.js');
  overlayManager.openReferralStatusInfo({ summary });
}

/**
 * @returns {{ element: HTMLElement, destroy: () => void }}
 */
export function createReferralsModal() {
  /** @type {object|null} */
  let summary = referralService.getSummary();

  const contentMount = createElement('div', { className: 'referrals-content' });

  async function copyLink() {
    if (!requireAuth()) return;

    const link = summary?.referral_link;
    if (!link) {
      Toast({ message: t('referrals.link.copyFailed'), type: 'error', duration: 2500 });
      return;
    }

    const ok = await copyTextToClipboard(link);
    if (ok) {
      Toast({ message: t('referrals.link.copied'), type: 'success', duration: 2000 });
      return;
    }

    const input = contentMount.querySelector('.referrals-link__input');
    if (input) {
      input.focus();
      input.select?.();
      input.setSelectionRange?.(0, String(link).length);
    }
    Toast({ message: t('referrals.link.copyFailed'), type: 'error', duration: 2500 });
  }

  function showComingSoon() {
    window.alert?.(t('referrals.more.comingSoon'));
  }

  async function onClaim() {
    if (!requireAuth()) return;
    try {
      await referralService.claim();
    } catch {
      // board refresh will reflect state
    }
  }

  /**
   * @param {string} labelKey
   * @param {string} value
   */
  function metric(labelKey, value) {
    return createElement('div', {
      className: 'referrals-metric',
      children: [
        createElement('span', { className: 'referrals-metric__label', text: t(labelKey) }),
        createElement('span', { className: 'referrals-metric__value', text: value }),
      ],
    });
  }

  function guestSummary() {
    return {
      total_invites: 0,
      qualified_ftd: 0,
      status: '—',
      today_income: 0,
      lifetime_earned: 0,
      revshare_percent: 0,
      referral_link: '',
      pending_earnings: 0,
      available_earnings: 0,
      withdrawable_earnings: 0,
      can_claim: false,
      tiers: [
        { id: 'Bronze', name: 'Bronze', revshare_percent: 25, min_qualified_ftd: 0, current: true },
        { id: 'Silver', name: 'Silver', revshare_percent: 30, min_qualified_ftd: 3, current: false },
        { id: 'Gold', name: 'Gold', revshare_percent: 35, min_qualified_ftd: 10, current: false },
      ],
      friend_rewards: {
        Bronze: { free_spins: 10, spin_value: 0.1 },
        Silver: { free_spins: 15, spin_value: 0.1 },
        Gold: { free_spins: 20, spin_value: 0.1 },
      },
      history: [],
      affiliate: { max_revshare_percent: 70 },
      isGuest: true,
    };
  }

  function renderMain() {
    if (!summary) {
      contentMount.replaceChildren(
        Skeleton({ height: '10rem', className: 'referrals-skeleton' }),
        Skeleton({ height: '7rem', className: 'referrals-skeleton' }),
        Skeleton({ height: '18rem', className: 'referrals-skeleton' }),
      );
      return;
    }

    const isGuestView = Boolean(summary.isGuest) || !isAuthenticated();

    const metrics = createElement('div', {
      className: 'referrals-metrics',
      children: [
        createElement('div', {
          className: 'referrals-metrics__col',
          children: [
            metric('referrals.metrics.invites', String(summary.total_invites ?? 0)),
            metric('referrals.metrics.ftd', String(summary.qualified_ftd ?? 0)),
            metric('referrals.metrics.status', String(summary.status || '—')),
          ],
        }),
        createElement('div', {
          className: 'referrals-metrics__col',
          children: [
            metric('referrals.metrics.today', formatUsd(summary.today_income ?? 0)),
            metric('referrals.metrics.alltime', formatUsd(summary.lifetime_earned ?? 0)),
            metric('referrals.metrics.revshare', `${summary.revshare_percent ?? 0}%`),
          ],
        }),
        createElement('button', {
          className: 'referrals-metrics__more',
          attrs: { type: 'button', onClick: showComingSoon },
          text: t('referrals.more.label'),
        }),
      ],
    });

    const earnings = createElement('div', {
      className: 'referrals-earnings',
      children: [
        metric('referrals.metrics.pending', formatUsd(summary.pending_earnings ?? 0)),
        metric('referrals.metrics.available', formatUsd(summary.available_earnings ?? 0)),
        metric('referrals.metrics.withdrawable', formatUsd(summary.withdrawable_earnings ?? 0)),
        !isGuestView && summary.can_claim
          ? Button({
              label: t('referrals.actions.claim'),
              variant: 'primary',
              block: true,
              className: 'referrals-claim',
              onClick: onClaim,
            })
          : null,
      ].filter(Boolean),
    });

    const historyItems = Array.isArray(summary.history) ? summary.history.slice(0, 8) : [];

    const linkBlock = createElement('div', {
      className: ['referrals-link', isGuestView ? 'referrals-link--guest' : ''].filter(Boolean).join(' '),
      children: [
        createElement('span', { className: 'referrals-link__label', text: t('referrals.link.label') }),
        createElement('div', {
          className: 'referrals-link__row',
          children: [
            createElement('input', {
              className: 'referrals-link__input',
              attrs: {
                type: 'text',
                readonly: 'readonly',
                value: isGuestView
                  ? t('guest.referrals.linkPlaceholder')
                  : (summary.referral_link || ''),
                disabled: isGuestView ? 'true' : undefined,
              },
            }),
            createElement('button', {
              className: 'referrals-link__copy',
              attrs: {
                type: 'button',
                'aria-label': t('referrals.link.copy'),
                onClick: () => {
                  if (isGuestView) {
                    openTelegramBot();
                    return;
                  }
                  void copyLink();
                },
              },
              html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
            }),
          ],
        }),
        isGuestView
          ? createGuestNotice({
              message: t('guest.referrals.message'),
              className: 'referrals-guest-notice',
            })
          : null,
      ].filter(Boolean),
    });

    contentMount.replaceChildren(
      createElement('div', {
        className: 'referrals-hero',
        children: [
          createElement('img', {
            className: 'referrals-hero__image',
            attrs: {
              src: REFERRAL_ASSETS.banner,
              alt: t('referrals.hero.alt'),
              draggable: false,
              decoding: 'async',
              loading: 'eager',
            },
          }),
        ],
      }),
      metrics,
      linkBlock,
      earnings,
      createCompactReferralStatus(summary, {
        onLearnMore: () => void openStatusDetails(summary),
      }),
      createElement('section', {
        className: 'referrals-history',
        children: [
          createElement('h2', {
            className: 'referrals-history__title',
            text: t('referrals.history.title'),
          }),
          historyItems.length
            ? createElement('ul', {
                className: 'referrals-history__list',
                children: historyItems.map((item) =>
                  createElement('li', {
                    className: 'referrals-history__item',
                    text: `#${item.id} · ${formatUsd(item.amount)} · ${item.status}`,
                  }),
                ),
              })
            : createElement('p', {
                className: 'referrals-history__empty',
                text: t('referrals.history.empty'),
              }),
        ],
      }),
      createPartnerProgramBlock(summary, openPartnerContact),
    );
  }

  const element = createElement('div', {
    className: 'referrals-modal',
    attrs: { 'data-modal': 'referrals' },
    children: [contentMount],
  });

  renderMain();

  const unsubscribe = referralService.subscribe((next) => {
    summary = next ? { ...next, isGuest: false } : next;
    renderMain();
  });

  if (!isAuthenticated()) {
    summary = guestSummary();
    renderMain();
  } else {
    void referralService.fetchSummary().catch(() => {
      summary = guestSummary();
      renderMain();
    });
  }

  return {
    element,
    destroy() {
      unsubscribe();
    },
  };
}
