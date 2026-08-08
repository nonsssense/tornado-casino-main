/**
 * Fiat (KZT) deposit UI constants.
 *
 * IMPORTANT — source of truth is the backend (payments/fiat_deposit.py):
 * - Available banks come from FIAT_TOKENS_KZT = {"Kaspi", "Berek"}.
 * - Limits come from FIAT_DEPOSIT_MIN_KZT (config) and FIAT_DEPOSIT_MAX_KZT.
 *
 * The backend does NOT expose these over any API, so they are mirrored here
 * ONLY to drive UX (bank list, amount clamp). The backend still validates and
 * rejects out-of-range / unsupported input — it remains fully authoritative.
 * If these ever change server-side, update them here too.
 */

export const FIAT_CURRENCY = 'KZT';

/** Mirrors FIAT_DEPOSIT_MIN_KZT / FIAT_DEPOSIT_MAX_KZT (whole tenge). */
export const FIAT_MIN_KZT = 1500;
export const FIAT_MAX_KZT = 600000;

/**
 * `token` MUST match the backend byte-for-byte (Bereke is sent as "Berek").
 * `logo` points at the optimized asset under the existing /assets mount.
 */
export const FIAT_BANKS = [
  {
    id: 'Kaspi',
    token: 'Kaspi',
    nameKey: 'wallet.fiat.banks.kaspi',
    logo: '/assets/fiat/kaspi.webp',
  },
  {
    id: 'Berek',
    token: 'Berek',
    nameKey: 'wallet.fiat.banks.bereke',
    logo: '/assets/fiat/bereke.webp',
  },
];

/** Quick-fill chips shown under the amount field (mockup screen 2). */
export const FIAT_QUICK_AMOUNTS = [3000, 5000, 10000, 20000];

export const FIAT_BONUS_BANNER = '/assets/fiat/bonus-banner.webp';

/**
 * @param {string} token
 * @returns {object|undefined}
 */
export function getFiatBank(token) {
  return FIAT_BANKS.find((bank) => bank.token === token || bank.id === token);
}

/**
 * Clamp a raw amount into the backend-defined range. Returns null for empty /
 * non-numeric input so callers can leave the field untouched while typing.
 * @param {string|number} raw
 * @returns {number|null}
 */
export function clampFiatAmount(raw) {
  const num = Math.floor(Number(raw));
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num < FIAT_MIN_KZT) return FIAT_MIN_KZT;
  if (num > FIAT_MAX_KZT) return FIAT_MAX_KZT;
  return num;
}

const KZT_NUMBER_FORMAT = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

/**
 * Display-only KZT formatting (thousands separators, no decimals).
 * @param {unknown} value
 * @returns {string}
 */
export function formatKzt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return KZT_NUMBER_FORMAT.format(Math.round(num));
}
