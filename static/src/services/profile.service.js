/**
 * Profile service.
 *
 * Responsibility:
 * - Combine server-validated Telegram user with wallet + referral status for profile UI.
 */

import { getAuthUser } from './auth.service.js';
import { balanceService } from './balance.service.js';
import { referralService } from './referral.service.js';
import { t } from '../i18n/index.js';

export const profileService = {
  /**
   * @returns {Promise<{ nickname: string, status: string, userId: string, email: string, balances: { real: number, bonus: number } }>}
   */
  async getProfile() {
    const user = getAuthUser();
    const cachedBalances = balanceService.getBalances();
    const [balances, referralStatus] = await Promise.all([
      cachedBalances ? Promise.resolve(cachedBalances) : balanceService.fetchBalances(),
      referralService.fetchStatus().catch(() => null),
    ]);

    const nickname = user?.username
      ? `@${user.username}`
      : [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('common.player');

    const dash = t('common.emDash');
    const status = referralStatus?.status
      || referralService.getStatus()
      || dash;

    return {
      nickname,
      status,
      userId: user?.id ? String(user.id) : dash,
      email: dash,
      balances,
    };
  },
};
