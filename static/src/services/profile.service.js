/**
 * Profile service.
 *
 * Responsibility:
 * - Combine Telegram user context with wallet data for profile UI.
 * - No dedicated profile API exists yet — only documented fields are filled.
 */

import { getTelegramContext } from '../app/telegram.js';
import { balanceService } from './balance.service.js';

export const profileService = {
  /**
   * @returns {Promise<{ nickname: string, status: string, userId: string, email: string, balances: { real: number, bonus: number } }>}
   */
  async getProfile() {
    const context = getTelegramContext();
    const user = context?.user;
    const balances = balanceService.getBalances() || await balanceService.fetchBalances();

    const nickname = user?.username
      ? `@${user.username}`
      : [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Player';

    return {
      nickname,
      status: '—',
      userId: user?.id ? String(user.id) : '—',
      email: '—',
      balances,
    };
  },
};
