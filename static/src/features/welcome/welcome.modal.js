/**
 * Welcome modal — first-time Welcome Bonus overlay.
 *
 * Banner + Claim Bonus only. Trigger / dismiss / claim handlers are unchanged.
 * CSS ships with this lazy chunk.
 */

import '../../../styles/components/welcome-modal.css';
import { createElement } from '../../utils/dom.js';
import { t } from '../../i18n/index.js';
import { dismissWelcome } from '../../api/welcome.js';
import {
  getWelcomeCampaign,
  ACTIVE_WELCOME_CAMPAIGN_ID,
} from './welcome.campaigns.js';

/** @type {HTMLElement|null} */
let activeBackdrop = null;
/** @type {boolean} */
let dismissing = false;

function lockScroll() {
  document.documentElement.classList.add('welcome-modal-open');
  document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  document.documentElement.classList.remove('welcome-modal-open');
  document.body.style.overflow = '';
}

async function markDismissed() {
  if (dismissing) return;
  dismissing = true;
  try {
    await dismissWelcome();
  } catch {
    // Local close still proceeds — next auth may re-show if pending remains.
  } finally {
    dismissing = false;
  }
}

function closeModal() {
  if (!activeBackdrop) return;

  activeBackdrop.classList.remove('welcome-modal-backdrop--visible');
  const el = activeBackdrop;
  activeBackdrop = null;

  setTimeout(() => {
    el.remove();
    unlockScroll();
  }, 220);
}

/**
 * Open the first-time welcome modal.
 *
 * @param {object} [options]
 * @param {'default'|'referral'} [options.variant] — preserved for auth payload compatibility
 * @param {string} [options.campaignId]
 * @param {() => void} [options.onClaim] — after dismiss; open deposit
 * @param {() => void} [options.onLater] — after dismiss; stay on home
 */
export function openWelcomeModal(options = {}) {
  if (activeBackdrop) return;

  const campaignId = options.campaignId || ACTIVE_WELCOME_CAMPAIGN_ID;
  const campaign = getWelcomeCampaign(campaignId);

  const finishClose = async () => {
    await markDismissed();
    closeModal();
    if (typeof options.onLater === 'function') options.onLater();
  };

  const finishClaim = async () => {
    await markDismissed();
    closeModal();
    if (typeof options.onClaim === 'function') options.onClaim();
  };

  const backdrop = createElement('div', {
    className: 'welcome-modal-backdrop',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t(campaign.bannerAltKey),
    },
    children: [
      createElement('div', {
        className: 'welcome-modal',
        children: [
          createElement('button', {
            className: 'welcome-modal__close',
            attrs: {
              type: 'button',
              'aria-label': t('common.close'),
              onClick: () => {
                void finishClose();
              },
            },
            html: '&#10005;',
          }),
          createElement('img', {
            className: 'welcome-modal__banner',
            attrs: {
              src: campaign.bannerSrc,
              alt: t(campaign.bannerAltKey),
              draggable: false,
              decoding: 'async',
              loading: 'eager',
              fetchpriority: 'high',
            },
          }),
          createElement('button', {
            className: 'welcome-modal__claim',
            attrs: {
              type: 'button',
              onClick: () => {
                void finishClaim();
              },
            },
            text: t(campaign.cta.claimKey),
          }),
        ],
      }),
    ],
  });

  document.body.appendChild(backdrop);
  activeBackdrop = backdrop;
  lockScroll();

  requestAnimationFrame(() => {
    backdrop.classList.add('welcome-modal-backdrop--visible');
  });

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKeyDown);
      void finishClose();
    }
  };
  document.addEventListener('keydown', onKeyDown);
}

/**
 * @param {object|null|undefined} welcomePayload — from POST /api/auth
 * @param {object} [handlers]
 * @param {() => void} [handlers.onClaim]
 * @param {() => void} [handlers.onLater]
 * @returns {boolean} whether the modal was opened
 */
export function maybeShowWelcome(welcomePayload, handlers = {}) {
  if (!welcomePayload || !welcomePayload.show) return false;

  openWelcomeModal({
    variant: welcomePayload.variant === 'referral' ? 'referral' : 'default',
    campaignId: welcomePayload.campaign_id || ACTIVE_WELCOME_CAMPAIGN_ID,
    onClaim: handlers.onClaim,
    onLater: handlers.onLater,
  });
  return true;
}
