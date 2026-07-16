/**
 * Frontend constants.
 *
 * Responsibility:
 * - Route names, overlay names, game keys, supported tickers (when documented).
 * - No secrets, no session tokens — cookies are HttpOnly.
 * - Nav item labels resolve via i18n (see BottomNavigation).
 */

export const OVERLAY_NAMES = {
  BALANCE: 'balance',
  WALLET: 'wallet',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  HISTORY: 'history',
  PROFILE: 'profile',
};

export const GAME_KEYS = {
  DICE: 'dice',
  PLINKO: 'plinko',
};

export const BOTTOM_NAV_ITEMS = [
  { id: 'wallet', labelKey: 'nav.wallet', icon: 'wallet' },
  { id: 'referrals', labelKey: 'nav.referrals', icon: 'referrals' },
  { id: 'casino', labelKey: 'nav.casino', icon: 'casino' },
  { id: 'profile', labelKey: 'nav.profile', icon: 'profile' },
];

export const SHELL_IDS = {
  ROOT: 't-app',
  PAGE: 'page_content',
  OVERLAY: 'overlay-root',
  ANIMATION: 'animation-root',
};
