/**
 * Brand asset paths — served from FastAPI `/assets` (no Vite `?import`).
 * Using plain URLs avoids MIME failures when requests hit StaticFiles directly.
 */

export const ASSETS = {
  logo: '/assets/tornado%20no%20background%20main.webp',
  icon: '/assets/ava%20icon%20tornado%20main.webp',
  bonusesBanner: '/assets/bonuses-main-banner.webp',
  referralsBanner: '/assets/referrals-main-banner.webp',
  referralsPartnership: '/assets/referrals-partnership-banner.webp',
  welcomeBanner: '/assets/welcome_message_banner.webp',
  welcomeBonusArt: '/assets/welcome_message_bonus_banner%201.webp',
};
