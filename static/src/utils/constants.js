/**
 * Frontend constants.
 *
 * Responsibility:
 * - Route names, overlay names, game keys, supported tickers (when documented).
 * - No secrets, no session tokens — cookies are HttpOnly.
 */

export const OVERLAY_NAMES = {
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
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'referrals', label: 'Referrals', icon: 'referrals' },
  { id: 'casino', label: 'Casino', icon: 'casino' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
];

export const SHELL_IDS = {
  ROOT: 't-app',
  PAGE: 'page_content',
  OVERLAY: 'overlay-root',
  ANIMATION: 'animation-root',
};
