/**
 * Profile service.
 *
 * Responsibility:
 * - Combine server-validated Telegram user with wallet + referral status for profile UI.
 * - Guest Mode returns a local Guest profile without calling protected APIs.
 */

import { getAuthUser, isAuthenticated } from './auth.service.js';
import { balanceService } from './balance.service.js';
import { referralService } from './referral.service.js';
import { t } from '../i18n/index.js';

export const profileService = {
  /**
   * @param {{ soft?: boolean }} [options]
   * @returns {Promise<{ nickname: string, status: string, userId: string, email: string, photoUrl: string|null, balances: { real: number, bonus: number }|null, isGuest: boolean }>}
   */
  async getProfile(options = {}) {
    const soft = Boolean(options.soft);

    if (!isAuthenticated()) {
      const dash = t('common.emDash');
      return {
        nickname: t('guest.name'),
        status: dash,
        userId: dash,
        email: dash,
        photoUrl: null,
        balances: null,
        isGuest: true,
      };
    }

    const user = getAuthUser();
    const cachedBalances = balanceService.getBalances();
    const cachedStatus = referralService.getStatus();

    const [balances, referralStatus] = await Promise.all([
      cachedBalances ? Promise.resolve(cachedBalances) : balanceService.fetchBalances(),
      soft && cachedStatus
        ? Promise.resolve({ status: cachedStatus })
        : referralService.fetchStatus().catch(() => (
          cachedStatus ? { status: cachedStatus } : null
        )),
    ]);

    const nickname = user?.username
      ? `@${user.username}`
      : [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('common.player');

    const dash = t('common.emDash');
    const status = referralStatus?.status
      || referralService.getStatus()
      || dash;

    const photoUrl = typeof user?.photo_url === 'string' && user.photo_url.trim()
      ? user.photo_url.trim()
      : null;

    return {
      nickname,
      status,
      userId: user?.id ? String(user.id) : dash,
      email: dash,
      photoUrl,
      balances,
      isGuest: false,
    };
  },
};
