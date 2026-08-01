/**
 * Referral Status Details overlay — shared BottomSheet for status tiers.
 * Entry points: Referrals "Learn More" and Profile status info icon.
 */

import { createReferralStatusDetails } from '../features/referrals/referral-status-details.js';
import { referralService } from '../services/referral.service.js';
import { t } from '../i18n/index.js';
import { BottomSheet } from './bottom-sheet.js';
import '../../styles/pages/referrals.css';

/**
 * @param {object} [options]
 * @param {object} [options.summary]
 * @param {function} [options.onClose]
 * @param {function} [options.onBeforeRemove]
 * @param {boolean} [options.manageBodyScroll]
 */
export function createReferralStatusOverlay(options = {}) {
  const { onClose, onBeforeRemove, manageBodyScroll = true } = options;
  const summary = options.summary || referralService.getSummary() || {
    tiers: [],
    friend_rewards: {},
  };

  const content = createReferralStatusDetails(summary);

  return BottomSheet({
    content,
    ariaLabel: t('referrals.statusInfo.title'),
    panelClass: 'bottom-sheet__panel--wallet bottom-sheet__panel--referral-status',
    manageBodyScroll,
    onClose,
    onBeforeRemove,
  });
}
