/**
 * Formatting helpers.
 *
 * Responsibility:
 * - Display-only number and crypto amount formatting.
 * - Never mutate stored values or calculation precision.
 */

const DEFAULT_MAX_DECIMALS = 4;

/**
 * Truncate toward zero to `decimals` fractional digits (display only).
 * @param {number} value
 * @param {number} decimals
 * @returns {number}
 */
function truncateDecimals(value, decimals) {
  if (!Number.isFinite(value)) return 0;
  if (decimals <= 0) return Math.trunc(value);

  const factor = 10 ** decimals;
  // Slight epsilon bias avoids float artifacts like 1.0000000002 → 1.0001
  const adjusted = value >= 0
    ? value * factor + Number.EPSILON
    : value * factor - Number.EPSILON;

  return Math.trunc(adjusted) / factor;
}

/**
 * Format a cryptocurrency amount for UI display.
 *
 * Rules:
 * - at most `maxDecimals` fractional digits (default 4)
 * - strip trailing zeros
 * - drop the decimal point when the fraction is empty
 *
 * @param {unknown} value
 * @param {object} [options]
 * @param {number} [options.maxDecimals=4]
 * @param {string} [options.symbol] - e.g. USDT, ETH
 * @returns {string}
 *
 * @example
 * formatCryptoAmount(10) // "10"
 * formatCryptoAmount(10.00000000, { symbol: 'USDT' }) // "10 USDT"
 * formatCryptoAmount(0.00234234523, { symbol: 'ETH' }) // "0.0023 ETH"
 * formatCryptoAmount(1234.50000000) // "1234.5"
 */
export function formatCryptoAmount(value, options = {}) {
  const {
    maxDecimals = DEFAULT_MAX_DECIMALS,
    symbol,
  } = options;

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return symbol ? `0 ${symbol}` : '0';
  }

  const truncated = truncateDecimals(num, maxDecimals);
  const abs = Math.abs(truncated);
  let formatted = abs.toFixed(maxDecimals).replace(/\.?0+$/, '');

  if (truncated < 0 && formatted !== '0') {
    formatted = `-${formatted}`;
  }

  return symbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Format a balance / money value for UI (shared crypto amount rules).
 *
 * @param {unknown} value
 * @param {string} [currency] - optional ticker/symbol suffix (e.g. USDT)
 * @returns {string}
 */
export function formatCurrency(value, currency) {
  return formatCryptoAmount(value, {
    maxDecimals: DEFAULT_MAX_DECIMALS,
    symbol: currency || undefined,
  });
}
